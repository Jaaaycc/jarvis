import { useCallback, useEffect, useState } from "react";

export type VideoPlatform = "instagram_reel" | "facebook_reel" | "tiktok";
export type VideoTone = "educational" | "promotional" | "story" | "tutorial";
export type VideoStatus = "scripted" | "generating" | "ready" | "posted" | "failed";

export interface VideoScript {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  duration_estimate?: string;
}

export interface GeneratedVideo {
  id: string;
  topic: string;
  platform: VideoPlatform;
  tone: VideoTone;
  script: VideoScript;
  status: VideoStatus;
  videoUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  provider?: string;
  createdAt: string;
  postedAt?: string;
  error?: string;
}

export interface VideoGenHook {
  videos: GeneratedVideo[];
  generating: boolean;
  scriptLoading: boolean;
  error: string | null;
  pendingScript: VideoScript | null;
  topic: string;
  platform: VideoPlatform;
  tone: VideoTone;
  editingScript: boolean;
  draftScript: VideoScript | null;
  nvidiaConfigured: boolean;
  setTopic: (t: string) => void;
  setPlatform: (p: VideoPlatform) => void;
  setTone: (t: VideoTone) => void;
  setEditingScript: (e: boolean) => void;
  setDraftScript: (s: VideoScript | null) => void;
  generateScript: (topic?: string, platform?: VideoPlatform, tone?: VideoTone) => Promise<void>;
  generateVideo: (script?: VideoScript) => Promise<void>;
  generateDailyReels: () => Promise<void>;
  postVideo: (id: string, platform: string) => Promise<void>;
  deleteVideo: (id: string) => void;
  clearError: () => void;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadCachedVideos(): GeneratedVideo[] {
  try {
    const raw = localStorage.getItem(`jarvis_videos_${todayKey()}`);
    if (raw) return JSON.parse(raw) as GeneratedVideo[];
  } catch {}
  return [];
}

function saveVideos(videos: GeneratedVideo[]): void {
  try { localStorage.setItem(`jarvis_videos_${todayKey()}`, JSON.stringify(videos)); } catch {}
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const DAILY_TOPICS = [
  "Why custom PHP beats WordPress for local businesses",
  "How a Lighthouse 100 score drives more customers to your door",
];

export function useVideoGenData(): VideoGenHook {
  const [videos, setVideos] = useState<GeneratedVideo[]>(() => loadCachedVideos());
  const [generating, setGenerating] = useState(false);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingScript, setPendingScript] = useState<VideoScript | null>(null);
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState<VideoPlatform>("instagram_reel");
  const [tone, setTone] = useState<VideoTone>("educational");
  const [editingScript, setEditingScript] = useState(false);
  const [draftScript, setDraftScript] = useState<VideoScript | null>(null);
  const [nvidiaConfigured, setNvidiaConfigured] = useState(false);

  // Check NVIDIA status
  useEffect(() => {
    fetch("/api/videogen/status")
      .then(r => r.json() as Promise<{ nvidiaConfigured: boolean }>)
      .then(d => setNvidiaConfigured(d.nvidiaConfigured))
      .catch(() => {});
  }, []);

  // Auto-generate daily if no videos today
  useEffect(() => {
    const cached = loadCachedVideos();
    if (cached.length > 0) {
      setVideos(cached);
      return;
    }
    generateDailyReels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateScript = useCallback(async (
    t?: string,
    p?: VideoPlatform,
    tn?: VideoTone,
  ) => {
    const topicVal = t ?? topic;
    if (!topicVal.trim()) return;
    setScriptLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicVal,
          platform: (p ?? platform).replace("_", " "),
          tone: tn ?? tone,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const script = await res.json() as VideoScript;
      setPendingScript(script);
      setDraftScript(script);
      setEditingScript(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setScriptLoading(false);
    }
  }, [topic, platform, tone]);

  const generateVideo = useCallback(async (script?: VideoScript) => {
    const s = script ?? draftScript ?? pendingScript;
    if (!s) return;
    setGenerating(true);
    setError(null);
    const videoId = uid();
    const newVideo: GeneratedVideo = {
      id: videoId,
      topic: topic || "Built2Win",
      platform,
      tone,
      script: s,
      status: "generating",
      createdAt: new Date().toISOString(),
    };
    setVideos(prev => {
      const updated = [newVideo, ...prev];
      saveVideos(updated);
      return updated;
    });

    try {
      const prompt = `${s.hook} ${s.body} — Built2Win Web, custom PHP websites, Lighthouse 100, flat fee, built2winweb.com`;
      const res = await fetch("/api/videogen/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, width: 1080, height: 1920 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { videoUrl?: string; imageUrl?: string; provider: string; ok: boolean };

      setVideos(prev => {
        const updated = prev.map(v =>
          v.id === videoId
            ? {
                ...v,
                status: "ready" as VideoStatus,
                videoUrl: data.videoUrl,
                imageUrl: data.imageUrl,
                thumbnailUrl: data.imageUrl,
                provider: data.provider,
              }
            : v
        );
        saveVideos(updated);
        return updated;
      });
    } catch (err) {
      setError(String(err));
      setVideos(prev => {
        const updated = prev.map(v => v.id === videoId ? { ...v, status: "failed" as VideoStatus, error: String(err) } : v);
        saveVideos(updated);
        return updated;
      });
    } finally {
      setGenerating(false);
      setEditingScript(false);
      setPendingScript(null);
    }
  }, [draftScript, pendingScript, topic, platform, tone]);

  const generateDailyReels = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      for (const t of DAILY_TOPICS) {
        const scriptRes = await fetch("/api/marketing/generate-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: t, platform: "Instagram Reel", tone: "educational" }),
        });
        if (!scriptRes.ok) continue;
        const script = await scriptRes.json() as VideoScript;
        const videoId = uid();

        const newVideo: GeneratedVideo = {
          id: videoId,
          topic: t,
          platform: "instagram_reel",
          tone: "educational",
          script,
          status: "generating",
          createdAt: new Date().toISOString(),
        };

        setVideos(prev => {
          const updated = [newVideo, ...prev];
          saveVideos(updated);
          return updated;
        });

        try {
          const prompt = `${script.hook} ${script.body} — Built2Win Web`;
          const genRes = await fetch("/api/videogen/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, width: 1080, height: 1920 }),
          });
          if (!genRes.ok) continue;
          const data = await genRes.json() as { videoUrl?: string; imageUrl?: string; provider: string };
          setVideos(prev => {
            const updated = prev.map(v =>
              v.id === videoId
                ? { ...v, status: "ready" as VideoStatus, videoUrl: data.videoUrl, imageUrl: data.imageUrl, thumbnailUrl: data.imageUrl, provider: data.provider }
                : v
            );
            saveVideos(updated);
            return updated;
          });
        } catch {}
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  }, []);

  const postVideo = useCallback(async (id: string, postPlatform: string) => {
    const video = videos.find(v => v.id === id);
    if (!video) return;
    try {
      const caption = `${video.script.hook}\n\n${video.script.body}\n\n${video.script.hashtags.join(" ")}\n\n${video.script.cta}`;
      const res = await fetch("/api/marketing/post-to-facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, imageUrl: video.imageUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      setVideos(prev => {
        const updated = prev.map(v =>
          v.id === id ? { ...v, status: "posted" as VideoStatus, postedAt: new Date().toISOString() } : v
        );
        saveVideos(updated);
        return updated;
      });
    } catch (err) {
      setError(String(err));
    }
  }, [videos]);

  const deleteVideo = useCallback((id: string) => {
    setVideos(prev => {
      const updated = prev.filter(v => v.id !== id);
      saveVideos(updated);
      return updated;
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    videos,
    generating,
    scriptLoading,
    error,
    pendingScript,
    topic,
    platform,
    tone,
    editingScript,
    draftScript,
    nvidiaConfigured,
    setTopic,
    setPlatform,
    setTone,
    setEditingScript,
    setDraftScript,
    generateScript,
    generateVideo,
    generateDailyReels,
    postVideo,
    deleteVideo,
    clearError,
  };
}
