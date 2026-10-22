import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { route } from '../../app/src/venue/route.js';

const read = path => JSON.parse(readFileSync(new URL(`../../data/venue/${path}`, import.meta.url)));
const venue = read('ccib.json');
const chi2026 = read('chi2026.json');
const door = id => venue.nodes[venue.areas[id].doors[0]];

test('tables read from the PDF', () => {
  assert.deepEqual([venue.areas['P1-111'].m2, venue.areas['P1-111'].width, venue.areas['P1-111'].capacity.theater], [420, 14.4, 360]);
  assert.deepEqual(venue.areas['P2-banquet-hall'].height, [9.25, 5.6]);
  assert.equal(venue.areas['M2-m221'].length, 8);
});

// Hand checks: neighbouring rooms' doors are one room width apart (widths from the PDF tables, not from the drawing).
test('door spacing matches the room widths in the tables', () => {
  const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(1)} m, expected ${want} ± ${tol}`);
  near(Math.abs(door('P1-113').x - door('P1-114').x), 14.4, 1, '113 to 114');
  near(Math.abs(door('P1-118').y - door('P1-125').y), 7 * 7.5, 2, '118 to 125 (7 rooms of 7.5 m)');
  near(Math.abs(door('P1-127').y - door('P1-134').y), 7 * 7.5, 2, '127 to 134');
  near(Math.abs(door('M2-m211').x - door('M2-m212').x), 7.5, 1, 'M211 to M212');
  near(Math.abs(door('M2-m220').x - door('M2-m221').x), 4.3, 1, 'M220 to M221');
});

test('every chi2026 room has an area with doors', () => {
  for (const [room, area] of Object.entries(chi2026.rooms)) assert.ok(venue.areas[area]?.doors?.length, `${room} -> ${area}`);
});

test('every pair of chi2026 rooms has a route; step-free never takes an escalator', () => {
  const areas = [...new Set(Object.values(chi2026.rooms))];
  for (const a of areas) {
    for (const b of areas) {
      for (const stepFree of [false, true]) {
        const r = route(venue, a, b, { stepFree });
        assert.ok(r, `${a} -> ${b}`);
        assert.ok(r.minutes[0] <= r.minutes[1]);
        if (stepFree) assert.ok(r.via.every(v => v.kind !== 'escalator'), `${a} -> ${b}`);
      }
      assert.deepEqual(route(venue, a, b).minutes, route(venue, b, a).minutes, `${a} <-> ${b}`);
    }
  }
});

test('same room: no walk; other level: says how', () => {
  assert.equal(route(venue, 'P1-111', 'P1-111').metres, 0);
  const r = route(venue, 'P1-111', 'P2-211', { stepFree: true });
  assert.deepEqual(r.via, [{ kind: 'elevator', from: 'P1', to: 'P2' }]);
  assert.deepEqual([r.levels[0], r.levels.at(-1)], ['P1', 'P2']);
});

test('unknown area is an error, not a silent zero', () => {
  assert.throws(() => route(venue, 'P1-999', 'P1-111'), /unknown/);
});
