// npm run qa:auto — every headless check in one command (build first). A check passes when each failure it prints is in
// tests/qa/known-failures.json; anything else fails qa:auto with the screen and value the check printed.
//   npm run qa:auto [-- --no-build] [--only two-tabs,perf] [--deploy https://…]   (deploy: preview-check --public --expect-upstash)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { failuresOf } from './failures.mjs';

const args = process.argv.slice(2);
const arg = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const only = arg('--only')?.split(',');
const deploy = arg('--deploy');
const CHECKS = [
  ['two-tabs', 'tests/qa/two-tabs-check.mjs'],
  ['perf', 'tests/qa/perf-check.mjs'],
  ['requests', 'tests/qa/requests-check.mjs'],
  ['link', 'tests/qa/link-check.mjs'],
  ['press', 'tests/qa/press-check.mjs'],
  ['orb', 'tests/qa/orb-check.mjs'],
  ['webkit', 'tests/qa/webkit-check.mjs'], // Playwright WebKit (npx playwright install webkit once)
  ['cards', 'tests/qa/cards-check.mjs'], // 16 card paging: dots, arrow keys, WebKit touch swipe, desktop drag
  ['a11y', 'tests/arc/a11y-check.mjs'],
  ['create', 'tests/arc/create-check.mjs'],
  ['arc', 'tests/arc/arc-check.mjs'],
  ['share', 'tests/arc/share-check.mjs'],
  ['offline', 'tests/arc/offline-check.mjs'],
  ...(deploy ? [['deploy', 'tests/arc/preview-check.mjs', deploy, '--public', '--expect-upstash']] : []),
].filter(([n]) => !only || only.includes(n));
const known = JSON.parse(readFileSync(new URL('known-failures.json', import.meta.url), 'utf8')).known;

if (!args.includes('--no-build')) {
  console.log('build …');
  const b = spawnSync('npm', ['run', '-s', 'build'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (b.status) { console.error('build failed'); process.exit(1); }
}
const seen = new Set(), rows = [];
for (const [name, script, ...rest] of CHECKS) {
  const t = Date.now();
  const r = spawnSync('node', ['--experimental-websocket', script, ...rest], { encoding: 'utf8', timeout: 15 * 60_000, maxBuffer: 64 << 20 });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const fails = failuresOf(out, r.status ?? 1);
  const unknown = fails.filter(l => { const k = known.find(x => x.check === name && l.includes(x.match)); if (k) seen.add(k); return !k; });
  const status = unknown.length ? 'FAIL' : fails.length ? 'PASS (known)' : 'PASS';
  rows.push({ name, status, known: fails.length - unknown.length, unknown, s: Math.round((Date.now() - t) / 1000) });
  console.log(`${status.padEnd(12)} ${name.padEnd(9)} ${String(rows.at(-1).s).padStart(4)} s${fails.length - unknown.length ? `  ${fails.length - unknown.length} known` : ''}`);
  for (const u of unknown) console.log(`    ${u.slice(0, 300)}`);
  if (unknown.length) console.log(out.split('\n').filter(Boolean).slice(-25).map(l => `    | ${l.slice(0, 240)}`).join('\n'));
}
const stale = known.filter(k => CHECKS.some(([n]) => n === k.check) && !seen.has(k));
for (const k of stale) console.log(`note: known failure not seen any more (fixed? remove it from tests/qa/known-failures.json): ${k.check} "${k.match}"`);
const bad = rows.filter(r => r.status === 'FAIL');
console.log(bad.length ? `qa:auto FAIL: ${bad.map(r => r.name).join(', ')}` : `qa:auto PASS: ${rows.length} checks${rows.some(r => r.known) ? `, ${rows.reduce((n, r) => n + r.known, 0)} known failures (tests/qa/known-failures.json)` : ''}`);
process.exit(bad.length ? 1 : 0);
