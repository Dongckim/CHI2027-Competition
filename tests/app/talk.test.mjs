// 14b close question, 14e previous stop / walk / floor row, 14f places near the door (app/src/arc/talk.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeQuestion, closeText, floorRooms, placesNear, previousStop, floorChange, fromPreviousText, walkSummary, roomLabel, shareText } from '../../app/src/arc/talk.js';
import { REGISTRATION } from '../../app/src/venue/walk.js';

const json = p => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url)));
const venue = json('data/venue/ccib.json'), edition = json('data/venue/chi2026.json'), labels = json('data/venue/ccib.labels.json');
const key = area => Object.keys(edition.rooms).find(k => edition.rooms[k] === area);
// programme rooms as schedule.json names them (a few)
const rooms = [['P1-111', 'P1 - Room 111'], ['P1-112', 'P1 - Room 112'], ['P1-120', 'P1 - Room 120'], ['P1-127', 'P1 - Room 127'],
  ['P2-211', 'P2 - Room 211'], ['P0-areas-1+2+3', 'Area 1 + 2 + 3: demos']].map(([a, name]) => ({ key: key(a), name }));

test('close question: shared word roots, two at least, own questions left out', () => {
  const qs = [
    { id: 'a', text: 'Did the headset weight matter for the participants?', votes: 5, mine: false },
    { id: 'b', text: 'Did presence in the headset hold up over a longer session?', votes: 1, mine: false },
    { id: 'c', text: 'How long did presence hold in each session?', votes: 0, mine: true },
  ];
  const r = closeQuestion('Does presence hold over a longer session?', qs);
  assert.equal(r.question.id, 'b');
  assert.equal(r.count, 2); // its votes + the person who asked it
  assert.equal(closeQuestion('headset?', qs), null, 'one word is not close');
  assert.equal(closeQuestion('What about the headset battery life?', qs), null, 'one shared word only');
  assert.equal(closeQuestion('How long did presence hold each session?', qs.slice(2)), null, 'not your own');
  assert.equal(closeQuestion('Tracking hands', [{ id: 'd', text: 'Who tracked the hand?', votes: 0 }]).question.id, 'd', 'plural and -ing roots');
  assert.equal(closeText(1), '1 person asked something close.');
  assert.equal(closeText(6), '6 people asked something close.');
});

test('previous stop: the latest earlier stop the same venue day', () => {
  const tz = 'Europe/Madrid', day = Date.UTC(2026, 3, 14, 8); // 10:00 in Barcelona
  const H = 3600_000;
  const stops = [
    { key: 'x', start: day - 24 * H, roomKey: 'r1' }, // the day before
    { key: 'a', start: day + H, roomKey: 'r2' },
    { key: 'b', start: day + 2 * H, roomKey: 'r3' },
    { key: 'me', start: day + 3 * H, roomKey: 'r4' },
    { key: 'c', start: day + 4 * H, roomKey: 'r5' },
  ];
  assert.equal(previousStop(stops, 'me', day + 3 * H, tz).key, 'b');
  assert.equal(previousStop(stops, 'a', day + H, tz), null, 'first of the day');
});

test('walk from the previous stop: minutes and floors', () => {
  assert.equal(floorChange('P1', 'P1'), 'same floor');
  assert.equal(floorChange('P0', 'P1'), '1 floor up');
  assert.equal(floorChange('P2', 'P0'), '2 floors down');
  assert.equal(floorChange('P1', 'M2'), 'up to M2');
  assert.equal(floorChange('AUD', 'P1'), 'another floor');
  assert.equal(fromPreviousText(venue, edition, key('P1-111'), key('P1-120')), '1–2 min from your previous stop · same floor');
  assert.match(fromPreviousText(venue, edition, key('P1-111'), key('P2-211')), /^\d+(–\d+)? min from your previous stop · 1 floor up$/);
  assert.equal(fromPreviousText(venue, edition, key('P1-111'), key('P1-111')), 'Same room as your previous stop');
});

test('directions summary: from Registration, escalators or step-free', () => {
  const up = walkSummary(venue, edition, REGISTRATION, key('P1-111'));
  assert.equal(up.floor, '1 floor up');
  assert.equal(up.stepFree, false); // the walk takes the escalators
  assert.ok(up.stepFreeMinutes?.length === 2, 'the elevator way has its own minutes');
  const flat = walkSummary(venue, edition, key('P1-111'), key('P1-127'));
  assert.deepEqual([flat.floor, flat.stepFree, flat.stepFreeMinutes], ['same floor', true, null]);
  const aud = walkSummary(venue, edition, REGISTRATION, key('AUD-auditorium'));
  assert.equal(aud.stepFree, null, 'level changes with no lift or escalator on the plan: not called step-free');
});

test('floor row: programme rooms on the level, one per area, real names, this one marked', () => {
  const f = floorRooms(venue, edition, labels, rooms, key('P1-120'));
  assert.equal(f.level, 'P1');
  assert.deepEqual(f.rooms.map(r => [r.label, r.current]), [['111', false], ['112', false], ['120', true], ['127', false]]);
  assert.equal(roomLabel('Area 1 + 2 + 3: demos', 'P0-areas-1+2+3', labels), 'Exhibit Hall (Areas 1–3)');
});

test('places near: the door and the corridor it opens onto, from the plan', () => {
  assert.deepEqual(placesNear(venue, edition, key('P1-111'), 'Room 111'), ['Room 111 door', 'Foyer 1']);
  assert.deepEqual(placesNear(venue, edition, key('P1-120'), 'Room 120'), ['Room 120 door', 'Foyer 2']);
  assert.equal(shareText('Foyer 1', 'XR & immersive'), "I'm at Foyer 1 · look for the XR & immersive shape on my phone");
});
