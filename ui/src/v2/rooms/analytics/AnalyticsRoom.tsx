import React, { useState } from "react";
import {
  BarChart2,
  ExternalLink,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { Icon } from "../../ui";
import { RoomShell } from "../RoomShell";
import { useRoomActions } from "../useRoomActionBus";
import { useAnalyticsData, type DateRange, type GSCRow } from "./useAnalyticsData";
import "./AnalyticsRoom.css";

export type RoomBodyMode = "inline" | "expanded";

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "28d", label: "28d" },
  { key: "90d", label: "90d" },
  { key: "180d", label: "180d" },
];

function fmt(n: number, decimals = 0): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toFixed(decimals);
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

export function AnalyticsRoomBody({ mode }: { mode: RoomBodyMode }) {
  const data = useAnalyticsData();

  useRoomActions("analytics", (action) => {
    if (action === "refresh") { data.refresh(); return true; }
    return false;
  });

  const gscRows: GSCRow[] = data.gsc.data?.rows ?? [];
  const ga4 = data.ga4.data;

  return (
    <RoomShell roomKey="analytics" mode={mode} title="Analytics">
      {!data.isGoogleConnected ? (
        <div className="v2-analytics__connect">
          <div className="v2-analytics__connect-icon">
            <Icon icon={TrendingUp} size="md" />
          </div>
          <div className="v2-analytics__connect-title">Connect Google to view analytics</div>
          <div className="v2-analytics__connect-sub">
            Go to Settings → Integrations → Google and authorize Jarvis.
            Make sure to re-authorize to add Search Console &amp; Analytics scopes.
          </div>
          <a
            href="#/_room_settings"
            className="v2-analytics__refresh-btn"
            style={{ textDecoration: "none" }}
          >
            <Icon icon={ExternalLink} size="sm" /> Open Settings
          </a>
        </div>
      ) : (
        <div className="v2-analytics">
          {/* Toolbar */}
          <div className="v2-analytics__toolbar">
            <div className="v2-analytics__tab-group" role="tablist">
              <button
                role="tab"
                aria-selected={data.tab === "search-console"}
                className="v2-analytics__tab"
                onClick={() => data.setTab("search-console")}
              >
                <Icon icon={Search} size="sm" /> Search Console
              </button>
              <button
                role="tab"
                aria-selected={data.tab === "ga4"}
                className="v2-analytics__tab"
                onClick={() => data.setTab("ga4")}
              >
                <Icon icon={BarChart2} size="sm" /> Google Analytics
              </button>
            </div>
            <div className="v2-analytics__spacer" />
            <div className="v2-analytics__range-group">
              {DATE_RANGES.map((r) => (
                <button
                  key={r.key}
                  aria-selected={data.dateRange === r.key}
                  className="v2-analytics__range-btn"
                  onClick={() => data.setDateRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button className="v2-analytics__refresh-btn" onClick={data.refresh}>
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>

          {data.tab === "search-console" ? (
            <>
              {/* Site URL config */}
              <div className="v2-analytics__config">
                <span className="v2-analytics__config-label">Site</span>
                <input
                  className="v2-analytics__config-input"
                  value={data.gscSiteUrl}
                  onChange={(e) => data.setGscSiteUrl(e.target.value)}
                  placeholder="sc-domain:yourdomain.com"
                  onBlur={data.refresh}
                />
              </div>

              {/* Stats */}
              {data.gsc.data && (
                <div className="v2-analytics__stats">
                  <div className="v2-analytics__stat" data-tone="ok">
                    <span className="v2-analytics__stat-label">Clicks</span>
                    <span className="v2-analytics__stat-value">{fmt(data.gsc.data.totalClicks)}</span>
                    <span className="v2-analytics__stat-sub">{data.dateRange} window</span>
                  </div>
                  <div className="v2-analytics__stat">
                    <span className="v2-analytics__stat-label">Impressions</span>
                    <span className="v2-analytics__stat-value">{fmt(data.gsc.data.totalImpressions)}</span>
                    <span className="v2-analytics__stat-sub">search appearances</span>
                  </div>
                  <div className="v2-analytics__stat">
                    <span className="v2-analytics__stat-label">Avg CTR</span>
                    <span className="v2-analytics__stat-value">{fmtPct(data.gsc.data.avgCtr)}</span>
                    <span className="v2-analytics__stat-sub">click-through rate</span>
                  </div>
                  <div className="v2-analytics__stat" data-tone={data.gsc.data.avgPosition <= 10 ? "ok" : "accent"}>
                    <span className="v2-analytics__stat-label">Avg Position</span>
                    <span className="v2-analytics__stat-value">{data.gsc.data.avgPosition.toFixed(1)}</span>
                    <span className="v2-analytics__stat-sub">{data.gsc.data.avgPosition <= 10 ? "first page" : "needs work"}</span>
                  </div>
                </div>
              )}

              {/* Error */}
              {data.gsc.error && (
                <div className="v2-analytics__error">{data.gsc.error}</div>
              )}

              {/* Table */}
              <div className="v2-analytics__body">
                <div className="v2-analytics__section-title">Top Queries</div>
                {data.gsc.loading && <div className="v2-analytics__loading">Loading…</div>}
                {!data.gsc.loading && gscRows.length === 0 && !data.gsc.error && (
                  <div className="v2-analytics__empty">No data for this range</div>
                )}
                {gscRows.length > 0 && (
                  <table className="v2-analytics__table">
                    <thead>
                      <tr>
                        <th>Query</th>
                        <th>Clicks</th>
                        <th>Impressions</th>
                        <th>CTR</th>
                        <th>Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gscRows.slice(0, 50).map((row, i) => (
                        <tr key={i}>
                          <td>
                            <span className="v2-analytics__query-cell" title={row.keys[0]}>
                              {row.keys[0]}
                            </span>
                          </td>
                          <td>{fmt(row.clicks)}</td>
                          <td>{fmt(row.impressions)}</td>
                          <td>{fmtPct(row.ctr)}</td>
                          <td>
                            <span
                              className="v2-analytics__pos-pill"
                              data-good={row.position <= 10 ? "true" : "false"}
                            >
                              {row.position.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <>
              {/* GA4 Property ID config */}
              <div className="v2-analytics__config">
                <span className="v2-analytics__config-label">Property ID</span>
                <input
                  className="v2-analytics__config-input"
                  value={data.ga4PropertyId}
                  onChange={(e) => data.setGa4PropertyId(e.target.value)}
                  placeholder="123456789"
                  onBlur={data.refresh}
                />
              </div>

              {/* Stats */}
              {ga4 && (
                <div className="v2-analytics__stats">
                  {ga4.metrics.slice(0, 4).map((m) => (
                    <div key={m.name} className="v2-analytics__stat">
                      <span className="v2-analytics__stat-label">{m.name}</span>
                      <span className="v2-analytics__stat-value">{m.value}</span>
                      {m.change !== undefined && (
                        <span
                          className="v2-analytics__stat-sub"
                          style={{ color: m.change >= 0 ? "var(--ok)" : "var(--accent)" }}
                        >
                          {m.change >= 0 ? "+" : ""}{m.change.toFixed(1)}% vs prior
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {data.ga4.error && (
                <div className="v2-analytics__error">{data.ga4.error}</div>
              )}

              <div className="v2-analytics__body">
                {data.ga4.loading && <div className="v2-analytics__loading">Loading…</div>}
                {!data.ga4.loading && !ga4 && !data.ga4.error && (
                  <div className="v2-analytics__empty">No data yet</div>
                )}
                {ga4 && (
                  <div className="v2-analytics__ga4-grid">
                    {/* Top pages */}
                    <div className="v2-analytics__ga4-card">
                      <div className="v2-analytics__ga4-card-title">Top Pages</div>
                      <table className="v2-analytics__table">
                        <thead>
                          <tr>
                            <th>Page</th>
                            <th>Views</th>
                            <th>Sessions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ga4.topPages.slice(0, 10).map((p, i) => (
                            <tr key={i}>
                              <td>
                                <span className="v2-analytics__query-cell" title={p.pagePath}>
                                  {p.pagePath}
                                </span>
                              </td>
                              <td>{p.screenPageViews}</td>
                              <td>{p.sessions}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Traffic sources */}
                    <div className="v2-analytics__ga4-card">
                      <div className="v2-analytics__ga4-card-title">Traffic Sources</div>
                      <table className="v2-analytics__table">
                        <thead>
                          <tr>
                            <th>Source</th>
                            <th>Sessions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ga4.trafficSources.slice(0, 10).map((s, i) => (
                            <tr key={i}>
                              <td>{s.source}</td>
                              <td>{s.sessions}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </RoomShell>
  );
}
