/**
 * Jarvis Daemon Scheduler
 *
 * Fires time-based events independent of user activity:
 *   - Morning briefing at configurable time (default 08:00)
 *   - Post scheduler check every 5 minutes
 *   - n8n status sync every 10 minutes
 *
 * Reads schedule config from config.yaml heartbeat/marketing sections.
 * Emits events into the ObserverManager for reaction by the agent.
 */

import type { ObserverEventHandler } from '../observers/index.ts';

export type SchedulerConfig = {
  morningTime?: string;       // "HH:MM" 24h, e.g. "08:00"
  timezone?: string;          // e.g. "America/New_York"
  activeHoursStart?: number;  // hour 0-23
  activeHoursEnd?: number;    // hour 0-23
};

export class DaemonScheduler {
  private config: Required<SchedulerConfig>;
  private handler: ObserverEventHandler | null = null;

  private timers: Timer[] = [];
  private lastMorningDate: string | null = null;

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      morningTime: config.morningTime ?? '08:00',
      timezone: config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      activeHoursStart: config.activeHoursStart ?? 8,
      activeHoursEnd: config.activeHoursEnd ?? 23,
    };
  }

  onEvent(handler: ObserverEventHandler): void {
    this.handler = handler;
  }

  start(): void {
    console.log(`[scheduler] Starting — morning briefing at ${this.config.morningTime} ${this.config.timezone}`);

    // Check every 60 seconds for time-based triggers
    const minuteTimer = setInterval(() => this.tick(), 60_000);
    this.timers.push(minuteTimer);

    // Also fire immediately in case we're starting right at the trigger time
    this.tick();
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    console.log('[scheduler] Stopped');
  }

  private emit(type: string, data: Record<string, unknown> = {}): void {
    if (!this.handler) return;
    this.handler({ type, data, timestamp: Date.now() });
  }

  private tick(): void {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD

    // ── Morning briefing trigger ─────────────────────────────────────────
    const [mHour, mMin] = this.config.morningTime.split(':').map(Number);
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    const isMorningTime = currentHour === mHour && currentMin >= mMin && currentMin < mMin + 1;
    const alreadyFiredToday = this.lastMorningDate === todayStr;

    if (isMorningTime && !alreadyFiredToday) {
      this.lastMorningDate = todayStr;
      console.log(`[scheduler] 🌅 Firing morning briefing (${this.config.morningTime})`);
      this.emit('morning_briefing', {
        date: todayStr,
        time: this.config.morningTime,
        message: `Good morning Jacob! Starting your ${new Date().toLocaleDateString('en-US', { weekday: 'long' })} briefing.`,
      });
    }

    // ── Post scheduler (every 5 min) ─────────────────────────────────────
    if (currentMin % 5 === 0) {
      this.emit('post_scheduler_tick', { date: todayStr, hour: currentHour, minute: currentMin });
    }

    // ── n8n sync (every 10 min) ──────────────────────────────────────────
    if (currentMin % 10 === 0) {
      this.emit('n8n_sync_tick', { date: todayStr, hour: currentHour, minute: currentMin });
    }
  }

  /** Get the next morning briefing time as a Date object */
  getNextMorningTime(): Date {
    const [h, m] = this.config.morningTime.split(':').map(Number);
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next <= new Date()) next.setDate(next.getDate() + 1);
    return next;
  }
}
