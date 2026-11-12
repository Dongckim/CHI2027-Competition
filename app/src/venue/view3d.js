// 09 Getting there: the venue in 3D, seen from above at the angle of the official floor plans, with the route.
// three.js lives only here, and 09 loads this file with import(), so the rest of the app never downloads it (the service
// worker leaves view3d-*.js out of its precache). The written steps are the directions; this view helps you match them
// to the building: it stops at each step, with a big arrow on the floor where you turn.
//
// venue: data/venue/<venue>.json (official plan, metres; x to the right, y down) · route: route() result
// steps: directions().lines ({ node, level, icon, dir }) — the same steps as the written list
// mount(canvas, { venue, route, summary, steps, onStep, onSwipe, reduceMotion }) → { show(i), mode(m), dispose() }
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
 *   onStep?: (i: number) => void, onSwipe?: (d: number) => void, reduceMotion?: boolean }} options */
export function mount(canvas, { venue, route, summary, steps = [], onStep = () => {}, onSwipe = () => {}, reduceMotion = false }) {
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

  let renderer, scene, camera, groups, rides, raf = 0, needs = true, lost = false, frames = 0, onlyRouteFloors = false;
  let badges = [], current = -1;
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
    groups = new Map();
    for (const level of LEVELS) {
      // Each level: its floor, rooms and corridors, its part of the route, and `detail` (room numbers, pictograms, ride
      // signs) shown only when a step stops on that level.
      const g = new THREE.Group(); g.userData.level = level; scene.add(g); groups.set(level, g);
      const detail = new THREE.Group(); g.add(detail); g.userData.detail = detail;
      const areas = drawn.filter(a => a.level === level);
      if (!areas.length) continue;
      const x0 = Math.min(...areas.map(a => a.rect[0])), x1 = Math.max(...areas.map(a => a.rect[2]));
      const y0 = Math.min(...areas.map(a => a.rect[1])), y1 = Math.max(...areas.map(a => a.rect[3]));
      const room = mat('--plan-room', level), plate = mat('--plan-floor', level, 0.85);
      const p = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 8, 0.4, y1 - y0 + 8), plate);
      p.position.copy(at((x0 + x1) / 2, (y0 + y1) / 2, level, -0.2)); g.add(p);
      for (const a of areas) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(a.rect[2] - a.rect[0], BLOCK, a.rect[3] - a.rect[1]), room);
        box.position.copy(at((a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2, level, BLOCK / 2)); g.add(box);
      }
      const corridor = new THREE.LineBasicMaterial({ color: css('--plan-line'), transparent: faded(level), opacity: faded(level) ? FAINT : 1, depthWrite: !faded(level) });
      for (const c of venue.corridors.filter(c => c.level === level)) {
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.points.map(([x, y]) => at(x, y, level, 0.2))), corridor));
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
      g.add(label);
    }
  }
  // Lifts, escalators and toilets: pictograms at their measured points.
  function landmarks(g, level) {
    for (const n of Object.values(venue.nodes)) {
      if (n.level !== level || n.estimate || n.x == null || !['elevator', 'escalator', 'wc'].includes(n.kind)) continue;
      const s = sprite(iconCanvas(n.kind), 5);
      s.position.copy(at(n.x, n.y, level, BLOCK + 3)); g.add(s);
    }
  }
  function destinationFrame() {
    if (!dest?.rect) return;
    const [x0, y0, x1, y1] = dest.rect, w = 0.9, ink = new THREE.MeshBasicMaterial({ color: css('--plan-dest') });
    const bar = (bx, by, sx, sy) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, BLOCK + 0.4, sy), ink); m.position.copy(at(bx, by, dest.level, (BLOCK + 0.4) / 2)); (groups.get(dest.level) ?? scene).add(m); };
    bar((x0 + x1) / 2, y0, x1 - x0 + w, w); bar((x0 + x1) / 2, y1, x1 - x0 + w, w);
    bar(x0, (y0 + y1) / 2, w, y1 - y0 + w); bar(x1, (y0 + y1) / 2, w, y1 - y0 + w);
  }

  // The route on the floor, per level (a ride between levels is its own straight piece, shown only on the whole view),
  // small direction marks along it, a big arrow where each step turns, numbers for the steps.
  function routeAndArrows() {
    const ink = new THREE.MeshBasicMaterial({ color: css('--plan-route') });
    const onLevel = (level, obj) => (groups.get(level) ?? scene).add(obj);
    const nodes = route.path.map(id => venue.nodes[id]).filter(n => n.x != null);
    const pts = nodes.map(n => at(n.x, n.y, n.level, LINE));
    rides = new THREE.Group(); scene.add(rides);
    const pieces = [[nodes[0]]];
    for (const n of nodes.slice(1)) {
      const last = pieces.at(-1);
      if (n.level === last.at(-1).level) last.push(n);
      else { // a ride: straight between the two levels
        const a = last.at(-1);
        rides.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(at(a.x, a.y, a.level, LINE), at(n.x, n.y, n.level, LINE)), 4, 0.55, 8, false), ink));
        pieces.push([n]);
      }
    }
    const mark = new THREE.MeshBasicMaterial({ color: css('--plan-bg'), depthTest: false });
    const chevron = new THREE.Shape([new THREE.Vector2(-0.9, -0.6), new THREE.Vector2(0, 0.5), new THREE.Vector2(0.9, -0.6), new THREE.Vector2(0, -0.2)]);
    for (const piece of pieces.filter(p => p.length > 1)) {
      const level = piece[0].level;
      const curve = new THREE.CatmullRomCurve3(piece.map(n => at(n.x, n.y, level, LINE)), false, 'catmullrom', 0.05);
      onLevel(level, new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, piece.length * 8), 0.55, 8, false), ink));
      // Direction marks every 9 m: light chevrons printed on the dark line.
      const len = curve.getLength();
      for (let d = 6; d < len - 4; d += 9) {
        const t = d / len, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
        const m = new THREE.Mesh(new THREE.ShapeGeometry(chevron), mark);
        m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(-tan.x, -tan.z) + Math.PI; m.position.copy(p).add(new THREE.Vector3(0, 0.6, 0)); m.renderOrder = 5;
        onLevel(level, m);
      }
    }
    const start = new THREE.Mesh(new THREE.SphereGeometry(1.8, 20, 14), ink); start.position.copy(pts[0]); onLevel(nodes[0].level, start);
    // A bent arrow on the floor at each step, like a road sign: from the way you come (inDir) to the way you go (dir).
    // At the arrival it bends from the corridor into the door. The step's number sits at the arrow's tail, clear of the head.
    const gold = new THREE.MeshBasicMaterial({ color: css('--plan-dest'), depthTest: false, side: THREE.DoubleSide });
    badges = steps.map((st, i) => {
      const n = venue.nodes[st.node];
      let tail = n?.x != null ? at(n.x, n.y, n.level) : pts[0];
      if (n?.x != null && st.dir) {
        const c = { x: n.x, y: n.y }, out = st.dir, inn = st.inDir;
        // arrival: the corner is in the corridor, a few metres before the door
        const corner = st.icon === 'arrive' ? { x: c.x - out.x * 5, y: c.y - out.y * 5 } : c;
        const from = inn ? { x: corner.x - inn.x * 9, y: corner.y - inn.y * 9 } : { x: corner.x - out.x * 4, y: corner.y - out.y * 4 };
        const tip = st.icon === 'arrive' ? { x: c.x + out.x * 1.5, y: c.y + out.y * 1.5 } : { x: corner.x + out.x * 11, y: corner.y + out.y * 11 };
        const m = new THREE.Mesh(new THREE.ShapeGeometry(bentArrow([from, corner, tip], 1.3, 4.2, 3.4)), gold);
        m.rotation.x = -Math.PI / 2; m.position.y = height(n.level) + LINE + 0.7; m.renderOrder = 6; onLevel(n.level, m);
        tail = at(from.x - (inn ?? out).x * 3, from.y - (inn ?? out).y * 3, n.level);
      }
      // A ride: a big sign at the lift or escalator, "↑ To P1", on the level you leave (only that level shows on this step).
      if (n?.x != null && (st.icon === 'up' || st.icon === 'down')) {
        const sign = sprite(rideCanvas(st.icon === 'up', st.level), 12); // a ride's level is where it arrives
        sign.center.set(0.5, -0.6); sign.renderOrder = 11; // floats above the step badge, not under it
        sign.position.copy(at(n.x, n.y, n.level, BLOCK + 6)); groups.get(n.level)?.userData.detail.add(sign);
      }
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(i + 1, i === current), depthTest: false, sizeAttenuation: false }));
      b.position.copy(tail).add(new THREE.Vector3(0, 3, 0)); b.renderOrder = 10; onLevel(n?.level, b);
      return b;
    });
    canvas.dataset.steps = String(badges.length); // for the phone check
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
    s.scale.set(worldWidth, worldWidth * c.height / c.width, 1); s.renderOrder = 8;
    return s;
  }
  function badgeTexture(n, on) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = css(on ? '--plan-dest' : '--plan-route'); g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = css('--plan-bg'); g.stroke();
    g.fillStyle = css(on ? '--plan-route' : '--plan-bg'); g.font = '600 52px "IBM Plex Sans", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 48, 51);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function highlight() {
    badges.forEach((b, j) => {
      const on = j === current;
      if (b.userData.on !== on) { b.material.map?.dispose(); b.material.map = badgeTexture(j + 1, on); b.material.needsUpdate = true; b.userData.on = on; }
    });
    sizeBadges(); needs = true;
  }
  function sizeBadges() {
    const h = canvas.clientHeight || 300;
    badges.forEach((b, j) => { const s = (j === current ? 30 : 22) / h; b.scale.set(s, s, 1); b.renderOrder = j === current ? 20 : 10; });
  }

  function placeCamera() {
    const { theta, phi, radius, target } = cam;
    camera.position.set(target.x + radius * Math.sin(phi) * Math.sin(theta), target.y + radius * Math.cos(phi), target.z + radius * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
    canvas.dataset.view = `${theta.toFixed(3)},${phi.toFixed(3)}`; // for the phone check
    needs = true;
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
    const stepLevel = current >= 0 ? venue.nodes[steps[current]?.node]?.level : null;
    for (const [level, g] of groups) {
      g.visible = stepLevel ? level === stepLevel : !onlyRouteFloors || routeLevels.has(level);
      g.userData.detail.visible = !!stepLevel;
    }
    if (rides) rides.visible = !stepLevel;
    canvas.dataset.levels = [...groups].filter(([, g]) => g.visible).map(([l]) => l).join(' '); // for the phone check
    needs = true;
  }
  function apply(m, now = false) {
    if (m === 'floors') onlyRouteFloors = !onlyRouteFloors;
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
    current = i; highlight(); layers(); onStep(i);
    const p = stepPoint(i) ?? cam.target;
    if (steps[i].icon === 'arrive' && steps[i].dir) p.add(new THREE.Vector3(-steps[i].dir.x * 4, 0, -steps[i].dir.y * 4)); // the bend before the door
    const radius = camera.aspect < 1 ? STEP_RADIUS.tall : STEP_RADIUS.wide;
    // Look a little the way you go; the step sits in the middle, between the card on top and the view bar below.
    const ahead = steps[i].dir ? new THREE.Vector3(steps[i].dir.x * 6, 0, steps[i].dir.y * 6) : new THREE.Vector3();
    const far = new THREE.Vector3(-Math.sin(ORIGINAL.theta), 0, -Math.cos(ORIGINAL.theta)).multiplyScalar(radius * 0.04);
    moveTo({ ...ORIGINAL, target: p.clone().add(ahead).add(far), radius }, now);
  }

  // Touch, as in map apps. One finger: a quick sideways swipe goes to the next or previous step. Two fingers: twist to
  // turn the view, move both up or down to tilt it, spread or pinch to zoom. (Wheel: zoom.) Whole, Route and the steps
  // come back to the plans' angle.
  const pointers = new Map(); let pinch = null, swipe = null;
  const twoFingers = () => { const [a, b] = [...pointers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), y: (a.y + b.y) / 2 }; };
  const down = e => {
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ } pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) swipe = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (pointers.size === 2) { swipe = null; goal = null; pinch = { ...twoFingers(), r: cam.radius, theta: cam.theta, phi: cam.phi }; }
  };
  const move = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    const p = pointers.get(e.pointerId); pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (swipe && p && e.type === 'pointerup') {
      const dx = p.x - swipe.x, dy = p.y - swipe.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy) && performance.now() - swipe.t < 600) onSwipe(dx < 0 ? 1 : -1);
    }
    swipe = null;
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
    if (goal) {
      const k = 1 - Math.pow(0.002, dt);
      cam.theta += (goal.theta - cam.theta) * k; cam.phi += (goal.phi - cam.phi) * k; cam.radius += (goal.radius - cam.radius) * k;
      cam.target.lerp(goal.target, k);
      // Close enough: land exactly on the view asked for (so Whole and the steps are the plans' angle, not near it).
      if (Math.abs(goal.radius - cam.radius) < 0.3 && cam.target.distanceTo(goal.target) < 0.2 && Math.abs(goal.theta - cam.theta) < 0.003 && Math.abs(goal.phi - cam.phi) < 0.003) {
        Object.assign(cam, { theta: goal.theta, phi: goal.phi, radius: goal.radius, target: goal.target.clone() }); goal = null;
      }
      placeCamera();
    }
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
