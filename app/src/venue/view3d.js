// 09 Getting there: the venue in 3D, seen from above at the angle of the official floor plans, with the route.
// three.js lives only here, and 09 loads this file with import(), so the rest of the app never downloads it (the service
// worker leaves view3d-*.js out of its precache). The written steps are the directions; this view helps you match them
// to the building: it stops at each step, with a big arrow on the floor where you turn.
//
// venue: data/venue/<venue>.json (official plan, metres; x to the right, y down) · route: route() result
// steps: directions().lines ({ node, level, icon, dir }) — the same steps as the written list
// mount(canvas, { venue, route, summary, steps, onStep, reduceMotion }) → { show(i), mode(m), pad({ top, bottom }), dispose() }
//   show(i): stop at step i (−1: the whole venue) · mode: 'original' | 'fit' | 'floors' (only the route's levels)
// Drawn only from the plan: room blocks (low, as on the printed plans), corridors, room numbers at measured doors, and
// lifts, escalators and toilets at measured points. Nothing marked `estimate` in the plan file is drawn as a label.
import * as THREE from 'three';

const LEVELS = ['P0', 'M1', 'P1', 'M2', 'P2']; // bottom to top; AUD has no coordinates and is not drawn
const STOREY = 9; // metres between levels in the view (mezzanines included)
const ORIGINAL = { theta: Math.PI / 4, phi: 0.95 }; // the official P1 image: 117 → 111 runs to the front right
const BLOCK = 1.6; // room blocks, low like the printed plans (not wall heights: the plan has none)
const LINE = 0.9; // the route floats this high over the floor, under the room tops
const STEP_RADIUS = { wide: 85, tall: 110 }; // how close a step's stop is (by canvas shape): near enough to read numbers, wide enough to see where you are

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

/** @param {HTMLCanvasElement} canvas
 * @param {{ venue: any, route: any, summary: string, steps?: { node: string, level: string, icon?: string, dir?: { x: number, y: number } | null }[],
 *   onStep?: (i: number) => void, reduceMotion?: boolean }} options */
export function mount(canvas, { venue, route, summary, steps = [], onStep = () => {}, reduceMotion = false }) {
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `3D view. ${summary} The steps are listed above.`);

  // Areas to draw: a combination ("113+114") is drawn only if its parts are not (they are, on CCIB), except the
  // destination itself.
  const doorOwners = new Map();
  for (const a of Object.values(venue.areas)) for (const d of a.doors ?? []) doorOwners.set(d, (doorOwners.get(d) ?? 0) + 1);
  const dest = venue.areas[route.to];
  const drawn = Object.values(venue.areas).filter(a => a.rect && LEVELS.includes(a.level))
    .filter(a => a === dest || !a.name.includes('+') || !(a.doors ?? []).every(d => doorOwners.get(d) > 1));
  const xs = drawn.flatMap(a => [a.rect[0], a.rect[2]]), ys = drawn.flatMap(a => [a.rect[1], a.rect[3]]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...ys) + Math.max(...ys)) / 2;
  const height = level => Math.max(0, LEVELS.indexOf(level)) * STOREY;
  const at = (x, y, level, lift = 0) => new THREE.Vector3(x - cx, height(level) + lift, y - cz);
  const routeLevels = new Set(route.levels);
  const bounds = { x0: Math.min(...xs) - cx, x1: Math.max(...xs) - cx, z0: Math.min(...ys) - cz, z1: Math.max(...ys) - cz }; // a drag stays over the venue

  let renderer, scene, camera, groups, rides, raf = 0, needs = true, lost = false, frames = 0, onlyRouteFloors = false;
  let badges = [], signs = [], segs = [], chevrons = [], labels = [], startPin = null, destFrame = null, current = -1, layoutDirty = true;
  let pads = { top: 0, bottom: 0 };
  let held = null, lastShift = { dx: 0, dy: 0 };
  // Going from one step to the next: a dot runs along the route between them and the view follows it (not a cut).
  let travel = null, travelLevel = null, runner = null, routePts = [], stepK = []; // the picture's shift, kept while the plan is being dragged by hand (null: keep the step centred) // px of the canvas covered by the step card (top) and the bars (bottom)
  const cam = { theta: ORIGINAL.theta, phi: ORIGINAL.phi, radius: 260, target: new THREE.Vector3(0, height('P1'), 0) };
  let goal = null;
  const stepPoint = i => { const n = venue.nodes[steps[i]?.node]; return n?.x != null ? at(n.x, n.y, n.level) : null; };

  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(css('--plan-bg'));
    camera = new THREE.PerspectiveCamera(36, 1, 1, 3000);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.3); sun.position.set(40, 300, 60); scene.add(sun);

    // Levels the route uses are solid; the others faint and never in front of them (no depth write).
    const FAINT = 0.14;
    const faded = level => !routeLevels.has(level);
    const mat = (token, level, opacity = 1) => new THREE.MeshLambertMaterial({ color: css(token), transparent: faded(level) || opacity < 1,
      opacity: faded(level) ? FAINT : opacity, depthWrite: !faded(level) });
    groups = new Map(); labels = [];
    for (const level of LEVELS) {
      // Each level: its floor, rooms and corridors, its part of the route, and `detail` (room numbers, pictograms, ride
      // signs) shown only when a step stops on that level.
      const g = new THREE.Group(); g.userData.level = level; scene.add(g); groups.set(level, g);
      const detail = new THREE.Group(); g.add(detail); g.userData.detail = detail;
      const areas = drawn.filter(a => a.level === level);
      if (!areas.length) continue;
      const x0 = Math.min(...areas.map(a => a.rect[0])), x1 = Math.max(...areas.map(a => a.rect[2]));
      const y0 = Math.min(...areas.map(a => a.rect[1])), y1 = Math.max(...areas.map(a => a.rect[3]));
      const room = mat('--plan-room', level), plate = mat('--plan-floor', level); // opaque: the route (no depth test) draws over it in order
      const p = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 8, 0.4, y1 - y0 + 8), plate);
      p.position.copy(at((x0 + x1) / 2, (y0 + y1) / 2, level, -0.2)); p.renderOrder = LEVELS.indexOf(level) * 10; g.add(p);
      for (const a of areas) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(a.rect[2] - a.rect[0], BLOCK, a.rect[3] - a.rect[1]), room);
        box.position.copy(at((a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2, level, BLOCK / 2)); box.renderOrder = LEVELS.indexOf(level) * 10; g.add(box);
      }
      const corridor = new THREE.LineBasicMaterial({ color: css('--plan-line'), transparent: faded(level), opacity: faded(level) ? FAINT : 1, depthWrite: !faded(level) });
      for (const c of venue.corridors.filter(c => c.level === level)) {
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.points.map(([x, y]) => at(x, y, level, 0.2))), corridor); ln.renderOrder = LEVELS.indexOf(level) * 10; g.add(ln);
      }
      if (routeLevels.has(level)) { roomNumbers(detail, level); landmarks(detail, level); }
    }
    destinationFrame();
    routeAndArrows();
    resize();
    if (current >= 0) show(current, true); else apply('original', true);
  }

  // Room numbers where people see them: at the room's door, just inside the room, on the route's levels. Only rooms
  // with a measured door (no `estimate`), and not combinations.
  function roomNumbers(g, level) {
    for (const a of drawn.filter(x => x.level === level && !x.name.includes('+') && x.doors?.length)) {
      const door = venue.nodes[a.doors[0]];
      if (!door || door.estimate || door.x == null) continue;
      const mid = { x: (a.rect[0] + a.rect[2]) / 2, y: (a.rect[1] + a.rect[3]) / 2 };
      const d = Math.hypot(mid.x - door.x, mid.y - door.y) || 1, inset = Math.min(4, d * 0.5);
      const label = sprite(textCanvas(a.name, a === dest), a.name.length > 4 ? 9 : 6);
      label.position.copy(at(door.x + (mid.x - door.x) / d * inset, door.y + (mid.y - door.y) / d * inset, level, BLOCK + 1.6));
      label.material.opacity = 0; g.add(label); // layout() fades it in if there is room
      labels.push({ obj: label, kind: a === dest ? 'dest' : 'room', level, x: door.x, y: door.y });
    }
  }
  // Lifts, escalators and toilets: pictograms at their measured points.
  function landmarks(g, level) {
    for (const [id, n] of Object.entries(venue.nodes)) {
      if (n.level !== level || n.estimate || n.x == null || !['elevator', 'escalator', 'wc'].includes(n.kind)) continue;
      const s = sprite(iconCanvas(n.kind), 5);
      s.position.copy(at(n.x, n.y, level, BLOCK + 3)); s.material.opacity = 0; g.add(s);
      labels.push({ obj: s, kind: 'icon', id, level, x: n.x, y: n.y });
    }
  }
  function destinationFrame() {
    if (!dest?.rect) return;
    const [x0, y0, x1, y1] = dest.rect, w = 0.9, ink = new THREE.MeshBasicMaterial({ color: css('--plan-dest') });
    destFrame = new THREE.Group(); (groups.get(dest.level) ?? scene).add(destFrame);
    destFrame.userData.corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => at(x, y, dest.level, BLOCK + 0.4));
    const bar = (bx, by, sx, sy) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, BLOCK + 0.4, sy), ink); m.position.copy(at(bx, by, dest.level, (BLOCK + 0.4) / 2)); destFrame.add(m); };
    bar((x0 + x1) / 2, y0, x1 - x0 + w, w); bar((x0 + x1) / 2, y1, x1 - x0 + w, w);
    bar(x0, (y0 + y1) / 2, w, y1 - y0 + w); bar(x1, (y0 + y1) / 2, w, y1 - y0 + w);
  }

  // The route, drawn over its level's rooms (no depth test, drawn after that level's blocks and before the next level up,
  // so a higher level still covers it on the whole view). One line cut into the steps' stretches: on a step, the stretches
  // behind are grey, this step's is gold with a white edge, the rest dark. Small chevrons along it say which way; the
  // step you are on gets a big bent arrow at its corner instead (its chevrons hide). Numbers: the step you are on is a
  // big number lifted aside on a short stalk, the others small dots; on the whole view every step shows its number.
  function routeAndArrows() {
    const ink = new THREE.MeshBasicMaterial({ color: css('--plan-route') });
    const onLevel = (level, obj) => (groups.get(level) ?? scene).add(obj);
    const over = (level, k) => LEVELS.indexOf(level) * 10 + k; // draw order within a level: blocks 0, then these
    const nodes = route.path.map(id => venue.nodes[id]).filter(n => n.x != null);
    const ids = route.path.filter(id => venue.nodes[id]?.x != null);
    const pts = nodes.map(n => at(n.x, n.y, n.level, LINE));
    rides = new THREE.Group(); scene.add(rides);
    // Where each step's stretch starts on the path: its node (the first one after the previous step's). The arrival owns
    // the last few metres into the door.
    routePts = nodes.map(n => ({ p: at(n.x, n.y, n.level, LINE), level: n.level }));
    stepK = []; steps.forEach((st, i) => { const k = ids.indexOf(st.node, i ? Math.max(0, stepK[i - 1]) : 0); stepK.push(k); });
    runner = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), depthTest: false, sizeAttenuation: false }));
    runner.renderOrder = 125; runner.visible = false; scene.add(runner);
    const starts = [];
    steps.forEach((st, i) => { const from = i ? starts[i - 1] : 0; const k = ids.indexOf(st.node, from); starts.push(k < 0 ? from : k); });
    if (steps.at(-1)?.icon === 'arrive' && starts.length > 1) starts[starts.length - 1] = Math.max(starts.at(-2), ids.length - 2);
    if (starts.length) starts[0] = 0; // the way out of the start room belongs to step 1
    segs = steps.map((_, i) => {
      const k0 = starts[i], k1 = i + 1 < starts.length ? starts[i + 1] : ids.length - 1;
      const line = new THREE.MeshBasicMaterial({ color: css('--plan-route'), depthTest: false });
      const edge = new THREE.MeshBasicMaterial({ color: css('--plan-casing'), depthTest: false });
      const tubes = [], edges = [], dashes = [];
      let run = [nodes[k0]];
      const flush = () => {
        if (run.length < 2) return;
        const level = run[0].level;
        const curve = new THREE.CatmullRomCurve3(run.map(n => at(n.x, n.y, level, LINE)), false, 'catmullrom', 0.05);
        const t = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, run.length * 8), 0.55, 8, false), line);
        const e = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, run.length * 8), 1.0, 8, false), edge);
        t.renderOrder = over(level, 3); e.renderOrder = over(level, 2); e.visible = false;
        onLevel(level, e); onLevel(level, t); tubes.push(t); edges.push(e);
        // the same stretch as dashes, for when it is behind you: "walked" without relying on colour
        const len = curve.getLength();
        for (let d = 0; d < len - 0.5; d += 3.6) {
          const a = curve.getPointAt(d / len), b = curve.getPointAt(Math.min(len, d + 2.2) / len);
          const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, 0.55, 8, false), line);
          m.renderOrder = over(level, 3); m.visible = false; onLevel(level, m); dashes.push(m);
        }
      };
      for (let k = k0 + 1; k <= k1; k++) {
        const n = nodes[k];
        if (n.level === run.at(-1).level) { run.push(n); continue; }
        flush(); // a ride: straight between the two levels, only on the whole view
        const a = run.at(-1);
        rides.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(at(a.x, a.y, a.level, LINE), at(n.x, n.y, n.level, LINE)), 4, 0.55, 8, false), ink));
        run = [n];
      }
      flush();
      return { line, tubes, edges, dashes, k0, k1 };
    });
    // Chevrons every 9 m along each level's part of the route.
    const mark = new THREE.MeshBasicMaterial({ color: css('--plan-bg'), depthTest: false });
    const chevron = new THREE.Shape([new THREE.Vector2(-0.9, -0.6), new THREE.Vector2(0, 0.5), new THREE.Vector2(0.9, -0.6), new THREE.Vector2(0, -0.2)]);
    let worstDot = 1;
    chevrons = [];
    const pieces = [[nodes[0]]];
    for (const n of nodes.slice(1)) { if (n.level === pieces.at(-1).at(-1).level) pieces.at(-1).push(n); else pieces.push([n]); }
    for (const piece of pieces.filter(p => p.length > 1)) {
      const level = piece[0].level;
      const curve = new THREE.CatmullRomCurve3(piece.map(n => at(n.x, n.y, level, LINE)), false, 'catmullrom', 0.05);
      const len = curve.getLength();
      for (let d = 6; d < len - 4; d += 9) {
        const t = d / len, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
        const m = new THREE.Mesh(new THREE.ShapeGeometry(chevron), mark);
        // the chevron's tip is its +y; laid flat (x −90°) that is −z, so turning it by atan2(−x, −z) points it along tan
        m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(-tan.x, -tan.z); m.position.copy(p).add(new THREE.Vector3(0, 0.6, 0)); m.renderOrder = over(level, 4);
        worstDot = Math.min(worstDot, new THREE.Vector3(0, 1, 0).applyEuler(m.rotation).dot(tan));
        // which step's stretch it is on: the nearest path node on this level
        let best = 0, bd = Infinity;
        nodes.forEach((q, k) => { if (q.level !== level) return; const dd = Math.hypot(q.x - (p.x + cx), q.y - (p.z + cz)); if (dd < bd) { bd = dd; best = k; } });
        const seg = Math.max(0, segs.findIndex(sg => best >= sg.k0 && best < sg.k1));
        onLevel(level, m); chevrons.push({ m, x: p.x + cx, y: p.z + cz, level, seg });
      }
    }
    canvas.dataset.chevronDot = worstDot.toFixed(2); // for the phone check: every mark points the way you walk (> 0)
    // The start: a pin on a ring, as in the prototype, so it reads as "you start here" and not as a hole in the floor.
    const s0 = nodes[0], pinInk = new THREE.MeshBasicMaterial({ color: css('--plan-route'), depthTest: false });
    const start = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 40), new THREE.MeshBasicMaterial({ color: css('--plan-route'), side: THREE.DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = LINE + 0.3;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 12), pinInk); stem.position.y = 3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), pinInk); head.position.y = 6.8;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10), new THREE.MeshBasicMaterial({ color: css('--plan-bg'), depthTest: false })); dot.position.y = 6.8;
    ring.renderOrder = stem.renderOrder = over(s0.level, 5); head.renderOrder = over(s0.level, 6); dot.renderOrder = over(s0.level, 7);
    start.add(ring, stem, head, dot); start.position.copy(at(s0.x, s0.y, s0.level)); onLevel(s0.level, start);
    // the pin's outline on screen (ring and head), for declutter()
    start.userData.corners = [[-3.2, 0, 0], [3.2, 0, 0], [0, 0, -3.2], [0, 0, 3.2], [-1.6, 8.4, 0], [1.6, 8.4, 0]].map(([x, y, z]) => start.position.clone().add(new THREE.Vector3(x, y, z)));
    startPin = start;
    // A bent arrow on the floor at each step, like a road sign: from the way you come (inDir) to the way you go (dir).
    // At the arrival it bends from the corridor into the door. Only the step you are on shows its arrow.
    const gold = new THREE.MeshBasicMaterial({ color: css('--plan-dest'), depthTest: false, side: THREE.DoubleSide });
    const leadTex = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g = c.getContext('2d'); g.fillStyle = css('--plan-route'); g.fillRect(0, 0, 8, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    signs = [];
    let worstGap = 0;
    badges = steps.map((st, i) => {
      const n = venue.nodes[st.node];
      const spot = n?.x != null ? at(n.x, n.y, n.level, LINE) : pts[0];
      let arrow = null, aside = { x: 0, y: 0 }; // plan direction the big number leans to, away from the arrow (a ride: straight up)
      if (n?.x != null && st.dir) {
        const c = { x: n.x, y: n.y }, out = st.dir, inn = st.inDir;
        // arrival: the corner is in the corridor, a few metres before the door
        const corner = st.icon === 'arrive' ? { x: c.x - out.x * 5, y: c.y - out.y * 5 } : c;
        const from = inn ? { x: corner.x - inn.x * 9, y: corner.y - inn.y * 9 } : { x: corner.x - out.x * 4, y: corner.y - out.y * 4 };
        const tip = st.icon === 'arrive' ? { x: c.x + out.x * 1.5, y: c.y + out.y * 1.5 } : { x: corner.x + out.x * 11, y: corner.y + out.y * 11 };
        const m = new THREE.Mesh(new THREE.ShapeGeometry(bentArrow([from, corner, tip], 1.3, 4.2, 3.4)), gold);
        m.rotation.x = -Math.PI / 2; m.position.y = height(n.level) + LINE + 0.7; m.renderOrder = over(n.level, 5); m.visible = false; onLevel(n.level, m);
        arrow = { m, points: [from, corner, tip], level: n.level };
        // outside the bend (from the way in, away from the way out); straight on: to the side
        const o = inn ? { x: inn.x - out.x, y: inn.y - out.y } : { x: -out.y, y: out.x };
        const ol = Math.hypot(o.x, o.y);
        aside = ol > 0.3 ? { x: o.x / ol, y: o.y / ol } : { x: -out.y, y: out.x };
      }
      // A ride: a sign at the lift or escalator, "↑ To P1", on the level you leave (only that level shows on this step).
      // Screen-sized like the number, just right of the lifted number (layout() places both).
      let sign = null;
      if (n?.x != null && (st.icon === 'up' || st.icon === 'down')) {
        const t = new THREE.CanvasTexture(rideCanvas(st.icon === 'up', st.level)); t.colorSpace = THREE.SRGBColorSpace; // a ride's level is where it arrives
        sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false }));
        sign.renderOrder = 115; sign.position.copy(spot); sign.userData.size = SIGN; groups.get(n.level)?.userData.detail.add(sign); signs.push(sign);
      }
      // Starting off the plan (the Auditorium): the step's spot is where the way comes out onto it. Say so there.
      if (n?.x != null && st.outHere) {
        const c = outCanvas('You come out here'), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false }));
        sign.renderOrder = 115; sign.position.copy(spot); sign.userData.size = [Math.round(c.width * 32 / c.height), 32]; sign.userData.kind = 'out';
        groups.get(n.level)?.userData.detail.add(sign); signs.push(sign);
      }
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(i + 1, 'number'), depthTest: false, sizeAttenuation: false }));
      b.position.copy(spot); onLevel(n?.level, b);
      // the big number's stalk: a screen-sized bar from the spot (layout() turns it and sets its length in pixels)
      const lead = new THREE.Sprite(new THREE.SpriteMaterial({ map: leadTex, depthTest: false, sizeAttenuation: false }));
      lead.center.set(0.5, 0); lead.position.copy(spot); lead.renderOrder = 105; lead.visible = false; onLevel(n?.level, lead);
      b.userData = { spot, aside, lead, sign, arrow, level: n?.level, state: 'number', noPlan: n?.x == null }; // noPlan: no spot to mark
      if (n?.x != null) worstGap = Math.max(worstGap, Math.hypot(spot.x - (n.x - cx), spot.z - (n.y - cz)));
      return b;
    });
    // labels next to the route rank above the others
    for (const l of labels) {
      let m = Infinity;
      for (let k = 1; k < nodes.length; k++) if (nodes[k].level === l.level && nodes[k - 1].level === l.level) m = Math.min(m, near(l, [nodes[k - 1], nodes[k], nodes[k]]));
      l.nearRoute = m < 12;
    }
    canvas.dataset.badgeGap = worstGap.toFixed(1); // for the phone check: metres from each number's foot to where you act (< 2)
    canvas.dataset.steps = String(badges.length); // for the phone check
    sizeBadges();
  }

  // A flat arrow along plan points [from, corner, tip]: a band of half-width w, ending in a head (length headL, half-width
  // headW). Shape coordinates are the view's x and −z: turned a quarter about x, the mesh lies flat on the floor.
  function bentArrow(points, w, headL, headW) {
    const P = points.map(p => ({ x: p.x - cx, y: -(p.y - cz) }));
    const [a, c, t] = P;
    const u2 = { x: t.x - c.x, y: t.y - c.y }, l2 = Math.hypot(u2.x, u2.y) || 1, d2 = { x: u2.x / l2, y: u2.y / l2 };
    const base = { x: t.x - d2.x * headL, y: t.y - d2.y * headL };
    const u1 = { x: c.x - a.x, y: c.y - a.y }, l1 = Math.hypot(u1.x, u1.y) || 1, d1 = { x: u1.x / l1, y: u1.y / l1 };
    const n1 = { x: -d1.y, y: d1.x }, n2 = { x: -d2.y, y: d2.x };
    // the corner: where the two band edges meet (miter), or a straight join when both legs point the same way
    const miter = side => {
      const p1 = { x: c.x + n1.x * w * side, y: c.y + n1.y * w * side }, p2 = { x: c.x + n2.x * w * side, y: c.y + n2.y * w * side };
      const den = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(den) < 1e-3) return p1;
      const k = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
      return { x: p1.x + d1.x * k, y: p1.y + d1.y * k };
    };
    const L = side => [{ x: a.x + n1.x * w * side, y: a.y + n1.y * w * side }, miter(side), { x: base.x + n2.x * w * side, y: base.y + n2.y * w * side }];
    const left = L(1), right = L(-1);
    const outline = [...left, { x: base.x + n2.x * headW, y: base.y + n2.y * headW }, t, { x: base.x - n2.x * headW, y: base.y - n2.y * headW }, ...right.reverse()];
    return new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, p.y)));
  }

  function rideCanvas(up, toLevel) {
    const c = document.createElement('canvas'); c.width = 240; c.height = 110;
    const g = c.getContext('2d');
    g.fillStyle = css('--plan-dest'); roundRect(g, 0, 0, 240, 110, 22); g.fill();
    g.fillStyle = css('--plan-route'); g.strokeStyle = css('--plan-route'); g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(55, up ? 88 : 22); g.lineTo(55, up ? 22 : 88); g.stroke(); // the arrow
    g.beginPath(); g.moveTo(30, up ? 48 : 62); g.lineTo(55, up ? 20 : 90); g.lineTo(80, up ? 48 : 62); g.stroke();
    g.font = '700 46px "IBM Plex Sans", system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(`To ${toLevel ?? ''}`.trim(), 100, 58);
    return c;
  }

  // Canvas-drawn labels: crisp at any size, coloured from the tokens.
  function outCanvas(text) {
    const c = document.createElement('canvas'), g = c.getContext('2d'), font = '600 48px "IBM Plex Sans", system-ui, sans-serif';
    g.font = font; c.width = Math.ceil(g.measureText(text).width) + 48; c.height = 96;
    g.fillStyle = css('--plan-route'); roundRect(g, 0, 0, c.width, c.height, 22); g.fill();
    g.fillStyle = css('--plan-bg'); g.font = font; g.textBaseline = 'middle'; g.fillText(text, 24, 50);
    return c;
  }
  function textCanvas(text, strong) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = '600 56px "IBM Plex Sans", system-ui, sans-serif';
    c.width = Math.ceil(g.measureText(text).width) + 36; c.height = 84;
    g.fillStyle = css(strong ? '--plan-dest' : '--plan-bg'); roundRect(g, 0, 0, c.width, c.height, 18); g.fill();
    g.fillStyle = css('--plan-route'); g.font = '600 56px "IBM Plex Sans", system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(text, 18, 44);
    return c;
  }
  function iconCanvas(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d'), fg = css('--plan-route');
    g.fillStyle = css('--plan-bg'); roundRect(g, 4, 4, 88, 88, 18); g.fill();
    g.strokeStyle = fg; g.fillStyle = fg; g.lineWidth = 6; g.lineJoin = 'round'; g.lineCap = 'round';
    if (kind === 'wc') { g.font = '700 40px "IBM Plex Sans", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WC', 48, 50); }
    else if (kind === 'elevator') {
      g.strokeRect(22, 18, 52, 60);
      g.beginPath(); g.moveTo(36, 42); g.lineTo(48, 28); g.lineTo(60, 42); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(36, 54); g.lineTo(48, 68); g.lineTo(60, 54); g.closePath(); g.fill();
    } else { // escalator: a step line rising to the right
      g.beginPath(); g.moveTo(16, 74); g.lineTo(34, 74); g.lineTo(62, 30); g.lineTo(80, 30); g.stroke();
      g.beginPath(); g.moveTo(16, 60); g.lineTo(32, 60); g.lineTo(58, 20); g.stroke();
    }
    return c;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  // world-size sprites (they shrink with distance, like the printed numbers)
  function sprite(c, worldWidth) {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
    s.scale.set(worldWidth, worldWidth * c.height / c.width, 1); s.renderOrder = 100;
    return s;
  }
  // state: 'on' (the step you are on: gold, number) · 'number' (whole view) · 'done' / 'next' (small dots, grey / dark)
  function dotTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = css('--plan-dest'); g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = css('--plan-casing'); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function badgeTexture(n, state) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    const fill = { on: '--plan-dest', number: '--plan-route', done: '--plan-passed', next: '--plan-route' }[state];
    g.fillStyle = css(fill); g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill();
    g.lineWidth = state === 'done' || state === 'next' ? 12 : 6; g.strokeStyle = css('--plan-bg'); g.stroke();
    if (state === 'on' || state === 'number') {
      g.fillStyle = css(state === 'on' ? '--plan-route' : '--plan-bg'); g.font = '600 52px "IBM Plex Sans", system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 48, 51);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const near = (p, [a, c, t]) => Math.min(...[[a, c], [c, t]].map(([u, v]) => {
    const dx = v.x - u.x, dy = v.y - u.y, k = Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - u.x - dx * k, p.y - u.y - dy * k);
  }));
  function highlight() {
    badges.forEach((b, j) => {
      const state = current < 0 ? 'number' : j === current ? 'on' : j < current ? 'done' : 'next';
      if (b.userData.state !== state) { b.material.map?.dispose(); b.material.map = badgeTexture(j + 1, state); b.material.needsUpdate = true; b.userData.state = state; }
      const on = state === 'on';
      if (!on) b.center.set(0.5, 0.5);
      b.userData.lead.visible = on;
      if (b.userData.arrow) b.userData.arrow.m.visible = on;
    });
    segs.forEach((sg, j) => {
      const passed = current >= 0 && j < current;
      sg.line.color.set(css(!passed && (current < 0 || j > current) ? '--plan-route' : j === current ? '--plan-dest' : '--plan-passed'));
      sg.edges.forEach(e => { e.visible = j === current; });
      sg.tubes.forEach(t => { t.visible = !passed; }); sg.dashes.forEach(d => { d.visible = passed; });
      sg.tubes.forEach(t => { t.renderOrder = t.renderOrder - (t.renderOrder % 10) + (j === current ? 3.5 : 3); });
    });
    const arrow = badges[current]?.userData.arrow;
    // chevrons: not behind you (the dashes are), not under this step's big arrow
    for (const c of chevrons) c.m.visible = !(current >= 0 && c.seg < current) && !(arrow && c.level === arrow.level && near(c, arrow.points) < 4);
    sizeBadges(); needs = true;
  }
  // Screen-sized things, in CSS pixels: a sprite without size attenuation is `scale` × (canvas height / 2 / tan(fov/2)) px.
  const PX = { on: 46, number: 34, done: 18, next: 18 }, LEAD = 36, SIGN = [116, 53];
  const px = n => n * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (canvas.clientHeight || 300);
  function sizeBadges() {
    badges.forEach(b => {
      const st = b.userData.state, s = px(PX[st]);
      b.scale.set(s, s, 1); b.renderOrder = st === 'on' ? 120 : 110;
      b.userData.lead.scale.set(px(3), px(LEAD), 1);
    });
    signs.forEach(s => { const [w, h] = s.userData.size; s.scale.set(px(w), px(h), 1); });
    if (runner) runner.scale.set(px(20), px(20), 1);
    layoutDirty = true;
  }

  // Where things go on screen, worked out again only when the view changes (camera, step, size). The step you are on:
  // its number stands LEAD px from the spot, outside the bend (a ride: straight up), with the "To P1" sign to its right.
  function layout() {
    layoutDirty = false;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H || !camera) return;
    camera.updateMatrixWorld();
    camera.clearViewOffset(); // work it out unshifted, then slide the picture into the free area
    const screen = v => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }; };
    declutter(W, H, screen);
  }
  const outline = (points, screen) => { const q = points.map(screen), xs = q.map(p => p.x), ys = q.map(p => p.y); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const hit = (a, b) => a[0] < b[2] + 2 && b[0] < a[2] + 2 && a[1] < b[3] + 2 && b[1] < a[3] + 2;
  // The number (and sign) as screen boxes, if it stands off the spot s in screen direction d.
  function boxes(s, d, u) {
    const size = PX.on, off = LEAD + size / 2, c = { x: s.x + d.x * off, y: s.y + d.y * off };
    const r = [[c.x - size / 2, c.y - size / 2, c.x + size / 2, c.y + size / 2]];
    if (u.sign) { const [w, h] = u.sign.userData.size; r.push([c.x + size / 2 + 8, c.y - h / 2, c.x + size / 2 + 8 + w, c.y + h / 2]); }
    return r;
  }
  // Outside the bend first (a ride: up); if that covers something that outranks it, the next free direction round.
  // Returns the screen box around the spot, the number and the sign (unshifted).
  function place(b, screen, must, rather, room) {
    const u = b.userData, s = screen(u.spot);
    let d0 = { x: 0, y: -1 }; // screen direction, y down: up
    if (u.aside.x || u.aside.y) {
      const a = screen(u.spot.clone().add(new THREE.Vector3(u.aside.x * 5, 0, u.aside.y * 5)));
      const l = Math.hypot(a.x - s.x, a.y - s.y);
      if (l > 1) d0 = { x: (a.x - s.x) / l, y: (a.y - s.y) / l };
    }
    const turns = [0, 1, -1, 2, -2, 3, -3, 4].map(k => k * Math.PI / 4);
    const dirs = turns.map(t => ({ x: d0.x * Math.cos(t) - d0.y * Math.sin(t), y: d0.x * Math.sin(t) + d0.y * Math.cos(t) }));
    const free = avoid => q => !boxes(s, q, u).some(r => avoid.some(a => hit(a, r)));
    const around = q => { const r = [[s.x - 6, s.y - 6, s.x + 6, s.y + 6], ...boxes(s, q, u)]; return [Math.min(...r.map(a => a[0])), Math.min(...r.map(a => a[1])), Math.max(...r.map(a => a[2])), Math.max(...r.map(a => a[3]))]; };
    const fits = q => { const a = around(q); return a[2] - a[0] <= room[0] && a[3] - a[1] <= room[1]; };
    const both = (f, g) => q => f(q) && g(q);
    const d = dirs.find(both(free([...must, ...rather]), fits)) ?? dirs.find(both(free(must), fits)) ?? dirs.find(free(must)) ?? d0;
    const size = PX.on, off = LEAD + size / 2;
    b.center.set(0.5 - d.x * off / size, 0.5 + d.y * off / size); // a sprite's centre is in its own units, y up
    u.lead.material.rotation = Math.atan2(-d.x, -d.y);
    if (u.sign) { const [w, h] = u.sign.userData.size, ox = d.x * off + size / 2 + 8 + w / 2, oy = d.y * off; u.sign.center.set(0.5 - ox / w, 0.5 + oy / h); }
    return around(d);
  }
  // Labels by rank, in screen space: the step you are on (number, sign) → the destination → the other steps' dots →
  // the lift or escalator this step takes → room numbers by the route → other pictograms → other room numbers. One that
  // would overlap a label already placed is hidden. On a step, only labels within 25 m of it (and the ride it takes).
  const STEP_LABELS_M = 25;
  function declutter(W, H, screen) {
    const f = H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); // px per metre at 1 m from the camera
    const rect = (o, wpx, hpx) => {
      const p = o.position.clone().applyMatrix4(o.parent.matrixWorld), v = p.clone().applyMatrix4(camera.matrixWorldInverse);
      if (v.z >= -camera.near) return null;
      const q = p.project(camera), x = (q.x + 1) / 2 * W, y = (1 - q.y) / 2 * H;
      const x0 = x - o.center.x * wpx, y1 = y + o.center.y * hpx; // centre in the sprite's units, y up
      const r = [x0, y1 - hpx, x0 + wpx, y1];
      return r[2] < 0 || r[0] > W || r[3] < 0 || r[1] > H ? null : r;
    };
    const world = o => { const v = o.position.clone().applyMatrix4(o.parent.matrixWorld).applyMatrix4(camera.matrixWorldInverse); const k = f / Math.max(1, -v.z); return [o.scale.x * k, o.scale.y * k]; };
    const shown = o => { for (let q = o.parent; q; q = q.parent) if (!q.visible) return false; return true; };
    const st = steps[current], sn = st ? venue.nodes[st.node] : null;
    // the lift or escalator this step takes, or the one it starts from (just off it): on the route, by the step's spot
    const rides = new Set(sn ? route.path.filter(id => { const q = venue.nodes[id];
      return (q?.kind === 'escalator' || q?.kind === 'elevator') && q.level === sn.level && Math.hypot(q.x - sn.x, q.y - sn.y) < 8; }) : []);
    // This step's number goes first, clear of what outranks it (the start pin on step 1) and, where it can, of the lift
    // or escalator it is about.
    const must = [], rather = [];
    if (current <= 0 && startPin && shown(startPin)) must.push(outline(startPin.userData.corners, screen));
    for (const l of labels) if (l.kind === 'icon' && rides.has(l.id) && shown(l.obj)) { const r = rect(l.obj, ...world(l.obj)); if (r) rather.push(r); }
    // The free area: between the card on top and the bars below. The step (its spot, number and sign) is slid into its
    // middle (a 2D shift of the picture, so nothing else about the view changes); the whole view is centred in it.
    const safe = [8, pads.top + 8, W - 8, H - pads.bottom - 8];
    const placedStep = badges[current] && !badges[current].userData.noPlan ? place(badges[current], screen, must, rather, [safe[2] - safe[0], safe[3] - safe[1]]) : null;
    let dx = 0, dy = (safe[1] + safe[3]) / 2 - H / 2;
    if (placedStep) { const [x0, y0, x1, y1] = placedStep; dx = (safe[0] + safe[2]) / 2 - (x0 + x1) / 2; dy = (safe[1] + safe[3]) / 2 - (y0 + y1) / 2; }
    if (travel) { // ease from where the picture was, through "the dot in the middle", to the new step framed
      const mid = { dx: 0, dy: (safe[1] + safe[3]) / 2 - H / 2 }, u = travel.e;
      const a = u < 0.25 ? travel.shift : mid, b = u < 0.25 ? mid : u > 0.75 ? { dx, dy } : mid, k = u < 0.25 ? u / 0.25 : u > 0.75 ? (u - 0.75) / 0.25 : 0;
      dx = a.dx + (b.dx - a.dx) * k; dy = a.dy + (b.dy - a.dy) * k;
    }
    if (held) ({ dx, dy } = held); else lastShift = { dx, dy }; // dragged by hand: the plan stays where the finger put it
    camera.setViewOffset(W, H, -dx, -dy, W, H);
    // for the phone check: the step's spot and number lie inside the free area
    canvas.dataset.inArea = placedStep ? String(placedStep[0] + dx >= safe[0] - 0.5 && placedStep[2] + dx <= safe[2] + 0.5 && placedStep[1] + dy >= safe[1] - 0.5 && placedStep[3] + dy <= safe[3] + 0.5) : '';
    canvas.dataset.area = safe.map(Math.round).join(' ');
    const items = [];
    if (startPin) {
      const vis = shown(startPin);
      if (vis) items.push({ o: startPin, rank: current <= 0 ? -1 : 1.5, r: outline(startPin.userData.corners, screen), keep: current <= 0 });
      else startPin.userData.to = 0;
    }
    if (destFrame && shown(destFrame)) items.push({ o: destFrame, rank: 1, r: outline(destFrame.userData.corners, screen), keep: true, frame: true });
    badges.forEach((b, j) => {
      const u = b.userData, on = j === current, size = PX[u.state];
      if (u.sign) u.sign.userData.to = 0; // only the step you are on shows its ride sign
      if (!shown(b) || u.noPlan) { u.to = 0; return; }
      items.push({ o: b, rank: on ? 0 : 2, r: rect(b, size, size), keep: on });
      if (on && u.sign) items.push({ o: u.sign, rank: 0, r: rect(u.sign, ...u.sign.userData.size), keep: true });
    });
    for (const l of labels) {
      if (!shown(l.obj)) { l.obj.userData.to = 0; continue; }
      const used = l.kind === 'icon' && rides.has(l.id);
      if (sn && !used && Math.hypot(l.x - sn.x, l.y - sn.y) > STEP_LABELS_M) { l.obj.userData.to = 0; continue; }
      const rank = l.kind === 'dest' ? 1 : used ? 3 : l.kind === 'room' && l.nearRoute ? 4 : l.kind === 'icon' ? 5 : 6;
      const [w, h] = world(l.obj);
      items.push({ o: l.obj, rank, r: rect(l.obj, w, h), dest: l.kind === 'dest' });
    }
    items.sort((a, b) => a.rank - b.rank);
    // The destination's frame is a room-sized outline: what outranks it may sit on it, its own number sits inside it,
    // and only the labels after it give way to it.
    const clash = (p, it) => !(p.frame && it.dest) && !(it.frame && p.rank <= it.rank) && !(p.frame && it.rank <= p.rank) && hit(p.r, it.r);
    const placed = [];
    for (const it of items) {
      const under = it.r && !it.frame && (it.r[1] < pads.top || it.r[3] > H - pads.bottom); // behind the card or the bars
      const ok = it.keep || (it.r && !under && !placed.some(p => clash(p, it)));
      it.o.userData.to = ok ? 1 : 0;
      if (ok && it.r) placed.push(it);
    }
    // for the phone check: overlapping pairs among the labels left showing, and whether this step's number is one of them
    let overlaps = 0;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) if (clash(placed[i], placed[j])) overlaps++;
    canvas.dataset.overlaps = String(overlaps);
    canvas.dataset.labels = String(placed.length);
    canvas.dataset.currentShown = current < 0 ? '' : String(badges[current]?.userData.to === 1);
    const sg = badges[current]?.userData.sign; canvas.dataset.sign = sg && sg.userData.to === 1 ? sg.userData.kind ?? 'ride' : ''; // for the phone check
    needs = true;
  }
  // Labels fade in and out over 150 ms (at once with reduced motion). True while something is still fading.
  function fade(dt) {
    let busy = false;
    const step = o => {
      const to = o.userData.to ?? 1, now = o.material.opacity;
      const next = reduceMotion ? to : now + Math.max(-dt / 0.15, Math.min(dt / 0.15, to - now));
      if (next !== now) { o.material.opacity = next; busy = true; }
      o.visible = next > 0.01;
    };
    for (const l of labels) step(l.obj);
    for (const s of signs) step(s);
    if (startPin) { // a group: fade its parts together
      const to = startPin.userData.to ?? 1, parts = startPin.children, now = parts[0].material.opacity;
      const next = reduceMotion ? to : now + Math.max(-dt / 0.15, Math.min(dt / 0.15, to - now));
      if (next !== now) { for (const m of parts) { m.material.transparent = true; m.material.opacity = next; } busy = true; }
      startPin.visible = next > 0.01;
    }
    badges.forEach((b, j) => { step(b); const lead = b.userData.lead; lead.visible = j === current && b.visible; lead.material.opacity = b.material.opacity; });
    return busy;
  }

  function placeCamera() {
    const { theta, phi, radius, target } = cam;
    camera.position.set(target.x + radius * Math.sin(phi) * Math.sin(theta), target.y + radius * Math.cos(phi), target.z + radius * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
    canvas.dataset.view = `${theta.toFixed(3)},${phi.toFixed(3)}`; // for the phone check
    canvas.dataset.target = `${target.x.toFixed(1)},${target.z.toFixed(1)}`;
    needs = true; layoutDirty = true;
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !renderer) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix(); sizeBadges(); needs = true;
  }
  // Glide to a view, or jump there with reduced motion.
  function moveTo(w, now) {
    if (reduceMotion || now) { Object.assign(cam, { ...w, target: w.target.clone() }); goal = null; placeCamera(); } else goal = { ...w, target: w.target.clone() };
  }
  function frame(points) {
    const box = new THREE.Box3().setFromPoints(points), size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, size.y * 1.6, 40);
    return { target: box.getCenter(new THREE.Vector3()), radius: span * (camera.aspect < 1 ? 2.1 : 1.5) };
  }
  // What shows: on a step, only that step's level, with its room numbers, pictograms and ride sign; on the whole view
  // every level (or only the route's, with Floors), the rides between them, and no labels (they would pile up).
  function layers() {
    const stepLevel = travelLevel ?? (current >= 0 ? venue.nodes[steps[current]?.node]?.level : null);
    for (const [level, g] of groups) {
      g.visible = stepLevel ? level === stepLevel : !onlyRouteFloors || routeLevels.has(level);
      g.userData.detail.visible = !!stepLevel;
    }
    if (rides) rides.visible = !stepLevel;
    canvas.dataset.levels = [...groups].filter(([, g]) => g.visible).map(([l]) => l).join(' '); // for the phone check
    needs = true; layoutDirty = true;
  }
  function apply(m, now = false) {
    if (m === 'floors') onlyRouteFloors = !onlyRouteFloors;
    if (m !== 'floors') { held = null; if (travel) endTravel(false); } // Whole and Route: back to the framed view
    if (m === 'original' || m === 'fit') { if (current !== -1) { current = -1; onStep(-1); } highlight(); }
    layers();
    if (m === 'original') {
      const all = drawn.flatMap(a => [at(a.rect[0], a.rect[1], a.level), at(a.rect[2], a.rect[3], a.level)]);
      moveTo({ ...ORIGINAL, ...frame(all) }, now);
    } else if (m === 'fit') {
      const pts = route.path.map(id => venue.nodes[id]).filter(n => n.x != null).map(n => at(n.x, n.y, n.level));
      moveTo({ ...ORIGINAL, ...frame(pts) }, now);
    }
    needs = true;
    return onlyRouteFloors;
  }
  // Stop at step i: the same angle as the plans, close enough to read the room numbers around it.
  function show(i, now = false) {
    if (i < 0 || i >= steps.length) { apply('original', now); onStep(-1); return; }
    const previous = current;
    held = null; current = i; highlight(); if (!travel) layers(); onStep(i);
    const p = stepPoint(i) ?? cam.target;
    if (steps[i].icon === 'arrive' && steps[i].dir) p.add(new THREE.Vector3(-steps[i].dir.x * 4, 0, -steps[i].dir.y * 4)); // the bend before the door
    const radius = camera.aspect < 1 ? STEP_RADIUS.tall : STEP_RADIUS.wide;
    // Look a little the way you go; the step sits in the middle, between the card on top and the view bar below.
    const ahead = steps[i].dir ? new THREE.Vector3(steps[i].dir.x * 6, 0, steps[i].dir.y * 6) : new THREE.Vector3();
    const far = new THREE.Vector3(-Math.sin(ORIGINAL.theta), 0, -Math.cos(ORIGINAL.theta)).multiplyScalar(radius * 0.04);
    const final = { ...ORIGINAL, target: p.clone().add(ahead).add(far), radius };
    const from = travel ? travel.to : previous, a = stepK[from], b = stepK[i];
    if (!reduceMotion && !now && from >= 0 && from !== i && a >= 0 && b >= 0 && routePts.length > 1) {
      const pts = (a < b ? routePts.slice(a, b + 1) : routePts.slice(b, a + 1).reverse());
      const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].p.distanceTo(pts[k - 1].p));
      const total = cum.at(-1);
      if (total > 1) {
        goal = null;
        travel = { pts, cum, total, t: 0, dur: Math.min(2.6, Math.max(0.9, total / 45)), e: 0, to: i, final, shift: { ...lastShift },
          start: { theta: cam.theta, phi: cam.phi, radius: cam.radius }, startOff: cam.target.clone().sub(pts[0].p), endOff: final.target.clone().sub(pts.at(-1).p) };
        return;
      }
    }
    travel = null; travelLevel = null; if (runner) runner.visible = false;
    moveTo(final, now);
  }
  // One frame of the run between two steps: the dot's place on the route (eased), the view following it.
  function runTravel(dt) {
    const tr = travel; tr.t += dt;
    const u = Math.min(1, tr.t / tr.dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; tr.e = e;
    const d = e * tr.total; let k = 1; while (k < tr.cum.length - 1 && tr.cum[k] < d) k++;
    const seg = tr.cum[k] - tr.cum[k - 1] || 1, f = Math.min(1, Math.max(0, (d - tr.cum[k - 1]) / seg));
    const pos = tr.pts[k - 1].p.clone().lerp(tr.pts[k].p, f);
    const level = f < 0.5 ? tr.pts[k - 1].level : tr.pts[k].level; // a ride: the floor switches halfway up
    if (level !== travelLevel) { travelLevel = level; layers(); }
    runner.position.copy(pos); runner.visible = true;
    cam.target.copy(pos).add(tr.startOff.clone().lerp(tr.endOff, e));
    cam.theta = tr.start.theta + (tr.final.theta - tr.start.theta) * e; cam.phi = tr.start.phi + (tr.final.phi - tr.start.phi) * e;
    cam.radius = tr.start.radius + (tr.final.radius - tr.start.radius) * e;
    canvas.dataset.travel = '1'; // for the phone check
    if (u >= 1) endTravel(true); else placeCamera();
  }
  function endTravel(land) {
    if (land) Object.assign(cam, { theta: travel.final.theta, phi: travel.final.phi, radius: travel.final.radius, target: travel.final.target.clone() });
    travel = null; travelLevel = null; runner.visible = false; canvas.dataset.travel = '';
    layers(); placeCamera();
  }

  // Touch, as in map apps. One finger: drag the plan (it slides under the finger). Two fingers: twist to turn the view,
  // move both up or down to tilt it, spread or pinch to zoom. (Wheel: zoom.) After a drag the step stays where it was
  // put; Next, a step in the list, Whole or Route frame it again, at the plans' angle.
  const pointers = new Map(); let pinch = null, drag = null;
  const twoFingers = () => { const [a, b] = [...pointers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), y: (a.y + b.y) / 2 }; };
  const startDrag = p => { drag = { x: p.x, y: p.y, target: cam.target.clone(), moving: false }; };
  const down = e => {
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ } pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (travel) endTravel(false); // a finger on the plan stops the run where it is
    if (pointers.size === 1) startDrag(pointers.get(e.pointerId));
    if (pointers.size === 2) { drag = null; goal = null; pinch = { ...twoFingers(), r: cam.radius, theta: cam.theta, phi: cam.phi }; }
  };
  // Metres on the floor per screen pixel at the target: across the screen, and up it (foreshortened by the tilt).
  const slide = (dxPx, dyPx, from) => {
    const mpp = 2 * cam.radius * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (canvas.clientHeight || 300);
    const right = new THREE.Vector3(Math.cos(cam.theta), 0, -Math.sin(cam.theta)), away = new THREE.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta));
    const t = from.clone().addScaledVector(right, -dxPx * mpp).addScaledVector(away, dyPx * mpp / Math.max(0.3, Math.cos(cam.phi)));
    t.x = Math.min(bounds.x1, Math.max(bounds.x0, t.x)); t.z = Math.min(bounds.z1, Math.max(bounds.z0, t.z)); // not off the venue
    return t;
  };
  const move = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1 && drag) {
      const p = pointers.get(e.pointerId), dx = p.x - drag.x, dy = p.y - drag.y;
      if (!drag.moving && Math.hypot(dx, dy) < 4) return; // a tap is not a drag
      if (!drag.moving) { drag.moving = true; goal = null; held = { ...lastShift }; }
      cam.target.copy(slide(dx, dy, drag.target)); placeCamera();
      return;
    }
    if (pointers.size !== 2 || !pinch) return;
    const now = twoFingers();
    cam.radius = clampR(pinch.r * pinch.d / Math.max(1, now.d));
    // Screen y points down, so a clockwise twist raises the angle; the camera then orbits the same way and the plan turns
    // with the fingers.
    let da = now.angle - pinch.angle; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    cam.theta = pinch.theta + da;
    cam.phi = Math.min(1.35, Math.max(0.25, pinch.phi + (pinch.y - now.y) * 0.006)); // both fingers up: tilt toward the horizon
    placeCamera();
  };
  const up = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    // one finger left of two: it drags from where it is now
    drag = null; if (pointers.size === 1) startDrag([...pointers.values()][0]);
  };
  const wheel = e => { e.preventDefault(); goal = null; cam.radius = clampR(cam.radius * (1 + Math.sign(e.deltaY) * 0.09)); placeCamera(); };
  const clampR = r => Math.min(900, Math.max(30, r));
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });

  let t0 = performance.now();
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (lost || document.hidden) return;
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    if (travel) runTravel(dt);
    else if (goal) {
      const k = 1 - Math.pow(0.002, dt);
      cam.theta += (goal.theta - cam.theta) * k; cam.phi += (goal.phi - cam.phi) * k; cam.radius += (goal.radius - cam.radius) * k;
      cam.target.lerp(goal.target, k);
      // Close enough: land exactly on the view asked for (so Whole and the steps are the plans' angle, not near it).
      if (Math.abs(goal.radius - cam.radius) < 0.3 && cam.target.distanceTo(goal.target) < 0.2 && Math.abs(goal.theta - cam.theta) < 0.003 && Math.abs(goal.phi - cam.phi) < 0.003) {
        Object.assign(cam, { theta: goal.theta, phi: goal.phi, radius: goal.radius, target: goal.target.clone() }); goal = null;
      }
      placeCamera();
    }
    if (layoutDirty) layout();
    if (fade(dt)) needs = true;
    if (needs) { renderer.render(scene, camera); needs = false; canvas.dataset.frames = String(++frames); } // frames: for the phone check
  }

  // Another app (or a locked phone) can take the GPU away: keep the page, rebuild the scene when it comes back.
  const contextLost = e => { e.preventDefault(); lost = true; };
  const contextRestored = () => { teardown(false); lost = false; build(); };
  const visible = () => { needs = true; }; // the loop skips hidden pages; draw once more when the page is back
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  document.addEventListener('visibilitychange', visible);
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  // Light ↔ dark while 09 is open: same view, new colours.
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const recolour = () => { const keep = { ...cam, target: cam.target.clone() }; teardown(false); build(); Object.assign(cam, keep); placeCamera(); };
  scheme.addEventListener?.('change', recolour);

  function teardown(loseContext) {
    scene?.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose?.(); o.material?.dispose?.(); });
    renderer?.dispose();
    if (loseContext) renderer?.forceContextLoss();
  }

  build();
  raf = requestAnimationFrame(loop);
  return {
    show: i => show(i),
    /** @param {{ top: number, bottom: number }} p px of the canvas covered on top and at the bottom */
    pad(p) { if (p.top !== pads.top || p.bottom !== pads.bottom) { pads = { top: p.top, bottom: p.bottom }; layoutDirty = true; needs = true; } },
    mode: m => apply(m),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      document.removeEventListener('visibilitychange', visible); scheme.removeEventListener?.('change', recolour);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('wheel', wheel);
      teardown(true);
    },
  };
}
