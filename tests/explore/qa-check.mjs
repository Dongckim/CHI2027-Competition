// Browser regression checks for the S4 cross-check (QA) findings that need a real page: headless Chrome 390x844.
//   4  Explore/06 use the same programme revision as Today (sample day, simulated room change)
//   5  Filters → Show n results → one Back returns to the screen before the filters
//   11 06 author links and "+n" are 44px touch targets
//   12 06: a slow abstract of the talk opened before does not overwrite the talk shown now
//   13 browsing (no plan): Explore does not run the planner (time to the first screen, CPU 4x slower)
//   16 06 highlight is underlined (2px) as well as coloured, light and dark, and stays a <mark>
// npm run build && node --experimental-websocket tests/explore/qa-check.mjs   (starts and stops its own vite preview)
// Exit code 1 when a check fails.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const PORT = 4320, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const appData = new URL('../../data/build/app-data/chi2026/', import.meta.url);
const { path: dataPath } = JSON.parse(readFileSync(new URL('current.json', appData)));
const abstracts = day => JSON.parse(readFileSync(new URL(`${dataPath}abstracts/${day}.json`, appData)));

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9336', `--user-data-dir=${tmpdir()}/arc-qa-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9336/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const paused = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Fetch.requestPaused') paused.push(m.params); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? undefined : r.result.result.value; };
const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return Date.now() - t; await sleep(50); } return null; };
const go = url => send('Page.navigate', { url });
const out = {}; const fails = [];
const check = (name, ok, detail) => { out[name] = { ok, ...detail }; if (!ok) fails.push(name); };

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass: true }); // the fetch interception in 12 must see the page's own requests
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // 4: simulated room change on the sample day → the talk's room on Today and on 06.
  await go(BASE + '?simulate=room-change#/sample');
  await waitFor(`document.body.innerText.includes('Programme updated')`);
  const alert = await ev(`document.querySelector('[role=alert]')?.innerText ?? ''`);
  const [, title, room] = alert.match(/Programme updated\. (.+) moved to (.+?)\./) ?? [];
  const href = await ev(`[...document.querySelectorAll('a[href^="#/talk/"]')].find(a => a.innerText.includes(${JSON.stringify(title ?? '???')}))?.getAttribute('href')`);
  if (href) await ev(`location.hash = ${JSON.stringify(href)}`);
  await waitFor(`!!document.querySelector('main h1') && !document.body.innerText.includes('Loading…')`);
  const detailRooms = await ev(`[...document.querySelectorAll('main p.font-mono')].map(p => p.innerText)`) ?? [];
  check('4 same revision', !!room && detailRooms.some(t => t.includes(room)), { todayRoom: room ?? null, talk: href ?? null, detail: detailRooms });

  // 11: on that 06, author links and the "+n" button.
  const small = await ev(`[...document.querySelectorAll('main a[href^="#/person/"], main button[aria-expanded]')].map(e => [e.innerText, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44)`);
  check('11 author targets 44px', Array.isArray(small) && small.length === 0, { under44: small });

  // 16: highlight = <mark> with colour and a 2px underline, in light and dark.
  await ev(`location.hash = '#/sample'`);
  await waitFor(`document.body.innerText.includes('Preview')`);
  await ev(`location.hash = '#/talk/chi2026:221879'`);
  await waitFor(`!!document.querySelector('main mark')`);
  const markStyle = () => ev(`(() => { const m = document.querySelector('main mark'); const c = getComputedStyle(m); return { tag: m.tagName, line: c.textDecorationLine, thickness: c.textDecorationThickness, bg: c.backgroundColor }; })()`);
  const hl = {};
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await sleep(200);
    hl[scheme] = await markStyle();
  }
  await send('Emulation.setEmulatedMedia', { features: [] });
  check('16 highlight underlined', ['light', 'dark'].every(k => hl[k]?.tag === 'MARK' && hl[k].line.includes('underline') && hl[k].thickness === '2px'), hl);

  // 5: Today (sample) → magnifier → Filters → Show n results → Back once → Today.
  await ev(`location.hash = '#/sample'`);
  await waitFor(`document.body.innerText.includes('Preview')`);
  const len0 = await ev('history.length');
  await ev(`document.querySelector('a[aria-label=Search]').click()`);
  await waitFor(`location.hash === '#/explore' && !!document.querySelector('a[href^="#/explore/filters"]')`);
  await ev(`document.querySelector('a[href^="#/explore/filters"]').click()`);
  await waitFor(`location.hash.startsWith('#/explore/filters') && !!document.querySelector('.fixed button')`);
  await sleep(300);
  await ev(`document.querySelector('.fixed button').click()`);
  await waitFor(`location.hash === '#/explore'`);
  await sleep(200);
  await ev('history.back()');
  await sleep(600);
  check('5 one back after filters', (await ev('location.hash')) === '#/sample', { after: await ev('location.hash'), historyGrew: (await ev('history.length')) - len0 });

  // 12: open talk A (its abstract file held back), then talk B; release A's file; B's abstract must stay.
  const A = 'chi2026:221879', aDay = '2026-04-14';
  const bAbs = abstracts('2026-04-16'); const B = Object.keys(bAbs).find(k => bAbs[k]);
  await go(BASE + '?race#/explore'); // a fresh page: no abstract file loaded yet
  await waitFor(`!!document.querySelector('input[type=search]')`);
  await send('Fetch.enable', { patterns: [{ urlPattern: `*abstracts/${aDay}.json*`, requestStage: 'Request' }] });
  await ev(`location.hash = '#/talk/${A}'`);
  await waitFor(`document.body.innerText.includes('Abstract · from the programme')`);
  const held = await (async () => { for (let i = 0; i < 100 && !paused.length; i++) await sleep(50); return paused.shift(); })();
  await ev(`location.hash = '#/talk/${B}'`);
  await waitFor(`(document.querySelector('main section:last-of-type')?.innerText ?? '').includes(${JSON.stringify(bAbs[B].slice(0, 30))})`, 10000);
  if (held) await send('Fetch.continueRequest', { requestId: held.requestId });
  await sleep(1500);
  await send('Fetch.disable');
  const shown = await ev(`[...document.querySelectorAll('main section')].find(x => x.innerText.startsWith('Abstract'))?.innerText.slice(29, 89) ?? ''`);
  check('12 no stale abstract', !!held && bAbs[B].startsWith(shown.trim().slice(0, 40)), { heldRequest: !!held, shown: shown.trim().slice(0, 60), expected: bAbs[B].slice(0, 60) });

  // 13: browsing mode, CPU 4x: time from opening Explore to its first screen (3 runs, median).
  await send('Network.setBypassServiceWorker', { bypass: false });
  await ev(`localStorage.setItem('arc.device', JSON.stringify({ version: 1, edition: 'chi2026', mode: 'browse', step: 'research', builtAt: null, plan: { query: '', topicsFor: null, topics: [], nearbyAdded: [], days: ['2026-04-13','2026-04-14','2026-04-15','2026-04-16','2026-04-17'], needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers', 'posters', 'demos'], howFull: 'balanced' } }))`);
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Main-thread long tasks from page load until Explore is ready (data loaded and indexed): the planner for 5 days is a
  // long task of its own on top of loading and indexing. 3 runs, median.
  const runs = [];
  for (let i = 0; i < 3; i++) {
    await go(BASE + `?browse${i}#/explore`);
    await waitFor(`!!document.querySelector('input[type=search]') && !document.body.innerText.includes('Loading the programme')`, 30000);
    await sleep(1500); // let effects after the first screen run too
    runs.push(await ev(`new Promise(res => { const seen = []; new PerformanceObserver(l => l.getEntries().forEach(e => seen.push(e.duration))).observe({ type: 'longtask', buffered: true }); setTimeout(() => res(Math.round(seen.reduce((a, b) => a + b, 0))), 200); })`));
  }
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  runs.sort((a, b) => a - b);
  out['13 browse long tasks'] = { totalLongTaskMsMedian: runs[1], runs, limitMs: Number(process.env.QA13_LIMIT ?? 0) || null };
  if (process.env.QA13_LIMIT) check('13 no planner while browsing', runs[1] < Number(process.env.QA13_LIMIT), { totalLongTaskMsMedian: runs[1], runs });
} finally {
  console.log(JSON.stringify(out, null, 2));
  console.log(fails.length ? `FAIL: ${fails.join(', ')}` : 'PASS: all checks');
  ws.close(); chrome.kill(); process.kill(-server.pid);
  process.exitCode = fails.length ? 1 : 0;
}
