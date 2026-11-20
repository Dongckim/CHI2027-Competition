// Airplane-mode check (A4): a first visit, the service worker installs, then the server is switched off (a real offline:
// the page and the worker both lose the network). Reopened: 01, a new Arc from 07 → 12 (the mock engine reads the
// cached abstracts), 14 with its abstract, My Arcs. 390×844, CPU 4×.
// npm run build && node --experimental-websocket tests/arc/offline-check.mjs
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
const PORT = 4337, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9359', `--user-data-dir=${tmpdir()}/arc-offline-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9359/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 200)); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return !r.result || r.result.exceptionDetails ? undefined : r.result.result.value; };
const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await sleep(150); } return null; };
const out = {}, fails = [];
const check = (name, ok, detail) => { out[name] = { ok, ...detail }; if (!ok) fails.push(name); };
const click = text => ev(`(() => { const b = [...document.querySelectorAll('button, a')].find(b => b.innerText.trim() === ${JSON.stringify(text)} || b.getAttribute('aria-label') === ${JSON.stringify(text)}); if (!b) return 'missing'; b.click(); return 'clicked'; })()`);

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // first visit: 01 opens, the worker installs and keeps the precache list
  await send('Page.navigate', { url: BASE });
  await waitFor(`/Bring one question/.test(document.body.innerText)`);
  const installed = await waitFor(`navigator.serviceWorker.ready.then(async r => !!r.active && (await caches.keys()).length > 0 &&
    (await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).map(q => q.url)))).flat().filter(u => u.includes('/app-data/')).length >= 10)`, 60000);
  const cached = await ev(`caches.keys().then(async ks => (await Promise.all(ks.map(async k => (await caches.open(k)).keys()))).flat().length)`);
  check('first visit: the worker keeps the app and all app-data (abstracts, people, topics, debut)', installed != null, { cachedFiles: cached, ms: installed });

  // airplane mode: the server goes away
  try { process.kill(-server.pid); } catch {}
  await sleep(1000);
  const down = await fetch(BASE).then(() => false, () => true);
  await send('Page.navigate', { url: BASE + '?offline=1' });
  const opened = await waitFor(`/Bring one question/.test(document.body.innerText)`, 20000);
  check('offline: the app opens (01)', down && opened != null, { serverDown: down });
  await click('Skip');
  await waitFor(`location.hash === '#/home' && /Start with one question/.test(document.body.innerText)`); // the screen's chunk comes from the worker
  await click('New Arc');
  await waitFor(`location.hash === '#/ask' && !!document.querySelector('main input') && /Find my angles/.test(document.body.innerText)`);
  await ev(`(() => { const i = document.querySelector('main input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(i, 'haptic feedback'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await waitFor(`/Ready offline/.test(document.body.innerText)`, 30000);
  await click('Find my angles');
  const angles = await waitFor(`location.hash === '#/angles' && document.querySelectorAll('main section button[aria-pressed]').length >= 2`, 30000);
  await click('Next');
  await waitFor(`location.hash === '#/when' && /Build my Arc/.test(document.body.innerText)`);
  await click('Build my Arc');
  const hood = await waitFor(`location.hash.startsWith('#/hood/') && /YOU'RE IN/.test(document.body.innerText)`, 40000);
  await waitFor(`/See my Arc/.test(document.body.innerText)`);
  await click('See my Arc');
  const map = await waitFor(`location.hash.startsWith('#/arc/') && document.querySelectorAll('main button[aria-label*=" · "]').length >= 3`, 20000);
  check('offline: a new Arc from 07 to 12 with the cached programme', angles != null && hood != null && map != null, {});
  await ev(`document.querySelector('main button[aria-label*=" · "]').click()`);
  const talk = await waitFor(`location.hash.startsWith('#/talk/') && !!document.querySelector('main details') && /WHY IT/.test(document.body.innerText)`, 20000);
  const qa = await ev(`document.querySelector('section[aria-labelledby=qa]')?.innerText ?? ''`);
  check('offline: 14 with the abstract; Q&A says it needs the network', talk != null && /not available|need a connection/i.test(qa), { qa: qa.slice(0, 80) });
  await send('Page.navigate', { url: BASE + '?offline=2#/home' });
  check('offline: My Arcs lists it', (await waitFor(`document.querySelectorAll('main li a').length === 1`, 15000)) != null, {});
  check('no uncaught errors', errors.length === 0, { errors });
} catch (e) {
  fails.push(`stopped: ${e.message}`);
} finally {
  console.log(JSON.stringify(out, null, 2));
  console.log(fails.length ? `FAIL ${fails.length}: ${fails.join(' | ')}` : `PASS ${Object.keys(out).length}/${Object.keys(out).length}`);
  ws.close(); chrome.kill(); try { process.kill(-server.pid); } catch {}
  process.exit(fails.length ? 1 : 0);
}
