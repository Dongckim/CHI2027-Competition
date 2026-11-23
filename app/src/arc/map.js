// 12 map rules (Figma 597:711, 601:1198/1311/1442, 856:2106): where each node sits and which state it shows. Pure, so tests check
// the layout. Coordinates are Figma's map box (390 × 530, centre 195,240); the screen scales the box.

/** @typedef {'next'|'upcoming'|'heard'|'ended'} NodeState */

export const BOX = { w: 390, h: 530, cx: 195, cy: 240, orb: 80 }; // orb = where connectors start (Figma: the 164 holo ring, r 82, less 2)
const NODE_R = 30; // where connectors end, from a node's, a bundle's or the empty slot's centre (Figma Lines)

/**
 * Node states from the talk times, the clock and what the person marked as heard (on this device only).
 * Next = the first talk on the Arc that has not ended (on now, or the next one). Ended = over and not marked heard
 * (it becomes something to read). Talks without a time are upcoming.
 * @param {{ key: string }[]} nodes
 * @param {(key: string) => { start: number, end: number } | null} timeOf
 * @param {number} now
 * @param {Set<string>} heard
 * @returns {Map<string, NodeState>}
 */
export function nodeStates(nodes, timeOf, now, heard) {
  const out = new Map();
  const open = nodes.map(n => ({ key: n.key, t: timeOf(n.key) })).filter(x => x.t && x.t.end > now).sort((a, b) => a.t.start - b.t.start);
  const next = open[0]?.key ?? null;
  for (const n of nodes) {
    const t = timeOf(n.key);
    out.set(n.key, heard.has(n.key) ? 'heard' : !t ? 'upcoming' : t.end <= now ? 'ended' : n.key === next ? 'next' : 'upcoming');
  }
  return out;
}

// Seats per region, as Figma draws them (11/23, 597:711 / 601:1311 / 856:2106): three regions round the question,
// Supports at the top, Reframes lower left, Challenges lower right (the mirror of Reframes). Up to three talks per region.
const SEATS = {
  S: [[[195, 88]], [[121, 81.4], [269, 81.4]], [[72.1, 56.4], [195, 88], [317.9, 59.9]]],
  R: [[[63, 280.4]], [[63, 280.4], [100.7, 391]], [[55.1, 244.9], [64.8, 349.3], [137.7, 439.9]]],
  T: [[[327, 280.4]], [[331.9, 269.1], [290.4, 392.7]], [[334.9, 244.9], [325.2, 349.3], [252.3, 439.9]]],
};
export const MAX_SEATS = 3;
// Figma 15: where the + goes with 0 / 1 / 2 talks in a region (15's add slots, unscaled); a full region has none
// (해석(확인 전): Figma 15 shows no full region; a talk is swapped in by selecting one, Q7)
export const ADD_AT = {
  S: [[195, 88], [269, 81.4], [195, 90]],
  R: [[63, 280.4], [100.7, 391], [162, 478]],
  T: [[327, 280.4], [277, 394], [228, 478]],
};
// The region's count badge (Figma "Angle · support" etc., 30 tall): its centre
export const BADGE_AT = { S: [191, 20], R: [40, 502], T: [342, 502] };
const PENDING = [[70, 140], [320, 140], [60, 360], [330, 360], [195, 456]];

/**
 * Where nodes go: up to three per region in the Arc's order (best first); the rest wait behind the region's count badge
 * (24 / 24c: "the three that matter + the whole count").
 * pending (25): angles are not known yet, so every node sits evenly round the ring in one neutral style.
 * @returns {{ nodes: { node: object, at: [number, number], oneLine?: boolean }[], regions: { angle: string, count: number, more: number }[], emptyT: [number, number] | null }}
 */
export function layout(arc) {
  // Figma 25 has the 5 seats only; the list (13) shows every talk while the angles sort
  if (arc.tension === 'pending') return { nodes: arc.nodes.slice(0, PENDING.length).map((node, i) => ({ node, at: PENDING[i] })), regions: [], emptyT: null };
  const nodes = [], regions = [];
  for (const a of ['S', 'R', 'T']) {
    const of = arc.nodes.filter(n => n.angle === a), shown = of.slice(0, MAX_SEATS);
    // Figma's titles are one line; ours take two where there is room. Two or more Reframes or Challenges sit one under
    // the other (a two-line title runs into the next ring), and the middle of three Supports sits over the holo ring.
    shown.forEach((node, i) => nodes.push({ node, at: SEATS[a][shown.length - 1][i], ...((a !== 'S' && shown.length > 1) || (a === 'S' && shown.length === 3 && i === 1) ? { oneLine: true } : {}) }));
    regions.push({ angle: a, count: of.length, more: of.length - shown.length });
  }
  return { nodes, regions, emptyT: arc.tension === 'none' ? SEATS.T[0][0] : null };
}

/** The connector from the holo ring to just outside a node's core (Figma Lines: r 80 to r 30). */
export function connector([x, y], r = NODE_R) {
  const dx = x - BOX.cx, dy = y - BOX.cy, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  return { x1: BOX.cx + ux * BOX.orb, y1: BOX.cy + uy * BOX.orb, x2: x - ux * r, y2: y - uy * r, ux, uy };
}
