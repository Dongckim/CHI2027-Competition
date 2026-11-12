// Does the venue data cover the programme? Feed floors[].roomIds against data/venue/<edition>.json (feed room → area,
// feed floor → level) and data/venue/<venue>.json (areas with doors). Pure checkVenue() for tests; the CLI reads the
// latest feed revision in data/raw/<edition>/.
// npm run data:venue:check [edition]   (default chi2026; exit 1 when something does not match)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** → list of problems (empty = all good). key(id) builds the app's room key, e.g. chi2026:12303. */
export function checkVenue(feed, edition, venue, key = id => `${edition.edition}:${id}`) {
  const errors = [];
  const roomName = new Map((feed.rooms ?? []).map(r => [r.id, r.name]));
  for (const floor of feed.floors ?? []) {
    const level = edition.floors?.[String(floor.id)];
    if (!level) { errors.push(`floor ${floor.id} "${floor.name}": no level in data/venue/${edition.edition}.json floors`); continue; }
    if (!venue.levels.some(l => l.id === level)) errors.push(`floor ${floor.id} "${floor.name}": level ${level} is not in ${venue.venue}.json`);
    for (const id of floor.roomIds ?? []) {
      const name = roomName.get(id) ?? `room ${id}`;
      const area = edition.rooms?.[key(id)];
      if (!area) { errors.push(`${name} (${key(id)}): not mapped to an area`); continue; }
      const a = venue.areas[area];
      if (!a) { errors.push(`${name}: area ${area} is not in ${venue.venue}.json`); continue; }
      if (a.level !== level) errors.push(`${name}: area ${area} is on ${a.level}, the feed puts the room on ${level} ("${floor.name}")`);
      if (!a.doors?.length) errors.push(`${name}: area ${area} has no door, so no route can reach it`);
    }
  }
  const onFloors = new Set((feed.floors ?? []).flatMap(f => f.roomIds ?? []).map(key));
  for (const k of Object.keys(edition.rooms ?? {})) if (!onFloors.has(k)) errors.push(`${k}: mapped in ${edition.edition}.json but on no feed floor`);
  for (const p of edition.places ?? []) if (!venue.areas[p.area]?.doors?.length) errors.push(`place ${p.id}: area ${p.area} missing or without a door`);
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const editionId = process.argv[2] ?? 'chi2026';
  const root = new URL('../', import.meta.url);
  const edition = JSON.parse(readFileSync(new URL(`venue/${editionId}.json`, root)));
  if (!edition.venue) { console.log(`${editionId}: no venue file yet, nothing to check`); process.exit(0); }
  const venue = JSON.parse(readFileSync(new URL(`venue/${edition.venue}.json`, root)));
  const raw = new URL(`raw/${editionId}/`, root);
  if (!existsSync(raw)) { console.error(`no data/raw/${editionId}: run npm run data:fetch ${editionId}`); process.exit(1); }
  const rev = readdirSync(raw).filter(f => /^rev-\d+\.json$/.test(f)).sort().at(-1);
  const feed = JSON.parse(readFileSync(new URL(rev, raw)));
  const errors = checkVenue(feed, edition, venue);
  const rooms = (feed.floors ?? []).reduce((n, f) => n + (f.roomIds?.length ?? 0), 0);
  if (errors.length) { console.error(`${editionId} (${rev}): ${errors.length} problem(s)\n` + errors.map(e => `  - ${e}`).join('\n')); process.exit(1); }
  console.log(`${editionId} (${rev}): ${feed.floors.length} floors, ${rooms} rooms, all on ${edition.venue}.json areas with doors, levels match`);
}
