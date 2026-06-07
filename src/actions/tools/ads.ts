/**
 * Ads Tools — Meta Ads Management for the Jarvis Agent
 *
 * Registers tools the agent can call via chat to:
 *   - Get ad account performance summary
 *   - List campaigns / ad sets / ads
 *   - Create, pause, activate campaigns
 *   - Run a full ads audit (claude-ads style analysis)
 *   - Get budget recommendations
 *   - Boost a Facebook post as an ad
 *
 * All tools require ads config to be present in jarvisConfig.
 * Gracefully returns a helpful error if not configured.
 */

import type { ToolDefinition } from './registry.ts';
import {
  getAccountSummary,
  formatAccountSummary,
  listCampaigns,
  listAdSets,
  listAds,
  createCampaign,
  pauseCampaign,
  activateCampaign,
  analyzePerformance,
  getAccountInsights,
  uploadImageFromUrl,
  createCreative,
  createAdSet,
  createAd,
  type AdsConfig,
} from '../../integrations/meta-ads-api.ts';

function makeAdsCfg(jarvisConfig: any): AdsConfig | null {
  const fb = jarvisConfig?.facebook;
  if (!fb?.page_access_token || !fb?.ad_account_id) return null;
  return {
    adAccountId: fb.ad_account_id,
    pageAccessToken: fb.page_access_token,
    pageId: fb.page_id,
    businessId: fb.business_id,
  };
}

export function createAdsTools(jarvisConfig: any): ToolDefinition[] {
  return [
    // ── Account Summary ────────────────────────────────────────────────────
    {
      name: 'ads_get_summary',
      description: 'Get a performance summary of the Meta ad account for the last 7 days including spend, ROAS, CTR, frequency, and any alerts.',
      category: 'ads',
      parameters: {},
      execute: async () => {
        const cfg = makeAdsCfg(jarvisConfig);
        if (!cfg) return 'Meta Ads not configured — add facebook.page_access_token and ad_account_id to config.yaml';
        try {
          const summary = await getAccountSummary(cfg);
          return formatAccountSummary(summary);
        } catch (err) {
          return `Error fetching ad summary: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── List Campaigns ─────────────────────────────────────────────────────
    {
      name: 'ads_list_campaigns',
      description: 'List all campaigns in the Meta ad account with their status, budget, and objective.',
      category: 'ads',
      parameters: {
        status: {
          type: 'string',
          description: 'Filter by status: ACTIVE, PAUSED, ARCHIVED. Leave empty for all.',
          required: false,
        },
      },
      execute: async (params) => {
        const cfg = makeAdsCfg(jarvisConfig);
        if (!cfg) return 'Meta Ads not configured';
        try {
          const campaigns = await listCampaigns(cfg, params.status as string | undefined);
          if (campaigns.length === 0) return 'No campaigns found.';
          return campaigns.map(c =>
            `[${c.status}] ${c.name} (${c.id})\n  Objective: ${c.objective} | Budget: ${c.daily_budget ? `$${(c.daily_budget / 100).toFixed(2)}/day` : c.lifetime_budget ? `$${(c.lifetime_budget / 100).toFixed(2)} lifetime` : 'No budget set'}`
          ).join('\n\n');
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── List Ad Sets ───────────────────────────────────────────────────────
    {
      name: 'ads_list_adsets',
      description: 'List ad sets in the Meta ad account, optionally filtered by campaign.',
      category: 'ads',
      parameters: {
        campaign_id: {
          type: 'string',
          description: 'Optional campaign ID to filter ad sets',
          required: false,
        },
      },
      execute: async (params) => {
        const cfg = makeAdsCfg(jarvisConfig);
        if (!cfg) return 'Meta Ads not configured';
        try {
          const adSets = await listAdSets(cfg, params.campaign_id as string | undefined);
          if (adSets.length === 0) return 'No ad sets found.';
          return adSets.map(a =>
            `[${a.status}] ${a.name} (${a.id})\n  Campaign: ${a.campaign_id} | Budget: ${a.daily_budget ? `$${(a.daily_budget / 100).toFixed(2)}/day` : 'none'} | Goal: ${a.optimization_goal}`
          ).join('\n\n');
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── Performance Audit ──────────────────────────────────────────────────
    {
      name: 'ads_run_audit',
      description: 'Run a full performance audit of the Meta ad account. Checks for high CPM, audience fatigue (frequency), low CTR, wasted spend, and zero-conversion ads. Returns a prioritized action plan.',
      category: 'ads',
      parameters: {},
      execute: async () => {
        const cfg = makeAdsCfg(jarvisConfig);
        if (!cfg) return 'Meta Ads not configured';
        try {
          const [summary, alerts] = await Promise.all([
            getAccountSummary(cfg),
            analyzePerformance(cfg),
          ]);

          if (alerts.length === 0) {
            return `${formatAccountSummary(summary)}\n\n✅ No performance issues detected. Account looks healthy.`;
          }

          const critical = alerts.filter(a => a.severity === 'critical');
          const warnings = alerts.filter(a => a.severity === 'warning');

          const lines = [
            formatAccountSummary(summary),
            '',
            `## Audit Results: ${alerts.length} issue(s) found`,
            '',
          ];

          if (critical.length > 0) {
            lines.push('### 🚨 Critical (fix immediately)');
            critical.forEach((a, i) => {
              lines.push(`${i + 1}. **${a.name}** — ${a.message}`);
              lines.push(`   → ${a.recommendation}`);
            });
            lines.push('');
          }

          if (warnings.length > 0) {
            lines.push('### ⚠️ Warnings (fix within 48h)');
            warnings.forEach((a, i) => {
              lines.push(`${i + 1}. **${a.name}** — ${a.message}`);
              lines.push(`   → ${a.recommendation}`);
            });
          }

          return lines.join('\n');
        } catch (err) {
          return `Error running audit: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── Insights ───────────────────────────────────────────────────────────
    {
      name: 'ads_get_insights',
      description: 'Get detailed performance insights (spend, impressions, clicks, ROAS, CTR, CPM) for the ad account.',
      category: 'ads',
      parameters: {
        date_range: {
          type: 'string',
          description: 'Date range: today, yesterday, last_7d, last_14d, last_30d',
          required: false,
        },
        level: {
          type: 'string',
          description: 'Breakdown level: account, campaign, adset, ad',
          required: false,
        },
      },
      execute: async (params) => {
        const cfg = makeAdsCfg(jarvisConfig);
        if (!cfg) return 'Meta Ads not configured';
        try {
          const datePreset = (params.date_range as any) ?? 'last_7d';
          const level = (params.level as any) ?? 'campaign';
          const insights = await getAccountInsights(cfg, datePreset, level);

          if (insights.length === 0) return 'No data found for this period.';

          return insights.map(i => {
            const name = i.campaign_name ?? i.adset_name ?? i.ad_name ?? i.campaign_id ?? 'Unknown';
            const lines = [
              `**${name}**`,
              `  Spend: $${i.spend.toFixed(2)} | Impressions: ${i.impressions.toLocaleString()} | Clicks: ${i.clicks.toLocaleString()}`,
              `  CTR: ${i.ctr.toFixed(2)}% | CPM: $${i.cpm.toFixed(2)} | CPC: $${i.cpc.toFixed(2)}`,
              `  Frequency: ${i.frequency.toFixed(1)} | Reach: ${i.reach.toLocaleString()}`,
            ];
            if (i.roas) lines.push(`  ROAS: ${i.roas.toFixed(2)}x | Conversions: ${i.conversions}`);
            return lines.join('\n');
          }).join('\n\n');
        } catch (err) {
          return `Error fetching insights: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── Pause Campaign ─────────────────────────────────────────────────────
    {
      name: 'ads_pause_campaign',
      description: 'Pause a Meta ad campaign by ID.',
      category: 'ads',
      parameters: {
        campaign_id: {
          type: 'string',
          description: 'The campaign ID to pause',
          required: true,
        },
      },
      execute: async (params) => {
        const cfg = makeAdsCfg(jarvisConfig);
        if (!cfg) return 'Meta Ads not configured';
        try {
          await pauseCampaign(cfg, params.campaign_id as string);
          return `✅ Campaign ${params.campaign_id} paused successfully.`;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── Activate Campaign ──────────────────────────────────────────────────
    {
      name: 'ads_activate_campaign',
      description: 'Activate (unpause) a Meta ad campaign by ID.',
      category: 'ads',
      parameters: {
        campaign_id: {
          type: 'string',
          description: 'The campaign ID to activate',
          required: true,
        },
      },
      execute: async (params) => {
        const cfg = makeAdsCfg(jarvisConfig);
        if (!cfg) return 'Meta Ads not configured';
        try {
          await activateCampaign(cfg, params.campaign_id as string);
          return `✅ Campaign ${params.campaign_id} activated successfully.`;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── Create Campaign ────────────────────────────────────────────────────
    {
      name: 'ads_create_campaign',
      description: 'Create a new Meta ad campaign. Starts as PAUSED for review before activating. Best for website traffic, lead gen, or brand awareness for Built2Win Web.',
      category: 'ads',
      parameters: {
        name: {
          type: 'string',
          description: 'Campaign name',
          required: true,
        },
        objective: {
          type: 'string',
          description: 'Campaign objective: OUTCOME_TRAFFIC, OUTCOME_LEADS, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_SALES',
          required: true,
        },
        daily_budget_usd: {
          type: 'number',
          description: 'Daily budget in USD (minimum $1). Starts conservatively.',
          required: true,
        },
      },
      execute: async (params) => {
        const cfg = makeAdsCfg(jarvisConfig);
        if (!cfg) return 'Meta Ads not configured';
        try {
          const result = await createCampaign(cfg, {
            name: params.name as string,
            objective: params.objective as string,
            status: 'PAUSED',
            dailyBudgetCents: Math.round((params.daily_budget_usd as number) * 100),
          });
          return `✅ Campaign created (PAUSED for review):\n  ID: ${result.id}\n  Name: ${params.name}\n  Budget: $${params.daily_budget_usd}/day\n\nReview and activate with: ads_activate_campaign`;
        } catch (err) {
          return `Error creating campaign: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── Boost Post ─────────────────────────────────────────────────────────
    {
      name: 'ads_boost_post',
      description: 'Boost a Facebook Page post as an ad after Jacob has approved it. Creates everything paused — Jacob must confirm before it goes live. Always starts at $1/day minimum.',
      category: 'ads',
      parameters: {
        post_id: {
          type: 'string',
          description: 'The Facebook post ID to boost (format: pageId_postId)',
          required: true,
        },
        daily_budget_usd: {
          type: 'number',
          description: 'Daily budget in USD. Always start at $1-3/day to test. Never go above $5/day without Jacob explicitly approving a higher amount.',
          required: true,
        },
        duration_days: {
          type: 'number',
          description: 'How many days to run the boost (default 7)',
          required: false,
        },
        objective: {
          type: 'string',
          description: 'Objective: OUTCOME_ENGAGEMENT (default) or OUTCOME_TRAFFIC',
          required: false,
        },
      },
      execute: async (params) => {
        const cfg = makeAdsCfg(jarvisConfig);
        if (!cfg) return 'Meta Ads not configured';
        try {
          const budgetCents = Math.round((params.daily_budget_usd as number) * 100);
          const days = (params.duration_days as number) ?? 7;
          const objective = (params.objective as string) ?? 'OUTCOME_ENGAGEMENT';
          const endTime = new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();

          // Create campaign
          const campaign = await createCampaign(cfg, {
            name: `Boost: Post ${params.post_id} — ${new Date().toLocaleDateString()}`,
            objective,
            status: 'PAUSED',
          });

          // Create ad set targeting US, broad audience
          const adSet = await createAdSet(cfg, {
            campaignId: campaign.id,
            name: `Ad Set — Post ${params.post_id}`,
            dailyBudgetCents: budgetCents,
            billingEvent: 'IMPRESSIONS',
            optimizationGoal: 'POST_ENGAGEMENT',
            targeting: {
              geo_locations: { countries: ['US'] },
              age_min: 25,
              age_max: 65,
            },
            endTime,
            status: 'PAUSED',
          });

          // Create creative from existing post
          const creative = await createCreative(cfg, {
            name: `Creative — Post ${params.post_id}`,
            pageId: cfg.pageId,
            message: `Boosted post: ${params.post_id}`,
          });

          // Create ad
          const ad = await createAd(cfg, {
            adSetId: adSet.id,
            name: `Ad — Post ${params.post_id}`,
            creativeId: creative.id,
            status: 'PAUSED',
          });

          return [
            `✅ Boost created (all PAUSED for review):`,
            `  Campaign ID: ${campaign.id}`,
            `  Ad Set ID: ${adSet.id}`,
            `  Ad ID: ${ad.id}`,
            `  Budget: $${params.daily_budget_usd}/day for ${days} days`,
            `  Targeting: US, ages 25-65 (broad)`,
            ``,
            `Review in Meta Ads Manager then activate with: ads_activate_campaign ${campaign.id}`,
          ].join('\n');
        } catch (err) {
          return `Error boosting post: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ];
}
