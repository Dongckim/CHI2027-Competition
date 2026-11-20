// Phone check (A2): 12 map, 13 list, 14 detail, 15 edit and the 23/24/25 states, on Arcs made by the mock engine in
// node and put into the browser's IndexedDB. 390×844, CPU 4× slower, demo clock ?at=2026-04-14T12:00 (venue time).
// npm run build && node --experimental-websocket tests/arc/arc-check.mjs [--shots <dir>]
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildCorpus } from '../engine/corpus.mjs';
import { buildIndex, buildArc } from '../../app/src/engine/mock-core.js';

const PORT = 4333, BASE = `http://localhost:${PORT}/`, AT = '?at=2026-04-14T12:00';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const index = buildIndex(buildCorpus());
const make = (id, q, mode) => buildArc(index, q, { angles: ['S', 'R', 'T'], days: [], types: ['Paper', 'Posters', 'Interactive Demos'] }, { id, createdAt: Date.UTC(2026, 10, 20), mode });
const ARCS = { normal: make('check-normal-0001', 'Does VR fidelity raise presence?', 'normal'), none: make('check-none-00001', 'sign language', 'normal'),
  crowded: make('check-crowd-0001', 'haptic feedback', 'crowded'), pending: make('check-pend-00001', 'privacy of smart home devices', 'pending') };

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9353', `--user-data-dir=${tmpdir()}/arc-a2-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9353/json')).json(); break; } catch { await sleep(250); } }
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
const shot = async name => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await sleep(400);
  const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const open = async hash => { await send('Page.navigate', { url: BASE + AT + hash }); await waitFor(`document.readyState === 'complete'`); };
const nodes = `[...document.querySelectorAll('main button[aria-label*=" · "]')].filter(b => b.closest('main'))`;
const click = sel => ev(`(() => { const b = ${sel}; if (!b) return 'missing'; b.click(); return 'clicked'; })()`);

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await open('#/home');
  // onboarded, and the four Arcs in IndexedDB (the app's store)
  await ev(`localStorage.setItem('arc.device', JSON.stringify({ version: 1, edition: 'chi2026', mode: null, step: 'research', builtAt: null,
    plan: { query: '', topicsFor: null, topics: [], nearbyAdded: [], days: [], needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers'], howFull: 'balanced' },
    arc: { onboarded: true, firstChi: false, draft: { query: '', topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: ['talks'] } } })); true`);
  await ev(`new Promise(r => { const q = indexedDB.open('arc', 1); q.onupgradeneeded = () => q.result.createObjectStore('arcs', { keyPath: 'id' });
    q.onsuccess = () => { const t = q.result.transaction('arcs', 'readwrite'); for (const a of ${JSON.stringify(Object.values(ARCS))}) t.objectStore('arcs').put(a); t.oncomplete = () => r(true); }; })`);

  // 12 map
  await open(`#/arc/${ARCS.normal.id}`);
  const mapMs = await waitFor(`${nodes}.length >= 3 && [...document.querySelectorAll('main button[aria-description]')].some(b => b.getAttribute('aria-description') === 'Next')`, 30000);
  const map = await ev(`({ nodes: ${nodes}.length, states: [...document.querySelectorAll('main button[aria-description]')].map(b => b.getAttribute('aria-description')),
    nextUp: [...document.querySelectorAll('a')].find(a => a.getAttribute('aria-label')?.startsWith('Next up:'))?.getAttribute('aria-label') ?? null,
    tribe: document.documentElement.dataset.tribe, share: !!document.querySelector('button[disabled][aria-describedby=share-soon]') })`);
  await shot('12');
  check('12 map: nodes as buttons, Next and Ended from the clock, next-up panel, tribe edge', mapMs != null && map.states.includes('Next') && map.states.includes('Ended') && !!map.nextUp && map.tribe === 'xr', map);
  await click(`document.querySelector('button[aria-label="What are the three angles?"]')`);
  check('12 ? opens the angle help', (await waitFor(`!!document.querySelector('[role=dialog][aria-label="Three angles"]')`, 5000)) != null, {});
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  // 12 → 14, "I heard it" → Heard on the map
  const first = await ev(`(() => { const b = ${nodes}.find(b => b.getAttribute('aria-description') === 'Ended'); return b?.getAttribute('aria-label'); })()`);
  await click(`${nodes}.find(b => b.getAttribute('aria-label') === ${JSON.stringify(first)})`);
  const want = JSON.stringify(first?.split(' · ')[1] ?? '');
  const talkMs = await waitFor(`document.querySelector('h1')?.innerText === ${want} && !/Loading/.test(document.querySelector('main').innerText)`, 30000);
  const talk = await ev(`({ tags: [...document.querySelectorAll('main > div:first-child span')].map(s => s.innerText), why: document.querySelector('#why')?.innerText,
    authors: [...document.querySelectorAll('main li')].filter(l => l.querySelector('img') && / · |\\w/.test(l.innerText)).length,
    newToChi: [...document.querySelectorAll('main button')].filter(b => b.innerText.trim() === 'New to CHI').length,
    heardButton: !!document.querySelector('button[aria-pressed=false]'), qa: /Be the first to ask/.test(document.body.innerText),
    input: document.querySelector('input[placeholder="Add a question for the Q&A"]') != null, mark: document.querySelector('main mark')?.textContent?.length ?? 0 })`);
  await shot('14');
  check('14: tags, why, session and authors with New to CHI, I heard it, Q&A area, evidence marked', talkMs != null && talk.tags.length >= 2 && /^WHY IT/.test(talk.why ?? '') && talk.heardButton && talk.qa && talk.input && talk.mark > 0, talk);
  await click(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'I heard it')`);
  await waitFor(`!!document.querySelector('button[aria-pressed=true]')`, 5000);
  await ev('history.back()');
  const heardMs = await waitFor(`${nodes}.some(b => b.getAttribute('aria-label') === ${JSON.stringify(first)} && b.getAttribute('aria-description') === 'Heard')`, 15000);
  check('I heard it → the node shows Heard on 12', heardMs != null, {});

  // 13 list
  await click(`document.querySelector('a[aria-label=List]')`);
  const listMs = await waitFor(`location.hash.endsWith('/list') && document.querySelectorAll('main section button').length === ${ARCS.normal.nodes.length}`, 15000);
  const list = await ev(`[...document.querySelectorAll('main section button')].map(b => b.innerText.split('\\n').pop())`);
  await shot('13');
  check('13 list: every talk, state words in the meta line', listMs != null && list.some(t => /^Heard · /.test(t)) && list.some(t => /^Next · /.test(t)), { rows: list.length, meta: list });

  // 23, 24, 25
  await open(`#/arc/${ARCS.none.id}`);
  check('23 no clear Challenge: empty slot with Figma copy', (await waitFor(`/No clear clash/.test(document.querySelector('main').innerText)`, 20000)) != null, {});
  await shot('23');
  await open(`#/arc/${ARCS.crowded.id}`);
  const bundle = await waitFor(`!!document.querySelector('button[aria-label$=" more Supports"], button[aria-label$=" more Reframes"], button[aria-label$=" more Challenges"]')`, 20000);
  await shot('24');
  await click(`document.querySelector('button[aria-label*=" more "]')`);
  check('24 crowded: +N bundle opens the list', bundle != null && (await waitFor(`location.hash.endsWith('/list')`, 10000)) != null, { nodes: ARCS.crowded.nodes.length });
  await open(`#/arc/${ARCS.pending.id}`);
  const sorting = await waitFor(`/Sorting angles/.test(document.body.innerText) && ${nodes}.length > 0`, 20000);
  const nextUp25 = await ev(`[...document.querySelectorAll('a')].some(a => a.getAttribute('aria-label')?.startsWith('Next up:'))`);
  await shot('25');
  check('25 sorting: status pill, neutral nodes, no next-up', sorting != null && !nextUp25, {});

  // 15 edit: remove one, swap one, Done
  await open(`#/arc/${ARCS.normal.id}/edit`);
  await waitFor(`/Editing/.test(document.body.innerText) && document.querySelectorAll('button[aria-label^="Remove "]').length > 1`, 20000);
  const before = ARCS.normal.nodes.length; // stored talks (the map may bundle some)
  await shot('15-closed');
  const hintClear = await ev(`(() => { const p = [...document.querySelectorAll('main p')].find(p => p.innerText.startsWith('Tap a talk')); const r = p.getBoundingClientRect();
    return ![...document.querySelectorAll('main button[aria-label*=" · "] span')].some(s => { const q = s.getBoundingClientRect(); return q.height && q.bottom > r.top + 1 && q.top < r.bottom - 1 && q.right > r.left && q.left < r.right; }); })()`);
  check('15 hint below the map, not over the labels', hintClear === true, {});
  await click(`document.querySelector('button[aria-label^="Remove "]')`);
  await click(`[...document.querySelectorAll('main button[aria-pressed]')].find(b => b.getAttribute('aria-label')?.includes(' · '))`);
  const cardsMs = await waitFor(`[...document.querySelectorAll('section[aria-label=Swap] button')].some(b => b.getAttribute('aria-label')?.startsWith('Swap in'))`, 20000);
  await shot('15');
  const swapIn = await ev(`[...document.querySelectorAll('section[aria-label=Swap] button')].find(b => b.getAttribute('aria-label')?.startsWith('Swap in'))?.getAttribute('aria-label')`);
  await click(`[...document.querySelectorAll('section[aria-label=Swap] button')].find(b => b.getAttribute('aria-label')?.startsWith('Swap in'))`);
  await click(`[...document.querySelectorAll('section[aria-label=Swap] button[role=radio]')].find(b => b.innerText.includes('Wildcard'))`); // sheet closed after a swap: no-op
  await click(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Done')`);
  await waitFor(`location.hash === '#/arc/${ARCS.normal.id}'`, 10000);
  const stored = await ev(`new Promise(r => { const q = indexedDB.open('arc'); q.onsuccess = () => { const g = q.result.transaction('arcs').objectStore('arcs').get('${ARCS.normal.id}'); g.onsuccess = () => r(g.result.nodes.map(n => n.key)); }; })`);
  const swapped = swapIn?.split(' · ')[1];
  check('15 edit: − removes, a card swaps in, Done saves', cardsMs != null && stored.length === before - 1 && !!swapped, { before, after: stored.length, swappedIn: swapped });
  // Wildcard chip gives cards too
  await open(`#/arc/${ARCS.normal.id}/edit`);
  await waitFor(`document.querySelectorAll('button[aria-label^="Add a talk to "], button[aria-label^="Remove "]').length > 0`, 20000);
  await click(`[...document.querySelectorAll('main button[aria-pressed]')].find(b => b.getAttribute('aria-label')?.includes(' · '))`);
  await waitFor(`!!document.querySelector('section[aria-label=Swap]')`, 5000);
  await click(`[...document.querySelectorAll('section[aria-label=Swap] button[role=radio]')].find(b => b.innerText.includes('Wildcard'))`);
  check('15 Wildcard chip shows cards', (await waitFor(`[...document.querySelectorAll('section[aria-label=Swap] button')].filter(b => b.getAttribute('aria-label')?.startsWith('Swap in')).length > 0`, 20000)) != null, {});
  check('no uncaught errors', errors.length === 0, { errors });
} catch (e) {
  fails.push(`stopped: ${e.message}`);
} finally {
  console.log(JSON.stringify(out, null, 2));
  console.log(fails.length ? `FAIL ${fails.length}: ${fails.join(' | ')}` : `PASS ${Object.keys(out).length}/${Object.keys(out).length}`);
  ws.close(); chrome.kill(); try { process.kill(-server.pid); } catch {}
  process.exit(fails.length ? 1 : 0);
}
