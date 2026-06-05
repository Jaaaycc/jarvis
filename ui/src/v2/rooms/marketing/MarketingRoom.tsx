import React, { useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Trash2,
} from "lucide-react";
import { Icon } from "../../ui";
import { RoomShell } from "../RoomShell";
import { useRoomActions } from "../useRoomActionBus";
import { useMarketingData, type MarketingPost } from "./useMarketingData";
import "./MarketingRoom.css";

export type RoomBodyMode = "inline" | "expanded";

function PlatformBadge({ platform }: { platform: string }) {
  if (platform === "instagram") return (
    <span className="v2-marketing__platform-badge v2-marketing__platform-badge--instagram">IG</span>
  );
  if (platform === "facebook") return (
    <span className="v2-marketing__platform-badge v2-marketing__platform-badge--facebook">FB</span>
  );
  return (
    <span className="v2-marketing__platform-badge v2-marketing__platform-badge--both">FB + IG</span>
  );
}

function PostCard({
  post,
  onPost,
  onSchedule,
  onDelete,
  onRegenerate,
  onCopy,
  posting,
}: {
  post: MarketingPost;
  onPost: (id: string) => void;
  onSchedule: (id: string) => void;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
  onCopy: (id: string) => void;
  posting: string | null;
}) {
  const isPosting = posting === post.id;
  const tags = post.hashtags.slice(0, 8).map(h => h.startsWith("#") ? h : `#${h}`).join(" ");

  return (
    <div className={`v2-marketing__post-card v2-marketing__post-card--${post.status}`}>
      {/* Thumbnail */}
      <div className="v2-marketing__post-thumb">
        <span className={`v2-marketing__post-thumb-type v2-marketing__post-thumb-type--${post.type}`}>
          {post.type}
        </span>
        {post.status !== "draft" && (
          <span className={`v2-marketing__post-thumb-status v2-marketing__post-thumb-status--${post.status}`}>
            {post.status}
          </span>
        )}
        <div className="v2-marketing__post-thumb-brand">Built2Win</div>
        <div className="v2-marketing__post-thumb-tagline">Win from the start.</div>
      </div>

      {/* Content */}
      <div className="v2-marketing__post-body">
        <div className="v2-marketing__post-hook">{post.hook}</div>
        <div className="v2-marketing__post-caption">{post.caption}</div>
        {tags && <div className="v2-marketing__post-hashtags">{tags}</div>}
        {post.cta && <div className="v2-marketing__post-cta">CTA: {post.cta}</div>}
        <div className="v2-marketing__post-platforms">
          <PlatformBadge platform={post.platform} />
        </div>
      </div>

      {/* Actions */}
      <div className="v2-marketing__post-actions">
        {post.status === "posted" ? (
          <button className="v2-marketing__post-btn--primary" disabled>
            <Icon icon={Check} size="sm" /> Posted
          </button>
        ) : (
          <button
            className="v2-marketing__post-btn--primary"
            onClick={() => onPost(post.id)}
            disabled={isPosting || !!posting}
          >
            {isPosting
              ? <><Icon icon={Loader} size="sm" className="v2-marketing__spinner" /> Posting…</>
              : <><Icon icon={Send} size="sm" /> Post Now</>
            }
          </button>
        )}
        <button
          className="v2-marketing__post-btn--secondary"
          onClick={() => onSchedule(post.id)}
          title="Schedule"
        >
          <Icon icon={Calendar} size="sm" />
        </button>
        <button
          className="v2-marketing__post-btn--icon"
          onClick={() => onCopy(post.id)}
          title="Copy caption"
        >
          <Icon icon={Copy} size="sm" />
        </button>
        <button
          className="v2-marketing__post-btn--icon"
          onClick={() => onRegenerate(post.id)}
          title="Regenerate"
        >
          <Icon icon={RotateCcw} size="sm" />
        </button>
        <button
          className="v2-marketing__post-btn--icon"
          onClick={() => onDelete(post.id)}
          title="Delete"
        >
          <Icon icon={Trash2} size="sm" />
        </button>
      </div>
    </div>
  );
}

function ScheduleModal({
  postId,
  onSchedule,
  onClose,
}: {
  postId: string;
  onSchedule: (id: string, time: string) => void;
  onClose: () => void;
}) {
  const [time, setTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onClick={onClose}
    >
      <div style={{
        background: "var(--paper)", border: "1px solid color-mix(in srgb, var(--ink) 15%, transparent)",
        borderRadius: 14, padding: 24, minWidth: 320,
      }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: "var(--font-md)", marginBottom: 16 }}>Schedule Post</div>
        <div className="v2-marketing__field">
          <label>Date &amp; Time</label>
          <input type="datetime-local" value={time} onChange={e => setTime(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="v2-marketing__save-btn" onClick={() => { onSchedule(postId, time); onClose(); }}>
            Schedule
          </button>
          <button
            style={{ padding: "8px 16px", background: "transparent", border: "1px solid color-mix(in srgb, var(--ink) 15%, transparent)", borderRadius: 8, color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}
            onClick={onClose}
          >Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function MarketingRoomBody({ mode }: { mode: RoomBodyMode }) {
  const data = useMarketingData();
  const [schedulingPostId, setSchedulingPostId] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState({ name: "", pageId: "", token: "" });

  useRoomActions("marketing", (action, args) => {
    if (action === "generate") { data.generateDailyContent(); return true; }
    if (action === "post" && typeof args.postId === "string") {
      data.postToFacebook(args.postId as string); return true;
    }
    if (action === "switch_company" && typeof args.id === "string") {
      data.switchCompany(args.id as string); return true;
    }
    return false;
  });

  const todayPosts = data.posts.filter(p => p.status === "draft" || p.status === "posted" || p.status === "failed");

  return (
    <RoomShell roomKey="marketing" mode={mode} title="Marketing">
      <div className="v2-marketing">
        {/* Toolbar */}
        <div className="v2-marketing__toolbar">
          <select
            className="v2-marketing__company-select"
            value={data.activeCompany}
            onChange={e => data.switchCompany(e.target.value)}
          >
            {data.companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button
            className="v2-marketing__gen-btn"
            onClick={data.generateDailyContent}
            disabled={data.generating}
          >
            {data.generating
              ? <><Icon icon={Loader} size="sm" className="v2-marketing__spinner" /> Generating…</>
              : <><Icon icon={Megaphone} size="sm" /> Generate Today's Content</>
            }
          </button>

          <div className="v2-marketing__toolbar-spacer" />

          <button className="v2-marketing__refresh-btn" onClick={data.generateDailyContent} disabled={data.generating}>
            <Icon icon={RefreshCw} size="sm" />
          </button>
        </div>

        {/* Tabs */}
        <div className="v2-marketing__tabs">
          {(["today", "queue", "companies", "settings"] as const).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={data.tab === t}
              className="v2-marketing__tab"
              onClick={() => data.setTab(t)}
            >
              {t === "today" ? "Today" : t === "queue" ? `Queue (${data.queue.length})` : t === "companies" ? "Companies" : "Settings"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="v2-marketing__body">
          {/* Facebook not configured banner */}
          {!data.fbConfigured && data.tab === "today" && (
            <div className="v2-marketing__banner">
              <Icon icon={AlertCircle} size="sm" />
              <span>Connect Facebook to post directly. <a href="#/_room_settings">Settings → Integrations</a> → add Page ID + Access Token.</span>
            </div>
          )}

          {/* Error */}
          {data.error && (
            <div className="v2-marketing__error">
              <Icon icon={AlertCircle} size="sm" />
              {data.error}
            </div>
          )}

          {/* TODAY TAB */}
          {data.tab === "today" && (
            <>
              {data.generating && todayPosts.length === 0 ? (
                <div className="v2-marketing__generating">
                  <div className="v2-marketing__pulse" />
                  <div className="v2-marketing__generating-label">Generating today's content…</div>
                  <div className="v2-marketing__generating-sub">Claude is crafting high-converting posts for Built2Win.</div>
                </div>
              ) : todayPosts.length === 0 ? (
                <div className="v2-marketing__empty">
                  <div className="v2-marketing__empty-icon">
                    <Icon icon={Megaphone} size="md" />
                  </div>
                  <div className="v2-marketing__empty-title">No posts yet today</div>
                  <div className="v2-marketing__empty-sub">Click "Generate Today's Content" to create your daily social media posts.</div>
                </div>
              ) : (
                <div className="v2-marketing__posts-grid">
                  {todayPosts.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onPost={data.postToFacebook}
                      onSchedule={id => setSchedulingPostId(id)}
                      onDelete={data.deletePost}
                      onRegenerate={data.regeneratePost}
                      onCopy={data.copyCaption}
                      posting={data.posting}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* QUEUE TAB */}
          {data.tab === "queue" && (
            <div className="v2-marketing__queue-list">
              {data.queue.length === 0 ? (
                <div className="v2-marketing__empty">
                  <div className="v2-marketing__empty-icon">
                    <Icon icon={Calendar} size="md" />
                  </div>
                  <div className="v2-marketing__empty-title">No scheduled posts</div>
                  <div className="v2-marketing__empty-sub">Schedule posts from the Today tab using the calendar button.</div>
                </div>
              ) : (
                data.queue.map(post => (
                  <div key={post.id} className="v2-marketing__queue-item">
                    <div className="v2-marketing__queue-time">
                      {post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </div>
                    <div className="v2-marketing__queue-hook">{post.hook}</div>
                    <PlatformBadge platform={post.platform} />
                    <button
                      className="v2-marketing__post-btn--icon"
                      onClick={() => data.postToFacebook(post.id)}
                      disabled={!!data.posting}
                      title="Post now"
                    >
                      {data.posting === post.id
                        ? <Icon icon={Loader} size="sm" className="v2-marketing__spinner" />
                        : <Icon icon={Send} size="sm" />
                      }
                    </button>
                    <button className="v2-marketing__post-btn--icon" onClick={() => data.deletePost(post.id)} title="Remove">
                      <Icon icon={Trash2} size="sm" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* COMPANIES TAB */}
          {data.tab === "companies" && (
            <div className="v2-marketing__companies-list">
              {data.companies.map(c => (
                <div
                  key={c.id}
                  className={`v2-marketing__company-card ${c.id === data.activeCompany ? "v2-marketing__company-card--active" : ""}`}
                >
                  <div>
                    <div className="v2-marketing__company-name">{c.name}</div>
                    <div className="v2-marketing__company-meta">
                      {c.pageId ? `Page: ${c.pageId}` : "No Page ID set"} · {c.token ? "Token set" : "No token"}
                    </div>
                  </div>
                  {c.id === data.activeCompany && (
                    <span className="v2-marketing__company-badge">Active</span>
                  )}
                  {c.id !== data.activeCompany && (
                    <button className="v2-marketing__post-btn--secondary" onClick={() => data.switchCompany(c.id)}>
                      Switch
                    </button>
                  )}
                  {c.id !== "built2win" && (
                    <button className="v2-marketing__post-btn--icon" onClick={() => data.removeCompany(c.id)} title="Remove">
                      <Icon icon={Trash2} size="sm" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add company form */}
              <div className="v2-marketing__settings-section" style={{ marginTop: 8 }}>
                <h3>Add Company</h3>
                <div className="v2-marketing__field">
                  <label>Company Name</label>
                  <input
                    type="text"
                    placeholder="My Business"
                    value={newCompany.name}
                    onChange={e => setNewCompany(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="v2-marketing__field">
                  <label>Facebook Page ID</label>
                  <input
                    type="text"
                    placeholder="123456789"
                    value={newCompany.pageId}
                    onChange={e => setNewCompany(p => ({ ...p, pageId: e.target.value }))}
                  />
                </div>
                <div className="v2-marketing__field">
                  <label>Page Access Token</label>
                  <input
                    type="password"
                    placeholder="EAAxxxx…"
                    value={newCompany.token}
                    onChange={e => setNewCompany(p => ({ ...p, token: e.target.value }))}
                  />
                </div>
                <button
                  className="v2-marketing__save-btn"
                  disabled={!newCompany.name}
                  onClick={() => {
                    data.addCompany({ name: newCompany.name, pageId: newCompany.pageId, token: newCompany.token, active: false });
                    setNewCompany({ name: "", pageId: "", token: "" });
                  }}
                >
                  Add Company
                </button>
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {data.tab === "settings" && (
            <div className="v2-marketing__settings">
              <div className="v2-marketing__settings-section">
                <h3>Facebook Integration</h3>
                <p style={{ fontSize: "var(--font-sm)", color: "color-mix(in srgb, var(--ink) 60%, transparent)", marginBottom: 16 }}>
                  Add your Facebook Page credentials to enable one-click publishing. Get your Page Access Token from <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>developers.facebook.com</a>.
                </p>
                <div className="v2-marketing__field">
                  <label>Page ID</label>
                  <input type="text" placeholder="Found in Meta Business Suite → Settings" />
                </div>
                <div className="v2-marketing__field">
                  <label>Page Access Token</label>
                  <input type="password" placeholder="Long-lived token — never expires if refreshed" />
                </div>
                <button className="v2-marketing__save-btn">Save to config.yaml</button>
              </div>

              <div className="v2-marketing__settings-section">
                <h3>Content Schedule</h3>
                <div className="v2-marketing__field">
                  <label>Daily Posts</label>
                  <select defaultValue="2">
                    <option value="1">1 post/day</option>
                    <option value="2">2 posts/day</option>
                    <option value="3">3 posts/day</option>
                  </select>
                </div>
                <div className="v2-marketing__field">
                  <label>Default Post Time</label>
                  <input type="time" defaultValue="08:00" />
                </div>
                <div className="v2-marketing__field">
                  <label>Platforms</label>
                  <select defaultValue="both">
                    <option value="facebook">Facebook only</option>
                    <option value="instagram">Instagram only</option>
                    <option value="both">Facebook + Instagram</option>
                  </select>
                </div>
                <button className="v2-marketing__save-btn">Save Settings</button>
              </div>

              <div className="v2-marketing__settings-section">
                <h3>Brand Voice</h3>
                <div className="v2-marketing__field">
                  <label>Tone</label>
                  <select defaultValue="confident">
                    <option value="confident">Confident & Technical</option>
                    <option value="friendly">Friendly & Approachable</option>
                    <option value="aggressive">Aggressive & Direct</option>
                    <option value="educational">Educational & Expert</option>
                  </select>
                </div>
                <div className="v2-marketing__field">
                  <label>Content Types</label>
                  <select defaultValue="mixed">
                    <option value="mixed">Mixed (educational, promo, testimonial)</option>
                    <option value="educational">Educational only</option>
                    <option value="promotional">Promotional only</option>
                  </select>
                </div>
                <button className="v2-marketing__save-btn">Save Brand Voice</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {schedulingPostId && (
        <ScheduleModal
          postId={schedulingPostId}
          onSchedule={data.schedulePost}
          onClose={() => setSchedulingPostId(null)}
        />
      )}
    </RoomShell>
  );
}
