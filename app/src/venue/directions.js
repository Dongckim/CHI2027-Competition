// Turn-by-turn lines for a route (09 Getting there) and the turn cues for "Hear the turns". Pure: node and phone.
// venue: data/venue/<venue>.json (official plan, metres; x to the right, y down), labels: data/venue/<venue>.labels.json
// (names people see, kept by hand), r: route(venue, from, to, options) from route.js.
// Lines are short, one per decision, as in Figma v3 09: "Exit right into Foyer 1, pass Room 114", "Elevator 2 up to P1",
// "Room 121 on your left". Nothing here names a CCIB place: every name comes from the two data files.

const LEVEL_ORDER = ['P0', 'M1', 'P1', 'M2', 'P2']; // stacked levels, bottom to top (AUD stands apart, no coordinates)
const STRAIGHT = 0.7; // cos 45°: a smaller change of direction is "straight on"
const CORNER_M = 15; // a turn this close before a new corridor is one corner, said once
const placed = n => n.x != null && n.y != null; // the plan has coordinates for it (the Auditorium and its walkway do not)
const aboutMetres = m => `about ${Math.max(10, Math.round(m / 10) * 10)} m`;

const unit = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d }; };
// With y pointing down (as on the plan), a positive cross product is a clockwise turn: to the right.
const cross = (u, v) => u.x * v.y - u.y * v.x;
const dot = (u, v) => u.x * v.x + u.y * v.y;
export const turnWord = (u, v) => (dot(u, v) > STRAIGHT ? 'straight' : cross(u, v) > 0 ? 'right' : 'left');
export const sideWord = (u, v) => (cross(u, v) > 0 ? 'right' : 'left');
/** Signed angle from u to v, radians, + to the right (for the sound's direction). */
export const signedAngle = (u, v) => Math.atan2(cross(u, v), dot(u, v));

const levelRank = l => LEVEL_ORDER.indexOf(l);
// "127" → "Room 127", "M215+M216" → "Room M215+M216"; named spaces ("Entrance Hall", "Areas 1+2+3") stay as they are.
export const placeName = name => (/^[A-Z]?\d/.test(name) ? `Room ${name}` : name);

export function directions(venue, labels, r, { fromName, toName } = {}) {
  const N = venue.nodes;
  const P = r.path.map(id => ({ id, ...N[id] }));
  const corridorLabel = name => labels.corridors?.[name] ?? name;
  const placeLabel = name => labels.places?.[name] ?? name; // "the Auditorium" after "to"
  const start = fromName ?? placeName(venue.areas[r.from].name), end = toName ?? placeName(venue.areas[r.to].name);
  const doorArea = new Map();
  for (const a of Object.values(venue.areas)) for (const d of a.doors ?? []) if (!doorArea.has(d)) doorArea.set(d, placeName(a.name));
  // what a node without coordinates is part of, for the 3D view's "No floor plan for …"
  const where = n => (n.id === P.at(-1).id ? end : doorArea.get(n.id) ?? n.name ?? end);

  // Legs: walking on one level, or one ride (elevator or escalator, several levels merged: P0 → M1 → P1 is one ride).
  const legs = [];
  r.edges.forEach((e, i) => {
    const type = e.kind === 'walk' ? 'walk' : e.kind;
    const last = legs.at(-1);
    if (last && last.type === type) last.to = i + 1;
    else legs.push({ type, from: i, to: i + 1 });
  });
  // What to pass on a walk: the landmarks route() picked (rooms, WC, escalators), by the node they sit at.
  const stopAt = new Map(r.stops.filter(s => s.kind === 'room' || s.kind === 'landmark').map(s => [s.node, s.name]));

  const lines = [], cues = [];
  let facing = null; // the way you face, for the sound: out of a door you face the corridor
  legs.forEach((g, gi) => {
    const nodes = P.slice(g.from, g.to + 1);
    if (g.type !== 'walk') {
      const a = nodes[0], b = nodes.at(-1), up = levelRank(b.level) > levelRank(a.level);
      const n = a.id.match(/elevator(\d+)/)?.[1];
      const what = g.type === 'elevator' ? (labels.elevator ?? 'Elevator {n}').replace('{n}', n ?? '') : (labels.escalator ?? 'Escalator');
      lines.push({ kind: g.type, text: `${what.trim()} ${up ? 'up' : 'down'} to ${b.level}`, node: a.id, level: b.level, icon: up ? 'up' : 'down' });
      cues.push({ kind: g.type, up, angle: 0, text: `${what.trim()} ${up ? 'up' : 'down'} to ${b.level}` });
      facing = null; // out of a lift or off an escalator the plan does not say which way you face
      return;
    }
    // A walk crosses the plan (coordinates: turn by turn) and maybe a way the plan only lists by name and length (no
    // coordinates: one line, no left or right). Split it there.
    const pieces = [];
    nodes.forEach((n, k) => { const last = pieces.at(-1); if (last && last.placed === placed(n)) last.to = k; else pieces.push({ placed: placed(n), from: k, to: k }); });
    pieces.forEach((pc, pi) => {
      const firstPiece = gi === 0 && pi === 0, lastPiece = gi === legs.length - 1 && pi === pieces.length - 1;
      if (pc.placed) { if (pc.to > pc.from) onThePlan(nodes.slice(pc.from, pc.to + 1), firstPiece, lastPiece); return; }
      // Off the plan: the edges into, along and out of it, without the last metres to or from a door it has no place for.
      const e0 = g.from + Math.max(0, pc.from - 1), e1 = g.from + Math.min(nodes.length - 1, pc.to + 1);
      let m = 0;
      for (let e = e0; e < e1; e++) if (![P[e], P[e + 1]].some(q => !placed(q) && q.kind === 'door')) m += r.edges[e].m;
      const off = nodes.slice(pc.from, pc.to + 1), way = off.find(q => q.kind === 'corridor' && q.name);
      const next = nodes[pc.to + 1], enter = pc.from > 0 ? nodes[pc.from - 1] : off[0];
      const to = !next ? placeLabel(end) : next.kind === 'door' ? placeLabel(doorArea.get(next.id) ?? end) : corridorLabel(next.name ?? '');
      const text = way ? `Take ${corridorLabel(way.name)} to ${to} · ${aboutMetres(m)}` : `Walk on to ${to} · ${aboutMetres(m)}`;
      lines.push({ kind: 'take', text, node: enter.id, level: enter.level, icon: 'straight' });
      cues.push({ kind: 'walk', angle: 0, text: way ? `Take ${corridorLabel(way.name)}` : 'Walk on' });
      facing = null; // the plan does not say which way you face at the other end
      if (lastPiece) {
        const door = nodes.at(-1);
        lines.push({ kind: 'arrive', text: `${end} entrance`, node: door.id, level: door.level, icon: 'arrive' });
        cues.push({ kind: 'arrive', angle: 0, text: 'Arrive' });
      }
    });
  });

  // One stretch on the plan: turn by turn.
  function onThePlan(nodes, firstPiece, lastPiece) {
    // Runs along one corridor (door stubs are their own run); a bend of more than 45° inside a corridor also counts.
    const runs = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const key = a.kind === 'corridor' && b.kind === 'corridor' ? a.name : 'stub';
      const dir = unit(a, b), last = runs.at(-1);
      if (last && last.key === key && key !== 'stub' && dot(last.dir, dir) > STRAIGHT) { last.b = b; last.nodes.push(b); }
      else runs.push({ key, a, b, dir, nodes: [a, b] });
    }
    const corr = runs.filter(x => x.key !== 'stub' && Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y) > 0.5);
    const startsAtDoor = firstPiece && nodes[0].kind === 'door';
    const pass = run => { const name = run.nodes.slice(1, -1).map(n => stopAt.get(n.id)).find(Boolean); return name ? `, pass ${placeName(name)}` : ''; };
    corr.forEach((run, i) => {
      const label = corridorLabel(run.key);
      let text, icon = 'straight', inDir = null;
      if (i === 0) {
        if (startsAtDoor) {
          const out = unit(nodes[0], run.a); // leaving the room you face the corridor
          const w = turnWord(out, run.dir);
          text = w === 'straight' ? `Exit straight on into ${label}` : `Exit ${w} into ${label}`;
          icon = w; inDir = out;
          cues.push({ kind: 'walk', angle: signedAngle(out, run.dir), text: w === 'straight' ? 'Straight ahead' : `Turn ${w}` });
        } else {
          text = `Walk along ${label}`;
          cues.push({ kind: 'walk', angle: facing ? signedAngle(facing, run.dir) : 0, text: 'Straight ahead' });
        }
      } else {
        const w = turnWord(corr[i - 1].dir, run.dir);
        const into = run.key !== corr[i - 1].key ? ` into ${label}` : '';
        // A corner: the turn happens a few metres before the next corridor starts, straight on. One line: "Turn left into …".
        const prev = lines.at(-1);
        if (w === 'straight' && into && prev?.turn && prev.turnLength < CORNER_M) {
          prev.text = `Turn ${prev.turn}${into}${pass(run)}`;
          prev.dir = run.dir; // the floor arrow points into the new corridor
          prev.turn = null;
          facing = run.dir;
          return;
        }
        text = w === 'straight' ? `Keep straight on${into}` : `Turn ${w}${into}`;
        cues.push({ kind: 'walk', angle: signedAngle(corr[i - 1].dir, run.dir), text: w === 'straight' ? 'Straight ahead' : `Turn ${w}` });
        lines.push({ kind: 'walk', text: text + pass(run), node: run.a.id, level: run.a.level, icon: w, dir: run.dir, inDir: corr[i - 1].dir, turn: !into && w !== 'straight' ? w : null, turnLength: Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y) });
        facing = run.dir;
        return;
      }
      lines.push({ kind: 'walk', text: text + pass(run), node: run.a.id, level: run.a.level, icon, dir: run.dir, inDir });
      facing = run.dir;
    });
    if (lastPiece) {
      const lastRun = corr.at(-1), door = nodes.at(-1), before = nodes.at(-2);
      if (lastRun && before) {
        const side = sideWord(lastRun.dir, unit(before, door));
        lines.push({ kind: 'arrive', text: `${end} on your ${side}`, card: `${end} · on your ${side}`, node: door.id, level: door.level, icon: 'arrive', dir: unit(before, door), inDir: lastRun.dir });
        cues.push({ kind: 'arrive', angle: signedAngle(lastRun.dir, unit(before, door)), text: `Arrive · on your ${side}` });
      } else {
        lines.push({ kind: 'arrive', text: `${end} is right there`, card: `${end} · right there`, node: door.id, level: door.level, icon: 'arrive' });
        cues.push({ kind: 'arrive', angle: 0, text: 'Arrive' });
      }
    }
  }
  const summary = `Route from ${start} to ${end}, about ${r.minutes[0]}–${r.minutes[1]} min, ${r.metres} m${r.levels.length > 1 ? `, ${r.levels.join(' to ')}` : `, ${r.levels[0]}`}${r.wheelchair ? ', step-free' : ''}.`;
  // icon: right | left | straight | up | down | arrive (the step card) · dir: plan direction to walk after this step, inDir:
  // the direction you come from (the floor arrow bends from inDir to dir; arrival: from the corridor into the door)
  // card: the card's line where it differs from the list (arrival: "Room 127 · on your right").
  // The card is one line: what to do, without the "pass …" landmark (the list keeps it).
  // noPlan: the place's name when the plan has no coordinates for this step's spot (09 says "No floor plan for …").
  return { lines: lines.map(({ kind, text, node, level, icon, dir, inDir, card }) => ({ kind, text, card: card ?? text.replace(/, pass .*$/, ''), node, level, icon, dir: dir ?? null, inDir: inDir ?? null,
    noPlan: N[node] && !placed(N[node]) ? where({ id: node, ...N[node] }) : null })), cues, summary, from: start, to: end };
}

/** What the sound says for a turn angle (radians, + right). */
export function cueWord(angle) {
  const d = Math.abs(angle * 180 / Math.PI);
  if (d < 30) return 'Straight ahead';
  if (d > 150) return 'Turn around';
  if (d > 110) return `Behind you, ${angle > 0 ? 'right' : 'left'}`;
  return `Turn ${angle > 0 ? 'right' : 'left'}`;
}
