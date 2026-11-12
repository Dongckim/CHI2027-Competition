// Explore search speed on the real app data (data/build/app-data/<edition>/current path). Desktop node numbers;
// the phone check is the same code in headless Chrome with the CPU slowed (docs/stages/S4-explore.md).
// node tests/explore/bench.mjs ["query" ...]
import { readFileSync } from 'node:fs';
import { buildSearchIndex, searchTalks, searchPeople, searchSessions, placeOf } from '../../data/scripts/search.mjs';

const root = new URL('../../data/build/app-data/chi2026/', import.meta.url);
const { path } = JSON.parse(readFileSync(new URL('current.json', root)));
const read = f => JSON.parse(readFileSync(new URL(path + f, root)));
const data = { schedule: read('schedule.json'), people: read('people.json'), topics: read('topics.json'), aliases: read('institutions.json') };

let t = performance.now();
const index = buildSearchIndex(data);
const buildMs = performance.now() - t;
const queries = process.argv.slice(2).length ? process.argv.slice(2) : ['CMU', 'sensemaking', 'accessib', 'Carnegie Mellon', 'Korea', 'llm agents', 'a', 'zzzz'];
const out = { buildMs: +buildMs.toFixed(1), queries: {} };
for (const q of queries) {
  const runs = [];
  let r;
  for (let i = 0; i < 20; i++) { t = performance.now(); r = [searchTalks(index, q), searchPeople(index, q), searchSessions(index, q)]; runs.push(performance.now() - t); }
  runs.sort((a, b) => a - b);
  out.queries[q] = { talks: r[0].length, people: r[1].length, sessions: r[2].length, place: placeOf(index, q)?.label ?? null, medianMs: +runs[10].toFixed(2), maxMs: +runs.at(-1).toFixed(2) };
}
console.log(JSON.stringify(out, null, 2));
