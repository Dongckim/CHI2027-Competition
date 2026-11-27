import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arcOf, setOnboarded, setQuery, setTopics, toggleTopic, toggleWhat, buildOptions, whenOptions, whenDays, toggleWhenDay, QUERY_MAX } from '../../app/src/arc/draft.js';

test('arc state: old saved plans count as onboarded; new ones start at 01', () => {
  assert.equal(arcOf({ builtAt: 1 }).onboarded, true);
  assert.equal(arcOf({ builtAt: null, mode: null }).onboarded, false);
  assert.equal(arcOf(setOnboarded({ builtAt: null })).onboarded, true);
});

test('07 question: at most 200 characters', () => {
  assert.equal(arcOf(setQuery({}, 'x'.repeat(300))).draft.query.length, QUERY_MAX);
});

test('08 topics: Figma defaults, kept for the same question, and the build options follow the chips', () => {
  const t = (n, p) => Array.from({ length: n }, (_, i) => ({ id: `chi2026:${p}${i}`, label: `${p}${i}` }));
  let s = setTopics(setQuery({}, 'presence'), 'presence', { S: t(3, 's'), R: t(3, 'r'), T: t(2, 't') });
  const on = a => arcOf(s).draft.topics[a].filter(x => x.on).length;
  assert.deepEqual([on('S'), on('R'), on('T')], [2, 2, 1]);
  s = toggleTopic(s, 'S', 'chi2026:s2');
  assert.equal(setTopics(s, 'presence', { S: [], R: [], T: [] }), s); // same question: kept
  assert.deepEqual(buildOptions(arcOf(setTopics(setQuery({}, 'q'), 'q', { S: t(1, 's'), R: [], T: [] })).draft, []).angles, ['S', 'R', 'T'],
    'an angle with no chip to offer stays in, so the engine can say none (23)');
  s = toggleTopic(s, 'T', 'chi2026:t0'); // no Challenge on → T left out (tension off)
  s = toggleWhat(s, 'demos');
  const o = buildOptions(arcOf(s).draft, ['2026-04-14']);
  assert.deepEqual(o.angles, ['S', 'R']);
  assert.deepEqual(o.topicIds, ['chi2026:s0', 'chi2026:s1', 'chi2026:s2', 'chi2026:r0', 'chi2026:r1']);
  assert.deepEqual(o.types, ['Paper', 'Journals', 'Posters', 'Student Research Competition']);
  assert.deepEqual(o.days, ['2026-04-14']);
});

test('09 when: the conference days, any number, or All week (user 11/26)', () => {
  const days = ['2026-04-13', '2026-04-14', '2026-04-15'];
  assert.deepEqual(whenOptions(days).map(o => o.label), ['Mon 13', 'Tue 14', 'Wed 15', 'All week']);
  assert.deepEqual(whenDays('all', days), []);
  assert.deepEqual(whenDays('2026-04-15,2026-04-13,2025-01-01', days), ['2026-04-15', '2026-04-13']);
  let st = {}; const on = d => (st = toggleWhenDay(st, d, days), arcOf(st).draft.when);
  assert.equal(on('2026-04-14'), '2026-04-14');
  assert.equal(on('2026-04-13'), '2026-04-13,2026-04-14');
  assert.equal(on('2026-04-15'), 'all', 'every day is All week');
  assert.equal(on('2026-04-15'), '2026-04-15', 'from All week a day picks just that day');
});
