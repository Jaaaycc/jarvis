import React from "react";
import {
  AlertCircle,
  Download,
  Film,
  Loader,
  Play,
  RefreshCw,
  Send,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Icon } from "../../ui";
import { RoomShell } from "../RoomShell";
import { useRoomActions } from "../useRoomActionBus";
import {
  useVideoGenData,
  type GeneratedVideo,
  type VideoPlatform,
  type VideoTone,
} from "./useVideoGenData";
import "./VideoGenRoom.css";

export type RoomBodyMode = "inline" | "expanded";

const PLATFORMS: { key: VideoPlatform; label: string }[] = [
  { key: "instagram_reel", label: "Instagram Reel" },
  { key: "facebook_reel",  label: "Facebook Reel" },
  { key: "tiktok",         label: "TikTok" },
];

const TONES: { key: VideoTone; label: string }[] = [
  { key: "educational",  label: "Educational" },
  { key: "promotional",  label: "Promotional" },
  { key: "story",        label: "Story" },
  { key: "tutorial",     label: "Tutorial" },
];

// Built2Win quick-topic templates
const B2W_TOPICS = [
  "Why custom PHP beats WordPress for local businesses",
  "How a Lighthouse 100 score gets you more customers",
  "Stop paying $200/month for WordPress plugins — switch to custom PHP",
  "I built a website that ranks #1 in [city] — no templates used",
  "Found 47 businesses with no website — here's what I sent them",
  "Flat-fee web design: one payment, no monthly surprises",
  "What a Lighthouse 100 score actually means for your revenue",
  "Why your WordPress site is loading in 4 seconds (and costing you leads)",
  "Custom ecommerce vs Shopify — the real cost breakdown",
  "How local businesses get found on Google with the right website",
];

function platformLabel(p: VideoPlatform): string {
  return PLATFORMS.find(x => x.key === p)?.label ?? p;
}

function VideoCard({
  video,
  onPost,
  onDelete,
}: {
  video: GeneratedVideo;
  onPost: (id: string, platform: string) => void;
  onDelete: (id: string) => void;
}) {
  const isGenerating = video.status === "generating";

  const handleDownload = () => {
    if (video.imageUrl) {
      const a = document.createElement("a");
      a.href = video.imageUrl;
      a.download = `built2win-${video.id}.jpg`;
      a.target = "_blank";
      a.click();
    }
  };

  return (
    <div className="v2-videogen__card">
      <div className="v2-videogen__card-thumb">
        {video.imageUrl && (
          <img src={video.imageUrl} alt={video.script.hook} loading="lazy" />
        )}
        <div className="v2-videogen__card-thumb-overlay" />

        <span className={`v2-videogen__card-platform`}>
          {platformLabel(video.platform)}
        </span>
        <span className={`v2-videogen__card-status v2-videogen__card-status--${video.status}`}>
          {video.status === "generating" ? "Generating…"
            : video.status === "scripted" ? "Scripted"
            : video.status === "ready" ? "Ready"
            : video.status === "posted" ? "Posted"
            : "Failed"}
        </span>

        {isGenerating ? (
          <div className="v2-videogen__card-play">
            <Icon icon={Loader} size="sm" className="v2-videogen__spinner" />
          </div>
        ) : (
          <div className="v2-videogen__card-play">
            <Icon icon={Play} size="sm" />
          </div>
        )}

        <div className="v2-videogen__card-hook">{video.script.hook}</div>
      </div>

      <div className="v2-videogen__card-body">
        <div className="v2-videogen__card-topic" title={video.topic}>{video.topic}</div>
        <div className="v2-videogen__card-meta">
          {new Date(video.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {video.provider ? ` · ${video.provider}` : ""}
          {video.script.duration_estimate ? ` · ${video.script.duration_estimate}` : ""}
        </div>
        <div className="v2-videogen__card-actions">
          {video.status === "ready" || video.status === "scripted" ? (
            <>
              <button
                className="v2-videogen__card-btn v2-videogen__card-btn--fb"
                onClick={() => onPost(video.id, "facebook")}
              >
                <Icon icon={Send} size="sm" /> FB
              </button>
              <button
                className="v2-videogen__card-btn v2-videogen__card-btn--ig"
                onClick={() => onPost(video.id, "instagram")}
              >
                <Icon icon={Send} size="sm" /> IG
              </button>
              {video.imageUrl && (
                <button
                  className="v2-videogen__card-btn v2-videogen__card-btn--icon"
                  onClick={handleDownload}
                  title="Download"
                >
                  <Icon icon={Download} size="sm" />
                </button>
              )}
            </>
          ) : video.status === "posted" ? (
            <button className="v2-videogen__card-btn v2-videogen__card-btn--fb" disabled>
              Posted ✓
            </button>
          ) : video.status === "generating" ? (
            <button className="v2-videogen__card-btn v2-videogen__card-btn--fb" disabled>
              <Icon icon={Loader} size="sm" className="v2-videogen__spinner" /> Generating…
            </button>
          ) : null}
          <button
            className="v2-videogen__card-btn v2-videogen__card-btn--icon"
            onClick={() => onDelete(video.id)}
            title="Delete"
          >
            <Icon icon={Trash2} size="sm" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ScriptEditorModal({
  script,
  onUpdate,
  onGenerate,
  onClose,
}: {
  script: { hook: string; body: string; cta: string; hashtags: string[] };
  onUpdate: (s: typeof script) => void;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState(script);

  return (
    <div className="v2-videogen__script-modal" onClick={onClose}>
      <div className="v2-videogen__script-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3>Edit Script</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink)", padding: 4 }}
          >
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="v2-videogen__script-field">
          <label>Hook (first 3 seconds)</label>
          <textarea
            rows={2}
            value={draft.hook}
            onChange={e => setDraft(p => ({ ...p, hook: e.target.value }))}
            placeholder="Attention-grabbing opener…"
          />
        </div>
        <div className="v2-videogen__script-field">
          <label>Body (main content)</label>
          <textarea
            rows={5}
            value={draft.body}
            onChange={e => setDraft(p => ({ ...p, body: e.target.value }))}
            placeholder="Main points, value delivery…"
          />
        </div>
        <div className="v2-videogen__script-field">
          <label>Call to Action</label>
          <input
            type="text"
            value={draft.cta}
            onChange={e => setDraft(p => ({ ...p, cta: e.target.value }))}
            placeholder="Get a free quote at built2winweb.com"
          />
        </div>
        <div className="v2-videogen__script-field">
          <label>Hashtags (space-separated)</label>
          <input
            type="text"
            value={draft.hashtags.join(" ")}
            onChange={e => setDraft(p => ({ ...p, hashtags: e.target.value.split(/\s+/).filter(Boolean) }))}
            placeholder="#webdesign #localbusiness #built2win"
          />
        </div>

        <div className="v2-videogen__script-actions">
          <button
            className="v2-videogen__btn v2-videogen__btn--primary"
            style={{ flex: 1 }}
            onClick={() => { onUpdate(draft); onGenerate(); onClose(); }}
          >
            <Icon icon={Film} size="sm" /> Generate Video
          </button>
          <button
            className="v2-videogen__btn v2-videogen__btn--secondary"
            style={{ flex: "0 0 auto", width: "auto", padding: "9px 16px" }}
            onClick={() => { onUpdate(draft); onClose(); }}
          >
            Save Script
          </button>
        </div>
      </div>
    </div>
  );
}

export function VideoGenRoomBody({ mode }: { mode: RoomBodyMode }) {
  const data = useVideoGenData();

  useRoomActions("videogen", (action, args) => {
    if (action === "generate_daily") { data.generateDailyReels(); return true; }
    if (action === "generate_script" && typeof args.topic === "string") {
      data.setTopic(args.topic as string);
      data.generateScript(args.topic as string);
      return true;
    }
    return false;
  });

  return (
    <RoomShell roomKey="videogen" mode={mode} title="Video Studio">
      <div className="v2-videogen">
        {/* Sidebar */}
        <div className="v2-videogen__sidebar">
          <div className="v2-videogen__sidebar-title">
            <Icon icon={Film} size="sm" /> Generate Video
          </div>

          {/* NVIDIA status */}
          <div className="v2-videogen__provider-badge">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: data.nvidiaConfigured ? "var(--ok)" : "var(--warn)", display: "inline-block", flexShrink: 0 }} />
            {data.nvidiaConfigured
              ? <span>NVIDIA API <strong>Connected</strong></span>
              : <span>Using Pollinations fallback — <span style={{ color: "var(--accent)" }}>add NVIDIA key for video</span></span>
            }
          </div>

          {/* Topic */}
          <div className="v2-videogen__field">
            <label>Topic</label>
            <textarea
              rows={3}
              value={data.topic}
              onChange={e => data.setTopic(e.target.value)}
              placeholder="e.g. Why custom PHP beats WordPress for local businesses"
            />
          </div>

          {/* Built2Win quick topics */}
          <div className="v2-videogen__field">
            <label style={{ marginBottom: "var(--s-1)", display: "block" }}>Quick Topics</label>
            <div className="v2-videogen__quick-topics">
              {B2W_TOPICS.slice(0, 5).map((t, i) => (
                <button
                  key={i}
                  className="v2-videogen__quick-topic-btn"
                  onClick={() => data.setTopic(t)}
                  title={t}
                >
                  {t.length > 42 ? t.slice(0, 42) + "…" : t}
                </button>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div className="v2-videogen__field">
            <label>Platform</label>
            <select
              value={data.platform}
              onChange={e => data.setPlatform(e.target.value as VideoPlatform)}
            >
              {PLATFORMS.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Tone */}
          <div className="v2-videogen__field">
            <label>Tone</label>
            <select
              value={data.tone}
              onChange={e => data.setTone(e.target.value as VideoTone)}
            >
              {TONES.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Generate script button */}
          <button
            className="v2-videogen__btn v2-videogen__btn--secondary"
            onClick={() => data.generateScript()}
            disabled={data.scriptLoading || !data.topic.trim()}
          >
            {data.scriptLoading
              ? <><Icon icon={Loader} size="sm" className="v2-videogen__spinner" /> Writing Script…</>
              : <><Icon icon={Film} size="sm" /> Generate Script</>
            }
          </button>

          {/* Generate video button */}
          <button
            className="v2-videogen__btn v2-videogen__btn--primary"
            onClick={() => data.generateVideo()}
            disabled={data.generating || (!data.draftScript && !data.pendingScript)}
          >
            {data.generating
              ? <><Icon icon={Loader} size="sm" className="v2-videogen__spinner" /> Generating Video…</>
              : <><Icon icon={Zap} size="sm" /> Generate Video</>
            }
          </button>

          <div className="v2-videogen__divider" />

          {/* Daily reels quick action */}
          <button
            className="v2-videogen__btn v2-videogen__btn--daily"
            onClick={data.generateDailyReels}
            disabled={data.generating}
          >
            {data.generating
              ? <><Icon icon={Loader} size="sm" className="v2-videogen__spinner" /> Generating Daily Reels…</>
              : <><Icon icon={RefreshCw} size="sm" /> Generate 2 Daily Reels</>
            }
          </button>

          <div style={{ fontSize: 10, color: "color-mix(in srgb, var(--ink) 40%, transparent)", lineHeight: 1.5 }}>
            Auto-generates 2 Built2Win reels using today's top topics. Runs daily on first open.
          </div>
        </div>

        {/* Main gallery */}
        <div className="v2-videogen__main">
          {/* Error */}
          {data.error && (
            <div className="v2-videogen__error">
              <Icon icon={AlertCircle} size="sm" />
              {data.error}
              <button
                onClick={data.clearError}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
              >
                <Icon icon={X} size="sm" />
              </button>
            </div>
          )}

          {data.videos.length === 0 ? (
            <div className="v2-videogen__empty">
              <div className="v2-videogen__empty-icon">
                <Icon icon={Film} size="md" />
              </div>
              <div className="v2-videogen__empty-title">No videos yet today</div>
              <div className="v2-videogen__empty-sub">
                Enter a topic and click "Generate Script", then "Generate Video". Or use "Generate 2 Daily Reels" for auto-created Built2Win content.
              </div>
            </div>
          ) : (
            <div className="v2-videogen__gallery">
              {data.videos.map(video => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onPost={data.postVideo}
                  onDelete={data.deleteVideo}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Script editor modal */}
      {data.editingScript && data.draftScript && (
        <ScriptEditorModal
          script={data.draftScript}
          onUpdate={s => data.setDraftScript(s)}
          onGenerate={() => data.generateVideo(data.draftScript ?? undefined)}
          onClose={() => data.setEditingScript(false)}
        />
      )}
    </RoomShell>
  );
}
