import { useCallback, useEffect, useState } from "react";

export type DateRange = "7d" | "28d" | "90d" | "180d";

export interface GSCRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCData {
  siteUrl: string;
  rows: GSCRow[];
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
}

export interface GA4Metric {
  name: string;
  value: string;
  change?: number; // % change vs prior period
}

export interface GA4TopPage {
  pagePath: string;
  screenPageViews: string;
  sessions: string;
  bounceRate: string;
}

export interface GA4Data {
  propertyId: string;
  metrics: GA4Metric[];
  topPages: GA4TopPage[];
  trafficSources: Array<{ source: string; sessions: string }>;
}

export type AnalyticsTab = "search-console" | "ga4";

interface AnalyticsHook {
  tab: AnalyticsTab;
  setTab: (t: AnalyticsTab) => void;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  gsc: { data: GSCData | null; loading: boolean; error: string | null };
  ga4: { data: GA4Data | null; loading: boolean; error: string | null };
  refresh: () => void;
  isGoogleConnected: boolean;
  gscSiteUrl: string;
  setGscSiteUrl: (u: string) => void;
  ga4PropertyId: string;
  setGa4PropertyId: (id: string) => void;
}

const POLL_MS = 60_000; // refresh every minute

function storedStr(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function useAnalyticsData(): AnalyticsHook {
  const [tab, setTab] = useState<AnalyticsTab>("search-console");
  const [dateRange, setDateRange] = useState<DateRange>("28d");
  const [gscSiteUrl, setGscSiteUrl] = useState(() => storedStr("jarvis_gsc_site", "sc-domain:built2winweb.com"));
  const [ga4PropertyId, setGa4PropertyId] = useState(() => storedStr("jarvis_ga4_prop", "537954329"));
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);

  const [gscData, setGscData] = useState<GSCData | null>(null);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscError, setGscError] = useState<string | null>(null);

  const [ga4Data, setGa4Data] = useState<GA4Data | null>(null);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Error, setGa4Error] = useState<string | null>(null);

  // Persist settings
  useEffect(() => { try { localStorage.setItem("jarvis_gsc_site", gscSiteUrl); } catch {} }, [gscSiteUrl]);
  useEffect(() => { try { localStorage.setItem("jarvis_ga4_prop", ga4PropertyId); } catch {} }, [ga4PropertyId]);

  const checkAuth = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/google/status");
      const d = await r.json() as any;
      setIsGoogleConnected(d?.is_authenticated ?? false);
    } catch {
      setIsGoogleConnected(false);
    }
  }, []);

  const fetchGSC = useCallback(async () => {
    if (!gscSiteUrl) return;
    setGscLoading(true);
    setGscError(null);
    try {
      const params = new URLSearchParams({ siteUrl: gscSiteUrl, dateRange, dimension: "query" });
      const r = await fetch(`/api/analytics/search-console?${params}`);
      if (!r.ok) { setGscError(`Error ${r.status}: ${await r.text()}`); return; }
      const d = await r.json() as GSCData;
      setGscData(d);
    } catch (e: any) {
      setGscError(e?.message ?? "Failed to fetch Search Console data");
    } finally {
      setGscLoading(false);
    }
  }, [gscSiteUrl, dateRange]);

  const fetchGA4 = useCallback(async () => {
    if (!ga4PropertyId) return;
    setGa4Loading(true);
    setGa4Error(null);
    try {
      const params = new URLSearchParams({ propertyId: ga4PropertyId, dateRange });
      const r = await fetch(`/api/analytics/ga4?${params}`);
      if (!r.ok) { setGa4Error(`Error ${r.status}: ${await r.text()}`); return; }
      const d = await r.json() as GA4Data;
      setGa4Data(d);
    } catch (e: any) {
      setGa4Error(e?.message ?? "Failed to fetch GA4 data");
    } finally {
      setGa4Loading(false);
    }
  }, [ga4PropertyId, dateRange]);

  const refresh = useCallback(() => {
    checkAuth();
    fetchGSC();
    fetchGA4();
  }, [checkAuth, fetchGSC, fetchGA4]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return {
    tab, setTab,
    dateRange, setDateRange,
    gsc: { data: gscData, loading: gscLoading, error: gscError },
    ga4: { data: ga4Data, loading: ga4Loading, error: ga4Error },
    refresh,
    isGoogleConnected,
    gscSiteUrl, setGscSiteUrl,
    ga4PropertyId, setGa4PropertyId,
  };
}
