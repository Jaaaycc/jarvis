import { useCallback, useEffect, useState } from "react";

export interface N8nNode {
  id: string;
  type: string;
  name: string;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  lastExecution?: N8nExecution;
  nodes?: N8nNode[];
  tags?: string[];
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  status: "success" | "error" | "running" | "waiting" | "unknown";
  startedAt: string;
  stoppedAt?: string;
  mode: string;
  error?: string;
  durationMs?: number;
}

export interface N8nHook {
  workflows: N8nWorkflow[];
  executions: N8nExecution[];
  loading: boolean;
  executing: string | null;
  error: string | null;
  selectedWorkflow: N8nWorkflow | null;
  isConfigured: boolean;
  tab: "executions" | "webhooks";
  setTab: (t: N8nHook["tab"]) => void;
  selectWorkflow: (w: N8nWorkflow | null) => void;
  fetchWorkflows: () => Promise<void>;
  fetchExecutions: (workflowId: string) => Promise<void>;
  triggerWorkflow: (id: string) => Promise<void>;
  toggleActive: (id: string) => Promise<void>;
  importWorkflow: (json: object) => Promise<void>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilter: "all" | "active" | "inactive";
  setActiveFilter: (f: N8nHook["activeFilter"]) => void;
}

function parseWorkflow(raw: any): N8nWorkflow {
  const nodes: N8nNode[] = (raw.nodes ?? []).map((n: any) => ({
    id: n.id ?? String(Math.random()),
    type: n.type ?? "unknown",
    name: n.name ?? "",
  }));
  return {
    id: String(raw.id),
    name: raw.name ?? "Unnamed Workflow",
    active: !!raw.active,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? raw.updated_at ?? new Date().toISOString(),
    nodeCount: nodes.length || raw.nodeCount || 0,
    nodes,
    tags: (raw.tags ?? []).map((t: any) => (typeof t === "string" ? t : t.name)),
  };
}

function parseExecution(raw: any): N8nExecution {
  const started = raw.startedAt ?? raw.started_at ?? raw.startTime ?? new Date().toISOString();
  const stopped = raw.stoppedAt ?? raw.stopped_at ?? raw.stopTime;
  const durationMs = started && stopped
    ? new Date(stopped).getTime() - new Date(started).getTime()
    : undefined;
  return {
    id: String(raw.id),
    workflowId: String(raw.workflowId ?? raw.workflow_id ?? ""),
    status: (raw.status === "success" || raw.status === "error" || raw.status === "running" || raw.status === "waiting")
      ? raw.status
      : raw.finished === true ? "success" : raw.finished === false ? "running" : "unknown",
    startedAt: started,
    stoppedAt: stopped,
    mode: raw.mode ?? "manual",
    error: raw.data?.resultData?.error?.message ?? raw.error ?? undefined,
    durationMs,
  };
}

export function useN8nData(): N8nHook {
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [executions, setExecutions] = useState<N8nExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<N8nWorkflow | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [tab, setTab] = useState<N8nHook["tab"]>("executions");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<N8nHook["activeFilter"]>("all");

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/n8n/workflows");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { workflows: any[]; configured: boolean };
      setIsConfigured(data.configured ?? false);
      setWorkflows((data.workflows ?? []).map(parseWorkflow));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExecutions = useCallback(async (workflowId: string) => {
    try {
      const res = await fetch(`/api/n8n/executions?workflowId=${workflowId}`);
      if (!res.ok) return;
      const data = await res.json() as { executions: any[] };
      setExecutions((data.executions ?? []).map(parseExecution));
    } catch {}
  }, []);

  const selectWorkflow = useCallback((w: N8nWorkflow | null) => {
    setSelectedWorkflow(w);
    if (w) fetchExecutions(w.id);
  }, [fetchExecutions]);

  const triggerWorkflow = useCallback(async (id: string) => {
    setExecuting(id);
    setError(null);
    try {
      const res = await fetch(`/api/n8n/workflows/${id}/execute`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      // Refresh executions after trigger
      setTimeout(() => fetchExecutions(id), 1500);
    } catch (err) {
      setError(String(err));
    } finally {
      setExecuting(null);
    }
  }, [fetchExecutions]);

  const toggleActive = useCallback(async (id: string) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, active: !w.active } : w));
    // Optimistic — actual toggle would need PATCH /api/n8n/workflows/:id
  }, []);

  const importWorkflow = useCallback(async (json: object) => {
    setError(null);
    try {
      const res = await fetch("/api/n8n/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: json }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchWorkflows();
    } catch (err) {
      setError(String(err));
    }
  }, [fetchWorkflows]);

  // Initial load
  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  // Poll executions every 10s when a workflow is selected
  useEffect(() => {
    if (!selectedWorkflow) return;
    const interval = setInterval(() => fetchExecutions(selectedWorkflow.id), 10000);
    return () => clearInterval(interval);
  }, [selectedWorkflow, fetchExecutions]);

  return {
    workflows,
    executions,
    loading,
    executing,
    error,
    selectedWorkflow,
    isConfigured,
    tab,
    setTab,
    selectWorkflow,
    fetchWorkflows,
    fetchExecutions,
    triggerWorkflow,
    toggleActive,
    importWorkflow,
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
  };
}

// Job Hacker workflow template (for easy import)
export const JOB_HACKER_WORKFLOW = {
  name: "Job Hacker — Lead Finder",
  nodes: [
    {
      parameters: { rule: { interval: [{ field: "cronExpression", expression: "0 9 * * 1-5" }] } },
      name: "Schedule Trigger",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1,
      position: [240, 300],
    },
    {
      parameters: {
        url: "https://www.google.com/search?q=site:yelp.com+%22no+website%22+%22local+business%22+%22{{$json.city}}%22&num=20",
        options: {},
      },
      name: "Scrape Leads",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.1,
      position: [460, 300],
    },
    {
      parameters: {
        fromEmail: "support@built2winweb.com",
        toEmail: "={{$json.email}}",
        subject: "Your business deserves a better website",
        emailType: "html",
        message: "<p>Hi {{$json.name}},</p><p>I noticed your business {{$json.business}} doesn't have a website...</p>",
      },
      name: "Send Outreach Email",
      type: "n8n-nodes-base.emailSend",
      typeVersion: 2,
      position: [680, 300],
    },
  ],
  connections: {
    "Schedule Trigger": { main: [[{ node: "Scrape Leads", type: "main", index: 0 }]] },
    "Scrape Leads": { main: [[{ node: "Send Outreach Email", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
  tags: ["marketing", "leads", "built2win"],
};
