// Outside requests (QA 3). Every request of the app is recorded through CDP: the page's Network events and, through
// the browser target, those of its service worker (attached as soon as it starts, so its precache fetches count).
// Chrome's own traffic (updates, sync) is not the app's and is not seen this way. Flow: 01 → Skip → home → 07 question → 08 → 09 → 11 → 12 → 14 (a Q&A question
// posted and deleted) → 12 → 16 Share. Fail if a host is not in tests/qa/allowed-hosts.json.
// And from typing the question on 07 until 12 shows, no request (URL or body, also URL-encoded or base64) may carry the
// question: the Arc is built on the phone. Sharing and Q&A send on purpose and come after.
// npm run build && node --experimental-websocket tests/qa/requests-check.mjs
import { readFileSync } from 'node:fs';
import { startServer, launchChrome, phone, reporter, sleep } from './cdp.mjs';

const allow = JSON.parse(readFileSync(new URL('allowed-hosts.json', import.meta.url), 'utf8'));
const allowed = h => allow.hosts.includes(h) || allow.suffixes.some(s => h.endsWith(s));
const QUESTION = 'Does haptic feedback help blind users read maps?';
const encodings = [QUESTION, encodeURIComponent(QUESTION), encodeURIComponent(QUESTION).replace(/%20/g, '+'), Buffer.from(QUESTION).toString('base64'), Buffer.from(QUESTION).toString('base64url')];
const R = reporter('requests');

const server = await startServer(4365);
const chrome = await launchChrome();
const click = (tab, text) => tab.ev(`(() => { const b = [...document.querySelectorAll('button, a')].find(b => b.innerText.trim() === ${JSON.stringify(text)} || b.getAttribute('aria-label') === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);
let code = 1;
try {
  const tab = await chrome.first();
  await phone(tab, { cpu: 2 });
  await tab.send('Network.enable', { maxPostDataSize: 65536 });
  let window = false;
  const leaks = [], seen = [], hosts = new Map();
  const note = (url, who) => { try { const h = new URL(url).hostname; if (h) hosts.set(h, (hosts.get(h) ?? new Set()).add(who)); } catch {} };
  // the service worker: discover it on the browser target, attach (flatten) and enable Network
  const br = await chrome.browser();
  const ours = new Set(); // sessions of our origin's service worker (Chrome's built-in extensions have workers too)
  br.on('Target.attachedToTarget', async p => {
    if (p.targetInfo.type === 'service_worker' && p.targetInfo.url.startsWith(server.base)) { ours.add(p.sessionId); await br.send('Network.enable', {}, p.sessionId); }
    await br.send('Runtime.runIfWaitingForDebugger', {}, p.sessionId);
  });
  br.on('Network.requestWillBeSent', (p, sid) => { if (ours.has(sid)) note(p.request.url, 'service worker'); });
  await br.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'service_worker', exclude: false }, { type: 'page', exclude: true }, { exclude: true }] });
  tab.on('Network.requestWillBeSent', p => {
    const r = p.request; seen.push(r.url); note(r.url, 'page');
    if (!window) return;
    const where = [r.url, r.postData ?? ''].join('\n');
    if (encodings.some(e => where.includes(e))) leaks.push({ url: r.url.slice(0, 120), method: r.method });
  });
  await tab.send('Page.navigate', { url: `${server.base}#/start/1` });
  await tab.waitFor(`/Bring one question/.test(document.body.innerText)`);
  await click(tab, 'Skip');
  await tab.waitFor(`location.hash === '#/home' && /Start with one question/.test(document.body.innerText)`);
  await click(tab, 'New Arc');
  await tab.waitFor(`location.hash === '#/ask' && !!document.querySelector('main input')`);
  window = true; // 07 → 12: the question stays on the phone
  await tab.ev(`(() => { const i = document.querySelector('main input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(QUESTION)});
    i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await tab.waitFor(`/Ready offline/.test(document.body.innerText)`, 60000);
  await click(tab, 'Find my angles');
  await tab.waitFor(`location.hash === '#/when' && /Build my Arc/.test(document.body.innerText)`);
  await click(tab, 'Build my Arc');
  await tab.waitFor(`location.hash.startsWith('#/hood/') && /See my Arc/.test(document.body.innerText)`, 40000);
  await click(tab, 'See my Arc');
  const map = await tab.waitFor(`location.hash.startsWith('#/arc/') && document.querySelectorAll('main button[aria-description]').length >= 3`, 20000);
  await sleep(800);
  window = false;
  R.check('07 → 12 built', map != null, {});
  R.check('07 → 12: the question is in no request (URL or body, plain, URL-encoded or base64)', leaks.length === 0, { leaks: [...leaks] });
  // control: a request that does carry the question must be caught, or the check above proves nothing
  window = true;
  await tab.ev(`fetch('/api/qa?paper=chi2026:0&probe=' + encodeURIComponent(${JSON.stringify(QUESTION)}), { headers: { 'x-arc-device': 'requestscheck000000' } }).then(() => true, () => true)`);
  await sleep(500);
  window = false;
  R.check('control: a request carrying the question is detected', leaks.length === 1, { caught: leaks.length });

  // 14 and a Q&A round trip (allowed to send: it is what Q&A is)
  await tab.ev(`document.querySelector('main button[aria-description]').click(), true`); // 12c: the first tap picks the stop
  await sleep(300);
  await tab.ev(`document.querySelector('main button[aria-description]').click(), true`); // a second opens 14
  await tab.waitFor(`location.hash.startsWith('#/talk/') && !!document.querySelector('button[aria-describedby="qa-note"]')`, 20000);
  await tab.ev(`document.querySelector('button[aria-describedby="qa-note"]').click(), true`); // 11/27: the composer sheet
  await tab.waitFor(`!!document.querySelector('[role=dialog][aria-label="Ask the authors"] textarea')`, 5000);
  await tab.ev(`(() => { const i = document.querySelector('[role=dialog] textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(i, 'requests-check question');
    i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(200);
  await click(tab, 'Ask');
  const asked = await tab.waitFor(`/requests-check question/.test(document.querySelector('section[aria-labelledby=qa]').innerText)`, 15000);
  await tab.ev(`[...document.querySelectorAll('section[aria-labelledby=qa] button')].find(b => b.innerText.trim() === 'Delete')?.click(), true`);
  R.check('14: a Q&A question posted (and deleted)', asked != null, asked != null ? {} : { qa: await tab.ev(`document.querySelector('section[aria-labelledby=qa]')?.innerText.replace(/\\s+/g, ' ').slice(0, 200)`) });
  await tab.ev(`history.back(), true`);
  await tab.waitFor(`location.hash.startsWith('#/arc/')`);
  await click(tab, 'Share');
  const share = await tab.waitFor(`location.hash.startsWith('#/share/') && /Never your name/.test(document.body.innerText)`, 15000);
  R.check('16 Share opened', share != null, {});
  await sleep(1500);

  const outside = [...hosts.keys()].filter(h => !allowed(h));
  R.check('every host the page and its service worker contacted is allowed', outside.length === 0, { hosts: Object.fromEntries([...hosts].map(([h, w]) => [h, [...w]])), outside });
  R.check('the service worker was watched too (the check is not empty)', [...hosts.values()].some(w => w.has('service worker')) && seen.length > 10, { pageRequests: seen.length });
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message}`);
  R.done();
} finally {
  await chrome.close(); server.stop();
  process.exit(code);
}
