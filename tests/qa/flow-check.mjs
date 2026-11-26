// Every screen leads where the final prototype does (ARC_prototype, 11/23, its LINKS table), so no screen is left
// floating: each row opens a screen, presses one thing as a person would, and checks the screen it lands on. Rows the
// app has no screen for are left out on purpose (user 11/21 「빼기: 14c, 14d, 14h, Web · Discussion spots」, translation
// 14g, Print badge). A second part runs with motion ON: the map's bloom (12), 24b's move and 01's orbit must end with
// every part visible, where the still layout has it.
//   npm run build && node tests/qa/flow-check.mjs
import { chromium } from 'playwright';
import { startServer, reporter, CHROME, sleep } from './cdp.mjs';
import { STORED, ARC, CROWD, OTHER, PERSON, device, seedArcs } from './screens.mjs';
import { readFileSync } from 'node:fs';
import { encodeLink } from '../../app/src/arc/link.js';

const R = reporter('flow');
const server = await startServer(4398);
const AT = '?at=2026-04-14T12:00';
const P = encodeLink(OTHER);
const fresh = JSON.stringify({ ...JSON.parse(device(false)) });
let browser, code = 1;
// [screen, start hash, what to press (role + name, or a CSS selector), where it must land (hash pattern), device]
const ROWS = [
  ['01', '#/start/1', ['button', "It's my first CHI"], /^#\/start\/2$/, fresh],
  ['01', '#/start/1', ['button', "I've been before"], /^#\/start\/6$/, fresh],
  ['02', '#/start/2', ['link', 'Next'], /^#\/start\/3$/, fresh],
  ['05', '#/start/5', ['link', 'Next'], /^#\/start\/6$/, fresh],
  ['06', '#/start/6', ['link', 'Next'], /^#\/start\/6b$/, fresh],
  ['06c', '#/start/6c', ['link', 'Next'], /^#\/paper$/, fresh], // Figma 11/25: 07p
  ['07p', '#/paper', ['link', 'No paper? Start from a question'], /^#\/ask$/, fresh],
  ['03', '#/start/3', ['link', 'Skip'], /^#\/home$/, fresh],
  ['08', '#/angles', ['link', 'Back'], /^#\/ask$/],
  ['09', '#/when', ['link', 'Back'], /^#\/angles$/],
  ['12', `#/arc/${ARC.id}`, ['link', 'List'], new RegExp(`^#/arc/${ARC.id}/list$`)],
  ['12', `#/arc/${ARC.id}`, ['link', 'Edit'], new RegExp(`^#/arc/${ARC.id}/edit$`)],
  ['12', `#/arc/${ARC.id}`, ['link', 'Share'], new RegExp(`^#/share/${ARC.id}$`)],
  ['12', `#/arc/${ARC.id}`, ['link', 'Back'], /^#\/home$/],
  ['12', `#/arc/${ARC.id}`, '[aria-description^="Next up:"], [aria-description^="Now:"]', /^#\/talk\//],
  ['12', `#/arc/${ARC.id}`, 'main button[aria-label^="All "]', new RegExp(`^#/arc/${ARC.id}/[SRT]$`)],
  ['24', `#/arc/${CROWD.id}`, 'main button[aria-label$=" Reframes"]', new RegExp(`^#/arc/${CROWD.id}/R$`)],
  ['24b', `#/arc/${CROWD.id}/R`, ['link', 'Back'], new RegExp(`^#/arc/${CROWD.id}$`)],
  ['24b', `#/arc/${CROWD.id}/R`, ['button', 'See all three angles'], new RegExp(`^#/arc/${CROWD.id}$`)],
  ['24b', `#/arc/${CROWD.id}/R`, 'main button[aria-label^="All "]', new RegExp(`^#/arc/${CROWD.id}/[ST]$`)],
  ['13', `#/arc/${ARC.id}/list`, ['link', 'Map'], new RegExp(`^#/arc/${ARC.id}$`)],
  ['13', `#/arc/${ARC.id}/list`, ['link', 'Edit'], new RegExp(`^#/arc/${ARC.id}/edit$`)],
  ['15', `#/arc/${ARC.id}/edit`, ['button', 'Done'], new RegExp(`^#/arc/${ARC.id}$`)],
  ['16', `#/share/${ARC.id}`, ['link', 'QR code'], new RegExp(`^#/qr/${ARC.id}$`)],
  ['18', `#/r/${P}`, ['button', 'Pick some'], /\/pick$/],
  ['18', `#/r/${P}`, ['button', 'Make it mine'], /\/yours$/],
  ['18', `#/r/${P}`, ['button', 'Just read'], /\/read$/],
  ['18', `#/r/${P}`, ['button', 'Add to my Arcs'], /^#\/arc\/[^/]+$/],
  ['19', `#/r/${P}/pick`, ['link', 'Back'], new RegExp(`^#/r/${P}$`)],
  ['19', `#/r/${P}/pick`, ['button', /^Add \d+ to my Arcs$/], /^#\/home$/],
  ['19b', `#/r/${P}/yours`, ['button', 'Keep all theirs'], /^#\/home$/],
  ['20', '#/home', ['link', 'New Arc'], /^#\/ask$/], // user 11/26: New Arc → 07
  ['07', '#/ask', ['link', 'Start from my paper'], /^#\/paper$/],
  ['20', '#/home', `a[href$="#/arc/${ARC.id}"]`, new RegExp(`^#/arc/${ARC.id}$`)],
];

async function page(dev) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${server.base}#/start/1`);
  await p.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(dev ?? device(true))}); true`);
  await p.evaluate(seedArcs(STORED));
  return { ctx, p };
}
const target = (p, what) => (typeof what === 'string' ? p.locator(what).first() : p.getByRole(what[0], { name: what[1], exact: typeof what[1] === 'string' }).first());

try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--force-prefers-reduced-motion'] });
  const bad = [];
  for (const [screen, start, what, land, dev] of ROWS) {
    const { ctx, p } = await page(dev);
    try {
      await p.goto(`${server.base}${AT}${start}`);
      const t = target(p, what);
      await t.waitFor({ timeout: 20000 });
      await sleep(200);
      await t.click();
      const ok = await p.waitForFunction(re => new RegExp(re).test(location.hash), land.source, { timeout: 10000 }).then(() => true, () => false);
      if (!ok) bad.push({ screen, press: String(what), want: String(land), got: await p.evaluate(() => location.hash) });
    } catch (e) { bad.push({ screen, press: String(what), error: e.message.split('\n')[0] }); }
    await ctx.close();
  }
  R.check(`every link of the prototype lands where it should (${ROWS.length} rows)`, bad.length === 0, bad.length ? { bad } : {});

  { // 12 · 12c: a tap on another stop shows it in the card, a second opens 14; 12a's hint shows once
    const first = JSON.parse(device(true)); delete first.arc.holdHint;
    const { ctx, p } = await page(JSON.stringify(first));
    await p.goto(`${server.base}${AT}#/arc/${ARC.id}`);
    const hint = await p.waitForFunction(() => /Hold a stop/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true, () => false);
    const other = p.locator('main [data-node-key]').filter({ hasNot: p.locator('.arc-node-next') }).first();
    const key = await other.getAttribute('data-node-key');
    await other.click();
    const gone = !(await p.evaluate(() => /Hold a stop/.test(document.body.innerText)));
    const card = await p.waitForFunction(k => [...document.querySelectorAll('a[href*="talk/"]')].some(a => a.getAttribute('href').endsWith(k)), key, { timeout: 5000 }).then(() => true, () => false);
    await other.click();
    const opened = await p.waitForFunction(k => location.hash === `#/talk/${k}`, key, { timeout: 8000 }).then(() => true, () => false);
    await p.goto(`${server.base}${AT}#/arc/${ARC.id}`);
    await p.waitForSelector('main [data-node-key]');
    const again = await p.evaluate(() => /Hold a stop/.test(document.body.innerText));
    R.check('12a hint once, gone at the first touch; 12c: a tap shows the stop in the card, a second opens 14', hint && gone && card && opened && !again, { hint, gone, card, opened, again });
    await ctx.close();
  }

  { // 07p → 07r → 08 (Figma 11/25): find the name, see the paper and its question, Build → 08 with the person's talks kept out
    const cur = JSON.parse(readFileSync(new URL('../../data/build/app-data/chi2026/current.json', import.meta.url)));
    const name = JSON.parse(readFileSync(new URL(`../../data/build/app-data/chi2026/${cur.path}people.json`, import.meta.url)))[PERSON].name;
    const { ctx, p } = await page(fresh);
    await p.goto(`${server.base}${AT}#/paper`);
    await p.locator('main input').fill(name);
    const row = p.locator(`a[href$="#/paper/${PERSON}"]`).first();
    const listed = await row.waitFor({ timeout: 20000 }).then(() => true, () => false);
    if (listed) await row.click();
    const confirm = await p.waitForFunction(() => /Is this/.test(document.body.innerText) && !/Reading your paper/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true, () => false);
    if (confirm) await p.getByRole('button', { name: 'Build my Arc from this paper' }).click();
    const angles = await p.waitForFunction(() => location.hash === '#/angles', null, { timeout: 10000 }).then(() => true, () => false);
    const draft = await p.evaluate(() => JSON.parse(localStorage.getItem('arc.device') ?? '{}').arc?.draft ?? {});
    R.check('07p finds the author, 07r shows the paper and its question, Build → 08 with their talks kept out', listed && confirm && angles && !!draft.query && draft.mine?.length > 0, { name, listed, confirm, angles, query: draft.query, mine: draft.mine?.length });
    await ctx.close();
  }

  // motion on: what each animation leaves must be what the still screen shows
  const settle = p => p.waitForFunction(() => document.getAnimations().every(a => a.effect?.getTiming().iterations === Infinity || a.playState === 'finished'), null, { timeout: 15000 }).then(() => true, () => false);
  const look = p => p.evaluate(() => [...document.querySelectorAll('main [data-node-key], main [data-badge], [data-w-shape], main h1, main li')].map(e => {
    const r = e.getBoundingClientRect(); let o = 1; for (let x = e; x; x = x.parentElement) o *= Number(getComputedStyle(x).opacity);
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(o * 100)];
  }));
  const diffs = [];
  for (const hash of [`#/arc/${ARC.id}`, `#/arc/${CROWD.id}/R`, '#/start/1', '#/start/6', '#/home']) {
    const out = [];
    for (const motion of ['reduce', 'no-preference']) {
      const ctx = await browser.newContext({ reducedMotion: motion, viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage();
      await p.goto(`${server.base}#/start/1`);
      await p.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
      await p.evaluate(seedArcs(STORED));
      await p.goto(`${server.base}${AT}${hash}`);
      await p.waitForFunction(h => (h.startsWith('#/arc/') ? !!document.querySelector('main [data-node-key]') : !!document.querySelector('.arc main')), hash, { timeout: 20000 });
      await sleep(motion === 'reduce' ? 1500 : 600);
      const settled = motion === 'reduce' ? true : await settle(p);
      await sleep(300);
      out.push({ settled, parts: await look(p) });
      await ctx.close();
    }
    const [still, moved] = out;
    const off = moved.parts.filter((m, i) => !still.parts[i] || Math.abs(m[0] - still.parts[i][0]) > 2 || Math.abs(m[1] - still.parts[i][1]) > 2 || m[3] < 95);
    if (!moved.settled || still.parts.length !== moved.parts.length || (hash !== '#/start/1' && off.length)) diffs.push({ hash, settled: moved.settled, parts: [still.parts.length, moved.parts.length], off: off.slice(0, 4) });
  }
  // 01's neighbourhoods keep drifting round the ring after the orbit, so only that all are there and visible counts
  R.check('motion on: the map bloom (12), 24b, 01, 06 and 20 end where the still screen is, every part visible', diffs.length === 0, diffs.length ? { diffs } : {});
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message.split('\n')[0]}`);
  R.done();
} finally {
  await browser?.close(); server.stop();
  process.exit(code);
}
