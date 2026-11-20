// GET /api/og?d=<payload> → the 1200×630 link preview picture for a share link (the share page's og:image).
// Drawn from the link alone: tribe colour and shape with its name, the question (two lines), the counts per angle,
// "ARC · for CHI 2027" and that it is unofficial. No CHI or ACM logo. Stateless, nothing logged, cached for a year
// (the picture depends only on the payload). satori lays it out as SVG (text becomes paths), resvg-wasm makes the PNG.
// Fonts: Inter 400/600 latin (other scripts are drawn without glyphs, the text tags still carry the question).
import { readFile } from 'node:fs/promises';
import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { decodeLink, angleCounts } from '../app/src/arc/link.js';
import { TRIBE } from '../app/src/arc/tribes.js';

const file = p => readFile(new URL(p, import.meta.url));
// satori's harfbuzzjs reads hb.wasm next to itself at run time; naming it here lets the deploy's file tracing ship it
// (vercel.json includeFiles with this path failed the build).
export const HARFBUZZ_WASM = new URL('../node_modules/harfbuzzjs/hb.wasm', import.meta.url);
let ready = null, wasm = null;
const assets = () => (ready ??= (async () => {
  await (wasm ??= initWasm(await file('../node_modules/@resvg/resvg-wasm/index_bg.wasm'))); // once per instance: a second initWasm throws
  const [regular, bold] = await Promise.all(['400', '600'].map(w => file(`../node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff`)));
  const svg = async name => `data:image/svg+xml;base64,${(await file(`../app/src/assets/arc/${name}.svg`)).toString('base64')}`;
  const tribes = Object.fromEntries(await Promise.all(Object.keys(TRIBE).map(async t => [t, await svg(`tribe-${t}`)])));
  const angles = { S: await svg('angle-support'), R: await svg('angle-reframe'), T: await svg('angle-challenge') };
  return { fonts: [{ name: 'Inter', data: regular, weight: 400 }, { name: 'Inter', data: bold, weight: 600 }], tribes, angles };
})().catch(e => { ready = null; throw e; }));

const h = (type, style, children) => ({ type, props: { style, children } });
const img = (src, size) => ({ type: 'img', props: { src, width: size, height: size } });
const QUESTION_MAX = 90;
// Inter latin covers these; anything else (Hangul, CJK, Arabic…) would draw as empty boxes, so the picture says
// "An Arc for CHI" and the page's text tags (og:title) carry the question in any script.
const DRAWABLE = /^[\u0000-\u024f\u1e00-\u1eff\u2000-\u206f\u20a0-\u20bf\u2190-\u21ff]*$/;

export async function ogPng(payload) {
  const a = await assets();
  const d = decodeLink(payload);
  const t = d.ok ? TRIBE[d.link.t] : { id: 'design', name: 'CHI', color: '#9b6bff' };
  const raw = d.ok && DRAWABLE.test(d.link.q) ? d.link.q : 'An Arc for CHI';
  const q = raw.length > QUESTION_MAX ? `${raw.slice(0, QUESTION_MAX - 1).trimEnd()}…` : raw;
  const c = d.ok ? angleCounts(d.link.n) : null;
  const tree = h('div', { display: 'flex', width: '100%', height: '100%', background: `linear-gradient(135deg, ${t.color}33, #121119 70%)`, backgroundColor: '#121119', color: '#f4f6ff', fontFamily: 'Inter', padding: 64 }, [
    h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }, [
      h('div', { display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 600 }, [img(a.tribes[t.id] ?? a.tribes.design, 34), t.name]),
      h('div', { display: 'block', lineClamp: 2, fontSize: 60, fontWeight: 600, lineHeight: 1.2, letterSpacing: -1.5, maxWidth: 760 }, q), // two lines
      h('div', { display: 'flex', flexDirection: 'column', gap: 18 }, [
        c ? h('div', { display: 'flex', alignItems: 'center', gap: 28, fontSize: 32, fontWeight: 600 }, [
          h('div', { display: 'flex', alignItems: 'center', gap: 10 }, [img(a.angles.S, 34), `${c.S} Supports`]),
          h('div', { display: 'flex', alignItems: 'center', gap: 10 }, [img(a.angles.R, 34), `${c.R} Reframes`]),
          h('div', { display: 'flex', alignItems: 'center', gap: 10 }, [img(a.angles.T, 34), `${c.T} Challenges`]),
        ]) : h('div', { display: 'flex' }, ''),
        h('div', { display: 'flex', fontSize: 24, fontWeight: 400, color: 'rgba(244,246,255,0.7)' }, 'ARC · for CHI 2027 · unofficial, from the CHI programme data'),
      ]),
    ]),
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 300 }, [img(a.tribes[t.id] ?? a.tribes.design, 260)]),
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
