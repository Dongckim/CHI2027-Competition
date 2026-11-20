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

test('layout: 2 per side, 3 at the bottom, then a +N bundle; empty Challenges slot on none', () => {
  const arc = { tension: 'found', nodes: [n('s1', 'S'), n('s2', 'S'), n('s3', 'S'), n('s4', 'S'), n('r1', 'R'), n('r2', 'R'), n('r3', 'R'), n('t1', 'T')] };
  const l = layout(arc);
  assert.equal(l.nodes.length, 4, 'Supports fill both side seats, so Reframes show 1 + a bundle in the second seat');
  assert.deepEqual(l.bundles, [{ angle: 'S', at: [36, 236], count: 2 }, { angle: 'R', at: [252, 494], count: 2 }]);
  assert.equal(layout({ tension: 'found', nodes: [n('s1', 'S'), n('r1', 'R'), n('r2', 'R'), n('r3', 'R')] }).nodes.length, 4, 'three at the bottom when the sides have room');
  assert.deepEqual(l.nodes.find(x => x.node.key === 't1').at, [324, 236]);
  assert.equal(layout({ tension: 'none', nodes: [n('s1', 'S')] }).emptyT?.join(), '324,236');
  assert.equal(layout({ tension: 'pending', nodes: [n('a', 'S'), n('b', 'T')] }).nodes.length, 2);
  const p7 = layout({ tension: 'pending', nodes: 'abcdefg'.split('').map(k => n(k, 'S')) });
  assert.deepEqual([p7.nodes.length, p7.bundles[0].count, p7.bundles[0].angle], [5, 2, null]);
});

test('connector: from the question orb edge to the node edge', () => {
  const c = connector([BOX.cx - 200, BOX.cy]);
  assert.deepEqual([Math.round(c.x1), Math.round(c.x2), c.y1, c.y2], [BOX.cx - 72, BOX.cx - 168, BOX.cy, BOX.cy]);
});
