// Places that are not talks, for 09 opened by place (#/directions/place/<id>) and for 05 search: the programme's rooms,
// the edition's fixed places (Registration), and the nearest WC or elevator. Pure: node and phone. Names come from the
// data files only (data/venue/<edition>.json, <venue>.labels.json).
import { route } from './route.js';

// Facilities found by the words people use. All of a kind on the plan are candidates; the quickest to reach wins.
export const FACILITIES = {
  wc: { kind: 'wc', name: 'WC', words: ['wc', 'toilet', 'toilets', 'restroom', 'restrooms', 'bathroom', 'bathrooms'] },
  elevator: { kind: 'elevator', name: 'Elevator', words: ['elevator', 'elevators', 'lift', 'lifts'] },
};

/** id → { name, targets: area or point ids } or null. id: an edition place ('registration'), a programme room key, or a
 * facility ('wc', 'elevator'). roomName(key) gives a room's programme name. */
export function placeTargets(venue, labels, edition, id, roomName = key => key) {
  const fixed = edition.places?.find(p => p.id === id);
  if (fixed) return venue.areas[fixed.area] ? { name: fixed.name, targets: [fixed.area] } : null;
  const f = FACILITIES[id];
  if (f) {
    const targets = Object.keys(venue.nodes).filter(k => venue.nodes[k].kind === f.kind && !venue.nodes[k].estimate && venue.nodes[k].x != null);
    return targets.length ? { name: f.name, targets, facility: id } : null;
  }
  const area = edition.rooms?.[id];
  return area && venue.areas[area]?.doors?.length ? { name: roomName(id), targets: [area] } : null;
}

/** The quickest route (by seconds) from an area to any of the place's targets → { r, name } (an elevator by its number), { same }
 * when you are already there, or null. */
export function routeToNearest(venue, labels, from, place, options = {}) {
  if (place.targets.includes(from)) return { same: true };
  // Compare by seconds, not the rounded minutes: a ride adds time but no metres, so minutes tie and a lift down to another
  // level would win on metres. A tie in seconds: your own level first, then fewer metres.
  const level = venue.areas[from]?.level ?? venue.nodes[from]?.level;
  const better = (r, b) => r.seconds[1] - b.seconds[1] || (venue.nodes[b.to]?.level === level) - (venue.nodes[r.to]?.level === level) || r.metres - b.metres;
  let best = null;
  for (const t of place.targets) {
    const r = route(venue, from, t, options);
    if (r && (!best || better(r, best) < 0)) best = r;
  }
  if (!best) return null;
  const n = place.facility === 'elevator' ? best.to.match(/elevator(\d+)/)?.[1] : null;
  return { r: best, name: n ? (labels.elevator ?? 'Elevator {n}').replace('{n}', n) : place.name };
}

/** Places for a search → [{ id, name, hint }]. A facility by its words ("toilet", "wc", "lift"); a fixed place or a
 * programme room by its name, every word of the query matching a word of the name ("Room 127", "Entrance Hall"): words by
 * their start, numbers only whole ("12" is not Room 127). Three letters at least, so a short topic ("AR") finds none.
 * Programme rooms on one venue area are one row, named by labels.areas ("Exhibit Hall (Areas 1–3)"). rooms: [{ key, name }]
 * with the programme's names ("P1 - Room 127"). */
export function searchPlaces(venue, labels, edition, rooms, query, limit = 5) {
  const q = query.trim().toLowerCase();
  const out = [];
  for (const [id, f] of Object.entries(FACILITIES)) if (f.words.includes(q)) out.push({ id, name: f.name, hint: 'Nearest' });
  if (q.length < 3) return out;
  const words = text => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const qs = words(q);
  const matches = text => { const ws = words(text); return qs.every(t => (/\d/.test(t) ? ws.includes(t) : ws.some(w => w.startsWith(t)))); };
  for (const p of edition.places ?? []) if (matches(p.name)) out.push({ id: p.id, name: p.name });
  const label = name => name.replace(/^[A-Z]\d - /, ''); // "P1 - Room 127" → "Room 127"
  const byArea = new Map(); // one row per venue area: its programme rooms' names all count
  for (const r of rooms) {
    const area = edition.rooms?.[r.key];
    if (!area || !venue.areas[area]?.doors?.length) continue;
    if (!byArea.has(area)) byArea.set(area, { id: r.key, names: [] });
    byArea.get(area).names.push(label(r.name));
  }
  for (const [area, g] of byArea) {
    if (out.length >= limit) break;
    const name = labels.areas?.[area] ?? (g.names.length === 1 ? g.names[0] : null);
    if (!name || ![name, ...g.names].some(matches)) continue;
    out.push({ id: g.id, name, hint: venue.areas[area].level });
  }
  return out.slice(0, limit);
}
