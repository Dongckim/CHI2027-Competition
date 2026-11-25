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

test('layout (Figma 11/23): three regions, up to three seats each, the rest behind the count; empty Challenge slot on none', () => {
  const arc = { tension: 'found', nodes: [n('s1', 'S'), n('s2', 'S'), n('r1', 'R'), n('r2', 'R'), n('t1', 'T')] };
  const l = layout(arc);
  // Figma 12 (597:711): node orbs' centres
  assert.deepEqual(l.nodes.map(x => [x.node.key, x.at]), [['s1', [121, 81.4]], ['s2', [269, 81.4]], ['r1', [63, 280.4]], ['r2', [100.7, 391]], ['t1', [327, 280.4]]]);
  assert.deepEqual(l.regions, [{ angle: 'S', count: 2, more: 0 }, { angle: 'R', count: 2, more: 0 }, { angle: 'T', count: 1, more: 0 }]);
  assert.deepEqual(l.nodes.filter(x => x.oneLine).map(x => x.node.key), ['r1', 'r2'], 'stacked Reframes keep one line');
  // Figma 24 / 24c: the three that matter, the whole count on the badge
  const crowd = layout({ tension: 'found', nodes: [...'abcde'.split('').map(k => n(`s${k}`, 'S')), ...'abcd'.split('').map(k => n(`r${k}`, 'R')), n('t1', 'T'), n('t2', 'T')] });
  assert.equal(crowd.nodes.length, 8);
  assert.deepEqual(crowd.regions.map(r => [r.angle, r.count, r.more]), [['S', 5, 2], ['R', 4, 1], ['T', 2, 0]]);
  assert.deepEqual(crowd.nodes.filter(x => x.node.angle === 'S').map(x => x.at), [[72.1, 56.4], [195, 88], [317.9, 59.9]]);
  assert.deepEqual(crowd.nodes.filter(x => x.node.angle === 'T').map(x => x.at), [[331.9, 269.1], [290.4, 392.7]]);
  assert.equal(layout({ tension: 'none', nodes: [n('s1', 'S')] }).emptyT?.join(), '327,280.4');
  assert.equal(layout({ tension: 'pending', nodes: [n('a', 'S'), n('b', 'T')] }).nodes.length, 2);
  const p7 = layout({ tension: 'pending', nodes: 'abcdefg'.split('').map(k => n(k, 'S')) });
  assert.deepEqual([p7.nodes.length, p7.regions.length], [5, 0], 'Figma 25: the five seats, no regions');
});

test('connector: from r 80 round the question to r 30 from the node (Figma Lines)', () => {
  const c = connector([BOX.cx - 200, BOX.cy]);
  assert.deepEqual([Math.round(c.x1), Math.round(c.x2), c.y1, c.y2], [BOX.cx - 80, BOX.cx - 170, BOX.cy, BOX.cy]);
});
