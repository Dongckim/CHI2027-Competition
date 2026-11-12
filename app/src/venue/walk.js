// Walking minutes between two programme rooms (or a fixed place) for Today's card. Pure: node and phone.
// venue: data/venue/<venue>.json · edition: data/venue/<edition>.json (feed room key → area, places).
import { route } from './route.js';

export const REGISTRATION = 'place:registration'; // edition.places id, where the first walk of the day starts

const areaOf = (edition, key) => (key.startsWith('place:') ? edition.places?.find(p => `place:${p.id}` === key)?.area : edition.rooms?.[key]);

/** → [low, high] minutes, or null when the venue does not know one of the two (the caller keeps its guess). */
export function walkMinutes(venue, edition, fromKey, toKey, { wheelchair = false } = {}) {
  if (!venue || !edition) return null;
  const a = areaOf(edition, fromKey), b = areaOf(edition, toKey);
  if (!a || !b || !venue.areas[a] || !venue.areas[b]) return null;
  if (a === b) return [0, 0];
  return route(venue, a, b, { wheelchair })?.minutes ?? null;
}
