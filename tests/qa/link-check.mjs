// Share link round trip on 18 (QA 6): for each question in tests/qa/questions.mjs (& # ? " ', Korean, emoji, 200
// characters) a link is made from a mock Arc and opened as /s/<payload> on an empty phone. 18 must show the question as
// written; after "Add to my Arcs" the stored Arc has the same talks, angles and evidence positions. A cut payload shows
// "This link can't be opened".
// npm run build && node --experimental-websocket tests/qa/link-check.mjs
import { buildCorpus } from '../engine/corpus.mjs';
import { buildIndex, buildArc } from '../../app/src/engine/mock-core.js';
import { encodeLink } from '../../app/src/arc/link.js';
import { QUESTIONS } from './questions.mjs';
import { startServer, launchChrome, phone, reporter } from './cdp.mjs';

const index = buildIndex(buildCorpus());
const R = reporter('link');
const server = await startServer(4367);
const chrome = await launchChrome();
let code = 1;
try {
  const tab = await chrome.first();
  await phone(tab, { cpu: 2 });
  for (const [i, q] of QUESTIONS.entries()) {
    const arc = buildArc(index, q, { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: `link-check-${i}00000`, createdAt: 0 });
    const payload = encodeLink(arc);
    await tab.send('Storage.clearDataForOrigin', { origin: server.base.slice(0, -1), storageTypes: 'all' });
    await tab.send('Page.navigate', { url: `${server.base}s/${payload}` });
    const shown = await tab.waitFor(`/Shared Arc/.test(document.body.innerText) && /Add to my Arcs/.test(document.body.innerText)`, 30000);
    const h1 = await tab.ev(`document.querySelector('h1')?.innerText ?? null`);
    await tab.ev(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Add to my Arcs')?.click(), true`);
    await tab.waitFor(`location.hash.startsWith('#/arc/')`, 15000);
    const got = await tab.ev(`new Promise(r => { const o = indexedDB.open('arc', 1); o.onsuccess = () => { const g = o.result.transaction('arcs').objectStore('arcs').getAll();
      g.onsuccess = () => { const a = g.result.find(x => x.source === 'received'); o.result.close(); r(a ? { query: a.query, nodes: a.nodes.map(n => [n.key, n.angle, n.evidence?.start ?? null, n.evidence?.end ?? null]) } : null); }; }; o.onerror = () => r(null); })`);
    const want = arc.nodes.map(n => [n.key, n.angle, n.evidence?.start ?? null, n.evidence?.end ?? null]);
    const label = q.length > 40 ? `${q.slice(0, 37)}… (${q.length})` : q;
    R.check(`18 shows "${label}" as written`, shown != null && h1 === q, { h1: h1 === q ? undefined : h1 });
    R.check(`  stored Arc: same question, talks, angles and evidence positions`, got?.query === q && JSON.stringify(got?.nodes) === JSON.stringify(want),
      { talks: `${got?.nodes.length ?? 0}/${want.length}`, first: JSON.stringify(got?.nodes) === JSON.stringify(want) ? undefined : { want: want[0], got: got?.nodes?.[0] } });
  }
  const payload = encodeLink(buildArc(index, QUESTIONS[0], { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: 'link-check-cut0001', createdAt: 0 }));
  for (const cut of [payload.slice(0, -7), payload.slice(0, Math.floor(payload.length / 2))]) {
    await tab.send('Page.navigate', { url: `${server.base}s/${cut}` });
    const broken = await tab.waitFor(`/This link can't be opened/.test(document.body.innerText)`, 20000);
    R.check(`a link cut to ${cut.length} of ${payload.length} characters → "This link can't be opened"`, broken != null, {});
  }
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message}`);
  R.done();
} finally {
  await chrome.close(); server.stop();
  process.exit(code);
}
