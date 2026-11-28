// Desktop frame (user 11/28): at 1440×900 and 1280×720 with a mouse, the app sits in a 390×844 phone frame (an iframe of
// the same page, scaled to fit), nothing leaves the frame or the window, the address follows the frame, and the QR is there.
// npm run build && node tests/qa/desktop-check.mjs
import { chromium } from 'playwright';
import { startServer, reporter, sleep, CHROME } from './cdp.mjs';
import { ARC, device, seedArcs } from './screens.mjs';

const R = reporter('desktop');
const server = await startServer(4419);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-prefers-reduced-motion'] });
let code = 1;
try {
  for (const [w, h] of [[1440, 900], [1280, 720]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' }); // a mouse: hover, fine pointer
    const p = await ctx.newPage();
    await p.goto(`${server.base}#/start/1`);
    await p.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
    await p.evaluate(seedArcs([ARC]));
    await p.goto(`${server.base}#/arc/${ARC.id}`);
    const f = p.frameLocator('iframe[title="ARC on a phone"]');
    await f.locator('[data-arc-map]').waitFor({ timeout: 20000 });
    await sleep(800);
    const out = await p.evaluate(() => {
      const r = document.querySelector('[data-phone-frame]').getBoundingClientRect();
      const doc = document.querySelector('iframe').contentDocument, d = doc.documentElement;
      // shown outside the 390 width: not decorative (the map's region art bleeds on purpose) and not cut off by a box (a truncated line)
      const clipped = e => { for (let x = e.parentElement; x && x !== doc.body; x = x.parentElement) if (/hidden|clip|auto|scroll/.test(getComputedStyle(x).overflowX)) return true; return false; };
      const wide = [...doc.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.left < -1 || b.right > 391) && !e.closest('[aria-hidden=true]') && !clipped(e); }).map(e => e.tagName + ' ' + e.textContent.slice(0, 30));
      return { frame: [r.left, r.top, r.right, r.bottom].map(Math.round), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        pageScroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
        frameW: doc.defaultView.innerWidth, frameH: doc.defaultView.innerHeight, frameScroll: d.scrollWidth > 390, wide, qr: !!document.querySelector('svg[aria-label^="QR code"]') };
    });
    R.check(`${w}×${h}: the app in a 390×844 frame inside the window, nothing outside it, a QR beside it`,
      out.inside && !out.pageScroll && out.frameW === 390 && out.frameH === 844 && !out.frameScroll && out.wide.length === 0 && out.qr, out);
    // the address follows the frame: open the list inside, the page's hash says so
    await f.locator('a[href$="/list"]').first().click();
    const followed = await p.waitForFunction(id => location.hash === `#/arc/${id}/list`, ARC.id, { timeout: 5000 }).then(() => true, () => false);
    R.check(`${w}×${h}: the address follows the frame`, followed, { hash: await p.evaluate(() => location.hash) });
    await ctx.close();
  }
  // a phone-sized window or a touch screen keeps the app itself
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); await p.goto(`${server.base}#/start/1`); await sleep(800);
  R.check('phone: no frame', (await p.locator('iframe[title="ARC on a phone"]').count()) === 0, {});
  await ctx.close();
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message.split('\n')[0]}`);
  R.done();
} finally { await browser.close(); server.stop(); process.exit(code); }
