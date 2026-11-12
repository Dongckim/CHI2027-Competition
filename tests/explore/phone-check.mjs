// Phone check of S4 (Explore, Filters, No results, Talk detail, Author) in headless Chrome: 390x844, CPU slowed 4x.
// npm run build && npx vite preview --port 4317 &   then   node --experimental-websocket tests/explore/phone-check.mjs [screenshot dir]
// Prints timings (input → rendered results) and checks; screenshots go to the given dir (default: os tmpdir).
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const OUT = (process.argv[2] ?? tmpdir()).replace(/\/?$/, '/');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4317/';
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${OUT}arc-chrome-${Date.now()}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); break; } catch { await sleep(250); } }
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}${name}.png`, Buffer.from(r.result.data, 'base64')); };
// catch: the page may be between loads (no body yet)
const waitFor = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(50); } throw new Error('timeout: ' + expr); };

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
const result = {};

// 05 Explore, from a fresh phone (no plan): the magnifier route works without onboarding.
await send('Page.navigate', { url: BASE + '#/explore' });
await waitFor(`!!document.querySelector('input[type=search]')`);
let t0 = Date.now();
await waitFor(`!document.body.innerText.includes('Loading the programme')`, 30000);
result.dataReadyMs = Date.now() - t0;
// Typing "CMU": time from the input event to the rendered results (CPU 4x slower).
result.cmuMs = await ev(`new Promise(res => {
  const input = document.querySelector('input[type=search]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const t = performance.now();
  set.call(input, 'CMU'); input.dispatchEvent(new Event('input', { bubbles: true }));
  const check = () => document.body.innerText.includes('includes people at Carnegie Mellon') ? res(Math.round(performance.now() - t)) : requestAnimationFrame(check);
  check();
})`);
result.cmu = await ev(`({ tabs: [...document.querySelectorAll('[aria-label=Show] button')].map(b => b.innerText.replace(/\\s+/g, ' ')),
  first: [...document.querySelectorAll('main li a')].slice(0, 3).map(a => a.innerText.replace(/\\n/g, ' | ')) })`);
await shot('05-explore-cmu');
// Every keystroke of another query, slowed CPU.
result.typingMs = await ev(`(async () => {
  const input = document.querySelector('input[type=search]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const out = [];
  for (const q of ['s', 'se', 'sen', 'sens', 'sense', 'sensem', 'sensemaking']) {
    const t = performance.now();
    set.call(input, q); input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    out.push(Math.round(performance.now() - t));
  }
  return out;
})()`);
await sleep(300);
result.sensemaking = await ev(`[...document.querySelectorAll('[aria-label=Show] button')].map(b => b.innerText.replace(/\\s+/g, ' '))`);

// 04 Filters: Institution "CMU" → Carnegie Mellon, Show n results; then 05 No results with an impossible query.
await send('Page.navigate', { url: BASE + '#/explore/filters' });
await waitFor(`!!document.querySelector('#place')`);
await sleep(500);
await ev(`(() => { const i = document.querySelector('#place'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'CMU'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(400);
result.filters = await ev(`({ choices: [...document.querySelectorAll('[role=radiogroup] label')].map(l => l.innerText.replace(/\\n/g, ' | ') + (l.querySelector('input').checked ? ' [x]' : '')), button: document.querySelector('.fixed button').innerText })`);
await shot('04-filters-cmu');
await ev(`document.querySelector('.fixed button').click()`);
await waitFor(`location.hash === '#/explore' && document.body.innerText.includes('Filters · 1')`);
await sleep(300);
result.afterFilter = await ev(`[...document.querySelectorAll('[aria-label=Show] button')].map(b => b.innerText.replace(/\\s+/g, ' '))`);
await ev(`(() => { const i = document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'zzzzqq'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(400);
result.noResults = await ev(`document.querySelector('main').innerText.includes('No matches') && !!document.querySelector('main button.underline')`);
await shot('05-no-results');
await ev(`[...document.querySelectorAll('main button')].find(b => b.innerText === 'Clear filters').click()`);
await sleep(300);
result.cleared = await ev(`!document.body.innerText.includes('Filters ·')`);

// 06 Talk detail on the sample day (contract example response): the highlight must be the abstract's own characters.
await send('Page.navigate', { url: BASE + '#/sample' });
await waitFor(`document.body.innerText.includes('Preview')`, 30000);
const example = JSON.parse(readFileSync(new URL('../../contracts/examples/RecommendResponse.chi2026-tuesday.json', import.meta.url)));
const item = example.items.find(i => i.reasons.length);
await send('Page.navigate', { url: BASE + '#/talk/' + item.paperKey });
await waitFor(`document.body.innerText.includes('Why for you')`, 30000);
result.talk = await ev(`({ marks: [...document.querySelectorAll('mark')].map(m => m.textContent), text: document.querySelector('main').innerText.split('\\n').slice(0, 9), fullAbstract: document.querySelector('main section:last-of-type p').textContent })`);
result.talk.expectedQuotes = item.reasons.map(r => r.quote);
result.talk.highlightMatchesQuotes = JSON.stringify(result.talk.marks) === JSON.stringify([...item.reasons].sort((a, b) => a.start - b.start).map(r => r.quote));
result.talk.abstractContainsMarksAtOffsets = item.reasons.every(r => result.talk.fullAbstract.slice(r.start, r.end) === r.quote);
delete result.talk.fullAbstract;
await shot('06-talk');
// 07 Author: first author link
await ev(`document.querySelector('main a[href^="#/person/"]').click()`);
await waitFor(`document.body.innerText.includes('Their talks')`);
result.person = await ev(`document.querySelector('main').innerText.split('\\n').slice(0, 8)`);
await shot('07-author');
// ?simulate=room-change: the sample day shows "Programme updated"; Today with a built plan ignores it.
await send('Page.navigate', { url: BASE + '?simulate=room-change#/sample' });
await waitFor(`document.body.innerText.includes('Preview')`, 30000);
result.simulateSample = await waitFor(`document.body.innerText.includes('Programme updated')`, 10000).then(() => true, () => false);
await ev(`(() => { const s = JSON.parse(localStorage.getItem('arc.device') ?? 'null'); const days = ['2026-04-13','2026-04-14','2026-04-15','2026-04-16','2026-04-17'];
  localStorage.setItem('arc.device', JSON.stringify({ version: 1, edition: 'chi2026', mode: 'plan', step: 'summary', builtAt: Date.now(),
    plan: { query: 'sensemaking with AI', topicsFor: 'sensemaking with AI', topics: [{ conceptId: 'topic:sensemaking', label: 'Sensemaking', on: true }], nearbyAdded: [], days,
      needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers', 'posters', 'demos'], howFull: 'balanced' } })); })()`);
await send('Page.navigate', { url: BASE + '?simulate=room-change&plan#/today' }); // another URL: a real load with the plan
await waitFor(`document.body.innerText.includes('Your ') || document.body.innerText.includes('Nothing planned')`, 30000);
await sleep(1500);
result.simulatePlanIgnored = await ev(`!document.body.innerText.includes('Programme updated') && !document.body.innerText.includes('Preview')`);
await ev(`localStorage.removeItem('arc.device')`);
console.log(JSON.stringify(result, null, 2));
ws.close(); chrome.kill();
