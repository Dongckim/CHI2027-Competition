// GET /s/<payload> (vercel.json rewrites it to /api/share?d=<payload>) → a tiny page with the link preview tags that
// messengers read (title = the question, description = the angle counts), which sends people straight on to the app's
// #/r/<payload> (18). Stateless and silent: nothing is stored or logged; the payload is checked, never trusted.
// The preview picture is og:image = /api/og?d=<payload> (functions/og.mjs).
import { decodeLink, angleCounts } from '../app/src/arc/link.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const YEAR = { chi2026: '2026', chi2027: '2027' };

export function sharePage(payload, origin) {
  const d = decodeLink(payload);
  const to = `/#/r/${d.ok ? payload : ''}`; // a broken link still opens the app, which says why
  const title = d.ok ? d.link.q : 'An Arc for CHI';
  const c = d.ok ? angleCounts(d.link.n) : null;
  const desc = c ? `↑ ${c.S} Supports · ↻ ${c.R} Reframes · ⊣ ${c.T} Challenges · from the CHI ${YEAR[d.link.e] ?? ''} programme. Unofficial.`.replace('  ', ' ')
    : 'ARC lays CHI talks around one research question. Unofficial.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ARC</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="ARC">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
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
