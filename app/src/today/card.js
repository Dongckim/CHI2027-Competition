// The big card at the top of Today: which stop it shows and in which state, for a given instant. Pure, no clock inside:
// callers pass `now` from app/src/clock.ts (the one place that reads the time).
//
// Rule (first match wins), for the day's stops in time order:
//   no stops                              → empty
//   start ≤ now < end of a stop           → now        (that stop; "Talk i of n · ~m min in")
//   now ≥ end of the last stop            → done
//   now ≥ leaveAt(next stop)              → leave      (dark card, "Starts in ~m min")
//   next stop is the day's first stop     → first      ("FIRST STOP")
//   otherwise                             → next
// leaveAt = start − walk (slow end) − buffer.

// shortcut: fake walking times until S5 reads the venue route (stop.travelFromPrevMin / route()); then use the real range.
export const WALK_MIN = [2, 4];
export const FIRST_WALK_MIN = [3, 5]; // from registration to the first room
export const LEAVE_BUFFER_MIN = 5;
const MIN = 60_000;

export const leaveAt = (stop, walkMax = WALK_MIN[1]) => stop.start - (walkMax + LEAVE_BUFFER_MIN) * MIN;

export function dayCard(stops, now) {
  const total = stops.length;
  const done = stops.filter(s => s.end <= now).length;
  if (!total) return { kind: 'empty', done, total };
  const current = stops.find(s => s.start <= now && now < s.end);
  if (current) return { kind: 'now', stop: current, done, total, minutesIn: Math.floor((now - current.start) / MIN) };
  if (now >= stops[total - 1].end) return { kind: 'done', done, total };
  const next = stops.find(s => s.start > now);
  const first = next === stops[0];
  const lead = first ? FIRST_WALK_MIN[1] : WALK_MIN[1];
  if (now >= leaveAt(next, lead)) return { kind: 'leave', stop: next, done, total, startsInMin: Math.ceil((next.start - now) / MIN) };
  return { kind: first ? 'first' : 'next', stop: next, done, total };
}

// Rows under the card: the stops after the one on the card (all of them when the card shows none).
export const laterStops = (stops, card) => (card.stop ? stops.filter(s => s.start > card.stop.start) : card.kind === 'done' ? [] : stops);

// Where a talk sits in its session, from the data's own talk times (no fixed talk length).
// sessionSlots: Map sessionKey → slots sorted by start. Block sessions (posters, demos) have no order → null.
export function talkPosition(stop, sessionSlots, timing) {
  if (timing !== 'talks') return null;
  const slots = sessionSlots.get(stop.sessionKey) ?? [];
  const i = slots.findIndex(s => s.paperKey === stop.paperKey && s.start === stop.start);
  return i < 0 ? null : { index: i + 1, count: slots.length, missed: i };
}

export function sessionSlotsFrom(papers) {
  const m = new Map();
  for (const p of papers) for (const s of p.slots) if (s.start != null) (m.get(s.sessionKey) ?? m.set(s.sessionKey, []).get(s.sessionKey)).push({ paperKey: p.paperKey ?? p.key, start: s.start });
  for (const list of m.values()) list.sort((a, b) => a.start - b.start || (a.paperKey < b.paperKey ? -1 : 1));
  return m;
}
