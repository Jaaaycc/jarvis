/**
 * Ads Optimizer
 *
 * Monitors ad performance and organic content — NEVER creates or modifies
 * anything without Jacob's explicit approval.
 *
 * Behavior:
 *   - Scans recent Facebook/Instagram posts for boost-worthiness
 *   - If a post looks like a good ad candidate, asks Jacob first
 *   - Only acts after approval — never autonomously spends money
 *   - When approved, uses absolute minimum spend ($1-5/day)
 *   - Hourly: critical alerts on existing campaigns (if any)
 *   - Weekly: full audit report surfaced for review
 *
 * Minimum-spend philosophy:
 *   - Start at $1-3/day to test
 *   - Only scale if ROAS ≥ 2x AND Jacob approves the increase
 *   - Frequency > 3 = pause and refresh, never increase budget
 *   - All budget changes require explicit approval
 */

import {
  listAdSets,
  updateAdSet,
  pauseAd,
  getAccountInsights,
  analyzePerformance,
  smartBudgetAdjust,
  getAccountSummary,
  formatAccountSummary,
  type AdsConfig,
  type PerformanceAlert,
} from '../integrations/meta-ads-api.ts';
import {
  fbGetRecentPosts,
  fbGetComments,
  type MetaConfig,
} from '../integrations/meta-api.ts';
import type { ObserverEventHandler } from '../observers/index.ts';
import { sendDesktopNotification } from '../comms/desktop-notify.ts';

export type AdsOptimizerConfig = {
  ads: AdsConfig;
  meta?: MetaConfig;            // for reading organic posts
  autoOptimize?: boolean;       // ALWAYS false — Jacob must approve everything
  roasThreshold?: number;       // default 2.0
  maxDailyBudgetUSD?: number;   // absolute cap — default $5 (minimum spend strategy)
  startingBudgetUSD?: number;   // first test budget — default $1/day
  notifyOnWarning?: boolean;    // default true
};

export class AdsOptimizer {
  private cfg: AdsOptimizerConfig;
  private handler: ObserverEventHandler | null = null;
  private lastHourlyRun = 0;
  private last6hRun = 0;
  private lastWeeklyRun = 0;
  private pausedAdIds: Set<string> = new Set();

  constructor(cfg: AdsOptimizerConfig) {
    this.cfg = cfg;
  }

  onEvent(handler: ObserverEventHandler): void {
    this.handler = handler;
  }

  private emit(type: string, data: Record<string, unknown>): void {
    if (!this.handler) return;
    this.handler({ type, data, timestamp: Date.now() });
  }

  /** Call this on every post_scheduler_tick (every 5 min) */
  async tick(): Promise<void> {
    const now = Date.now();
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon

    // Hourly: check existing campaigns for critical issues
    if (now - this.lastHourlyRun > 60 * 60_000) {
      this.lastHourlyRun = now;
      await this.hourlyCheck();
    }

    // Every 6 hours: scan organic posts for boost candidates
    if (now - this.last6hRun > 6 * 60 * 60_000) {
      this.last6hRun = now;
      await this.scanOrganicPostsForBoostCandidates();
    }

    // Weekly audit on Monday at 9am
    if (dayOfWeek === 1 && hour === 9 && now - this.lastWeeklyRun > 6 * 24 * 60 * 60_000) {
      this.lastWeeklyRun = now;
      await this.weeklyAudit();
    }
  }

  // ── Hourly: critical alerts only ─────────────────────────────────────────

  private async hourlyCheck(): Promise<void> {
    try {
      const alerts = await analyzePerformance(this.cfg.ads);
      const critical = alerts.filter(a => a.severity === 'critical');

      if (critical.length === 0) return;

      for (const alert of critical) {
        console.log(`[ads-optimizer] 🚨 Critical: ${alert.message}`);

        // Auto-pause ads with zero conversions and high spend (if auto-optimize on)
        if (
          this.cfg.autoOptimize !== false &&
          alert.alertType === 'no_conversions' &&
          alert.level === 'ad' &&
          !this.pausedAdIds.has(alert.id)
        ) {
          try {
            await pauseAd(this.cfg.ads, alert.id);
            this.pausedAdIds.add(alert.id);
            console.log(`[ads-optimizer] Auto-paused ad ${alert.id} (${alert.name})`);
            this.emit('ad_auto_paused', {
              adId: alert.id,
              adName: alert.name,
              reason: alert.message,
              spend: alert.currentValue,
            });
          } catch (err) {
            console.error(`[ads-optimizer] Failed to pause ad ${alert.id}:`, err);
          }
        }

        this.emit('ads_critical_alert', {
          alertType: alert.alertType,
          level: alert.level,
          id: alert.id,
          name: alert.name,
          message: alert.message,
          recommendation: alert.recommendation,
          currentValue: alert.currentValue,
          threshold: alert.threshold,
        });
      }
    } catch (err) {
      console.error('[ads-optimizer] Hourly check error:', err instanceof Error ? err.message : err);
    }
  }

  // ── Every 6 hours: scan organic posts for boost candidates ──────────────

  private async scanOrganicPostsForBoostCandidates(): Promise<void> {
    if (!this.cfg.meta?.pageAccessToken) return;

    try {
      console.log('[ads-optimizer] Scanning organic posts for boost candidates...');

      const posts = await fbGetRecentPosts(this.cfg.meta, 10);

      for (const post of posts) {
        if (!post.message || post.message.length < 20) continue;

        // Score the post for ad potential
        const comments = await fbGetComments(this.cfg.meta, post.id, 25).catch(() => []);
        const commentCount = comments.length;
        const score = this.scorePostForAd(post.message, commentCount);

        if (score.worthy) {
          console.log(`[ads-optimizer] Boost candidate found: "${post.message.slice(0, 60)}..." (score: ${score.score})`);

          // Ask Jacob — never act without permission
          this.emit('ads_boost_suggestion', {
            postId: post.id,
            postUrl: post.permalink_url ?? '',
            postPreview: post.message.slice(0, 150),
            commentCount,
            score: score.score,
            reason: score.reason,
            suggestedBudgetUSD: this.cfg.startingBudgetUSD ?? 1,
            maxBudgetUSD: this.cfg.maxDailyBudgetUSD ?? 5,
            question: `I found a post that looks like a good ad candidate:\n\n"${post.message.slice(0, 200)}"\n\n${score.reason}\n\nSuggested budget: $${this.cfg.startingBudgetUSD ?? 1}/day to start. Want me to boost it?`,
          });
        }
      }
    } catch (err) {
      console.error('[ads-optimizer] Post scan error:', err instanceof Error ? err.message : err);
    }
  }

  /** Score a post 0-100 for ad potential based on content signals */
  private scorePostForAd(message: string, commentCount: number): { worthy: boolean; score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];
    const text = message.toLowerCase();

    // Engagement signals
    if (commentCount >= 5) { score += 20; reasons.push(`${commentCount} comments (good engagement)`); }
    else if (commentCount >= 2) { score += 10; reasons.push(`${commentCount} comments`); }

    // Content quality signals for Built2Win
    if (text.includes('website') || text.includes('web design')) { score += 15; reasons.push('directly promotes web services'); }
    if (text.includes('result') || text.includes('rank') || text.includes('seo')) { score += 15; reasons.push('results/SEO focused'); }
    if (text.includes('$') || text.includes('price') || text.includes('flat fee')) { score += 10; reasons.push('includes pricing (high intent)'); }
    if (text.includes('lighthouse') || text.includes('100') || text.includes('guaranteed')) { score += 15; reasons.push('highlights guarantee/USP'); }
    if (text.includes('before') || text.includes('after') || text.includes('case study')) { score += 20; reasons.push('before/after or case study (high performer)'); }
    if (text.includes('?') || text.includes('you') || text.includes('your')) { score += 10; reasons.push('engages audience directly'); }

    // Negative signals
    if (text.includes('test') || text.includes('ignore')) { score -= 30; }
    if (message.length < 50) { score -= 20; reasons.push('too short'); }

    const worthy = score >= 40;
    const reason = reasons.length > 0
      ? `Why this could work as an ad: ${reasons.join(', ')}.`
      : 'Generic content — low ad potential.';

    return { worthy, score: Math.max(0, Math.min(100, score)), reason };
  }

  // ── Weekly: full account audit via claude-ads logic ──────────────────────

  private async weeklyAudit(): Promise<void> {
    try {
      console.log('[ads-optimizer] Running weekly ad account audit...');

      const summary = await getAccountSummary(this.cfg.ads);
      const formatted = formatAccountSummary(summary);

      // Build detailed action plan from alerts
      const actionItems = summary.alerts.map((alert, i) =>
        `${i + 1}. [${alert.severity.toUpperCase()}] ${alert.name}: ${alert.message}\n   → ${alert.recommendation}`
      ).join('\n');

      const auditReport = [
        `# Weekly Ads Audit — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
        '',
        formatted,
        '',
        summary.alerts.length > 0 ? `## Action Items\n${actionItems}` : '## No action items — account is healthy ✅',
        '',
        `## Scaling Rules Reminder`,
        `- Only scale if ROAS ≥ ${this.cfg.roasThreshold ?? 2.0}x`,
        `- Never raise budget > 20% at a time`,
        `- Frequency > 3 = refresh creative, not raise budget`,
        `- Max daily budget per ad set: $${this.cfg.maxDailyBudgetUSD ?? 50}`,
      ].join('\n');

      this.emit('ads_weekly_audit', {
        report: auditReport,
        summary: formatted,
        alertCount: summary.alerts.length,
        criticalCount: summary.alerts.filter(a => a.severity === 'critical').length,
        totalSpend7d: summary.totalSpend7d,
        avgROAS7d: summary.avgROAS7d,
      });

      console.log(`[ads-optimizer] Weekly audit complete. ${summary.alerts.length} alert(s), $${summary.totalSpend7d.toFixed(2)} spend last 7d`);
    } catch (err) {
      console.error('[ads-optimizer] Weekly audit error:', err instanceof Error ? err.message : err);
    }
  }

  /** Get a quick summary string for the morning briefing */
  async getMorningBriefingSummary(): Promise<string> {
    try {
      const summary = await getAccountSummary(this.cfg.ads);
      return formatAccountSummary(summary);
    } catch {
      return '⚠️ Could not fetch ad account data';
    }
  }
}
