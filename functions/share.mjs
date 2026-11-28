// GET /s/<payload> (vercel.json rewrites it to /api/share?d=<payload>) → a tiny page with the link preview tags that
// messengers read (Figma 16b 743:1697: title = the question, description "ARC · ↑ 2 support · ↻ 2 reframe · ⊣ 1 challenge ·
// Tue 14" from the link's real counts and its first talk's day, site "arc2027.com"), which sends people straight on to the app's
// #/r/<payload> (18). Stateless and silent: nothing is stored or logged; the payload is checked, never trusted.
// The preview picture is og:image = /api/og?d=<payload> (functions/og.mjs).
import { readFileSync } from 'node:fs';
import { decodeLink, angleCounts } from '../app/src/arc/link.js';

// The build-time talk index og.mjs also reads (app/scripts/copy-static.mjs): day per talk. Missing → no day.
// A literal URL so the deploy's file tracing ships it with this function.
let TALKS = null;
try { TALKS = JSON.parse(readFileSync(new URL('./og-data.json', import.meta.url), 'utf8')); } catch { /* not built */ }
const SITE = 'arc2027.com'; // Figma 16b and the og picture's credit line

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** "ARC · ↑ 2 support · ↻ 2 reframe · ⊣ 1 challenge · Tue 14" (Figma's words). The day only when the index is
 *  for the link's edition (ids are fixed within one edition) and knows one of its talks. */
export function describe(n, edition, talks = TALKS) {
  const c = angleCounts(n);
  const day = talks?.edition === edition && n.map(([id]) => talks.papers[String(id)]).find(Boolean)?.[0];
  return [`ARC finds CHI talks for a question · ↑ ${c.S} support · ↻ ${c.R} reframe · ⊣ ${c.T} challenge`, day].filter(Boolean).join(' · ');
}

export function sharePage(payload, origin, talks = TALKS) {
  const d = decodeLink(payload);
  const to = `/#/r/${d.ok || /^[A-Za-z0-9_.-]{1,4000}$/.test(payload) ? payload : ''}`; // a broken link still opens the app, which says why (the payload kept when it is safe to carry)
  const title = d.ok ? d.link.q : 'An Arc for CHI';
  const desc = d.ok ? describe(d.link.n, d.link.e, talks) : 'ARC lays CHI talks around one research question. Unofficial.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ARC</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${origin}/s/${d.ok ? payload : ''}`)}">
${d.ok ? `<meta property="og:image" content="${esc(`${origin}/api/og?d=${payload}`)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(`${title}: ${desc}`)}">
<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${esc(to)}">
<style>body{background:#121119;color:#f4f6ff;font:16px Inter,system-ui,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0}a{color:#f4f6ff}</style>
</head><body><p><a href="${esc(to)}">Open the Arc in ARC</a></p><script>location.replace(${JSON.stringify(to)})</script></body></html>`;
}

export default async function share(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('GET only', { status: 405 });
  const url = new URL(request.url);
  const page = sharePage(url.searchParams.get('d') ?? '', url.origin);
  // the page depends only on the payload: cached for a year (a new deploy with other tags gets new edge caches)
  return new Response(request.method === 'HEAD' ? null : page, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=86400, s-maxage=31536000' } });
}
