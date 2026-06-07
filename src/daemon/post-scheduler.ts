/**
 * Post Scheduler
 *
 * Runs on every 'post_scheduler_tick' event (every 5 min).
 * Queries the content pipeline for items in 'scheduled' stage
 * that are due, then publishes them to Facebook/Instagram via meta-api.
 *
 * For Reel content, emits 'reel_creation_request' to ask Jacob
 * questions before publishing (two interactive Reels per day).
 *
 * Flow:
 *   content_items (stage=scheduled, scheduled_at <= now)
 *     → determine platform (facebook / instagram)
 *     → if type=reel/video → emit reel_creation_request
 *     → else → publish immediately via meta-api
 *     → update stage to 'published'
 */

import {
  fbPublishPost,
  fbPublishVideo,
  igPublishPhoto,
  igPublishReel,
  igGetAccount,
  type MetaConfig,
} from '../integrations/meta-api.ts';
import { listContent, updateContent } from '../vault/content-pipeline.ts';
import type { ObserverEventHandler } from '../observers/index.ts';

export type PostSchedulerConfig = {
  meta: MetaConfig;
  igAccountId?: string;        // cached after first resolve
  dailyReelTarget?: number;    // default 2
};

export class PostScheduler {
  private cfg: PostSchedulerConfig;
  private handler: ObserverEventHandler | null = null;
  private reelsPostedToday = 0;
  private lastResetDate = '';

  constructor(cfg: PostSchedulerConfig) {
    this.cfg = cfg;
  }

  onEvent(handler: ObserverEventHandler): void {
    this.handler = handler;
  }

  /** Call this on every post_scheduler_tick event */
  async tick(): Promise<void> {
    if (!this.cfg.meta.pageAccessToken) return;

    // Reset daily reel count
    const today = new Date().toLocaleDateString('en-CA');
    if (today !== this.lastResetDate) {
      this.reelsPostedToday = 0;
      this.lastResetDate = today;
    }

    // Resolve Instagram account ID if not cached
    if (!this.cfg.igAccountId) {
      try {
        const iga = await igGetAccount(this.cfg.meta);
        if (iga) this.cfg.igAccountId = iga.id;
      } catch { /* no-op */ }
    }

    await this.publishDuePosts();
    await this.checkReelQuota();
  }

  private emit(type: string, data: Record<string, unknown>): void {
    if (!this.handler) return;
    this.handler({ type, data, timestamp: Date.now() });
  }

  /** Find and publish all due scheduled posts */
  private async publishDuePosts(): Promise<void> {
    const now = Date.now();

    // Get all scheduled items
    const scheduled = listContent({ stage: 'scheduled' });
    const due = scheduled.filter(item => item.scheduled_at !== null && item.scheduled_at <= now);

    for (const item of due) {
      try {
        console.log(`[post-scheduler] Publishing: "${item.title}" (${item.content_type})`);

        // Determine if this is a Reel/video request
        const isReel = item.content_type === 'instagram' &&
          (item.tags.includes('reel') || item.tags.includes('video'));

        if (isReel) {
          // Don't auto-publish Reels — ask Jacob first
          const dailyTarget = this.cfg.dailyReelTarget ?? 2;
          if (this.reelsPostedToday < dailyTarget) {
            this.emit('reel_creation_request', {
              contentId: item.id,
              title: item.title,
              body: item.body,
              scheduledAt: item.scheduled_at,
              reelNumber: this.reelsPostedToday + 1,
              dailyTarget,
              questions: [
                'Do you have a video file ready to upload, or should I generate a script for you to record?',
                'What\'s the main hook/opening line you want to use?',
                'Any specific call-to-action? (e.g. "DM me 'WEBSITE'")',
              ],
            });
          }
          continue;
        }

        // Publish based on platform
        let publishedId: string | null = null;
        const hasMedia = item.tags.includes('photo') || item.tags.includes('image');

        if (item.content_type === 'instagram' && this.cfg.igAccountId) {
          // Instagram photo post
          const imageUrl = this.getAttachmentUrl(item);
          if (imageUrl) {
            const result = await igPublishPhoto(
              this.cfg.meta,
              this.cfg.igAccountId,
              imageUrl,
              item.body
            );
            publishedId = result.id;
          } else {
            console.warn(`[post-scheduler] Instagram post "${item.title}" has no image URL — skipping`);
            continue;
          }
        } else {
          // Facebook post (text or photo)
          const imageUrl = hasMedia ? this.getAttachmentUrl(item) : undefined;
          const result = await fbPublishPost(this.cfg.meta, item.body, imageUrl);
          publishedId = result.id;
        }

        // Mark as published
        if (publishedId) {
          updateContent(item.id, {
            stage: 'published',
            published_at: Date.now(),
            published_url: publishedId,
          });

          console.log(`[post-scheduler] ✅ Published "${item.title}" → ${publishedId}`);

          this.emit('post_published', {
            contentId: item.id,
            title: item.title,
            platform: item.content_type,
            publishedId,
          });
        }
      } catch (err) {
        console.error(`[post-scheduler] ❌ Failed to publish "${item.title}":`, err);
        this.emit('post_publish_failed', {
          contentId: item.id,
          title: item.title,
          error: String(err),
        });
      }
    }
  }

  /** Check if we've hit the daily Reel target yet */
  private async checkReelQuota(): Promise<void> {
    const dailyTarget = this.cfg.dailyReelTarget ?? 2;
    if (this.reelsPostedToday < dailyTarget) {
      const hour = new Date().getHours();
      // Remind at 9am and 1pm if no Reels posted yet
      if ((hour === 9 || hour === 13) && this.reelsPostedToday === 0) {
        this.emit('reel_reminder', {
          message: `You haven't posted any Reels today yet. Target: ${dailyTarget} Reels. Want me to draft content for one now?`,
          reelsPosted: this.reelsPostedToday,
          target: dailyTarget,
        });
      }
    }
  }

  /** Extract a media URL from item body (looks for http image links) */
  private getAttachmentUrl(item: { body: string; tags: string[] }): string | undefined {
    const match = item.body.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|mp4|mov)/i);
    return match?.[0];
  }

  /** Call after a Reel is successfully uploaded externally */
  markReelPosted(): void {
    this.reelsPostedToday++;
  }
}
