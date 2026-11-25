import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepAdvice } from '../../app/src/arc/keep.js';

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
test('keeping Arcs: in-app browsers warned, iPhone Safari asked to add to the Home Screen, others left alone', () => {
  assert.equal(keepAdvice(SAFARI, false), 'homeScreen');
  assert.equal(keepAdvice(SAFARI, true), null, 'already a Home Screen app');
  assert.equal(keepAdvice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5', false), 'inApp');
  assert.equal(keepAdvice('Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 Instagram 300.0', false), 'inApp');
  assert.equal(keepAdvice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1', false), null, 'Chrome on iOS keeps its own data');
  assert.equal(keepAdvice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', false), null);
});
