// WebKit (Safari's engine) check, the core only (user: "WebKit에서는 핵심만"): an iPhone 14 (Playwright device, touch).
// Chrome draws Inter narrower, so a label can fit in Chrome and break on an iPhone (V8: "+ New / Arc"). Here:
//   1 no sideways scroll on every screen in screens.mjs at 390, 375 and 360 (16 also while its cards are swiped)
//   2 button words on one line at 100% and 200% text (tests/qa/screens.mjs buttonsProbe, as Chrome's a11y-check)
//   3 real touches: Skip on 01, 03, 05, 06 (centre and ±20 px) goes home; 05 Code of Conduct gets the touch
//   4 01 → 12 → 14 on an empty phone
// Needs the WebKit browser once: npx playwright install webkit (Playwright 1.49.1, devDependency; not on Vercel).
// npm run build && node tests/qa/webkit-check.mjs
import { webkit, devices } from 'playwright';
import { startServer, reporter, sleep } from './cdp.mjs';
import { STORED, device, SCREENS, seedArcs, buttonsProbe, widthProbe } from './screens.mjs';

const R = reporter('webkit');
const AT = 'at=2026-04-14T12:00';
const server = await startServer(4385);
let browser, code = 1;
try {
  browser = await webkit.launch();
  const ctx = await browser.newContext({ reducedMotion: 'reduce',  ...devices['iPhone 14'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const text = t => page.waitForFunction(x => document.body.innerText.includes(x), t, { timeout: 30000 }).then(() => true, () => false);
  await page.goto(`${server.base}?${AT}#/start/1`);
  await page.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
  await page.evaluate(seedArcs(STORED));

  // 1 + 2: every screen
  const wide = [], wrap = [];
  for (const [name, hash, want] of SCREENS) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.base}?${AT}${name === '10' ? '&mock=slow' : ''}&s=${name}${hash}`);
    if (!(await text(want))) { wide.push({ screen: name, error: `did not show "${want}"` }); continue; }
    await sleep(name === '10' ? 200 : 500);
    const b = await page.evaluate(`(${buttonsProbe})()`);
    for (const x of b.bad) wrap.push({ screen: name, ...x });
    if (name === '10') continue; // gone after 5 s; it has no buttons
    for (const [w, h] of [390, 375, 360].flatMap(w => [[w, 844], [w, 664]])) { // 664: Safari with its toolbars (11/22)
      await page.setViewportSize({ width: w, height: h });
      await sleep(250);
      for (const f of name === '16' ? [0, 0.5, 1] : [null]) {
        if (f != null) { await page.evaluate(x => { const s = document.querySelector('[aria-label="What people see"]'); if (s) s.scrollLeft = (s.scrollWidth - s.clientWidth) * x; }, f); await sleep(150); }
        const m = await page.evaluate(`(${widthProbe})()`);
        if (m.sw > m.cw || m.bw > m.cw) wide.push({ screen: name, width: w, height: h, swipe: f, ...m });
      }
    }
  }
  R.check(`${SCREENS.length} screens at 390/375/360 × 844/664: no sideways scroll (16 also mid-swipe)`, wide.length === 0, wide.length ? { wide: wide.slice(0, 6) } : {});
  R.check('buttons: words on one line at 100% and 200% text', wrap.length === 0, wrap.length ? { wrap: wrap.slice(0, 6) } : {});
  await page.setViewportSize({ width: 390, height: 844 });

  // 3: real touches
  for (const n of ['1', '3', '5', '6']) {
    const missed = [];
    for (const [dx, dy] of [[0, 0], [0, -20], [0, 20], [-20, 0], [20, 0]]) {
      await page.goto(`${server.base}?${AT}#/start/${n}`);
      const skip = page.locator('a, button').filter({ hasText: /^Skip$/ }).first();
      await skip.waitFor({ timeout: 20000 });
      const r = await skip.boundingBox();
      await page.touchscreen.tap(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy);
      const home = await page.waitForFunction(() => location.hash === '#/home', null, { timeout: 4000 }).then(() => true, () => false);
      if (!home) missed.push(`${dx},${dy}`);
    }
    R.check(`0${n}: a touch on Skip (centre and ±20 px) goes home`, missed.length === 0, missed.length ? { missed } : {});
  }
  await page.goto(`${server.base}?${AT}#/start/5`);
  const coc = page.locator('a').filter({ hasText: 'Code of Conduct' }).first();
  await coc.waitFor({ timeout: 20000 });
  await page.evaluate(() => { window.__pressed = null; document.addEventListener('click', e => { const a = e.target.closest('a'); window.__pressed = a ? a.innerText.trim() : e.target.tagName; e.preventDefault(); }, true); });
  const c = await coc.boundingBox();
  await page.touchscreen.tap(c.x + c.width / 2, c.y + c.height / 2);
  await sleep(500);
  const got = await page.evaluate(() => window.__pressed);
  R.check('05: a touch on Code of Conduct reaches the link', typeof got === 'string' && got.startsWith('Code of Conduct'), { got });

  // 4: an empty phone, 01 → 12 → 14
  const fresh = await browser.newContext({ reducedMotion: 'reduce',  ...devices['iPhone 14'], viewport: { width: 390, height: 844 } });
  const p = await fresh.newPage();
  const tap = async loc => { const r = await loc.boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); };
  const at = async (fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  await p.goto(`${server.base}#/start/1`);
  const steps = {};
  steps.welcome = await at(() => /Bring one question/.test(document.body.innerText));
  await tap(p.locator('a, button').filter({ hasText: /^Skip$/ }).first());
  steps.home = await at(() => location.hash === '#/home' && /Start with one question/.test(document.body.innerText));
  await tap(p.locator('a').filter({ hasText: 'New Arc' }).last());
  steps.paper = await at(() => location.hash === '#/paper' && /No paper/.test(document.body.innerText)); // 07p (Figma 11/25)
  await tap(p.locator('a').filter({ hasText: 'No paper? Start from a question' }).first());
  steps.ask = await at(() => location.hash === '#/ask' && !!document.querySelector('main input'));
  await p.locator('main input').fill('haptic feedback');
  await at(() => [...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Find my angles' && !b.disabled));
  await tap(p.locator('button').filter({ hasText: 'Find my angles' }));
  steps.angles = await at(() => location.hash === '#/angles' && document.querySelectorAll('main section button[aria-pressed]').length >= 2);
  await tap(p.locator('a, button').filter({ hasText: /^Next$/ }).first());
  steps.when = await at(() => location.hash === '#/when' && /Build my Arc/.test(document.body.innerText));
  await tap(p.locator('button').filter({ hasText: 'Build my Arc' }));
  steps.hood = await at(() => location.hash.startsWith('#/hood/') && /See my Arc/.test(document.body.innerText), null, 40000);
  await tap(p.locator('a, button').filter({ hasText: 'See my Arc' }).first());
  steps.map = await at(() => location.hash.startsWith('#/arc/') && document.querySelectorAll('main button[aria-description]').length >= 3);
  await tap(p.locator('main button[aria-description]').first()); // 12c: picks the stop, a second tap opens 14
  await sleep(300);
  await tap(p.locator('main button[aria-description]').first());
  steps.talk = await at(() => location.hash.startsWith('#/talk/') && /WHY IT/.test(document.body.innerText));
  const failed = Object.entries(steps).filter(([, ok]) => !ok).map(([k]) => k);
  R.check('01 → 12 → 14 on an empty phone (touches)', failed.length === 0, failed.length ? { stopped: failed[0], steps } : {});
  await fresh.close();
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message.split('\n')[0]}`);
  R.done();
} finally {
  await browser?.close(); server.stop();
  process.exit(code);
}
