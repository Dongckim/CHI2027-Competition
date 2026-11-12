// After `vite build`: copy what the app fetches at runtime and the bench pages into dist/, at the same paths as in the repo.
import { cpSync, existsSync, readFileSync } from 'node:fs';

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
