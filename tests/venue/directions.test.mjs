// 09 Getting there: turn-by-turn lines on the official CCIB plan (data/venue/ccib.json) with the hand-kept names
// (data/venue/ccib.labels.json). The four routes are the prototype's (reference/wayfinding/arc-wayfinding.html);
// where the official plan differs from the prototype's traced layout, the plan wins (decision 003, S5 plan) and the
// difference is written next to the check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { route } from '../../app/src/venue/route.js';
import { directions, turnWord, sideWord, cueWord, placeName } from '../../app/src/venue/directions.js';

const venue = JSON.parse(readFileSync(new URL('../../data/venue/ccib.json', import.meta.url)));
const labels = JSON.parse(readFileSync(new URL('../../data/venue/ccib.labels.json', import.meta.url)));
const edition = JSON.parse(readFileSync(new URL('../../data/venue/chi2026.json', import.meta.url)));
const lines = (from, to, opts, names) => directions(venue, labels, route(venue, from, to, opts), names).lines.map(l => l.text);

test('left and right on the plan (x to the right, y down)', () => {
  const east = { x: 1, y: 0 }, south = { x: 0, y: 1 }, north = { x: 0, y: -1 };
  assert.equal(turnWord(east, south), 'right'); // facing east, turning to the south is a right turn
  assert.equal(turnWord(east, north), 'left');
  assert.equal(turnWord(east, { x: 0.9, y: 0.1 }), 'straight');
  assert.equal(sideWord(east, south), 'right'); // walking east, a door to the south is on your right
  assert.equal(cueWord(Math.PI / 2), 'Turn right');
  assert.equal(cueWord(-Math.PI / 2), 'Turn left');
  assert.equal(cueWord(0.2), 'Straight ahead');
  assert.equal(placeName('127'), 'Room 127');
  assert.equal(placeName('Entrance Hall'), 'Entrance Hall');
});

test('Room 117 → Room 127, step-free: turn right … Foyer 1, then turn left … Room 127 is on your right', () => {
  // Same as the prototype.
  assert.deepEqual(lines('P1-117', 'P1-127', { wheelchair: true }), [
    'Exit right into Foyer 1, pass Elevators',
    'Turn left into the corridor to Rooms 118–134, pass Room 119',
    'Room 127 on your right',
  ]);
});

test('Room 133 → Room 111, step-free: Foyer 1 and Room 111, sides from the official plan', () => {
  // The prototype says "turn right into Foyer 1 … Room 111 is on your left". On the official plan the 118–134 corridor
  // meets Foyer 1 at x = 167.8 m and Room 111 (x 175.6–190.2 m) lies beyond that corner, so you turn left and the
  // room is on your right. The prototype drew the corridor at the far end of Foyer 1 with 111 before it.
  assert.deepEqual(lines('P1-133', 'P1-111', { wheelchair: true }), [
    'Exit left into the corridor to Rooms 118–134',
    'Turn left into Foyer 1',
    'Room 111 on your right',
  ]);
});

test('Room 113 → Posters, stairs allowed: down to P0 (the plan has escalators, not stairs)', () => {
  // The prototype's "the stairs to P0" is a guess; the CCIB plan marks escalators (via the M1 mezzanine) and no stairs.
  const r = route(venue, 'P1-113', 'P0-areas-1+2+3');
  assert.deepEqual(r.levels, ['P1', 'M1', 'P0']);
  assert.deepEqual(lines('P1-113', 'P0-areas-1+2+3', {}, { toName: 'Posters' }), [
    'Exit left into Foyer 1',
    'Escalator down to P0',
    'Walk along the P0 concourse',
    'Posters on your left',
  ]);
});

test('Entrance Hall → Room 121, step-free: an elevator up to P1 … Room 121 is on your left', () => {
  // The prototype takes Elevator 2; on the official plan the quickest step-free ride is shaft 3 (elevator3 in ccib.json).
  const l = lines('P0-entrance-hall', 'P1-121', { wheelchair: true });
  assert.deepEqual(l, [
    'Exit right into the P0 concourse, pass Escalators',
    'Elevator 3 up to P1',
    'Walk along Foyer 1',
    'Turn left into the corridor to Rooms 118–134, pass Room 119',
    'Room 121 on your left',
  ]);
  assert.ok(!route(venue, 'P0-entrance-hall', 'P1-121', { wheelchair: true }).edges.some(e => e.kind === 'escalator'));
});

test('every feed room to every feed room: lines end at the room, step-free never says escalator', () => {
  const areas = [...new Set(Object.values(edition.rooms))].filter(a => venue.areas[a]?.doors?.length);
  let n = 0;
  for (const a of areas) for (const b of areas) {
    if (a === b) continue;
    for (const wheelchair of [false, true]) {
      const r = route(venue, a, b, { wheelchair });
      if (!r) continue;
      const d = directions(venue, labels, r);
      assert.match(d.lines.at(-1).text, / on your (left|right)$| is right there$| entrance$/, `${a} → ${b}`);
      for (const l of d.lines) if (noXY(l.node)) assert.doesNotMatch(l.text, /\b(left|right)\b|, pass /, `${a} → ${b}: ${l.text}`);
      if (wheelchair) assert.ok(!d.lines.some(l => l.kind === 'escalator'), `${a} → ${b} step-free`);
      assert.ok(d.lines.every(l => !/undefined|null|NaN/.test(l.text)), `${a} → ${b}: ${d.lines.map(l => l.text)}`);
      assert.equal(d.cues.length > 0, true);
      n++;
    }
  }
  assert.ok(n > 2000, `${n} routes`);
});

test('steps for the 3D plan: an icon, the way in and out for the floor arrow, a one-line card', () => {
  const d = directions(venue, labels, route(venue, 'P1-117', 'P1-127'));
  assert.deepEqual(d.lines.map(l => [l.icon, l.card]), [
    ['right', 'Exit right into Foyer 1'],
    ['left', 'Turn left into the corridor to Rooms 118–134'],
    ['arrive', 'Room 127 · on your right'],
  ]);
  const [exit, turn, arrive] = d.lines;
  assert.deepEqual([exit.dir.x, exit.dir.y], [1, 0]); // along Foyer 1 (x to the right on the plan)
  assert.deepEqual([turn.dir.x, turn.dir.y], [0, -1]); // up the 118–134 corridor
  assert.deepEqual([turn.inDir.x, turn.inDir.y], [1, 0]); // coming along Foyer 1
  assert.ok(arrive.inDir && arrive.dir); // from the corridor into the door
  const ride = directions(venue, labels, route(venue, 'P1-113', 'P0-areas-1+2+3')).lines.find(l => l.kind === 'escalator');
  assert.equal(ride.icon, 'down');
});

// Places the plan has no coordinates for (the Auditorium, reached by the Connecting Walkway from Access A): no left or
// right and no "pass …" there, only the way's name and length; the arrival is the entrance; the 3D view says it has no
// plan for that place.
const noXY = id => venue.nodes[id]?.x == null;
test('Entrance Hall → Auditorium: the walkway by name and length, then the entrance', () => {
  const d = directions(venue, labels, route(venue, 'P0-entrance-hall', 'AUD-auditorium'));
  assert.deepEqual(d.lines.map(l => l.text), [
    'Exit right into the P0 concourse, pass Escalators',
    'Take the Connecting Walkway to the Auditorium · about 120 m',
    'Auditorium entrance',
  ]);
  assert.equal(d.lines.at(-1).noPlan, 'Auditorium');
  assert.equal(d.lines[0].noPlan, null);
  assert.equal(d.cues.length, d.lines.length);
  assert.ok(d.cues.slice(1).every(c => c.angle === 0 && !/left|right/i.test(c.text)), JSON.stringify(d.cues));
});

test('Auditorium → Room 111: out by the walkway, the step shown where you come out (Access A)', () => {
  const d = directions(venue, labels, route(venue, 'AUD-auditorium', 'P1-111'));
  assert.equal(d.lines[0].text, 'Leave the Auditorium · take the Connecting Walkway to Access A · about 120 m');
  assert.equal(d.lines[0].card, d.lines[0].text);
  assert.equal(d.lines[0].node, 'P0-access-a/door'); // on the plan: the 3D view shows it, "You come out here"
  assert.equal(d.lines[0].noPlan, null);
  assert.equal(d.lines[0].outHere, true);
  assert.ok(d.lines.slice(1).every(l => !l.outHere));
  assert.match(d.lines.at(-1).text, /^Room 111 on your (left|right)$/);
});

test('every route: no left, right or "pass" where the plan has no coordinates', () => {
  const areas = [...new Set(Object.values(edition.rooms))].filter(a => venue.areas[a]?.doors?.length);
  let n = 0;
  for (const a of areas) for (const b of areas) {
    if (a === b) continue;
    const r = route(venue, a, b);
    if (!r?.path.some(noXY)) continue;
    const d = directions(venue, labels, r);
    for (const l of d.lines.filter(l => noXY(l.node) || l.kind === 'take')) {
      assert.doesNotMatch(l.text, /\b(left|right)\b|, pass /, `${a} → ${b}: ${l.text}`);
      assert.ok(l.noPlan || !noXY(l.node), `${a} → ${b}: ${l.text} has no noPlan`);
    }
    if (noXY(r.path.at(-1))) assert.match(d.lines.at(-1).text, / entrance$/, `${a} → ${b}`);
    n++;
  }
  assert.ok(n > 40, `${n} routes through places without coordinates`);
});

// "pass …" names something you can see on the way: a room number, WC, Escalators. The plan's own corridor names ("Foyer
// 0" is the P0 concourse you are walking along) are not that, so they are never passed.
test('never "pass" a corridor by its plan name', () => {
  const corridorNames = new Set(Object.values(venue.nodes).filter(n => n.kind === 'corridor' && n.name).map(n => n.name));
  const areas = [...new Set(Object.values(edition.rooms))].filter(a => venue.areas[a]?.doors?.length).concat(['P0-entrance-hall']);
  let passes = 0;
  for (const a of areas) for (const b of areas) {
    if (a === b) continue;
    for (const wheelchair of [false, true]) {
      const r = route(venue, a, b, { wheelchair });
      if (!r) continue;
      for (const l of directions(venue, labels, r).lines) {
        const m = l.text.match(/, pass (.*)$/);
        if (!m) continue;
        passes++;
        assert.ok(!corridorNames.has(m[1]), `${a} → ${b}: ${l.text}`);
      }
    }
  }
  assert.ok(passes > 1000, `${passes} lines still pass something`);
  assert.equal(lines('P1-127', 'AUD-auditorium', { wheelchair: true })[3], 'Walk along the P0 concourse');
});
