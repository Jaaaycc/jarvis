import React, { useRef } from "react";
import {
  Download,
  ExternalLink,
  Image,
  Loader,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Icon } from "../../ui";
import { RoomShell } from "../RoomShell";
import { useRoomActions } from "../useRoomActionBus";
import {
  useImageGenData,
  type ImageAspect,
  type ImageStyle,
} from "./useImageGenData";
import "./ImageGenRoom.css";

export type RoomBodyMode = "inline" | "expanded";

const STYLES: { key: ImageStyle; label: string }[] = [
  { key: "photorealistic", label: "Photo" },
  { key: "cinematic", label: "Cinematic" },
  { key: "digital-art", label: "Digital Art" },
  { key: "oil-painting", label: "Oil Paint" },
  { key: "watercolor", label: "Watercolor" },
  { key: "pencil-sketch", label: "Sketch" },
  { key: "anime", label: "Anime" },
  { key: "flat-design", label: "Flat Design" },
];

const ASPECTS: { key: ImageAspect; label: string }[] = [
  { key: "1:1", label: "1:1" },
  { key: "16:9", label: "16:9" },
  { key: "9:16", label: "9:16" },
  { key: "4:3", label: "4:3" },
];

export function ImageGenRoomBody({ mode }: { mode: RoomBodyMode }) {
  const data = useImageGenData();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useRoomActions("imagegen", (action, args) => {
    if (action === "generate" && typeof args.prompt === "string") {
      data.setPrompt(args.prompt);
      setTimeout(() => data.generate(), 50);
      return true;
    }
    return false;
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      data.generate();
    }
  };

  return (
    <RoomShell roomKey="imagegen" mode={mode} title="Image Creator">
      <div className="v2-imggen">
        {/* ── Sidebar ── */}
        <div className="v2-imggen__sidebar">
          {/* Prompt */}
          <div className="v2-imggen__prompt-wrap">
            <span className="v2-imggen__sidebar-title">Prompt</span>
            <textarea
              ref={textareaRef}
              className="v2-imggen__prompt"
              value={data.prompt}
              onChange={(e) => data.setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="A professional web design agency office, modern, clean…"
              rows={4}
            />
            <button
              className="v2-imggen__generate-btn"
              disabled={!data.prompt.trim() || data.generating}
              onClick={() => data.generate()}
            >
              {data.generating ? (
                <><Loader size={14} /> Generating…</>
              ) : (
                <><Sparkles size={14} /> Generate (⌘↵)</>
              )}
            </button>
          </div>

          {/* Style */}
          <div>
            <span className="v2-imggen__sidebar-title">Style</span>
            <div className="v2-imggen__styles">
              {STYLES.map((s) => (
                <button
                  key={s.key}
                  aria-selected={data.style === s.key}
                  className="v2-imggen__style-btn"
                  onClick={() => data.setStyle(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div>
            <span className="v2-imggen__sidebar-title">Aspect Ratio</span>
            <div className="v2-imggen__aspects">
              {ASPECTS.map((a) => (
                <button
                  key={a.key}
                  aria-selected={data.aspect === a.key}
                  className="v2-imggen__aspect-btn"
                  onClick={() => data.setAspect(a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear history */}
          {data.history.length > 0 && (
            <button
              className="v2-imggen__style-btn"
              style={{ gridColumn: "1 / -1", marginTop: "auto" }}
              onClick={data.clearHistory}
            >
              Clear history ({data.history.length})
            </button>
          )}
        </div>

        {/* ── Main canvas ── */}
        <div className="v2-imggen__main">
          <div className="v2-imggen__canvas">
            {!data.selected && !data.generating && (
              <div className="v2-imggen__canvas-placeholder">
                <div className="v2-imggen__canvas-placeholder-icon">
                  <Icon icon={Image} size="lg" />
                </div>
                <div className="v2-imggen__canvas-placeholder-text">
                  Describe an image and hit Generate
                </div>
              </div>
            )}

            {data.selected && !data.generating && (
              <>
                <img
                  src={data.selected.url}
                  alt={data.selected.prompt}
                  className="v2-imggen__result-img"
                />
                <div className="v2-imggen__img-actions">
                  <a
                    href={data.selected.url}
                    download={`jarvis-image-${data.selected.id}.png`}
                    target="_blank"
                    rel="noreferrer"
                    className="v2-imggen__img-action"
                    title="Download"
                  >
                    <Download size={11} /> Download
                  </a>
                  <a
                    href={data.selected.url}
                    target="_blank"
                    rel="noreferrer"
                    className="v2-imggen__img-action"
                    title="Open in new tab"
                  >
                    <ExternalLink size={11} /> Open
                  </a>
                  <button
                    className="v2-imggen__img-action"
                    onClick={() => data.deleteImage(data.selected!.id)}
                    title="Delete"
                    style={{ color: "var(--warn)" }}
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              </>
            )}

            {data.generating && (
              <div className="v2-imggen__generating-overlay">
                <div className="v2-imggen__spinner" />
                Generating your image…
              </div>
            )}
          </div>

          {data.error && (
            <div className="v2-imggen__error">{data.error}</div>
          )}

          {/* History strip */}
          <div className="v2-imggen__history">
            {data.history.length === 0 ? (
              <span className="v2-imggen__history-empty">
                Generated images will appear here
              </span>
            ) : (
              data.history.map((img) => (
                <div
                  key={img.id}
                  className="v2-imggen__history-thumb"
                  aria-selected={data.selected?.id === img.id}
                  onClick={() => data.setSelected(img)}
                  title={img.prompt}
                >
                  <img src={img.url} alt={img.prompt} loading="lazy" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </RoomShell>
  );
}
