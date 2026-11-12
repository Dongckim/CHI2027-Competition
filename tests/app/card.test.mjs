import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dayCard, laterStops, leaveAt, talkPosition, sessionSlotsFrom, LEAVE_BUFFER_MIN, WALK_MIN, FIRST_WALK_MIN } from '../../app/src/today/card.js';
import { planDays } from '../../app/src/today/plan-days.js';
import { indexData, venueTravelMinutes } from '../../app/src/planner/plan.js';
import { venueInstant, venueClock, wallToInstant } from '../../app/src/time.js';

const MIN = 60_000;
const stop = (paperKey, start, end) => ({ paperKey, start: start * MIN, end: end * MIN, sessionKey: 's' });

test('card rules at the edges: leave window, exact start and end, empty day', () => {
  const stops = [stop('a', 100, 112), stop('b', 200, 290)];
  const at = m => dayCard(stops, m * MIN).kind;
  assert.equal(at(100 - FIRST_WALK_MIN[1] - LEAVE_BUFFER_MIN - 1), 'first');
  assert.equal(at(100 - FIRST_WALK_MIN[1] - LEAVE_BUFFER_MIN), 'leave');
  assert.equal(at(100), 'now');
  assert.equal(at(111), 'now');
  assert.equal(at(112), 'next');
  assert.equal(at(200 - WALK_MIN[1] - LEAVE_BUFFER_MIN), 'leave');
  assert.equal(at(290), 'done');
  assert.equal(dayCard([], 0).kind, 'empty');
  assert.equal(leaveAt(stops[1]), (200 - 9) * MIN);
  assert.deepEqual(dayCard(stops, 150 * MIN), { kind: 'next', stop: stops[1], done: 1, total: 2 });
  assert.deepEqual(laterStops(stops, dayCard(stops, 50 * MIN)).map(s => s.paperKey), ['b']);
  assert.deepEqual(laterStops(stops, dayCard(stops, 300 * MIN)), []);
});

test('talk position comes from the session’s own talk times; block sessions have none', () => {
  const papers = [
    { paperKey: 'x', slots: [{ sessionKey: 's', start: 3 }] }, { paperKey: 'y', slots: [{ sessionKey: 's', start: 1 }] },
    { paperKey: 'z', slots: [{ sessionKey: 's', start: 2 }, { sessionKey: 't', start: null }] },
  ];
  const slots = sessionSlotsFrom(papers);
  assert.deepEqual(talkPosition({ paperKey: 'x', sessionKey: 's', start: 3 }, slots, 'talks'), { index: 3, count: 3, missed: 2 });
  assert.equal(talkPosition({ paperKey: 'x', sessionKey: 's', start: 3 }, slots, 'block'), null);
});

test('demo clock maps a venue time of day to the right instant, also across a DST change', () => {
  const t = venueInstant('2026-04-14', 10 * 60 + 25, 'Europe/Madrid');
  assert.equal(new Date(t).toISOString(), '2026-04-14T08:25:00.000Z'); // CEST = UTC+2
  assert.equal(venueClock(t, 'Europe/Madrid'), '10:25');
  assert.equal(new Date(venueInstant('2026-03-28', 600, 'Europe/Madrid')).toISOString(), '2026-03-28T09:00:00.000Z'); // CET, day before the change
  assert.equal(wallToInstant(Date.UTC(2027, 4, 11, 9, 0), 'America/New_York'), Date.UTC(2027, 4, 11, 13, 0)); // chi2027: EDT = UTC−4
});

const dir = new URL('../../data/build/', import.meta.url);
test('sample Tuesday (chi2026, fake recommendations): the card follows the clock', { skip: !existsSync(new URL('chi2026/papers.json', dir)) && 'run npm run data:build chi2026' }, () => {
  const read = p => JSON.parse(readFileSync(new URL(p, dir)));
  const [meta, papers, sessions, rooms] = ['meta', 'papers', 'sessions', 'rooms'].map(f => read(`chi2026/${f}.json`));
  const venue = new URL('../../data/venue/', import.meta.url);
  const travelMinutes = venueTravelMinutes(JSON.parse(readFileSync(new URL('ccib.json', venue))), JSON.parse(readFileSync(new URL('chi2026.json', venue))));
  const response = JSON.parse(readFileSync(new URL('../../contracts/examples/RecommendResponse.chi2026-tuesday.json', import.meta.url)));
  const [day] = planDays({ index: indexData({ meta, papers, sessions, rooms }), travelMinutes, days: ['2026-04-14'] }, response, null);
  const slots = sessionSlotsFrom(papers);
  const timing = new Map(sessions.map(s => [s.key, s.timing]));
  const at = hhmm => {
    const [h, m] = hhmm.split(':').map(Number);
    const c = dayCard(day.stops, venueInstant('2026-04-14', h * 60 + m, meta.timeZone));
    const pos = c.stop && c.kind === 'now' ? talkPosition(c.stop, slots, timing.get(c.stop.sessionKey)) : null;
    return [c.kind, c.stop ? venueClock(c.stop.start, meta.timeZone) : null, `${c.done} of ${c.total}`, pos && `talk ${pos.index} of ${pos.count}`, c.minutesIn ?? c.startsInMin ?? null];
  };
  assert.deepEqual(day.stops.map(s => venueClock(s.start, meta.timeZone)), ['09:00', '11:15', '12:03', '14:15']);
  assert.deepEqual(at('8:40'), ['first', '09:00', '0 of 4', null, null]);
  assert.deepEqual(at('8:50'), ['leave', '09:00', '0 of 4', null, 10]); // first walk 3–5 min + 5 min buffer
  assert.deepEqual(at('9:05'), ['now', '09:00', '0 of 4', 'talk 1 of 6', 5]);
  assert.deepEqual(at('10:22'), ['next', '11:15', '1 of 4', null, null]);
  assert.deepEqual(at('11:08'), ['leave', '11:15', '1 of 4', null, 7]);
  assert.deepEqual(at('11:20'), ['now', '11:15', '1 of 4', 'talk 1 of 7', 5]);
  assert.deepEqual(at('11:40'), ['next', '12:03', '2 of 4', null, null]);
  assert.deepEqual(at('12:07'), ['now', '12:03', '2 of 4', 'talk 5 of 7', 4]);
  assert.deepEqual(at('15:00'), ['now', '14:15', '3 of 4', null, 45]); // poster block: minutes in, no talk number
  assert.deepEqual(at('18:30'), ['done', null, '4 of 4', null, null]);
});
