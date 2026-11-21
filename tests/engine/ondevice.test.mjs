// The on-device engine (Wonjune's, recsys/src/web) through our mapping (app/src/engine/ondevice-map.js), in Node.
// Needs the model in dist/model/ (npm run build, then app/scripts/fetch-model.mjs with MODEL_URL and MODEL_SHA256);
// without it the model tests are skipped, so npm test never needs the 37 MB package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { arcRuleErrors } from '../../contracts/check.mjs';
import { evidenceOf, onOurAbstract, engineNow, toArc, toNode, venueIso, formatsOf, daysOf, idsOf } from '../../app/src/engine/ondevice-map.js';

const MODEL = new URL('../../dist/model/', import.meta.url);
const have = existsSync(new URL('angles.json', MODEL)) && existsSync(new URL('../../data/build/chi2026/papers.json', import.meta.url));

test('evidence offsets: Python code points → JS UTF-16', () => {
  const abstract = 'We test 𝑥 and 😀 here. Presence rose with fidelity.';
  const cp = Array.from(abstract), at = cp.indexOf('P');
  const e = evidenceOf(abstract, { start: at, end: cp.length });
  assert.equal(e.sentence, 'Presence rose with fidelity.');
  assert.equal(abstract.slice(e.start, e.end), e.sentence);
  assert.equal(e.start, at + 2); // two characters outside the BMP before it
  assert.equal(evidenceOf(abstract, null), null);
  assert.equal(evidenceOf(abstract, { start: 3, end: 3 }), null);
  assert.equal(evidenceOf(abstract, { start: 0, end: 999 }), null);
});

test('request helpers: venue time with offset, all days and formats when none chosen', () => {
  assert.equal(venueIso(Date.UTC(2026, 3, 14, 8, 0), 'Europe/Madrid'), '2026-04-14T10:00:00+02:00');
  assert.equal(venueIso(Date.UTC(2027, 4, 11, 14, 30), 'America/New_York'), '2027-05-11T10:30:00-04:00');
  assert.equal(engineNow(Date.UTC(2026, 3, 14, 8, 0), 'Europe/Madrid'), '2026-04-14T12:00:00+02:00');
  assert.equal(daysOf([]), 'week');
  assert.deepEqual(daysOf(['2026-04-14']), ['2026-04-14']);
  assert.deepEqual(formatsOf([]), ['talks', 'posters', 'demos', 'panels', 'sigs']);
  assert.deepEqual(formatsOf(['Paper', 'Journals', 'Interactive Demos']), ['talks', 'demos']);
  assert.deepEqual(idsOf(['chi2026:222304', 'chi2025:1', 'chi2026:7'], 'chi2026'), [222304, 7]);
});

let eng, papers;
const setup = async () => {
  if (eng) return;
  const { loadAngles } = await import('../../recsys/src/web/load.mjs');
  eng = await loadAngles(MODEL.pathname);
  papers = new Map(JSON.parse(readFileSync(new URL('../../data/build/chi2026/papers.json', import.meta.url))).map(p => [p.key, p]));
};
const abstractOf = id => eng.items[eng.pos.get(id)]?.abstract ?? '';

test('every finding sentence in the model is a quote of our data/build abstract', { skip: !have && 'no dist/model' }, async () => {
  await setup();
  let checked = 0, missing = 0, moved = 0;
  const bad = [];
  for (const [i, info] of eng.info) {
    const key = `chi2026:${eng.items[i].id}`;
    const ours = papers.get(key)?.abstract;
    if (ours == null) { missing++; continue; }
    for (const c of [...info.cards, ...info.measures]) {
      const e = evidenceOf(abstractOf(eng.items[i].id), { start: c.s[0], end: c.s[1] });
      checked++;
      if (e && ours.slice(e.start, e.end) !== e.sentence) moved++;
      const o = onOurAbstract(e, ours);
      if (!o || ours.slice(o.start, o.end) !== o.sentence || o.sentence !== e.sentence) bad.push(`${key} [${c.s}]`);
    }
  }
  assert.equal(missing, 0, `${missing} talks of the model are not in data/build`);
  assert.ok(checked > 10000, `only ${checked} sentences`);
  assert.ok(moved < 100, `${moved} sentences needed moving (the package's abstracts are trimmed; ours keep leading spaces)`);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} of ${checked} sentences are not our abstract's text`);
});

test('Arcs from the on-device engine pass Arc 0.1.0 and its rules', { skip: !have && 'no dist/model' }, async () => {
  await setup();
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(new URL('../../contracts/Arc.schema.json', import.meta.url))));
  const now = engineNow(Date.UTC(2026, 3, 14, 8, 0), 'Europe/Madrid');
  // the package's times are the feed's wall clock read as UTC (2 h late in Barcelona): engineNow makes up for it
  const slot = eng.arc.slots.get(eng.pos.get(222323))[0];
  assert.equal(slot.start, '2026-04-14T11:00:00+02:00', 'the package fixed its times: remove engineNow');
  for (const q of ['Does VR fidelity raise presence?', 'VR', 'Robotics could be helpful to the human daily life?', 'mental health apps']) {
    for (const angles of [['S', 'R', 'T'], ['S', 'R']]) {
      const opts = { angles, days: [], types: [] };
      const res = await eng.handle({ screen: 'arc', question: q, days: daysOf([]), formats: formatsOf([]), now });
      const arc = toArc(res, q, opts, { id: 'test-arc-01', createdAt: 0, edition: 'chi2026', version: eng.version, abstractOf });
      for (const n of arc.nodes) n.evidence = onOurAbstract(n.evidence, papers.get(n.key).abstract);
      const errors = validate(arc) ? arcRuleErrors(arc, papers) : validate.errors.map(e => `${e.instancePath} ${e.message}`);
      assert.deepEqual(errors, [], `${q} (${angles.join('')})`);
      assert.ok(arc.nodes.length > 0, q);
      if (!angles.includes('T')) assert.equal(arc.tension, 'off');
    }
  }
  const n = await eng.handle({ screen: 'node', question: 'Does VR fidelity raise presence?', id: 222304 });
  const node = toNode(n, 'chi2026', abstractOf);
  node.evidence = onOurAbstract(node.evidence, papers.get(node.key).abstract);
  assert.equal(papers.get(node.key).abstract.slice(node.evidence.start, node.evidence.end), node.evidence.sentence);
});
