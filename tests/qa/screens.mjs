// Shared by tests/arc/a11y-check.mjs (Chrome) and tests/qa/webkit-check.mjs (WebKit): the Arcs and DeviceState every
// screen check starts from, the 25 screens (23 + onboarding 06b, 06c) (hash and a text that shows it is there), and page probes as plain functions
// (passed to the page as `(${fn})()`, so Chrome over CDP and Playwright run the same code).
import { buildCorpus } from '../engine/corpus.mjs';
import { buildIndex, buildArc } from '../../app/src/engine/mock-core.js';
import { encodeLink } from '../../app/src/arc/link.js';

const index = buildIndex(buildCorpus());
const opts = { angles: ['S', 'R', 'T'], days: [], types: ['Paper', 'Posters', 'Interactive Demos'] };
// Reframes with an Arc 0.2.0 kind, as the ondevice engine gives them, so the map, list and detail checks see that line too
const KINDS = ['factor', 'measure', 'people', 'subject'];
const withKinds = arc => ({ ...arc, nodes: arc.nodes.map((n, i) => (n.angle === 'R' ? { ...n, kind: KINDS[i % 4] } : n)) });
export const ARC = withKinds(buildArc(index, 'Does VR fidelity raise presence?', opts, { id: 'a11y-normal-001', createdAt: 2 }));
export const NONE = buildArc(index, 'sign language', opts, { id: 'a11y-none-0001', createdAt: 1 });
export const PEND = buildArc(index, 'privacy of smart home devices', opts, { id: 'a11y-pend-0001', createdAt: 0, mode: 'pending' });
export const CROWD = withKinds(buildArc(index, 'Does VR fidelity raise presence?', opts, { id: 'a11y-crowd-001', createdAt: 0, mode: 'crowded' }));
export const OTHER = buildArc(index, 'haptic feedback', opts, { id: 'a11y-other-001', createdAt: 0 });
export const STORED = [ARC, NONE, PEND, CROWD];
const draft = { query: 'Does VR fidelity raise presence?', topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: ['talks', 'posters', 'demos'] };
export const device = onboarded => JSON.stringify({ version: 1, edition: 'chi2026', mode: null, step: 'research', builtAt: null,
  plan: { query: '', topicsFor: null, topics: [], nearbyAdded: [], days: [], needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false }, language: 'en', see: ['papers'], howFull: 'balanced' },
  arc: { onboarded, firstChi: true, draft, holdHint: true } }); // 12a's hint seen: the probes measure the map without it
/** In the page: put Arcs in IndexedDB arc/arcs. */
export const seedArcs = arcs => `new Promise(r => { const q = indexedDB.open('arc', 1); q.onupgradeneeded = () => q.result.createObjectStore('arcs', { keyPath: 'id' });
  q.onsuccess = () => { const t = q.result.transaction('arcs', 'readwrite'); for (const a of ${JSON.stringify(arcs)}) t.objectStore('arcs').put(a); t.oncomplete = () => { q.result.close(); r(true); }; }; })`;
export const SCREENS = [['10', '#/building', 'Reading'],
  ['01', '#/start/1', 'Bring one question'], ['02', '#/start/2', 'The biggest week'], ['03', '#/start/3', '10+ talks run'], ['04', '#/start/4', 'Know what to do'],
  ['05', '#/start/5', 'Breaks are'], ['06', '#/start/6', 'three sides'], ['06b', '#/start/6b', 'same neighbourhood'], ['06c', '#/start/6c', 'Before, during'],
  ['07', '#/ask', 'What are you'], ['08', '#/angles', 'Supports'],
  ['09', '#/when', 'Build my Arc'], ['11', `#/hood/${ARC.id}`, "YOU'RE IN"], ['12', `#/arc/${ARC.id}`, 'Next ·'], ['13', `#/arc/${ARC.id}/list`, 'Reframes'],
  ['14', `#/talk/${ARC.nodes[0].key}`, 'WHY IT'], ['14f', `#/talk/${ARC.nodes[0].key}/shape`, 'Look for the same shape'], ['15', `#/arc/${ARC.id}/edit`, 'Editing'], ['16', `#/share/${ARC.id}`, 'Never your name'],
  ['17', `#/qr/${ARC.id}`, 'Scan to get'], ['18', `#/r/${encodeLink(OTHER)}`, 'Shared Arc'], ['19', `#/r/${encodeLink(OTHER)}/pick`, 'Pick what to keep'],
  ['19b', `#/r/${encodeLink(OTHER)}/yours`, 'Keep all theirs'], ['20b', '#/after', 'Export reading list'],
  ['20', '#/home', 'My Arcs'], ['23', `#/arc/${NONE.id}`, 'No clear challenge'], ['24', `#/arc/${CROWD.id}`, 'Edit'], ['25', `#/arc/${PEND.id}`, 'Sorting angles'],
];

/** Page probe: the common buttons (data-arc-button) keep their words on one line at 100% and with the text at 200%
 *  (each button's font size doubled, as Safari's text zoom does); at 200% also nothing cut off or off screen. */
export async function buttonsProbe() {
  const lines = el => { const rows = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) { if (!t.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(t);
      for (const q of r.getClientRects()) { if (q.width < 1) continue; const mid = (q.top + q.bottom) / 2; if (!rows.some(y => Math.abs(y - mid) < q.height / 2)) rows.push(mid); } }
    return rows.length; };
  const modal = document.querySelector('[role=dialog]');
  const all = [...document.querySelectorAll('[data-arc-button]')].filter(b => b.getBoundingClientRect().width > 0 && b.innerText.trim() && !b.closest('[inert]') && (!modal || modal.contains(b)));
  const name = b => b.innerText.replace(/\s+/g, ' ').trim().slice(0, 30);
  const bad = [];
  for (const b of all) { const n = lines(b); if (n > 1) bad.push({ el: name(b), zoom: 100, lines: n }); }
  const was = all.map(b => b.style.fontSize);
  all.forEach(b => { b.style.fontSize = (parseFloat(getComputedStyle(b).fontSize) * 2) + 'px'; });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  for (const b of all) { const n = lines(b), r = b.getBoundingClientRect();
    const cut = b.scrollWidth > b.clientWidth + 1, off = r.right > innerWidth + 1 || r.left < -1;
    if (n > 1 || cut || off) bad.push({ el: name(b), zoom: 200, lines: n, cut, off }); }
  all.forEach((b, i) => { b.style.fontSize = was[i]; });
  return { checked: all.length, bad };
}

/** Page probe: does the page scroll sideways? */
export function widthProbe() {
  return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth };
}
