// Print day routes for a candidate list, to eyeball the planner. The planner does not recommend:
// candidates come from the recommender (recsys/) or are picked by hand.
// Usage: node tests/planner/try.mjs <candidates.json> [--day 2026-04-14] [--wheelchair] [--edition chi2026]
// candidates.json: [{ "paperKey": "chi2026:223509", "relevance": 0.9 }, ...]  (relevance 0..1)
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { indexData, localDay, planDay, venueTravelMinutes } from '../../app/src/planner/plan.js';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { day: { type: 'string' }, wheelchair: { type: 'boolean', default: false }, edition: { type: 'string', default: 'chi2026' } },
});
if (positionals.length !== 1) { console.error('Usage: node tests/planner/try.mjs <candidates.json> [--day YYYY-MM-DD] [--wheelchair] [--edition chi2026]'); process.exit(1); }
const candidates = JSON.parse(readFileSync(positionals[0]));
const bad = Array.isArray(candidates) ? candidates.filter(c => typeof c?.paperKey !== 'string' || !(c.relevance >= 0 && c.relevance <= 1)) : [candidates];
if (bad.length) { console.error(`each item needs paperKey (string) and relevance (0..1): ${JSON.stringify(bad.slice(0, 3))}`); process.exit(1); }

const load = f => JSON.parse(readFileSync(new URL(`../../data/build/${opt.edition}/${f}.json`, import.meta.url)));
const data = { meta: load('meta'), papers: load('papers'), sessions: load('sessions'), rooms: load('rooms') };
const index = indexData(data);
const tz = data.meta.timeZone;
const venueFile = f => JSON.parse(readFileSync(new URL(`../../data/venue/${f}.json`, import.meta.url)));
const edition = venueFile(opt.edition);
// walking times from the floor plan when the edition has one (V6), otherwise the floor guess
const travelMinutes = edition.venue ? venueTravelMinutes(venueFile(edition.venue), edition) : undefined;

console.log(`${positionals[0]}: ${candidates.length} candidates, travel from ${edition.venue ?? 'floor guess'}`);

const time = ms => new Date(ms).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
const room = k => index.rooms.get(k)?.name ?? '?';
const title = k => { const p = index.papers.get(k); return `${p.title.slice(0, 70)}${p.video ? ' [video]' : ''}`; };
const days = opt.day ? [opt.day] : [...new Set(data.papers.flatMap(p => p.slots.filter(s => s.start != null).map(s => localDay(s.start, tz))))].sort();

for (const day of days) {
  const r = planDay(index, candidates, { day, wheelchair: opt.wheelchair, travelMinutes });
  console.log(`=== ${day} (${tz})${opt.wheelchair ? ' wheelchair' : ''}: ${r.stops.length} stops`);
  for (const s of r.stops) {
    if (s.travelFromPrevMin) console.log(`        ↓ walk ${s.travelFromPrevMin} min`);
    console.log(`  ${time(s.start)}-${time(s.end)}  ${room(s.roomKey).padEnd(22)} ${s.value.toFixed(2)}  ${title(s.paperKey)}  (${s.paperKey})`);
    for (const a of r.conflicts.find(c => c.paperKey === s.paperKey)?.alternatives || []) {
      console.log(`      or ${time(a.start)} ${room(a.roomKey).padEnd(22)} ${a.value.toFixed(2)}  ${title(a.paperKey)}`);
    }
  }
  console.log();
}
const skipped = planDay(index, candidates, { day: days[0], wheelchair: opt.wheelchair, travelMinutes }).skipped.filter(s => s.reason !== 'other-day');
if (skipped.length) console.log(`not routable: ${skipped.map(s => `${s.paperKey} (${s.reason})`).join(', ')}`);
