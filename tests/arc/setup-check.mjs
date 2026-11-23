// 10 while the on-device model is still coming (user 11/21): WebKit, iPhone 14.
//   slow model  → "Sorting angles… N%" with N going up, then 11 → 12
//   no network  → "Connect to the internet to finish setting up ARC." + Try again, the question kept; network back,
//                 Try again → 11
//   no progress → the same message after 30 s (a model file that never answers)
// Needs a build with the ondevice engine and its model:
//   VITE_ENGINE=ondevice npm run build && MODEL_URL=… MODEL_SHA256=… node app/scripts/fetch-model.mjs
//   node tests/arc/setup-check.mjs
import { existsSync } from 'node:fs';
import { webkit, devices } from 'playwright';
import { startServer, reporter, sleep } from '../qa/cdp.mjs';
import { device } from '../qa/screens.mjs';

if (!existsSync(new URL('../../dist/model.json', import.meta.url))) { console.log('setup: no dist/model.json, skipped'); process.exit(0); }
const R = reporter('setup');
const server = await startServer(4396);
const Q = 'Does VR fidelity raise presence?';
const status = p => p.evaluate(() => document.querySelector('[role="status"]')?.innerText ?? '');
let wk, code = 1;
async function open(route) {
  const ctx = await wk.newContext({ reducedMotion: 'reduce',  ...devices['iPhone 14'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(`${server.base}#/start/1`);
  await p.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
  await p.route('**/model/**', route);
  await p.goto(`${server.base}?at=2026-04-14T10:00#/building`);
  return { ctx, p };
}
try {
  wk = await webkit.launch();
  { // slow: every model file 400 ms late
    const { ctx, p } = await open(async r => { await sleep(400); await r.continue(); });
    const seen = new Set();
    let hood = false;
    for (let i = 0; i < 150 && !hood; i++) {
      const s = await status(p);
      const m = s.match(/Sorting angles… (\d+)%/);
      if (m) seen.add(Number(m[1]));
      hood = (await p.evaluate(() => location.hash)).startsWith('#/hood/');
      await sleep(100);
    }
    const pcts = [...seen].sort((a, b) => a - b);
    R.check('slow model: 10 shows "Sorting angles… N%" going up', pcts.length >= 2 && pcts.at(-1) > pcts[0], { pcts: pcts.slice(0, 12) });
    R.check('slow model: then 11', hood, {});
    await ctx.close();
  }
  { // no network for the model, then back
    let offline = true;
    const { ctx, p } = await open(r => (offline ? r.abort('internetdisconnected') : r.continue()));
    const msg = 'Connect to the internet to finish setting up ARC.';
    let s = '';
    for (let i = 0; i < 100 && !s.includes(msg); i++) { s = await status(p); await sleep(100); }
    const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('arc.device')).arc.draft.query);
    const retry = p.getByRole('button', { name: 'Try again' });
    R.check('no network: the message and Try again, the question kept', s.includes(msg) && (await retry.count()) === 1 && kept === Q, { status: s, kept });
    offline = false;
    await retry.click();
    let hood = false;
    for (let i = 0; i < 150 && !hood; i++) { hood = (await p.evaluate(() => location.hash)).startsWith('#/hood/'); await sleep(100); }
    R.check('network back, Try again → 11', hood, {});
    await ctx.close();
  }
  { // a model file that never answers: no progress for 30 s
    const { ctx, p } = await open(r => (r.request().url().includes('angles.json') ? new Promise(() => {}) : r.continue()));
    const t = Date.now();
    let s = '';
    while (Date.now() - t < 45000 && !s.includes('Connect to the internet')) { s = await status(p); await sleep(250); }
    const after = Math.round((Date.now() - t) / 1000);
    R.check('no progress for 30 s: the message', s.includes('Connect to the internet') && after >= 29, { after });
    await ctx.close();
  }
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message.split('\n')[0]}`);
  R.done();
} finally {
  await wk?.close(); server.stop();
  process.exit(code);
}
