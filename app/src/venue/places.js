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

/** The quickest route from an area to any of the place's targets → { r, name } (an elevator by its number), { same }
 * when you are already there, or null. */
export function routeToNearest(venue, labels, from, place, options = {}) {
  if (place.targets.includes(from)) return { same: true };
  let best = null;
  for (const t of place.targets) {
    const r = route(venue, from, t, options);
    if (r && (!best || r.minutes[1] < best.minutes[1] || (r.minutes[1] === best.minutes[1] && r.metres < best.metres))) best = r;
  }
  if (!best) return null;
  const n = place.facility === 'elevator' ? best.to.match(/elevator(\d+)/)?.[1] : null;
  return { r: best, name: n ? (labels.elevator ?? 'Elevator {n}').replace('{n}', n) : place.name };
}

/** Places for a search: a facility by its words, a fixed place or a programme room by its name. rooms: [{ key, name }]
 * (programme names, e.g. "P1 - Room 127"). → [{ id, name, hint }] */
export function searchPlaces(venue, edition, rooms, query, limit = 5) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  for (const [id, f] of Object.entries(FACILITIES)) if (f.words.includes(q)) out.push({ id, name: f.name, hint: 'Nearest' });
  for (const p of edition.places ?? []) if (p.name.toLowerCase().startsWith(q)) out.push({ id: p.id, name: p.name });
  const label = name => name.replace(/^[A-Z]\d - /, '');
  for (const r of rooms) {
    if (out.length >= limit) break;
    const area = edition.rooms?.[r.key];
    if (area && venue.areas[area]?.doors?.length && label(r.name).toLowerCase().split(/\s+/).some(w => w.startsWith(q))) out.push({ id: r.key, name: label(r.name), hint: area.split('-')[0] });
  }
  return out.slice(0, limit);
}
