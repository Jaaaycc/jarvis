import React from "react";
import {
  ExternalLink,
  RefreshCw,
  Settings,
} from "lucide-react";
import { RoomShell } from "../RoomShell";
import { useRoomActions } from "../useRoomActionBus";
import { useMetaData } from "./useMetaData";
import "./MetaRoom.css";

export type RoomBodyMode = "inline" | "expanded";

export function MetaRoomBody({ mode }: { mode: RoomBodyMode }) {
  const data = useMetaData();

  useRoomActions("meta", (action) => {
    if (action === "refresh") { data.refresh(); return true; }
    return false;
  });

  return (
    <RoomShell roomKey="meta" mode={mode} title="Meta Business">
      <div className="v2-meta">
        {/* ── Setup / not connected ── */}
        {!data.isConnected || data.tab === "setup" ? (
          <div className="v2-meta__setup">
            <div className="v2-meta__setup-header">
              <div className="v2-meta__setup-icon">f</div>
              <div className="v2-meta__setup-title">Connect Meta Business Suite</div>
              <div className="v2-meta__setup-sub">
                Link your Facebook / Instagram ad accounts and pages to manage campaigns
                and commerce directly from Jarvis.
              </div>
            </div>

            <div className="v2-meta__setup-steps">
              <div className="v2-meta__setup-step">
                <div className="v2-meta__step-num">1</div>
                <div className="v2-meta__step-text">
                  Go to{" "}
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
                    developers.facebook.com/apps
                  </a>{" "}
                  and create a new App (Business type).
                </div>
              </div>
              <div className="v2-meta__setup-step">
                <div className="v2-meta__step-num">2</div>
                <div className="v2-meta__step-text">
                  Under Tools → Graph API Explorer, generate a User Access Token with scopes:
                  <br />
                  <code style={{ fontSize: 11, background: "var(--paper-3)", padding: "2px 4px", borderRadius: 3 }}>
                    ads_management, ads_read, business_management, pages_read_engagement, instagram_basic
                  </code>
                </div>
              </div>
              <div className="v2-meta__setup-step">
                <div className="v2-meta__step-num">3</div>
                <div className="v2-meta__step-text">
                  Find your Ad Account ID in{" "}
                  <a href="https://business.facebook.com/settings/ad-accounts" target="_blank" rel="noreferrer">
                    Meta Business Settings → Ad Accounts
                  </a>.
                  It looks like <code style={{ fontSize: 11 }}>act_123456789</code>.
                </div>
              </div>
              <div className="v2-meta__setup-step">
                <div className="v2-meta__step-num">4</div>
                <div className="v2-meta__step-text">
                  Enter your credentials below and click Connect.
                </div>
              </div>
            </div>

            <div className="v2-meta__setup-form">
              <div className="v2-meta__form-field">
                <span className="v2-meta__form-label">Access Token</span>
                <input
                  type="password"
                  className="v2-meta__form-input"
                  value={data.accessToken}
                  onChange={(e) => data.setAccessToken(e.target.value)}
                  placeholder="EAAxxxxx…"
                />
                <span className="v2-meta__form-hint">
                  Your User or Page Access Token from Meta Graph API Explorer
                </span>
              </div>

              <div className="v2-meta__form-field">
                <span className="v2-meta__form-label">Ad Account ID</span>
                <input
                  className="v2-meta__form-input"
                  value={data.adAccountId}
                  onChange={(e) => data.setAdAccountId(e.target.value)}
                  placeholder="act_123456789"
                />
              </div>

              <div className="v2-meta__form-field">
                <span className="v2-meta__form-label">Page ID (optional)</span>
                <input
                  className="v2-meta__form-input"
                  value={data.pageId}
                  onChange={(e) => data.setPageId(e.target.value)}
                  placeholder="123456789"
                />
                <span className="v2-meta__form-hint">
                  Your Facebook Page ID for post/Instagram data
                </span>
              </div>

              {data.error && (
                <div className="v2-meta__error">{data.error}</div>
              )}

              <button
                className="v2-meta__connect-btn"
                disabled={!data.accessToken.trim() || data.savingCreds}
                onClick={data.saveCredentials}
              >
                {data.savingCreds ? "Connecting…" : "Connect Meta Business"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Toolbar ── */}
            <div className="v2-meta__toolbar">
              <div className="v2-meta__tab-group" role="tablist">
                {([
                  ["overview", "Overview"],
                  ["campaigns", "Campaigns"],
                  ["instagram", "Instagram"],
                  ["commerce", "Commerce"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={data.tab === key}
                    className="v2-meta__tab"
                    onClick={() => data.setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="v2-meta__spacer" />
              <button className="v2-meta__action-btn" onClick={data.refresh}>
                <RefreshCw size={12} /> Refresh
              </button>
              <button className="v2-meta__action-btn" onClick={() => data.setTab("setup")}>
                <Settings size={12} /> Credentials
              </button>
            </div>

            {data.error && <div className="v2-meta__error">{data.error}</div>}

            {/* ── Overview ── */}
            {data.tab === "overview" && (
              <>
                {data.account && (
                  <div style={{ padding: "var(--s-3) var(--s-6)", borderBottom: "var(--hair-soft)", fontSize: "var(--text-sm)", color: "var(--ink-2)" }}>
                    <strong>{data.account.name}</strong>
                    {" · "}{data.account.currency}
                    {" · "}{data.account.timezoneName}
                  </div>
                )}

                {data.insights.length > 0 && (
                  <div className="v2-meta__stats">
                    {data.insights.slice(0, 4).map((ins) => (
                      <div key={ins.label} className="v2-meta__stat">
                        <span className="v2-meta__stat-label">{ins.label}</span>
                        <span className="v2-meta__stat-value">{ins.value}</span>
                        {ins.change !== undefined && (
                          <span
                            className="v2-meta__stat-change"
                            style={{ color: ins.change >= 0 ? "var(--ok)" : "var(--accent)" }}
                          >
                            {ins.change >= 0 ? "+" : ""}{ins.change.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {data.loading && <div className="v2-meta__loading">Loading…</div>}

                {!data.loading && data.insights.length === 0 && (
                  <div className="v2-meta__loading">
                    No data yet — your account insights will appear here once the API responds.
                  </div>
                )}

                <div className="v2-meta__body">
                  {data.campaigns.length > 0 && (
                    <>
                      <div className="v2-meta__section-title">Active Campaigns</div>
                      <CampaignsTable campaigns={data.campaigns.filter(c => c.status === "ACTIVE")} />
                    </>
                  )}
                </div>
              </>
            )}

            {/* ── Campaigns ── */}
            {data.tab === "campaigns" && (
              <div className="v2-meta__body">
                {data.loading && <div className="v2-meta__loading">Loading…</div>}
                {!data.loading && data.campaigns.length === 0 && (
                  <div className="v2-meta__loading">No campaigns found</div>
                )}
                {data.campaigns.length > 0 && (
                  <>
                    <div className="v2-meta__section-title">{data.campaigns.length} Campaigns</div>
                    <CampaignsTable campaigns={data.campaigns} />
                  </>
                )}
              </div>
            )}

            {/* ── Instagram ── */}
            {data.tab === "instagram" && (
              <div className="v2-meta__body">
                {data.loading && <div className="v2-meta__loading">Loading…</div>}
                {!data.loading && data.posts.length === 0 && (
                  <div className="v2-meta__loading">
                    No posts found. Make sure your Page ID is set and the token has Instagram permissions.
                  </div>
                )}
                {data.posts.length > 0 && (
                  <>
                    <div className="v2-meta__section-title">Recent Posts</div>
                    <div className="v2-meta__post-grid">
                      {data.posts.map((post) => (
                        <div key={post.id} className="v2-meta__post-card">
                          <div className="v2-meta__post-thumb">
                            {post.thumbnailUrl ? (
                              <img src={post.thumbnailUrl} alt="" loading="lazy" />
                            ) : (
                              <span>No image</span>
                            )}
                          </div>
                          <div className="v2-meta__post-body">
                            <div className="v2-meta__post-text">{post.message}</div>
                            <div className="v2-meta__post-stats">
                              <span>♥ {post.likeCount}</span>
                              <span>💬 {post.commentCount}</span>
                              <span>↗ {post.shareCount}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Commerce ── */}
            {data.tab === "commerce" && (
              <div className="v2-meta__body">
                <div className="v2-meta__loading">
                  Meta Commerce Manager integration requires a Commerce Account.
                  <br /><br />
                  <a
                    href="https://business.facebook.com/commerce"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#1877F2", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    Open Commerce Manager <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </RoomShell>
  );
}

function CampaignsTable({ campaigns }: { campaigns: import("./useMetaData").MetaCampaign[] }) {
  return (
    <table className="v2-meta__table">
      <thead>
        <tr>
          <th>Campaign</th>
          <th>Status</th>
          <th>Objective</th>
          <th>Spend</th>
          <th>Impressions</th>
          <th>Clicks</th>
          <th>CTR</th>
        </tr>
      </thead>
      <tbody>
        {campaigns.map((c) => (
          <tr key={c.id}>
            <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name}
            </td>
            <td>
              <span className="v2-meta__status-pill" data-status={c.status}>
                {c.status}
              </span>
            </td>
            <td style={{ color: "var(--ink-3)", fontSize: 12 }}>{c.objective}</td>
            <td>{c.spend ? `$${c.spend}` : "—"}</td>
            <td>{c.impressions ?? "—"}</td>
            <td>{c.clicks ?? "—"}</td>
            <td>{c.ctr ? `${c.ctr}%` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
