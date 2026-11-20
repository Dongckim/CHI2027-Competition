import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildIndex, buildArc, angleTopics, suggest, labelOf, classify, candidates, tribesOf, CAPS } from '../../app/src/engine/mock-core.js';
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

const corpus = buildCorpus();
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
  const crowded = buildArc(i, 'presence', { angles: ['S', 'R', 'T'], days: [], types: [] }, { id: 'arc-test-1', createdAt: 0, mode: 'crowded' });
  assert.ok(crowded.nodes.length > 9, `crowded has ${crowded.nodes.length}`);
});
