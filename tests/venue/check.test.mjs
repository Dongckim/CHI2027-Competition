import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { checkVenue } from '../../data/scripts/venue-check.mjs';

const venue = { venue: 'v', levels: [{ id: 'P0' }, { id: 'P1' }], areas: { 'P1-a': { level: 'P1', doors: ['d'] }, 'P0-b': { level: 'P0', doors: ['e'] }, 'P1-nodoor': { level: 'P1' } } };
const feed = { rooms: [{ id: 1, name: 'Room A' }, { id: 2, name: 'Room B' }, { id: 3, name: 'Room C' }, { id: 4, name: 'Room D' }],
  floors: [{ id: 10, name: 'P1', roomIds: [1, 2, 3] }, { id: 11, name: 'P0', roomIds: [4] }, { id: 12, name: 'Roof', roomIds: [] }] };

test('venue check: every feed room on an area with a door, on the level its floor says', () => {
  const edition = { edition: 'chi2099', floors: { 10: 'P1', 11: 'P0', 12: 'P1' },
    rooms: { 'chi2099:1': 'P1-a', 'chi2099:2': 'P0-b', 'chi2099:3': 'P1-nodoor', 'chi2099:4': 'P0-b', 'chi2099:9': 'P1-a' }, places: [{ id: 'reg', area: 'P1-a' }] };
  assert.deepEqual(checkVenue(feed, edition, venue), [
    'Room B: area P0-b is on P0, the feed puts the room on P1 ("P1")',
    'Room C: area P1-nodoor has no door, so no route can reach it',
    'chi2099:9: mapped in chi2099.json but on no feed floor',
  ]);
  assert.deepEqual(checkVenue({ ...feed, floors: [{ id: 13, name: 'New', roomIds: [1] }] }, { ...edition, rooms: { 'chi2099:1': 'P1-a' } }, venue),
    ['floor 13 "New": no level in data/venue/chi2099.json floors']);
  assert.deepEqual(checkVenue({ rooms: [], floors: [] }, { edition: 'chi2099', places: [{ id: 'reg', area: 'nowhere' }] }, venue), ['place reg: area nowhere missing or without a door']);
});

const raw = new URL('../../data/raw/chi2026/', import.meta.url);
test('chi2026: the feed and data/venue agree', { skip: !existsSync(raw) && 'needs data/raw/chi2026' }, () => {
  const feed = JSON.parse(readFileSync(new URL(readdirSync(raw).filter(f => /^rev-\d+\.json$/.test(f)).sort().at(-1), raw)));
  const edition = JSON.parse(readFileSync(new URL('../../data/venue/chi2026.json', import.meta.url)));
  const ccib = JSON.parse(readFileSync(new URL('../../data/venue/ccib.json', import.meta.url)));
  assert.deepEqual(checkVenue(feed, edition, ccib), []);
});
