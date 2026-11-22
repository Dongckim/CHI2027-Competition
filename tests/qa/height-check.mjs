// No vertical scroll on short screens (user 11/20 「모든 화면에서 스크롤이 안 생기는지(내용이 짧은 화면 기준)」): as an iPhone
// with a real safe area (54 top, 34 bottom; the body pads the top, so a screen sized 100dvh scrolled by 54).
// A screen is short when its content fits: the sum of the content's own heights (header, main's children, the fixed
// bottom area) is under the viewport. Short screens must not scroll at all; long ones (14, 13 …) may.
// Map screens (12, 15, 18, 23, 24, 25) fit on one screen as Figma draws them, so they must never scroll, and every node
// (its 44 px area at least), "+N" bundle and the orb sits between the header and the fixed bottom area.
//   npm run build && node --experimental-websocket tests/qa/height-check.mjs
import { startServer, launchChrome, phone, reporter, sleep } from './cdp.mjs';
import { STORED, ARC, device, SCREENS, seedArcs } from './screens.mjs';

const probe = () => {
  const root = document.querySelector('.arc'); if (!root) return null;
  const h = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); };
  const main = root.querySelector('main');
  let content = parseFloat(getComputedStyle(document.body).paddingTop);
  for (const part of root.children) {
    if (part !== main) { content += h(part); continue; }
    const cs = getComputedStyle(main);
    content += parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    // main's children, without the stretch a flex-1 or mt-auto adds
    let used = 0;
    for (const c of main.children) { const ccs = getComputedStyle(c); if (ccs.position === 'fixed' || ccs.position === 'absolute') continue; used += c.getBoundingClientRect().height + (ccs.marginTop === 'auto' ? 0 : parseFloat(ccs.marginTop)) + (ccs.marginBottom === 'auto' ? 0 : parseFloat(ccs.marginBottom)); }
    content += used + Math.max(0, (main.children.length - 1) * (parseFloat(cs.rowGap) || 0));
  }
  return { content: Math.round(content), view: innerHeight, scroll: document.documentElement.scrollHeight };
};

// 12 with one Reframe: its seat (195, 470) is the lowest a two-line title reaches
const ONE_R = { ...ARC, id: 'height-one-r-01', nodes: ARC.nodes.filter((n, i, a) => n.angle !== 'R' || a.findIndex(x => x.angle === 'R') === i) };
const MAPS = ['12', '12·1R', '15', '18', '23', '24', '25'];
// In the page: map targets that reach under the header or the fixed bottom area, or overlap a bottom button.
const mapProbe = () => {
  const grow = r => { const w = Math.max(44, r.width), h = Math.max(44, r.height), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return { l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 }; };
  const bottom = document.querySelector('.arc > .sticky.bottom-0'), header = document.querySelector('.arc > header');
  const floor = bottom ? bottom.getBoundingClientRect().top : innerHeight - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom') || 0);
  const ceil = header ? header.getBoundingClientRect().bottom : parseFloat(getComputedStyle(document.body).paddingTop);
  const pressable = bottom ? [...bottom.querySelectorAll('a, button')].map(e => e.getBoundingClientRect()).filter(r => r.width && r.height) : [];
  const targets = [...document.querySelectorAll('main button[aria-description], main button:has([data-a11y-decor=bundle-count])')]
    .map(e => [e.innerText.replace(/\s+/g, ' ').trim().slice(0, 40), e.getBoundingClientRect()]);
  const orb = document.querySelector('main .arc-orb'); if (orb) targets.push(['orb', orb.getBoundingClientRect()]);
  const bad = []; let gap = Infinity;
  for (const [label, r] of targets) {
    const g = grow(r); gap = Math.min(gap, floor - g.b);
    const hit = pressable.some(p => g.l < p.right && g.r > p.left && g.t < p.bottom && g.b > p.top);
    if (g.b > floor || g.t < ceil || hit) bad.push({ label, top: Math.round(g.t), bottom: Math.round(g.b), ceil: Math.round(ceil), floor: Math.round(floor), hit });
  }
  return { n: targets.length, gap: Math.round(gap), bad };
};

// In the page: each map node's ring and the text it shows (the drawn letters, not the 104 px box) must not touch another
// node's (independent check 11/22: 12 px labels ran into the next node on maps drawn at 0.78).
const OVERLAP = [...MAPS, '19', '19b'];
const overlapProbe = () => {
  const parts = b => {
    const out = [...b.querySelectorAll('.arc-node')].map(e => e.getBoundingClientRect());
    for (const sp of b.querySelectorAll('span')) {
      if (sp.closest('.sr-only') || sp.children.length && !sp.textContent.trim() || getComputedStyle(sp).display === 'none') continue;
      // the letters as drawn: a clamped or truncated span hides the rest, so clip to the span's own box
      const box = sp.getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(sp);
      for (const x of r.getClientRects()) {
        const c = { left: Math.max(x.left, box.left), right: Math.min(x.right, box.right), top: Math.max(x.top, box.top), bottom: Math.min(x.bottom, box.bottom) };
        if (c.right - c.left > 1 && c.bottom - c.top > 1) out.push(c);
      }
    }
    return out;
  };
  const nodes = [...document.querySelectorAll('main [data-node-key], main button:has([data-a11y-decor=bundle-count])')].map(b => ({ label: b.innerText.replace(/\s+/g, ' ').trim().slice(0, 30), rects: parts(b) }));
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const bad = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++)
    if (nodes[i].rects.some(a => nodes[j].rects.some(b => hit(a, b)))) bad.push(`${nodes[i].label} × ${nodes[j].label}`);
  return { n: nodes.length, bad };
};

const R = reporter('height');
const server = await startServer(4397);
const chrome = await launchChrome();
let code = 1;
try {
  const tab = await chrome.first();
  await phone(tab, { cpu: 1 });
  await tab.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 54, bottom: 34, left: 0, right: 0 } });
  await tab.send('Page.navigate', { url: `${server.base}#/start/1` });
  await tab.waitFor(`document.readyState === 'complete'`);
  await tab.ev(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
  await tab.ev(seedArcs(STORED));
  const bad = [], long = [], clear = [], gaps = [], overlaps = [];
  for (const [name, hash, text] of [...SCREENS, ['12·1R', `#/arc/${ONE_R.id}`, 'Next ·']]) {
    if (name === '12·1R') await tab.ev(seedArcs([ONE_R])); // after 20, so its list stays as the other checks see it
    await tab.send('Page.navigate', { url: `${server.base}?at=2026-04-14T12:00${name === '10' ? '&mock=slow' : ''}&s=${encodeURIComponent(name)}${hash}` });
    if (!(await tab.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, 30000))) { bad.push({ screen: name, error: `did not show "${text}"` }); continue; }
    await sleep(name === '10' ? 300 : 700);
    const m = await tab.ev(`(${probe})()`);
    if (!m) { bad.push({ screen: name, error: 'no .arc root' }); continue; }
    if (OVERLAP.includes(name)) {
      const o = await tab.ev(`(${overlapProbe})()`);
      if (!o.n || o.bad.length) overlaps.push({ screen: name, nodes: o.n, bad: o.bad });
    }
    if (MAPS.includes(name)) {
      if (m.scroll > m.view) bad.push({ screen: name, map: 'scrolls', ...m });
      const c = await tab.ev(`(${mapProbe})()`);
      gaps.push(`${name}:${c.gap}`);
      if (!c.n || c.bad.length) clear.push({ screen: name, targets: c.n, bad: c.bad });
      continue;
    }
    if (m.content > m.view) { long.push(`${name}(${m.content}/${m.scroll})`); continue; }
    if (m.scroll > m.view) bad.push({ screen: name, ...m });
  }
  R.check(`short screens do not scroll (iPhone, safe area 54/34); long: ${long.join(' ') || 'none'}`, bad.length === 0, bad.length ? { bad } : {});
  R.check(`map nodes do not touch each other (${OVERLAP.join(' ')})`, overlaps.length === 0, overlaps.length ? { overlaps } : {});
  R.check(`map nodes and orb clear of the header and bottom area (44 px areas; smallest gap ${gaps.join(' ')})`, clear.length === 0, clear.length ? { clear } : {});
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message.split('\n')[0]}`);
  R.done();
} finally {
  await chrome.close(); server.stop();
  process.exit(code);
}
