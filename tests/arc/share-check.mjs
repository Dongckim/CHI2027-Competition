// Phone check (A3): demo banner, 16 share, 17 QR, a /s/ link → 18 → 19 pick → 20 home, Add to my Arcs, 14 Q&A, a broken
// link. 390×844, CPU 4× slower, real clock (so the demo day turns on by itself). vite preview mounts /api/share and
// /api/qa (memory store). npm run build && node --experimental-websocket tests/arc/share-check.mjs [--shots <dir>]
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildCorpus } from '../engine/corpus.mjs';
import { buildIndex, buildArc } from '../../app/src/engine/mock-core.js';
import { encodeLink } from '../../app/src/arc/link.js';
import { tempProfile, portFree, devtools } from '../qa/cdp.mjs';

const PORT = 4335, BASE = `http://localhost:${PORT}/`;
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const index = buildIndex(buildCorpus());
const ARC = buildArc(index, 'Does VR fidelity raise presence?', { angles: ['S', 'R', 'T'], days: [], types: ['Paper', 'Posters', 'Interactive Demos'] }, { id: 'share-mine-0001', createdAt: Date.UTC(2026, 10, 20) });
const OTHER = buildArc(index, 'privacy of smart home devices', { angles: ['S', 'R', 'T'], days: [], types: ['Paper', 'Posters', 'Interactive Demos'] }, { id: 'share-other-001', createdAt: 1 });
const PAYLOAD = encodeLink(OTHER), PAYLOAD2 = encodeLink(ARC);

await portFree(PORT);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const PROFILE = tempProfile('arc-a3');
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
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return !r.result || r.result.exceptionDetails ? undefined : r.result.result.value; }; // no result while the page navigates
const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await sleep(100); } return null; };
const out = {}, fails = [];
const check = (name, ok, detail) => { out[name] = { ok, ...detail }; if (!ok) fails.push(name); };
const shot = async name => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await sleep(400);
  const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
const open = async path => { await send('Page.navigate', { url: BASE + path }); await waitFor(`document.readyState === 'complete'`); };
const click = sel => ev(`(() => { const b = ${sel}; if (!b) return 'missing'; b.click(); return 'clicked'; })()`);
const byText = (t, sel = 'button, a') => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.trim() === ${JSON.stringify(t)} || b.getAttribute('aria-label') === ${JSON.stringify(t)})`;
const stored = () => ev(`new Promise(r => { const q = indexedDB.open('arc', 1); q.onupgradeneeded = () => q.result.createObjectStore('arcs', { keyPath: 'id' }); q.onsuccess = () => { const g = q.result.transaction('arcs').objectStore('arcs').getAll(); g.onsuccess = () => r(g.result); }; })`);
const onboarded = `localStorage.setItem('arc.device', JSON.stringify({ version: 1, edition: 'chi2026', mode: null, step: 'research', builtAt: null,
  plan: { query: '', topicsFor: null, topics: [], nearbyAdded: [], days: [], needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers'], howFull: 'balanced' },
  arc: { onboarded: true, firstChi: false, draft: { query: '', topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: ['talks'] } } })); true`;

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: BASE.slice(0, -1) }).catch(() => {});

  // the share page itself (what messengers read)
  const page = await (await fetch(`${BASE}s/${PAYLOAD}`)).text();
  check('/s/<payload>: preview tags from the link, then on to #/r/', page.includes(`<meta property="og:title" content="privacy of smart home devices">`) && page.includes(`location.replace("/#/r/${PAYLOAD}")`) && /content="ARC finds CHI talks for a question · ↑ \d+ support · ↻ \d+ reframe · ⊣ \d+ challenge/.test(page) && page.includes('og:site_name" content="arc2027.com"'), {});

  await open('#/home');
  await ev(onboarded);
  await ev(`new Promise(r => { const q = indexedDB.open('arc', 1); q.onupgradeneeded = () => q.result.createObjectStore('arcs', { keyPath: 'id' });
    q.onsuccess = () => { const t = q.result.transaction('arcs', 'readwrite'); t.objectStore('arcs').put(${JSON.stringify(ARC)}); t.oncomplete = () => r(true); }; })`);

  // 12: demo banner (real clock is after CHI 2026), Share → 16
  await open(`#/arc/${ARC.id}`);
  const banner = await waitFor(`/Demo time: Tue 14 Apr, 10:00 at the venue/.test(document.body.innerText)`, 20000);
  check('12 demo day: banner, Tue 14 Apr 10:00 at the venue', banner != null, { text: await ev(`document.querySelector('[role=note]')?.innerText`) });
  await click(byText('Share'));
  const shareMs = await waitFor(`location.hash === '#/share/${ARC.id}' && /Never your name/.test(document.body.innerText) && /part of the link/.test(document.body.innerText)`, 15000);
  await shot('16');
  await click(byText('Copy link'));
  const note = await waitFor(`/Link copied|\\/s\\//.test(document.querySelector('[role=status]')?.innerText ?? '')`, 5000);
  const copied = await ev(`navigator.clipboard.readText().catch(() => null)`);
  check('16 share: privacy lines, Copy link gives /s/<payload> for this Arc', shareMs != null && note != null && (copied == null || copied.endsWith(`/s/${PAYLOAD2}`)), { copied: copied?.slice(0, 60) });
  await click(byText('QR code'));
  const qr = await waitFor(`location.hash === '#/qr/${ARC.id}' && (document.querySelector('svg[aria-label^="QR code"] path')?.getAttribute('d')?.length ?? 0) > 500 && /Scan to get this Arc/.test(document.body.innerText)`, 15000);
  await shot('17');
  check('17 QR: code drawn for the link, caption', qr != null, {});

  // a link opened on another phone: fresh storage, /s/<payload> → 18
  // another phone: clear this origin's storage the way the browser does (an indexedDB.deleteDatabase from the page waits
  // for open connections and would run later, wiping what the next steps save)
  await open('#/home');
  await send('Storage.clearDataForOrigin', { origin: BASE.slice(0, -1), storageTypes: 'local_storage,indexeddb' });
  await open(`s/${PAYLOAD}`);
  const recMs = await waitFor(`location.hash === '#/r/${PAYLOAD}' && /Shared Arc/.test(document.body.innerText) && document.querySelector('h1')?.innerText === 'privacy of smart home devices'`, 30000);
  await shot('18');
  check('18 shared Arc: opens from /s/ on a fresh phone, no sender, Add to my Arcs / Pick some', recMs != null && (await ev(`!!${byText('Add to my Arcs')} && !!${byText('Pick some')}`)), { first: !(await ev(`localStorage.getItem('arc.device')`)) });
  await click(byText('Pick some'));
  await waitFor(`location.hash.endsWith('/pick') && /Pick what to keep/.test(document.body.innerText)`, 15000);
  const before = await ev(`document.querySelector('main ~ div button, div > button')?.innerText ?? ''`);
  const btn = () => ev(`[...document.querySelectorAll('button')].map(b => b.innerText.trim()).find(t => /to my Arcs|Pick at least/.test(t))`);
  const b1 = await btn();
  await click(`[...document.querySelectorAll('main button[aria-pressed=true]')][0]`);
  const b2 = await btn();
  const lockedN = await ev(`document.querySelectorAll('main button[aria-disabled=true]').length`);
  await shot('19');
  const n1 = Number(b1?.match(/Add (\d+)/)?.[1]), n2 = Number(b2?.match(/Add (\d+)/)?.[1]);
  await click(`[...document.querySelectorAll('button')].find(b => /^Add \\d+ to my Arcs$/.test(b.innerText.trim()))`);
  await waitFor(`location.hash === '#/home'`, 10000); // prototype 11/23: 19 → 20 My Arcs
  const saved = await stored();
  check('19 pick: untick one → Add n−1, ended talks locked, saved as a new received Arc, then My Arcs', n2 === n1 - 1 && saved.length === 1 && saved[0].source === 'received' && saved[0].nodes.length === n2, { buttons: [b1, b2], locked: lockedN, savedNodes: saved[0]?.nodes.length });
  // Add to my Arcs (another link) and 20 home lists both
  await open(`s/${PAYLOAD2}`);
  await waitFor(`location.hash.startsWith('#/r/') && !!${byText('Add to my Arcs')}`, 30000);
  await click(byText('Add to my Arcs'));
  await waitFor(`location.hash.startsWith('#/arc/')`, 10000);
  await open('#/home');
  // 20 shows one period at a time (Today / This week / After CHI): the two shared Arcs are in one of the three tabs each
  await waitFor(`!!document.querySelector('[role=tab]')`, 15000);
  const seen = new Set();
  for (const tab of ['Today', 'This week', 'After CHI']) {
    await click(`[...document.querySelectorAll('[role=tab]')].find(t => t.innerText.trim() === ${JSON.stringify(tab)})`);
    await sleep(300);
    for (const id of await ev(`[...document.querySelectorAll('main li a[aria-description*="shared with you"]')].map(a => a.getAttribute('href'))`) ?? []) seen.add(id);
  }
  await shot('20');
  check('20 home: both shared Arcs listed (across the period tabs), shared marked', seen.size === 2, { rows: [...seen] });

  // 14 Q&A against the memory store
  const talk = (await stored()).find(a => a.query === 'Does VR fidelity raise presence?').nodes[0].key;
  await open(`#/talk/${talk}`);
  await waitFor(`/Be the first to ask|Questions/.test(document.body.innerText) && !!document.querySelector('button[aria-describedby="qa-note"]')`, 20000);
  await ev(`document.querySelector('button[aria-describedby="qa-note"]').click(), true`); // 11/27: the composer sheet
  await waitFor(`!!document.querySelector('[role=dialog][aria-label="Ask the authors"] textarea')`, 5000);
  await ev(`(() => { const i = document.querySelector('[role=dialog] textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(i, 'Did presence hold after 20 minutes?'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await click(byText('Ask'));
  const asked = await waitFor(`[...document.querySelectorAll('section[aria-labelledby=qa] li')].some(l => l.innerText.includes('Did presence hold after 20 minutes?'))`, 10000);
  await click(`document.querySelector('section[aria-labelledby=qa] li button[aria-pressed=false]')`);
  const voted = await waitFor(`document.querySelector('section[aria-labelledby=qa] li button[aria-pressed=true]')?.getAttribute('aria-label')?.includes('1 vote')`, 10000);
  await shot('14-qa');
  await ev('window.confirm = () => true'); // Delete asks first (11/27)
  await click(byText('Delete'));
  const gone = await waitFor(`!document.querySelector('section[aria-labelledby=qa] li') && /Be the first to ask/.test(document.body.innerText)`, 10000);
  check('14 Q&A: ask, vote once (pressed, 1 vote), delete your own', asked != null && voted != null && gone != null, {});

  // a broken link
  await open('#/r/not-a-real-link');
  check('broken link: says why, no blank screen', (await waitFor(`/This link can't be opened/.test(document.body.innerText) && /Part of the link is missing/.test(document.body.innerText)`, 15000)) != null, {});
  check('no uncaught errors', errors.length === 0, { errors });
} catch (e) {
  fails.push(`stopped: ${e.message}`);
} finally {
  console.log(JSON.stringify(out, null, 2));
  console.log(fails.length ? `FAIL ${fails.length}: ${fails.join(' | ')}` : `PASS ${Object.keys(out).length}/${Object.keys(out).length}`);
  ws.close(); chrome.kill(); try { process.kill(-server.pid); } catch {}
  process.exit(fails.length ? 1 : 0);
}
