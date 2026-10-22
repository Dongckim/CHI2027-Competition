// Walking route between two areas of a venue. Runs on the phone: pure, synchronous, no I/O.
// venue: data/venue/<venue>.json (e.g. ccib.json). Distances there are already metres; nothing is converted here.
// from, to: area ids (e.g. 'P1-111'); data/venue/<edition>.json maps the feed's room keys to them.

// shortcut: speeds and vertical times are rule-of-thumb guesses, not measured at CCIB; replace with timed walks (V6, #7).
export const WALK_MPS = 1.3; // brisk walk: the low end of the time range
export const SLOW_MPS = 0.9; // crowds, wheelchair: the high end
export const ESCALATOR_S = [20, 40]; // per level, getting on included
export const ELEVATOR_WAIT_S = [30, 120]; // once per ride
export const ELEVATOR_LEVEL_S = 10; // per level ridden

// [low, high] seconds for one edge
function seconds(edge, nodes) {
  return [WALK_MPS, SLOW_MPS].map((speed, i) => {
    if (edge.kind === 'elevator') return ELEVATOR_LEVEL_S;
    const walk = edge.m / speed;
    if (edge.kind === 'escalator') return ESCALATOR_S[i] + walk;
    // elevator nodes hang off the corridor by one stub, so a ride crosses exactly two stubs: half the wait on each
    const atElevator = nodes[edge.a].kind === 'elevator' || nodes[edge.b].kind === 'elevator';
    return walk + (atElevator ? ELEVATOR_WAIT_S[i] / 2 : 0);
  });
}

const graphs = new WeakMap();
function graph(venue) {
  if (!graphs.has(venue)) {
    const adj = new Map(Object.keys(venue.nodes).map(n => [n, []]));
    for (const e of venue.edges) {
      const s = seconds(e, venue.nodes);
      adj.get(e.a).push({ to: e.b, e, s });
      adj.get(e.b).push({ to: e.a, e, s });
    }
    graphs.set(venue, adj);
  }
  return graphs.get(venue);
}

// door id -> name of the single room it opens (combinations like "113+114" reuse their parts' doors)
const doorNames = new WeakMap();
function doorAreas(venue) {
  if (!doorNames.has(venue)) {
    const map = new Map();
    for (const a of Object.values(venue.areas)) for (const d of a.doors || []) if (!map.has(d) || !a.name.includes('+')) map.set(d, a.name);
    doorNames.set(venue, map);
  }
  return doorNames.get(venue);
}

// One line for a route's stops: "111 → Foyer 1 → Escalator P1→P2 → Foyer B → 211"
export const stopsText = stops =>
  stops.map(s => (s.kind === 'elevator' || s.kind === 'escalator' ? `${s.kind[0].toUpperCase()}${s.kind.slice(1)} ${s.from}→${s.to}` : s.name)).join(' → ');

// Returns { from, to, stepFree, metres, minutes: [low, high], levels, via, stops, path } or null when there is no route.
// stops: landmarks in order — { kind: 'room' | 'foyer', name, level } or { kind: 'elevator' | 'escalator', from, to }.
// stepFree: no escalators (the venue data has no stairs, so elevators are the only other way between levels).
export function route(venue, from, to, { stepFree = false } = {}) {
  const starts = venue.areas[from]?.doors;
  const ends = new Set(venue.areas[to]?.doors);
  if (!starts) throw new Error(`unknown or doorless area: ${from}`);
  if (!ends.size) throw new Error(`unknown or doorless area: ${to}`);
  const adj = graph(venue);
  // Dijkstra on the mean of the low and high times. ~200 nodes, so a linear scan instead of a heap; ties break by id.
  const cost = new Map(starts.map(n => [n, 0]));
  const back = new Map();
  const done = new Set();
  let end = null;
  while (end === null) {
    let n = null;
    for (const [k, c] of cost) if (!done.has(k) && (n === null || c < cost.get(n) || (c === cost.get(n) && k < n))) n = k;
    if (n === null) return null;
    if (ends.has(n)) { end = n; break; }
    done.add(n);
    for (const { to: m, e, s } of adj.get(n)) {
      if (stepFree && e.kind === 'escalator') continue;
      const c = cost.get(n) + (s[0] + s[1]) / 2;
      if (!done.has(m) && (!cost.has(m) || c < cost.get(m))) { cost.set(m, c); back.set(m, { from: n, e, s }); }
    }
  }
  const path = [end];
  const steps = [];
  for (let n = end; back.has(n); n = back.get(n).from) { steps.unshift(back.get(n)); path.unshift(back.get(n).from); }

  const level = n => venue.nodes[n].level;
  const via = [];
  steps.forEach(({ e }, i) => {
    if (e.kind === 'walk') return;
    const [a, b] = [level(path[i]), level(path[i + 1])];
    const last = via.at(-1);
    if (last && last.kind === e.kind && last.to === a && last.step === i - 1) Object.assign(last, { to: b, step: i });
    else via.push({ kind: e.kind, from: a, to: b, step: i });
  });
  // landmarks in order, for "111 → Foyer 1 → Escalator P1→P2 → Foyer B → 211"
  const doorArea = doorAreas(venue);
  const stops = [{ kind: 'room', name: venue.areas[from].name, level: level(path[0]) }];
  const add = s => { const last = stops.at(-1); if (last.kind !== s.kind || last.name !== s.name) stops.push(s); };
  steps.forEach(({ e }, i) => {
    const m = path[i + 1], node = venue.nodes[m];
    if (e.kind !== 'walk') {
      const last = stops.at(-1);
      if (last.kind === e.kind && last.to === level(path[i])) last.to = node.level;
      else stops.push({ kind: e.kind, from: level(path[i]), to: node.level });
    } else if (node.kind === 'corridor') add({ kind: 'foyer', name: node.name, level: node.level });
    else if (node.kind === 'door' && i < steps.length - 1) add({ kind: 'room', name: doorArea.get(m), level: node.level });
  });
  add({ kind: 'room', name: venue.areas[to].name, level: level(end) });
  const sum = k => steps.reduce((t, s) => t + s.s[k], 0);
  return {
    from, to, stepFree,
    metres: Math.round(steps.reduce((t, s) => t + s.e.m, 0)),
    minutes: [Math.max(1, Math.round(sum(0) / 60)), Math.max(1, Math.ceil(sum(1) / 60))],
    levels: path.map(level).filter((l, i, all) => i === 0 || l !== all[i - 1]),
    via: via.map(({ step, ...v }) => v),
    stops,
    path,
  };
}
