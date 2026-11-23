// GET /api/og?d=<payload> → the 1200×630 link preview picture for a share link (the share page's og:image), as Figma's
// "OG · <tribe> · 1200×630" frames (746:1913 XR, 746:1948 Accessibility, 746:1982 AI): the tribe chip, the question,
// "↑ n support  ↻ n reframe  ⊣ n challenge", "n talks · n rooms · Tue 14 · CHI 2026", the credit line, and on the right
// the tribe shape with the talks as nodes around it. Drawn from the link alone plus a build-time talk index
// (functions/og-data.json: day, room, demo per talk). Stateless, nothing logged, cached for a year.
// satori lays it out as SVG (text becomes paths), resvg-wasm makes the PNG. Fonts: Inter 400/500/600 latin.
import { readFile } from 'node:fs/promises';
import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { decodeLink, angleCounts } from '../app/src/arc/link.js';
import { TRIBE } from '../app/src/arc/tribes.js';

const file = p => readFile(new URL(p, import.meta.url));
// Named as literals so the deploy's file tracing ships them (vercel.json includeFiles with a new path failed a build):
export const HARFBUZZ_WASM = new URL('../node_modules/harfbuzzjs/hb.wasm', import.meta.url); // satori's harfbuzzjs reads it
const INTER_500 = new URL('../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff', import.meta.url);
const OG_DATA = new URL('./og-data.json', import.meta.url);
const FIGMA_SHAPES = { // the three tribes Figma draws
  xr: new URL('../app/src/assets/arc/tribe-og-xr.svg', import.meta.url),
  access: new URL('../app/src/assets/arc/tribe-og-access.svg', import.meta.url),
  ai: new URL('../app/src/assets/arc/tribe-og-ai.svg', import.meta.url),
};
const b64 = text => `data:image/svg+xml;base64,${Buffer.from(text).toString('base64')}`;
let ready = null, wasm = null;
const assets = () => (ready ??= (async () => {
  await (wasm ??= initWasm(await file('../node_modules/@resvg/resvg-wasm/index_bg.wasm'))); // once per instance: a second initWasm throws
  const [regular, bold] = await Promise.all(['400', '600'].map(w => file(`../node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff`)));
  const medium = await readFile(INTER_500);
  const svgText = async name => (await file(`../app/src/assets/arc/${name}.svg`)).toString();
  const icons = Object.fromEntries(await Promise.all(Object.keys(TRIBE).map(async t => [t, await svgText(`tribe-${t}`)])));
  const angles = { S: await svgText('angle-support'), R: await svgText('angle-reframe'), T: await svgText('angle-challenge') };
  const regions = (await svgText('og-regions')).replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''); // Figma 813:2063, 600 × 630
  const shapes = Object.fromEntries(await Promise.all(Object.entries(FIGMA_SHAPES).map(async ([t, u]) => [t, (await readFile(u)).toString()])));
  let data = null; try { data = JSON.parse(await readFile(OG_DATA, 'utf8')); } catch { /* not built: no talks line */ }
  return { fonts: [{ name: 'Inter', data: regular, weight: 400 }, { name: 'Inter', data: medium, weight: 500 }, { name: 'Inter', data: bold, weight: 600 }], icons, angles, regions, shapes, data };
})().catch(e => { ready = null; throw e; }));

const h = (type, style, children) => ({ type, props: { style, children } });
// An SVG's drawing inside another SVG (resvg does not draw an <image> of an SVG nested in an SVG): its children, scaled
// from its viewBox into (x, y, size); ids made unique so two gradients do not clash.
let uid = 0;
function place(svgText, x, y, size) {
  const vb = (svgText.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24').split(/\s+/).map(Number);
  const k = ++uid;
  const body = svgText.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/id="([^"]+)"/g, `id="$1_${k}"`).replace(/url\(#([^)]+)\)/g, `url(#$1_${k})`);
  return `<g transform="translate(${x - vb[0] * size / vb[2]} ${y - vb[1] * size / vb[3]}) scale(${size / vb[2]} ${size / vb[3]})">${body}</g>`;
}
const mix = (hex, to, f) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - f) + to * f).toString(16).padStart(2, '0')).join('');
// The tribe shape, 300 × 300. Figma's own for xr, access, ai; the others from the tribe icon at Figma's scale, its corners
// rounded and the same top-to-bottom gradient (the colour mixed 36.5% toward white at the top, as Figma's three).
function shape(t, a) {
  if (a.shapes[t]) return a.shapes[t];
  const c = TRIBE[t].color, inner = a.icons[t].replace(/<svg[^>]*>|<\/svg>/g, '').replace(/fill="#[0-9A-Fa-f]{3,8}"/g, 'fill="url(#g)" stroke="url(#g)" stroke-width="1.6" stroke-linejoin="round"');
  return `<svg width="300" height="300" viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="2" x2="0" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="${mix(c, 255, 0.365)}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><g transform="translate(-18 -18) scale(14)">${inner}</g></svg>`;
}
// The right side (Figma 11/23, 746:1913 / 746:1948): the 12 map's three regions round the shape's centre (940, 315),
// Supports above, Reframes lower left, Challenges lower right; links from the shape's ring (r 124) to each node, a
// Challenge's with its bar; then the shape, then the nodes, each a 44 circle with its angle symbol. Seats by count.
const SEATS = {
  S: [[[940, 83]], [[853.1, 99.9], [1026.9, 99.9]], [[817.1, 118.3], [940, 83], [1062.9, 118.3]]],
  R: [[[739.1, 431]], [[710.3, 347.3], [797.2, 497.8]]],
  T: [[[1140.9, 431]], [[1169.7, 347.3], [1082.8, 497.8]]],
};
function picture(t, counts, a) {
  const nodes = ['S', 'R', 'T'].flatMap(k => { const n = Math.min(counts[k], SEATS[k].length); return n ? SEATS[k][n - 1].map(xy => ({ k, xy })) : []; });
  const line = ({ k, xy: [x, y] }) => {
    const dx = x - 940, dy = y - 315, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d, x1 = 940 + ux * 124, y1 = 315 + uy * 124;
    const bar = k === 'T' ? `<path d="M${x1 - uy * 12.6} ${y1 + ux * 12.6}L${x1 + uy * 12.6} ${y1 - ux * 12.6}" stroke="white" stroke-opacity="0.3" stroke-width="1.5" stroke-linecap="round"/>` : '';
    return `<path d="M${x1} ${y1}L${x - ux * 23} ${y - uy * 23}" stroke="white" stroke-opacity="0.3" stroke-width="1.5" stroke-linecap="round"${k === 'R' ? ' stroke-dasharray="2.4 4.9"' : ''}/>${bar}`;
  };
  const node = ({ k, xy: [x, y] }) => `<circle cx="${x}" cy="${y}" r="22" fill="#1C1B24"/><circle cx="${x}" cy="${y}" r="21.25" stroke="#F4F6FF" stroke-opacity="0.32" stroke-width="1.5"/>${place(a.angles[k], x - 11, y - 11, 22)}`;
  return b64(`<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg"><g transform="translate(600 0)">${a.regions}</g>${nodes.map(line).join('')}${place(shape(t, a), 790, 165, 300)}${nodes.map(node).join('')}</svg>`);
}
// Figma sizes the question by its length: 60/68 (two lines), 56/64, 50/58; at most three lines.
const questionSize = q => (q.length <= 40 ? [60, 68] : q.length <= 60 ? [56, 64] : [50, 58]);
const QUESTION_MAX = 110;
// Inter latin covers these; anything else (Hangul, CJK, Arabic…) would draw as empty boxes, so the picture says
// "An Arc for CHI" and the page's text tags (og:title) carry the question in any script.
const DRAWABLE = /^[\u0000-ɏḀ-ỿ -⁯₠-₿←-⇿]*$/;

/** "5 talks · 4 rooms + demos · Tue 14 · CHI 2026" from the talk index (the first talk's day). */
export function talksLine(n, data) {
  if (!data) return `${n.length} talks`;
  const known = n.map(([id]) => data.papers[String(id)]).filter(Boolean);
  const rooms = new Set(known.filter(k => !k[2]).map(k => k[1])).size, demos = known.some(k => k[2]);
  const first = known[0]?.[0];
  return [`${n.length} talks`, `${rooms} rooms${demos ? ' + demos' : ''}`, first, `CHI ${data.year}`].filter(Boolean).join(' · ');
}

export async function ogPng(payload) {
  const a = await assets();
  const d = decodeLink(payload);
  const t = d.ok ? TRIBE[d.link.t] : { id: 'design', name: 'CHI', color: TRIBE.design.color };
  const raw = d.ok && DRAWABLE.test(d.link.q) ? d.link.q : 'An Arc for CHI';
  const q = raw.length > QUESTION_MAX ? `${raw.slice(0, QUESTION_MAX - 1).trimEnd()}…` : raw;
  const [size, lh] = questionSize(q);
  const c = d.ok ? angleCounts(d.link.n) : { S: 0, R: 0, T: 0 };
  const count = (k, n, word) => h('div', { display: 'flex', alignItems: 'center', gap: 6 }, [{ type: 'img', props: { src: b64(a.angles[k]), width: 24, height: 24, style: { opacity: 0.72 } } }, `${n} ${word}`]);
  const tree = h('div', { display: 'flex', position: 'relative', width: 1200, height: 630, backgroundColor: '#121119', color: '#f4f6ff', fontFamily: 'Inter' }, [
    { type: 'img', props: { src: picture(t.id, c, a), width: 1200, height: 630, style: { position: 'absolute', left: 0, top: 0 } } },
    h('div', { position: 'absolute', left: 72, top: 64, display: 'flex', alignItems: 'center', gap: 8.4, height: 53.2, padding: '0 19.6px', borderRadius: 26.6,
      backgroundColor: '#1c1b24', border: '1.4px solid rgba(255,255,255,0.08)', fontSize: 19.6, fontWeight: 500, letterSpacing: -0.1176, color: 'rgba(244,246,255,0.62)' },
    [{ type: 'img', props: { src: b64(a.icons[t.id] ?? a.icons.design), width: 22.4, height: 22.4 } }, t.name]),
    h('div', { position: 'absolute', left: 72, top: 140, width: 660, display: 'flex', flexDirection: 'column', gap: 27 }, [
      h('div', { display: 'block', lineClamp: 3, fontSize: size, lineHeight: `${lh}px`, fontWeight: 600, letterSpacing: -size * 0.024 }, q),
      d.ok ? h('div', { display: 'flex', gap: 30, fontSize: 24, fontWeight: 500, letterSpacing: -0.576, color: 'rgba(244,246,255,0.72)' },
        [count('S', c.S, 'support'), count('R', c.R, 'reframe'), count('T', c.T, 'challenge')]) : h('div', { display: 'flex' }, ''),
    ]),
    d.ok ? h('div', { position: 'absolute', left: 72, top: 500, display: 'flex', fontSize: 22, fontWeight: 500, letterSpacing: -0.44, color: 'rgba(244,246,255,0.55)' }, talksLine(d.link.n, a.data)) : h('div', { display: 'flex' }, ''),
    h('div', { position: 'absolute', left: 72, top: 556, display: 'flex', fontSize: 15, fontWeight: 500, letterSpacing: -0.09, color: 'rgba(244,246,255,0.4)' },
      'ARC · arc2027.com · unofficial · programme data © ACM CHI, CC BY-NC-SA 4.0'),
  ]);
  const svg = await satori(tree, { width: 1200, height: 630, fonts: a.fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

export default async function og(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('GET only', { status: 405 });
  try {
    const png = await ogPng(new URL(request.url).searchParams.get('d') ?? '');
    return new Response(request.method === 'HEAD' ? null : png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
  } catch (e) { // nothing from the request in any log; the reason (a file path, not the request) outside production
    return new Response(process.env.VERCEL_ENV === 'production' ? 'no picture' : `no picture: ${e?.message ?? e}`, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
