// Phone check (A1): 01 → 12 by clicks only, on a fresh phone (390×844, CPU 4× slower). Starts and stops its own vite preview.
// npm run build && node --experimental-websocket tests/arc/create-check.mjs [--shots <dir>]
//   - first run: 01 → It's my first CHI → 02–05 → 06 → 07 (type a question, tribe chip) → 08 (? sheet opens and closes)
//     → 09 → Build my Arc → 10 → 11 (tribe named, edge glows) → See my Arc → 12 → a node opens 14 (evidence
//     highlighted); reload keeps the Arc
//   - Skip on a fresh phone → 21 empty home; New Arc → 07 with a back button (no dots), the "Have a paper at CHI? Find it" pill
// Exit code 1 on a fail.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tempProfile, portFree, devtools } from '../qa/cdp.mjs';
// ARC_SEARCH="?engine=ondevice" runs the same flow on the on-device engine (needs dist/model/)
const PORT = 4331, BASE = `http://localhost:${PORT}/${process.env.ARC_SEARCH ?? ''}`;
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
await portFree(PORT);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const PROFILE = tempProfile('arc-create');
const chrome = spawn(CHROME, ['--headless=new', '--force-prefers-reduced-motion', '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
const DEVTOOLS = await devtools(PROFILE); // a free port: never a Chrome left by an earlier run
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`${DEVTOOLS}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 200)); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? undefined : r.result.result.value; };
const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await sleep(100); } return null; };
const out = {}, fails = [];
const check = (name, ok, detail) => { out[name] = { ok, ...detail }; if (!ok) fails.push(name); };
const hash = () => ev('location.hash');
// Click the first button or link whose text (or aria-label) is exactly `text`.
const click = text => ev(`(() => { const b = [...document.querySelectorAll('button, a')].find(b => b.innerText.trim() === ${JSON.stringify(text)} || b.getAttribute('aria-label') === ${JSON.stringify(text)});
  if (!b) return 'missing'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`);
const shot = async name => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
// Open a new document and wait for it, not for the one being left: right after Page.navigate the old page still answers
// "readyState complete", and checking it raced the load (11/25: "fresh phone opens 01" failed 1 in 60 runs, 4 times in
// qa:auto; tests/qa/first-load-check.mjs showed 01 within 0.53 s in 140 runs of the same steps). The old page is marked.
const load = async url => { await ev('window.__arcLeft = true'); await send('Page.navigate', { url }); return waitFor(`!window.__arcLeft && document.readyState === 'complete'`); };
const fresh = async () => { await ev(`localStorage.clear(); indexedDB.deleteDatabase('arc'); true`); await load(BASE + (BASE.includes('?') ? '&' : '?') + 'fresh=' + Date.now()); };

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await load(BASE);
  await fresh();

  // 01 → 02 … 06 → 06b → 06c → 07
  // when it fails, what the page was (11/25: it failed now and then; first-load-check keeps the network and console too)
  const at01 = await waitFor(`location.hash === '#/start/1' && /Bring one question/.test(document.body.innerText)`);
  const page01 = at01 != null ? { ms: at01 } : await ev(`({ hash: location.hash, ready: document.readyState, text: document.body.innerText.slice(0, 160), h1: document.querySelector('h1')?.textContent ?? null, root: document.getElementById('root')?.childElementCount ?? -1 })`);
  if (at01 == null && process.env.ARC_FAIL_SHOT) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(process.env.ARC_FAIL_SHOT, Buffer.from(r.result.data, 'base64')); }
  check('fresh phone opens 01', at01 != null, page01);
  await shot('01');
  await click("It's my first CHI");
  // user 11/28: 01 → 07 at once (Back to 01, Skip); 02–06c are the "New to CHI?" guide from My Arcs
  check('01 → 07 with Back and Skip', !!(await waitFor(`location.hash === '#/ask' && !!document.querySelector('a[aria-label="Back"], a[href$="#/start/1"]') && /Skip/.test(document.body.innerText)`)), { hash: await ev('location.hash') });
  await shot('07-first');
  await ev(`location.hash = '#/start/2'`);
  const seen = [];
  for (const [n, title] of [[2, 'What is CHI 2027?'], [3, 'What do I do all day?'], [4, 'What are all these formats?'], [5, 'How do people meet?'], [6, 'What is ARC?'], ['6b', 'Where are my people?'], ['6c', 'When do I use ARC?']]) {
    const ok = await waitFor(`location.hash === '#/start/${n}' && document.body.innerText.includes(${JSON.stringify(title)})`);
    seen.push(ok != null); await shot(`0${n}`);
    await click('Next');
  }
  check('guide 02–06c in order, each with Next, then My Arcs', seen.every(Boolean) && !!(await waitFor(`location.hash === '#/home'`)), { seen });
  await ev(`location.hash = '#/ask'`);
  await waitFor(`location.hash === '#/ask' && !!document.querySelector('main textarea')`);

  // 07: type a question (React needs the native setter + an input event), the tribe chip appears
  await ev(`(() => { const i = document.querySelector('main textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(i, 'Does VR fidelity raise presence?'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const chipMs = await waitFor(`/XR & immersive/.test(document.querySelector('main').innerText)`, 15000);
  check('07 tribe chip follows the question', chipMs != null, { chipMs });
  await waitFor(`/Ready offline/.test(document.body.innerText)`, 30000);
  await shot('07');
  await click('Find my angles');

  // 08 is gone (user 11/26 「choose angle 부분은 지워주고」): 07 goes straight to 09

  // 09 → 10 → 11
  check('09 When and what', !!(await waitFor(`location.hash === '#/when' && document.querySelectorAll('main section button[aria-pressed]').length >= 5`)), {}); // the conference days (user 11/26)
  await shot('09');
  await click('Build my Arc');
  const reading = await waitFor(`location.hash === '#/building' && /Reading [\\d,]+ talks for you/.test(document.body.innerText)`, 10000);
  const glow10 = await ev(`document.documentElement.dataset.tribe ?? null`);
  await shot('10');
  check('10 Building: real talk count, edge in the question tribe', reading != null && glow10 === 'xr', { glow10 });
  const t0 = Date.now();
  const hoodMs = await waitFor(`location.hash.startsWith('#/hood/') && /YOU'RE IN/.test(document.body.innerText)`, 30000);
  const hood = await ev(`({ name: document.querySelector('h1')?.innerText, look: [...document.querySelectorAll('main p')].map(p => p.innerText).find(t => t.startsWith('Look for')), tribe: document.documentElement.dataset.tribe })`);
  check('11 names the tribe with colour + shape words, edge glows', hoodMs != null && hood?.name === 'XR & immersive' && hood.look === 'Look for the blue diamond.' && hood.tribe === 'xr', { buildToHoodMs: Date.now() - t0, hood });
  await shot('11');
  await click('See my Arc');
  const arcMs = await waitFor(`location.hash.startsWith('#/arc/') && document.querySelector('h1')?.textContent === 'Does VR fidelity raise presence?'`);
  const arcHash = await hash();
  const NODE = `[...document.querySelectorAll('main button[aria-description]')].filter(b => /^(Supports|Reframes|Challenges) · /.test(b.textContent.trim()))`;
  await waitFor(`${NODE}.length >= 3`, 15000);
  const nodes = await ev(`['Supports', 'Reframes', 'Challenges'].map(a => ${NODE}.filter(b => b.textContent.trim().startsWith(a + ' · ')).length)`);
  const stored = await ev(`new Promise(r => { const q = indexedDB.open('arc'); q.onsuccess = () => { const g = q.result.transaction('arcs').objectStore('arcs').getAll(); g.onsuccess = () => r(g.result.length); }; })`);
  check('12 reached by clicks only, with talks round the question, saved once', arcMs != null && nodes?.reduce((a, b) => a + b, 0) >= 3 && stored === 1, { hash: arcHash, nodesPerAngle: nodes, storedArcs: stored });
  await shot('12');
  // 12 → 14: every node is a button named "<angle> · <title> · <time>"; the first opens 14 with its title and evidence
  // a node's name is its own text: "<angle> · <short name> <time · room>" (WCAG 2.5.3; Figma's short name); the whole title
  // opens its description (or is the name, when they are the same)
  const node = await ev(`(() => { const b = ${NODE}; const f = b[0];
    return { count: b.length, named: b.every(x => /^(Supports|Reframes|Challenges) · .+ (\\d\\d:\\d\\d|[A-Z][a-z]{2} · )/.test(x.innerText.replace(/\\s+/g, ' ').trim())), label: f?.innerText.replace(/\\s+/g, ' ').trim(),
      title: f?.querySelector('.line-clamp-2')?.textContent.replace(/^✦ /, '').trim(), desc: f?.getAttribute('aria-description') ?? '' }; })()`);
  // 12c (prototype 3, 11/26): a tap opens the stop's whole title over the map, with View details; a second tap opens 14
  await ev(`${NODE}[0].click()`);
  const want = JSON.stringify(node.title ?? '');
  const card = await waitFor(`[...document.querySelectorAll('[role=dialog] a[href*="talk/"]')].length > 0 && document.querySelector('[role=dialog]').innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(node.desc.split(' · ')[0] || node.title)}.slice(0, 20))`, 5000);
  check('12c: a tap shows the stop\'s whole title over the map', card != null, {});
  await ev(`${NODE}[0].click()`);
  // 14 is its own chunk: wait for its title (not the 12 still on screen) and for the abstract
  const talkMs = await waitFor(`location.hash.startsWith('#/talk/chi2026:') && (${JSON.stringify(node.desc)}.startsWith(document.querySelector('h1')?.innerText + ' · ') || document.querySelector('h1')?.innerText === ${want}) && !/Loading/.test(document.querySelector('main').innerText)`, 30000);
  const talk = await ev(`({ title: document.querySelector('h1')?.innerText, angle: document.querySelector('main p')?.innerText, mark: document.querySelector('main mark')?.textContent ?? null, when: [...document.querySelectorAll('main p')].map(p => p.innerText).find(t => t.includes(' · ~')) ?? [...document.querySelectorAll('main li')].map(l => l.innerText).find(t => t.includes(' · ~')) ?? null })`);
  await shot('14');
  check('12 node opens 14 with title, angle, time and the evidence highlighted', talkMs != null && node.named && !!node.title && !!talk?.title && (node.desc.startsWith(`${talk.title} · `) || talk.title === node.title) && !!talk?.mark && !!talk.when,
    { nodes: node.count, label: node.label, talk });
  await send('Runtime.evaluate', { expression: 'history.back()' });
  await waitFor(`location.hash.startsWith('#/arc/')`);
  await send('Page.reload'); await waitFor(`document.readyState === 'complete'`);
  check('reload keeps the Arc (IndexedDB)', (await waitFor(`location.hash === ${JSON.stringify(arcHash)} && document.querySelector('h1')?.textContent === 'Does VR fidelity raise presence?'`)) != null, {});

  // Skip on a fresh phone → 21, New Arc → 07 with back
  await fresh();
  await waitFor(`location.hash === '#/start/1'`);
  await click('Skip');
  check('Skip → 21 empty home', (await waitFor(`location.hash === '#/home' && /Start with one question/.test(document.body.innerText)`)) != null, {});
  await shot('21');
  await click('New Arc');
  check('New Arc → 07 with a back button, no dots, and the Have a paper pill', (await waitFor(`location.hash === '#/ask' && !!document.querySelector('[aria-label=Back]') && !document.querySelector('[aria-label="Step 8 of 8"]') && /Have a paper at CHI/.test(document.body.innerText)`)) != null, {});
  check('no uncaught errors', errors.length === 0, { errors });
} catch (e) {
  fails.push(`stopped: ${e.message}`);
} finally {
  console.log(JSON.stringify(out, null, 2));
  console.log(fails.length ? `FAIL ${fails.length}: ${fails.join(' | ')}` : `PASS ${Object.keys(out).length}/${Object.keys(out).length}`);
  ws.close(); chrome.kill(); try { process.kill(-server.pid); } catch {}
  process.exit(fails.length ? 1 : 0);
}
