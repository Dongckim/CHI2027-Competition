// Explore offline after one visit (S4): open Today (the sample day) online, wait until the idle prefetch put
// people.json, institutions.json and topics.json in the service worker cache, stop the server (= airplane mode for
// the app), reload on #/explore and search "CMU". Also checks "CMU = … · Other CMUs" → the filter screen's list.
// npm run build && node --experimental-websocket tests/explore/offline-check.mjs   (starts and stops its own vite preview)
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
// Talks for the abstract checks, from the built app data: the sample day's planned talk (Tue 14), a talk whose
// abstract file is another day (not prefetched), and a talk with no abstract in the programme.
const appData = new URL('../../data/build/app-data/chi2026/', import.meta.url);
const { path: dataPath } = JSON.parse(readFileSync(new URL('current.json', appData)));
const abstractsOf = day => JSON.parse(readFileSync(new URL(`${dataPath}abstracts/${day}.json`, appData)));
const PLANNED = 'chi2026:221879'; // first item of the sample day's recommendations, on 2026-04-14
const OTHER_DAY = Object.keys(abstractsOf('2026-04-16')).find(k => abstractsOf('2026-04-16')[k]);
const NO_ABSTRACT = Object.entries(abstractsOf('2026-04-13')).find(([, a]) => !a)[0];
const PORT = 4318, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const startServer = () => spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) return; } catch {} await sleep(250); } throw new Error('preview did not start'); };
let server = startServer();
await up();
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${tmpdir()}/arc-offline-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9334/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (process.env.DEBUG && (m.method === 'Runtime.exceptionThrown' || m.method === 'Log.entryAdded' || m.method === 'Runtime.consoleAPICalled')) console.error(JSON.stringify(m.params).slice(0, 400)); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return Date.now() - t; await sleep(100); } throw new Error('timeout: ' + expr); };
const type = (sel, text) => ev(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
// Tabs show no counts (Figma v3): the rows of each tab, "30+" = more behind "Show 30 more".
const tabs = () => ev(`(async () => { const out = []; const btns = [...document.querySelectorAll('[aria-label=Show] button')]; if (!btns.length) return ['no tabs'];
  const was = btns.find(b => b.getAttribute('aria-pressed') === 'true');
  for (const b of btns) { b.click(); await new Promise(r => setTimeout(r, 150)); const rows = document.querySelectorAll('main ul > li').length; const more = [...document.querySelectorAll('main button')].some(x => /^Show \\d+ more$/.test(x.innerText));
    out.push(\`\${b.innerText.trim()} \${rows}\${more ? '+' : ''}\`); }
  was?.click(); await new Promise(r => setTimeout(r, 150)); return out; })()`);
const out = {};
const abstractText = () => ev(`[...document.querySelectorAll('main section')].find(x => x.innerText.startsWith('Abstract'))?.innerText.split('\\n').slice(1).join(' ').slice(0, 80) ?? null`);
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // Fresh phone, online: open only Today (the sample day). Explore has never been opened, so the search files can only
  // come from the idle prefetch.
  await send('Page.navigate', { url: BASE + '#/sample' });
  await waitFor(`document.body.innerText.includes('Preview')`);
  out.exploreFilesFetchedWhileOnlyTodayOpen = await ev(`[...performance.getEntriesByType('resource')].filter(e => /(people|institutions|topics)\\.json/.test(e.name)).length`);
  out.prefetchMs = await waitFor(`(async () => { if (!navigator.serviceWorker.controller) return false;
    const path = [...performance.getEntriesByType('resource')].map(e => e.name).find(n => n.includes('/schedule.json'))?.replace(/schedule\\.json$/, '');
    if (!path) return false;
    return (await Promise.all(['people.json', 'institutions.json', 'topics.json'].map(f => caches.match(path + f)))).every(Boolean); })()`, 30000);

  out.abstractPrefetched = await waitFor(`(async () => { const path = [...performance.getEntriesByType('resource')].map(e => e.name).find(n => n.includes('/schedule.json'))?.replace(/schedule\\.json$/, '');
    return !!(await caches.match(path + 'abstracts/2026-04-14.json', { ignoreVary: true })) && !(await caches.match(path + 'abstracts/2026-04-16.json', { ignoreVary: true })); })()`, 30000).then(() => true, () => false);
  // Online: a talk with no abstract in the programme.
  await send('Page.navigate', { url: BASE + '#/talk/' + NO_ABSTRACT });
  await waitFor(`document.body.innerText.includes('Abstract · from the programme') && !document.querySelector('main section:last-of-type')?.innerText.includes('Loading')`);
  out.noAbstract = { key: NO_ABSTRACT, text: await abstractText() };

  // Airplane mode: no server any more. A real reload on Explore, then search.
  process.kill(-server.pid); server = null;
  await sleep(500);
  out.serverDown = await fetch(BASE).then(() => false, () => true);
  // …and the browser itself offline, as in airplane mode (navigator.onLine = false).
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Page.navigate', { url: BASE + '?airplane#/explore' }); // another URL, so this is a real page load
  await waitFor(`!!document.querySelector('input[type=search]')`);
  await waitFor(`!document.body.innerText.includes('Loading the programme')`);
  out.offlineError = await ev(`document.querySelector('[role=alert]')?.innerText ?? null`);
  await type('input[type=search]', 'CMU');
  await waitFor(`document.body.innerText.includes('Other CMUs')`);
  out.offlineCmu = { tabs: await tabs(), first: await ev(`document.querySelector('main li a')?.innerText.replace(/\\n/g, ' | ') ?? null`) };

  // Still offline: the planned talk shows its abstract; a talk of a day that was not prefetched says so.
  await send('Page.navigate', { url: BASE + '?airplane#/talk/' + PLANNED });
  await waitFor(`document.body.innerText.includes('Abstract · from the programme') && !document.querySelector('main section:last-of-type')?.innerText.includes('Loading')`);
  out.offlinePlannedAbstract = { key: PLANNED, text: await abstractText(), online: await ev('navigator.onLine') };
  await send('Page.navigate', { url: BASE + '?airplane#/talk/' + OTHER_DAY });
  await waitFor(`document.body.innerText.includes('Abstract · from the programme') && !document.querySelector('main section:last-of-type')?.innerText.includes('Loading')`);
  out.offlineOtherDayAbstract = { key: OTHER_DAY, text: await abstractText() };
  await send('Page.navigate', { url: BASE + '?airplane#/explore' });
  await waitFor(`!!document.querySelector('input[type=search]') && !document.body.innerText.includes('Loading the programme')`);
  await type('input[type=search]', 'CMU');
  await waitFor(`document.body.innerText.includes('Other CMUs')`);

  // Still offline: "CMU = Carnegie Mellon University · Other CMUs" → the filter list → pick Chiang Mai.
  out.banner = await ev(`[...document.querySelectorAll('p')].map(p => p.innerText).find(t => t.includes('Other CMUs'))`);
  await ev(`[...document.querySelectorAll('a')].find(a => a.innerText === 'Other CMUs').click()`);
  await waitFor(`location.hash.startsWith('#/explore/filters') && document.querySelectorAll('[role=radiogroup] label').length > 1`);
  out.otherList = await ev(`({ input: document.querySelector('#place').value, choices: [...document.querySelectorAll('[role=radiogroup] label')].map(l => l.innerText.split('\\n')[0] + (l.querySelector('input').checked ? ' [x]' : '')) })`);
  await ev(`[...document.querySelectorAll('[role=radiogroup] label')].find(l => l.innerText.startsWith('Chiang Mai')).querySelector('input').click()`);
  await sleep(200);
  out.otherButton = await ev(`document.querySelector('.fixed button').innerText`);
  await ev(`document.querySelector('.fixed button').click()`);
  await waitFor(`location.hash === '#/explore' && document.body.innerText.includes('Filters · 1')`);
  await sleep(200);
  out.afterOther = { query: await ev(`document.querySelector('input[type=search]').value`), tabs: await tabs(), first: await ev(`document.querySelector('main li a')?.innerText.replace(/\\n/g, ' | ') ?? null`) };
} finally {
  console.log(JSON.stringify(out, null, 2));
  ws.close(); chrome.kill();
  if (server) process.kill(-server.pid);
}
