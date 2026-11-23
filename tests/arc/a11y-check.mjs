// Accessibility check (A4): axe-core (WCAG 2.0/2.1/2.2 A + AA rules) on every Arc screen at 390×844, plus the 22 sheet.
// Reports each rule that fails with its impact and the first elements. Text axe cannot judge (over a picture, a
// gradient or another layer) is measured from pixels: its box is captured with and without the text; under the glyphs
// (the pixels that differ) the worst 2% of the background against the text colour must reach 4.5:1 (3:1 large). Screen readers
// (VoiceOver) are a person's job.
// 10 (Building) opens with ?mock=slow (5 s) so it stays long enough to check.
// Also (QA 5, 7): every screen at 390, 375 and 360 wide must not scroll sideways (16 also while its cards are swiped);
// every control must take a press 22 px from its centre in all four directions (44 px, its own hit area, so a
// ::before that widens it counts and a neighbour that covers it does not); visible text must be 12 px or more on screen
// (font size × the scale of its scaled map). Exceptions with reasons: tests/qa/a11y-exceptions.json.
// npm run build && node --experimental-websocket tests/arc/a11y-check.mjs [--json] [--shots <dir>]
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ARC, NONE, PEND, CROWD, STORED, device, SCREENS, seedArcs, buttonsProbe } from '../qa/screens.mjs';
import { tempProfile, portFree, devtools } from '../qa/cdp.mjs';

const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PORT = 4341, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EXCEPT = JSON.parse(readFileSync(new URL('../qa/a11y-exceptions.json', import.meta.url), 'utf8')).allow;

await portFree(PORT);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const PROFILE = tempProfile('arc-a11y');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let targets;
const DEVTOOLS = await devtools(PROFILE); // a free port: never a Chrome left by an earlier run
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`${DEVTOOLS}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails && process.env.DEBUG) console.error(r.result.exceptionDetails.exception?.description?.slice(0, 300)); return !r.result || r.result.exceptionDetails ? undefined : r.result.result.value; };
const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(150); } return false; };
const results = {};
const SHRINK = ['12', '18', '23', '24', '25']; // map screens whose map follows the height (ArcView useMapFit)
// 44 px targets and 12 px text, in the page. Returns what fails, with a short name for each element.
const sizes = () => ev(`(async () => {
  const except = ${JSON.stringify(EXCEPT)};
  const exempt = (el, kind) => except.some(x => x.kind === kind && el.closest(x.closest));
  const name = el => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40);
  const shown = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[aria-hidden=true] [aria-hidden=true], .sr-only'); };
  const small = [], tiny = [];
  const modal = document.querySelector('[role=dialog]'); // an open sheet: only what is in it can be pressed
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])')) {
    if (!shown(el) || el.closest('.sr-only') || exempt(el, 'target') || (modal && !modal.contains(el))) continue;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    await new Promise(r => requestAnimationFrame(r));
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const pts = [[cx - 21.5, cy], [cx + 21.5, cy], [cx, cy - 21.5], [cx, cy + 21.5]];
    const hits = pts.map(([x, y]) => document.elementFromPoint(x, y));
    const box = el.matches('input, select, textarea') ? el.closest('label') : null; // a press on its label focuses it
    const miss = hits.filter(h => !h || !(h === el || el.contains(h) || (box && box.contains(h))));
    if (miss.length) small.push({ el: name(el), w: Math.round(r.width), h: Math.round(r.height), missed: miss.length, hit: miss[0] ? miss[0].tagName + '.' + String(miss[0].className).slice(0, 40) : 'nothing' });
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || el.closest('.sr-only, script, style') || exempt(el, 'font') || !shown(el) || (modal && !modal.contains(el))) continue;
    // the drawn scale: the CSS transforms above it (a map drawn at 0.62 sets its text at 12 / 0.62); a height ratio
    // was 2.5 % off on small text, as offsetHeight is a whole number
    let scale = 1;
    for (let e = el; e; e = e.parentElement) { const t = getComputedStyle(e).transform; if (t && t !== 'none') { const m = new DOMMatrix(t); scale *= Math.hypot(m.a, m.b); } }
    const px = parseFloat(getComputedStyle(el).fontSize) * (scale || 1);
    if (px < 11.85) tiny.push({ text: n.textContent.trim().slice(0, 30), px: +px.toFixed(1) });
  }
  scrollTo(0, 0);
  return { small, tiny: tiny.slice(0, 8), tinyCount: tiny.length };
})()`);
// Buttons on one line at 100% and 200% text (tests/qa/screens.mjs buttonsProbe, shared with the WebKit check)
const buttons = () => ev(`(${buttonsProbe})()`);
// sideways scroll at three widths (and, on 16, while the cards are swiped)
const overflow = async name => {
  const out = [];
  // three widths, each at 844 (Figma's frame) and 664 (Safari with its toolbars, user 11/22): the map's size follows the height
  for (const [w, h] of [390, 375, 360].flatMap(w => [[w, 844], [w, 664]])) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await sleep(250);
    const steps = name === '16' ? [0, 0.25, 0.5, 0.75, 1] : [null];
    for (const f of steps) {
      if (f != null) await ev(`(() => { const s = document.querySelector('[aria-label="What people see"]'); if (s) s.scrollLeft = (s.scrollWidth - s.clientWidth) * ${f}; return true; })()`);
      await sleep(f != null ? 150 : 0);
      const m = await ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth })`);
      if (m && (m.sw > m.cw || m.bw > m.cw)) out.push({ width: w, height: h, swipe: f, ...m });
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  return out;
};
const axe = async () => ev(`(async () => { if (!window.axe) { ${AXE}\n } const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations', 'incomplete'] });
  const pick = list => list.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ') + (n.failureSummary ? ' — ' + n.failureSummary.split('\\n').slice(1, 2).join(' ').trim() : '')) }));
  const cc = r.incomplete.find(v => v.id === 'color-contrast')?.nodes.map(n => n.target[0]).filter(t => typeof t === 'string') ?? [];
  return { violations: pick(r.violations), incomplete: r.incomplete.filter(v => v.id !== 'color-contrast').map(v => ({ id: v.id, n: v.nodes.length })), cc }; })()`);

// Contrast from pixels for the text axe left undecided.
const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
async function pixelContrast(selectors) {
  const boxes = await ev(`(() => ${JSON.stringify(selectors)}.map((sel, i) => { const el = document.querySelector(sel); if (!el || !el.innerText.trim() || el.closest('[disabled], [aria-disabled=true], .opacity-35, ' + ${JSON.stringify(EXCEPT.filter(x => x.kind === 'contrast').map(x => x.closest).join(', ') || ':not(*)')})) return null; /* inactive controls are exempt (1.4.3); contrast exceptions: tests/qa/a11y-exceptions.json */
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
  if (await waitFor(`document.body.innerText.includes('Start with one question')`, 30000)) { await sleep(600); results['21'] = await axe(); results['21'].pixels = await pixelContrast(results['21'].cc); results['21'].sizes = await sizes(); results['21'].buttons = await buttons(); results['21'].overflow = await overflow('21'); }
  else results['21'] = { error: 'did not show "Start with one question"' };
  await ev(seedArcs(STORED));
  for (const [name, hash, text] of SCREENS) {
    await send('Page.navigate', { url: `${BASE}?at=2026-04-14T12:00${name === '10' ? '&mock=slow' : ''}&s=${name}${hash}` });
    const ok = await waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, 30000);
    await sleep(name === '10' ? 150 : 600); // pictures and fonts (10 is gone after 5 s)
    // where the page was instead, so a "did not open" says why
    results[name] = ok ? await axe() : { error: `did not show "${text}" (at ${await ev(`location.hash + ' · ' + document.body.innerText.replace(/\\s+/g, ' ').slice(0, 80)`)})` };
    if (ok) results[name].pixels = await pixelContrast(results[name].cc);
    if (ok) { results[name].sizes = await sizes(); results[name].buttons = await buttons(); if (name !== '10') results[name].overflow = await overflow(name); }
    // maps shrink to the height (Safari 664, user 11/22 「글자 12px·누르는 영역 44px는 유지」): targets and text again there
    if (ok && SHRINK.includes(name)) {
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 664, deviceScaleFactor: 2, mobile: true });
      await sleep(400);
      const s664 = await sizes();
      results[name].sizes.small.push(...s664.small.map(x => ({ ...x, el: `${x.el} (664)` })));
      results[name].sizes.tiny.push(...s664.tiny.map(x => ({ ...x, text: `${x.text} (664)` })));
      results[name].sizes.tinyCount += s664.tinyCount;
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await sleep(200);
    }
    if (ok && name === '10') results[name].still = await ev(`document.body.innerText.includes(${JSON.stringify(text)})`); // measured while 10 was showing
    if (SHOTS) { await ev('scrollTo(0, 0), true'); writeFileSync(`${SHOTS}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); }
    if (name === '08') { // 22: the ? sheet over 08
      await ev(`[...document.querySelectorAll('button')].find(b => /What are Supports/.test(b.getAttribute('aria-label') ?? ''))?.click()`);
      await waitFor(`!!document.querySelector('[role=dialog]')`, 5000);
      results['22'] = await axe();
      results['22'].pixels = await pixelContrast(results['22'].cc);
      results['22'].sizes = await sizes();
      results['22'].buttons = await buttons();
    }
  }
} finally {
  const rows = Object.entries(results);
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  let bad = 0;
  for (const [name, r] of rows) {
    if (r.error) { bad++; console.log(`${name}  ERROR ${r.error}`); console.log(`      [${name}] did not open: ${r.error}`); continue; }
    const v = r.violations.filter(x => x.impact === 'serious' || x.impact === 'critical');
    r.pixels ??= [];
    const low = r.pixels.filter(p => p.ratio != null && p.ratio < p.need), skipped = r.pixels.filter(p => p.ratio == null).length;
    r.pixels = r.pixels.filter(p => p.ratio != null);
    const sz = r.sizes ?? { small: [], tiny: [], tinyCount: 0 }, of = r.overflow ?? [];
    const gone = name === '10' && r.still === false ? 1 : 0;
    const bt = r.buttons ?? { checked: 0, bad: [] };
    bad += v.length + low.length + sz.small.length + sz.tinyCount + of.length + gone + bt.bad.length;
    console.log(`${name}  ${r.violations.length ? r.violations.map(x => `${x.id}(${x.impact},${x.n})`).join(' ') : 'no violations'}  · contrast from pixels: ${r.pixels.length ? `${r.pixels.length - low.length}/${r.pixels.length}, lowest ${Math.min(...r.pixels.map(p => p.ratio))}` : '—'}${skipped ? ` (${skipped} without glyphs on screen, not measured)` : ''}${r.incomplete.length ? `  · needs a look: ${r.incomplete.map(x => `${x.id}(${x.n})`).join(' ')}` : ''}`);
    for (const x of r.violations) for (const n of x.nodes) console.log(`      [${name}] ${x.id}: ${n.slice(0, 160)}`);
    for (const p of low) console.log(`      [${name}] contrast ${p.ratio} < ${p.need}: "${p.text}"`);
    for (const t of sz.small) console.log(`      [${name}] target under 44 px: "${t.el}" ${t.w}×${t.h}, ${t.missed} of 4 presses missed (hit ${t.hit})`);
    for (const t of sz.tiny) console.log(`      [${name}] text under 12 px: "${t.text}" ${t.px}px`);
    if (sz.tinyCount > sz.tiny.length) console.log(`      [${name}] … ${sz.tinyCount - sz.tiny.length} more under 12 px`);
    for (const o of of) console.log(`      [${name}] scrolls sideways at ${o.width}${o.swipe != null ? ` (cards swiped ${o.swipe * 100}%)` : ''}: scrollWidth ${o.sw} > ${o.cw}`);
    if (gone) console.log('      [10] changed screen before the check ended');
    for (const x of bt.bad) console.log(`      [${name}] button not on one line at ${x.zoom}%: "${x.el}" ${x.lines} lines${x.cut ? ', words cut off' : ''}${x.off ? ', off screen' : ''}`);
  }
  console.log(bad ? `FAIL: ${bad} (serious/critical, low contrast, target under 44 px, text under 12 px, sideways scroll)` : `PASS: ${rows.length} screens: no serious or critical violations, contrast, 44 px targets, 12 px text, buttons on one line (100% and 200% text), no sideways scroll at 390/375/360 × 844/664`);
  ws.close(); chrome.kill(); try { process.kill(-server.pid); } catch {}
  process.exit(bad ? 1 : 0);
}
