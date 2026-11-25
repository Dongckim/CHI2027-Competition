// 12 map rules (Figma 597:711, 601:1198/1311/1442, 856:2106): where each node sits and which state it shows. Pure, so tests check
// the layout. Coordinates are Figma's map box (390 × 530, centre 195,240); the screen scales the box.

/** @typedef {'next'|'upcoming'|'heard'|'ended'} NodeState */

export { BOX } from './box.js';
import { BOX } from './box.js';
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
  // the third Reframe / Challenge 8 right / left of Figma's 137.7 / 252.3: our 12 px time line under the middle one (Figma
  // 10 px) reached its ring (height-check "do not touch", 24 at 844)
  R: [[[63, 280.4]], [[63, 280.4], [100.7, 391]], [[55.1, 244.9], [64.8, 349.3], [146, 439.9]]],
  T: [[[327, 280.4]], [[331.9, 269.1], [290.4, 392.7]], [[334.9, 244.9], [325.2, 349.3], [244, 439.9]]],
};
export const MAX_SEATS = 3;
// Figma 15: where the + goes with 0 / 1 / 2 talks in a region (15's add slots, unscaled); with 3 or more, beside the
// region's count, clear of every node and − (해석(확인 전): Figma 15 shows no full region)
export const ADD_AT = {
  S: [[195, 88], [269, 81.4], [195, 88], [240, 20]],
  R: [[63, 280.4], [100.7, 391], [162, 478], [90, 502]],
  T: [[327, 280.4], [277, 394], [228, 478], [300, 502]],
};
// The region's count badge (Figma "Angle · support" etc., 30 tall): its centre
export const BADGE_AT = { S: [191, 20], R: [40, 502], T: [342, 502] };
const PENDING = [[70, 140], [320, 140], [60, 360], [330, 360], [195, 456]];
// 24b: the map moves toward the region that was pressed and shows up to twelve of its talks, nearest first (user 11/23
// 「좌하단 우하단을 클릭하면 그쪽으로 영역이 커져야지」). Supports as Figma 852:2015: the question drops to (195, 500), the
// talks above. Reframes: the question goes to the top right (320, 70) and the talks fill the lower left; Challenges the
// mirror. The other two angles' counts sit in the strip on the far side (clear of the talks). Seats: a 3 × 5 grid, rows 108 apart, inside the region, 150 or more from
// the question (worked out once; 해석(확인 전), Figma draws Supports only).
const FOCUS_R = [[170, 36], [170, 144], [278, 252], [170, 252], [62, 36], [62, 144], [278, 360], [62, 252], [170, 360], [62, 360], [170, 468], [62, 468]];
export const FOCUS = {
  S: { at: [195, 500], seats: [[195, 340], [90.3, 366], [299.7, 366], [195, 235], [62.5, 270.5], [327.5, 270.5], [195, 130], [56.4, 157], [333.6, 157], [195, 30], [73.4, 46], [316.6, 46]],
    others: [['R', [54, 496]], ['T', [328, 496]]] },
  R: { at: [320, 70], seats: FOCUS_R, others: [['S', [382, 196]], ['T', [382, 252]]] }, // 24b: one column on the screen edge, right-aligned
  T: { at: [70, 70], seats: FOCUS_R.map(([x, y]) => [390 - x, y]), others: [['S', [8, 196]], ['R', [8, 252]]] }, // left-aligned
};
// Where the rest of an angle lies, from its count: up for Supports, down-left for Reframes, down-right for Challenges
// (prototype "More · …": the chevron turned 0 / 240 / 120 degrees)
export const TOWARD = { S: 0, R: 240, T: 120 };
// With more talks than seats the badge steps aside for that chevron (24: 601:1311, 24c: 856:2106)
export const MORE_AT = { S: { badge: [195, 34], arrow: [195, 9.5] }, R: { badge: [48, 512], arrow: [13, 512] }, T: { badge: [342, 512], arrow: [377, 512] } };

/** 24b: the talks of one angle (up to twelve) and the other two angles' badges. */
export function focusLayout(arc, angle) {
  const of = arc.nodes.filter(n => n.angle === angle), f = FOCUS[angle];
  return {
    nodes: of.slice(0, f.seats.length).map((node, i) => ({ node, at: f.seats[i], oneLine: true })),
    count: of.length,
    others: f.others.map(([a, at]) => ({ angle: a, count: arc.nodes.filter(n => n.angle === a).length, at })),
  };
}

/**
 * Where nodes go: up to three per region in the Arc's order (best first); the rest wait behind the region's count badge
 * (24 / 24c: "the three that matter + the whole count").
 * pending (25): angles are not known yet, so every node sits evenly round the ring in one neutral style.
 * edit: 15's seats (see below). @returns {{ nodes: { node: object, at: [number, number], oneLine?: boolean }[], regions: { angle: string, count: number, more: number }[], emptyT: [number, number] | null }}
 */
export function layout(arc, edit = false) {
  // Figma 25 has the 5 seats only; the list (13) shows every talk while the angles sort
  if (arc.tension === 'pending') return { nodes: arc.nodes.slice(0, PENDING.length).map((node, i) => ({ node, at: PENDING[i] })), regions: [], emptyT: null };
  const nodes = [], regions = [];
  for (const a of ['S', 'R', 'T']) {
    const of = arc.nodes.filter(n => n.angle === a), shown = of.slice(0, MAX_SEATS);
    // Edit (15) with two Supports: the outer seats, so the + takes the middle (195, 88) clear of their − (each 44 px)
    const seats = edit && a === 'S' && shown.length === 2 ? [SEATS.S[2][0], SEATS.S[2][2]] : SEATS[a][shown.length - 1];
    // Figma's titles are one line; ours take two where there is room. Two or more Reframes or Challenges sit one under
    // the other (a two-line title runs into the next ring), and the middle of three Supports sits over the holo ring.
    shown.forEach((node, i) => nodes.push({ node, at: seats[i], ...((a !== 'S' && shown.length > 1) || (a === 'S' && shown.length === 3 && i === 1) ? { oneLine: true } : {}) }));
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
