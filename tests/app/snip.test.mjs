import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abstractHit } from '../../app/src/arc/snip.js';

test('abstract search: every word, the phrase in bold, its own letters', () => {
  const a = 'We study how Haptic Feedback changes typing speed on phones.';
  assert.deepEqual(abstractHit(a, 'haptic feedback'), { before: 'We study how ', hit: 'Haptic Feedback', after: ' changes typing speed on phones.' });
  assert.equal(abstractHit(a, 'haptic gloves'), null); // every word must be there
  assert.equal(abstractHit(a, 'on'), null); // short words alone do not search
  assert.equal(abstractHit(a, 'speed haptic').hit, 'Haptic'); // not a phrase: the longest word
});
