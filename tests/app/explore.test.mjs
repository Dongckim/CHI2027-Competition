import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { verifiedReasons, highlightSegments } from '../../app/src/explore/quotes.js';
import { buildSearchIndex, searchTalks, searchPeople, searchSessions, placeOf, placeChoices, filterCount, NO_FILTERS } from '../../data/scripts/search.mjs';

const reason = (abstract, quote, shift = 0) => {
  const start = abstract.indexOf(quote) + shift;
  return { conceptId: 'topic:x', quote, start, end: start + quote.length };
};

test('quotes: kept only when quote === abstract.slice(start, end), UTF-16 positions with emoji', () => {
  const abstract = 'We asked 𝑁 = 44 people 💬 how chat 🛠 tools help them make sense of data.';
  const ok = reason(abstract, 'how chat 🛠 tools help');
  const after = reason(abstract, 'make sense of data');
  assert.equal(abstract.slice(ok.start, ok.end), ok.quote);
  assert.deepEqual(verifiedReasons([ok, after], abstract), [ok, after]);
  // Code-point positions (what a Python model would write) are off by one per emoji before the quote: hidden.
  const codePoints = { ...after, start: [...abstract.slice(0, after.start)].length };
  codePoints.end = codePoints.start + after.quote.length;
  assert.deepEqual(verifiedReasons([codePoints], abstract), []);
  assert.deepEqual(verifiedReasons([{ ...ok, quote: 'how chat tools help' }], abstract), []); // text differs
  assert.deepEqual(verifiedReasons([{ ...ok, end: abstract.length + 1 }], abstract), []); // out of range
  const emoji = abstract.indexOf('💬');
  // Half an emoji: slice() would agree with the broken quote, but the position cuts a character.
  assert.deepEqual(verifiedReasons([{ conceptId: 'c', quote: abstract.slice(emoji + 1, emoji + 5), start: emoji + 1, end: emoji + 5 }], abstract), []);
  assert.deepEqual(verifiedReasons(null, abstract), []);
});

test('highlight: pieces join back to the abstract, marks are exactly the quotes, overlaps merge', () => {
  const abstract = 'We asked 𝑁 = 44 people 💬 how chat 🛠 tools help them make sense of data.';
  const a = reason(abstract, 'people 💬 how chat');
  const b = reason(abstract, 'how chat 🛠 tools');
  const c = reason(abstract, 'sense of data');
  const bad = { ...c, quote: 'Sense of data' };
  const seg = highlightSegments(abstract, [c, b, a, bad]);
  assert.equal(seg.map(s => s.text).join(''), abstract);
  assert.deepEqual(seg.filter(s => s.mark).map(s => s.text), ['people 💬 how chat 🛠 tools', 'sense of data']);
  assert.deepEqual(highlightSegments(abstract, []), [{ text: abstract, mark: false }]);
});

const people = {
  'chi2026:p1': { name: 'Ada Lovelace', affiliations: [{ institutionKey: 'inst:cmu', institution: 'Carnegie Mellon University', country: 'United States' }] },
  'chi2026:p2': { name: 'Kim Min', affiliations: [{ institutionKey: 'inst:mit', institution: 'MIT', country: 'United States' }, { institutionKey: 'inst:kaist', institution: 'KAIST', country: 'Korea, Republic of' }] },
  'chi2026:p3': { name: 'Chiang Person', affiliations: [{ institutionKey: 'inst:chiangmai', institution: 'Chiang Mai University', country: 'Thailand' }] },
};
const slot = (start, sessionKey = 'chi2026:s1') => ({ start, end: start + 1, roomKey: 'chi2026:r', sessionKey });
const schedule = {
  meta: { timeZone: 'Europe/Madrid' },
  sessions: [{ key: 'chi2026:s1', name: 'Sensemaking with AI', start: Date.UTC(2026, 3, 14, 9), end: 0, timing: 'talks' }, { key: 'chi2026:s2', name: 'Posters', start: Date.UTC(2026, 3, 15, 9), end: 0, timing: 'block' }],
  papers: [
    { paperKey: 'chi2026:2', title: 'Later talk on maps', type: 'paper', slots: [slot(Date.UTC(2026, 3, 14, 11))], authors: ['chi2026:p2'] },
    { paperKey: 'chi2026:1', title: 'Making sense of charts', type: 'paper', slots: [slot(Date.UTC(2026, 3, 14, 10))], authors: ['chi2026:p1'] },
    { paperKey: 'chi2026:3', title: 'A poster', type: 'poster', slots: [slot(Date.UTC(2026, 3, 15, 10), 'chi2026:s2')], authors: ['chi2026:p3', 'chi2026:p1'] },
  ],
};
const aliases = {
  institutions: [{ key: 'inst:cmu', name: 'Carnegie Mellon University', authorCount: 281 }, { key: 'inst:chiangmai', name: 'Chiang Mai University', authorCount: 1 },
    { key: 'inst:mit', name: 'MIT', authorCount: 50 }, { key: 'inst:kaist', name: 'Korea Advanced Institute of Science and Technology', authorCount: 195 }],
  lookup: { cmu: ['inst:cmu', 'inst:chiangmai'], 'carnegie mellon university': ['inst:cmu'], 'chiang mai university': ['inst:chiangmai'], mit: ['inst:mit'], kaist: ['inst:kaist'] },
};
const topics = [{ key: 'topic:maps', label: 'Cartography', contentKeys: ['chi2026:2'] }];
const index = buildSearchIndex({ schedule, people, topics, aliases });

test('search: title, author, topic, then place; programme order inside each; CMU = the largest CMU only', () => {
  assert.deepEqual(searchTalks(index, 'CMU').map(r => r.key), ['chi2026:1', 'chi2026:3']); // not Chiang Mai's only
  assert.deepEqual(searchTalks(index, 'CMU')[0].why, { field: 'place', text: 'Carnegie Mellon University' });
  assert.equal(placeOf(index, 'CMU').others, 1); // Chiang Mai: offered as "Other CMUs"
  assert.equal(placeOf(index, 'kaist').others, 0);
  assert.deepEqual(searchTalks(index, 'ada').map(r => [r.key, r.why.field]), [['chi2026:1', 'author'], ['chi2026:3', 'author']]);
  assert.deepEqual(searchTalks(index, 'cartog').map(r => r.why), [{ field: 'topic', text: 'Cartography' }]);
  assert.deepEqual(searchTalks(index, 'ense').map(r => r.key), []); // words must start words
  assert.deepEqual(searchTalks(index, 'charts sense').map(r => r.key), ['chi2026:1']); // any order
  assert.deepEqual(searchTalks(index, '').map(r => r.key), ['chi2026:1', 'chi2026:2', 'chi2026:3']); // programme order
});

test('search: filters look at every affiliation of every author', () => {
  const kaist = placeChoices(index, 'kaist')[0];
  assert.equal(kaist.label, 'Korea Advanced Institute of Science and Technology');
  // Kim Min's second affiliation is KAIST: their talk counts for KAIST and for Korea.
  assert.deepEqual(searchTalks(index, '', { ...NO_FILTERS, place: kaist }).map(r => r.key), ['chi2026:2']);
  const korea = placeChoices(index, 'korea')[0];
  assert.deepEqual([korea.kind, korea.label], ['country', 'Korea, Republic of']);
  assert.deepEqual(searchTalks(index, '', { ...NO_FILTERS, place: korea }).map(r => r.key), ['chi2026:2']);
  assert.deepEqual(searchTalks(index, '', { ...NO_FILTERS, days: ['2026-04-15'] }).map(r => r.key), ['chi2026:3']);
  assert.deepEqual(searchTalks(index, '', { ...NO_FILTERS, types: ['poster'] }).map(r => r.key), ['chi2026:3']);
  assert.equal(filterCount({ days: ['2026-04-15'], types: [], place: korea }), 2);
  assert.deepEqual(searchPeople(index, 'cmu'), ['chi2026:p1']);
  assert.deepEqual(searchPeople(index, '', { ...NO_FILTERS, place: korea }), ['chi2026:p2']);
  assert.deepEqual(searchSessions(index, 'sensemaking'), [{ key: 'chi2026:s1', talks: ['chi2026:2', 'chi2026:1'] }]);
  assert.deepEqual(searchSessions(index, '', { ...NO_FILTERS, types: ['poster'] }), [{ key: 'chi2026:s2', talks: ['chi2026:3'] }]);
});

// Real programme (needs data/build/app-data): the completion check of S4, and quotes of the baseline recommender.
const root = new URL('../../data/build/app-data/chi2026/', import.meta.url);
test('chi2026: "CMU" finds Carnegie Mellon talks; every author at CMU, on any affiliation', { skip: !existsSync(new URL('current.json', root)) }, () => {
  const { path } = JSON.parse(readFileSync(new URL('current.json', root)));
  const read = f => JSON.parse(readFileSync(new URL(path + f, root)));
  const data = { schedule: read('schedule.json'), people: read('people.json'), topics: read('topics.json'), aliases: read('institutions.json') };
  const real = buildSearchIndex(data);
  const cmu = data.aliases.lookup['carnegie mellon university'][0];
  const results = searchTalks(real, 'CMU').filter(r => r.why.field === 'place');
  const expected = data.schedule.papers.filter(p => p.authors.some(k => data.people[k]?.affiliations.some(a => a.institutionKey === cmu))).map(p => p.paperKey).sort();
  assert.ok(expected.length > 50);
  assert.deepEqual(results.map(r => r.key).sort(), expected);
});
