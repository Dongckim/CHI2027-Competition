import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { NO_EDITS, removeStop, addItem, pickOne, swapStop, applyEdits, ADDED_BOOST } from '../../app/src/today/edits.js';
import { freeGaps, moreForYou, dayBounds, MIN_GAP_MIN } from '../../app/src/today/more.js';
import { diffStops, fakeRoomChange, checkDue, CHECK_EVERY_MS, MIN_CHECK_MS } from '../../app/src/today/changes.js';
import { planDays } from '../../app/src/today/plan-days.js';
import { indexData, venueTravelMinutes } from '../../app/src/planner/plan.js';
import { venueClock } from '../../app/src/time.js';

const MIN = 60_000;

test('edits: remove, pick, swap, add move a talk between the lists; applyEdits feeds the planner', () => {
  let e = removeStop(NO_EDITS, 'a');
  assert.deepEqual(e, { removed: ['a'], passed: [], added: [] });
  e = addItem(e, 'a'); // adding back what was removed
  assert.deepEqual(e, { removed: [], passed: [], added: ['a'] });
  e = pickOne(NO_EDITS, 'x', ['y']);
  assert.deepEqual(e, { removed: [], passed: ['y'], added: ['x'] });
  assert.deepEqual(swapStop(NO_EDITS, 'old', 'new'), { removed: ['old'], passed: [], added: ['new'] });
  const c = applyEdits([{ paperKey: 'a', relevance: 0.9 }, { paperKey: 'y', relevance: 0.8 }, { paperKey: 'x', relevance: 0.2 }], e, () => 0.2);
  assert.deepEqual(c, [{ paperKey: 'a', relevance: 0.9 }, { paperKey: 'x', relevance: ADDED_BOOST + 0.2 }]);
});

test('free gaps: only gaps of at least the minimum, each knows the stops around it', () => {
  const s = (k, a, b) => ({ paperKey: k, start: a * MIN, end: b * MIN });
  const gaps = freeGaps([s('a', 100, 112), s('b', 115, 130), s('c', 200, 290)], 90 * MIN, 300 * MIN);
  assert.deepEqual(gaps.map(g => [g.start / MIN, g.end / MIN, g.before?.paperKey ?? null, g.after?.paperKey ?? null]), [[90, 100, null, 'a'], [130, 200, 'b', 'c'], [290, 300, 'c', null]]);
  assert.equal(MIN_GAP_MIN, 10);
});

test('version checks: at most once a minute (never under 30 s)', () => {
  assert.equal(checkDue(null, 0), true);
  assert.equal(checkDue(0, CHECK_EVERY_MS - 1), false);
  assert.equal(checkDue(0, CHECK_EVERY_MS), true);
  assert.ok(CHECK_EVERY_MS >= MIN_CHECK_MS);
});

const dir = new URL('../../data/build/chi2026/', import.meta.url);
test('sample Tuesday: remove → free time → undo; pick one; More for you; a room change is detected', { skip: !existsSync(new URL('papers.json', dir)) && 'run npm run data:build chi2026' }, () => {
  const read = f => JSON.parse(readFileSync(new URL(f, dir)));
  const [meta, papers, sessions, rooms] = ['meta', 'papers', 'sessions', 'rooms'].map(f => read(`${f}.json`));
  const venue = new URL('../../data/venue/', import.meta.url);
  const travelMinutes = venueTravelMinutes(JSON.parse(readFileSync(new URL('ccib.json', venue))), JSON.parse(readFileSync(new URL('chi2026.json', venue))));
  const response = JSON.parse(readFileSync(new URL('../../contracts/examples/RecommendResponse.chi2026-tuesday.json', import.meta.url)));
  const index = indexData({ meta, papers, sessions, rooms });
  const day = '2026-04-14', tz = meta.timeZone;
  const plan = edits => planDays({ index, travelMinutes, days: [day] }, response, null, edits)[0];
  const times = p => p.stops.map(s => `${venueClock(s.start, tz)} ${s.paperKey.slice(-6)}`);
  const all = response.items.map(({ paperKey, relevance }) => ({ paperKey, relevance }));
  const bounds = dayBounds(sessions, day, tz);
  const ctx = { index, travelMinutes, timeZone: tz };

  const original = plan(NO_EDITS);
  assert.deepEqual(times(original), ['09:00 221829', '11:15 221879', '12:03 221851', '14:15 225821']);

  // Remove the 14:15 poster: the plan loses it, a free gap opens until the end of the day, and it is never offered again.
  const removed = removeStop(NO_EDITS, 'chi2026:225821');
  const afterRemove = plan(removed);
  assert.deepEqual(times(afterRemove), ['09:00 221829', '11:15 221879', '12:03 221851']);
  const gap = freeGaps(afterRemove.stops, bounds.start, bounds.end).find(g => g.start <= original.stops[3].start && g.end >= original.stops[3].end);
  assert.ok(gap, 'the removed slot is inside a free gap');
  assert.equal(moreForYou(ctx, all, removed, afterRemove, bounds, gap).some(m => m.paperKey === 'chi2026:225821'), false);
  // Undo = the edits from before the action → the same plan as before.
  assert.deepEqual(times(plan(NO_EDITS)), times(original));

  // Pick one at 11:15: choose Prism (wild) over Forage; Forage is passed on and leaves the plan.
  const picked = pickOne(NO_EDITS, 'chi2026:221848', ['chi2026:221879']);
  const afterPick = plan(picked);
  assert.deepEqual(times(afterPick), ['09:00 221829', '11:15 221848', '12:03 221851', '14:15 225821']);
  assert.equal(afterPick.conflicts.length, 0, 'no PICK ONE left at 11:15');
  // Passed talks stay offered: with 12:03 removed, Forage (11:15–11:27) fits the gap 09:12–14:15 again… but not while Prism holds 11:15.
  assert.equal(moreForYou(ctx, all, picked, afterPick, bounds).some(m => m.paperKey === 'chi2026:221879'), false);
  // In the default sample plan nothing else fits: every recommendation that fits is already planned → "Nothing fits".
  assert.deepEqual(moreForYou(ctx, all, NO_EDITS, original, bounds), []);
  // Removing one side of a PICK ONE lets the planner promote the other side by itself (nothing left to offer).
  const noForage = plan(removeStop(NO_EDITS, 'chi2026:221879'));
  assert.deepEqual(times(noForage), ['09:00 221829', '11:15 221848', '12:03 221851', '14:15 225821']);
  // Swap = remove one stop + add another in one step.
  assert.deepEqual(times(plan(swapStop(NO_EDITS, 'chi2026:221851', 'chi2026:221879'))).slice(0, 3), ['09:00 221829', '11:15 221879', '14:15 225821']);

  // Programme change: the 12:03 talk moves room → one change for my plan, none for talks I don't have.
  const moved = fakeRoomChange(index, 'chi2026:221851');
  const changes = diffStops(original.stops, index, moved);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, 'room');
  assert.equal(changes[0].paperKey, 'chi2026:221851');
  assert.notEqual(changes[0].to, changes[0].from);
  assert.deepEqual(diffStops(original.stops, index, fakeRoomChange(index, 'chi2026:221848')), []);
  assert.deepEqual(diffStops(original.stops, index, index), []);
});

test('More for you: a talk fits a gap only with the walk to it and from it; removed talks are not offered', () => {
  const t = (h, m) => Date.UTC(2026, 3, 14, h, m);
  const slot = (h, m, len, roomKey = 'r') => ({ start: t(h, m), end: t(h, m) + len * MIN, roomKey, sessionKey: 's' });
  const paper = (key, s) => [key, { key, scheduled: true, slots: [s] }];
  const index = { papers: new Map([paper('C', slot(10, 30, 12)), paper('D', slot(10, 5, 12)), paper('E', slot(10, 50, 12)), paper('F', slot(10, 20, 12))]), rooms: new Map([['r', { key: 'r' }]]) };
  const stops = [{ paperKey: 'A', ...slot(10, 0, 12) }, { paperKey: 'B', ...slot(11, 0, 12) }];
  const dayPlan = { day: '2026-04-14', stops, wheelchair: false };
  const ctx = { index, travelMinutes: () => 3, timeZone: 'UTC' };
  const cands = ['C', 'D', 'E', 'F'].map((paperKey, i) => ({ paperKey, relevance: 0.9 - i / 10 }));
  const bounds = { start: t(9, 0), end: t(18, 0) };
  // C 10:30–10:42 fits 10:12–11:00 with 3 min each way; D overlaps A; E ends 11:02 (> 11:00 − 3); F 10:20 (≥ 10:12 + 3) fits.
  assert.deepEqual(moreForYou(ctx, cands, NO_EDITS, dayPlan, bounds).map(m => m.paperKey), ['C', 'F']);
  assert.deepEqual(moreForYou(ctx, cands, removeStop(NO_EDITS, 'C'), dayPlan, bounds).map(m => m.paperKey), ['F']);
  const morning = freeGaps(stops, bounds.start, bounds.end)[0]; // 09:00–10:00: none of them
  assert.deepEqual(moreForYou(ctx, cands, NO_EDITS, dayPlan, bounds, morning), []);
});

test('offline line: only when offline, with the time the data was saved on the phone’s clock', async () => {
  const { offlineNote } = await import('../../app/src/today/offline.js');
  const savedAt = Date.UTC(2026, 3, 14, 6, 40);
  assert.equal(offlineNote(true, savedAt, 'Asia/Seoul'), null);
  assert.equal(offlineNote(false, savedAt, 'Asia/Seoul'), 'Offline · saved at 15:40'); // a phone in Seoul
  assert.equal(offlineNote(false, savedAt, 'America/Chicago'), 'Offline · saved at 01:40'); // the same moment in Chicago
  assert.equal(offlineNote(false, savedAt), new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(savedAt).replace(/^/, 'Offline · saved at ')); // default = this machine
  assert.equal(offlineNote(false, null), 'Offline · showing what is on this phone');
});

test('simulate: ?simulate=room-change works on the sample day only, a real plan ignores it and drops it', async () => {
  const { simulateRequested, keepsSample } = await import('../../app/src/today/simulate.js');
  assert.equal(simulateRequested('sample', '?simulate=room-change'), true);
  assert.equal(simulateRequested('sample', '?x=1&simulate=room-change'), true);
  assert.equal(simulateRequested('plan', '?simulate=room-change'), false); // Today with a built plan
  assert.equal(simulateRequested('none', '?simulate=room-change'), false); // no plan yet
  assert.equal(simulateRequested('sample', ''), false);
  assert.equal(simulateRequested('sample', '?simulate=other'), false);
  // Leaving the sample day (to Today with a plan, onboarding, the cleared screen) drops the simulated change;
  // screens opened from the sample day keep it.
  for (const head of ['today', 'start', 'building', 'cleared', 'questions', '']) assert.equal(keepsSample(head, false), false, head);
  for (const head of ['sample', 'more', 'explore', 'talk', 'person', 'directions']) assert.equal(keepsSample(head, false), true, head);
  assert.equal(keepsSample('directions', true), true);
});
