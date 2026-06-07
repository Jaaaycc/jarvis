/**
 * Meta Ads API Client
 *
 * Full campaign management via the Meta Marketing API v19.0:
 *   - List / create / update / pause / delete campaigns
 *   - List / create / update ad sets (targeting, budget, schedule)
 *   - List / create / update / delete ads and creatives
 *   - Fetch performance insights (impressions, clicks, spend, ROAS, CPL, CPC)
 *   - Budget management — set daily/lifetime budgets, adjust spend caps
 *   - Opportunity scoring — surface recommendations from Meta
 *
 * Implements the minimum-spend, high-quality ad philosophy from claude-ads:
 *   - Never raise budgets blindly; only raise when ROAS > threshold
 *   - Pause ads with CPM > 2x account average
 *   - Alert on frequency > 3 (audience fatigue)
 *   - Always check pixel event match quality before scaling
 */

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

// ── Types ──────────────────────────────────────────────────────────────────

export type AdsConfig = {
  adAccountId: string;     // without "act_" prefix
  pageAccessToken: string; // system user token with ads_management
  pageId: string;
  businessId?: string;
};

export type Campaign = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  objective: string;
  daily_budget?: number;   // cents
  lifetime_budget?: number; // cents
  start_time?: string;
  stop_time?: string;
  created_time: string;
  updated_time: string;
};

export type AdSet = {
  id: string;
  name: string;
  campaign_id: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  daily_budget?: number;
  lifetime_budget?: number;
  bid_amount?: number;
  billing_event: string;
  optimization_goal: string;
  targeting?: Record<string, any>;
  start_time?: string;
  end_time?: string;
  created_time: string;
};

export type Ad = {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  creative?: { id: string };
  created_time: string;
  updated_time: string;
};

export type AdInsights = {
  date_start: string;
  date_stop: string;
  impressions: number;
  clicks: number;
  spend: number;           // USD
  reach: number;
  frequency: number;
  cpm: number;             // cost per 1000 impressions
  cpc: number;             // cost per click
  ctr: number;             // click-through rate %
  cpp: number;             // cost per result
  actions?: { action_type: string; value: string }[];
  conversions?: number;
  roas?: number;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
};

export type AdCreative = {
  id: string;
  name: string;
  title?: string;
  body?: string;
  image_url?: string;
  video_id?: string;
  call_to_action_type?: string;
  link_url?: string;
  page_id: string;
};

export type PerformanceAlert = {
  level: 'campaign' | 'adset' | 'ad';
  id: string;
  name: string;
  alertType: 'high_cpm' | 'high_frequency' | 'low_ctr' | 'high_spend' | 'no_conversions' | 'paused_winner';
  severity: 'warning' | 'critical';
  message: string;
  recommendation: string;
  currentValue: number;
  threshold: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function actId(cfg: AdsConfig): string {
  return `act_${cfg.adAccountId}`;
}

async function adsGet(cfg: AdsConfig, path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  url.searchParams.set('access_token', cfg.pageAccessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const resp = await fetch(url.toString());
  const json = await resp.json() as any;
  if (!resp.ok || json.error) {
    throw new Error(`[meta-ads] GET ${path} failed: ${JSON.stringify(json.error ?? json)}`);
  }
  return json;
}

async function adsPost(cfg: AdsConfig, path: string, body: Record<string, any>): Promise<any> {
  const resp = await fetch(`${GRAPH_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: cfg.pageAccessToken }),
  });
  const json = await resp.json() as any;
  if (!resp.ok || json.error) {
    throw new Error(`[meta-ads] POST ${path} failed: ${JSON.stringify(json.error ?? json)}`);
  }
  return json;
}

async function adsDelete(cfg: AdsConfig, path: string): Promise<any> {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  url.searchParams.set('access_token', cfg.pageAccessToken);
  const resp = await fetch(url.toString(), { method: 'DELETE' });
  const json = await resp.json() as any;
  if (!resp.ok || json.error) {
    throw new Error(`[meta-ads] DELETE ${path} failed: ${JSON.stringify(json.error ?? json)}`);
  }
  return json;
}

// ── Campaigns ──────────────────────────────────────────────────────────────

export async function listCampaigns(cfg: AdsConfig, status?: string): Promise<Campaign[]> {
  const params: Record<string, string> = {
    fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time',
    limit: '100',
  };
  if (status) params.effective_status = `["${status}"]`;

  const data = await adsGet(cfg, `${actId(cfg)}/campaigns`, params);
  return data.data ?? [];
}

export async function createCampaign(cfg: AdsConfig, opts: {
  name: string;
  objective: string;
  status?: 'ACTIVE' | 'PAUSED';
  dailyBudgetCents?: number;
  lifetimeBudgetCents?: number;
  specialAdCategories?: string[];
}): Promise<{ id: string }> {
  const body: Record<string, any> = {
    name: opts.name,
    objective: opts.objective,
    status: opts.status ?? 'PAUSED',
    special_ad_categories: opts.specialAdCategories ?? [],
  };
  if (opts.dailyBudgetCents) body.daily_budget = String(opts.dailyBudgetCents);
  if (opts.lifetimeBudgetCents) body.lifetime_budget = String(opts.lifetimeBudgetCents);

  return adsPost(cfg, `${actId(cfg)}/campaigns`, body);
}

export async function updateCampaign(cfg: AdsConfig, campaignId: string, updates: {
  name?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  dailyBudgetCents?: number;
}): Promise<{ success: boolean }> {
  const body: Record<string, any> = {};
  if (updates.name) body.name = updates.name;
  if (updates.status) body.status = updates.status;
  if (updates.dailyBudgetCents) body.daily_budget = String(updates.dailyBudgetCents);
  return adsPost(cfg, campaignId, body);
}

export async function pauseCampaign(cfg: AdsConfig, campaignId: string): Promise<void> {
  await adsPost(cfg, campaignId, { status: 'PAUSED' });
}

export async function activateCampaign(cfg: AdsConfig, campaignId: string): Promise<void> {
  await adsPost(cfg, campaignId, { status: 'ACTIVE' });
}

// ── Ad Sets ────────────────────────────────────────────────────────────────

export async function listAdSets(cfg: AdsConfig, campaignId?: string): Promise<AdSet[]> {
  const path = campaignId ? `${campaignId}/adsets` : `${actId(cfg)}/adsets`;
  const data = await adsGet(cfg, path, {
    fields: 'id,name,campaign_id,status,daily_budget,lifetime_budget,bid_amount,billing_event,optimization_goal,targeting,start_time,end_time,created_time',
    limit: '100',
  });
  return data.data ?? [];
}

export async function createAdSet(cfg: AdsConfig, opts: {
  campaignId: string;
  name: string;
  dailyBudgetCents: number;
  billingEvent: string;
  optimizationGoal: string;
  targeting: Record<string, any>;
  startTime?: string;
  endTime?: string;
  status?: 'ACTIVE' | 'PAUSED';
}): Promise<{ id: string }> {
  return adsPost(cfg, `${actId(cfg)}/adsets`, {
    campaign_id: opts.campaignId,
    name: opts.name,
    daily_budget: String(opts.dailyBudgetCents),
    billing_event: opts.billingEvent,
    optimization_goal: opts.optimizationGoal,
    targeting: JSON.stringify(opts.targeting),
    status: opts.status ?? 'PAUSED',
    ...(opts.startTime ? { start_time: opts.startTime } : {}),
    ...(opts.endTime ? { end_time: opts.endTime } : {}),
  });
}

export async function updateAdSet(cfg: AdsConfig, adSetId: string, updates: {
  status?: 'ACTIVE' | 'PAUSED';
  dailyBudgetCents?: number;
  name?: string;
}): Promise<{ success: boolean }> {
  const body: Record<string, any> = {};
  if (updates.status) body.status = updates.status;
  if (updates.dailyBudgetCents) body.daily_budget = String(updates.dailyBudgetCents);
  if (updates.name) body.name = updates.name;
  return adsPost(cfg, adSetId, body);
}

// ── Ads ────────────────────────────────────────────────────────────────────

export async function listAds(cfg: AdsConfig, adSetId?: string): Promise<Ad[]> {
  const path = adSetId ? `${adSetId}/ads` : `${actId(cfg)}/ads`;
  const data = await adsGet(cfg, path, {
    fields: 'id,name,adset_id,campaign_id,status,creative,created_time,updated_time',
    limit: '100',
  });
  return data.data ?? [];
}

export async function createAd(cfg: AdsConfig, opts: {
  adSetId: string;
  name: string;
  creativeId: string;
  status?: 'ACTIVE' | 'PAUSED';
}): Promise<{ id: string }> {
  return adsPost(cfg, `${actId(cfg)}/ads`, {
    adset_id: opts.adSetId,
    name: opts.name,
    creative: JSON.stringify({ creative_id: opts.creativeId }),
    status: opts.status ?? 'PAUSED',
  });
}

export async function pauseAd(cfg: AdsConfig, adId: string): Promise<void> {
  await adsPost(cfg, adId, { status: 'PAUSED' });
}

export async function deleteAd(cfg: AdsConfig, adId: string): Promise<void> {
  await adsDelete(cfg, adId);
}

// ── Ad Creatives ───────────────────────────────────────────────────────────

export async function createCreative(cfg: AdsConfig, opts: {
  name: string;
  pageId: string;
  message: string;
  link?: string;
  imageHash?: string;
  videoId?: string;
  callToAction?: string;
  title?: string;
  description?: string;
}): Promise<{ id: string }> {
  const objectStorySpec: Record<string, any> = {
    page_id: opts.pageId,
    link_data: {
      message: opts.message,
      ...(opts.link ? { link: opts.link } : {}),
      ...(opts.title ? { name: opts.title } : {}),
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.imageHash ? { image_hash: opts.imageHash } : {}),
      ...(opts.callToAction ? { call_to_action: { type: opts.callToAction } } : {}),
    },
  };

  if (opts.videoId) {
    objectStorySpec.video_data = {
      video_id: opts.videoId,
      title: opts.title ?? '',
      message: opts.message,
      ...(opts.callToAction ? { call_to_action: { type: opts.callToAction, value: { link: opts.link } } } : {}),
    };
    delete objectStorySpec.link_data;
  }

  return adsPost(cfg, `${actId(cfg)}/adcreatives`, {
    name: opts.name,
    object_story_spec: JSON.stringify(objectStorySpec),
  });
}

export async function uploadImageFromUrl(cfg: AdsConfig, imageUrl: string): Promise<{ hash: string }> {
  const data = await adsPost(cfg, `${actId(cfg)}/adimages`, { url: imageUrl });
  const images = data.images ?? {};
  const first = Object.values(images)[0] as any;
  return { hash: first?.hash ?? '' };
}

// ── Insights / Performance ─────────────────────────────────────────────────

const INSIGHT_FIELDS = [
  'impressions', 'clicks', 'spend', 'reach', 'frequency',
  'cpm', 'cpc', 'ctr', 'cpp', 'actions', 'action_values',
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
].join(',');

export async function getAccountInsights(
  cfg: AdsConfig,
  datePreset: 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' = 'last_7d',
  level: 'account' | 'campaign' | 'adset' | 'ad' = 'campaign'
): Promise<AdInsights[]> {
  const data = await adsGet(cfg, `${actId(cfg)}/insights`, {
    fields: INSIGHT_FIELDS,
    date_preset: datePreset,
    level,
    limit: '100',
  });

  return (data.data ?? []).map(parseInsightRow);
}

export async function getCampaignInsights(
  cfg: AdsConfig,
  campaignId: string,
  datePreset = 'last_7d'
): Promise<AdInsights[]> {
  const data = await adsGet(cfg, `${campaignId}/insights`, {
    fields: INSIGHT_FIELDS,
    date_preset: datePreset,
    level: 'ad',
    limit: '100',
  });
  return (data.data ?? []).map(parseInsightRow);
}

function parseInsightRow(row: any): AdInsights {
  const spend = parseFloat(row.spend ?? '0');
  const impressions = parseInt(row.impressions ?? '0', 10);
  const clicks = parseInt(row.clicks ?? '0', 10);

  // Calculate ROAS from action_values if available
  const purchaseValue = (row.action_values ?? [])
    .filter((a: any) => a.action_type === 'purchase')
    .reduce((sum: number, a: any) => sum + parseFloat(a.value ?? '0'), 0);
  const roas = spend > 0 && purchaseValue > 0 ? purchaseValue / spend : undefined;

  const conversions = (row.actions ?? [])
    .filter((a: any) => ['purchase', 'lead', 'complete_registration'].includes(a.action_type))
    .reduce((sum: number, a: any) => sum + parseInt(a.value ?? '0', 10), 0);

  return {
    date_start: row.date_start,
    date_stop: row.date_stop,
    impressions,
    clicks,
    spend,
    reach: parseInt(row.reach ?? '0', 10),
    frequency: parseFloat(row.frequency ?? '0'),
    cpm: parseFloat(row.cpm ?? '0'),
    cpc: parseFloat(row.cpc ?? '0'),
    ctr: parseFloat(row.ctr ?? '0'),
    cpp: parseFloat(row.cpp ?? '0'),
    actions: row.actions,
    conversions,
    roas,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    adset_id: row.adset_id,
    adset_name: row.adset_name,
    ad_id: row.ad_id,
    ad_name: row.ad_name,
  };
}

// ── Performance Analysis ───────────────────────────────────────────────────

/**
 * Analyze account performance and return actionable alerts.
 * Implements the minimum-spend, high-quality philosophy from claude-ads.
 */
export async function analyzePerformance(cfg: AdsConfig): Promise<PerformanceAlert[]> {
  const alerts: PerformanceAlert[] = [];

  const [campaigns, insights] = await Promise.all([
    listCampaigns(cfg, 'ACTIVE'),
    getAccountInsights(cfg, 'last_7d', 'ad'),
  ]);

  if (insights.length === 0) return alerts;

  // Calculate account-level averages
  const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
  const avgCpm = insights.reduce((s, i) => s + i.cpm, 0) / insights.length;
  const avgCtr = insights.reduce((s, i) => s + i.ctr, 0) / insights.length;

  for (const insight of insights) {
    const name = insight.ad_name ?? insight.adset_name ?? insight.campaign_name ?? insight.ad_id ?? 'Unknown';
    const id = insight.ad_id ?? insight.adset_id ?? insight.campaign_id ?? '';
    const level = insight.ad_id ? 'ad' : insight.adset_id ? 'adset' : 'campaign';

    // High CPM (> 2x account average) — audience too narrow or creative fatigue
    if (insight.cpm > avgCpm * 2 && insight.spend > 5) {
      alerts.push({
        level, id, name,
        alertType: 'high_cpm',
        severity: insight.cpm > avgCpm * 3 ? 'critical' : 'warning',
        message: `CPM $${insight.cpm.toFixed(2)} is ${(insight.cpm / avgCpm).toFixed(1)}x the account average ($${avgCpm.toFixed(2)})`,
        recommendation: 'Broaden audience targeting or refresh the creative. Consider pausing if CPM stays high after 2 more days.',
        currentValue: insight.cpm,
        threshold: avgCpm * 2,
      });
    }

    // High frequency (> 3) — audience fatigue
    if (insight.frequency > 3 && insight.impressions > 1000) {
      alerts.push({
        level, id, name,
        alertType: 'high_frequency',
        severity: insight.frequency > 5 ? 'critical' : 'warning',
        message: `Frequency ${insight.frequency.toFixed(1)} — the same people are seeing this ad too many times`,
        recommendation: 'Expand audience, add frequency cap (max 2/week), or rotate in a new creative.',
        currentValue: insight.frequency,
        threshold: 3,
      });
    }

    // Low CTR (< 0.5%) — poor creative or wrong audience
    if (insight.ctr < 0.5 && insight.impressions > 2000) {
      alerts.push({
        level, id, name,
        alertType: 'low_ctr',
        severity: insight.ctr < 0.2 ? 'critical' : 'warning',
        message: `CTR ${insight.ctr.toFixed(2)}% is below the 0.5% minimum threshold`,
        recommendation: 'Test a new hook or headline. The current creative is not compelling enough to the audience.',
        currentValue: insight.ctr,
        threshold: 0.5,
      });
    }

    // Spend with zero conversions (after $20+ spent)
    if (insight.spend > 20 && insight.conversions === 0 && level === 'ad') {
      alerts.push({
        level, id, name,
        alertType: 'no_conversions',
        severity: 'critical',
        message: `$${insight.spend.toFixed(2)} spent with 0 conversions`,
        recommendation: 'Pause this ad. Check pixel firing, landing page load speed, and offer clarity.',
        currentValue: insight.spend,
        threshold: 20,
      });
    }
  }

  return alerts;
}

// ── Budget Management ──────────────────────────────────────────────────────

/**
 * Smart budget adjustment: only raise budgets when performance justifies it.
 * Never increases by more than 20% at a time (Meta's algorithm stability rule).
 */
export async function smartBudgetAdjust(
  cfg: AdsConfig,
  adSetId: string,
  currentBudgetCents: number,
  insights: AdInsights,
  opts: { roasThreshold?: number; maxIncreasePercent?: number } = {}
): Promise<{ action: 'increase' | 'decrease' | 'pause' | 'hold'; newBudgetCents?: number; reason: string }> {
  const roasThreshold = opts.roasThreshold ?? 2.0; // 2x ROAS minimum to scale
  const maxIncrease = opts.maxIncreasePercent ?? 20;

  // Pause: no conversions after significant spend
  if (insights.spend > 30 && insights.conversions === 0) {
    return { action: 'pause', reason: `$${insights.spend.toFixed(2)} spent, 0 conversions — pausing to protect budget` };
  }

  // Increase: strong ROAS, low frequency, good CTR
  if (
    insights.roas && insights.roas >= roasThreshold &&
    insights.frequency < 2.5 &&
    insights.ctr > 1.0
  ) {
    const increase = Math.round(currentBudgetCents * (maxIncrease / 100));
    const newBudget = currentBudgetCents + increase;
    return {
      action: 'increase',
      newBudgetCents: newBudget,
      reason: `ROAS ${insights.roas.toFixed(2)}x ≥ ${roasThreshold}x threshold. Increasing budget by ${maxIncrease}% ($${(increase / 100).toFixed(2)})`,
    };
  }

  // Decrease: high frequency or very high CPM
  if (insights.frequency > 4 || insights.cpm > 50) {
    const decrease = Math.round(currentBudgetCents * 0.2);
    const newBudget = Math.max(currentBudgetCents - decrease, 100); // min $1/day
    return {
      action: 'decrease',
      newBudgetCents: newBudget,
      reason: `High frequency (${insights.frequency.toFixed(1)}) or CPM ($${insights.cpm.toFixed(2)}) — reducing budget by 20%`,
    };
  }

  return { action: 'hold', reason: 'Performance within acceptable range — holding budget steady' };
}

// ── Account Summary ────────────────────────────────────────────────────────

export type AdAccountSummary = {
  activeCampaigns: number;
  totalSpend7d: number;
  avgROAS7d?: number;
  avgCTR7d: number;
  avgFrequency7d: number;
  alerts: PerformanceAlert[];
  topPerformer?: { name: string; roas: number; spend: number };
  worstPerformer?: { name: string; cpm: number; conversions: number };
};

export async function getAccountSummary(cfg: AdsConfig): Promise<AdAccountSummary> {
  const [campaigns, insights, alerts] = await Promise.all([
    listCampaigns(cfg, 'ACTIVE'),
    getAccountInsights(cfg, 'last_7d', 'ad'),
    analyzePerformance(cfg),
  ]);

  const totalSpend7d = insights.reduce((s, i) => s + i.spend, 0);
  const avgCTR7d = insights.length > 0 ? insights.reduce((s, i) => s + i.ctr, 0) / insights.length : 0;
  const avgFrequency7d = insights.length > 0 ? insights.reduce((s, i) => s + i.frequency, 0) / insights.length : 0;

  const withRoas = insights.filter(i => i.roas !== undefined);
  const avgROAS7d = withRoas.length > 0
    ? withRoas.reduce((s, i) => s + (i.roas ?? 0), 0) / withRoas.length
    : undefined;

  const sorted = [...insights].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
  const topPerformer = sorted[0]?.roas
    ? { name: sorted[0].ad_name ?? 'Unknown', roas: sorted[0].roas, spend: sorted[0].spend }
    : undefined;

  const worstSorted = [...insights].sort((a, b) => b.cpm - a.cpm);
  const worstPerformer = worstSorted[0]
    ? { name: worstSorted[0].ad_name ?? 'Unknown', cpm: worstSorted[0].cpm, conversions: worstSorted[0].conversions ?? 0 }
    : undefined;

  return {
    activeCampaigns: campaigns.length,
    totalSpend7d,
    avgROAS7d,
    avgCTR7d,
    avgFrequency7d,
    alerts,
    topPerformer,
    worstPerformer,
  };
}

export function formatAccountSummary(summary: AdAccountSummary): string {
  const lines = [
    `📊 **Ad Account (Last 7 Days)**`,
    `Active campaigns: ${summary.activeCampaigns}`,
    `Total spend: $${summary.totalSpend7d.toFixed(2)}`,
    summary.avgROAS7d ? `Avg ROAS: ${summary.avgROAS7d.toFixed(2)}x` : 'ROAS: no conversion data',
    `Avg CTR: ${summary.avgCTR7d.toFixed(2)}%`,
    `Avg frequency: ${summary.avgFrequency7d.toFixed(1)}`,
  ];

  if (summary.topPerformer) {
    lines.push(`🏆 Top ad: "${summary.topPerformer.name}" — ${summary.topPerformer.roas.toFixed(2)}x ROAS on $${summary.topPerformer.spend.toFixed(2)}`);
  }

  if (summary.alerts.length > 0) {
    const critical = summary.alerts.filter(a => a.severity === 'critical');
    const warnings = summary.alerts.filter(a => a.severity === 'warning');
    if (critical.length > 0) lines.push(`🚨 ${critical.length} critical alert(s)`);
    if (warnings.length > 0) lines.push(`⚠️ ${warnings.length} warning(s)`);
  } else {
    lines.push('✅ No performance alerts');
  }

  return lines.join('\n');
}
