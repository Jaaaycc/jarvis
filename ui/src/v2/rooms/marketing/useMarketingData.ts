import { useCallback, useEffect, useState } from "react";

export type PostType = "reel" | "static" | "story";
export type PostPlatform = "instagram" | "facebook" | "both";
export type PostStatus = "draft" | "scheduled" | "posted" | "failed";

export interface MarketingPost {
  id: string;
  type: PostType;
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
  platform: PostPlatform;
  status: PostStatus;
  scheduledAt?: string;
  postedAt?: string;
  postId?: string;       // FB/IG post ID after publishing
  imageUrl?: string;
  generatedAt: string;
}

export interface MarketingCompany {
  id: string;
  name: string;
  pageId: string;
  token: string;
  active: boolean;
}

export interface MarketingHook {
  companies: MarketingCompany[];
  posts: MarketingPost[];
  queue: MarketingPost[];
  generating: boolean;
  posting: string | null;  // postId being posted
  error: string | null;
  activeCompany: string;
  tab: "today" | "queue" | "companies" | "settings";
  fbConfigured: boolean;
  setTab: (t: MarketingHook["tab"]) => void;
  generateDailyContent: () => Promise<void>;
  postToFacebook: (postId: string) => Promise<void>;
  schedulePost: (postId: string, time: string) => void;
  deletePost: (postId: string) => void;
  regeneratePost: (postId: string) => Promise<void>;
  switchCompany: (id: string) => void;
  addCompany: (c: Omit<MarketingCompany, "id">) => void;
  removeCompany: (id: string) => void;
  copyCaption: (postId: string) => void;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadCachedPosts(): MarketingPost[] {
  try {
    const raw = localStorage.getItem(`jarvis_mktg_posts_${todayKey()}`);
    if (raw) return JSON.parse(raw) as MarketingPost[];
  } catch {}
  return [];
}

function saveCachedPosts(posts: MarketingPost[]): void {
  try {
    localStorage.setItem(`jarvis_mktg_posts_${todayKey()}`, JSON.stringify(posts));
  } catch {}
}

function loadCompanies(): MarketingCompany[] {
  try {
    const raw = localStorage.getItem("jarvis_mktg_companies");
    if (raw) return JSON.parse(raw) as MarketingCompany[];
  } catch {}
  return [
    { id: "built2win", name: "Built2Win Web", pageId: "", token: "", active: true },
  ];
}

function saveCompanies(c: MarketingCompany[]): void {
  try { localStorage.setItem("jarvis_mktg_companies", JSON.stringify(c)); } catch {}
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function useMarketingData(): MarketingHook {
  const [posts, setPosts] = useState<MarketingPost[]>(() => loadCachedPosts());
  const [companies, setCompanies] = useState<MarketingCompany[]>(() => loadCompanies());
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCompany, setActiveCompany] = useState("built2win");
  const [tab, setTab] = useState<MarketingHook["tab"]>("today");

  const fbConfigured = companies.some(c => c.id === activeCompany && c.token) ||
    posts.length > 0; // show UI regardless

  // Poll for fresh posts on mount
  useEffect(() => {
    const cached = loadCachedPosts();
    if (cached.length > 0) {
      setPosts(cached);
      return;
    }
    // Auto-generate if no posts today
    generateDailyContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateDailyContent = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 2 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { posts: any[]; generatedAt: string };
      const newPosts: MarketingPost[] = data.posts.map((p: any) => ({
        id: uid(),
        type: (p.type as PostType) || "static",
        hook: p.hook || "",
        caption: p.caption || "",
        hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
        cta: p.cta || "",
        platform: (p.platform as PostPlatform) || "instagram",
        status: "draft" as PostStatus,
        generatedAt: data.generatedAt || new Date().toISOString(),
      }));
      setPosts(newPosts);
      saveCachedPosts(newPosts);
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  }, []);

  const postToFacebook = useCallback(async (postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    setPosting(postId);
    setError(null);
    try {
      const fullCaption = `${post.hook}\n\n${post.caption}\n\n${post.hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ")}\n\n${post.cta}`;
      const res = await fetch("/api/marketing/post-to-facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: fullCaption }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { ok: boolean; postId: string };
      setPosts(prev => {
        const updated = prev.map(p =>
          p.id === postId
            ? { ...p, status: "posted" as PostStatus, postedAt: new Date().toISOString(), postId: data.postId }
            : p
        );
        saveCachedPosts(updated);
        return updated;
      });
    } catch (err) {
      setError(String(err));
      setPosts(prev => {
        const updated = prev.map(p => p.id === postId ? { ...p, status: "failed" as PostStatus } : p);
        saveCachedPosts(updated);
        return updated;
      });
    } finally {
      setPosting(null);
    }
  }, [posts]);

  const schedulePost = useCallback((postId: string, time: string) => {
    setPosts(prev => {
      const updated = prev.map(p =>
        p.id === postId ? { ...p, status: "scheduled" as PostStatus, scheduledAt: time } : p
      );
      saveCachedPosts(updated);
      return updated;
    });
  }, []);

  const deletePost = useCallback((postId: string) => {
    setPosts(prev => {
      const updated = prev.filter(p => p.id !== postId);
      saveCachedPosts(updated);
      return updated;
    });
  }, []);

  const regeneratePost = useCallback(async (postId: string) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { posts: any[] };
      if (data.posts[0]) {
        const p = data.posts[0];
        setPosts(prev => {
          const updated = prev.map(post =>
            post.id === postId
              ? {
                  ...post,
                  type: (p.type as PostType) || "static",
                  hook: p.hook || "",
                  caption: p.caption || "",
                  hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
                  cta: p.cta || "",
                  platform: (p.platform as PostPlatform) || "instagram",
                  status: "draft" as PostStatus,
                  generatedAt: new Date().toISOString(),
                }
              : post
          );
          saveCachedPosts(updated);
          return updated;
        });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  }, []);

  const switchCompany = useCallback((id: string) => {
    setActiveCompany(id);
  }, []);

  const addCompany = useCallback((c: Omit<MarketingCompany, "id">) => {
    const newC = { ...c, id: uid() };
    setCompanies(prev => {
      const updated = [...prev, newC];
      saveCompanies(updated);
      return updated;
    });
  }, []);

  const removeCompany = useCallback((id: string) => {
    setCompanies(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveCompanies(updated);
      return updated;
    });
  }, []);

  const copyCaption = useCallback((postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const text = `${post.hook}\n\n${post.caption}\n\n${post.hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ")}\n\n${post.cta}`;
    navigator.clipboard.writeText(text).catch(() => {});
  }, [posts]);

  const queue = posts.filter(p => p.status === "scheduled");

  return {
    companies,
    posts,
    queue,
    generating,
    posting,
    error,
    activeCompany,
    tab,
    fbConfigured,
    setTab,
    generateDailyContent,
    postToFacebook,
    schedulePost,
    deletePost,
    regeneratePost,
    switchCompany,
    addCompany,
    removeCompany,
    copyCaption,
  };
}
