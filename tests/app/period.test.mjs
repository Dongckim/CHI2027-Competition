import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodsOf, firstPeriod } from '../../app/src/arc/period.js';

const tz = 'Europe/Madrid', days = ['2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17'];
const at = s => Date.parse(`${s}+02:00`);
const slot = { a: { start: at('2026-04-14T15:00'), end: at('2026-04-14T15:15') }, b: { start: at('2026-04-16T10:00'), end: at('2026-04-16T10:15') }, c: { start: at('2026-04-13T10:00'), end: at('2026-04-13T10:15') } };
const timeOf = k => slot[k] ?? null;
const arc = keys => ({ nodes: keys.map(key => ({ key })) });
const now = at('2026-04-14T10:00'), none = new Set();

test('20 periods: today, this week and after CHI by the Arc’s own talks', () => {
  assert.deepEqual(periodsOf(arc(['a', 'b']), timeOf, now, none, { days, timeZone: tz }), { today: true, week: true, after: false });
  assert.deepEqual(periodsOf(arc(['b']), timeOf, now, none, { days, timeZone: tz }), { today: false, week: true, after: false });
  assert.deepEqual(periodsOf(arc(['c']), timeOf, now, none, { days, timeZone: tz }), { today: false, week: false, after: true }, 'all over');
  assert.deepEqual(periodsOf(arc(['b']), timeOf, now, new Set(['b']), { days, timeZone: tz }), { today: false, week: false, after: true }, 'all heard');
  assert.deepEqual(periodsOf(arc(['x']), timeOf, now, none, { days, timeZone: tz }), { today: false, week: true, after: false }, 'no time: left this week');
  assert.deepEqual(periodsOf(arc(['a', 'b']), timeOf, at('2026-04-20T10:00'), none, { days, timeZone: tz }), { today: false, week: false, after: true }, 'conference over');
  assert.equal(firstPeriod([{ today: false, week: true }, { today: false, week: false }]), 'week');
  assert.equal(firstPeriod([{ today: false, week: false, after: true }]), 'after');
});
