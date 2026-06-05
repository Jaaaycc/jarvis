import React, { useState } from "react";
import {
  AlertCircle,
  Copy,
  ExternalLink,
  FileJson,
  GitMerge,
  Loader,
  Play,
  RefreshCw,
  Search,
  Zap,
} from "lucide-react";
import { Icon } from "../../ui";
import { RoomShell } from "../RoomShell";
import { useRoomActions } from "../useRoomActionBus";
import { useN8nData, JOB_HACKER_WORKFLOW, type N8nWorkflow, type N8nExecution } from "./useN8nData";
import "./N8nRoom.css";

export type RoomBodyMode = "inline" | "expanded";

function StatusPill({ status }: { status: N8nExecution["status"] }) {
  return (
    <span className={`v2-n8n__status-pill v2-n8n__status-pill--${status}`}>
      {status === "success" ? "✓ Success"
        : status === "error" ? "✗ Error"
        : status === "running" ? "● Running"
        : status === "waiting" ? "⏸ Waiting"
        : "? Unknown"}
    </span>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function SetupPanel() {
  return (
    <div className="v2-n8n__setup">
      <div className="v2-n8n__setup-icon">
        <Icon icon={GitMerge} size="md" />
      </div>
      <div className="v2-n8n__setup-title">Connect your n8n Cloud</div>
      <div className="v2-n8n__setup-sub">
        Add your n8n API key to config.yaml and reload. Your workflows will appear here with live execution monitoring.
      </div>
      <ol className="v2-n8n__setup-steps">
        <li className="v2-n8n__setup-step">
          <span className="v2-n8n__setup-step-num">1.</span>
          <span>Go to <strong>jacobworkinai.app.n8n.cloud</strong> → Settings → API</span>
        </li>
        <li className="v2-n8n__setup-step">
          <span className="v2-n8n__setup-step-num">2.</span>
          <span>Create an API Key and copy it</span>
        </li>
        <li className="v2-n8n__setup-step">
          <span className="v2-n8n__setup-step-num">3.</span>
          <span>Add to <code>config.yaml</code> under <code>n8n.api_key</code></span>
        </li>
        <li className="v2-n8n__setup-step">
          <span className="v2-n8n__setup-step-num">4.</span>
          <span>Restart Jarvis and come back here</span>
        </li>
      </ol>
      <a
        href="https://jacobworkinai.app.n8n.cloud/settings/api"
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 20px", background: "var(--accent)", color: "#fff",
          borderRadius: 8, fontWeight: 600, fontSize: "var(--font-sm)", textDecoration: "none",
        }}
      >
        <Icon icon={ExternalLink} size="sm" /> Open n8n Settings
      </a>
    </div>
  );
}

function ImportModal({
  onImport,
  onClose,
}: {
  onImport: (json: object) => void;
  onClose: () => void;
}) {
  const [json, setJson] = useState("");
  const [parseError, setParseError] = useState("");

  const handleImport = () => {
    try {
      const parsed = JSON.parse(json);
      onImport(parsed);
      onClose();
    } catch {
      setParseError("Invalid JSON — please paste a valid n8n workflow export.");
    }
  };

  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const useTemplate = async () => {
    setLoadingTemplate(true);
    setParseError("");
    try {
      const r = await fetch("/api/n8n/templates/job-hacker");
      if (r.ok) {
        const data = await r.json();
        setJson(JSON.stringify(data, null, 2));
      } else {
        // Fall back to embedded minimal version
        setJson(JSON.stringify(JOB_HACKER_WORKFLOW, null, 2));
      }
    } catch {
      setJson(JSON.stringify(JOB_HACKER_WORKFLOW, null, 2));
    } finally {
      setLoadingTemplate(false);
    }
  };

  return (
    <div className="v2-n8n__import-modal" onClick={onClose}>
      <div className="v2-n8n__import-box" onClick={e => e.stopPropagation()}>
        <h3>Import Workflow</h3>
        <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "color-mix(in srgb, var(--ink) 60%, transparent)" }}>
          Paste a workflow JSON export from n8n, or use the Job Hacker template.
        </p>
        {parseError && <div className="v2-n8n__error">{parseError}</div>}
        <textarea
          value={json}
          onChange={e => { setJson(e.target.value); setParseError(""); }}
          placeholder='Paste workflow JSON here…'
        />
        <div className="v2-n8n__import-actions">
          <button className="v2-n8n__run-btn" onClick={handleImport} disabled={!json.trim()}>
            <Icon icon={FileJson} size="sm" /> Import
          </button>
          <button className="v2-n8n__icon-btn" onClick={useTemplate} disabled={loadingTemplate}>
            <Icon icon={Zap} size="sm" /> {loadingTemplate ? "Loading…" : "Load Job Hacker Template"}
          </button>
          <button
            className="v2-n8n__icon-btn"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
          >Cancel</button>
        </div>
      </div>
    </div>
  );
}

function WorkflowDetail({
  workflow,
  executions,
  executing,
  tab,
  setTab,
  onRun,
  onToggle,
  onOpenInN8n,
}: {
  workflow: N8nWorkflow;
  executions: N8nExecution[];
  executing: string | null;
  tab: "executions" | "webhooks";
  setTab: (t: "executions" | "webhooks") => void;
  onRun: (id: string) => void;
  onToggle: (id: string) => void;
  onOpenInN8n: (id: string) => void;
}) {
  const isRunning = executing === workflow.id;

  // Derive webhook URLs from nodes
  const webhookNodes = (workflow.nodes ?? []).filter(n =>
    n.type?.includes("webhook") || n.type?.includes("Webhook")
  );

  return (
    <div className="v2-n8n__detail">
      {/* Head */}
      <div className="v2-n8n__detail-head">
        <div className="v2-n8n__detail-title">
          <button
            className={`v2-n8n__active-toggle v2-n8n__active-toggle--${workflow.active ? "active" : "inactive"}`}
            onClick={() => onToggle(workflow.id)}
            title={workflow.active ? "Click to deactivate" : "Click to activate"}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
            {workflow.active ? "Active" : "Inactive"}
          </button>
          {workflow.name}
        </div>
        <div className="v2-n8n__detail-meta">
          <span>{workflow.nodeCount} nodes</span>
          <span>Updated {formatTime(workflow.updatedAt)}</span>
          {workflow.tags?.map(t => (
            <span key={t} style={{
              padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 600,
              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              color: "var(--accent)",
            }}>{t}</span>
          ))}
        </div>
        <div className="v2-n8n__detail-actions">
          <button
            className="v2-n8n__run-btn"
            onClick={() => onRun(workflow.id)}
            disabled={isRunning}
          >
            {isRunning
              ? <><Icon icon={Loader} size="sm" className="v2-n8n__spinner" /> Running…</>
              : <><Icon icon={Play} size="sm" /> Run Now</>
            }
          </button>
          <button className="v2-n8n__icon-btn" onClick={() => onOpenInN8n(workflow.id)}>
            <Icon icon={ExternalLink} size="sm" /> Open in n8n
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="v2-n8n__tabs">
        <button
          role="tab"
          aria-selected={tab === "executions"}
          className="v2-n8n__tab"
          onClick={() => setTab("executions")}
        >Executions ({executions.length})</button>
        <button
          role="tab"
          aria-selected={tab === "webhooks"}
          className="v2-n8n__tab"
          onClick={() => setTab("webhooks")}
        >Webhooks ({webhookNodes.length})</button>
      </div>

      {/* Tab body */}
      <div className="v2-n8n__detail-body">
        {tab === "executions" && (
          <>
            {executions.length === 0 ? (
              <div style={{ color: "color-mix(in srgb, var(--ink) 45%, transparent)", fontSize: "var(--font-sm)", padding: "32px 0", textAlign: "center" }}>
                No executions found. Run the workflow to see results here.
              </div>
            ) : (
              <table className="v2-n8n__exec-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map(ex => (
                    <tr key={ex.id}>
                      <td><StatusPill status={ex.status} /></td>
                      <td>{formatTime(ex.startedAt)}</td>
                      <td>{formatDuration(ex.durationMs)}</td>
                      <td style={{ textTransform: "capitalize" }}>{ex.mode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "webhooks" && (
          <div className="v2-n8n__webhook-list">
            {webhookNodes.length === 0 ? (
              <div style={{ color: "color-mix(in srgb, var(--ink) 45%, transparent)", fontSize: "var(--font-sm)", padding: "32px 0", textAlign: "center" }}>
                No webhook nodes in this workflow.
              </div>
            ) : (
              webhookNodes.map(node => {
                const url = `https://jacobworkinai.app.n8n.cloud/webhook/${workflow.id}/${node.name.toLowerCase().replace(/\s+/g, "-")}`;
                return (
                  <div key={node.id} className="v2-n8n__webhook-item">
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>{node.name}</div>
                      <div className="v2-n8n__webhook-url">{url}</div>
                    </div>
                    <button
                      className="v2-n8n__copy-btn"
                      onClick={() => navigator.clipboard.writeText(url)}
                      title="Copy URL"
                    >
                      <Icon icon={Copy} size="sm" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function N8nRoomBody({ mode }: { mode: RoomBodyMode }) {
  const data = useN8nData();
  const [showImport, setShowImport] = useState(false);

  useRoomActions("n8n", (action, args) => {
    if (action === "refresh") { data.fetchWorkflows(); return true; }
    if (action === "run" && typeof args.id === "string") {
      data.triggerWorkflow(args.id as string); return true;
    }
    return false;
  });

  const filtered = data.workflows
    .filter(w => {
      if (data.activeFilter === "active") return w.active;
      if (data.activeFilter === "inactive") return !w.active;
      return true;
    })
    .filter(w => !data.searchQuery || w.name.toLowerCase().includes(data.searchQuery.toLowerCase()));

  const openInN8n = (id: string) => {
    window.open(`https://jacobworkinai.app.n8n.cloud/workflow/${id}`, "_blank");
  };

  return (
    <RoomShell roomKey="n8n" mode={mode} title="n8n Workflows">
      <div className="v2-n8n">
        {/* Sidebar */}
        <div className="v2-n8n__sidebar">
          <div className="v2-n8n__sidebar-head">
            <div className="v2-n8n__search">
              <Icon icon={Search} size="sm" />
              <input
                type="text"
                placeholder="Search workflows…"
                value={data.searchQuery}
                onChange={e => data.setSearchQuery(e.target.value)}
              />
            </div>
            <div className="v2-n8n__filter-row">
              {(["all", "active", "inactive"] as const).map(f => (
                <button
                  key={f}
                  aria-selected={data.activeFilter === f}
                  className="v2-n8n__filter-btn"
                  onClick={() => data.setActiveFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="v2-n8n__workflow-list">
            {data.loading && filtered.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "color-mix(in srgb, var(--ink) 40%, transparent)", fontSize: "var(--font-sm)" }}>
                <Icon icon={Loader} size="sm" className="v2-n8n__spinner" /> Loading…
              </div>
            )}
            {filtered.map(w => (
              <div
                key={w.id}
                className={`v2-n8n__workflow-item ${data.selectedWorkflow?.id === w.id ? "v2-n8n__workflow-item--selected" : ""}`}
                onClick={() => data.selectWorkflow(w)}
              >
                <div className={`v2-n8n__workflow-dot v2-n8n__workflow-dot--${w.active ? "active" : "inactive"}`} />
                <div className="v2-n8n__workflow-name" title={w.name}>{w.name}</div>
                <div className="v2-n8n__workflow-nodes">{w.nodeCount}n</div>
              </div>
            ))}
          </div>

          {/* Import + refresh buttons at bottom */}
          <div style={{
            padding: "var(--s-2) var(--s-2)",
            borderTop: "1px solid color-mix(in srgb, var(--ink) 8%, transparent)",
            display: "flex",
            gap: "var(--s-1)",
            flexShrink: 0,
          }}>
            <button className="v2-n8n__icon-btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => setShowImport(true)}>
              <Icon icon={FileJson} size="sm" /> Import
            </button>
            <button className="v2-n8n__icon-btn" onClick={data.fetchWorkflows} disabled={data.loading} title="Refresh">
              <Icon icon={RefreshCw} size="sm" className={data.loading ? "v2-n8n__spinner" : ""} />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="v2-n8n__main">
          {/* Error */}
          {data.error && (
            <div className="v2-n8n__error" style={{ margin: "var(--s-3) var(--s-4) 0" }}>
              <Icon icon={AlertCircle} size="sm" /> {data.error}
            </div>
          )}

          {!data.isConfigured && !data.loading ? (
            <SetupPanel />
          ) : data.selectedWorkflow ? (
            <WorkflowDetail
              workflow={data.selectedWorkflow}
              executions={data.executions}
              executing={data.executing}
              tab={data.tab}
              setTab={data.setTab}
              onRun={data.triggerWorkflow}
              onToggle={data.toggleActive}
              onOpenInN8n={openInN8n}
            />
          ) : (
            <div className="v2-n8n__no-selection">
              <Icon icon={GitMerge} size="md" />
              <span>Select a workflow to view details and executions</span>
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <ImportModal
          onImport={data.importWorkflow}
          onClose={() => setShowImport(false)}
        />
      )}
    </RoomShell>
  );
}
