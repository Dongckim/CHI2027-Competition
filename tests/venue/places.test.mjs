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

test('nearest: the WC with the shortest walk from where you are; the elevator named by its number', () => {
  const near = routeToNearest(venue, labels, 'P1-117', placeTargets(venue, labels, edition, 'wc'));
  for (const t of placeTargets(venue, labels, edition, 'wc').targets) {
    const r = route(venue, 'P1-117', t);
    if (r) assert.ok(near.r.minutes[1] <= r.minutes[1], `${t} is quicker than ${near.r.to}`);
  }
  assert.equal(near.name, 'WC');
  const lift = routeToNearest(venue, labels, 'P0-entrance-hall', placeTargets(venue, labels, edition, 'elevator'), { wheelchair: true });
  assert.match(lift.name, /^Elevator \d$/);
  assert.equal(lift.r.path.at(-1).split('/')[0], 'P0'); // the one on your own level, not a ride up to another
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
