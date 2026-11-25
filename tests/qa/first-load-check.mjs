// The first screen on a fresh phone, many times over (user 11/25: create-check's "fresh phone opens 01" failed now and
// then, four times). Each run is create-check's own start: a new headless Chrome profile, 390×844, CPU 4× slower, the
// app opened once, then its storage cleared and opened again; 01 must show within 20 s. Every run keeps its console,
// exceptions, network (with whether the service worker answered) and, when it fails, a screenshot and the page state.
//   npm run build && node --experimental-websocket tests/qa/first-load-check.mjs [--runs 20] [--out <dir>] [--no-second]
// --no-second: only the very first visit (no clear-and-reopen), to tell the two apart. --no-net: no network log.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tempProfile, portFree, devtools, sleep } from './cdp.mjs';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const RUNS = Number(arg('--runs', 20)), OUT = arg('--out', join(tmpdir(), `arc-first-load-${Date.now()}`)), SECOND = !process.argv.includes('--no-second');
const NET = !process.argv.includes('--no-net'); // --no-net: as create-check, without the Network domain (it changes timing)
const PORT = 4332, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });
await portFree(PORT);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }

async function run(n) {
  const profile = tempProfile('arc-first-load');
  const chrome = spawn(CHROME, ['--headless=new', '--force-prefers-reduced-motion', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const log = { console: [], exceptions: [], net: [], marks: [] };
  const t0 = Date.now(), mark = what => log.marks.push([Date.now() - t0, what]);
  try {
    const dt = await devtools(profile);
    let targets; for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`${dt}/json`)).json(); break; } catch { await sleep(250); } }
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    let id = 0; const pending = new Map(), reqs = new Map();
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data), p = m.params, at = Date.now() - t0;
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Runtime.consoleAPICalled') log.console.push([at, p.type, p.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300)]);
      if (m.method === 'Runtime.exceptionThrown') log.exceptions.push([at, (p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).slice(0, 400)]);
      if (m.method === 'Network.requestWillBeSent') reqs.set(p.requestId, { at, url: p.request.url.replace(BASE, '/').slice(0, 120) });
      if (m.method === 'Network.responseReceived') { const r = reqs.get(p.requestId); if (r) log.net.push([r.at, at, p.response.status, p.response.fromServiceWorker ? 'sw' : p.response.fromDiskCache ? 'disk' : 'net', r.url]); }
      if (m.method === 'Network.loadingFailed') { const r = reqs.get(p.requestId); log.net.push([r?.at ?? at, at, 'FAILED ' + p.errorText, '', r?.url ?? '?']); }
    });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? undefined : r.result.result.value; };
    const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await sleep(100); } return null; };
    await send('Page.enable'); await send('Runtime.enable'); if (NET) await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const load = async url => { await ev('window.__arcLeft = true'); await send('Page.navigate', { url }); return waitFor(`!window.__arcLeft && document.readyState === 'complete'`, 20000); }; // as create-check
    mark('navigate'); await load(BASE); mark('first load complete');
    if (SECOND) { // create-check's fresh(): clear what the first visit stored, open again
      await ev(`localStorage.clear(); indexedDB.deleteDatabase('arc'); true`); mark('storage cleared');
      await load(`${BASE}?fresh=${Date.now()}`); mark('second load complete');
    }
    const ms = await waitFor(`location.hash === '#/start/1' && /Bring one question/.test(document.body.innerText)`, 20000);
    mark(ms == null ? '01 NOT shown in 20 s' : `01 shown after ${ms} ms`);
    const state = await ev(`({ hash: location.hash, ready: document.readyState, text: document.body.innerText.slice(0, 200), root: document.getElementById('root')?.innerHTML.length ?? -1,
      sw: navigator.serviceWorker?.controller ? 'controlled' : 'not controlled', device: localStorage.getItem('arc.device')?.slice(0, 120) ?? null })`);
    if (ms == null) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, `run-${n}.png`), Buffer.from(r.result.data, 'base64'));
    }
    writeFileSync(join(OUT, `run-${n}.json`), JSON.stringify({ ok: ms != null, ms, state, ...log }, null, 1));
    ws.close();
    return { ok: ms != null, ms, state };
  } finally { chrome.kill(); }
}

const results = [];
try {
  for (let n = 1; n <= RUNS; n++) {
    const r = await run(n);
    results.push(r);
    console.log(`${String(n).padStart(2)} ${r.ok ? 'ok  ' : 'FAIL'} ${r.ms ?? '-'} ms  ${r.ok ? '' : JSON.stringify(r.state)}`);
  }
} finally { try { process.kill(-server.pid); } catch {} }
const ok = results.filter(r => r.ok), times = ok.map(r => r.ms).sort((a, b) => a - b);
console.log(`${ok.length}/${results.length} showed 01 · median ${times[Math.floor(times.length / 2)] ?? '-'} ms · max ${times.at(-1) ?? '-'} ms · logs ${OUT}`);
process.exit(ok.length === results.length ? 0 : 1);
