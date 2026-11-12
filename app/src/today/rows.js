// Today screen model: planner day + RecommendResponse → rows with one tag each. Pure, no I/O.
// Tag priority: PICK ONE (planner found talks at the same time) > TRY NEW (band is not near) > content type.
import { localDay } from '../planner/plan.js';

const TYPE_TAG = { paper: 'PAPER', poster: 'POSTER', demo: 'DEMO', other: 'TALK' };

export const candidatesFrom = response => response.items.map(({ paperKey, relevance }) => ({ paperKey, relevance }));

/** @returns {{ paperKey: string, roomKey: string, start: number, end: number, travelMin: number, tag: string, pickOf: number }[]} */
export function todayRows(plan, response) {
  const items = new Map(response.items.map(i => [i.paperKey, i]));
  const together = new Map(plan.conflicts.map(c => [c.paperKey, c.alternatives.length + 1]));
  return plan.stops.map(s => {
    const item = items.get(s.paperKey);
    const pickOf = together.get(s.paperKey) ?? 0;
    const tag = pickOf ? 'PICK ONE' : item && item.band !== 'near' ? 'TRY NEW' : TYPE_TAG[item?.type] ?? 'TALK';
    return { paperKey: s.paperKey, roomKey: s.roomKey, start: s.start, end: s.end, travelMin: s.travelFromPrevMin, tag, pickOf };
  });
}

// Conference days in venue-local YYYY-MM-DD, from session starts.
export const conferenceDays = (sessions, timeZone) =>
  [...new Set(sessions.filter(s => s.start != null).map(s => localDay(s.start, timeZone)))].sort();
