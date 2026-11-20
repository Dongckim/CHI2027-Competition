// Performance budget (QA 2).
// - first screen JS+CSS (what dist/index.html loads), gzip -9: ≤ 100 KB, else fail
// - first visit on Slow 4G (Chrome DevTools preset: 150 ms RTT, 1.6 Mbps down, 750 kbps up) with CPU 4× slower:
//   time until 01 shows ("Bring one question", fail over 5 s), bytes until then, and every byte of the first visit
//   until the service worker has kept the app and its data (offline-ready)
// Results go to docs/validation/perf.json, per target (local | deploy): { current, previous }, compared with the previous run.
// Locally the bytes are what vite preview sends (gzip); pass --url <deploy> for what Vercel sends (brotli, CDN).
// npm run build && node --experimental-websocket tests/qa/perf-check.mjs [--url https://…] [--no-save]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { startServer, launchChrome, phone, reporter } from './cdp.mjs';

const BUDGET_KB = 100, BUDGET_01_MS = 5000;
const args = process.argv.slice(2);
const URL_ARG = args.includes('--url') ? args[args.indexOf('--url') + 1].replace(/\/+$/, '') + '/' : null;
const OUT = new URL('../../docs/validation/perf.json', import.meta.url);
const R = reporter('perf');

const html = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');
const first = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map(m => m[1]))];
const firstKB = first.reduce((n, f) => n + gzipSync(readFileSync(new URL(`../../dist${f}`, import.meta.url)), { level: 9 }).length, 0) / 1024;
R.check(`first screen JS+CSS gzip ≤ ${BUDGET_KB} KB`, firstKB <= BUDGET_KB, { kb: +firstKB.toFixed(1), files: first.length });

const server = URL_ARG ? null : await startServer(4363);
const base = URL_ARG ?? server.base;
const chrome = await launchChrome();
let code = 1, result = null;
try {
  const tab = await chrome.first();
  await phone(tab, { cpu: 4 });
  await tab.send('Network.enable');
  await tab.send('Network.setCacheDisabled', { cacheDisabled: false });
  await tab.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  let bytes = 0, requests = 0;
  tab.on('Network.loadingFinished', p => { bytes += p.encodedDataLength; requests++; });
  // the service worker's own fetches (precache) are another target: count them through the browser target
  const t0 = Date.now();
  await tab.send('Page.navigate', { url: `${base}#/start/1` });
  const ms01 = await tab.waitFor(`/Bring one question/.test(document.body.innerText)`, 30000);
  const navMs = await tab.ev(`Math.round(performance.now())`); // from this page's navigation start
  const bytes01 = bytes;
  const swReady = await tab.waitFor(`navigator.serviceWorker.ready.then(async r => !!r.active && (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0) >= 100)`, 180000);
  // everything the worker fetched, from the cache's responses (the page's Network domain does not see them)
  const swBytes = await tab.ev(`(async () => { let n = 0; for (const k of await caches.keys()) for (const q of await (await caches.open(k)).keys()) { const r = await (await caches.open(k)).match(q); n += (await r.clone().arrayBuffer()).byteLength; } return n; })()`);
  const shownMs = ms01 == null ? null : Math.min(navMs, Date.now() - t0);
  R.check(`01 shows within ${BUDGET_01_MS / 1000} s on Slow 4G, CPU 4×`, ms01 != null && shownMs <= BUDGET_01_MS, { ms: shownMs });
  R.check('first visit finishes (service worker keeps the app for offline)', swReady != null, { ms: swReady == null ? null : Date.now() - t0 });
  result = {
    at: new Date().toISOString().slice(0, 16), commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(), target: URL_ARG ? 'deploy' : 'local vite preview (gzip)',
    firstScreenKB: +firstKB.toFixed(1), shown01Ms: shownMs, bytesUntil01KB: Math.round(bytes01 / 1024), pageBytesKB: Math.round(bytes / 1024), pageRequests: requests,
    workerCacheKB: Math.round(swBytes / 1024), network: 'Slow 4G (150 ms, 1.6 Mbps down, 750 kbps up), CPU 4×',
  };
  console.log(JSON.stringify(result, null, 2));
  const key = URL_ARG ? 'deploy' : 'local';
  const file = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  if (file.current && !file.local) { file.local = { current: file.current, previous: file.previous ?? null }; delete file.current; delete file.previous; } // first format
  const prev = file[key]?.current ?? null;
  if (prev) for (const k of ['firstScreenKB', 'shown01Ms', 'bytesUntil01KB', 'pageBytesKB', 'workerCacheKB'])
    console.log(`  ${k}: ${prev[k]} → ${result[k]} (${result[k] - prev[k] >= 0 ? '+' : ''}${+(result[k] - prev[k]).toFixed(1)})`);
  if (!args.includes('--no-save')) {
    file._ = 'tests/qa/perf-check.mjs writes this: per target (local vite preview, deploy), the current and the previous run';
    file[key] = { current: result, previous: prev };
    writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
  }
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message}`);
  R.done();
} finally {
  await chrome.close(); server?.stop();
  process.exit(code);
}
