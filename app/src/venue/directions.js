// Turn-by-turn lines for a route (09 Getting there) and the turn cues for "Hear the turns". Pure: node and phone.
// venue: data/venue/<venue>.json (official plan, metres; x to the right, y down), labels: data/venue/<venue>.labels.json
// (names people see, kept by hand), r: route(venue, from, to, options) from route.js.
// Lines are short, one per decision, as in Figma v3 09: "Exit right into Foyer 1, pass Room 114", "Elevator 2 up to P1",
// "Room 121 on your left". Nothing here names a CCIB place: every name comes from the two data files.

const LEVEL_ORDER = ['P0', 'M1', 'P1', 'M2', 'P2']; // stacked levels, bottom to top (AUD stands apart, no coordinates)
const STRAIGHT = 0.7; // cos 45°: a smaller change of direction is "straight on"
const CORNER_M = 15; // a turn this close before a new corridor is one corner, said once

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
  const start = fromName ?? placeName(venue.areas[r.from].name), end = toName ?? placeName(venue.areas[r.to].name);

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
      lines.push({ kind: g.type, text: `${what.trim()} ${up ? 'up' : 'down'} to ${b.level}`, node: a.id, level: b.level });
      cues.push({ kind: g.type, up, angle: 0, text: `${what.trim()} ${up ? 'up' : 'down'} to ${b.level}` });
      facing = null; // out of a lift or off an escalator the plan does not say which way you face
      return;
    }
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
    const firstLeg = gi === 0, lastLeg = gi === legs.length - 1;
    const startsAtDoor = firstLeg && nodes[0].kind === 'door';
    const pass = run => { const name = run.nodes.slice(1, -1).map(n => stopAt.get(n.id)).find(Boolean); return name ? `, pass ${placeName(name)}` : ''; };
    corr.forEach((run, i) => {
      const label = corridorLabel(run.key);
      let text;
      if (i === 0) {
        if (startsAtDoor) {
          const out = unit(nodes[0], run.a); // leaving the room you face the corridor
          const w = turnWord(out, run.dir);
          text = w === 'straight' ? `Exit straight on into ${label}` : `Exit ${w} into ${label}`;
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
          prev.turn = null;
          facing = run.dir;
          return;
        }
        text = w === 'straight' ? `Keep straight on${into}` : `Turn ${w}${into}`;
        cues.push({ kind: 'walk', angle: signedAngle(corr[i - 1].dir, run.dir), text: w === 'straight' ? 'Straight ahead' : `Turn ${w}` });
        lines.push({ kind: 'walk', text: text + pass(run), node: run.a.id, level: run.a.level, turn: !into && w !== 'straight' ? w : null, turnLength: Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y) });
        facing = run.dir;
        return;
      }
      lines.push({ kind: 'walk', text: text + pass(run), node: run.a.id, level: run.a.level });
      facing = run.dir;
    });
    if (lastLeg) {
      const lastRun = corr.at(-1), door = nodes.at(-1), before = nodes.at(-2);
      if (lastRun && before) {
        const side = sideWord(lastRun.dir, unit(before, door));
        lines.push({ kind: 'arrive', text: `${end} on your ${side}`, node: door.id, level: door.level });
        cues.push({ kind: 'arrive', angle: signedAngle(lastRun.dir, unit(before, door)), text: `Arrive · on your ${side}` });
      } else {
        lines.push({ kind: 'arrive', text: `${end} is right there`, node: door.id, level: door.level });
        cues.push({ kind: 'arrive', angle: 0, text: 'Arrive' });
      }
    }
  });
  const summary = `Route from ${start} to ${end}, about ${r.minutes[0]}–${r.minutes[1]} min, ${r.metres} m${r.levels.length > 1 ? `, ${r.levels.join(' to ')}` : `, ${r.levels[0]}`}${r.wheelchair ? ', step-free' : ''}.`;
  return { lines: lines.map(({ kind, text, node, level }) => ({ kind, text, node, level })), cues, summary, from: start, to: end };
}

/** What the sound says for a turn angle (radians, + right). */
export function cueWord(angle) {
  const d = Math.abs(angle * 180 / Math.PI);
  if (d < 30) return 'Straight ahead';
  if (d > 150) return 'Turn around';
  if (d > 110) return `Behind you, ${angle > 0 ? 'right' : 'left'}`;
  return `Turn ${angle > 0 ? 'right' : 'left'}`;
}
