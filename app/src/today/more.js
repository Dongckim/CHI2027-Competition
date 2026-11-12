// Free time and "More for you" (03-2). Pure.
// A recommendation is offered for a free gap when its slot that day fits inside the gap with walking time to it from the
// stop before and to the stop after (the planner's own travel function). Removed talks are never offered; talks passed on
// in a PICK ONE are.
import { localDay } from '../planner/plan.js';

export const MIN_GAP_MIN = 10; // shorter gaps are not worth a row
const MIN = 60_000;

// Gaps between the day's bounds and its stops (time order). Each gap knows the stops around it (null at the ends).
export function freeGaps(stops, dayStart, dayEnd) {
  const gaps = [];
  let prev = null, from = dayStart;
  for (const s of [...stops, null]) {
    const to = s ? s.start : dayEnd;
    if (to - from >= MIN_GAP_MIN * MIN) gaps.push({ start: from, end: to, before: prev, after: s });
    if (s) { prev = s; from = Math.max(from, s.end); }
  }
  return gaps;
}

// Session bounds of a venue-local day (the day's first start, last end).
export function dayBounds(sessions, day, timeZone) {
  const on = sessions.filter(s => s.start != null && localDay(s.start, timeZone) === day);
  return on.length ? { start: Math.min(...on.map(s => s.start)), end: Math.max(...on.map(s => s.end)) } : null;
}

// → [{ paperKey, slot, gap }] sorted by relevance, then time. `only` = one gap (Free time view), else every gap of the day.
/** @typedef {{ start: number, end: number, before: { roomKey: string } | null, after: { roomKey: string } | null }} Gap */
/**
 * @param {{ index: { papers: Map<string, any>, rooms: Map<string, any> }, travelMinutes: Function, timeZone: string }} ctx
 * @param {{ paperKey: string, relevance: number }[]} candidates
 * @param {{ removed?: string[] } | null} edits
 * @param {{ day: string, wheelchair: boolean, stops: { paperKey: string, roomKey: string, start: number, end: number }[] }} dayPlan
 * @param {{ start: number, end: number } | null} bounds
 * @param {Gap | null} [only]
 */
export function moreForYou(ctx, candidates, edits, dayPlan, bounds, only = null) {
  const { index, travelMinutes, timeZone } = ctx;
  if (!bounds) return [];
  const planned = new Set(dayPlan.stops.map(s => s.paperKey));
  const removed = new Set(edits?.removed ?? []);
  const room = k => index.rooms.get(k);
  const walk = (a, b) => (a && b ? travelMinutes(room(a.roomKey), room(b.roomKey), { wheelchair: dayPlan.wheelchair }) : 0);
  const gaps = only ? [only] : freeGaps(dayPlan.stops, bounds.start, bounds.end);
  const out = [];
  for (const c of candidates) {
    if (planned.has(c.paperKey) || removed.has(c.paperKey)) continue;
    const paper = index.papers.get(c.paperKey);
    if (!paper?.scheduled) continue;
    for (const slot of paper.slots) {
      if (slot.start == null || localDay(slot.start, timeZone) !== dayPlan.day) continue;
      const gap = gaps.find(g => slot.start - walk(g.before, slot) * MIN >= g.start && slot.end + walk(slot, g.after) * MIN <= g.end);
      if (gap) { out.push({ paperKey: c.paperKey, slot, gap, relevance: c.relevance }); break; }
    }
  }
  return out.sort((a, b) => b.relevance - a.relevance || a.slot.start - b.slot.start);
}
