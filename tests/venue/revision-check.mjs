// Phone check: 09's 3D plan survives its route changing while it is open. Starts and stops its own vite preview.
// npm run build && node --experimental-websocket tests/venue/revision-check.mjs
//   - in place: 09 for one talk → 09 for another (same screen, new route) → the plan draws the new route
//   - a new programme revision arrives while 09 is open (version.json says revision 2; the revision file is held back
//     until the plan has drawn, then let through) → the plan draws again, the WebGL context is not lost
// The feed is faked with the Fetch domain (the service worker is bypassed so every request is seen). Exit code 1 on a fail.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const PORT = 4323, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9340', `--user-data-dir=${tmpdir()}/arc-rev-${Date.now()}`, '--no-first-run', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9340/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [], paused = [];
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const feedBody = readFileSync(new URL('../../data/raw/chi2026/rev-001.json', import.meta.url)).toString('base64');
const json = { responseCode: 200, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Content-Type', value: 'application/json' }] };
let holdRevision = true;
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 200));
  if (m.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = m.params;
  if (/\/version\.json/.test(request.url)) {
    const body = Buffer.from(JSON.stringify({ edition: 'chi2026', revision: 2, revision_url: 'https://chidigitalexperience.org/data/chi2026/revisions/002.json' })).toString('base64');
    send('Fetch.fulfillRequest', { requestId, ...json, body });
  } else if (/revisions\/002\.json/.test(request.url)) {
    const release = () => send('Fetch.fulfillRequest', { requestId, ...json, body: feedBody });
    if (holdRevision) paused.push(release); else release();
  } else send('Fetch.continueRequest', { requestId });
});
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? undefined : r.result.result.value; };
const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await sleep(100); } return null; };
const canvas = `document.querySelector('section[aria-label="Floor plan"] canvas')`;
const plan = `(() => { const c = ${canvas}, s = document.querySelector('section[aria-label="Floor plan"]');
  return { frames: Number(c?.dataset.frames ?? 0), lost: !!(c?.getContext('webgl2') ?? c?.getContext('webgl'))?.isContextLost?.(), failed: /cannot be shown/.test(s?.innerText ?? '') }; })()`;
const out = {}, fails = [];
const check = (name, ok, detail) => { out[name] = { ok, ...detail }; if (!ok) fails.push(name); };

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Network.enable'); await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });

  // In place: one talk's 09, then another's, without leaving the screen.
  await send('Page.navigate', { url: BASE + '#/sample' });
  await waitFor(`!!document.querySelector('a[href^="#/directions/"]')`);
  const href = await ev(`document.querySelector('a[href^="#/directions/"]').getAttribute('href')`);
  await ev(`location.hash = ${JSON.stringify(href)}`);
  await waitFor(`Number(${canvas}?.dataset.frames ?? 0) > 0`, 30000);
  await ev(`location.hash = '#/directions/chi2026:214894'`);
  await waitFor(`/Auditorium/.test(document.body.innerText)`, 10000); await sleep(2000);
  const inPlace = await ev(plan);
  check('route changes in place: the plan draws again', !inPlace.failed && !inPlace.lost && inPlace.frames > 0, inPlace);

  // A new revision while 09 is open: held until the plan has drawn, then let through.
  await send('Page.navigate', { url: BASE + '#/sample' }); await send('Page.reload');
  await waitFor(`!!document.querySelector('a[href^="#/directions/"]')`);
  await ev(`location.hash = ${JSON.stringify(href)}`);
  await waitFor(`Number(${canvas}?.dataset.frames ?? 0) > 0`, 30000);
  const asked = await waitFor(`false`, 1500) ?? paused.length; // give the update check its moment
  const before = await ev(plan);
  holdRevision = false; paused.splice(0).forEach(f => f());
  await sleep(6000);
  const after = await ev(plan);
  check('new revision while 09 is open: the plan draws again', asked > 0 && !after.failed && !after.lost && after.frames > 0, { revisionRequests: asked, before, after });
  out.pageErrors = errors;
  if (errors.length) fails.push('page errors');
} catch (e) {
  fails.push(`stopped: ${e.message}`);
} finally {
  console.log(JSON.stringify(out, null, 2));
  console.log(fails.length ? `FAIL: ${fails.join(', ')}` : 'PASS: all checks');
  ws.close(); chrome.kill(); process.kill(-server.pid);
  process.exitCode = fails.length ? 1 : 0;
}
