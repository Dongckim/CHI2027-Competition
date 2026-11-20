import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { encodeLink, decodeLink, receivedArc, angleCounts } from '../../app/src/arc/link.js';
import { arcRuleErrors } from '../../contracts/check.mjs';

const example = JSON.parse(readFileSync(new URL('../../contracts/examples/Arc.chi2026-presence.json', import.meta.url)));
const papersFile = new URL('../../data/build/chi2026/papers.json', import.meta.url);

test('link: only question, tribe, talk ids, angles and quote places; round trip; any language', () => {
  const payload = encodeLink(example);
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  const d = decodeLink(payload);
  assert.ok(d.ok);
  assert.deepEqual(Object.keys(d.link).sort(), ['e', 'n', 'q', 't', 'v']);
  assert.equal(d.link.n.length, example.nodes.length);
  const count = a => example.nodes.filter(n => n.angle === a).length;
  assert.deepEqual(angleCounts(d.link.n), { S: count('S'), R: count('R'), T: count('T') });
  const ko = decodeLink(encodeLink({ ...example, query: 'VR 충실도가 존재감을 높일까? 🙂' }));
  assert.equal(ko.link.q, 'VR 충실도가 존재감을 높일까? 🙂');
});

test('link: broken or hostile payloads are refused with a reason', () => {
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const good = { v: 1, e: 'chi2026', q: 'q', t: 'xr', n: [['1', 'S']] };
  for (const [bad, why] of [
    ['%%%', 'not a share link'], [enc([1]), 'not a share link'], [enc({ ...good, v: 2 }), 'another version'],
    [enc({ ...good, q: 'x'.repeat(201) }), 'no question'], [enc({ ...good, t: 'evil' }), 'neighbourhood'],
    [enc({ ...good, n: [['1', 'S'], ['1', 'R']] }), 'broken'], [enc({ ...good, n: [['1', 'Z']] }), 'broken'],
    [enc({ ...good, n: [['1', 'S', 5, 2]] }), 'broken'], [enc({ ...good, n: [['1;DROP', 'S']] }), 'broken'],
  ]) { const r = decodeLink(bad); assert.equal(r.ok, false); assert.match(r.why, new RegExp(why)); }
});

test('received Arc: a new Arc, quotes re-checked against our abstract, unknown talks counted', { skip: !existsSync(papersFile) && 'data/build/chi2026 not built' }, () => {
  const papers = new Map(JSON.parse(readFileSync(papersFile)).map(p => [p.key, p]));
  const ctx = { edition: 'chi2026', title: k => papers.get(k)?.title, abstract: k => papers.get(k)?.abstract, label: t => t.slice(0, 24),
    firstAuthorNew: () => false, id: 'received-0001', createdAt: 1 };
  const link = decodeLink(encodeLink(example)).link;
  link.n[0] = [link.n[0][0], link.n[0][1], 0, 5]; // a quote that is not the sentence the engine chose, but still the abstract there
  link.n[1] = [link.n[1][0], link.n[1][1], 3, 9000]; // past the end of the abstract: dropped
  link.n.push(['999999999', 'S']);
  const { arc, missing } = receivedArc(link, ctx);
  assert.equal(missing, 1);
  assert.equal(arc.source, 'received');
  assert.equal(arc.nodes[0].evidence.sentence, papers.get(arc.nodes[0].key).abstract.slice(0, 5));
  assert.equal(arc.nodes[1].evidence, null);
  const validate = new Ajv2020({ strict: true }).compile(JSON.parse(readFileSync(new URL('../../contracts/Arc.schema.json', import.meta.url))));
  assert.ok(validate(arc), JSON.stringify(validate.errors));
  assert.deepEqual(arcRuleErrors(arc, papers), []);
  assert.equal(receivedArc({ ...link, e: 'chi2025' }, ctx).arc.nodes.length, 0, 'another edition: nothing to show');
});
