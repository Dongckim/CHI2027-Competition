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
  assert.match(html, /↑ 1 Supports · ↻ 0 Reframes · ⊣ 1 Challenges · from the CHI 2026 programme\. Unofficial\./);
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
