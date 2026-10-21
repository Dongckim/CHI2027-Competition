// Match every institution name in data/raw to a ROR organization (https://ror.org, CC0) and cache it in
// data/curated/ror-cache.json (name -> ROR id | null) and ror-orgs.json (ROR id -> names).
// Only institution names from the public feed are sent. Cached names are never re-queried, so the
// build stays deterministic; delete an entry to re-match it.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { normalizeName } from './build.mjs';

const DATA = new URL('../', import.meta.url);
const CACHE = new URL('curated/ror-cache.json', DATA);
const ORGS = new URL('curated/ror-orgs.json', DATA);
// ROR allows 2000 requests / 5 min per IP (6.7/s); 4 workers with ~1 s responses stay well under it.
const WORKERS = 4;
const DELAY_MS = 250;

const readJson = async (url, fallback) => JSON.parse(await readFile(url).catch(() => JSON.stringify(fallback)));
const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const save = (cache, orgs) => Promise.all([
  writeFile(CACHE, JSON.stringify(sorted(cache), null, 1) + '\n'),
  writeFile(ORGS, JSON.stringify(sorted(orgs), null, 1) + '\n'),
]);

export function orgRecord(o) {
  const names = type => o.names.filter(n => n.types.includes(type)).map(n => n.value);
  return {
    name: names('ror_display')[0],
    acronyms: names('acronym'),
    aliases: names('alias'),
    labels: names('label'),
    country: o.locations?.[0]?.geonames_details?.country_name ?? null,
  };
}

// ROR's matcher sometimes picks an unrelated organization ("Purdue University" -> "Hue University of
// Education"). Keep a match only if a distinctive word of the feed name appears in one of the org's names.
const GENERIC = new Set(['university', 'universidad', 'universite', 'universitat', 'universita', 'universiteit', 'institute', 'institut',
  'technology', 'college', 'school', 'national', 'state', 'research', 'center', 'centre', 'science', 'sciences', 'and', 'the']);
const words = s => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !GENERIC.has(w));
export function plausible(feedName, org) {
  const names = [org.name, ...org.acronyms, ...org.aliases, ...org.labels];
  if (names.some(n => n.toLowerCase() === feedName.trim().toLowerCase())) return true;
  const own = new Set(names.flatMap(words));
  return words(feedName).some(w => own.has(w));
}

async function match(name) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://api.ror.org/v2/organizations?affiliation=${encodeURIComponent(name)}`);
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 2 ** attempt * 5000)); continue; }
    if (!res.ok) throw new Error(`ROR ${res.status} for ${name}`);
    return (await res.json()).items?.find(i => i.chosen)?.organization ?? null;
  }
  throw new Error(`ROR kept failing for ${name}`);
}

const cache = await readJson(CACHE, {});
const orgs = await readJson(ORGS, {});

// Most frequent raw spelling per normalized name is what gets sent.
const counts = new Map();
for (const e of (await readdir(new URL('raw/', DATA), { withFileTypes: true })).filter(d => d.isDirectory())) {
  const rev = (await readdir(new URL(`raw/${e.name}/`, DATA))).filter(f => /^rev-\d+\.json$/.test(f)).sort().at(-1);
  const feed = JSON.parse(await readFile(new URL(`raw/${e.name}/${rev}`, DATA)));
  for (const c of feed.contents) for (const a of c.authors || []) for (const f of a.affiliations || []) {
    const raw = f?.institution?.trim();
    if (!raw) continue;
    const k = normalizeName(raw);
    if (!counts.has(k)) counts.set(k, new Map());
    counts.get(k).set(raw, (counts.get(k).get(raw) || 0) + 1);
  }
}
// Re-check matches cached before the plausibility rule existed.
let rejected = 0;
for (const [k, m] of counts) {
  if (cache[k] && !plausible([...m].sort((a, b) => b[1] - a[1])[0][0], orgs[cache[k]])) { cache[k] = null; rejected++; }
}
if (rejected) console.log(`rejected ${rejected} implausible cached matches`);
const todo = [...counts].filter(([k]) => !(k in cache)).map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]);
console.log(`${counts.size} names, ${todo.length} to query`);

let done = 0;
const queue = todo.slice();
await Promise.all(Array.from({ length: WORKERS }, async () => {
  for (let item; (item = queue.shift());) {
    const [k, raw] = item;
    const org = await match(raw);
    const rec = org && orgRecord(org);
    cache[k] = rec && plausible(raw, rec) ? org.id : null;
    if (cache[k]) orgs[org.id] = rec;
    if (++done % 100 === 0) { await save(cache, orgs); console.log(`${done}/${todo.length}`); }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}));
// Organizations named by hand in data/curated/institutions.json (names ROR's matcher refuses).
const { ror: overrides = {} } = await readJson(new URL('curated/institutions.json', DATA), {});
for (const id of new Set(Object.values(overrides).flatMap(v => (typeof v === 'string' ? [v] : Object.values(v))))) {
  if (orgs[id]) continue;
  const res = await fetch(`https://api.ror.org/v2/organizations/${id.split('/').pop()}`);
  if (!res.ok) throw new Error(`ROR ${res.status} for ${id}`);
  orgs[id] = orgRecord(await res.json());
}
await save(cache, orgs);
const matched = Object.values(cache).filter(Boolean).length;
console.log(`done: ${matched}/${Object.keys(cache).length} names matched to ${Object.keys(orgs).length} organizations`);
