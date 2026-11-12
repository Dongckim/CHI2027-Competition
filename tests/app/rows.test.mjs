import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayRows, candidatesFrom, conferenceDays } from '../../app/src/today/rows.js';

const response = { items: [
  { paperKey: 'chi2026:1', relevance: 0.9, band: 'near', type: 'paper' },
  { paperKey: 'chi2026:2', relevance: 0.5, band: 'adjacent', type: 'poster' },
  { paperKey: 'chi2026:3', relevance: 0.8, band: 'near', type: 'poster' },
  { paperKey: 'chi2026:4', relevance: 0.3, band: 'wild', type: 'demo' },
] };
const stop = (paperKey, start) => ({ paperKey, roomKey: 'r', start, end: start + 1, travelFromPrevMin: 0 });

test('Today tags: PICK ONE from planner overlap first, then TRY NEW for non-near, then type', () => {
  const plan = { stops: [stop('chi2026:1', 1), stop('chi2026:2', 2), stop('chi2026:3', 3)], conflicts: [{ paperKey: 'chi2026:1', alternatives: [{ paperKey: 'chi2026:4' }] }] };
  assert.deepEqual(todayRows(plan, response).map(r => [r.tag, r.pickOf]), [['PICK ONE', 2], ['TRY NEW', 0], ['POSTER', 0]]);
  assert.deepEqual(candidatesFrom(response)[1], { paperKey: 'chi2026:2', relevance: 0.5 });
});

test('conference days are venue-local dates, sorted and unique', () => {
  // 2026-04-13 23:30 UTC is already 04-14 in Madrid (UTC+2).
  const s = [{ start: Date.UTC(2026, 3, 13, 23, 30) }, { start: Date.UTC(2026, 3, 13, 8) }, { start: Date.UTC(2026, 3, 13, 9) }, { start: null }];
  assert.deepEqual(conferenceDays(s, 'Europe/Madrid'), ['2026-04-13', '2026-04-14']);
});
