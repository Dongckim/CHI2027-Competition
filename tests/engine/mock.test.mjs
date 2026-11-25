import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildIndex, buildArc, angleTopics, suggest, judge, wildcard, labelOf, classify, candidates, tribesOf, expandQuery, CAPS } from '../../app/src/engine/mock-core.js';
import { arcRuleErrors } from '../../contracts/check.mjs';
import { buildCorpus } from './corpus.mjs';

const paper = (id, title, abstract, sessionKey = 'chi2026:900', authors = ['chi2026:1']) =>
  ({ key: `chi2026:${id}`, title, abstract, type: 'Paper', authors, slots: [{ sessionKey, start: Date.UTC(2026, 3, 14, 9) }] });
const tiny = () => buildIndex({
  meta: { edition: 'chi2026', revision: 1, publicationVersion: 1, timeZone: 'Europe/Madrid' },
  sessions: [{ key: 'chi2026:900', name: 'Virtual Reality' }, { key: 'chi2026:901', name: 'Social VR' }],
  topics: [], debut: ['chi2026:2'],
  papers: [
    paper(1, 'Presence in VR: a study', 'We measure presence in VR. Presence rose with fidelity.'),
    paper(2, 'Fidelity and presence', 'Presence in VR matters. However, fidelity did not change presence.', 'chi2026:901', ['chi2026:2']),
    paper(3, 'Older adults in VR', 'Interviews with older adults about VR and presence.', 'chi2026:900', ['chi2026:1', 'chi2026:2']),
    paper(4, 'Unrelated', 'Nothing here about it.'),
  ],
});

test('labels: title before the colon, at most 24 characters', () => {
  assert.equal(labelOf('Usage Matters: The Role of Frequency'), 'Usage Matters');
  assert.equal(labelOf('Social, Spatial, and Self-Presence as Predictors'), 'Social, Spatial, and Se…');
  assert.equal(labelOf('Social, Spatial, and Self-Presence as Predictors').length, 24);
});

test('angles: T needs a contrast sentence about the question, and that sentence is its evidence', () => {
  const i = tiny();
  const g = classify(i, 'presence in VR', candidates(i, 'presence in VR'));
  assert.deepEqual(g.T.map(n => n.key), ['chi2026:2']);
  assert.equal(g.T[0].evidence.sentence, 'However, fidelity did not change presence.');
  assert.equal(g.T[0].debut, true); // first author is new
  assert.ok(g.S.concat(g.R).filter(n => n.key === 'chi2026:3').every(n => n.debut === false)); // only a co-author is new
  assert.ok(!g.S.concat(g.R, g.T).some(n => n.key === 'chi2026:4'));
  const noT = classify(i, 'presence in VR', candidates(i, 'presence in VR'), { tension: false });
  assert.equal(noT.T.length, 0);
});

test('tension: found, none (23), pending (25), off (T not chosen)', () => {
  const i = tiny();
  const opts = { angles: ['S', 'R', 'T'], days: [], types: [] };
  const make = mode => buildArc(i, 'presence in VR', opts, { id: 'arc-test-1', createdAt: 0, mode });
  assert.equal(make('normal').tension, 'found');
  for (const [mode, tension] of [['none', 'none'], ['pending', 'pending']]) {
    const a = make(mode);
    assert.equal(a.tension, tension);
    assert.ok(!a.nodes.some(n => n.angle === 'T'));
  }
  const off = buildArc(i, 'presence in VR', { ...opts, angles: ['S', 'R'] }, { id: 'arc-test-1', createdAt: 0 });
  assert.equal(off.tension, 'off');
  assert.ok(!off.nodes.some(n => n.angle === 'T'));
});

test('filters and 08 topics: session ids, and topicIds keep only those sessions', () => {
  const i = tiny();
  const t = angleTopics(i, 'presence in VR');
  assert.deepEqual(t.T, [{ id: 'chi2026:901', label: 'Social VR' }]);
  const a = buildArc(i, 'presence in VR', { angles: ['S', 'R', 'T'], topicIds: ['chi2026:901'], days: [], types: [] }, { id: 'arc-test-1', createdAt: 0 });
  assert.deepEqual(a.nodes.map(n => n.key), ['chi2026:2']);
  assert.equal(buildArc(i, 'presence in VR', { angles: ['S', 'R', 'T'], days: ['2026-04-15'], types: [] }, { id: 'arc-test-1', createdAt: 0 }).nodes.length, 0);
  assert.equal(buildArc(i, 'presence in VR', { angles: ['S', 'R', 'T'], days: [], types: ['Posters'] }, { id: 'arc-test-1', createdAt: 0 }).nodes.length, 0);
});

test('15 search judge: each key under the angle suggest() would give it, null when not about the question, in key order', () => {
  const index = tiny(), q = 'presence in VR';
  const sorted = classify(index, q, candidates(index, q));
  const angleOf = k => ['S', 'R', 'T'].find(a => sorted[a].some(n => n.key === k)) ?? null;
  const keys = ['chi2026:4', 'chi2026:1', 'chi2026:3', 'chi2025:1'];
  const out = judge(index, q, keys);
  keys.forEach((k, i) => { if (angleOf(k)) assert.equal(out[i]?.angle, angleOf(k), k); });
  assert.equal(out[0], null, 'Unrelated is not about the question');
  assert.equal(out[3], null, 'another edition');
  assert.ok(out.some(Boolean), 'at least one talk is judged');
});

const corpus = buildCorpus();
test('chi2026 judge: a talk Wildcard offers is never "not about your question"', { skip: !corpus && 'data/build/chi2026 not built' }, () => {
  const index = buildIndex(corpus);
  for (const q of ['haptic feedback', 'Does VR fidelity raise presence?']) {
    const keys = wildcard(index, q, [], 8).map(n => n.key);
    assert.ok(keys.length && judge(index, q, keys).every(Boolean), q);
  }
});
test('chi2026: Arcs for 5 questions pass the schema and the evidence rules; suggest skips what is there', { skip: !corpus && 'data/build/chi2026 not built' }, () => {
  const i = buildIndex(corpus);
  const validate = new Ajv2020({ strict: true }).compile(JSON.parse(readFileSync(new URL('../../contracts/Arc.schema.json', import.meta.url))));
  const papers = new Map(JSON.parse(readFileSync(new URL('../../data/build/chi2026/papers.json', import.meta.url))).map(p => [p.key, p]));
  for (const q of ['presence', 'Does VR fidelity raise presence?', 'What is accessibility research asking now?', 'LLM writing assistants and student learning', 'privacy of smart home devices']) {
    const arc = buildArc(i, q, { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: 'arc-test-1', createdAt: 0 });
    assert.ok(validate(arc), `${q}: ${JSON.stringify(validate.errors)}`);
    assert.deepEqual(arcRuleErrors(arc, papers), [], q);
    for (const a of ['S', 'R', 'T']) assert.ok(arc.nodes.filter(n => n.angle === a).length <= CAPS[a]);
    const more = suggest(i, q, 'S', arc.nodes.map(n => n.key));
    assert.ok(more.every(n => n.angle === 'S' && !arc.nodes.some(m => m.key === n.key)));
  }
  const counts = qs => qs.map(q => buildArc(i, q, { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: 'arc-test-1', createdAt: 0 }))
    .map(a => ['S', 'R', 'T'].map(x => a.nodes.filter(n => n.angle === x).length).join('/'));
  assert.ok(new Set(counts(['presence', 'sign language', 'older adults loneliness', 'Does VR fidelity raise presence?'])).size > 1, 'counts follow the scores');
  const tribes = tribesOf(i);
  assert.equal(tribes.size, corpus.papers.length);
  assert.ok([...tribes.values()].every(t => ['ai', 'xr', 'access', 'health', 'learning', 'society', 'devices', 'design'].includes(t.tribe)), 'every talk in one of the 8');
  // The way the app builds (08 chips → topicIds): posters and demos in format-block sessions still come in
  const t = angleTopics(i, 'presence');
  const ids = ['S', 'R', 'T'].flatMap(a => t[a].slice(0, 2).map(x => x.id));
  const ui = buildArc(i, 'presence', { angles: ['S', 'R', 'T'], topicIds: ids, days: [], types: ['Paper', 'Posters', 'Interactive Demos'] }, { id: 'arc-test-1', createdAt: 0 });
  const kinds = new Set(ui.nodes.map(n => corpus.papers.find(p => p.key === n.key).type));
  assert.ok(kinds.has('Posters'), `UI-path Arc has posters: ${[...kinds]}`);
  assert.ok(Object.values(t).flat().every(x => !/^Posters \(|Interactivity Demos/.test(x.label)), 'no format-block chips');
  // A topic word ("VR"): long form searched too, Supports/Challenges quote the question word, Reframes not empty,
  // Challenges only from finding-like sentences (none here → 23)
  assert.equal(expandQuery('VR and LLMs'), 'VR and LLMs virtual reality large language models');
  const vr = buildArc(i, 'VR', { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: 'arc-test-1', createdAt: 0 });
  const quoted = n => /\bvr\b|virtual reality/i.test(n.evidence?.sentence ?? '');
  assert.ok(vr.nodes.filter(n => n.angle !== 'R').every(quoted), 'S and T evidence has the question word');
  assert.ok(vr.nodes.some(n => n.angle === 'R'), 'VR has Reframes');
  assert.ok(vr.nodes.filter(n => n.angle === 'T').every(n => !/however|lack of|little is known/i.test(n.evidence.sentence)));
  const crowded = buildArc(i, 'presence', { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: 'arc-test-1', createdAt: 0, mode: 'crowded' });
  assert.ok(crowded.nodes.length > 9, `crowded has ${crowded.nodes.length}`);
});

test('mock: word roots meet (robotics / robotic / robots), so a two-day Arc still has Supports', { skip: !corpus && 'data/build/chi2026 not built' }, () => {
  const index = buildIndex(corpus);
  const q = 'Robotics could be helpful to the human daily life?';
  const arc = buildArc(index, q, { angles: ['S', 'R', 'T'], days: ['2026-04-14', '2026-04-15'], types: [] }, { id: 'stem-test-0001', createdAt: 0 });
  assert.ok(arc.nodes.filter(n => n.angle === 'S').length > 0, 'was ↑0 with only the plural rule');
});

test('mock: a Challenge is a result of the study, not its background (not the first sentence, no bare "However")', { skip: !corpus && 'data/build/chi2026 not built' }, async () => {
  const { sentences } = await import('../../app/src/recommend/baseline.js');
  const index = buildIndex(corpus);
  const opts = { angles: ['S', 'R', 'T'], days: [], types: [] };
  const qs = ['Does VR fidelity raise presence?', 'privacy of smart home devices', 'older adults and technology', 'LLM agents for programming', 'children learning with robots', 'mental health apps', 'Robotics could be helpful to the human daily life?'];
  const result = /\b(no significant|did not|contrary to|we (?:did not )?(?:find|found|observed?|show(?:ed)?|reveal(?:ed)?)|results?|findings|analysis|participants)\b/i;
  for (const q of qs) {
    for (const n of buildArc(index, q, opts, { id: 'chal-test-0001', createdAt: 0 }).nodes.filter(x => x.angle === 'T')) {
      const first = sentences(index.byKey.get(n.key).abstract)[0];
      assert.notEqual(n.evidence.start, first.start, `${q}: first sentence`);
      assert.match(n.evidence.sentence, result, `${q}: "${n.evidence.sentence.slice(0, 80)}"`);
    }
  }
  const all = qs.flatMap(q => buildArc(index, q, opts, { id: 'chal-test-0002', createdAt: 0 }).nodes.filter(n => n.angle === 'T')).map(n => n.evidence?.sentence ?? '');
  assert.ok(!all.some(s => /^However, these systems are typically designed/.test(s) || /^Yet studies on robot power/.test(s)), 'background sentences are not Challenges');
});
