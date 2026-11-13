// Today's walking times from the venue route (S5): the card's "~m min walk", "from Registration", and when Leave now shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { walkMinutes, REGISTRATION } from '../../app/src/venue/walk.js';
import { dayCard, LEAVE_BUFFER_MIN, walkNote } from '../../app/src/today/card.js';

const venue = JSON.parse(readFileSync(new URL('../../data/venue/ccib.json', import.meta.url)));
const edition = JSON.parse(readFileSync(new URL('../../data/venue/chi2026.json', import.meta.url)));
const key = area => Object.keys(edition.rooms).find(k => edition.rooms[k] === area);
const MIN = 60_000;

test('walk minutes: from the stop before, the first from Registration, step-free slower', () => {
  const r117 = key('P1-117'), r127 = key('P1-127'), r211 = key('P2-211');
  assert.deepEqual(walkMinutes(venue, edition, r117, r127), [2, 4]);
  assert.deepEqual(walkMinutes(venue, edition, r117, r127, { wheelchair: true }), [4, 5]);
  assert.deepEqual(walkMinutes(venue, edition, REGISTRATION, r127), walkMinutes(venue, edition, key('P0-entrance-hall'), r127));
  const walking = walkMinutes(venue, edition, r117, r211), stepFree = walkMinutes(venue, edition, r117, r211, { wheelchair: true });
  assert.ok(stepFree[1] > walking[1], `${stepFree} vs ${walking}`); // elevator wait and wheelchair speed
  assert.deepEqual(walkMinutes(venue, edition, r117, r117), [0, 0]);
  assert.equal(walkMinutes(venue, edition, r117, 'chi2026:999'), null); // not in the venue file: the caller keeps its guess
  assert.equal(walkMinutes(venue, null, r117, r127), null); // an edition without a venue yet
});

test('Leave now comes earlier for a step-free plan', () => {
  const stops = [{ paperKey: 'a', start: 100 * MIN, end: 120 * MIN }, { paperKey: 'b', start: 200 * MIN, end: 220 * MIN }];
  const walking = () => [2, 4], stepFree = () => [3, 7];
  const at = (m, walk) => dayCard(stops, m * MIN, walk).kind;
  const t = 200 - 7 - LEAVE_BUFFER_MIN; // the step-free leave time for stop b
  assert.equal(at(t, stepFree), 'leave');
  assert.equal(at(t, walking), 'next'); // walking people still have 3 minutes
  assert.equal(at(200 - 4 - LEAVE_BUFFER_MIN, walking), 'leave');
  // no walk function (or null): the old guesses, first stop 3–5 min → leave 10 min before
  assert.equal(dayCard(stops, (100 - 11) * MIN).kind, 'first');
  assert.equal(dayCard(stops, (100 - 10) * MIN, () => null).kind, 'leave');
});

test('planner walking time to the Auditorium counts the Connecting Walkway', async () => {
  const { venueTravelMinutes } = await import('../../app/src/planner/plan.js');
  const { route } = await import('../../app/src/venue/route.js');
  const toAud = route(venue, 'P1-111', 'AUD-auditorium'), toAccess = route(venue, 'P1-111', 'P0-access-a');
  assert.ok(toAud.metres - toAccess.metres >= 116, `${toAud.metres} vs ${toAccess.metres}`); // the walkway is 116.8 m
  assert.equal(venueTravelMinutes(venue, edition)({ key: key('P1-111') }, { key: key('AUD-auditorium') }), toAud.minutes[1]);
});

test('card walk note: same room or same area instead of "0–0 min walk", and then no Directions', () => {
  assert.deepEqual(walkNote([2, 4], { first: false }), { text: '2–4 min walk', directions: true });
  assert.deepEqual(walkNote([3, 5], { first: true }), { text: '3–5 min from Registration', directions: true });
  assert.deepEqual(walkNote([0, 0], { first: false, sameRoom: true }), { text: 'Same room', directions: false });
  assert.deepEqual(walkNote([0, 0], { first: false, sameRoom: false }), { text: 'Same area', directions: false });
  // two programme rooms on one venue area (P0 Areas 1+2+3): the venue says 0 minutes
  const [a, b] = Object.keys(edition.rooms).filter(k => edition.rooms[k] === 'P0-areas-1+2+3');
  assert.deepEqual(walkMinutes(venue, edition, a, b), [0, 0]);
});
