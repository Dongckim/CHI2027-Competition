// Phone check of S5 (09 Getting there, 09-1 Where are you now) in headless Chrome, 390x844. Starts and stops its own
// (steps on the plan: Show step 1 / Next, one-finger drag, the view bar, the large plan sideways or from its button)
// vite preview. npm run build && node --experimental-websocket tests/venue/directions-check.mjs [screenshot dir]
//   - the 3D view (three.js) downloads only when 09 opens, and draws (canvas pixels, not blank)
//   - frame times while the route dot moves, CPU slowed 4x (the "no stutter" check)
//   - reduced motion: the view stops drawing once still; WebGL context lost → restored → drawn again
//   - Change → 09-1 → Registration → back on 09 "From Registration", one history step
// Exit code 1 when a check fails; a run that stops partway prints FAIL with where it stopped (never PASS).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const OUT = (process.argv[2] ?? tmpdir()).replace(/\/?$/, '/');
const PORT = 4321, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${tmpdir()}/arc-s5-${Date.now()}`, '--no-first-run', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9337/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 200)); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? undefined : r.result.result.value; };
const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await sleep(80); } return null; };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(`${OUT}${name}.png`, Buffer.from(r.result.data, 'base64')); };
// Non-blank: share of canvas pixels that differ from the corner (the background).
// Frames the view has drawn (view3d.js writes canvas.dataset.frames); the screenshots show what was drawn.
const framesNow = `Number(document.querySelector('section[aria-label="Floor plan"] canvas')?.dataset.frames ?? 0)`;
const drawn = `${framesNow} > 0`;
const out = {}; const fails = [];
const check = (name, ok, detail) => { out[name] = { ok, ...detail }; if (!ok) fails.push(name); };

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  // Sample day → its first stop's Directions (the card's button).
  await send('Page.navigate', { url: BASE + '#/sample' });
  await waitFor(`!!document.querySelector('a[href^="#/directions/"]')`);
  out.todayWalkLine = await ev(`[...document.querySelectorAll('p')].map(p => p.innerText).find(t => /min (walk|from Registration)/.test(t)) ?? null`);
  const before = await ev(`performance.getEntriesByType('resource').filter(e => /view3d-/.test(e.name)).length`);
  const href = await ev(`document.querySelector('a[href^="#/directions/"]').getAttribute('href')`);
  await ev(`location.hash = ${JSON.stringify(href)}`);
  await waitFor(`document.querySelector('ol[aria-label=Steps]')?.children.length > 0`);
  const drewIn = await waitFor(drawn, 30000);
  const after = await ev(`performance.getEntriesByType('resource').filter(e => /view3d-/.test(e.name)).length`);
  check('3D loads only on 09', before === 0 && after === 1, { before, after });
  check('3D draws', drewIn != null, { msToDrawn: drewIn, frames: await ev(framesNow) });
  out.steps = await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li')].map(li => li.innerText.replace(/\\s+/g, ' '))`);
  out.header = await ev(`[...document.querySelectorAll('main p')].slice(0, 3).map(p => p.innerText)`);
  out.ariaLabel = await ev(`document.querySelector('section[aria-label="Floor plan"] canvas').getAttribute('aria-label')`);
  check('3D summary in aria-label', /^3D view\. Route from .+ to .+, about \d+–\d+ min/.test(out.ariaLabel ?? ''), {});
  await sleep(1500);
  await shot('s5-09');

  // Frame times with the route dot moving, CPU 4x slower: 3 s of rAF deltas.
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const frames = await ev(`new Promise(res => { const d = []; let last = performance.now(); const t0 = last; const f = now => { d.push(now - last); last = now; if (now - t0 < 3000) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); })`);
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const sorted = [...frames].sort((a, b) => a - b), p = q => +sorted[Math.floor(q * (sorted.length - 1))].toFixed(1);
  check('smooth at CPU 4x', p(0.95) < 34 && frames.filter(x => x > 50).length <= 3, { frames: frames.length, medianMs: p(0.5), p95Ms: p(0.95), over50ms: frames.filter(x => x > 50).length });

  // Steps on the plan: numbers = written steps; Show step 1 / Next stop at each step, the card and
  // the list follow; the bar's Whole goes back to no step.
  const nLines = (out.steps ?? []).length;
  const cur = `[...document.querySelectorAll('ol[aria-label=Steps] li')].findIndex(li => li.getAttribute('aria-current') === 'step')`;
  const card = `document.querySelector('section[aria-label="Floor plan"] .shadow p')?.innerText ?? null`;
  const press = label => ev(`[...document.querySelectorAll('section[aria-label="Floor plan"] button')].find(b => b.innerText === ${JSON.stringify(label)}).click()`);
  check('step numbers on the route', (await ev(`document.querySelector('section[aria-label="Floor plan"] canvas').dataset.steps`)) === String(nLines), { lines: nLines });
  const marks = await ev(`(({ chevronDot, badgeGap }) => ({ chevronDot: +chevronDot, badgeGap: +badgeGap }))(document.querySelector('section[aria-label="Floor plan"] canvas').dataset)`);
  check('direction marks point the way you walk (dot > 0)', marks.chevronDot > 0, marks);
  check('step numbers sit where you act (< 2 m)', marks.badgeGap < 2, marks);
  await press('Show step 1'); await sleep(1500);
  const s1 = { list: await ev(cur), card: await ev(card), levels: await ev(`document.querySelector('section[aria-label="Floor plan"] canvas').dataset.levels`), tidy: await ev(`(({ overlaps, currentShown, labels }) => ({ overlaps: +overlaps, currentShown, labels: +labels }))(document.querySelector('section[aria-label="Floor plan"] canvas').dataset)`) };
  await shot('s5-09-step1');
  await press('Next: step 2'); await sleep(1500);
  const s2 = { list: await ev(cur), card: await ev(card), tidy: await ev(`(({ overlaps, currentShown, labels }) => ({ overlaps: +overlaps, currentShown, labels: +labels }))(document.querySelector('section[aria-label="Floor plan"] canvas').dataset)`) };
  await shot('s5-09-step2');
  await press('Next: step 3'); await sleep(1500);
  const s3 = { list: await ev(cur), card: await ev(card) };
  await shot('s5-09-step3');
  // One finger drags the plan (as in map apps): the picture follows the finger, the step stays; tapping the step again
  // frames it.
  const canvasData = `document.querySelector('section[aria-label="Floor plan"] canvas').dataset`;
  const target0 = await ev(`${canvasData}.target`);
  await ev(`(() => { const c = document.querySelector('section[aria-label="Floor plan"] canvas'), r = c.getBoundingClientRect(), y = r.top + r.height / 2, x0 = r.left + r.width / 2;
    const p = (t, x) => c.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true }));
    p('pointerdown', x0); for (let k = 1; k <= 8; k++) p('pointermove', x0 - k * 15); p('pointerup', x0 - 120); })()`);
  await sleep(600);
  const dragged = { list: await ev(cur), target: await ev(`${canvasData}.target`), view: await ev(`${canvasData}.view`) };
  await shot('s5-09-dragged');
  await ev(`document.querySelectorAll('ol[aria-label=Steps] li button')[2].click()`); await sleep(1800);
  const reframed = { target: await ev(`${canvasData}.target`), inArea: await ev(`${canvasData}.inArea`) };
  check('one finger drags the plan; the step stays, tapping it frames it again', dragged.list === 2 && dragged.target !== target0 && dragged.view === '0.785,0.950' && reframed.target === target0 && reframed.inArea === 'true', { target0, dragged, reframed });
  const s3tidy = await ev(`(({ overlaps, currentShown, labels }) => ({ overlaps: +overlaps, currentShown, labels: +labels }))(document.querySelector('section[aria-label="Floor plan"] canvas').dataset)`);
  check('labels: no overlaps, this step\'s number shows', [s1.tidy, s2.tidy, s3tidy].every(t => t.overlaps === 0 && t.currentShown === 'true' && t.labels > 1), { s1: s1.tidy, s2: s2.tidy, s3: s3tidy });
  // Step to step, the view runs along the route (a dot on the line, the view following it): step 1 → 3 goes up the
  // escalator, so the floor shown changes from P0 to P1 on the way, and it ends framed on step 3.
  await ev(`document.querySelectorAll('ol[aria-label=Steps] li button')[0].click()`); await sleep(3000);
  const run = await ev(`new Promise(res => { const c = document.querySelector('section[aria-label="Floor plan"] canvas'), seen = [];
    document.querySelectorAll('ol[aria-label=Steps] li button')[2].click();
    const t0 = performance.now(); const tick = () => { seen.push({ t: Math.round(performance.now() - t0), travel: c.dataset.travel, levels: c.dataset.levels, target: c.dataset.target });
      if (performance.now() - t0 < 3200) setTimeout(tick, 60); else res(seen); }; tick(); })`);
  const during = run.filter(r => r.travel === '1'), levelsSeen = [...new Set(during.map(r => r.levels))];
  const ends = await ev(`(({ travel, inArea, levels }) => ({ travel, inArea, levels }))(document.querySelector('section[aria-label="Floor plan"] canvas').dataset)`);
  check('step to step: runs along the route (P0 → P1 on the escalator), then frames the step', during.length > 5 && levelsSeen[0] === 'P0' && levelsSeen.includes('P1') && new Set(during.map(r => r.target)).size > 5 && ends.travel === '' && ends.inArea === 'true' && ends.levels === 'P1',
    { samplesRunning: during.length, msRunning: during.at(-1)?.t, levelsSeen, ends });
  // Frames at CPU 4x while gliding to a step and placing its labels (declutter runs on every camera move).
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const glide = await ev(`new Promise(res => { const d = []; let last = performance.now(); const t0 = last; const f = now => { d.push(now - last); last = now; if (now - t0 < 3000) requestAnimationFrame(f); else res(d); };
    requestAnimationFrame(f); setTimeout(() => [...document.querySelectorAll('ol[aria-label=Steps] li button')][0].click(), 100); setTimeout(() => [...document.querySelectorAll('ol[aria-label=Steps] li button')][2].click(), 1500); })`);
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const gs = [...glide].sort((a, b) => a - b), gp = q => +gs[Math.floor(q * (gs.length - 1))].toFixed(1);
  check('smooth at CPU 4x while moving between steps', gp(0.95) < 34 && glide.filter(x => x > 50).length <= 3, { frames: glide.length, medianMs: gp(0.5), p95Ms: gp(0.95), over50ms: glide.filter(x => x > 50).length });
  // Every step: its spot and big number inside the part the card and bars leave free; the last step ends with I'm here.
  const area = [];
  for (let i = 0; i < nLines; i++) {
    await ev(`document.querySelectorAll('ol[aria-label=Steps] li button')[${i}].click()`); await sleep(3000); // after the run along the route
    area.push(await ev(`(({ inArea, overlaps }) => ({ inArea, overlaps: +overlaps }))(document.querySelector('section[aria-label="Floor plan"] canvas').dataset)`));
  }
  const lastButton = await ev(`(() => { const g = document.querySelector('[aria-label="Steps on the plan"]'); return { buttons: [...g.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.innerText), text: g.innerText.replace(/\\s+/g, ' ').trim(), imHere: [...document.querySelectorAll('button')].filter(b => b.innerText === "I'm here").length }; })()`);
  check('every step inside the free area, no overlaps', area.every(a => a.inArea === 'true' && a.overlaps === 0), { area });
  check("last step: back button and You've arrived, one I'm here (the page's)", JSON.stringify(lastButton.buttons) === JSON.stringify(['Previous step']) && /You've arrived$/.test(lastButton.text) && lastButton.imHere === 1, { lastButton });
  await ev(`document.querySelectorAll('ol[aria-label=Steps] li button')[2].click()`); await sleep(1500);
  check('steps: Show step 1, Next, Next', s1.list === 0 && s2.list === 1 && s3.list === 2 && /^1\./.test(s1.card ?? '') && /^3\./.test(s3.card ?? ''), { s1, s2, s3 });
  await ev(`[...document.querySelectorAll('[aria-label="What the plan shows"] button')].find(b => b.innerText === 'Whole').click()`); await sleep(600);
  const wholeLevels = await ev(`document.querySelector('section[aria-label="Floor plan"] canvas').dataset.levels`);
  check('Whole: back to no step', (await ev(cur)) === -1 && (await ev(card)) === null, {});
  check('a step shows only its level, Whole shows all', s1.levels?.split(' ').length === 1 && wholeLevels?.split(' ').length > 1, { step1: s1.levels, whole: wholeLevels });

  // Two fingers, as in map apps: a clockwise twist turns the view (theta up), both fingers up tilt it (phi up); a step or
  // Whole comes back to the plans' angle (0.785, 0.950).
  const viewNow = `document.querySelector('section[aria-label="Floor plan"] canvas').dataset.view`;
  const twoFinger = (a0, a1, lift) => ev(`(() => { const c = document.querySelector('section[aria-label="Floor plan"] canvas'), r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = 60;
    const at = (id, ang, dy, t) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: cx + Math.cos(ang + (id === 2 ? Math.PI : 0)) * R, clientY: cy + Math.sin(ang + (id === 2 ? Math.PI : 0)) * R + dy, bubbles: true, pointerType: 'touch' }));
    at(1, ${a0}, 0, 'pointerdown'); at(2, ${a0}, 0, 'pointerdown');
    for (let k = 1; k <= 6; k++) { const ang = ${a0} + (${a1} - ${a0}) * k / 6, dy = -${lift} * k / 6; at(1, ang, dy, 'pointermove'); at(2, ang, dy, 'pointermove'); }
    at(1, ${a1}, -${lift}, 'pointerup'); at(2, ${a1}, -${lift}, 'pointerup'); })()`);
  const v0 = await ev(viewNow);
  await twoFinger(0, 0.5, 40); await sleep(300);
  const v1 = await ev(viewNow);
  await shot('s5-09-twisted');
  const [t0, p0] = v0.split(',').map(Number), [t1, p1] = v1.split(',').map(Number);
  await ev(`[...document.querySelectorAll('[aria-label="What the plan shows"] button')].find(b => b.innerText === 'Whole').click()`);
  await waitFor(`${viewNow} === '0.785,0.950'`, 5000); // the glide back
  const vBack = await ev(viewNow);
  check('two fingers: twist turns, lift tilts; Whole back to the plans angle', Math.abs(t1 - t0 - 0.5) < 0.05 && p1 > p0 + 0.1 && vBack === '0.785,0.950', { before: v0, after: v1, afterWhole: vBack, stepsUnchanged: await ev(cur) });
  // On the whole view, tilt far enough to see the stacked levels from the side (lower levels' routes not hidden).
  await twoFinger(0, 0, 160); await sleep(300); await twoFinger(0, 0, 160); await sleep(300);
  const side = Number((await ev(viewNow)).split(',')[1]);
  await shot('s5-09-whole-tilted');
  check('two fingers tilt the whole view nearly side-on', side >= 1.45, { phi: side });
  await ev(`[...document.querySelectorAll('[aria-label="What the plan shows"] button')].find(b => b.innerText === 'Whole').click()`);
  await waitFor(`${viewNow} === '0.785,0.950'`, 5000);

  // Turn the phone sideways: the plan takes the screen with the card, the bar and the step buttons; upright again: back.
  await press('Show step 1'); await sleep(400);
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
  await sleep(1500);
  out.sideways = await ev(`(() => { const d = document.querySelector('[role=dialog]'); const c = d?.querySelector('canvas'); return d && { canvas: [c.clientWidth, c.clientHeight],
    next: !![...d.querySelectorAll('button')].find(b => b.innerText.startsWith('Next')), bar: !!d.querySelector('[aria-label="What the plan shows"]'), card: d.querySelector('.shadow p')?.innerText }; })()`);
  await shot('s5-09-sideways');
  check('sideways: large plan with card, bar, steps', out.sideways?.canvas?.join() === '844,390' && out.sideways.next && out.sideways.bar && /^1\./.test(out.sideways.card ?? ''), out.sideways ?? {});
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await sleep(800);
  check('upright: back to 09', !(await ev(`!!document.querySelector('[role=dialog]')`)) && (await ev('location.hash')) === href, {});
  // The Larger plan button (upright): the same large plan; Back closes it and stays on 09.
  await ev(`document.querySelector('button[aria-label="Larger plan"]').click()`); await sleep(700);
  const opened = await ev(`(() => { const d = document.querySelector('[role=dialog]'); const r = d?.getBoundingClientRect(); return d && [Math.round(r.width), Math.round(r.height)].join(); })()`);
  await ev('history.back()'); await sleep(700);
  check('Larger plan: opens; Back closes, stays on 09', opened === '390,844' && !(await ev(`!!document.querySelector('[role=dialog]')`)) && (await ev('location.hash')) === href, { opened });
  await ev(`[...document.querySelectorAll('[aria-label="What the plan shows"] button')].find(b => b.innerText === 'Whole').click()`); await sleep(500);

  // WebGL context lost (as when the phone takes the GPU for another app) → restored → drawn again.
  await ev(`(() => { const c = document.querySelector('section[aria-label="Floor plan"] canvas'); window.__lose = (c.getContext('webgl2') || c.getContext('webgl')).getExtension('WEBGL_lose_context'); window.__lose.loseContext(); })()`);
  await sleep(500);
  const framesLost = await ev(framesNow);
  await ev(`window.__lose.restoreContext()`);
  const redrawn = await waitFor(`${framesNow} > ${framesLost}`, 10000);
  check('context lost → drawn again', redrawn != null, { msToRedrawn: redrawn });

  // Change → 09-1 → Registration → back on 09 with one history step.
  const len0 = await ev('history.length');
  await ev(`[...document.querySelectorAll('a')].find(a => a.innerText === 'Change').click()`);
  await waitFor(`location.hash.endsWith('/from') && !!document.querySelector('[role=radiogroup] label')`);
  out.whereNow = await ev(`[...document.querySelectorAll('[role=radiogroup] label')].map(l => l.innerText.replace(/\\n/g, ' | ') + (l.querySelector('input').checked ? ' [x]' : ''))`);
  await ev(`(() => { const i = document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '133'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  out.search133 = await ev(`[...document.querySelectorAll('[role=radiogroup] label')].map(l => l.innerText.split('\\n')[0])`);
  await shot('s5-09-1');
  await ev(`[...document.querySelectorAll('[role=radiogroup] label')].find(l => l.innerText.startsWith('Room 133')).querySelector('input').click()`);
  await waitFor(`location.hash === ${JSON.stringify(href)} && document.body.innerText.includes('From Room 133')`);
  const fromNow = await ev(`document.body.innerText.includes('From Room 133')`);
  out.stepsFrom133 = await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li')].map(li => li.innerText.replace(/\\s+/g, ' '))`);
  // The start already picked: tapping it also goes back.
  await ev(`[...document.querySelectorAll('a')].find(a => a.innerText === 'Change').click()`);
  await waitFor(`location.hash.endsWith('/from')`);
  await ev(`[...document.querySelectorAll('[role=radiogroup] label')].find(l => l.querySelector('input').checked).click()`);
  const backAgain = await waitFor(`location.hash === ${JSON.stringify(href)}`, 3000);
  check('tapping the picked start goes back', backAgain != null, {});
  await ev('history.back()'); await sleep(500);
  check('Change picks a start, one step back', fromNow && (await ev('location.hash')) === '#/sample', { after: await ev('location.hash'), historyGrew: (await ev('history.length')) - len0 });
  // The picked start is only for now: leaving 09, or I'm here, forgets it; 09 opens again from the usual start.
  const fromLine = `document.querySelector('main a[href$="/from"]')?.parentElement?.innerText.split('\\n')[0] ?? null`;
  await ev(`location.hash = ${JSON.stringify(href)}`); await waitFor(`!!document.querySelector('ol[aria-label=Steps] li')`);
  const afterLeaving = await ev(fromLine);
  await ev(`[...document.querySelectorAll('a')].find(a => a.innerText === 'Change').click()`);
  await waitFor(`location.hash.endsWith('/from') && !!document.querySelector('input[type=search]')`);
  await ev(`(() => { const i = document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '133'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  await ev(`[...document.querySelectorAll('[role=radiogroup] label')].find(l => l.innerText.startsWith('Room 133')).querySelector('input').click()`);
  await waitFor(`location.hash === ${JSON.stringify(href)} && document.body.innerText.includes('From Room 133')`);
  await ev(`[...document.querySelectorAll('button')].find(b => b.innerText === "I'm here").click()`);
  await waitFor(`location.hash === '#/sample'`);
  await ev(`location.hash = ${JSON.stringify(href)}`); await waitFor(`!!document.querySelector('ol[aria-label=Steps] li')`);
  const afterImHere = await ev(fromLine);
  check('picked start forgotten after leaving 09 and after I\'m here', afterLeaving !== 'From Room 133' && afterImHere !== 'From Room 133' && !!afterLeaving, { afterLeaving, afterImHere });
  await ev(`location.hash = '#/sample'`); await sleep(300);

  // Reduced motion: no moving dot; once the view is still it stops drawing frames.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'dark' }] });
  await ev(`location.hash = ${JSON.stringify(href)}`);
  await waitFor(drawn, 30000);
  await sleep(800);
  const f0 = await ev(framesNow); await sleep(1500); const f1 = await ev(framesNow);
  check('reduced motion: still', f1 === f0, { framesIn1500ms: f1 - f0 });
  // Reduced motion, steps: no gliding; Show step 1 jumps there, and nothing moves after.
  await ev(`[...document.querySelectorAll('section[aria-label="Floor plan"] button')].find(b => b.innerText === 'Show step 1').click()`);
  await sleep(120);
  const g0 = await ev(framesNow); await sleep(1200); const g1 = await ev(framesNow);
  check('reduced motion: steps jump', (await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li')].findIndex(li => li.getAttribute('aria-current') === 'step')`)) === 0 && g1 === g0, { framesIn1200ms: g1 - g0 });
  await shot('s5-09-dark-reduced');
  // A place the plan has no coordinates for (the keynote in the Auditorium): no left or right on the walkway, and the
  // 3D view says so on that step instead of showing an empty plan.
  await send('Page.navigate', { url: BASE + '#/directions/chi2026:214894' }); await send('Page.reload'); // a fresh page (a route changing in place: revision-check.mjs)
  await waitFor(`[...document.querySelectorAll('ol[aria-label=Steps] li')].some(li => / entrance$/.test(li.innerText))`, 20000);
  const audLines = await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li')].map(li => li.innerText.replace(/\\s+/g, ' ').replace(/^\\d+ /, ''))`);
  await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li button')].at(-1).click()`); await sleep(800);
  const audPlan = await ev(`document.querySelector('section[aria-label="Floor plan"]').innerText`);
  check('Auditorium: walkway by name, no plan shown as such', audLines?.some(t => /^Take the Connecting Walkway to the Auditorium · about \d+ m$/.test(t)) && /No floor plan for the Auditorium/.test(audPlan ?? ''), { audLines });
  await shot('s5-09-auditorium');
  // From the Auditorium (picked in 09-1) to the first stop's room: step 1 is shown where the walkway comes out, with
  // "You come out here".
  await ev(`location.hash = ${JSON.stringify(href)}`); await waitFor(`!!document.querySelector('ol[aria-label=Steps] li')`);
  await ev(`[...document.querySelectorAll('a')].find(a => a.innerText === 'Change').click()`);
  await waitFor(`location.hash.endsWith('/from') && !!document.querySelector('input[type=search]')`);
  await ev(`(() => { const i = document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Auditorium'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  out.searchAuditorium = await ev(`[...document.querySelectorAll('[role=radiogroup] label')].map(l => l.innerText.split('\\n')[0])`);
  await ev(`[...document.querySelectorAll('[role=radiogroup] label')].find(l => l.innerText.startsWith('Auditorium'))?.querySelector('input').click()`);
  await waitFor(`document.body.innerText.includes('From Auditorium')`, 10000);
  await ev(`document.querySelectorAll('ol[aria-label=Steps] li button')[0].click()`); await sleep(1500);
  const fromAud = await ev(`(() => { const s = document.querySelector('section[aria-label="Floor plan"]'), c = s.querySelector('canvas');
    return { card: s.querySelector('.shadow p')?.innerText ?? null, noPlan: /No floor plan/.test(s.innerText), sign: c.dataset.sign, inArea: c.dataset.inArea, overlaps: +c.dataset.overlaps }; })()`);
  check('from the Auditorium: shown where you come out', /^1\. Leave the Auditorium · take the Connecting Walkway to Access A/.test(fromAud?.card ?? '') && !fromAud.noPlan && fromAud.sign === 'out' && fromAud.inArea === 'true' && fromAud.overlaps === 0, { fromAud, search: out.searchAuditorium });
  await shot('s5-09-from-auditorium');
  out.pageErrors = errors;
  if (errors.length) fails.push('page errors');
} catch (e) {
  // stopped partway: say so, with the checks that did not run counted as failed
  out.stoppedAt = String(e?.message ?? e).slice(0, 300);
  fails.push(`stopped: ${out.stoppedAt}`);
} finally {
  console.log(JSON.stringify(out, null, 2));
  console.log(fails.length ? `FAIL: ${fails.join(', ')}` : 'PASS: all checks');
  ws.close(); chrome.kill(); process.kill(-server.pid);
  process.exitCode = fails.length ? 1 : 0;
}
