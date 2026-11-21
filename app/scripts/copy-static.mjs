// After `vite build`: copy what the app fetches at runtime and the bench pages into dist/, at the same paths as in the repo.
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sep } from 'node:path';

const EDITION = 'chi2026';
const from = p => new URL(`../../${p}`, import.meta.url);
// Full build files stay for the bench pages (tests/); the app itself reads app-data/.
const DATA = [...['meta', 'papers', 'sessions', 'rooms', 'topics'].map(f => `data/build/${EDITION}/${f}.json`), `data/build/app-data/${EDITION}/current.json`];
for (const f of DATA) if (!existsSync(from(f))) throw new Error(`${f} missing: run npm run data:fetch ${EDITION} && npm run data:build ${EDITION} first`);

for (const p of [...DATA, 'data/venue', 'tests']) cpSync(from(p), from(`dist/${p}`), { recursive: true });
// App data: only the current revision path, served at /app-data/<edition>/<path> (immutable cache, see vercel.json).
const current = JSON.parse(readFileSync(from(`data/build/app-data/${EDITION}/current.json`)));
cpSync(from(`data/build/app-data/${EDITION}/${current.path}`), from(`dist/app-data/${EDITION}/${current.path}`), { recursive: true });
// Bench pages import the plain JS modules and JSON under app/src; the app itself is bundled by Vite.
cpSync(from('app/src'), from('dist/app/src'), { recursive: true, filter: s => !/\.(tsx?|css)$/.test(s) });
console.log(`copied ${EDITION} data, app-data/${EDITION}/${current.path}, venue, tests and app/src modules into dist/`);

// The link preview picture (functions/og.mjs) says "5 talks · 4 rooms · Tue 14 · CHI 2026" (Figma OG frames 746:1913…):
// per talk its first day, room and whether it is a demo, from this edition's schedule. Written next to the function so the
// deploy's file tracing carries it; not in git (a build output).
{
  const sched = JSON.parse(readFileSync(from(`dist/app-data/${EDITION}/${current.path}schedule.json`)));
  const tz = JSON.parse(readFileSync(from(`data/venue/${EDITION}.json`))).timeZone;
  const day = ms => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric' }).format(ms).replace(',', '');
  const papers = {};
  for (const p of sched.papers) {
    const slot = [...(p.slots ?? [])].filter(x => x.start).sort((a, b) => a.start - b.start)[0];
    if (!slot) continue;
    papers[p.paperKey.split(':')[1]] = [day(slot.start), slot.roomKey ?? '', p.feedType === 'Interactive Demos' || p.type === 'demo' ? 1 : 0];
  }
  writeFileSync(from('functions/og-data.json'), JSON.stringify({ edition: EDITION, year: EDITION.replace(/\D/g, ''), papers }));
  console.log(`functions/og-data.json: ${Object.keys(papers).length} talks`);
}

// Service worker with this deploy's precache list: the page, its hashed JS/CSS/woff2/SVG (Final UI pictures), the whole
// app-data folder (schedule, every day's abstracts, people, topics, institutions, debut: what the engine and the Arc
// screens read, so a first visit works in airplane mode too, A4) and the venue graph with its names. The files are
// immutable-cached, so the worker mostly gets them from the browser's HTTP cache. Not the 3D view (view3d-*.js, with
// three.js): it loads when 09 opens, and the worker keeps it then.
export function precacheList(assets, appDataPath, venue, appDataFiles = ['schedule.json']) {
  return ['/', '/index.html', ...assets.filter(f => /\.(js|css|woff2|svg)$/.test(f) && !/^view3d-/.test(f)).sort().map(f => `/assets/${f}`),
    ...[...appDataFiles].sort().map(f => `/app-data/${EDITION}/${appDataPath}${f}`), `/data/venue/${EDITION}.json`, `/data/venue/${venue}.json`, `/data/venue/${venue}.labels.json`];
}
const appDataDir = from(`dist/app-data/${EDITION}/${current.path}`);
const appDataFiles = readdirSync(appDataDir, { recursive: true }).map(String).filter(f => f.endsWith('.json')).map(f => f.split(sep).join('/'));
const venueName = JSON.parse(readFileSync(from(`data/venue/${EDITION}.json`))).venue;
const precache = precacheList(readdirSync(from('dist/assets')), current.path, venueName, appDataFiles);
const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
writeFileSync(from('dist/sw.js'), readFileSync(from('app/sw.js'), 'utf8')
  .replace('self.__VERSION__', JSON.stringify(version)).replace('self.__PRECACHE__', JSON.stringify(precache)));
console.log(`sw.js: ${precache.length} files precached, version ${version}`);
