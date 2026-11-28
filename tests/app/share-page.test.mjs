import { test } from 'node:test';
import assert from 'node:assert/strict';
import share, { sharePage } from '../../functions/share.mjs';
import { encodeLink } from '../../app/src/arc/link.js';

const arc = { edition: 'chi2026', query: 'Does <VR> "fidelity" raise presence?', tribe: 'xr',
  nodes: [{ key: 'chi2026:1', angle: 'S', evidence: null }, { key: 'chi2026:2', angle: 'T', evidence: { start: 0, end: 4 } }] };

test('share page: preview tags from the link, escaped, then on to #/r/<payload>', async () => {
  const p = encodeLink(arc);
  const html = sharePage(p, 'https://arc.example');
  assert.match(html, /<meta property="og:title" content="Does &lt;VR&gt; &quot;fidelity&quot; raise presence\?">/);
  // Figma 16b: real counts, the first known talk's day, site arc2027.com
  const talks = { edition: 'chi2026', papers: { 2: ['Tue 14', 'r1', 0] } };
  const desc = 'ARC finds CHI talks for a question · ↑ 1 support · ↻ 0 reframe · ⊣ 1 challenge · Tue 14';
  const withDay = sharePage(p, 'https://arc.example', talks);
  for (const tag of ['property="og:description"', 'name="twitter:description"', 'name="description"']) assert.ok(withDay.includes(`<meta ${tag} content="${desc}">`), tag);
  assert.ok(withDay.includes('<meta property="og:site_name" content="arc2027.com">'));
  assert.ok(withDay.includes('<meta name="twitter:title" content="Does &lt;VR&gt; &quot;fidelity&quot; raise presence?">'));
  assert.ok(sharePage(p, 'https://arc.example', null).includes('content="ARC finds CHI talks for a question · ↑ 1 support · ↻ 0 reframe · ⊣ 1 challenge">'), 'no index: no day');
  assert.ok(sharePage(p, 'https://arc.example', { ...talks, edition: 'chi2027' }).includes('challenge">'), 'another edition\'s index: no day');
  assert.ok(html.includes(`location.replace("/#/r/${p}")`));
  assert.ok(!html.includes('<VR>'), 'no raw question in the page');
  const broken = sharePage('not!valid', 'https://arc.example');
  assert.match(broken, /An Arc for CHI/);
  assert.ok(broken.includes('location.replace("/#/r/")'));
  const r = await share(new Request(`https://arc.example/api/share?d=${p}`));
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal((await share(new Request('https://arc.example/api/share', { method: 'POST' }))).status, 405);
});
