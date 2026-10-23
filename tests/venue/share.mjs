// Build a single self-contained page from bench.html (route.js and the venue data inlined), to share without a server.
// Usage: node tests/venue/share.mjs <out.html>   (needs npm run data:build for room names)
import { readFileSync, writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) { console.error('Usage: node tests/venue/share.mjs <out.html>'); process.exit(1); }
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const page = read('tests/venue/bench.html');
const between = (a, b) => { const i = page.indexOf(a), j = page.indexOf(b, i); if (i < 0 || j < 0) throw new Error(`bench.html: no ${a}…${b}`); return page.slice(i, j + b.length); };
const title = between('<title>', '</title>');
const style = between('<style>', '</style>');
let body = page.slice(page.indexOf('<body>') + 6, page.indexOf('</body>'));

const edition = JSON.parse(read('data/venue/chi2026.json'));
const data = {
  'venue/chi2026.json': edition,
  [`venue/${edition.venue}.json`]: JSON.parse(read(`data/venue/${edition.venue}.json`)),
  // only the names of the rooms the page lists
  'build/chi2026/rooms.json': JSON.parse(read('data/build/chi2026/rooms.json')).map(r => ({ key: r.key, name: r.name })),
};
const routeSource = read('app/src/venue/route.js').replace(/^export /gm, '');

const swaps = [
  ["import { route } from '../../app/src/venue/route.js';", routeSource],
  ["const get = path => fetch(`../../data/${path}`).then(r => (r.ok ? r.json() : null));",
    `const DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};\nconst get = async path => DATA[path] ?? null;`],
];
for (const [from, to] of swaps) {
  if (!body.includes(from)) throw new Error(`bench.html changed: cannot find ${from.slice(0, 50)}`);
  body = body.replace(from, () => to);
}
writeFileSync(out, `${title.replace('Venue bench', 'ARC Getting There')}\n<meta name="claude:viewport-fit-sides" content="cover">\n${style}\n${body.trim()}\n`);
console.log(`${out}: ${(Buffer.byteLength(readFileSync(out)) / 1024).toFixed(0)} KB`);
