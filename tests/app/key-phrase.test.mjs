import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keySegments } from '../../app/src/arc/keyPhrase.js';

test('14 key phrase: question words and a Challenge cue are marked, the sentence stays whole', () => {
  const s = 'However, unlike prior work, we did not find that changes in scenario fidelity significantly affected presence.';
  const seg = keySegments(s, 'Does VR fidelity raise presence?', 'T');
  assert.equal(seg.map(x => x.text).join(''), s);
  assert.deepEqual(seg.filter(x => x.mark).map(x => x.text), ['did not', 'fidelity', 'presence']);
  assert.deepEqual(keySegments('Robots helped people in daily life.', 'Robotics could be helpful in daily life?', 'S').filter(x => x.mark).map(x => x.text),
    ['Robots', 'daily life']);
  assert.deepEqual(keySegments('Nothing here.', 'presence', 'S'), [{ text: 'Nothing here.', mark: false }]);
});
