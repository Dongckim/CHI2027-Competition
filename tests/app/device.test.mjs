import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, freshState, readState, writeState, startRoute, setQuery, topicsFromResponse, toggleTopic, addOwnTopic,
  toggleNearby, toggleDay, toggleKind, toggleNeed, atStep, candidatesFor, limitStops,
} from '../../app/src/state/device.js';

const defaults = { edition: 'chi2026', days: ['2026-04-13', '2026-04-14'], language: 'ko' };
const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const response = {
  topics: [{ conceptId: 'topic:a', label: 'A', weight: 0.9 }, { conceptId: 'topic:b', label: 'B', weight: 0.5 }],
  nearby: [{ conceptId: 'topic:n', label: 'N', sharedConcept: 'topic:a', matchCount: 7, suggested: true }],
  items: [
    { paperKey: 'chi2026:1', feedType: 'Paper', relevance: 0.9, concepts: ['topic:a'] },
    { paperKey: 'chi2026:2', feedType: 'Posters', relevance: 0.6, concepts: ['topic:b'] },
    { paperKey: 'chi2026:3', feedType: 'Paper', relevance: 0.5, concepts: ['topic:b', 'topic:n'] },
    { paperKey: 'chi2026:4', feedType: 'Workshop', relevance: 0.4, concepts: ['topic:a'] },
    { paperKey: 'chi2026:5', feedType: 'Paper', relevance: 0.3, concepts: ['topic:other'] },
  ],
};

test('save and load: the plan comes back exactly, like after closing and reopening the browser', () => {
  const storage = memory();
  let s = readState(storage, defaults).state;
  s = topicsFromResponse(setQuery(s, 'I study sensemaking'), response);
  s = toggleNeed(toggleDay(s, '2026-04-13'), 'largerText');
  s = { ...atStep(s, 'summary'), builtAt: 123, mode: 'plan' };
  assert.equal(writeState(storage, s), true);
  const back = readState(storage, defaults);
  assert.equal(back.note, 'saved');
  assert.deepEqual(back.state, s);
  assert.deepEqual(back.state.plan.days, ['2026-04-14']);
  assert.equal(back.state.plan.needs.largerText, true);
});

test('load: nothing stored, broken, old version, other edition, or blocked storage all start over without throwing', () => {
  assert.equal(readState(memory(), defaults).note, 'none');
  for (const text of ['{not json', JSON.stringify({ version: 0, plan: {} }), JSON.stringify({ ...freshState(defaults), edition: 'chi2025' })]) {
    const storage = memory(); storage.setItem(STORAGE_KEY, text);
    const r = readState(storage, defaults);
    assert.equal(r.note, 'unreadable');
    assert.deepEqual(r.state, freshState(defaults));
  }
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(readState(blocked, defaults).note, 'unavailable');
  assert.equal(writeState(blocked, freshState(defaults)), false);
});

test('reopen: built plan → Today, browsing → Explore, unfinished onboarding → the step it stopped at', () => {
  const s = freshState(defaults);
  assert.equal(startRoute(s), 'start/research');
  assert.equal(startRoute(atStep(s, 'days')), 'start/days');
  assert.equal(startRoute({ ...s, mode: 'browse' }), 'explore');
  assert.equal(startRoute({ ...atStep(s, 'summary'), builtAt: 1, mode: 'plan' }), 'today');
  const storage = memory();
  writeState(storage, atStep(s, 'needs'));
  assert.equal(startRoute(readState(storage, defaults).state), 'start/needs');
});

test('topics: list made once per sentence, switching one off drops talks that only match it', () => {
  let s = topicsFromResponse(setQuery(freshState(defaults), 'q1'), response);
  assert.deepEqual(s.plan.topics.map(t => [t.conceptId, t.on]), [['topic:a', true], ['topic:b', true]]);
  s = toggleTopic(s, 'topic:b');
  assert.equal(topicsFromResponse(s, response), s, 'same sentence keeps the choices');
  assert.deepEqual(candidatesFor(response, s.plan).map(c => c.paperKey), ['chi2026:1', 'chi2026:5']);
  s = toggleNearby(s, response.nearby[0]); // topic:n brings back the talk that also has it
  assert.deepEqual(candidatesFor(response, s.plan).map(c => c.paperKey), ['chi2026:1', 'chi2026:3', 'chi2026:5']);
  s = toggleTopic(s, 'topic:b');
  assert.equal(s.plan.topics[1].on, true);
  assert.equal(topicsFromResponse(setQuery(s, 'q2'), response).plan.nearbyAdded.length, 0, 'a new sentence starts a new list');
  assert.equal(addOwnTopic(addOwnTopic(s, ' Maps '), 'maps').plan.topics.filter(t => t.custom).length, 1);
});

test('what to see filters by feed type; workshops only when chosen', () => {
  const s = topicsFromResponse(setQuery(freshState(defaults), 'q'), response);
  assert.deepEqual(candidatesFor(response, s.plan).map(c => c.paperKey), ['chi2026:1', 'chi2026:2', 'chi2026:3', 'chi2026:5']);
  assert.ok(candidatesFor(response, toggleKind(s, 'workshops').plan).some(c => c.paperKey === 'chi2026:4'));
  assert.ok(!candidatesFor(response, toggleKind(s, 'posters').plan).some(c => c.paperKey === 'chi2026:2'));
});

test('how full keeps the most valuable stops in time order', () => {
  const stop = (paperKey, start, value) => ({ paperKey, start, value });
  const day = { stops: [stop('a', 1, 0.2), stop('b', 2, 0.9), stop('c', 3, 0.5)], conflicts: [{ paperKey: 'a', alternatives: [] }, { paperKey: 'c', alternatives: [] }] };
  const kept = limitStops(day, 2);
  assert.deepEqual(kept.stops.map(s => s.paperKey), ['b', 'c']);
  assert.deepEqual(kept.conflicts.map(c => c.paperKey), ['c']);
  assert.equal(limitStops(day, 8), day);
});
