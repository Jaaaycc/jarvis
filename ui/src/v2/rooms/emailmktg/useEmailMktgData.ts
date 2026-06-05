import { useCallback, useEffect, useState } from "react";

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  body: string;
  recipientCount: number;
  status: CampaignStatus;
  sentAt?: string;
  opens?: number;
  clicks?: number;
  createdAt: string;
}

export interface Lead {
  id: string;
  businessName: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  hasWebsite: boolean;
  category?: string;
  source: string;
  addedAt: string;
  emailed: boolean;
}

export interface LeadScrapeJob {
  running: boolean;
  found: number;
  noWebsite: number;
  query: string;
  location: string;
  error: string | null;
}

export type EmailMktgTab = "campaigns" | "leads" | "compose";

export interface EmailMktgHook {
  tab: EmailMktgTab;
  setTab: (t: EmailMktgTab) => void;
  campaigns: EmailCampaign[];
  leads: Lead[];
  selectedCampaign: EmailCampaign | null;
  setSelectedCampaign: (c: EmailCampaign | null) => void;
  scrapeJob: LeadScrapeJob;
  loadingCampaigns: boolean;
  loadingLeads: boolean;
  // Actions
  createCampaign: (c: Partial<EmailCampaign>) => Promise<void>;
  updateCampaign: (id: string, c: Partial<EmailCampaign>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  sendCampaign: (id: string) => Promise<void>;
  scrapLeads: (query: string, location: string) => Promise<void>;
  deleteLeads: (ids: string[]) => Promise<void>;
  exportLeadsCSV: () => void;
  refresh: () => void;
  isGoogleConnected: boolean;
}

function newId() { return `em-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function now() { return new Date().toISOString(); }

const DEFAULT_FROM_EMAIL = "hr@built2winweb.com";
const DEFAULT_FROM_NAME = "Built2Win Web";

// Seed templates
const SEED_TEMPLATES: Partial<EmailCampaign>[] = [
  {
    name: "No-Website Outreach",
    subject: "We noticed your business doesn't have a website — we can fix that",
    fromEmail: DEFAULT_FROM_EMAIL,
    fromName: DEFAULT_FROM_NAME,
    body: `Hi {{business_name}},

My name is [Your Name] from Built2Win Web, and I came across your business while searching locally.

I noticed you don't currently have a website — and in today's market, that can mean missing out on a huge number of potential customers who search online first.

We specialize in building professional, affordable websites for local businesses. We'd love to help {{business_name}} get online quickly and start generating leads.

Here's what we offer:
• Professional design tailored to your brand
• Mobile-friendly and fast-loading
• SEO optimized from day one
• Ongoing support

Would you be open to a quick 15-minute call to see if we'd be a good fit?

Best,
[Your Name]
Built2Win Web
hr@built2winweb.com
`,
  },
];

export function useEmailMktgData(): EmailMktgHook {
  const [tab, setTab] = useState<EmailMktgTab>("campaigns");
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<EmailCampaign | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [scrapeJob, setScrapeJob] = useState<LeadScrapeJob>({
    running: false, found: 0, noWebsite: 0, query: "", location: "", error: null,
  });

  const checkAuth = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/google/status");
      const d = await r.json() as any;
      setIsGoogleConnected(d?.is_authenticated ?? false);
    } catch { setIsGoogleConnected(false); }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const r = await fetch("/api/emailmktg/campaigns");
      if (r.ok) { setCampaigns(await r.json() as EmailCampaign[]); }
    } catch {} finally { setLoadingCampaigns(false); }
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const r = await fetch("/api/emailmktg/leads");
      if (r.ok) { setLeads(await r.json() as Lead[]); }
    } catch {} finally { setLoadingLeads(false); }
  }, []);

  const refresh = useCallback(() => {
    checkAuth();
    fetchCampaigns();
    fetchLeads();
  }, [checkAuth, fetchCampaigns, fetchLeads]);

  useEffect(() => { refresh(); }, [refresh]);

  // Seed a default template if no campaigns exist
  useEffect(() => {
    if (campaigns.length === 0 && !loadingCampaigns) {
      const seed: EmailCampaign = {
        id: newId(),
        name: SEED_TEMPLATES[0]!.name!,
        subject: SEED_TEMPLATES[0]!.subject!,
        fromEmail: DEFAULT_FROM_EMAIL,
        fromName: DEFAULT_FROM_NAME,
        body: SEED_TEMPLATES[0]!.body!,
        recipientCount: 0,
        status: "draft",
        createdAt: now(),
      };
      // Only show locally if backend unavailable
      setCampaigns([seed]);
    }
  }, [loadingCampaigns]);

  const createCampaign = useCallback(async (c: Partial<EmailCampaign>) => {
    const campaign: EmailCampaign = {
      id: newId(),
      name: c.name ?? "Untitled Campaign",
      subject: c.subject ?? "",
      fromName: c.fromName ?? DEFAULT_FROM_NAME,
      fromEmail: c.fromEmail ?? DEFAULT_FROM_EMAIL,
      body: c.body ?? "",
      recipientCount: 0,
      status: "draft",
      createdAt: now(),
      ...c,
    };
    try {
      const r = await fetch("/api/emailmktg/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaign),
      });
      if (r.ok) { const saved = await r.json() as EmailCampaign; setCampaigns(p => [saved, ...p]); return; }
    } catch {}
    setCampaigns(p => [campaign, ...p]);
    setSelectedCampaign(campaign);
  }, []);

  const updateCampaign = useCallback(async (id: string, patch: Partial<EmailCampaign>) => {
    setCampaigns(p => p.map(c => c.id === id ? { ...c, ...patch } : c));
    setSelectedCampaign(s => s?.id === id ? { ...s, ...patch } : s);
    try {
      await fetch(`/api/emailmktg/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {}
  }, []);

  const deleteCampaign = useCallback(async (id: string) => {
    setCampaigns(p => p.filter(c => c.id !== id));
    setSelectedCampaign(s => s?.id === id ? null : s);
    try { await fetch(`/api/emailmktg/campaigns/${id}`, { method: "DELETE" }); } catch {}
  }, []);

  const sendCampaign = useCallback(async (id: string) => {
    setCampaigns(p => p.map(c => c.id === id ? { ...c, status: "sending" } : c));
    try {
      const r = await fetch(`/api/emailmktg/campaigns/${id}/send`, { method: "POST" });
      if (r.ok) {
        setCampaigns(p => p.map(c => c.id === id ? { ...c, status: "sent", sentAt: now() } : c));
      } else {
        const err = await r.text();
        setCampaigns(p => p.map(c => c.id === id ? { ...c, status: "failed" } : c));
        throw new Error(err);
      }
    } catch (e: any) {
      setCampaigns(p => p.map(c => c.id === id ? { ...c, status: "failed" } : c));
      throw e;
    }
  }, []);

  const scrapLeads = useCallback(async (query: string, location: string) => {
    setScrapeJob({ running: true, found: 0, noWebsite: 0, query, location, error: null });
    try {
      const r = await fetch("/api/emailmktg/leads/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location }),
      });
      if (r.ok) {
        const result = await r.json() as { leads: Lead[]; found: number; noWebsite: number };
        setLeads(prev => {
          const existing = new Set(prev.map(l => l.id));
          const newLeads = result.leads.filter(l => !existing.has(l.id));
          return [...newLeads, ...prev];
        });
        setScrapeJob(j => ({ ...j, running: false, found: result.found, noWebsite: result.noWebsite }));
      } else {
        const err = await r.text();
        setScrapeJob(j => ({ ...j, running: false, error: err || "Scrape failed" }));
      }
    } catch (e: any) {
      setScrapeJob(j => ({ ...j, running: false, error: e?.message ?? "Scrape failed" }));
    }
  }, []);

  const deleteLeads = useCallback(async (ids: string[]) => {
    setLeads(p => p.filter(l => !ids.includes(l.id)));
    try {
      await fetch("/api/emailmktg/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {}
  }, []);

  const exportLeadsCSV = useCallback(() => {
    const header = "Business Name,Email,Phone,Address,Has Website,Category,Source";
    const rows = leads.map(l =>
      [l.businessName, l.email ?? "", l.phone ?? "", l.address ?? "",
       l.hasWebsite ? "Yes" : "No", l.category ?? "", l.source].map(v => `"${v.replace(/"/g, '""')}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jarvis-leads-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [leads]);

  return {
    tab, setTab,
    campaigns, leads,
    selectedCampaign, setSelectedCampaign,
    scrapeJob,
    loadingCampaigns, loadingLeads,
    createCampaign, updateCampaign, deleteCampaign, sendCampaign,
    scrapLeads, deleteLeads, exportLeadsCSV,
    refresh,
    isGoogleConnected,
  };
}
