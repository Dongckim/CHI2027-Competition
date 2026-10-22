import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { defaultTravelMinutes, indexData, localDay, planDay } from '../../app/src/planner/plan.js';

// Madrid is UTC+2 in April: 09:00 local = 07:00Z.
const at = hhmm => Date.parse(`2026-04-13T${hhmm}:00+02:00`);
const rooms = [
  { key: 'chi2026:1', name: 'A', floor: 'P1' },
  { key: 'chi2026:2', name: 'B', floor: 'P1' },
  { key: 'chi2026:3', name: 'C', floor: 'P2' },
];
const paper = (id, room, from, to, extra = {}) => ({
  key: `chi2026:${id}`, title: id, video: null, scheduled: true,
  slots: [{ sessionKey: `chi2026:s${id}`, roomKey: `chi2026:${room}`, start: at(from), end: at(to), order: 1 }], ...extra,
});
const plan = (papers, candidates, options = {}) =>
  planDay(indexData({ meta: { timeZone: 'Europe/Madrid' }, papers, sessions: [], rooms }), candidates, { day: '2026-04-13', ...options });
const c = (id, relevance) => ({ paperKey: `chi2026:${id}`, relevance });
const keys = r => r.stops.map(s => s.paperKey.split(':')[1]);

test('1. overlapping talks: the better one wins, the other is the alternative', () => {
  const r = plan([paper('a', 1, '09:00', '09:12'), paper('b', 2, '09:00', '09:12')], [c('a', 0.5), c('b', 0.8)]);
  assert.deepEqual(keys(r), ['b']);
  assert.deepEqual(r.conflicts[0].alternatives.map(x => x.paperKey), ['chi2026:a']);
});

test('2. back-to-back in the same room: both', () => {
  const r = plan([paper('a', 1, '09:00', '09:12'), paper('b', 1, '09:12', '09:24')], [c('a', 0.5), c('b', 0.5)]);
  assert.deepEqual(keys(r), ['a', 'b']);
  assert.equal(r.stops[1].travelFromPrevMin, 0);
});

test('3. back-to-back in different rooms: no time to walk, keep the better one', () => {
  const r = plan([paper('a', 1, '09:00', '09:12'), paper('b', 2, '09:12', '09:24')], [c('a', 0.4), c('b', 0.9)]);
  assert.deepEqual(keys(r), ['b']);
});

test('4. different rooms with enough gap: both, with travel time', () => {
  const r = plan([paper('a', 1, '09:00', '09:12'), paper('b', 2, '09:17', '09:29')], [c('a', 0.5), c('b', 0.5)]);
  assert.deepEqual(keys(r), ['a', 'b']);
  assert.equal(r.stops[1].travelFromPrevMin, 4);
});

test('5. wheelchair needs more margin than walking', () => {
  const papers = [paper('a', 1, '09:00', '09:12'), paper('b', 2, '09:17', '09:29')];
  assert.deepEqual(keys(plan(papers, [c('a', 0.5), c('b', 0.6)], { wheelchair: true })), ['b']);
  assert.deepEqual(keys(plan(papers, [c('a', 0.5), c('b', 0.6)], { wheelchair: false })), ['a', 'b']);
});

test('6. a talk with a video counts half', () => {
  const r = plan([paper('a', 1, '09:00', '09:12', { video: 'https://v' }), paper('b', 2, '09:00', '09:12')], [c('a', 0.9), c('b', 0.6)]);
  assert.deepEqual(keys(r), ['b']);
});

test('7. equal relevance: staying in the room beats walking', () => {
  const papers = [paper('a', 1, '09:00', '09:12'), paper('b', 3, '09:22', '09:34'), paper('c', 1, '09:22', '09:34')];
  assert.deepEqual(keys(plan(papers, [c('a', 0.5), c('b', 0.5), c('c', 0.5)])), ['a', 'c']);
});

test('8. remote-only and unknown papers are reported, not routed', () => {
  const r = plan([paper('a', 1, '09:00', '09:12'), { key: 'chi2026:r', scheduled: false, slots: [] }], [c('a', 0.5), c('r', 0.9), c('x', 0.9)]);
  assert.deepEqual(keys(r), ['a']);
  assert.deepEqual(r.skipped, [{ paperKey: 'chi2026:r', reason: 'unscheduled' }, { paperKey: 'chi2026:x', reason: 'unknown' }]);
});

test('9. a poster shown twice that day appears once', () => {
  const p = paper('p', 1, '14:15', '15:45');
  p.slots.push({ sessionKey: 'chi2026:s2', roomKey: 'chi2026:1', start: at('18:00'), end: at('19:30'), order: null });
  const r = plan([p], [c('p', 0.7)]);
  assert.deepEqual(keys(r), ['p']);
});

test('10. day is the venue local date, not the UTC date', () => {
  const late = paper('n', 1, '23:50', '23:59');
  late.slots[0] = { ...late.slots[0], start: Date.parse('2026-04-14T00:30:00+02:00'), end: Date.parse('2026-04-14T00:42:00+02:00') };
  assert.equal(localDay(late.slots[0].start, 'Europe/Madrid'), '2026-04-14');
  assert.deepEqual(keys(plan([late], [c('n', 0.5)])), []);
  assert.deepEqual(plan([late], [c('n', 0.5)]).skipped, [{ paperKey: 'chi2026:n', reason: 'other-day' }]);
  assert.deepEqual(keys(plan([late], [c('n', 0.5)], { day: '2026-04-14' })), ['n']);
});

test('ties break the same way every time', () => {
  const papers = [paper('b', 1, '09:00', '09:12'), paper('a', 2, '09:00', '09:12')];
  const runs = [0, 1, 2].map(() => JSON.stringify(plan(papers, [c('b', 0.5), c('a', 0.5)])));
  assert.equal(new Set(runs).size, 1);
  assert.equal(JSON.stringify(plan(papers, [c('b', 0.5), c('a', 0.5)])), JSON.stringify(plan(papers.slice().reverse(), [c('a', 0.5), c('b', 0.5)])));
});

test('travel guess', () => {
  assert.equal(defaultTravelMinutes(rooms[0], rooms[0]), 0);
  assert.equal(defaultTravelMinutes(rooms[0], rooms[1]), 4);
  assert.equal(defaultTravelMinutes(rooms[0], rooms[2]), 7);
  assert.equal(defaultTravelMinutes(rooms[0], rooms[2], { wheelchair: true }), 14);
});

for (const edition of ['chi2026', 'chi2025']) {
  const dir = new URL(`../../data/build/${edition}/`, import.meta.url);
  test(`${edition}: every day's route is walkable`, { skip: !existsSync(dir) && 'run npm run data:build first' }, () => {
    const load = f => JSON.parse(readFileSync(new URL(`${f}.json`, dir)));
    const data = { meta: load('meta'), papers: load('papers'), sessions: load('sessions'), rooms: load('rooms') };
    const index = indexData(data);
    const scheduled = data.papers.filter(p => p.scheduled);
    const candidates = scheduled.map((p, i) => ({ paperKey: p.key, relevance: ((i * 7919) % 1000) / 1000 }));
    const days = [...new Set(scheduled.flatMap(p => p.slots.filter(s => s.start != null).map(s => localDay(s.start, data.meta.timeZone))))];
    assert.ok(days.length >= 4);
    for (const day of days) {
      const r = planDay(index, candidates, { day });
      for (let i = 1; i < r.stops.length; i++) {
        const [a, b] = [r.stops[i - 1], r.stops[i]];
        assert.ok(a.end + b.travelFromPrevMin * 60000 <= b.start, `${day}: ${a.paperKey} -> ${b.paperKey}`);
      }
      assert.equal(new Set(r.stops.map(s => s.paperKey)).size, r.stops.length);
    }
  });
}
