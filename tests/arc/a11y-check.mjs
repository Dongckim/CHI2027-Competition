// Accessibility check (A4): axe-core (WCAG 2.0/2.1/2.2 A + AA rules) on every Arc screen at 390×844, plus the 22 sheet.
// Reports each rule that fails with its impact and the first elements. Contrast over pictures and glows is measured by
// axe where it can; what it cannot decide is listed as "incomplete". Screen readers (VoiceOver) are a person's job.
// npm run build && node --experimental-websocket tests/arc/a11y-check.mjs [--json]
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { buildCorpus } from '../engine/corpus.mjs';
import { buildIndex, buildArc } from '../../app/src/engine/mock-core.js';
import { encodeLink } from '../../app/src/arc/link.js';

const PORT = 4341, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const index = buildIndex(buildCorpus());
const opts = { angles: ['S', 'R', 'T'], days: [], types: ['Paper', 'Posters', 'Interactive Demos'] };
const ARC = buildArc(index, 'Does VR fidelity raise presence?', opts, { id: 'a11y-normal-001', createdAt: 2 });
const NONE = buildArc(index, 'sign language', opts, { id: 'a11y-none-0001', createdAt: 1 });
const PEND = buildArc(index, 'privacy of smart home devices', opts, { id: 'a11y-pend-0001', createdAt: 0, mode: 'pending' });
const OTHER = buildArc(index, 'haptic feedback', opts, { id: 'a11y-other-001', createdAt: 0 });
const draft = { query: 'Does VR fidelity raise presence?', topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: ['talks', 'posters', 'demos'] };
const device = onboarded => JSON.stringify({ version: 1, edition: 'chi2026', mode: null, step: 'research', builtAt: null,
  plan: { query: '', topicsFor: null, topics: [], nearbyAdded: [], days: [], needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers'], howFull: 'balanced' },
  arc: { onboarded, firstChi: true, draft } });
const SCREENS = [
  ['01', '#/start/1', 'Bring one question'], ['02', '#/start/2', 'The biggest week'], ['03', '#/start/3', 'Ten talks'], ['04', '#/start/4', 'Know what to do'],
  ['05', '#/start/5', 'Breaks are'], ['06', '#/start/6', 'three sides'], ['07', '#/ask', 'What are you'], ['08', '#/angles', 'Supports'],
  ['09', '#/when', 'Build my Arc'], ['11', `#/hood/${ARC.id}`, "YOU'RE IN"], ['12', `#/arc/${ARC.id}`, 'Next ·'], ['13', `#/arc/${ARC.id}/list`, 'Reframes'],
  ['14', `#/talk/${ARC.nodes[0].key}`, 'WHY IT'], ['15', `#/arc/${ARC.id}/edit`, 'Editing'], ['16', `#/share/${ARC.id}`, 'Never your name'],
  ['17', `#/qr/${ARC.id}`, 'Scan to get'], ['18', `#/r/${encodeLink(OTHER)}`, 'Shared Arc'], ['19', `#/r/${encodeLink(OTHER)}/pick`, 'Pick what to keep'],
  ['20', '#/home', 'My Arcs'], ['23', `#/arc/${NONE.id}`, 'No clear challenge'], ['25', `#/arc/${PEND.id}`, 'Sorting angles'],
];

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9361', `--user-data-dir=${tmpdir()}/arc-a11y-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9361/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return !r.result || r.result.exceptionDetails ? undefined : r.result.result.value; };
const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(150); } return false; };
const results = {};
const axe = async () => ev(`(async () => { if (!window.axe) { ${AXE}\n } const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations', 'incomplete'] });
  const pick = list => list.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ') + (n.failureSummary ? ' — ' + n.failureSummary.split('\\n').slice(1, 2).join(' ').trim() : '')) }));
  return { violations: pick(r.violations), incomplete: r.incomplete.map(v => ({ id: v.id, n: v.nodes.length })) }; })()`);

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: BASE + '?at=2026-04-14T12:00#/start/1' });
  await waitFor(`document.readyState === 'complete'`);
  await ev(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
  await ev(`new Promise(r => { const q = indexedDB.open('arc', 1); q.onupgradeneeded = () => q.result.createObjectStore('arcs', { keyPath: 'id' });
    q.onsuccess = () => { const t = q.result.transaction('arcs', 'readwrite'); for (const a of ${JSON.stringify([ARC, NONE, PEND])}) t.objectStore('arcs').put(a); t.oncomplete = () => r(true); }; })`);
  for (const [name, hash, text] of SCREENS) {
    await send('Page.navigate', { url: `${BASE}?at=2026-04-14T12:00&s=${name}${hash}` });
    const ok = await waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, 30000);
    await sleep(600); // pictures and fonts
    results[name] = ok ? await axe() : { error: `did not show "${text}"` };
    if (name === '08') { // 22: the ? sheet over 08
      await ev(`[...document.querySelectorAll('button')].find(b => /What are Supports/.test(b.getAttribute('aria-label') ?? ''))?.click()`);
      await waitFor(`!!document.querySelector('[role=dialog]')`, 5000);
      results['22'] = await axe();
    }
  }
} finally {
  const rows = Object.entries(results);
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  let bad = 0;
  for (const [name, r] of rows) {
    if (r.error) { bad++; console.log(`${name}  ERROR ${r.error}`); continue; }
    const v = r.violations.filter(x => x.impact === 'serious' || x.impact === 'critical');
    bad += v.length;
    console.log(`${name}  ${r.violations.length ? r.violations.map(x => `${x.id}(${x.impact},${x.n})`).join(' ') : 'no violations'}${r.incomplete.length ? `  · needs a look: ${r.incomplete.map(x => `${x.id}(${x.n})`).join(' ')}` : ''}`);
    for (const x of r.violations) for (const n of x.nodes) console.log(`      ${x.id}: ${n.slice(0, 160)}`);
  }
  console.log(bad ? `FAIL: ${bad} serious or critical` : `PASS: ${rows.length} screens, no serious or critical violations`);
  ws.close(); chrome.kill(); try { process.kill(-server.pid); } catch {}
  process.exit(bad ? 1 : 0);
}
