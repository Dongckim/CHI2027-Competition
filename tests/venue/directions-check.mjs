// Phone check of S5 (09 Getting there, 09-1 Where are you now) in headless Chrome, 390x844. Starts and stops its own
// vite preview. npm run build && node --experimental-websocket tests/venue/directions-check.mjs [screenshot dir]
//   - the 3D view (three.js) downloads only when 09 opens, and draws (canvas pixels, not blank)
//   - frame times while the route dot moves, CPU slowed 4x (the "no stutter" check)
//   - reduced motion: the view stops drawing once still; WebGL context lost → restored → drawn again
//   - Change → 09-1 → Registration → back on 09 "From Registration", one history step
// Exit code 1 when a check fails.
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

  // Step numbers on the route = the written steps; tapping step 3 selects it in the list and on the plan.
  const nLines = (out.steps ?? []).length;
  check('step numbers on the route', (await ev(`document.querySelector('section[aria-label="Floor plan"] canvas').dataset.steps`)) === String(nLines), { lines: nLines });
  await ev(`document.querySelectorAll('ol[aria-label=Steps] li button')[2].click()`); await sleep(1200);
  out.tapStep3 = { current: await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li')].findIndex(li => li.getAttribute('aria-current') === 'step')`), live: await ev(`[...document.querySelectorAll('[aria-live]')].map(p => p.innerText).find(t => t.startsWith('Step')) ?? null`) };
  check('tap a step: selected', out.tapStep3.current === 2 && /^Step 3 of /.test(out.tapStep3.live ?? ''), out.tapStep3);
  await ev(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Original angle').click()`); await sleep(1200);
  await shot('s5-09-steps');
  // First person, full screen: Walk the route → a layer over the whole window (dialog), frames keep coming, the step
  // advances by itself; Pause stops. Controls: [Close, Previous, Play/Pause, Next].
  const play = `[...document.querySelectorAll('[role=dialog] button')][2]`;
  await ev(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Walk the route').click()`);
  await sleep(600);
  out.immersive = await ev(`(() => { const d = document.querySelector('[role=dialog]'); const c = d?.querySelector('canvas'); const r = d?.getBoundingClientRect();
    return d && { cover: [Math.round(r.width), Math.round(r.height)], canvas: [c.clientWidth, c.clientHeight], viewport: [innerWidth, innerHeight], focus: document.activeElement?.getAttribute('aria-label'),
      hint: d.innerText.includes('Turn your phone sideways') }; })()`);
  check('first person fills the screen', !!out.immersive && out.immersive.cover.join() === out.immersive.viewport.join() && out.immersive.canvas.join() === out.immersive.viewport.join()
    && out.immersive.focus === 'Close' && out.immersive.hint, out.immersive ?? {});
  await shot('s5-09-first-person-portrait');
  const w0 = { f: await ev(framesNow), step: await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li')].findIndex(li => li.getAttribute('aria-current') === 'step')`) };
  await shot('s5-09-first-person-start');
  // It reaches the next step by itself (within 10 s at the preview speed); step 1 is current from the door.
  const reachedIn = await waitFor(`[...document.querySelectorAll('ol[aria-label=Steps] li')].findIndex(li => li.getAttribute('aria-current') === 'step') > ${w0.step}`, 10000);
  const w1 = { f: await ev(framesNow), step: await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li')].findIndex(li => li.getAttribute('aria-current') === 'step')`), label: await ev(`${play}.innerText`) };
  check('first person walks on', w0.step === 0 && reachedIn != null && w1.f - w0.f > 60 && w1.label === 'Pause', { start: w0, nextStepInMs: reachedIn, then: w1 });
  await ev(`${play}.click()`); await sleep(300);
  const p0 = await ev(framesNow); await sleep(1000); const p1 = await ev(framesNow);
  check('Pause stops', p1 === p0 && (await ev(`${play}.innerText`)) === 'Walk on', { framesIn1s: p1 - p0 });
  // Turn the phone: landscape → the 3D fills the wide screen, no hint.
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
  await ev(`${play}.click()`); await sleep(1200); await ev(`${play}.click()`); await sleep(300);
  out.landscape = await ev(`(() => { const c = document.querySelector('[role=dialog] canvas'); return { canvas: [c.clientWidth, c.clientHeight], hint: document.querySelector('[role=dialog]').innerText.includes('Turn your phone sideways') }; })()`);
  check('landscape: 3D fills the wide screen', out.landscape.canvas.join() === '844,390' && !out.landscape.hint, out.landscape);
  await shot('s5-09-first-person-landscape');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  // Back (Android) closes the walk and stays on 09.
  await ev('history.back()'); await sleep(600);
  out.afterBack = { dialog: await ev(`!!document.querySelector('[role=dialog]')`), hash: await ev('location.hash'), focus: await ev(`document.activeElement?.innerText`) };
  check('Back closes the walk, stays on 09', !out.afterBack.dialog && out.afterBack.hash === href && out.afterBack.focus === 'Walk the route', out.afterBack);
  // Close leaves no extra history entry: open, Close, then one Back leaves 09 for the sample day.
  const lenBefore = await ev('history.length');
  await ev(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Walk the route').click()`); await sleep(500);
  await ev(`document.querySelector('[role=dialog] button[aria-label=Close]').click()`); await sleep(600);
  out.afterClose = { dialog: await ev(`!!document.querySelector('[role=dialog]')`), hash: await ev('location.hash'), lengthGrew: (await ev('history.length')) - lenBefore };
  check('Close returns to 09', !out.afterClose.dialog && out.afterClose.hash === href, out.afterClose);

  // Buttons: Fit route, Route floors only.
  await ev(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Fit route').click()`); await sleep(900);
  await ev(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Route floors only').click()`); await sleep(900);
  out.floorsPressed = await ev(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Route floors only').getAttribute('aria-pressed')`);
  await shot('s5-09-fit-floors');

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

  // Reduced motion: no moving dot; once the view is still it stops drawing frames.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'dark' }] });
  await ev(`location.hash = ${JSON.stringify(href)}`);
  await waitFor(drawn, 30000);
  await sleep(800);
  const f0 = await ev(framesNow); await sleep(1500); const f1 = await ev(framesNow);
  check('reduced motion: still', f1 === f0, { framesIn1500ms: f1 - f0 });
  // Reduced motion, first person: no gliding; it stands at step 1, Next step goes to step 2, and then nothing moves.
  await ev(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Walk the route').click()`); await sleep(400);
  const r0 = await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li')].findIndex(li => li.getAttribute('aria-current') === 'step')`);
  await ev(`${play}.click()`); await sleep(400);
  const r1 = await ev(`[...document.querySelectorAll('ol[aria-label=Steps] li')].findIndex(li => li.getAttribute('aria-current') === 'step')`);
  const g0 = await ev(framesNow); await sleep(1200); const g1 = await ev(framesNow);
  check('reduced motion: first person jumps step to step', r0 === 0 && r1 === 1 && g1 === g0, { first: r0, afterNext: r1, framesIn1200ms: g1 - g0 });
  await shot('s5-09-dark-reduced');
  out.pageErrors = errors;
  if (errors.length) fails.push('page errors');
} finally {
  console.log(JSON.stringify(out, null, 2));
  console.log(fails.length ? `FAIL: ${fails.join(', ')}` : 'PASS: all checks');
  ws.close(); chrome.kill(); process.kill(-server.pid);
  process.exitCode = fails.length ? 1 : 0;
}
