import { useCallback, useState } from "react";

export type ImageStyle =
  | "photorealistic"
  | "digital-art"
  | "oil-painting"
  | "watercolor"
  | "pencil-sketch"
  | "cinematic"
  | "anime"
  | "flat-design";

export type ImageAspect = "1:1" | "16:9" | "9:16" | "4:3";

export interface GeneratedImage {
  id: string;
  prompt: string;
  style: ImageStyle;
  aspect: ImageAspect;
  url: string;
  createdAt: number;
  provider: "pollinations" | "stability" | "dalle";
}

export interface ImageGenHook {
  prompt: string;
  setPrompt: (p: string) => void;
  style: ImageStyle;
  setStyle: (s: ImageStyle) => void;
  aspect: ImageAspect;
  setAspect: (a: ImageAspect) => void;
  generating: boolean;
  error: string | null;
  history: GeneratedImage[];
  selected: GeneratedImage | null;
  setSelected: (img: GeneratedImage | null) => void;
  generate: () => Promise<void>;
  clearHistory: () => void;
  deleteImage: (id: string) => void;
}

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  "photorealistic": "photorealistic, high resolution, 8k, detailed",
  "digital-art": "digital art, vibrant colors, concept art, artstation",
  "oil-painting": "oil painting, classical style, textured brushstrokes",
  "watercolor": "watercolor painting, soft edges, delicate washes",
  "pencil-sketch": "pencil sketch, black and white, fine line art",
  "cinematic": "cinematic photography, dramatic lighting, film still, anamorphic",
  "anime": "anime style, manga illustration, Studio Ghibli",
  "flat-design": "flat design, minimal, vector art, clean",
};

const ASPECT_SIZES: Record<ImageAspect, { w: number; h: number }> = {
  "1:1":  { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720,  h: 1280 },
  "4:3":  { w: 1024, h: 768 },
};

function loadHistory(): GeneratedImage[] {
  try {
    const raw = localStorage.getItem("jarvis_imggen_history");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(h: GeneratedImage[]) {
  try { localStorage.setItem("jarvis_imggen_history", JSON.stringify(h.slice(0, 50))); } catch {}
}

export function useImageGenData(): ImageGenHook {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ImageStyle>("photorealistic");
  const [aspect, setAspect] = useState<ImageAspect>("1:1");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>(loadHistory);
  const [selected, setSelected] = useState<GeneratedImage | null>(null);

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);

    const fullPrompt = `${prompt.trim()}, ${STYLE_PROMPTS[style]}`;
    const { w, h } = ASPECT_SIZES[aspect];

    try {
      // Try backend first (Stability AI / DALL-E if configured), fall back to Pollinations
      let url: string;
      try {
        const r = await fetch("/api/imagegen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: fullPrompt, width: w, height: h }),
        });
        if (r.ok) {
          const d = await r.json() as any;
          url = d.url;
        } else {
          throw new Error("backend unavailable");
        }
      } catch {
        // Pollinations.ai — free, no key required
        const encoded = encodeURIComponent(fullPrompt);
        url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&seed=${Date.now()}&nologo=true`;
        // Verify it loads
        await new Promise<void>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image generation failed"));
          img.src = url;
          setTimeout(() => reject(new Error("Timeout")), 30_000);
        });
      }

      const newImg: GeneratedImage = {
        id: `img-${Date.now()}`,
        prompt: prompt.trim(),
        style,
        aspect,
        url,
        createdAt: Date.now(),
        provider: "pollinations",
      };

      setHistory((prev) => {
        const next = [newImg, ...prev];
        saveHistory(next);
        return next;
      });
      setSelected(newImg);
    } catch (e: any) {
      setError(e?.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [prompt, style, aspect]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setSelected(null);
    saveHistory([]);
  }, []);

  const deleteImage = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((i) => i.id !== id);
      saveHistory(next);
      return next;
    });
    setSelected((s) => (s?.id === id ? null : s));
  }, []);

  return {
    prompt, setPrompt,
    style, setStyle,
    aspect, setAspect,
    generating, error,
    history, selected, setSelected,
    generate, clearHistory, deleteImage,
  };
}
