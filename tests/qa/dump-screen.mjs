// Figma comparison helper: open screens as an iPhone with Figma's frame (390×844, safe area 54 top / 34 bottom, so app
// coordinates are Figma frame coordinates) and write, per screen, every visible element's box and style as JSON, plus a
// 2× screenshot and one with all text made transparent (for overlaying on the Figma render without the content).
//   npm run build && node --experimental-websocket tests/qa/dump-screen.mjs <out dir> [01 12 14 …]   (default: all 25)
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer, launchChrome, phone, sleep } from './cdp.mjs';
import { STORED, device, SCREENS, seedArcs } from './screens.mjs';

const [out, ...want] = process.argv.slice(2);
if (!out) { console.error('usage: dump-screen.mjs <out dir> [screen …]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const list = SCREENS.filter(([n]) => !want.length || want.includes(n));

function dump() {
  const rgb = c => { const g = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d'); g.clearRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return d[3] ? `rgba(${d[0]},${d[1]},${d[2]},${+(d[3] / 255).toFixed(2)})` : null; };
  const opacity = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return +o.toFixed(2); };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.sr-only, script, style, head')) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
    const bg = rgb(cs.backgroundColor), bimg = cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 120) : null;
    const bw = parseFloat(cs.borderTopWidth), shadow = cs.boxShadow !== 'none' ? cs.boxShadow.slice(0, 100) : null;
    const pic = ['IMG', 'svg', 'SVG'].includes(el.tagName);
    if (!own && !bg && !bimg && !bw && !pic && !shadow) continue;
    const e = { tag: el.tagName.toLowerCase(), box: [r.x, r.y, r.width, r.height].map(v => Math.round(v * 2) / 2) };
    if (own) Object.assign(e, { text: own.slice(0, 60), font: `${cs.fontSize} ${cs.fontWeight} / ${cs.lineHeight} ls ${cs.letterSpacing}`, color: rgb(cs.color) });
    if (bg) e.bg = bg; if (bimg) e.bgImage = bimg;
    if (bw) e.border = `${cs.borderTopWidth} ${cs.borderTopStyle} ${rgb(cs.borderTopColor)}`;
    if (parseFloat(cs.borderTopLeftRadius)) e.radius = cs.borderTopLeftRadius;
    if (shadow) e.shadow = shadow;
    if (pic) e.src = (el.getAttribute('src') ?? '').split('/').pop().replace(/-[A-Za-z0-9_]{6,}(?=\.)/, '');
    const o = opacity(el); if (o < 1) e.opacity = o;
    const label = el.getAttribute('aria-label'); if (label) e.label = label.slice(0, 50);
    out.push(e);
  }
  return out;
}

const server = await startServer(4389);
const chrome = await launchChrome();
try {
  const tab = await chrome.first();
  await phone(tab, { cpu: 1 });
  await tab.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 54, bottom: 34, left: 0, right: 0 } });
  await tab.send('Page.navigate', { url: `${server.base}#/start/1` });
  await tab.waitFor(`document.readyState === 'complete'`);
  await tab.ev(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
  await tab.ev(seedArcs(STORED));
  for (const [name, hash, text] of list) {
    await tab.send('Page.navigate', { url: `${server.base}?at=2026-04-14T12:00${name === '10' ? '&mock=slow' : ''}&s=${name}${hash}` });
    const ok = await tab.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, 30000);
    if (!ok) { console.log(`${name}: did not show "${text}"`); continue; }
    await sleep(name === '10' ? 300 : 900);
    await tab.ev(`(document.documentElement.style.setProperty('--arc-glow-paused', '1'), document.querySelectorAll('*').forEach(e => e.getAnimations?.().forEach(a => a.pause())), true)`);
    const shot = async f => writeFileSync(`${out}/${name}${f}.png`, Buffer.from((await tab.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
    writeFileSync(`${out}/${name}.json`, JSON.stringify(await tab.ev(`(${dump})()`), null, 1));
    await shot('');
    await tab.ev(`(document.head.insertAdjacentHTML('beforeend', '<style id=qa-notext>* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }</style>'), true)`);
    await shot('-notext');
    console.log(`${name}: ok`);
  }
} finally {
  await chrome.close(); server.stop();
}
