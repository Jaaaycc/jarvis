/**
 * FacebookObserver — Social Media Event Monitor
 *
 * Polls Facebook Page and Instagram for:
 *   - New comments on recent posts → emits 'social_comment'
 *   - New Page DMs → emits 'social_dm'
 *   - New Instagram comments → emits 'social_ig_comment'
 *   - New Instagram DMs → emits 'social_ig_dm'
 *
 * Deduplicates by tracking seen IDs in memory.
 * Gracefully no-ops if no page_access_token configured.
 */

import type { Observer, ObserverEventHandler } from './index.ts';
import {
  fbGetRecentPosts,
  fbGetComments,
  fbGetConversations,
  fbGetMessages,
  igGetAccount,
  igGetRecentMedia,
  igGetComments,
  igGetDMConversations,
  igGetDMMessages,
  type MetaConfig,
} from '../integrations/meta-api.ts';

const POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_POSTS_TO_CHECK = 5;        // check comments on last 5 posts
const MAX_IG_MEDIA_TO_CHECK = 5;

export class FacebookObserver implements Observer {
  name = 'facebook';

  private running = false;
  private handler: ObserverEventHandler | null = null;
  private pollTimer: Timer | null = null;
  private cfg: MetaConfig | null;

  // Dedup sets — in-memory; reset on restart
  private seenCommentIds: Set<string> = new Set();
  private seenDMIds: Set<string> = new Set();
  private seenIgCommentIds: Set<string> = new Set();
  private seenIgDMIds: Set<string> = new Set();

  private igAccountId: string | null = null;

  constructor(cfg?: MetaConfig) {
    this.cfg = cfg ?? null;
  }

  async start(): Promise<void> {
    this.running = true;

    if (!this.cfg?.pageAccessToken) {
      console.log('[facebook] No page_access_token configured — social monitoring disabled');
      console.log('[facebook] Add FACEBOOK_PAGE_ACCESS_TOKEN to .env to enable');
      return;
    }

    console.log('[facebook] Observer started — polling every 5min for comments & DMs');

    // Resolve Instagram account once
    try {
      const iga = await igGetAccount(this.cfg);
      if (iga) {
        this.igAccountId = iga.id;
        console.log(`[facebook] Instagram account linked: @${iga.username} (${iga.id})`);
      } else {
        console.log('[facebook] No Instagram account linked to this Page');
      }
    } catch (err) {
      console.warn('[facebook] Could not fetch Instagram account:', err);
    }

    // Seed dedup sets on first run (don't alert on old items)
    await this.poll(true);

    // Recurring poll
    this.pollTimer = setInterval(() => this.poll(false), POLL_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[facebook] Observer stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  onEvent(handler: ObserverEventHandler): void {
    this.handler = handler;
  }

  private emit(type: string, data: Record<string, unknown>): void {
    if (!this.handler) return;
    this.handler({ type, data, timestamp: Date.now() });
  }

  private async poll(seedOnly = false): Promise<void> {
    if (!this.cfg) return;

    await Promise.allSettled([
      this.pollFBComments(seedOnly),
      this.pollFBDMs(seedOnly),
      this.igAccountId ? this.pollIGComments(seedOnly) : Promise.resolve(),
      this.igAccountId ? this.pollIGDMs(seedOnly) : Promise.resolve(),
    ]);
  }

  // ── Facebook Comments ────────────────────────────────────────────────────

  private async pollFBComments(seedOnly: boolean): Promise<void> {
    try {
      const posts = await fbGetRecentPosts(this.cfg!, MAX_POSTS_TO_CHECK);

      for (const post of posts) {
        const comments = await fbGetComments(this.cfg!, post.id);

        for (const comment of comments) {
          if (this.seenCommentIds.has(comment.id)) continue;
          this.seenCommentIds.add(comment.id);

          if (!seedOnly) {
            console.log(`[facebook] New comment on post ${post.id} from ${comment.from?.name}`);
            this.emit('social_comment', {
              platform: 'facebook',
              postId: post.id,
              postUrl: post.permalink_url ?? '',
              commentId: comment.id,
              commentText: comment.message,
              authorId: comment.from?.id ?? '',
              authorName: comment.from?.name ?? 'Unknown',
              createdTime: comment.created_time,
            });
          }
        }
      }
    } catch (err) {
      console.error('[facebook] pollFBComments error:', err);
    }
  }

  // ── Facebook DMs ─────────────────────────────────────────────────────────

  private async pollFBDMs(seedOnly: boolean): Promise<void> {
    try {
      const conversations = await fbGetConversations(this.cfg!);

      for (const conv of conversations) {
        const messages = await fbGetMessages(this.cfg!, conv.id, 5);

        for (const msg of messages) {
          if (this.seenDMIds.has(msg.id)) continue;
          this.seenDMIds.add(msg.id);

          // Skip messages sent by the Page itself
          if (msg.from?.id === this.cfg!.pageId) continue;

          if (!seedOnly) {
            console.log(`[facebook] New DM from ${msg.from?.name} in conversation ${conv.id}`);
            this.emit('social_dm', {
              platform: 'facebook',
              conversationId: conv.id,
              messageId: msg.id,
              messageText: msg.message,
              senderId: msg.from?.id ?? '',
              senderName: msg.from?.name ?? 'Unknown',
              createdTime: msg.created_time,
            });
          }
        }
      }
    } catch (err) {
      console.error('[facebook] pollFBDMs error:', err);
    }
  }

  // ── Instagram Comments ───────────────────────────────────────────────────

  private async pollIGComments(seedOnly: boolean): Promise<void> {
    if (!this.igAccountId) return;

    try {
      const media = await igGetRecentMedia(this.cfg!, this.igAccountId, MAX_IG_MEDIA_TO_CHECK);

      for (const item of media) {
        const comments = await igGetComments(this.cfg!, item.id);

        for (const comment of comments) {
          if (this.seenIgCommentIds.has(comment.id)) continue;
          this.seenIgCommentIds.add(comment.id);

          if (!seedOnly) {
            console.log(`[facebook] New IG comment on ${item.id} from @${comment.username}`);
            this.emit('social_ig_comment', {
              platform: 'instagram',
              mediaId: item.id,
              mediaUrl: item.permalink ?? '',
              commentId: comment.id,
              commentText: comment.text,
              authorUsername: comment.username ?? 'unknown',
              timestamp: comment.timestamp,
              igAccountId: this.igAccountId,
            });
          }
        }
      }
    } catch (err) {
      console.error('[facebook] pollIGComments error:', err);
    }
  }

  // ── Instagram DMs ────────────────────────────────────────────────────────

  private async pollIGDMs(seedOnly: boolean): Promise<void> {
    if (!this.igAccountId) return;

    try {
      const conversations = await igGetDMConversations(this.cfg!, this.igAccountId);

      for (const conv of conversations) {
        const messages = await igGetDMMessages(this.cfg!, conv.id, 5);

        for (const msg of messages) {
          if (this.seenIgDMIds.has(msg.id)) continue;
          this.seenIgDMIds.add(msg.id);

          // Skip our own replies
          if (msg.from?.id === this.igAccountId) continue;

          if (!seedOnly) {
            console.log(`[facebook] New IG DM from ${msg.from?.name}`);
            this.emit('social_ig_dm', {
              platform: 'instagram',
              conversationId: conv.id,
              messageId: msg.id,
              messageText: msg.message,
              senderId: msg.from?.id ?? '',
              senderName: msg.from?.name ?? 'Unknown',
              createdTime: msg.created_time,
              igAccountId: this.igAccountId,
            });
          }
        }
      }
    } catch (err) {
      console.error('[facebook] pollIGDMs error:', err);
    }
  }
}
