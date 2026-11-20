import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoInstant } from '../../app/src/arc/demo.js';
import { venueInstant } from '../../app/src/time.js';

const days = ['2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17'], timeZone = 'Europe/Madrid';
test('demo clock: second day 10:00 outside the conference, real clock during it, ?at= wins', () => {
  assert.deepEqual(demoInstant({ days, timeZone, now: Date.UTC(2026, 10, 20) }), { ms: venueInstant('2026-04-14', 600, timeZone), auto: true });
  assert.equal(new Date(venueInstant('2026-04-14', 600, timeZone)).toISOString(), '2026-04-14T08:00:00.000Z'); // 10:00 CEST
  assert.equal(demoInstant({ days, timeZone, now: venueInstant('2026-04-16', 300, timeZone) }), null);
  assert.ok(demoInstant({ days, timeZone, now: venueInstant('2026-04-12', 23 * 60, timeZone) }).auto, 'the day before');
  assert.deepEqual(demoInstant({ days, timeZone, now: Date.UTC(2026, 10, 20), at: '2026-04-15T16:30' }), { ms: venueInstant('2026-04-15', 990, timeZone), auto: false });
});
