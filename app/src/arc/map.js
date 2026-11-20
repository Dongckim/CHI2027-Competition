// 12 map rules (Figma 597:711, 601:1198/1311/1442): where each node sits and which state it shows. Pure, so tests check
// the layout. Coordinates are Figma's map box (390 × 530, centre 195,240); the screen scales the box.

/** @typedef {'next'|'upcoming'|'heard'|'ended'} NodeState */

export const BOX = { w: 390, h: 530, cx: 195, cy: 240, orb: 72 }; // orb = question orb radius (144/2)
const NODE_R = 32; // node orb radius (64/2)

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
const BOTTOM = { one: [[195, 470]], two: [[138, 446], [252, 446]], three: [[100, 446], [195, 474], [290, 446]], bundle: null };

function side(seats, nodes, max) {
  if (nodes.length <= max) return { placed: nodes.map((n, i) => ({ node: n, at: (nodes.length === 1 ? seats.one : nodes.length === 2 ? seats.two : seats.three)[i] })), bundle: null };
  // Sides keep two and put the bundle between them (Figma 24). At the bottom there is no room between: one talk, then the bundle.
  const keep = seats.bundle ? 2 : 1;
  // (a little lower than the seat, clear of the Challenges side's lower label)
  return { placed: nodes.slice(0, keep).map((n, i) => ({ node: n, at: seats.two[i] })), bundle: { at: seats.bundle ?? [seats.two[1][0], seats.two[1][1] + 16], count: nodes.length - keep } };
}

/**
 * Where nodes go. Up to 2 per side for Supports and Challenges and up to 3 at the bottom for Reframes; beyond that the
 * first two stay and the rest become one "+N" bundle (24). Order within an angle is the Arc's (best first).
 * pending (25): angles are not known yet, so every node sits evenly round the ring in one neutral style.
 * @returns {{ nodes: { node: object, at: [number, number] }[], bundles: { angle: string, at: [number, number], count: number }[], emptyT: [number, number] | null }}
 */
export function layout(arc) {
  if (arc.tension === 'pending') { // Figma's 5 seats; the rest wait in one bundle above the question
    const shown = arc.nodes.slice(0, PENDING.length);
    const rest = arc.nodes.length - shown.length;
    return { nodes: shown.map((node, i) => ({ node, at: PENDING[i] })), bundles: rest > 0 ? [{ angle: null, at: [195, 52], count: rest }] : [], emptyT: null };
  }
  const by = a => arc.nodes.filter(n => n.angle === a);
  const s = side(LEFT, by('S'), 2), t = side(RIGHT, by('T'), 2);
  // Three at the bottom only when neither side uses its lower seat (they would overlap its label), else two + bundle
  const crowdedSides = s.placed.length >= 2 || t.placed.length >= 2;
  const r = side(BOTTOM, by('R'), crowdedSides ? 2 : 3);
  if (crowdedSides) { // the sides' lower labels reach the bottom row: move it down a node's half
    for (const x of r.placed) x.at = [x.at[0], x.at[1] + 32];
    if (r.bundle) r.bundle.at = [r.bundle.at[0], r.bundle.at[1] + 32];
  }
  const bundles = [['S', s], ['T', t], ['R', r]].filter(([, x]) => x.bundle).map(([angle, x]) => ({ angle, ...x.bundle }));
  return { nodes: [...s.placed, ...r.placed, ...t.placed], bundles, emptyT: arc.tension === 'none' ? RIGHT.one[0] : null };
}

/** The connector from the question orb's edge to a node's edge. */
export function connector([x, y], r = NODE_R) {
  const dx = x - BOX.cx, dy = y - BOX.cy, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  return { x1: BOX.cx + ux * BOX.orb, y1: BOX.cy + uy * BOX.orb, x2: x - ux * r, y2: y - uy * r, ux, uy };
}
