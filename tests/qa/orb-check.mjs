// The question on the orb (QA, user 11/20: it is the content, not a decoration): white text must reach 4.5:1 on the
// orb in all 8 tribe colours, on the map (12; 15·18·19·23·24·25 draw the same ArcView orb) and on 10 (Building).
// Each tribe is set on the page root (data-tribe, as the app does) and the text is measured under its glyphs: the orb is
// captured with and without the text; where the pixels differ, the worst 2% of the background against the text colour.
//   npm run build && node --experimental-websocket tests/qa/orb-check.mjs [--shots <dir> [--tribes ai,health,design] [--name before]]
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCorpus } from '../engine/corpus.mjs';
import { buildIndex, buildArc } from '../../app/src/engine/mock-core.js';
import { TRIBE } from '../../app/src/arc/tribes.js';
import { startServer, launchChrome, phone, reporter, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const arg = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const SHOTS = arg('--shots'), SHOT_TRIBES = (arg('--tribes') ?? 'ai,health,design').split(','), NAME = arg('--name') ?? 'after';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const TRIBES = Object.keys(TRIBE);
const QUESTION = '[data-orb-question], [data-contrast-exception=figma-orb]'; // the second: builds before this check
const index = buildIndex(buildCorpus());
const ARC = buildArc(index, 'Does VR fidelity raise presence?', { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: 'orb-check-00001', createdAt: 0 });
const draft = { query: ARC.query, topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: ['talks', 'posters', 'demos'] };
const device = JSON.stringify({ version: 1, edition: 'chi2026', mode: null, step: 'research', builtAt: null,
  plan: { query: '', topicsFor: null, topics: [], nearbyAdded: [], days: [], needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers'], howFull: 'balanced' },
  arc: { onboarded: true, firstChi: false, draft } });
const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const R = reporter('orb');
const server = await startServer(4377);
const chrome = await launchChrome();
let code = 1;
try {
  const tab = await chrome.first();
  await phone(tab, { cpu: 1 });
  await tab.send('Page.navigate', { url: `${server.base}#/start/1` });
  await tab.waitFor(`document.readyState === 'complete'`);
  await tab.ev(`localStorage.setItem('arc.device', ${JSON.stringify(device)}); true`);
  await tab.ev(`new Promise(r => { const q = indexedDB.open('arc', 1); q.onupgradeneeded = () => q.result.createObjectStore('arcs', { keyPath: 'id' });
    q.onsuccess = () => { const t = q.result.transaction('arcs', 'readwrite'); t.objectStore('arcs').put(${JSON.stringify(ARC)}); t.oncomplete = () => { q.result.close(); r(true); }; }; })`);
  async function measure(tribe) {
    await tab.ev(`(document.documentElement.dataset.tribe = ${JSON.stringify(tribe)}, true)`);
    await sleep(250);
    const box = await tab.ev(`(() => { const el = document.querySelector(${JSON.stringify(QUESTION)}); if (!el) return null; const r = el.getBoundingClientRect();
      const g = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d'); g.fillStyle = getComputedStyle(el).color; g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data; return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, color: [d[0], d[1], d[2], d[3] / 255] }; })()`);
    if (!box) return null;
    const clip = { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 };
    const withText = (await tab.send('Page.captureScreenshot', { format: 'png', clip })).result.data;
    await tab.ev(`(() => { const el = document.querySelector(${JSON.stringify(QUESTION)}); el.style.setProperty('color', 'transparent', 'important'); return true; })()`);
    await sleep(60);
    const without = (await tab.send('Page.captureScreenshot', { format: 'png', clip })).result.data;
    await tab.ev(`(() => { document.querySelector(${JSON.stringify(QUESTION)}).style.removeProperty('color'); return true; })()`);
    const bg = await tab.ev(`Promise.all([${JSON.stringify(withText)}, ${JSON.stringify(without)}].map(d => new Promise(res => { const im = new Image();
      im.onload = () => { const c = Object.assign(document.createElement('canvas'), { width: im.width, height: im.height }); const g = c.getContext('2d'); g.drawImage(im, 0, 0); res(g.getImageData(0, 0, c.width, c.height).data); };
      im.src = 'data:image/png;base64,' + d; }))).then(([a, z]) => { const out = []; for (let i = 0; i < a.length; i += 4)
        if (Math.abs(a[i] - z[i]) + Math.abs(a[i + 1] - z[i + 1]) + Math.abs(a[i + 2] - z[i + 2]) > 60) out.push([z[i], z[i + 1], z[i + 2]]); return out; })`);
    if (!bg?.length) return { ratio: 0, glyphs: 0 };
    const [cr, cg, cb, ca] = box.color;
    const rs = bg.map(p => ratio([cr, cg, cb].map((c, k) => c * ca + p[k] * (1 - ca)), p)).sort((a, b) => a - b);
    return { ratio: +rs[Math.floor(rs.length * 0.02)].toFixed(2), glyphs: bg.length };
  }
  async function shot(screen, tribe) {
    if (!SHOTS || !SHOT_TRIBES.includes(tribe)) return;
    const c = await tab.ev(`(() => { const o = document.querySelector('.arc-orb').getBoundingClientRect(); return { x: o.x + scrollX - 110, y: o.y + scrollY - 70, width: o.width + 220, height: o.height + 140, scale: 2 }; })()`);
    writeFileSync(`${SHOTS}/${NAME}-${screen}-${tribe}.png`, Buffer.from((await tab.send('Page.captureScreenshot', { format: 'png', clip: c })).result.data, 'base64'));
  }
  // 12 map
  await tab.send('Page.navigate', { url: `${server.base}?at=2026-04-14T12:00#/arc/${ARC.id}` });
  R.check('12 map shows its orb question', (await tab.waitFor(`!!document.querySelector(${JSON.stringify(QUESTION)})`, 30000)) != null, {});
  await sleep(600);
  const map = {};
  for (const t of TRIBES) { map[t] = await measure(t); await shot('12', t); }
  for (const t of TRIBES) R.check(`12 map, ${t}: question ${map[t]?.ratio ?? '—'}:1 ≥ 4.5`, (map[t]?.ratio ?? 0) >= 4.5, {});
  // 10 building (5 s with ?mock=slow): measure all 8 while it shows
  await tab.send('Page.navigate', { url: `${server.base}?at=2026-04-14T12:00&mock=slow#/building` });
  // "Sorting angles… N%" while the engine gets ready (11/21), then "Reading N talks": both are 10
  const ten = (await tab.waitFor(`/Reading|Sorting angles/.test(document.body.innerText) && !!document.querySelector(${JSON.stringify(QUESTION)})`, 30000)) != null;
  const b = {};
  if (ten) for (const t of TRIBES) { b[t] = await measure(t); await shot('10', t); }
  const still = await tab.ev(`/Reading|Sorting angles/.test(document.body.innerText)`);
  R.check('10 stayed on screen while measured', ten && still, {});
  for (const t of TRIBES) R.check(`10 building, ${t}: question ${b[t]?.ratio ?? '—'}:1 ≥ 4.5`, (b[t]?.ratio ?? 0) >= 4.5, {});
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message}`);
  R.done();
} finally {
  await chrome.close(); server.stop();
  process.exit(code);
}
