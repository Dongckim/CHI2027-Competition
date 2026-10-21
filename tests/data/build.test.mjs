import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { autoAcronym, buildEdition, loadEdition, talkSlots, wallToInstant } from '../../data/scripts/build.mjs';

const wall = iso => Date.parse(iso + 'Z');

test('wall-clock feed times become real instants', () => {
  assert.equal(new Date(wallToInstant(wall('2026-04-13T09:00:00'), 'Europe/Madrid')).toISOString(), '2026-04-13T07:00:00.000Z');
  assert.equal(new Date(wallToInstant(wall('2024-05-13T09:00:00'), 'Pacific/Honolulu')).toISOString(), '2024-05-13T19:00:00.000Z');
  // Day the clocks go forward in Spain (02:00 -> 03:00).
  assert.equal(new Date(wallToInstant(wall('2026-03-29T03:30:00'), 'Europe/Madrid')).toISOString(), '2026-03-29T01:30:00.000Z');
  assert.equal(new Date(wallToInstant(wall('2026-03-29T01:30:00'), 'Europe/Madrid')).toISOString(), '2026-03-29T00:30:00.000Z');
});

test('talk slots follow contentIds order and must fit the session', () => {
  const s = wall('2026-04-13T09:00:00');
  const slots = talkSlots(s, s + 90 * 60000, Array(7).fill(12));
  assert.equal(slots.length, 7);
  assert.equal(slots[6][0], s + 72 * 60000);
  assert.equal(slots[6][1], s + 84 * 60000);
  assert.equal(talkSlots(s, s + 90 * 60000, Array(8).fill(12)), null);
  assert.equal(talkSlots(s, s + 90 * 60000, [12, 0]), null);
  assert.equal(talkSlots(s, s + 90 * 60000, [90]), null);
  assert.equal(talkSlots(s, s, [12, 12]), null);
});

test('auto acronyms', () => {
  assert.equal(autoAcronym('Carnegie Mellon University'), 'CMU');
  assert.equal(autoAcronym('University of California, Irvine'), 'UCI');
  assert.equal(autoAcronym('KAIST'), 'KAIST');
  assert.equal(autoAcronym('Google'), null);
});

const fixture = () => ({
  schemeVersion: 7,
  conference: { year: 2026 },
  publicationInfo: { version: 3 },
  contentTypes: [{ id: 1, name: 'Paper', duration: 12 }, { id: 2, name: 'Event', duration: 0 }],
  timeSlots: [{ id: 10, type: 'SESSION', startDate: wall('2026-04-13T11:15:00'), endDate: wall('2026-04-13T12:45:00') }],
  rooms: [{ id: 5, name: 'Room 111' }],
  floors: [{ name: 'P1', roomIds: [5] }],
  sessions: [{ id: 100, name: 'Accessibility II', typeId: 1, roomId: 5, timeSlotId: 10, chairIds: null, contentIds: [21, 20] }],
  events: [{ id: 200, name: 'Video Presentations', roomId: 5, startDate: wall('2026-04-13T09:00:00'), endDate: wall('2026-04-13T09:00:00'), contentIds: [22] }],
  contents: [
    { id: 20, typeId: 1, title: 'B', tags: null, authors: [{ personId: 1, affiliations: [{ institution: 'MIT' }] }] },
    { id: 21, typeId: 1, title: 'A', authors: [{ personId: 1, affiliations: [{ institution: 'Massachusetts Institute of Technology' }] }], addons: { v: { type: 'video', url: 'https://v' } } },
    { id: 22, typeId: 1, title: 'Remote', authors: [] },
  ],
  people: [{ id: 1, firstName: 'Ada', lastName: null }],
});
const opts = { edition: 'chi2026', version: { revision: 1, generated_at: 'x' }, timeZone: 'Europe/Madrid', curated: { 'Massachusetts Institute of Technology': ['MIT'] } };

test('buildEdition: keys, talk order, remote items, aliases, people', () => {
  const out = buildEdition(fixture(), opts);
  const [b, a, remote] = out.papers;
  assert.equal(a.key, 'chi2026:21');
  assert.equal(a.slots[0].order, 1);
  assert.equal(b.slots[0].order, 2);
  assert.equal(new Date(a.slots[0].start).toISOString(), '2026-04-13T09:15:00.000Z');
  assert.equal(b.slots[0].start - a.slots[0].start, 12 * 60000);
  assert.equal(a.slots[0].roomKey, 'chi2026:5');
  assert.equal(a.video, 'https://v');
  assert.equal(remote.scheduled, false);
  assert.equal(out.sessions.find(s => s.id === 200).timing, 'none');
  assert.equal(out.aliases.institutions.length, 1, 'MIT folds into the full name');
  assert.deepEqual(out.aliases.lookup.mit, ['inst:massachusetts-institute-of-technology']);
  assert.equal(out.people[0].appearances.length, 2);
  assert.equal(out.people[0].name, 'Ada');
  assert.deepEqual(out.topics.map(t => t.label), ['Accessibility']);
  assert.equal(out.meta.attribution, 'Programme data © ACM CHI 2026, licensed under CC BY-NC-SA 4.0.');
});

test('buildEdition is deterministic', () => {
  assert.equal(JSON.stringify(buildEdition(fixture(), opts)), JSON.stringify(buildEdition(fixture(), opts)));
});

test('chi2026 feed: every paper session gets 12-minute talk slots', { skip: !existsSync(new URL('../../data/raw/chi2026/', import.meta.url)) && 'run npm run data:fetch first' }, async () => {
  const { feed, opts } = await loadEdition('chi2026');
  const out = buildEdition(feed, opts);
  const paperSessions = out.sessions.filter(s => s.type === 'Paper' && s.kind === 'session');
  assert.equal(paperSessions.length, 232);
  assert.ok(paperSessions.every(s => s.timing === 'talks'));
  assert.ok(out.papers.filter(p => p.type === 'Paper' && p.scheduled).every(p => p.slots.every(s => s.end - s.start === 12 * 60000 && s.roomKey)));
});
