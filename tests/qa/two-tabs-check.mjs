// Two tabs at once (QA 1): same origin, same profile. Tab B marks a talk heard (14) and edits Arc X (15, removes one
// talk); tab A meanwhile types a question and builds a new Arc. A's "Build my Arc" and B's "Done" are pressed together.
// Both tabs are reloaded; then the stored Arcs (IndexedDB arc/arcs) and DeviceState (localStorage arc.device) must hold
// everything: Arc X with the talk removed, the new Arc, nothing else lost, and the heard talk still heard.
// This check reports; it does not fix (user, QA task).
// npm run build && node --experimental-websocket tests/qa/two-tabs-check.mjs
import { buildCorpus } from '../engine/corpus.mjs';
import { buildIndex, buildArc } from '../../app/src/engine/mock-core.js';
import { startServer, launchChrome, phone, reporter, sleep } from './cdp.mjs';

const AT = '2026-04-17T20:00'; // last day, evening: every talk has started, so 14 offers "I heard it"
const index = buildIndex(buildCorpus());
const opts = { angles: ['S', 'R', 'T'], days: [], types: [] };
const X = buildArc(index, 'Does VR fidelity raise presence?', opts, { id: 'twotab-x-0001', createdAt: 2 });
const Y = buildArc(index, 'haptic feedback', opts, { id: 'twotab-y-0001', createdAt: 1 });
const HEARD = X.nodes[0].key, REMOVED = X.nodes[1].key;
const draft = { query: '', topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: ['talks', 'posters', 'demos'] };
const device = JSON.stringify({ version: 1, edition: 'chi2026', mode: null, step: 'research', builtAt: null,
  plan: { query: '', topicsFor: null, topics: [], nearbyAdded: [], days: [], needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers'], howFull: 'balanced' },
  arc: { onboarded: true, firstChi: false, draft, heard: [] } });
const R = reporter('two-tabs');
const server = await startServer(4361);
const chrome = await launchChrome();
const click = (tab, text) => tab.ev(`(() => { const b = [...document.querySelectorAll('button, a')].find(b => b.innerText.trim() === ${JSON.stringify(text)} || b.getAttribute('aria-label') === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);
const stored = tab => tab.ev(`new Promise(r => { const q = indexedDB.open('arc', 1); q.onsuccess = () => { const g = q.result.transaction('arcs').objectStore('arcs').getAll();
  g.onsuccess = () => { const out = g.result.map(a => ({ id: a.id, query: a.query, keys: a.nodes.map(n => n.key) })); q.result.close(); r(out); }; }; q.onerror = () => r(null); })`);
const heardNow = tab => tab.ev(`(JSON.parse(localStorage.getItem('arc.device') ?? '{}').arc?.heard ?? [])`);
let code = 1;
try {
  const A = await chrome.first();
  await phone(A, { cpu: 2 });
  await A.send('Page.navigate', { url: `${server.base}?at=${AT}#/start/1` });
  await A.waitFor(`document.readyState === 'complete'`);
  await A.ev(`localStorage.setItem('arc.device', ${JSON.stringify(device)}); true`);
  await A.ev(`new Promise(r => { const q = indexedDB.open('arc', 1); q.onupgradeneeded = () => q.result.createObjectStore('arcs', { keyPath: 'id' });
    q.onsuccess = () => { const t = q.result.transaction('arcs', 'readwrite'); for (const a of ${JSON.stringify([X, Y])}) t.objectStore('arcs').put(a); t.oncomplete = () => { q.result.close(); r(true); }; }; })`);

  // both tabs open with the same stored state
  await A.send('Page.navigate', { url: `${server.base}?at=${AT}#/ask` });
  const B = await chrome.openTab();
  await phone(B, { cpu: 2 });
  await B.send('Page.navigate', { url: `${server.base}?at=${AT}#/talk/${HEARD}` });
  const aReady = await A.waitFor(`location.hash === '#/ask' && !!document.querySelector('main textarea')`);
  const bReady = await B.waitFor(`/I heard it/.test(document.body.innerText)`);
  R.check('both tabs open (A on 07, B on 14 with "I heard it")', aReady != null && bReady != null, { aReady, bReady });

  // B: heard → stored
  await click(B, 'I heard it');
  const heardB = await B.waitFor(`(JSON.parse(localStorage.getItem('arc.device')).arc.heard ?? []).includes(${JSON.stringify(HEARD)})`, 5000);
  R.check('B: "I heard it" is written to DeviceState', heardB != null, {});

  // A: types a question (A's DeviceState was read before B's heard)
  await A.ev(`(() => { const i = document.querySelector('main textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(i, 'children learning with robots');
    i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(400);
  const afterTyping = await heardNow(A);
  R.check('after A types, B\'s heard talk is still in DeviceState', afterTyping?.includes(HEARD), { heard: afterTyping,
    why: afterTyping?.includes(HEARD) ? undefined : 'tab A wrote its whole DeviceState (read before B marked heard) back to localStorage' });

  // B: to 15, remove one talk. A: to 09.
  await B.ev(`location.hash = '#/arc/${X.id}/edit'; true`);
  await B.waitFor(`/Editing/.test(document.body.innerText) && !!document.querySelector('button[aria-label^="Remove "]')`);
  const removeLabel = await B.ev(`[...document.querySelectorAll('button[aria-label^="Remove "]')].map(b => b.getAttribute('aria-label'))[1] ?? null`);
  await B.ev(`[...document.querySelectorAll('button[aria-label^="Remove "]')][1].click(), true`);
  await A.waitFor(`/Find my angles/.test(document.body.innerText) && !document.querySelector('button[disabled]')?.innerText.includes('Find my angles')`, 15000);
  await click(A, 'Find my angles');
  await A.waitFor(`location.hash === '#/when' && /Build my Arc/.test(document.body.innerText)`, 15000);

  // together
  const [a, b] = await Promise.all([click(A, 'Build my Arc'), click(B, 'Done')]);
  const built = await A.waitFor(`location.hash.startsWith('#/hood/')`, 40000);
  const saved = await B.waitFor(`location.hash === '#/arc/${X.id}'`, 15000);
  const screenA = built == null ? await A.ev(`location.hash + ' | ' + document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160)`) : undefined;
  R.check('A built its Arc and B saved its edit, pressed together', a && b && built != null && saved != null, { clickedA: a, clickedB: b, built, saved, screenA });
  await sleep(1500);

  // reload both, then read what is stored
  await A.send('Page.reload'); await B.send('Page.reload');
  await A.waitFor(`document.readyState === 'complete'`); await B.waitFor(`document.readyState === 'complete'`);
  await sleep(1500);
  const arcs = await stored(A), heard = await heardNow(B);
  const x = arcs?.find(r => r.id === X.id), y = arcs?.find(r => r.id === Y.id), made = arcs?.filter(r => r.id !== X.id && r.id !== Y.id) ?? [];
  R.check('after reload: 3 Arcs (X, Y and the new one)', arcs?.length === 3 && !!x && !!y && made.length === 1, { stored: arcs?.map(r => `${r.id}:${r.keys.length}`) });
  R.check('Arc X kept B\'s edit (one talk fewer, the removed one gone)', !!x && x.keys.length === X.nodes.length - 1 && !x.keys.includes(REMOVED), { before: X.nodes.length, after: x?.keys.length });
  R.check('Arc Y untouched', !!y && JSON.stringify(y.keys) === JSON.stringify(Y.nodes.map(n => n.key)), {});
  R.check('the new Arc is A\'s question', made[0]?.query === 'children learning with robots', { query: made[0]?.query });
  R.check('the heard talk is still heard after both tabs wrote', heard?.includes(HEARD), { heard,
    repro: heard?.includes(HEARD) ? undefined : '1) open 07 in tab A  2) open 14 of a started talk in tab B, tap "I heard it"  3) type in A  4) reload: heard is gone' });
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message}`);
  R.done();
} finally {
  await chrome.close(); server.stop();
  process.exit(code);
}
