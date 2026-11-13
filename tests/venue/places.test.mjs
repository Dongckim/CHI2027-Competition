// Directions to places that are not talks (S5b): programme rooms, the edition's fixed places (Registration), and the
// nearest WC or elevator. 09 opens them as #/directions/place/<id>; 05 search shows them with Directions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { route } from '../../app/src/venue/route.js';
import { directions } from '../../app/src/venue/directions.js';
import { placeTargets, routeToNearest, searchPlaces } from '../../app/src/venue/places.js';

const venue = JSON.parse(readFileSync(new URL('../../data/venue/ccib.json', import.meta.url)));
const labels = JSON.parse(readFileSync(new URL('../../data/venue/ccib.labels.json', import.meta.url)));
const edition = JSON.parse(readFileSync(new URL('../../data/venue/chi2026.json', import.meta.url)));
const roomKey = area => Object.keys(edition.rooms).find(k => edition.rooms[k] === area);
const rooms = Object.keys(edition.rooms).map(key => ({ key, name: `P1 - Room ${edition.rooms[key].split('-').at(-1)}` }));

test('a route can end at a point of the plan (a WC or an elevator), not only at a room', () => {
  const r = route(venue, 'P1-117', 'P1/wc2');
  assert.equal(r.path.at(-1), 'P1/wc2');
  const d = directions(venue, labels, r, { toName: 'WC' });
  assert.match(d.lines.at(-1).text, /^WC on your (left|right)$/);
});

test('place ids: Registration, a programme room, the nearest WC or elevator', () => {
  assert.deepEqual(placeTargets(venue, labels, edition, 'registration'), { name: 'Registration', targets: ['P0-entrance-hall'] });
  assert.deepEqual(placeTargets(venue, labels, edition, roomKey('P1-127'), () => 'Room 127').targets, ['P1-127']);
  const wc = placeTargets(venue, labels, edition, 'wc');
  assert.equal(wc.name, 'WC');
  assert.ok(wc.targets.length >= 8 && wc.targets.every(t => venue.nodes[t].kind === 'wc'));
  assert.equal(placeTargets(venue, labels, edition, 'nowhere'), null);
});

test('nearest, from every room on every level: the quickest by seconds; a tie goes to your own level, then fewer metres', () => {
  const areas = [...new Set(Object.values(edition.rooms))].filter(a => venue.areas[a]?.doors?.length).concat(['P0-entrance-hall']);
  let n = 0;
  for (const a of areas) for (const id of ['wc', 'elevator']) for (const wheelchair of [false, true]) {
    const place = placeTargets(venue, labels, edition, id), near = routeToNearest(venue, labels, a, place, { wheelchair });
    if (!near) continue;
    const all = place.targets.map(t => route(venue, a, t, { wheelchair })).filter(Boolean);
    const best = Math.min(...all.map(r => r.seconds[1]));
    assert.equal(near.r.seconds[1], best, `${a} → ${id}${wheelchair ? ' step-free' : ''}: ${near.r.to} is not the quickest`);
    const level = venue.areas[a].level;
    if (venue.nodes[near.r.to].level !== level)
      assert.ok(!all.some(r => venue.nodes[r.to].level === level && r.seconds[1] <= near.r.seconds[1]), `${a} → ${id}: ${near.r.to} on another level`);
    n++;
  }
  assert.ok(n > 150, `${n} cases`);
  const lift = routeToNearest(venue, labels, 'P1-112', placeTargets(venue, labels, edition, 'elevator'), { wheelchair: true });
  assert.equal(lift.r.to, 'P1/elevator3'); // the review's case: not a ride down to P0
  assert.match(lift.name, /^Elevator \d$/);
  assert.deepEqual(routeToNearest(venue, labels, 'P1-127', placeTargets(venue, labels, edition, roomKey('P1-127'))), { same: true });
});

test('search: room numbers, Registration and facilities by the words people use', () => {
  const ids = q => searchPlaces(venue, edition, rooms, q).map(p => p.id);
  assert.deepEqual(ids('toilet'), ['wc']);
  assert.deepEqual(ids('WC'), ['wc']);
  assert.deepEqual(ids('lift'), ['elevator']);
  assert.deepEqual(ids('registration'), ['registration']);
  assert.ok(ids('127').includes(roomKey('P1-127')));
  assert.deepEqual(ids('virtual reality'), []); // a talk search: no places
});
