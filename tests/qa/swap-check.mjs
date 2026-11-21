// 12b hold a stop · swap and 07b make it a question (approved 11/21), in Chrome at 390 × 844 with touch:
//   12b: a 0.5 s hold (pointer events) fans out 3 choices; letting go on one swaps it and IndexedDB changes; "Swapped ·
//        Undo" puts it back; a short tap still opens 14; the keyboard "Swap" button opens the same choices, Escape
//        closes, Enter on a choice swaps
//   07b: "VR presence" shows the note, question cards and "Keep 'VR presence' as a topic", which goes on to 08 with it
// npm run build && node tests/qa/swap-check.mjs [--shots <dir>]
import { chromium } from 'playwright';
import { startServer, reporter, sleep, CHROME } from './cdp.mjs';
import { ARC, device, seedArcs } from './screens.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const R = reporter('swap');
const server = await startServer(4901);
const R_NODE = ARC.nodes.find(n => n.angle === 'R'); // tests/qa/screens.mjs: its Reframes have 3 more (engine.suggest)
const stored = p => p.evaluate(id => new Promise(r => { const q = indexedDB.open('arc', 1);
  q.onsuccess = () => { const g = q.result.transaction('arcs').objectStore('arcs').get(id); g.onsuccess = () => { q.result.close(); r(g.result.nodes.map(n => n.key)); }; }; }), ARC.id);
const centre = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
// pointer events as a finger sends them: down on the node, (hold), moves and up still go to the node (implicit capture)
const fire = (p, type, sel, [x, y]) => p.evaluate(([type, sel, x, y]) => document.querySelector(sel).dispatchEvent(new PointerEvent(type,
  { bubbles: true, cancelable: true, composed: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 })), [type, sel, x, y]);
const shot = async (p, name) => shots && p.screenshot({ path: `${shots}/${name}.png` });
let ch, code = 1;
try {
  ch = await chromium.launch({ executablePath: CHROME });
  const ctx = await ch.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(`${server.base}#/start/1`);
  await p.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
  await p.evaluate(seedArcs([ARC]));
  const node = `[data-node-key="${R_NODE.key}"]`;
  const openMap = async () => { await p.goto(`${server.base}#/arc/${ARC.id}`); await p.waitForSelector(node); await sleep(400); };

  await openMap();
  await p.locator(node).click();
  R.check('a short tap on a node still opens 14', await p.waitForFunction(k => location.hash === `#/talk/${k}`, R_NODE.key, { timeout: 5000 }).then(() => true, () => false), {});

  await openMap();
  const at = await centre(p, node);
  await fire(p, 'pointerdown', node, at);
  await sleep(250);
  const early = await p.locator('[data-swap-fan]').count();
  await sleep(400);
  const fanned = await p.waitForFunction(() => document.querySelectorAll('[data-swap-key]').length === 3, null, { timeout: 5000 }).then(() => true, () => false);
  const hint = await p.locator('[data-swap-fan] p').last().innerText().catch(() => '');
  R.check('hold 0.5 s: 3 choices fan out (none at 0.25 s)', early === 0 && fanned, { early, fanned });
  R.check('hint says the angle', hint === 'Release on a talk to swap. All three keep this Reframe.', { hint });
  await sleep(300); // the cards rise in (0.18 s, 40 ms apart)
  await shot(p, '12b-fan');
  const before = await stored(p);
  const pick = await p.locator('[data-swap-key]').nth(1).getAttribute('data-swap-key');
  const onCard = await centre(p, `[data-swap-key="${pick}"]`);
  await fire(p, 'pointermove', node, onCard);
  await fire(p, 'pointerup', node, onCard);
  await sleep(400);
  const after = await stored(p);
  R.check('let go on a choice: swapped in IndexedDB, same place', after.includes(pick) && !after.includes(R_NODE.key) && after.indexOf(pick) === before.indexOf(R_NODE.key), { before, after });
  const status = await p.locator('[role=status]').filter({ hasText: 'Swapped' }).innerText().catch(() => '');
  const undoBox = await p.getByRole('button', { name: 'Undo' }).boundingBox();
  R.check('"Swapped · Undo" in a status region, Undo 44 px', /Swapped ·\s*Undo/.test(status) && undoBox?.height >= 44 && undoBox?.width >= 44, { status, undoBox });
  R.check('the hold did not open 14: still on 12',await p.evaluate(() => location.hash) === `#/arc/${ARC.id}`, {});
  await shot(p, '12b-undo');
  await p.getByRole('button', { name: 'Undo' }).click();
  await sleep(400);
  const undone = await stored(p);
  R.check('Undo puts the old talk back', JSON.stringify(undone) === JSON.stringify(before), { undone });

  // let go off the cards: closes, nothing changes
  await openMap();
  await fire(p, 'pointerdown', node, await centre(p, node));
  await p.waitForFunction(() => document.querySelectorAll('[data-swap-key]').length === 3, null, { timeout: 5000 });
  await fire(p, 'pointerup', node, [195, 300]);
  await sleep(300);
  R.check('let go elsewhere: closes, Arc unchanged', (await p.locator('[data-swap-fan]').count()) === 0 && JSON.stringify(await stored(p)) === JSON.stringify(before), {});

  // keyboard: the node's Swap button
  await openMap();
  const swapBtn = p.getByRole('button', { name: `Swap ${await p.locator(node).evaluate(b => b.querySelector('.line-clamp-1, .line-clamp-2').textContent.replace(/^✦ /, ''))}` });
  await swapBtn.focus();
  await p.keyboard.press('Enter');
  const kbFan = await p.waitForFunction(() => document.querySelectorAll('[data-swap-key]').length === 3 && document.activeElement?.hasAttribute('data-swap-key'), null, { timeout: 5000 }).then(() => true, () => false);
  R.check('keyboard: Swap opens the 3 choices as buttons, focus on the first', kbFan, {});
  await sleep(300);
  await shot(p, '12b-keyboard');
  await p.keyboard.press('Escape');
  await sleep(200);
  R.check('Escape closes', (await p.locator('[data-swap-fan]').count()) === 0, {});
  await swapBtn.focus(); await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.activeElement?.hasAttribute('data-swap-key'), null, { timeout: 5000 });
  const kbPick = await p.evaluate(() => document.activeElement.getAttribute('data-swap-key'));
  await p.keyboard.press('Enter');
  await sleep(400);
  const kbAfter = await stored(p);
  R.check('keyboard: Enter on a choice swaps it', kbAfter.includes(kbPick) && !kbAfter.includes(R_NODE.key), { kbPick });
  await p.getByRole('button', { name: 'Undo' }).click(); await sleep(300);

  // 07b
  await p.goto(`${server.base}#/ask`);
  await p.locator('input').fill('VR presence');
  const note = await p.waitForFunction(() => /That’s a topic\. \d+ talks? match/.test(document.body.innerText), null, { timeout: 10000 }).then(() => true, () => false);
  await sleep(300);
  const cards = await p.locator('ul[aria-labelledby="topic-note"] button').allInnerTexts();
  const keep = p.getByRole('button', { name: 'Keep ‘VR presence’ as a topic' });
  R.check('07b: "VR presence" shows the note, 1–3 question cards with counts, and Keep', note && cards.length >= 1 && cards.length <= 3 && cards.every(t => /\?/.test(t) && /↑ \d+\s+↻ \d+\s+⊣ \d+/.test(t)) && (await keep.count()) === 1, { note, cards });
  await shot(p, '07b');
  await p.locator('input').fill('VR presence?');
  await sleep(800);
  R.check('07b: a question hides it', (await p.locator('#topic-note').count()) === 0, {});
  await p.locator('input').fill('VR presence');
  await keep.waitFor({ timeout: 10000 });
  await keep.click();
  const toAngles = await p.waitForFunction(() => location.hash === '#/angles', null, { timeout: 5000 }).then(() => true, () => false);
  const query = await p.evaluate(() => JSON.parse(localStorage.getItem('arc.device')).arc.draft.query);
  R.check('07b: Keep goes on to 08 with the topic unchanged', toAngles && query === 'VR presence', { toAngles, query });
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message.split('\n')[0]}`);
  R.done();
} finally {
  await ch?.close(); server.stop();
  process.exit(code);
}
