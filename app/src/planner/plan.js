// Day route planner. Runs on the phone: pure, synchronous, no I/O.
// Input is internal until contracts/Route and RecommendResponse are designed; adapt at the edges.
//
// data: { meta, papers, sessions, rooms } from data/build/<edition>/
// candidates: [{ paperKey, relevance }]  (relevance 0..1, e.g. from RecommendResponse)
// options: { day: 'YYYY-MM-DD' (venue local), wheelchair, travelMinutes, travelCostPerMin }

import { route } from '../venue/route.js';

export const VALUE_WITH_VIDEO = 0.5; // a talk you can watch later is worth less in person
export const TRAVEL_COST_PER_MIN = 0.01; // 5 minutes of walking ≈ 0.05 relevance

// Floor-level guess, for editions without a venue graph and rooms the venue file does not map.
export function defaultTravelMinutes(a, b, { wheelchair = false } = {}) {
  if (!a || !b || a.key === b.key) return 0;
  const walk = a.floor && a.floor === b.floor ? 4 : 7;
  return wheelchair ? Math.ceil(walk * 1.5) + 3 : walk;
}

// Travel minutes from the venue graph (V6): the slow end of the range, so every move the planner allows can be made.
// venue: data/venue/<venue>.json, edition: data/venue/<edition>.json (its rooms map feed room keys to area ids).
export function venueTravelMinutes(venue, edition) {
  const memo = new Map(); // the planner asks for the same room pairs many times
  return (a, b, options = {}) => {
    if (!a || !b || a.key === b.key) return 0;
    const from = edition.rooms?.[a.key], to = edition.rooms?.[b.key];
    if (!from || !to) return defaultTravelMinutes(a, b, options);
    const k = `${from}|${to}|${!!options.wheelchair}`;
    if (!memo.has(k)) memo.set(k, from === to ? 0 : route(venue, from, to, options)?.minutes[1] ?? defaultTravelMinutes(a, b, options));
    return memo.get(k);
  };
}

const dayFormatters = new Map();
export function localDay(ms, timeZone) {
  if (!dayFormatters.has(timeZone)) dayFormatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  return dayFormatters.get(timeZone).format(ms);
}

export function indexData({ meta, papers, sessions, rooms }) {
  return {
    timeZone: meta.timeZone,
    papers: new Map(papers.map(p => [p.key, p])),
    sessions: new Map(sessions.map(s => [s.key, s])),
    rooms: new Map(rooms.map(r => [r.key, r])),
  };
}

const order = (a, b) => a.end - b.end || a.start - b.start || (a.paperKey < b.paperKey ? -1 : a.paperKey > b.paperKey ? 1 : 0) || (a.sessionKey < b.sessionKey ? -1 : 1);

export function planDay(index, candidates, options) {
  const { day, wheelchair = false, travelMinutes = defaultTravelMinutes, travelCostPerMin = TRAVEL_COST_PER_MIN } = options;
  const skipped = [];
  const items = [];
  const seen = new Set();
  for (const { paperKey, relevance } of candidates) {
    if (seen.has(paperKey)) continue;
    seen.add(paperKey);
    const paper = index.papers.get(paperKey);
    if (!paper) { skipped.push({ paperKey, reason: 'unknown' }); continue; }
    if (!paper.scheduled) { skipped.push({ paperKey, reason: 'unscheduled' }); continue; }
    const slots = paper.slots.filter(s => s.start != null && localDay(s.start, index.timeZone) === day);
    if (!slots.length) { skipped.push({ paperKey, reason: 'other-day' }); continue; }
    const value = relevance * (paper.video ? VALUE_WITH_VIDEO : 1);
    for (const s of slots) items.push({ paperKey, sessionKey: s.sessionKey, roomKey: s.roomKey, start: s.start, end: s.end, value });
  }
  items.sort(order);

  const room = k => index.rooms.get(k);
  const travel = (a, b) => travelMinutes(room(a.roomKey), room(b.roomKey), { wheelchair });

  // Weighted interval scheduling: best[i] = best route ending with item i.
  // A move is possible only if the previous talk ends early enough to walk to the next room.
  const best = new Array(items.length);
  const prev = new Array(items.length).fill(-1);
  for (let i = 0; i < items.length; i++) {
    best[i] = items[i].value;
    for (let j = 0; j < i; j++) {
      const t = travel(items[j], items[i]);
      if (items[j].end + t * 60000 > items[i].start) continue;
      const v = best[j] + items[i].value - travelCostPerMin * t;
      if (v > best[i] + 1e-12) { best[i] = v; prev[i] = j; }
    }
  }
  let last = -1;
  for (let i = 0; i < items.length; i++) if (best[i] > 0 && (last < 0 || best[i] > best[last] + 1e-12)) last = i;

  const chosen = [];
  for (let i = last; i >= 0; i = prev[i]) chosen.unshift(i);
  // A paper presented twice that day (posters) is kept once; dropping a stop never breaks travel times.
  const once = new Set();
  const stops = [];
  for (const i of chosen) {
    if (once.has(items[i].paperKey)) continue;
    once.add(items[i].paperKey);
    const before = stops.at(-1);
    stops.push({ ...items[i], travelFromPrevMin: before ? travel(before, items[i]) : 0 });
  }

  const inRoute = new Set(stops.map(s => s.paperKey));
  const conflicts = stops.map(stop => ({
    paperKey: stop.paperKey,
    alternatives: items
      .filter(it => !inRoute.has(it.paperKey) && it.start < stop.end && stop.start < it.end)
      .sort((a, b) => b.value - a.value || order(a, b))
      .filter((it, i, arr) => arr.findIndex(x => x.paperKey === it.paperKey) === i)
      .slice(0, 2),
  })).filter(c => c.alternatives.length);

  return { day, timeZone: index.timeZone, wheelchair, stops, conflicts, skipped };
}
