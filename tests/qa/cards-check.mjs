// 16 cards (user 11/20 「16 카드 넘기기: 점 클릭, 화살표 키, WebKit 터치 스와이프」): the strip of two cards (Arc picture,
// link preview) must move by
//   WebKit, iPhone 14 (touch): a tap on the dot buttons, the arrow keys, a swipe that starts on the picture card (inert);
//     with reduced motion the move is immediate
//   desktop Chrome (mouse): a drag on the cards and the ‹ › buttons beside them
// Swipes and drags are pointer events, which the page handles itself (touch-action: pan-y on the strip).
// npm run build && node tests/qa/cards-check.mjs
import { webkit, chromium, devices } from 'playwright';
import { startServer, reporter, sleep, CHROME } from './cdp.mjs';
import { ARC, device, seedArcs } from './screens.mjs';

const R = reporter('cards');
const server = await startServer(4395);
const at = p => p.evaluate(() => { const s = document.querySelector('[aria-label="What people see"]'); return Math.round(s.scrollLeft / 312); });
const settled = async p => { await sleep(700); return at(p); };
async function open(browser, opts) {
  const ctx = await browser.newContext(opts); const p = await ctx.newPage();
  await p.goto(`${server.base}#/start/1`);
  await p.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
  await p.evaluate(seedArcs([ARC]));
  await p.goto(`${server.base}#/share/${ARC.id}`);
  await p.waitForFunction(() => /Never your name/.test(document.body.innerText));
  await sleep(600);
  return { ctx, p };
}
// a swipe as pointer events (what a finger or a mouse sends); from x0 to x1 on the strip at height y
const swipe = (p, x0, x1, y, pointerType) => p.evaluate(([x0, x1, y, pointerType]) => {
  const target = document.elementFromPoint(x0, y);
  const fire = (type, x) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType, isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
  fire('pointerdown', x0); for (let i = 1; i <= 6; i++) fire('pointermove', x0 + ((x1 - x0) * i) / 6); fire('pointerup', x1);
  const fig = target.closest('figure');
  return fig && fig === document.querySelector('[aria-label="What people see"] figure') ? (target.closest('[inert]') ? 'picture card (inert part)' : 'picture card') : target.tagName;
}, [x0, x1, y, pointerType]);
let wk, ch, code = 1;
try {
  wk = await webkit.launch();
  {
    const { ctx, p } = await open(wk, { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } });
    const dot = n => p.getByRole('button', { name: `Card ${n} of 2: ${n === 1 ? 'Arc picture' : 'Link preview'}` });
    R.check('dots are buttons named "Card n of 2: …"', (await dot(1).count()) === 1 && (await dot(2).count()) === 1, {});
    const b = await dot(2).boundingBox();
    R.check('dot buttons are 44 × 44', Math.round(b.width) >= 44 && Math.round(b.height) >= 44, { size: [b.width, b.height] });
    await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    const afterDot = await settled(p);
    await p.focus('[aria-label="What people see"]'); await p.keyboard.press('ArrowLeft');
    const afterLeft = await settled(p);
    await p.keyboard.press('ArrowRight');
    const afterRight = await settled(p);
    R.check('WebKit: tap on dot 2 → card 2, ← → card 1, → → card 2', afterDot === 1 && afterLeft === 0 && afterRight === 1, { afterDot, afterLeft, afterRight });
    await p.keyboard.press('ArrowLeft'); await settled(p);
    const card = await p.locator('[aria-label="What people see"] figure').first().boundingBox();
    const hit = await swipe(p, card.x + card.width / 2 + 60, card.x + card.width / 2 - 90, card.y + 180, 'touch');
    const afterSwipe = await settled(p);
    await swipe(p, 120, 300, card.y + 180, 'touch');
    const back = await settled(p);
    R.check('WebKit: a touch swipe that starts on the picture card moves to card 2 and back', hit.startsWith('picture card') && afterSwipe === 1 && back === 0, { startedOn: hit, afterSwipe, back });
    await ctx.close();
  }
  {
    const { ctx, p } = await open(wk, { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const b = await p.getByRole('button', { name: 'Card 2 of 2: Link preview' }).boundingBox();
    await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await sleep(60);
    R.check('WebKit, reduced motion: the dot moves at once (no smooth scroll)', (await at(p)) === 1, {});
    await ctx.close();
  }
  ch = await chromium.launch({ executablePath: CHROME });
  {
    const { ctx, p } = await open(ch, { viewport: { width: 1280, height: 900 } });
    const next = p.getByRole('button', { name: 'Next card' }), prev = p.getByRole('button', { name: 'Previous card' });
    const seen = await next.isVisible() && await prev.isVisible();
    await next.click(); const afterNext = await settled(p);
    await prev.click(); const afterPrev = await settled(p);
    R.check('desktop: ‹ › beside the cards move them', seen && afterNext === 1 && afterPrev === 0, { seen, afterNext, afterPrev });
    const card = await p.locator('[aria-label="What people see"] figure').first().boundingBox();
    await p.mouse.move(card.x + card.width / 2 + 80, card.y + 200); await p.mouse.down();
    await p.mouse.move(card.x + card.width / 2 - 100, card.y + 200, { steps: 8 }); await p.mouse.up();
    R.check('desktop: a mouse drag on the cards moves to card 2', (await settled(p)) === 1, {});
    await ctx.close();
  }
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message.split('\n')[0]}`);
  R.done();
} finally {
  await wk?.close(); await ch?.close(); server.stop();
  process.exit(code);
}
