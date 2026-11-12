// 09 Getting there: the 3D view of the venue with the route. three.js lives only here, and 09 loads this file with
// import(), so the rest of the app never downloads it (the service worker leaves view3d-*.js out of its precache).
// The written steps are the directions; this view only helps. The canvas carries the route summary as its label.
//
// venue: data/venue/<venue>.json (metres; x to the right, y down on the plan) · r: route() result.
// mount(canvas, { venue, route, summary, reduceMotion }) → { mode(m), dispose() }
//   mode: 'original' (the angle of the printed plans) · 'fit' (frame the route) · 'floors' (only the route's levels)
import * as THREE from 'three';

const LEVELS = ['P0', 'M1', 'P1', 'M2', 'P2']; // bottom to top; AUD has no coordinates and is not drawn
const STOREY = 9; // metres between levels in the view (mezzanines included), enough to see one through another
const ORIGINAL = { theta: Math.PI / 4, phi: 0.95 };

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

export function mount(canvas, { venue, route, summary, reduceMotion = false }) {
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `3D view. ${summary} The steps are listed above.`);

  // Plan → view: x stays, plan y becomes z (toward the viewer), levels stack on y. Centred on the drawn areas.
  const drawn = Object.values(venue.areas).filter(a => a.rect && LEVELS.includes(a.level));
  const xs = drawn.flatMap(a => [a.rect[0], a.rect[2]]), ys = drawn.flatMap(a => [a.rect[1], a.rect[3]]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...ys) + Math.max(...ys)) / 2;
  const height = level => Math.max(0, LEVELS.indexOf(level)) * STOREY;
  const at = (x, y, level, lift = 0) => new THREE.Vector3(x - cx, height(level) + lift, y - cz);

  let renderer, scene, camera, groups, routeLine, comet, curve, raf = 0, needs = true, lost = false, frames = 0;
  const routeLevels = new Set(route.levels);
  let onlyRouteFloors = false;
  const cam = { theta: ORIGINAL.theta, phi: ORIGINAL.phi, radius: 260, target: new THREE.Vector3(0, height('P1'), 0) };
  let goal = null;

  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(css('--plan-bg'));
    camera = new THREE.PerspectiveCamera(36, 1, 1, 3000);
    // Tops come out close to the token colours; the sides a little darker, for depth.
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.3); sun.position.set(40, 300, 60); scene.add(sun);

    // Levels the route uses are solid; the others are faint and never cover them (no depth write), so stacked floors
    // do not hide the route's floor.
    const FAINT = 0.14;
    const faded = level => !routeLevels.has(level);
    const mat = (token, level, opacity = 1) => new THREE.MeshLambertMaterial({ color: css(token), transparent: faded(level) || opacity < 1,
      opacity: faded(level) ? FAINT : opacity, depthWrite: !faded(level) });
    const dest = new THREE.MeshLambertMaterial({ color: css('--plan-dest') });
    groups = new Map();
    for (const level of LEVELS) {
      const g = new THREE.Group(); g.userData.level = level; scene.add(g); groups.set(level, g);
      const areas = drawn.filter(a => a.level === level);
      if (!areas.length) continue;
      const x0 = Math.min(...areas.map(a => a.rect[0])), x1 = Math.max(...areas.map(a => a.rect[2]));
      const y0 = Math.min(...areas.map(a => a.rect[1])), y1 = Math.max(...areas.map(a => a.rect[3]));
      const room = mat('--plan-room', level), plate = mat('--plan-floor', level, 0.85);
      const corridor = new THREE.LineBasicMaterial({ color: css('--plan-line'), transparent: faded(level), opacity: faded(level) ? FAINT : 1, depthWrite: !faded(level) });
      const p = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 8, 0.4, y1 - y0 + 8), plate);
      p.position.copy(at((x0 + x1) / 2, (y0 + y1) / 2, level, -0.2)); g.add(p);
      for (const a of areas) {
        const isDest = a === venue.areas[route.to];
        const box = new THREE.Mesh(new THREE.BoxGeometry(a.rect[2] - a.rect[0], isDest ? 3 : 1.6, a.rect[3] - a.rect[1]), isDest ? dest : room);
        box.position.copy(at((a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2, level, isDest ? 1.5 : 0.8)); g.add(box);
      }
      for (const c of venue.corridors.filter(c => c.level === level)) {
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.points.map(([x, y]) => at(x, y, level, 0.2))), corridor));
      }
    }
    // The route: a tube along the path (rides drawn straight between levels), a dot that walks it, start and end markers.
    const pts = route.path.map(id => venue.nodes[id]).filter(n => n.x != null).map(n => at(n.x, n.y, n.level, 2.2));
    curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
    const ink = new THREE.MeshBasicMaterial({ color: css('--plan-route') });
    routeLine = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(32, pts.length * 8), 0.9, 8, false), ink);
    scene.add(routeLine);
    const marker = (p, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), ink); m.position.copy(p); scene.add(m); return m; };
    marker(pts[0], 2.4);
    marker(pts.at(-1), 2.4);
    comet = reduceMotion ? null : marker(pts[0], 1.6);
    resize();
    apply('original', true);
  }

  function placeCamera() {
    const { theta, phi, radius, target } = cam;
    camera.position.set(target.x + radius * Math.sin(phi) * Math.sin(theta), target.y + radius * Math.cos(phi), target.z + radius * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
    needs = true;
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !renderer) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix(); needs = true;
  }
  function moveTo(w, now) {
    if (reduceMotion || now) { Object.assign(cam, { ...w, target: w.target.clone() }); goal = null; placeCamera(); } else goal = w;
  }
  function frame(points) {
    const box = new THREE.Box3().setFromPoints(points), size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, size.y * 1.6, 40);
    return { target: box.getCenter(new THREE.Vector3()), radius: span * (camera.aspect < 1 ? 2.1 : 1.5) };
  }
  function apply(m, now = false) {
    if (m === 'floors') onlyRouteFloors = !onlyRouteFloors;
    for (const [level, g] of groups) g.visible = !onlyRouteFloors || routeLevels.has(level);
    if (m === 'original') {
      const all = drawn.flatMap(a => [at(a.rect[0], a.rect[1], a.level), at(a.rect[2], a.rect[3], a.level)]);
      moveTo({ ...ORIGINAL, ...frame(all) }, now);
    } else if (m === 'fit') moveTo({ theta: cam.theta, phi: cam.phi, ...frame(curve.getPoints(60)) }, now);
    needs = true;
    return onlyRouteFloors;
  }

  // Drag to turn the view, pinch or wheel to zoom.
  const pointers = new Map(); let pinch = null;
  const down = e => { canvas.setPointerCapture?.(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); goal = null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: cam.radius }; } };
  const move = e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) { const [a, b] = [...pointers.values()]; cam.radius = clampR(pinch.r * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))); }
    else { cam.theta -= dx * 0.006; cam.phi = Math.min(1.4, Math.max(0.25, cam.phi - dy * 0.005)); }
    placeCamera();
  };
  const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  const wheel = e => { e.preventDefault(); cam.radius = clampR(cam.radius * (1 + Math.sign(e.deltaY) * 0.09)); placeCamera(); };
  const clampR = r => Math.min(900, Math.max(40, r));
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
      if (Math.abs(goal.radius - cam.radius) < 0.3 && cam.target.distanceTo(goal.target) < 0.2) goal = null;
      placeCamera();
    }
    if (comet && curve) { comet.position.copy(curve.getPointAt((now / 1000 * 25 / curve.getLength()) % 1)); needs = true; }
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
    scene?.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
    renderer?.dispose();
    if (loseContext) renderer?.forceContextLoss();
  }

  build();
  raf = requestAnimationFrame(loop);
  return {
    mode: m => apply(m),
    rendered: () => !!renderer && !lost,
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
