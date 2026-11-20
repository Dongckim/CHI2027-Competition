// Share link round trip (QA 6): questions with & # ? " ', Korean, emoji and 200 characters → link → the received Arc
// has the same question, talks, angles and evidence positions. A cut payload is refused (18 shows "This link can't be
// opened", checked in tests/qa/link-check.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCorpus } from '../engine/corpus.mjs';
import { buildIndex, buildArc, labelOf } from '../../app/src/engine/mock-core.js';
import { encodeLink, decodeLink, receivedArc } from '../../app/src/arc/link.js';
import { QUESTIONS } from './questions.mjs';

const corpus = buildCorpus();

test('link round trip: question, talks, angles and evidence come back the same', { skip: !corpus && 'data/build/chi2026 not built' }, () => {
  const index = buildIndex(corpus);
  const byKey = index.byKey;
  assert.equal(QUESTIONS[3].length, 200);
  for (const q of QUESTIONS) {
    const arc = buildArc(index, q, { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: 'link-rt-000001', createdAt: 0 });
    assert.ok(arc.nodes.length, `${q}: an Arc with talks`);
    const payload = encodeLink(arc);
    assert.match(payload, /^[A-Za-z0-9_-]+$/, 'base64url only, safe in a path');
    const d = decodeLink(payload);
    assert.ok(d.ok, `${q}: ${d.why}`);
    const { arc: got, missing } = receivedArc(d.link, { edition: 'chi2026', title: k => byKey.get(k)?.title, abstract: k => byKey.get(k)?.abstract,
      label: labelOf, firstAuthorNew: () => false, id: 'link-rt-000002', createdAt: 1 });
    assert.equal(missing, 0);
    assert.equal(got.query, q, 'the question, character for character');
    assert.equal(got.tribe, arc.tribe);
    assert.deepEqual(got.nodes.map(n => [n.key, n.angle, n.evidence?.start ?? null, n.evidence?.end ?? null, n.evidence?.sentence ?? null]),
      arc.nodes.map(n => [n.key, n.angle, n.evidence?.start ?? null, n.evidence?.end ?? null, n.evidence?.sentence ?? null]));
  }
});

test('link round trip: a cut or altered payload is refused, not half-read', { skip: !corpus && 'data/build/chi2026 not built' }, () => {
  const index = buildIndex(corpus);
  const payload = encodeLink(buildArc(index, QUESTIONS[0], { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: 'link-rt-000003', createdAt: 0 }));
  for (const cut of [payload.slice(0, -1), payload.slice(0, -7), payload.slice(0, Math.floor(payload.length / 2)), payload.slice(5), `${payload}%%`, ''])
    assert.equal(decodeLink(cut).ok, false, `cut to ${cut.length} of ${payload.length}`);
});
