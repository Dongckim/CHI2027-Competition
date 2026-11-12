import { venueClock } from '../time.js';
import { localDay } from '../planner/plan.js';

// Venue-time labels for Explore, talk detail and author rows: "Tue", "Tue 14", "~11:36".
const fmt = (ms: number, timeZone: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en', { timeZone, ...o }).format(ms);
export const weekdayOf = (ms: number, tz: string) => fmt(ms, tz, { weekday: 'short' });
export const dateOf = (ms: number, tz: string) => `${weekdayOf(ms, tz)} ${fmt(ms, tz, { day: 'numeric' })}`;
export const clockOf = (ms: number, tz: string) => `~${venueClock(ms, tz)}`;
export const dayLabel = (day: string) => new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${day}T12:00:00Z`));
export const TYPE_TAG: Record<string, string> = { paper: 'PAPER', poster: 'POSTER', demo: 'DEMO', other: 'TALK' };

type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
// The first timed slot of a talk (null: not in the room programme, e.g. a journal paper shown online only).
export const firstSlot = (slots: Slot[]) => (slots.filter(s => s.start != null) as (Slot & { start: number })[]).sort((a, b) => a.start - b.start)[0] ?? null;
// Which abstracts/<day>.json holds a talk (data/scripts/app-data.mjs abstractDay): the venue day of its first timed slot.
export const abstractFileDay = (slots: Slot[], tz: string) => { const s = firstSlot(slots); return s ? localDay(s.start, tz) : 'unscheduled'; };
