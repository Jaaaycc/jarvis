import { useCallback, useEffect, useState } from "react";

export type MetaTab = "overview" | "campaigns" | "instagram" | "commerce" | "setup";

export interface MetaCampaign {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  objective: string;
  dailyBudget?: string;
  lifetimeBudget?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  createdTime: string;
}

export interface MetaInsight {
  label: string;
  value: string;
  change?: number;
}

export interface MetaAccount {
  id: string;
  name: string;
  currency: string;
  timezoneName: string;
  accountStatus: number;
}

export interface MetaPost {
  id: string;
  message: string;
  createdTime: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  permalink?: string;
  thumbnailUrl?: string;
}

export interface MetaHook {
  tab: MetaTab;
  setTab: (t: MetaTab) => void;
  isConnected: boolean;
  accessToken: string;
  setAccessToken: (t: string) => void;
  adAccountId: string;
  setAdAccountId: (id: string) => void;
  pageId: string;
  setPageId: (id: string) => void;
  account: MetaAccount | null;
  campaigns: MetaCampaign[];
  insights: MetaInsight[];
  posts: MetaPost[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  saveCredentials: () => Promise<void>;
  savingCreds: boolean;
}

function stored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function useMetaData(): MetaHook {
  const [tab, setTab] = useState<MetaTab>("overview");
  const [accessToken, setAccessToken] = useState(() => stored("jarvis_meta_token", ""));
  const [adAccountId, setAdAccountId] = useState(() => stored("jarvis_meta_account", ""));
  const [pageId, setPageId] = useState(() => stored("jarvis_meta_page", ""));
  const [isConnected, setIsConnected] = useState(false);
  const [account, setAccount] = useState<MetaAccount | null>(null);
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [insights, setInsights] = useState<MetaInsight[]>([]);
  const [posts, setPosts] = useState<MetaPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingCreds, setSavingCreds] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      const r = await fetch("/api/meta/status");
      if (r.ok) {
        const d = await r.json() as any;
        setIsConnected(d?.connected ?? false);
        if (d?.connected) {
          setAccessToken(d.accessToken ?? "");
          setAdAccountId(d.adAccountId ?? "");
          setPageId(d.pageId ?? "");
        }
      }
    } catch {
      // Not connected
      setIsConnected(stored("jarvis_meta_token", "") !== "");
    }
  }, []);

  const fetchData = useCallback(async () => {
    const token = stored("jarvis_meta_token", "");
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [accR, campR, insR, postR] = await Promise.allSettled([
        fetch(`/api/meta/account`),
        fetch(`/api/meta/campaigns`),
        fetch(`/api/meta/insights`),
        fetch(`/api/meta/posts`),
      ]);

      if (accR.status === "fulfilled" && accR.value.ok) {
        setAccount(await accR.value.json() as MetaAccount);
      }
      if (campR.status === "fulfilled" && campR.value.ok) {
        setCampaigns(await campR.value.json() as MetaCampaign[]);
      }
      if (insR.status === "fulfilled" && insR.value.ok) {
        setInsights(await insR.value.json() as MetaInsight[]);
      }
      if (postR.status === "fulfilled" && postR.value.ok) {
        setPosts(await postR.value.json() as MetaPost[]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch Meta data");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    checkConnection();
    fetchData();
  }, [checkConnection, fetchData]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveCredentials = useCallback(async () => {
    setSavingCreds(true);
    setError(null);
    try {
      const r = await fetch("/api/meta/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, adAccountId, pageId }),
      });
      if (r.ok) {
        try { localStorage.setItem("jarvis_meta_token", accessToken); } catch {}
        try { localStorage.setItem("jarvis_meta_account", adAccountId); } catch {}
        try { localStorage.setItem("jarvis_meta_page", pageId); } catch {}
        setIsConnected(true);
        setTab("overview");
        await fetchData();
      } else {
        const err = await r.text();
        setError(err || "Failed to save credentials");
      }
    } catch (e: any) {
      // Save locally if backend unavailable
      try { localStorage.setItem("jarvis_meta_token", accessToken); } catch {}
      try { localStorage.setItem("jarvis_meta_account", adAccountId); } catch {}
      try { localStorage.setItem("jarvis_meta_page", pageId); } catch {}
      setIsConnected(true);
      setTab("overview");
    } finally {
      setSavingCreds(false);
    }
  }, [accessToken, adAccountId, pageId, fetchData]);

  return {
    tab, setTab,
    isConnected,
    accessToken, setAccessToken,
    adAccountId, setAdAccountId,
    pageId, setPageId,
    account, campaigns, insights, posts,
    loading, error,
    refresh, saveCredentials, savingCreds,
  };
}
