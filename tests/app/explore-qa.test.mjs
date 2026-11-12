// Regression tests for the S4 cross-check (QA) findings. Each test reproduces one finding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as search from '../../data/scripts/search.mjs';
import * as edition from '../../data/scripts/edition.mjs';

const { buildSearchIndex, searchTalks, searchPeople, searchSessions, placeOf, placeChoices, NO_FILTERS } = search;
const people = {
  'chi2026:p1': { name: 'Alesandra Baca-Vázquez', affiliations: [{ institutionKey: 'inst:cmu', institution: 'Carnegie Mellon University', country: 'United States' }] },
  'chi2026:p2': { name: 'Noor Ali', affiliations: [{ institutionKey: 'inst:uae', institution: 'UAE University', country: 'United Arab Emirates' }] },
};
const slot = (start, sessionKey = 'chi2026:s1') => ({ start, end: start + 1, roomKey: 'chi2026:r', sessionKey });
const schedule = {
  meta: { timeZone: 'Europe/Madrid' },
  sessions: [{ key: 'chi2026:s1', name: 'Community talks', start: Date.UTC(2026, 3, 14, 9), end: 0, timing: 'talks' }],
  papers: [
    { paperKey: 'chi2026:1', title: 'Unity in design', type: 'paper', slots: [slot(Date.UTC(2026, 3, 14, 10))], authors: ['chi2026:p1'] },
    { paperKey: 'chi2026:2', title: 'Desert sensing', type: 'paper', slots: [slot(Date.UTC(2026, 3, 14, 11))], authors: ['chi2026:p2'] },
  ],
};
const aliases = { institutions: [{ key: 'inst:cmu', name: 'Carnegie Mellon University', authorCount: 2 }, { key: 'inst:uae', name: 'UAE University', authorCount: 1 }],
  lookup: { cmu: ['inst:cmu'], 'carnegie mellon university': ['inst:cmu'], 'uae university': ['inst:uae'] } };
const index = buildSearchIndex({ schedule, people, topics: [], aliases });

test('QA 1: JS built-in names are not aliases or countries (constructor, __proto__, toString)', () => {
  for (const q of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.doesNotThrow(() => placeChoices(index, q), q);
    assert.deepEqual(placeChoices(index, q), [], q);
    assert.equal(placeOf(index, q), null, q);
    assert.deepEqual(searchTalks(index, q), [], q);
    assert.deepEqual(search.searchInstitutions(aliases, q), [], q);
  }
});

test('QA 6: a query without letters or digits searches nothing', () => {
  const { hasWords } = search;
  for (const q of ['(', '-', '.', '  ', '?!', '()[]']) assert.equal(hasWords(q), false, q);
  for (const q of ['a', '9', '서울', 'Vázquez', 'C++']) assert.equal(hasWords(q), true, q);
  assert.deepEqual(searchTalks(index, '('), []);
  assert.deepEqual(searchPeople(index, '-'), []);
  assert.deepEqual(searchSessions(index, '.'), []);
});

test('QA 7: accents are ignored when comparing ("Vazquez" finds "Baca-Vázquez")', () => {
  assert.deepEqual(searchPeople(index, 'Vazquez'), ['chi2026:p1']);
  assert.deepEqual(searchPeople(index, 'vázquez'), ['chi2026:p1']);
  assert.deepEqual(searchTalks(index, 'vazquez').map(r => r.key), ['chi2026:1']);
});

test('QA 9: a country is used only when the whole name matches ("unit" is not United Arab Emirates)', () => {
  assert.equal(placeOf(index, 'unit'), null);
  assert.deepEqual(searchTalks(index, 'unit').map(r => r.why.field), ['title']); // "Unity in design" by title only
  assert.equal(placeOf(index, 'United Arab Emirates')?.label, 'United Arab Emirates');
  assert.equal(placeOf(index, 'usa')?.label, 'United States');
});
