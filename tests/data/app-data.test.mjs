import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildAppData, abstractDay } from '../../data/scripts/app-data.mjs';

const aff = (k, c = 'Japan') => ({ institutionKey: k, institution: k.toUpperCase(), country: c });
const fixture = () => ({
  meta: { edition: 'chi2026', revision: 3, publicationVersion: 9, timeZone: 'Europe/Madrid', attribution: 'x' },
  rooms: [{ key: 'chi2026:r', name: 'Room', floor: 'P1', capacity: 1 }],
  sessions: [{ key: 'chi2026:s', name: 'S', start: null, end: null, contentKeys: [] }],
  papers: [
    // 2026-04-13 23:30 UTC is 04-14 in Madrid; the earliest slot decides the file.
    { key: 'chi2026:1', title: 'A', type: 'Posters', scheduled: true, video: 'https://v', abstract: 'abs 1',
      slots: [{ start: Date.UTC(2026, 3, 15, 9), end: 1, roomKey: 'chi2026:r', sessionKey: 'chi2026:s', order: 1 }, { start: Date.UTC(2026, 3, 13, 23, 30), end: 2, roomKey: 'chi2026:r', sessionKey: 'chi2026:s', order: 1 }],
      authors: [{ personKey: 'chi2026:p1', affiliations: [aff('inst:a'), aff('inst:a')] }] },
    { key: 'chi2026:2', title: 'B', type: 'Journals', scheduled: false, video: null, abstract: 'abs 2',
      slots: [{ start: null, end: null, roomKey: 'chi2026:r', sessionKey: 'chi2026:s', order: null }],
      authors: [{ personKey: 'chi2026:p1', affiliations: [aff('inst:b', 'Korea')] }] },
  ],
  people: [{ key: 'chi2026:p1', name: 'P One', institutionKeys: ['inst:a'] }, { key: 'chi2026:p2', name: 'Chair', institutionKeys: ['inst:c'] }],
  aliases: { institutions: [{ key: 'inst:c', name: 'C Univ', country: 'Spain' }] },
});

test('app data: schedule fields, abstracts by first slot day, people with all affiliations', () => {
  const { text, path, current } = buildAppData(fixture());
  const schedule = JSON.parse(text['schedule.json']);
  assert.deepEqual(schedule.papers[0], { paperKey: 'chi2026:1', title: 'A', type: 'poster', feedType: 'Posters', scheduled: true, video: true,
    slots: fixture().papers[0].slots.map(({ order, ...s }) => s), authors: ['chi2026:p1'] });
  assert.equal(schedule.papers[1].type, 'other');
  assert.equal(abstractDay(fixture().papers[0], 'Europe/Madrid'), '2026-04-14');
  assert.deepEqual(Object.keys(text).sort(), ['abstracts/2026-04-14.json', 'abstracts/unscheduled.json', 'people.json', 'schedule.json', 'topics.json']);
  assert.deepEqual(JSON.parse(text['abstracts/unscheduled.json']), { 'chi2026:2': 'abs 2' });
  const people = JSON.parse(text['people.json']);
  assert.deepEqual(people['chi2026:p1'].affiliations.map(a => a.institutionKey), ['inst:a', 'inst:b']);
  assert.deepEqual(people['chi2026:p2'], { name: 'Chair', affiliations: [{ institutionKey: 'inst:c', institution: 'C Univ', country: 'Spain' }] });
  assert.match(path, /^r3-[0-9a-f]{8}\/$/);
  assert.equal(current.path, path);
  assert.deepEqual(current.days, []); // fixture sessions have no real start times
});

test('app data path changes with the revision or the content, not otherwise', () => {
  const a = buildAppData(fixture()).path;
  assert.equal(buildAppData(fixture()).path, a);
  const rev = fixture(); rev.meta.revision = 4;
  const edit = fixture(); edit.papers[0].title = 'A2';
  assert.notEqual(buildAppData(rev).path, a);
  assert.notEqual(buildAppData(edit).path, a);
});

const real = new URL('../../data/build/app-data/chi2026/current.json', import.meta.url);
test('chi2026 app data covers every paper and person once', { skip: !existsSync(real) && 'run npm run data:build chi2026' }, () => {
  const { path } = JSON.parse(readFileSync(real));
  const read = f => JSON.parse(readFileSync(new URL(`../../data/build/app-data/chi2026/${path}${f}`, import.meta.url)));
  const src = f => JSON.parse(readFileSync(new URL(`../../data/build/chi2026/${f}`, import.meta.url)));
  const papers = src('papers.json');
  assert.equal(read('schedule.json').papers.length, papers.length);
  const days = ['2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17', 'unscheduled'];
  const inAbstracts = days.reduce((n, d) => n + Object.keys(read(`abstracts/${d}.json`)).length, 0);
  assert.equal(inAbstracts, papers.length);
  assert.equal(Object.keys(read('people.json')).length, src('people.json').length);
});
