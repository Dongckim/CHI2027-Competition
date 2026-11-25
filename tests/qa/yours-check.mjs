// 19b · Make it yours and 20b · After CHI (approved by the user):
//   18 → Make it mine → 19b: a node toggles kept ⇄ outline (aria-pressed), Keep all theirs, + adds a "Yours" talk, the
//     question can be changed (added words underlined), Save is disabled until one is kept, Save stores only the kept talks
//     as a new Arc of my own (IndexedDB) and opens 12
//   20 after CHI (?at= after the last day) → Your CHI → 20b: heard / to read / questions match the seeded data, Still open
//     names the Arc without a Challenge, Export gives the .txt and .bib that arc/afterChi.js makes from the programme
// npm run build && node tests/qa/yours-check.mjs [--shots <dir>]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, reporter, sleep, CHROME } from './cdp.mjs';
import { ARC, NONE, OTHER, device, seedArcs } from './screens.mjs';
import { encodeLink } from '../../app/src/arc/link.js';
import { toReadKeys, stillOpen, readingTxt, readingBib } from '../../app/src/arc/afterChi.js';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const R = reporter('yours');
const server = await startServer(4920);
const readArcs = `new Promise(r => { const q = indexedDB.open('arc', 1); q.onsuccess = () => { const g = q.result.transaction('arcs').objectStore('arcs').getAll(); g.onsuccess = () => { q.result.close(); r(g.result); }; }; })`;
const HEARD = ARC.nodes.slice(0, 3).map(n => n.key);
const withHeard = () => { const d = JSON.parse(device(true)); d.arc.heard = HEARD; return JSON.stringify(d); };
// The floor on screen px (scaled maps included: size × rendered / layout width): text ≥ 12, every control ≥ 44 × 44 (or a
// full-width row ≥ 44 high), nothing sideways. Contrast is a11y-check's (not measured here).
const floorProbe = () => {
  const seen = el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && !el.closest('[inert],[aria-hidden=true] svg'); };
  const small = [], tiny = [];
  for (const el of document.querySelectorAll('main *, header *, .sticky *')) {
    if (!seen(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const k = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1; // offsetWidth is whole px: ±0.1
    const px = parseFloat(getComputedStyle(el).fontSize) * k;
    if (px < 11.8) small.push(`${el.textContent.trim().slice(0, 20)} ${px.toFixed(1)}`);
  }
  for (const el of document.querySelectorAll('button, a[href], input')) {
    if (!seen(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) tiny.push(`${(el.getAttribute('aria-label') ?? el.innerText).trim().slice(0, 20)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  return { small, tiny, sideways: document.documentElement.scrollWidth > innerWidth };
};
const floor = async (p, name) => { const f = await p.evaluate(floorProbe); R.check(`${name}: text ≥ 12 px, controls ≥ 44 px, no sideways scroll`, !f.small.length && !f.tiny.length && !f.sideways, f); };

let browser, code = 1;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--force-prefers-reduced-motion'] });
  { // 19b
    const ctx = await browser.newContext({ reducedMotion: 'reduce',  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const p = await ctx.newPage();
    await p.goto(`${server.base}#/start/1`);
    await p.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
    await p.evaluate(seedArcs([]));
    const payload = encodeLink(OTHER);
    await p.goto(`${server.base}#/r/${payload}`);
    await p.getByRole('button', { name: 'Make it mine' }).click();
    await p.waitForFunction(() => /stay as outlines/.test(document.body.innerText), null, { timeout: 20000 });
    R.check('18 Make it mine → 19b (#/r/<payload>/yours)', p.url().endsWith(`#/r/${payload}/yours`), { url: p.url().slice(-40) });
    if (shots) await p.screenshot({ path: join(shots, '19b-outlines.png') });
    await floor(p, '19b');
    const nodes = p.locator('main button[aria-pressed][aria-description$=" · Keep"]');
    const save = p.getByRole('button', { name: 'Save as my Arc' });
    R.check('19b: their stops all start as outlines, Save disabled with a reason', (await p.locator('main button[aria-pressed="true"]').count()) === 0 && await save.isDisabled()
      && /Keep at least one stop to save/.test(await p.locator('#yours-why').innerText()), {});
    const first = nodes.first();
    await first.click(); const on = await first.getAttribute('aria-pressed');
    await first.click(); const off = await first.getAttribute('aria-pressed');
    R.check('19b: a node toggles kept ⇄ outline (aria-pressed)', on === 'true' && off === 'false', { on, off });
    // keep every talk from the list (the map shows three per region), then one back to an outline
    const listed = p.locator('section[aria-label="All talks"] button[aria-pressed]');
    await listed.evaluateAll(b => b.filter(x => x.getAttribute('aria-pressed') === 'false').forEach(x => x.click()));
    const allOn = await listed.evaluateAll(b => b.every(x => x.getAttribute('aria-pressed') === 'true'));
    R.check('19b: every talk can be kept from the list (beyond the three a region shows)', allOn && (await listed.count()) === OTHER.nodes.length && await save.isEnabled(), { listed: await listed.count() });
    await first.click(); // one back to an outline
    await p.getByRole('button', { name: 'Add a talk to Challenges' }).click();
    // search: a found talk goes to the angle the engine judges (user 11/25 「A로 하고」; the mock puts "haptic" titles under
    // Reframes), so it may sit beyond the three a region shows: its "Yours" is then in the All talks list
    await p.getByRole('searchbox', { name: 'Search talks' }).fill('haptic');
    const card = p.locator('section[aria-label=Swap] button[aria-label^="Add to "]:not([disabled])').first();
    await card.waitFor({ timeout: 20000 });
    await card.click();
    await p.waitForFunction(() => [...document.querySelectorAll('main span')].some(s => /(^| · )Yours$/.test(s.textContent)));
    const yoursKept = await p.locator('main button[aria-pressed="true"][aria-description*="Yours"]').count()
      + await p.locator('section[aria-label="All talks"] button[aria-pressed="true"]', { hasText: '· Yours' }).count();
    R.check('19b: + adds a talk with a "Yours" badge, kept', yoursKept >= 1, { yoursKept });
    await p.locator('main h1 button').click();
    await p.getByRole('textbox', { name: 'Your question' }).fill(`${OTHER.query} in social VR`);
    await p.keyboard.press('Enter');
    const under = await p.locator('main h1 .underline').innerText().catch(() => '');
    R.check('19b: the edited question underlines the added words', under === 'in social VR', { under });
    if (shots) await p.screenshot({ path: join(shots, '19b-kept.png') });
    await save.click();
    await p.waitForFunction(() => /^#\/arc\/[^/]+$/.test(location.hash), null, { timeout: 10000 });
    const stored = await p.evaluate(readArcs);
    const mine = stored.find(a => p.url().endsWith(a.id)) ?? stored[0];
    const theirKept = OTHER.nodes.filter(n => !mine.nodes.some(m => m.key === n.key)).length;
    R.check('19b Save: one new Arc of my own, their talks minus the outlined one, plus the added one, edited question; opens 12',
      stored.length === 1 && mine.source === 'mine' && mine.id !== OTHER.id && mine.nodes.length === OTHER.nodes.length && theirKept === 1
      && mine.query === `${OTHER.query} in social VR` && p.url().endsWith(`#/arc/${mine.id}`),
      { stored: stored.length, source: mine.source, nodes: mine.nodes.length, theirKept, query: mine.query });
    await ctx.close();
  }
  { // 19b Keep all theirs: their Arc as it is, to My Arcs (prototype 11/23 → 20)
    const ctx = await browser.newContext({ reducedMotion: 'reduce',  viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
    await p.goto(`${server.base}#/start/1`);
    await p.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
    await p.evaluate(seedArcs([]));
    await p.goto(`${server.base}#/r/${encodeLink(OTHER)}/yours`);
    await p.getByRole('button', { name: 'Keep all theirs' }).click();
    await p.waitForFunction(() => location.hash === '#/home', null, { timeout: 10000 }).catch(() => {});
    const stored = await p.evaluate(readArcs);
    R.check('19b Keep all theirs: their whole Arc saved, then My Arcs', p.url().endsWith('#/home') && stored.length === 1 && stored[0].nodes.length === OTHER.nodes.length, { url: p.url().slice(-12), stored: stored.length });
    await ctx.close();
  }
  { // 20b
    const ctx = await browser.newContext({ reducedMotion: 'reduce',  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true }); const p = await ctx.newPage();
    const base = `${server.base}?at=2026-04-18T12:00`;
    await p.goto(`${base}#/start/1`);
    await p.evaluate(`localStorage.setItem('arc.device', ${JSON.stringify(withHeard())}); true`);
    await p.evaluate(seedArcs([ARC, NONE]));
    await p.goto(`${base}#/home`);
    await p.reload(); // a hash change keeps the page: read the seeded DeviceState (heard) again
    await p.getByRole('link', { name: 'Your CHI' }).click();
    await p.waitForFunction(() => /in 2 questions/.test(document.body.innerText), null, { timeout: 20000 });
    const arcs = [ARC, NONE]; // newest first, as the store lists them (createdAt 2, 1)
    const toRead = toReadKeys(arcs, new Set(HEARD));
    const stats = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('main .grid p + p')].map(x => [x.textContent, Number(x.previousElementSibling.textContent)])));
    R.check('20b numbers: heard, to read, questions match the seeded data', stats.heard === HEARD.length && stats['to read'] === toRead.length && stats.questions === 2, { stats, expect: [HEARD.length, toRead.length, 2] });
    const open = await p.locator('main button', { hasText: 'Still open' }).innerText();
    R.check('20b Still open names the Arc without a Challenge', open.includes(`“${stillOpen(arcs).query}” has no challenge yet.`), { open });
    if (shots) await p.screenshot({ path: join(shots, '20b-after-chi.png') });
    await floor(p, '20b');
    await p.getByRole('button', { name: 'Export reading list' }).click();
    // what the files must be: the same module on the built programme
    const dir = 'data/build/app-data/chi2026/' + JSON.parse(readFileSync('data/build/app-data/chi2026/current.json', 'utf8')).path;
    const sched = JSON.parse(readFileSync(join(dir, 'schedule.json'), 'utf8')), people = JSON.parse(readFileSync(join(dir, 'people.json'), 'utf8'));
    const papers = new Map(sched.papers.map(x => [x.paperKey, x]));
    const items = toRead.map(k => ({ key: k, title: papers.get(k).title, authors: papers.get(k).authors.map(a => people[a]?.name).filter(Boolean), doi: papers.get(k).doi }));
    const got = async name => { const [d] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name }).click()]); return { file: d.suggestedFilename(), text: readFileSync(await d.path(), 'utf8') }; };
    const txt = await got('Text (.txt)'), bib = await got('BibTeX (.bib)');
    R.check('20b Export .txt = readingTxt of the to-read talks', txt.file === 'chi2026-reading-list.txt' && txt.text === readingTxt(items), { file: txt.file, bytes: txt.text.length });
    R.check('20b Export .bib = readingBib of the to-read talks', bib.file === 'chi2026-reading-list.bib' && bib.text === readingBib(items, 'chi2026')
      && (bib.text.match(/@inproceedings\{/g) ?? []).length === toRead.length, { file: bib.file, entries: (bib.text.match(/@inproceedings\{/g) ?? []).length });
    if (shots) await p.screenshot({ path: join(shots, '20b-export.png') });
    await ctx.close();
  }
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message.split('\n')[0]}`);
  R.done();
} finally {
  await browser?.close(); server.stop();
  process.exit(code);
}
