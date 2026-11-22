// 12 map rules (Figma 597:711, 601:1198/1311/1442): where each node sits and which state it shows. Pure, so tests check
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

// Seats per angle, as Figma draws them: Supports on the left, Challenges on the right (mirror), Reframes at the bottom.
const LEFT = { one: [[66, 236]], two: [[66, 112], [66, 358]], bundle: [36, 236] };
const RIGHT = { one: [[324, 236]], two: [[324, 112], [324, 358]], bundle: [354, 236] };
const PENDING = [[70, 140], [320, 140], [60, 360], [330, 360], [195, 456]];
const BOTTOM = { one: [[195, 470]], two: [[138, 446], [252, 446]], three: [[100, 446], [195, 474], [290, 446]] };
const BOTTOM_EDIT_TWO = [[112, 446], [278, 446]]; // Figma 15: two Reframes leave the middle seat to the +

function side(seats, nodes, max) {
  if (nodes.length <= max) return { placed: nodes.map((n, i) => ({ node: n, at: (nodes.length === 1 ? seats.one : nodes.length === 2 ? seats.two : seats.three)[i] })), bundle: null };
  // Keep the two outer seats and put the bundle between them (Figma 24 sides; at the bottom, the middle of the three)
  const outer = seats.three ? [seats.three[0], seats.three[2]] : seats.two;
  return { placed: nodes.slice(0, 2).map((n, i) => ({ node: n, at: outer[i] })), bundle: { at: seats.bundle ?? seats.three[1], count: nodes.length - 2 } };
}

/**
 * Where nodes go. Up to 2 per side for Supports and Challenges and up to 3 at the bottom for Reframes; beyond that the
 * two outer seats stay and the rest become one "+N" bundle between them (24). edit (15): two Reframes sit wider. Order within an angle is the Arc's (best first).
 * pending (25): angles are not known yet, so every node sits evenly round the ring in one neutral style.
 * @returns {{ nodes: { node: object, at: [number, number], oneLine?: boolean }[], bundles: { angle: string, at: [number, number], count: number }[], emptyT: [number, number] | null }}
 */
export function layout(arc, edit = false) {
  // Figma 25 has the 5 seats only (no bundle); the list (13) shows every talk while the angles sort
  if (arc.tension === 'pending') return { nodes: arc.nodes.slice(0, PENDING.length).map((node, i) => ({ node, at: PENDING[i] })), bundles: [], emptyT: null };
  const by = a => arc.nodes.filter(n => n.angle === a);
  const s = side(LEFT, by('S'), 2), t = side(RIGHT, by('T'), 2);
  const r = side(edit && by('R').length === 2 ? { ...BOTTOM, two: BOTTOM_EDIT_TWO } : BOTTOM, by('R'), 3); // Figma 12/24: always at y 446
  // Figma's titles are one line; ours take two. With the outer Reframes seats (100 / 290, 446) in use, two lines would run
  // from the sides' lower seats (66 / 324, 358) into them, from them into the middle one, and from that one into the
  // Next-up card at y 660: those titles keep one line.
  if (r.placed.some(x => x.at[0] === 100)) for (const x of [s.placed[1], t.placed[1], ...r.placed]) if (x) x.oneLine = true;
  // Even on one line, the sides' lower seats' 12 px time line (Figma 10 px) ends 10 px into the outer Reframes' rings
  // (independent check 11/22, height-check "do not touch"): those two seats sit 14 higher then (66 / 324, 344)
  if (r.placed.some(x => x.at[0] === 100)) for (const x of [s.placed[1], t.placed[1]]) if (x && x.at[1] === 358) x.at = [x.at[0], 344];
  // A lone Reframe (195, 470) sits lowest: two lines would end 3 px under the bottom area's top on 12 (Figma: one line)
  if (r.placed.length === 1 && r.placed[0].at[1] === 470) r.placed[0].oneLine = true;
  const bundles = [['S', s], ['T', t], ['R', r]].filter(([, x]) => x.bundle).map(([angle, x]) => ({ angle, ...x.bundle }));
  return { nodes: [...s.placed, ...r.placed, ...t.placed], bundles, emptyT: arc.tension === 'none' ? RIGHT.one[0] : null };
}

/** The connector from the holo ring to just outside a node's core (Figma Lines: r 80 to r 30). */
export function connector([x, y], r = NODE_R) {
  const dx = x - BOX.cx, dy = y - BOX.cy, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  return { x1: BOX.cx + ux * BOX.orb, y1: BOX.cy + uy * BOX.orb, x2: x - ux * r, y2: y - uy * r, ux, uy };
}
