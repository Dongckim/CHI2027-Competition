// Walking time between two rooms, to eyeball data/venue/ccib.json.
// Usage: node tests/venue/try.mjs <from> <to> [--step-free] [--json] [--edition chi2026]
// A room is an area id (P1-111), a feed room key (chi2026:12303), a feed room name ("P1 - Room 111") or a short name (111, M215, "VIP Room").
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { route, stopsText } from '../../app/src/venue/route.js';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'step-free': { type: 'boolean', default: false }, json: { type: 'boolean', default: false }, edition: { type: 'string', default: 'chi2026' } },
});
if (positionals.length !== 2) { console.error('Usage: node tests/venue/try.mjs <from> <to> [--step-free] [--json] [--edition chi2026]'); process.exit(1); }

const read = path => JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url)));
const edition = read(`venue/${opt.edition}.json`);
const venue = read(`venue/${edition.venue}.json`);
let feedRooms = [];
try { feedRooms = read(`build/${opt.edition}/rooms.json`); } catch { /* names only; keys and area ids still work */ }

function resolve(q) {
  if (venue.areas[q]?.doors) return q;
  if (edition.rooms[q]) return edition.rooms[q];
  const low = q.toLowerCase();
  const byFeed = feedRooms.find(r => r.name.toLowerCase() === low);
  if (byFeed) return edition.rooms[byFeed.key];
  const hits = Object.entries(venue.areas).filter(([, a]) => a.doors && a.name.toLowerCase() === low);
  if (hits.length === 1) return hits[0][0];
  console.error(`no room "${q}"${hits.length ? `; several match: ${hits.map(h => h[0]).join(', ')}` : ''}`);
  process.exit(1);
}

const r = route(venue, resolve(positionals[0]), resolve(positionals[1]), { stepFree: opt['step-free'] });
if (opt.json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
if (!r) { console.log('no route'); process.exit(1); }
console.log(`${r.from} → ${r.to}${r.stepFree ? ' (step-free)' : ''}`);
console.log(`about ${r.minutes[0] === r.minutes[1] ? r.minutes[0] : r.minutes.join('–')} min · ${r.metres} m · Level ${r.levels.join(' → ')}`);
console.log(`  ${stopsText(r.stops)}`);
const guessed = r.path.filter(n => venue.nodes[n].estimate);
if (guessed.length) console.log(`  estimate (not measured on the plan): ${guessed.join(', ')}`);
