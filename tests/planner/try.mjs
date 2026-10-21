// Print a day route for a few keywords, to eyeball the planner.
// Usage: node tests/planner/try.mjs "screen reader accessibility" [--day 2026-04-14] [--wheelchair] [--edition chi2026] [--top 50]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { indexData, localDay, planDay } from '../../app/src/planner/plan.js';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { day: { type: 'string' }, wheelchair: { type: 'boolean', default: false }, edition: { type: 'string', default: 'chi2026' }, top: { type: 'string', default: '50' } },
});
const query = positionals.join(' ').toLowerCase();
if (!query) { console.error('Usage: node tests/planner/try.mjs "keywords" [--day YYYY-MM-DD] [--wheelchair] [--edition chi2026] [--top 50]'); process.exit(1); }

const load = f => JSON.parse(readFileSync(new URL(`../../data/build/${opt.edition}/${f}.json`, import.meta.url)));
const data = { meta: load('meta'), papers: load('papers'), sessions: load('sessions'), rooms: load('rooms') };
const index = indexData(data);
const tz = data.meta.timeZone;

// shortcut: keyword counting stands in for the recommender until V1 (#2).
const words = query.split(/\s+/).filter(w => w.length > 2);
const scored = data.papers.map(p => {
  const title = p.title.toLowerCase();
  const abs = (p.abstract || '').toLowerCase();
  return { paperKey: p.key, raw: words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (abs.includes(w) ? 1 : 0), 0) };
}).filter(x => x.raw > 0).sort((a, b) => b.raw - a.raw || (a.paperKey < b.paperKey ? -1 : 1)).slice(0, Number(opt.top));
const max = scored[0]?.raw || 1;
const candidates = scored.map(x => ({ paperKey: x.paperKey, relevance: x.raw / max }));
console.log(`"${query}": ${candidates.length} candidate papers (keyword match, top ${opt.top})\n`);

const time = ms => new Date(ms).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
const room = k => index.rooms.get(k)?.name ?? '?';
const title = k => { const p = index.papers.get(k); return `${p.title.slice(0, 70)}${p.video ? ' [video]' : ''}`; };
const days = opt.day ? [opt.day] : [...new Set(data.papers.flatMap(p => p.slots.filter(s => s.start != null).map(s => localDay(s.start, tz))))].sort();

for (const day of days) {
  const r = planDay(index, candidates, { day, wheelchair: opt.wheelchair });
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
const skipped = planDay(index, candidates, { day: days[0], wheelchair: opt.wheelchair }).skipped.filter(s => s.reason !== 'other-day');
if (skipped.length) console.log(`not routable: ${skipped.map(s => `${s.paperKey} (${s.reason})`).join(', ')}`);
