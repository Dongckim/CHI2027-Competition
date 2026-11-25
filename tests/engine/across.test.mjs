import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acrossArcs } from '../../app/src/arc/across.js';

test('talks across Arcs: only the ones in two or more, a talk twice in one Arc counted once', () => {
  const arc = keys => ({ nodes: keys.map(key => ({ key })) });
  assert.deepEqual([...acrossArcs([arc(['a', 'b', 'b']), arc(['b', 'c']), arc(['b', 'a'])])], [['a', 2], ['b', 3]]);
  assert.equal(acrossArcs([arc(['a'])]).size, 0);
});
