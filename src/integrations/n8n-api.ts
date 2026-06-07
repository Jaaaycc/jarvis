/**
 * n8n Cloud API Client
 *
 * Connects Jarvis to the n8n REST API to:
 *   - List and monitor workflow status
 *   - Trigger webhook workflows
 *   - Check execution history
 *   - Surface workflow health in the morning briefing
 *
 * Docs: https://docs.n8n.io/api/
 */

export type N8nConfig = {
  baseUrl: string;   // e.g. https://jacobworkinai.app.n8n.cloud
  apiKey: string;
  webhookBase?: string;
};

export type N8nWorkflow = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
};

export type N8nExecution = {
  id: string;
  workflowId: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  status: 'running' | 'success' | 'error' | 'canceled' | 'waiting';
};

export type N8nWorkflowSummary = {
  total: number;
  active: number;
  inactive: number;
  recentErrors: N8nExecution[];
  recentSuccess: N8nExecution[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function n8nGet(cfg: N8nConfig, path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${cfg.baseUrl}/api/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const resp = await fetch(url.toString(), {
    headers: {
      'X-N8N-API-KEY': cfg.apiKey,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    throw new Error(`[n8n] GET ${path} failed: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

async function n8nPost(cfg: N8nConfig, path: string, body: Record<string, any> = {}): Promise<any> {
  const resp = await fetch(`${cfg.baseUrl}/api/v1/${path}`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': cfg.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`[n8n] POST ${path} failed: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

// ── Workflows ──────────────────────────────────────────────────────────────

/** List all workflows. */
export async function listWorkflows(cfg: N8nConfig): Promise<N8nWorkflow[]> {
  const data = await n8nGet(cfg, 'workflows', { limit: '100' });
  return (data.data ?? []).map((w: any) => ({
    id: w.id,
    name: w.name,
    active: w.active,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    tags: (w.tags ?? []).map((t: any) => t.name ?? t),
  }));
}

/** Get a single workflow by ID. */
export async function getWorkflow(cfg: N8nConfig, workflowId: string): Promise<N8nWorkflow> {
  const w = await n8nGet(cfg, `workflows/${workflowId}`);
  return {
    id: w.id,
    name: w.name,
    active: w.active,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    tags: (w.tags ?? []).map((t: any) => t.name ?? t),
  };
}

/** Activate a workflow. */
export async function activateWorkflow(cfg: N8nConfig, workflowId: string): Promise<void> {
  await n8nPost(cfg, `workflows/${workflowId}/activate`);
}

/** Deactivate a workflow. */
export async function deactivateWorkflow(cfg: N8nConfig, workflowId: string): Promise<void> {
  await n8nPost(cfg, `workflows/${workflowId}/deactivate`);
}

// ── Executions ─────────────────────────────────────────────────────────────

/** Get recent executions, optionally filtered by workflow. */
export async function getRecentExecutions(
  cfg: N8nConfig,
  workflowId?: string,
  limit = 20
): Promise<N8nExecution[]> {
  const params: Record<string, string> = { limit: String(limit) };
  if (workflowId) params.workflowId = workflowId;

  const data = await n8nGet(cfg, 'executions', params);
  return (data.data ?? []).map((e: any) => ({
    id: e.id,
    workflowId: e.workflowId,
    finished: e.finished,
    mode: e.mode,
    startedAt: e.startedAt,
    stoppedAt: e.stoppedAt,
    status: e.status,
  }));
}

// ── Summary (for morning briefing) ────────────────────────────────────────

/** Get a dashboard-ready summary of workflow health. */
export async function getWorkflowSummary(cfg: N8nConfig): Promise<N8nWorkflowSummary> {
  const [workflows, executions] = await Promise.all([
    listWorkflows(cfg),
    getRecentExecutions(cfg, undefined, 50),
  ]);

  const active = workflows.filter(w => w.active).length;
  const recentErrors = executions.filter(e => e.status === 'error').slice(0, 5);
  const recentSuccess = executions.filter(e => e.status === 'success').slice(0, 5);

  return {
    total: workflows.length,
    active,
    inactive: workflows.length - active,
    recentErrors,
    recentSuccess,
  };
}

/** Format summary as a human-readable string for the morning briefing. */
export function formatWorkflowSummary(summary: N8nWorkflowSummary): string {
  const errorNote = summary.recentErrors.length > 0
    ? ` ⚠️ ${summary.recentErrors.length} recent error(s)`
    : ' ✅ All healthy';

  return `${summary.active}/${summary.total} workflows active${errorNote}`;
}

// ── Webhooks ───────────────────────────────────────────────────────────────

/** Trigger a webhook workflow by its path. */
export async function triggerWebhook(
  cfg: N8nConfig,
  webhookPath: string,
  payload: Record<string, any> = {}
): Promise<any> {
  const webhookBase = cfg.webhookBase ?? `${cfg.baseUrl}/webhook`;
  const url = `${webhookBase}/${webhookPath}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`[n8n] Webhook ${webhookPath} failed: ${resp.status} ${resp.statusText}`);
  }

  return resp.json().catch(() => ({ ok: true }));
}
