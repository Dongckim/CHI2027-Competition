// The demo clock for the Arc (user decision, A3): outside the conference days ARC runs as on the second day at 10:00
// venue time, so Next / Ended / Today mean something, and a banner says so. `?at=2026-04-14T13:30` (venue time) wins.
// Pure decision + one start call; the clock itself is app/src/clock.js.
import { venueInstant } from '../time.js';

export const DEMO_MINUTES = 10 * 60;

/**
 * @param {{ days: string[], timeZone: string, now: number, at?: string | null }} o
 * @returns {{ ms: number, auto: boolean } | null} the demo instant, or null for the real clock
 */
export function demoInstant({ days, timeZone, now, at }) {
  const m = at?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (m) return { ms: venueInstant(m[1], Number(m[2]) * 60 + Number(m[3]), timeZone), auto: false };
  if (!days.length) return null;
  const first = venueInstant(days[0], 0, timeZone), end = venueInstant(days[days.length - 1], 24 * 60, timeZone);
  if (now >= first && now < end) return null; // the conference is on: the real clock
  return { ms: venueInstant(days[1] ?? days[0], DEMO_MINUTES, timeZone), auto: true };
}
