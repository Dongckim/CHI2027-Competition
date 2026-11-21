import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeStates, layout, connector, BOX } from '../../app/src/arc/map.js';

const n = (key, angle) => ({ key, angle, label: key, evidence: null, debut: false });

test('node states: next is the first talk not over, ended unless marked heard, no time = upcoming', () => {
  const t = { a: { start: 100, end: 200 }, b: { start: 300, end: 400 }, c: { start: 500, end: 600 } };
  const nodes = [n('c', 'S'), n('a', 'S'), n('b', 'R'), n('x', 'T')];
  const s = nodeStates(nodes, k => t[k] ?? null, 250, new Set());
  assert.deepEqual(Object.fromEntries(s), { c: 'upcoming', a: 'ended', b: 'next', x: 'upcoming' });
  assert.equal(nodeStates(nodes, k => t[k] ?? null, 250, new Set(['a'])).get('a'), 'heard');
  assert.equal(nodeStates(nodes, k => t[k] ?? null, 350, new Set()).get('b'), 'next', 'on now = next');
});

test('layout: 2 per side, 3 at the bottom (Figma 24, y 446), then a +N bundle; empty Challenges slot on none', () => {
  const arc = { tension: 'found', nodes: [n('s1', 'S'), n('s2', 'S'), n('s3', 'S'), n('s4', 'S'), n('r1', 'R'), n('r2', 'R'), n('r3', 'R'), n('t1', 'T')] };
  const l = layout(arc);
  assert.equal(l.nodes.length, 6, 'Supports bundle; three Reframes keep their seats even with both side seats used');
  assert.deepEqual(l.bundles, [{ angle: 'S', at: [36, 236], count: 2 }]);
  assert.deepEqual(l.nodes.filter(x => x.node.angle === 'R').map(x => x.at), [[100, 446], [195, 474], [290, 446]]);
  assert.deepEqual(l.nodes.filter(x => x.oneLine).map(x => x.node.key), ['s2', 'r1', 'r2', 'r3'], 'one-line titles where two would collide');
  const r5 = layout({ tension: 'found', nodes: 'abcde'.split('').map(k => n(k, 'R')) });
  assert.deepEqual([r5.nodes.map(x => x.at), r5.bundles], [[[100, 446], [290, 446]], [{ angle: 'R', at: [195, 474], count: 3 }]], 'beyond three: the outer seats + a bundle between');
  assert.deepEqual(layout({ tension: 'found', nodes: [n('r1', 'R'), n('r2', 'R')] }, true).nodes.map(x => x.at), [[112, 446], [278, 446]], 'Edit (15) leaves the middle to the +');
  assert.deepEqual(l.nodes.find(x => x.node.key === 't1').at, [324, 236]);
  assert.equal(layout({ tension: 'none', nodes: [n('s1', 'S')] }).emptyT?.join(), '324,236');
  assert.equal(layout({ tension: 'pending', nodes: [n('a', 'S'), n('b', 'T')] }).nodes.length, 2);
  const p7 = layout({ tension: 'pending', nodes: 'abcdefg'.split('').map(k => n(k, 'S')) });
  assert.deepEqual([p7.nodes.length, p7.bundles.length], [5, 0], 'Figma 25: the five seats, no bundle');
});

test('connector: from r 80 round the question to r 30 from the node (Figma Lines)', () => {
  const c = connector([BOX.cx - 200, BOX.cy]);
  assert.deepEqual([Math.round(c.x1), Math.round(c.x2), c.y1, c.y2], [BOX.cx - 80, BOX.cx - 170, BOX.cy, BOX.cy]);
});
