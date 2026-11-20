import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failuresOf } from './failures.mjs';

test('qa:auto reads failures from every check style, not their summaries', () => {
  const out = ['ok   a thing', 'FAIL B lost heard  {"x":1}', 'FAIL two-tabs: 1 of 9', 'FAIL 2: 12 map | 14 detail', '01  no violations',
    '      [05] target under 44 px: "Skip" 48×44', 'FAIL: 3 (serious/critical, …)', 'stopped: boom', 'PASS 6/6'].join('\n');
  assert.deepEqual(failuresOf(out, 1), ['B lost heard  {"x":1}', '12 map', '14 detail', '[05] target under 44 px: "Skip" 48×44', 'stopped: boom']);
  assert.deepEqual(failuresOf('PASS 3/3', 0), []);
  assert.deepEqual(failuresOf('', 2), ['exit 2 with no failure line (see the output above)']);
});
