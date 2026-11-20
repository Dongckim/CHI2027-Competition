// Accessibility check (A4): axe-core (WCAG 2.0/2.1/2.2 A + AA rules) on every Arc screen at 390×844, plus the 22 sheet.
// Reports each rule that fails with its impact and the first elements. Text axe cannot judge (over a picture, a
// gradient or another layer) is measured from pixels: its box is captured with and without the text; under the glyphs
// (the pixels that differ) the worst 2% of the background against the text colour must reach 4.5:1 (3:1 large). Screen readers
// (VoiceOver) are a person's job.
// 10 (Building, about 3 s) is not in the list.
// npm run build && node --experimental-websocket tests/arc/a11y-check.mjs [--json] [--shots <dir>]
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildCorpus } from '../engine/corpus.mjs';
import { buildIndex, buildArc } from '../../app/src/engine/mock-core.js';
import { encodeLink } from '../../app/src/arc/link.js';

const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PORT = 4341, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const index = buildIndex(buildCorpus());
const opts = { angles: ['S', 'R', 'T'], days: [], types: ['Paper', 'Posters', 'Interactive Demos'] };
const ARC = buildArc(index, 'Does VR fidelity raise presence?', opts, { id: 'a11y-normal-001', createdAt: 2 });
const NONE = buildArc(index, 'sign language', opts, { id: 'a11y-none-0001', createdAt: 1 });
const PEND = buildArc(index, 'privacy of smart home devices', opts, { id: 'a11y-pend-0001', createdAt: 0, mode: 'pending' });
const CROWD = buildArc(index, 'Does VR fidelity raise presence?', opts, { id: 'a11y-crowd-001', createdAt: 0, mode: 'crowded' });
const OTHER = buildArc(index, 'haptic feedback', opts, { id: 'a11y-other-001', createdAt: 0 });
const draft = { query: 'Does VR fidelity raise presence?', topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: ['talks', 'posters', 'demos'] };
const device = onboarded => JSON.stringify({ version: 1, edition: 'chi2026', mode: null, step: 'research', builtAt: null,
  plan: { query: '', topicsFor: null, topics: [], nearbyAdded: [], days: [], needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers'], howFull: 'balanced' },
  arc: { onboarded, firstChi: true, draft } });
const SCREENS = [
  ['01', '#/start/1', 'Bring one question'], ['02', '#/start/2', 'The biggest week'], ['03', '#/start/3', '10+ talks run'], ['04', '#/start/4', 'Know what to do'],
  ['05', '#/start/5', 'Breaks are'], ['06', '#/start/6', 'three sides'], ['07', '#/ask', 'What are you'], ['08', '#/angles', 'Supports'],
  ['09', '#/when', 'Build my Arc'], ['11', `#/hood/${ARC.id}`, "YOU'RE IN"], ['12', `#/arc/${ARC.id}`, 'Next ·'], ['13', `#/arc/${ARC.id}/list`, 'Reframes'],
  ['14', `#/talk/${ARC.nodes[0].key}`, 'WHY IT'], ['15', `#/arc/${ARC.id}/edit`, 'Editing'], ['16', `#/share/${ARC.id}`, 'Never your name'],
  ['17', `#/qr/${ARC.id}`, 'Scan to get'], ['18', `#/r/${encodeLink(OTHER)}`, 'Shared Arc'], ['19', `#/r/${encodeLink(OTHER)}/pick`, 'Pick what to keep'],
  ['20', '#/home', 'My Arcs'], ['23', `#/arc/${NONE.id}`, 'No clear challenge'], ['24', `#/arc/${CROWD.id}`, ' more'], ['25', `#/arc/${PEND.id}`, 'Sorting angles'],
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
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails && process.env.DEBUG) console.error(r.result.exceptionDetails.exception?.description?.slice(0, 300)); return !r.result || r.result.exceptionDetails ? undefined : r.result.result.value; };
const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(150); } return false; };
const results = {};
const axe = async () => ev(`(async () => { if (!window.axe) { ${AXE}\n } const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations', 'incomplete'] });
  const pick = list => list.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ') + (n.failureSummary ? ' — ' + n.failureSummary.split('\\n').slice(1, 2).join(' ').trim() : '')) }));
  const cc = r.incomplete.find(v => v.id === 'color-contrast')?.nodes.map(n => n.target[0]).filter(t => typeof t === 'string') ?? [];
  return { violations: pick(r.violations), incomplete: r.incomplete.filter(v => v.id !== 'color-contrast').map(v => ({ id: v.id, n: v.nodes.length })), cc }; })()`);

// Contrast from pixels for the text axe left undecided.
const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
async function pixelContrast(selectors) {
  const boxes = await ev(`(() => ${JSON.stringify(selectors)}.map((sel, i) => { const el = document.querySelector(sel); if (!el || !el.innerText.trim() || el.closest('[disabled], [aria-disabled=true], .opacity-35, [data-contrast-exception]')) return null; /* inactive controls are exempt (1.4.3); [data-contrast-exception] = a user decision, listed in docs/stages/A4-ship.md */
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const g = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d'); g.fillStyle = cs.color; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data, rgba = [d[0], d[1], d[2], d[3] / 255]; /* oklch() etc. → sRGB */ const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    return { sel, i, text: el.innerText.trim().slice(0, 40), color: rgba, opacity: [...function* () { for (let e = el; e; e = e.parentElement) yield Number(getComputedStyle(e).opacity); }()].reduce((a, b) => a * b, 1),
      large: px >= 24 || (bold && px >= 18.66), x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; }).filter(Boolean))()`);
  if (!Array.isArray(boxes)) throw new Error(`pixel contrast: could not read the text boxes (${selectors.length})`);
  const out = [];
  for (const b of boxes) {
    if (b.w < 2 || b.h < 2) continue;
    const sel = JSON.stringify(b.sel);
    const r = await ev(`(() => { const el = document.querySelector(${sel}); el.scrollIntoView({ block: 'center' }); const q = el.getBoundingClientRect();
      return { x: q.x + scrollX, y: q.y + scrollY, w: q.width, h: q.height, off: q.right <= 0 || q.left >= innerWidth || q.bottom <= 0 || q.top >= innerHeight }; })()`);
    await sleep(80);
    const clip = { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 };
    const withText = (await send('Page.captureScreenshot', { format: 'png', clip })).result.data;
    await ev(`(() => { document.querySelector(${sel}).dataset.a11yHide = '1';
      if (!document.getElementById('a11y-hide')) document.head.insertAdjacentHTML('beforeend', '<style id=a11y-hide>[data-a11y-hide], [data-a11y-hide] * { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important }</style>'); return true; })()`);
    await sleep(80);
    const without = (await send('Page.captureScreenshot', { format: 'png', clip })).result.data;
    await ev(`(() => { delete document.querySelector(${sel}).dataset.a11yHide; return true; })()`);
    // glyph pixels = where the two captures differ; their background = the capture without text
    const bg = await ev(`Promise.all([${JSON.stringify(withText)}, ${JSON.stringify(without)}].map(d => new Promise(res => { const im = new Image();
      im.onload = () => { const c = Object.assign(document.createElement('canvas'), { width: im.width, height: im.height }); const g = c.getContext('2d'); g.drawImage(im, 0, 0); res(g.getImageData(0, 0, c.width, c.height).data); };
      im.src = 'data:image/png;base64,' + d; }))).then(([a, z]) => { const out = []; for (let i = 0; i < a.length; i += 4)
        if (Math.abs(a[i] - z[i]) + Math.abs(a[i + 1] - z[i + 1]) + Math.abs(a[i + 2] - z[i + 2]) > 60) out.push([z[i], z[i + 1], z[i + 2]]); return out; })`);
    if (!bg?.length) { out.push({ text: b.text, ratio: r.off ? null : 0, need: r.off ? 0 : b.large ? 3 : 4.5 }); continue; } // off screen (a side card): not measured; on screen with no visible glyph: fails
    const [cr, cg, cb, ca = 1] = b.color, alpha = ca * b.opacity;
    const ratios = bg.map(p => ratio([cr, cg, cb].map((c, k) => c * alpha + p[k] * (1 - alpha)), p)).sort((p, q) => p - q);
    out.push({ text: b.text, ratio: Math.round(ratios[Math.floor(ratios.length * 0.02)] * 100) / 100, need: b.large ? 3 : 4.5 }); // worst 2%
  }
  return out;
}

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: BASE + '?at=2026-04-14T12:00#/start/1' });
  await waitFor(`document.readyState === 'complete'`);
  await ev(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
  // 21 empty home, before any Arc is stored
  await send('Page.navigate', { url: `${BASE}?at=2026-04-14T12:00&s=21#/home` });
  if (await waitFor(`document.body.innerText.includes('Start with one question')`, 30000)) { await sleep(600); results['21'] = await axe(); results['21'].pixels = await pixelContrast(results['21'].cc); }
  else results['21'] = { error: 'did not show "Start with one question"' };
  await ev(`new Promise(r => { const q = indexedDB.open('arc', 1); q.onupgradeneeded = () => q.result.createObjectStore('arcs', { keyPath: 'id' });
    q.onsuccess = () => { const t = q.result.transaction('arcs', 'readwrite'); for (const a of ${JSON.stringify([ARC, NONE, PEND, CROWD])}) t.objectStore('arcs').put(a); t.oncomplete = () => r(true); }; })`);
  for (const [name, hash, text] of SCREENS) {
    await send('Page.navigate', { url: `${BASE}?at=2026-04-14T12:00&s=${name}${hash}` });
    const ok = await waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, 30000);
    await sleep(600); // pictures and fonts
    results[name] = ok ? await axe() : { error: `did not show "${text}"` };
    if (ok) results[name].pixels = await pixelContrast(results[name].cc);
    if (SHOTS) { await ev('scrollTo(0, 0), true'); writeFileSync(`${SHOTS}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); }
    if (name === '08') { // 22: the ? sheet over 08
      await ev(`[...document.querySelectorAll('button')].find(b => /What are Supports/.test(b.getAttribute('aria-label') ?? ''))?.click()`);
      await waitFor(`!!document.querySelector('[role=dialog]')`, 5000);
      results['22'] = await axe();
      results['22'].pixels = await pixelContrast(results['22'].cc);
    }
  }
} finally {
  const rows = Object.entries(results);
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  let bad = 0;
  for (const [name, r] of rows) {
    if (r.error) { bad++; console.log(`${name}  ERROR ${r.error}`); continue; }
    const v = r.violations.filter(x => x.impact === 'serious' || x.impact === 'critical');
    r.pixels ??= [];
    const low = r.pixels.filter(p => p.ratio != null && p.ratio < p.need), skipped = r.pixels.filter(p => p.ratio == null).length;
    r.pixels = r.pixels.filter(p => p.ratio != null);
    bad += v.length + low.length;
    console.log(`${name}  ${r.violations.length ? r.violations.map(x => `${x.id}(${x.impact},${x.n})`).join(' ') : 'no violations'}  · contrast from pixels: ${r.pixels.length ? `${r.pixels.length - low.length}/${r.pixels.length}, lowest ${Math.min(...r.pixels.map(p => p.ratio))}` : '—'}${skipped ? ` (${skipped} without glyphs on screen, not measured)` : ''}${r.incomplete.length ? `  · needs a look: ${r.incomplete.map(x => `${x.id}(${x.n})`).join(' ')}` : ''}`);
    for (const x of r.violations) for (const n of x.nodes) console.log(`      ${x.id}: ${n.slice(0, 160)}`);
    for (const p of low) console.log(`      contrast ${p.ratio} < ${p.need}: "${p.text}"`);
  }
  console.log(bad ? `FAIL: ${bad} serious, critical or low contrast` : `PASS: ${rows.length} screens, no serious or critical violations, contrast from pixels passes`);
  ws.close(); chrome.kill(); try { process.kill(-server.pid); } catch {}
  process.exit(bad ? 1 : 0);
}
