// Walking route between two areas of a venue. Runs on the phone: pure, synchronous, no I/O.
// venue: data/venue/<venue>.json (e.g. ccib.json). Distances there are already metres; nothing is converted here.
// from, to: area ids (e.g. 'P1-111'); data/venue/<edition>.json maps the feed's room keys to them.

// shortcut: speeds and vertical times are rule-of-thumb guesses, not measured at CCIB; replace with timed walks (V6, #7).
export const WALK_MPS = [1.3, 0.9]; // [brisk, crowded]: the low and high end of the time range
export const WHEELCHAIR_MPS = [0.9, 0.7];
export const ESCALATOR_S = [20, 40]; // per level, getting on included
export const ELEVATOR_WAIT_S = [30, 120]; // once per ride
export const ELEVATOR_LEVEL_S = 10; // per level ridden
export const LANDMARK_EVERY_M = 25; // name something you can see at least this often on a long straight
export const LANDMARK_GAP_M = 12; // but not closer than this to another stop

// [low, high] seconds for one edge
function seconds(edge, nodes, speeds) {
  return speeds.map((speed, i) => {
    if (edge.kind === 'elevator') return ELEVATOR_LEVEL_S;
    const walk = edge.m / speed;
    if (edge.kind === 'escalator') return ESCALATOR_S[i] + walk;
    // elevator nodes hang off the corridor by one stub, so a ride crosses exactly two stubs: half the wait on each
    const atElevator = nodes[edge.a].kind === 'elevator' || nodes[edge.b].kind === 'elevator';
    return walk + (atElevator ? ELEVATOR_WAIT_S[i] / 2 : 0);
  });
}

const cache = new WeakMap();
function prepared(venue) {
  if (!cache.has(venue)) {
    const adj = new Map(Object.keys(venue.nodes).map(n => [n, []]));
    for (const e of venue.edges) {
      adj.get(e.a).push({ to: e.b, e });
      adj.get(e.b).push({ to: e.a, e });
    }
    // door id -> name of the single room it opens (combinations like "113+114" reuse their parts' doors)
    const doorRoom = new Map();
    for (const a of Object.values(venue.areas)) for (const d of a.doors || []) if (!doorRoom.has(d) || !a.name.includes('+')) doorRoom.set(d, a.name);
    cache.set(venue, { adj, doorRoom });
  }
  return cache.get(venue);
}

function shortest(venue, starts, ends, allowed, speeds) {
  const { adj } = prepared(venue);
  // Dijkstra on the mean of the low and high times. ~200 nodes, so a linear scan instead of a heap; ties break by id.
  const cost = new Map(starts.map(n => [n, 0]));
  const back = new Map();
  const done = new Set();
  for (;;) {
    let n = null;
    for (const [k, c] of cost) if (!done.has(k) && (n === null || c < cost.get(n) || (c === cost.get(n) && k < n))) n = k;
    if (n === null) return null;
    if (ends.has(n)) {
      const path = [n], steps = [];
      for (let m = n; back.has(m); m = back.get(m).from) { steps.unshift(back.get(m)); path.unshift(back.get(m).from); }
      return { path, steps };
    }
    done.add(n);
    for (const { to: m, e } of adj.get(n)) {
      if (!allowed(e)) continue;
      const s = seconds(e, venue.nodes, speeds);
      const c = cost.get(n) + (s[0] + s[1]) / 2;
      if (!done.has(m) && (!cost.has(m) || c < cost.get(m))) { cost.set(m, c); back.set(m, { from: n, e, s }); }
    }
  }
}

// What you can see at a foyer point, best first: toilets and lifts are easier to spot than a room number.
const SEEN = { wc: 0, escalator: 1, elevator: 2, door: 3 };
function landmark(venue, node, skip) {
  const { doorRoom } = prepared(venue);
  const seen = (node.near || []).filter(id => !skip.has(id)).sort((a, b) => SEEN[venue.nodes[a].kind] - SEEN[venue.nodes[b].kind] || (a < b ? -1 : 1));
  if (!seen.length) return null;
  const k = venue.nodes[seen[0]].kind;
  return k === 'wc' ? 'WC' : k === 'escalator' ? 'Escalators' : k === 'elevator' ? 'Elevators' : doorRoom.get(seen[0]);
}

// One line for a route's stops: "111 → 112 → Escalator P1→P2 → 212 → 211"
export const stopsText = stops =>
  stops.map(s => (s.kind === 'elevator' || s.kind === 'escalator' ? `${s.kind[0].toUpperCase()}${s.kind.slice(1)} ${s.from}→${s.to}` : s.name)).join(' → ');

// Returns { from, to, wheelchair, metres, minutes: [low, high], levels, via, stops, path } or null when there is no route.
// Walking (default) takes escalators between levels and falls back to elevators only where nothing else connects
// (the plans mark no stairs). wheelchair: elevators only, at wheelchair speed.
// stops: what to look for, in order — { kind: 'room' | 'landmark', name, level, node } or { kind: 'elevator' | 'escalator', from, to, node }.
export function route(venue, from, to, { wheelchair = false } = {}) {
  const starts = venue.areas[from]?.doors;
  const ends = new Set(venue.areas[to]?.doors);
  if (!starts) throw new Error(`unknown or doorless area: ${from}`);
  if (!ends.size) throw new Error(`unknown or doorless area: ${to}`);
  const speeds = wheelchair ? WHEELCHAIR_MPS : WALK_MPS;
  const found = wheelchair
    ? shortest(venue, starts, ends, e => e.kind !== 'escalator', speeds)
    : shortest(venue, starts, ends, e => e.kind !== 'elevator', speeds) || shortest(venue, starts, ends, () => true, speeds);
  if (!found) return null;
  const { path, steps } = found;
  const N = venue.nodes;
  const level = n => N[n].level;

  const via = [];
  steps.forEach(({ e }, i) => {
    if (e.kind === 'walk') return;
    const last = via.at(-1);
    if (last && last.kind === e.kind && last.to === level(path[i])) last.to = level(path[i + 1]);
    else via.push({ kind: e.kind, from: level(path[i]), to: level(path[i + 1]) });
  });

  // landmarks: at every turn, and something on the way at least every LANDMARK_EVERY_M metres
  const { doorRoom } = prepared(venue);
  const skip = new Set([...starts, ...ends]);
  const stops = [{ kind: 'room', name: venue.areas[from].name, level: level(path[0]), node: path[0] }];
  let since = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const n = N[path[i]], e = steps[i - 1].e;
    since += e.kind === 'walk' ? e.m : 0;
    if (e.kind !== 'walk') {
      const last = stops.at(-1);
      if (last.kind === e.kind && last.to === level(path[i - 1])) last.to = n.level;
      else stops.push({ kind: e.kind, from: level(path[i - 1]), to: n.level, node: path[i - 1] });
      since = 0;
      continue;
    }
    const next = N[path[i + 1]];
    if (n.kind === 'door') { stops.push({ kind: 'room', name: doorRoom.get(path[i]), level: n.level, node: path[i] }); since = 0; continue; }
    if (n.kind !== 'corridor' || next.kind === 'elevator' || next.kind === 'escalator' || ends.has(path[i + 1])) continue;
    const prev = N[path[i - 1]];
    const [ax, ay, bx, by] = [n.x - prev.x, n.y - prev.y, next.x - n.x, next.y - n.y];
    const turn = prev.kind === 'corridor' && next.kind === 'corridor' && Math.abs(ax * by - ay * bx) > 0.5 * Math.hypot(ax, ay) * Math.hypot(bx, by);
    const name = landmark(venue, n, skip);
    if ((turn && (name || next.name)) || (name && since >= LANDMARK_EVERY_M)) {
      stops.push({ kind: 'landmark', name: name || next.name, level: n.level, node: path[i] });
      since = 0;
    }
  }
  stops.push({ kind: 'room', name: venue.areas[to].name, level: level(path.at(-1)), node: path.at(-1) });
  // a landmark right next to another stop adds nothing (and overlaps it on the map)
  const apart = (a, b) => N[a.node].level !== N[b.node].level || N[a.node].x == null || N[b.node].x == null ||
    Math.hypot(N[a.node].x - N[b.node].x, N[a.node].y - N[b.node].y) >= LANDMARK_GAP_M;
  for (let i = stops.length - 2; i > 0; i--) if (stops[i].kind === 'landmark' && !apart(stops[i], stops[i + 1])) stops.splice(i, 1);
  for (let i = 1; i < stops.length - 1; i++) if (stops[i].kind === 'landmark' && !apart(stops[i - 1], stops[i])) stops.splice(i--, 1);

  const sum = k => steps.reduce((t, s) => t + s.s[k], 0);
  return {
    from, to, wheelchair,
    metres: Math.round(steps.reduce((t, s) => t + s.e.m, 0)),
    minutes: [Math.max(1, Math.round(sum(0) / 60)), Math.max(1, Math.ceil(sum(1) / 60))],
    levels: path.map(level).filter((l, i, all) => i === 0 || l !== all[i - 1]),
    via,
    stops,
    path,
  };
}
