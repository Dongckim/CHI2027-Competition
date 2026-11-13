// Phone check (S5b): every way into 09 works with a plan made on this phone, on the real clock (not a conference day,
// so Today has no top card). Starts and stops its own vite preview.
// npm run build && node --experimental-websocket tests/venue/entry-check.mjs
//   - Today's day list: a stop's ⋯ → Directions → 09 for that talk; the first stop starts at Registration, the next one
//     at the stop before
//   - 06 Talk → Directions; 05 search: a talk's Directions, a room number and a facility ("toilet") with Directions
// Exit code 1 on a fail; a run that stops partway prints FAIL with where it stopped.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
const PORT = 4324, BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(250); }
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9341', `--user-data-dir=${tmpdir()}/arc-entry-${Date.now()}`, '--no-first-run', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9341/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.slice(0, 200)); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? undefined : r.result.result.value; };
const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await sleep(100); } return null; };
const out = {}, fails = [];
const check = (name, ok, detail) => { out[name] = { ok, ...detail }; if (!ok) fails.push(name); };
// What 09 shows: where from, where to, how many steps, and whether the 3D plan drew.
const on09 = `(() => { const m = document.querySelector('main'); if (!m || !/Getting there/.test(document.body.innerText)) return null;
  const ps = [...m.querySelectorAll('p')].map(p => p.innerText);
  return { hash: location.hash, from: ps.find(t => t.startsWith('From ')) ?? null, to: ps.find(t => t.startsWith('to ')) ?? null,
    steps: m.querySelectorAll('ol[aria-label=Steps] li').length, frames: Number(document.querySelector('section[aria-label="Floor plan"] canvas')?.dataset.frames ?? 0) }; })()`;
const open09 = async () => { await waitFor(`(${on09})?.steps > 0`, 20000); await waitFor(`(${on09})?.frames > 0`, 20000); return ev(on09); };
const clickText = (sel, text) => ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.trim() === ${JSON.stringify(text)} || b.getAttribute('aria-label') === ${JSON.stringify(text)});
  if (!b) return 'missing'; b.click(); return 'clicked'; })()`);

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  // A plan made on this phone (as after onboarding), opened on the real clock: not a conference day.
  await send('Page.navigate', { url: BASE + '#/explore' });
  await waitFor(`document.readyState === 'complete'`);
  await ev(`localStorage.setItem('arc.device', JSON.stringify({ version: 1, edition: 'chi2026', mode: 'plan', step: 'summary', builtAt: Date.now(),
    plan: { query: 'sensemaking with AI', topicsFor: 'sensemaking with AI', topics: [{ conceptId: 'topic:sensemaking', label: 'Sensemaking', on: true }], nearbyAdded: [],
      days: ['2026-04-13','2026-04-14','2026-04-15','2026-04-16','2026-04-17'],
      needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers', 'posters', 'demos'], howFull: 'balanced' } }))`);
  await send('Page.navigate', { url: BASE + '?plan#/today' }); // another URL: a real load with the plan
  await waitFor(`document.querySelectorAll('main li button[aria-label^="Change "]').length > 1`, 30000);
  out.today = { topCard: await ev(`!!document.querySelector('a[href^="#/directions/"]') && !document.querySelector('li a[href^="#/directions/"]')`), rows: await ev(`document.querySelectorAll('main li button[aria-label^="Change "]').length`) };

  // Day list: the second stop's ⋯ → Directions; it starts at the first stop's room.
  const rows = await ev(`[...document.querySelectorAll('main li')].filter(li => li.querySelector('button[aria-label^="Change "]')).map(li => ({ title: li.querySelector('a')?.innerText.split('\\n').at(-1), href: li.querySelector('a')?.getAttribute('href') }))`);
  await ev(`[...document.querySelectorAll('main li button[aria-label^="Change "]')][1].click()`); await sleep(300);
  const second = await clickText('main li a', 'Directions');
  const fromList = second === 'missing' ? null : await open09();
  check('day list: a stop\'s ⋯ → Directions → 09, from the stop before', !!fromList && fromList.steps > 0 && fromList.frames > 0 && !!fromList.from && fromList.from !== 'From Registration', { rows: rows?.length, fromList });
  await ev('history.back()'); await waitFor(`document.querySelectorAll('main li button[aria-label^="Change "]').length > 1`);
  await ev(`[...document.querySelectorAll('main li button[aria-label^="Change "]')][0].click()`); await sleep(300);
  const first = await clickText('main li a', 'Directions');
  const fromFirst = first === 'missing' ? null : await open09();
  check('day list: the first stop starts at Registration', fromFirst?.from === 'From Registration' && fromFirst.frames > 0, { fromFirst });

  // 06 Talk → Directions.
  const talkHref = rows?.[0]?.href;
  await ev(`location.hash = ${JSON.stringify(talkHref ?? '#/talk/none')}`); await waitFor(`/Add to my day|In your day/.test(document.body.innerText)`);
  const t = await clickText('main a', 'Directions');
  const fromTalk = t === 'missing' ? null : await open09();
  check('06 Talk → Directions → 09', !!fromTalk && fromTalk.frames > 0, { talkHref, fromTalk });

  // 05 search: a talk row's Directions, a room number, a facility.
  const search = async q => { await ev(`location.hash = '#/explore'`); await waitFor(`!!document.querySelector('input[type=search]')`);
    await ev(`(() => { const i = document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(600); };
  await search('sensemaking');
  const talkRow = await ev(`document.querySelector('main ul li a[aria-label^="Directions to "]')?.getAttribute('href') ?? null`);
  await ev(`document.querySelector('main ul li a[aria-label^="Directions to "]')?.click()`);
  const fromSearchTalk = talkRow ? await open09() : null;
  await search('127');
  const roomRow = await ev(`[...document.querySelectorAll('main a[aria-label^="Directions to "]')].map(a => a.getAttribute('aria-label') + ' ' + a.getAttribute('href'))`);
  await ev(`[...document.querySelectorAll('main a[aria-label^="Directions to "]')].find(a => /Room 127/.test(a.getAttribute('aria-label')))?.click()`);
  const fromSearchRoom = await open09().catch(() => null);
  await search('toilet');
  await ev(`[...document.querySelectorAll('main a[aria-label^="Directions to "]')].find(a => /WC/.test(a.getAttribute('aria-label')))?.click()`);
  const fromSearchWc = await open09().catch(() => null);
  check('05 search: Directions for a talk, a room number and a facility', /^#\/directions\/chi2026:/.test(talkRow ?? '') && fromSearchTalk?.frames > 0
    && /^to Room 127 · P1/.test(fromSearchRoom?.to ?? '') && /^#\/directions\/place\//.test(fromSearchRoom?.hash ?? '') && /^to WC · /.test(fromSearchWc?.to ?? ''),
    { talkRow, roomRow, fromSearchRoom, fromSearchWc });
  out.pageErrors = errors;
  if (errors.length) fails.push('page errors');
} catch (e) {
  out.stoppedAt = String(e?.message ?? e).slice(0, 300);
  fails.push(`stopped: ${out.stoppedAt}`);
} finally {
  console.log(JSON.stringify(out, null, 2));
  console.log(fails.length ? `FAIL: ${fails.join(', ')}` : 'PASS: all checks');
  ws.close(); chrome.kill(); process.kill(-server.pid);
  process.exitCode = fails.length ? 1 : 0;
}
