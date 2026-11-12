// Everything ARC keeps about a person, on the phone only (CLAUDE.md: personal data stays on the device, one DeviceState).
// Pure functions: the storage object is passed in, so tests use a fake. App wiring is in useDevice.ts.
// Internal format, version 1. Not a contract yet (contracts/DeviceState is still being designed).

export const STORAGE_KEY = 'arc.device';
export const VERSION = 1;

// Onboarding: four questions, then the summary. `step` is saved so a reopened app continues where it stopped.
export const STEPS = ['research', 'topics', 'days', 'needs', 'summary'];

// What to see → feed content types (papers.json `type`). Meet-ups and mentoring are not offered.
export const KINDS = {
  papers: ['Paper', 'Journals'],
  posters: ['Posters', 'Student Research Competition'],
  demos: ['Interactive Demos'],
  panels: ['Panels'],
  keynotes: ['Plenary and Keynote', 'SIGCHI Awards'],
  workshops: ['Workshop'],
};
export const REGISTRATION_NEEDED = ['workshops'];
export const HOW_FULL = { light: 4, balanced: 6, full: 8 }; // about this many stops a day

/** @typedef {{ conceptId: string, label: string, on: boolean, custom?: boolean }} Topic */
/** @typedef {{ stepFree: boolean, fewerRoomChanges: boolean, breaks: boolean, largerText: boolean, summaries: boolean }} Needs */
/** @typedef {{ version: number, edition: string, mode: null | 'plan' | 'browse', step: string, builtAt: number | null,
 *   plan: { query: string, topicsFor: string | null, topics: Topic[], nearbyAdded: { conceptId: string, label: string }[],
 *     days: string[], needs: Needs, language: string, see: string[], howFull: string } }} DeviceState */

/** @param {{ edition: string, days?: string[], language?: string }} defaults @returns {DeviceState} */
export function freshState({ edition, days = [], language = 'en' }) {
  return {
    version: VERSION,
    edition,
    mode: null, // 'plan' once built, 'browse' after "Just browse"
    step: 'research',
    builtAt: null,
    plan: {
      query: '',
      topicsFor: null, // the query the topic list was made for; a new sentence resets the list
      topics: [], // [{ conceptId, label, on, custom? }] snapshot from RecommendResponse.topics (+ own additions)
      nearbyAdded: [], // [{ conceptId, label }] from RecommendResponse.nearby
      days, // venue-local YYYY-MM-DD
      needs: { stepFree: false, fewerRoomChanges: false, breaks: false, largerText: false, summaries: false },
      language, // code from app/src/captions/soniox-languages.json
      see: ['papers', 'posters', 'demos'],
      howFull: 'balanced',
    },
  };
}

const isStringArray = a => Array.isArray(a) && a.every(x => typeof x === 'string');
function isState(s, edition) {
  const p = s?.plan;
  return s?.version === VERSION && s.edition === edition && STEPS.includes(s.step) && p && typeof p.query === 'string'
    && Array.isArray(p.topics) && Array.isArray(p.nearbyAdded) && isStringArray(p.days) && isStringArray(p.see)
    && p.needs && typeof p.needs === 'object' && p.howFull in HOW_FULL && typeof p.language === 'string';
}

// → { state, note }. note: 'saved' | 'none' (nothing stored, e.g. first visit or the browser cleared it)
//   | 'unreadable' (broken JSON or an old/other-edition format: start over) | 'unavailable' (storage throws, e.g. blocked)
/** @returns {{ state: DeviceState, note: 'saved' | 'none' | 'unreadable' | 'unavailable' }} */
export function readState(storage, defaults) {
  let text;
  try { text = storage.getItem(STORAGE_KEY); } catch { return { state: freshState(defaults), note: 'unavailable' }; }
  if (text == null) return { state: freshState(defaults), note: 'none' };
  try {
    const s = JSON.parse(text);
    if (isState(s, defaults.edition)) return { state: s, note: 'saved' };
  } catch {}
  return { state: freshState(defaults), note: 'unreadable' };
}

// → true when saved. A full or blocked storage returns false; the app keeps working from memory.
export function writeState(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

// Where the app opens: a built plan → Today, "Just browse" → Explore, otherwise the onboarding step it stopped at.
export function startRoute(state) {
  if (state.builtAt) return 'today';
  if (state.mode === 'browse') return 'explore';
  return `start/${state.step}`;
}

const withPlan = (state, change) => ({ ...state, plan: { ...state.plan, ...change } });

export const setQuery = (state, query) => withPlan(state, { query });

// Topic list for the current sentence, all on. Kept as is when the sentence did not change (going back and forth).
export function topicsFromResponse(state, response) {
  if (state.plan.topicsFor === state.plan.query && state.plan.topics.length) return state;
  return withPlan(state, {
    topicsFor: state.plan.query,
    topics: response.topics.map(({ conceptId, label }) => ({ conceptId, label, on: true })),
    nearbyAdded: [],
  });
}

export const toggleTopic = (state, conceptId) =>
  withPlan(state, { topics: state.plan.topics.map(t => (t.conceptId === conceptId ? { ...t, on: !t.on } : t)) });

export function addOwnTopic(state, label) {
  const text = label.trim();
  const conceptId = `custom:${text.toLowerCase()}`;
  if (!text || state.plan.topics.some(t => t.conceptId === conceptId)) return state;
  return withPlan(state, { topics: [...state.plan.topics, { conceptId, label: text, on: true, custom: true }] });
}

export function toggleNearby(state, { conceptId, label }) {
  const has = state.plan.nearbyAdded.some(n => n.conceptId === conceptId);
  return withPlan(state, { nearbyAdded: has ? state.plan.nearbyAdded.filter(n => n.conceptId !== conceptId) : [...state.plan.nearbyAdded, { conceptId, label }] });
}

const toggleIn = (list, x) => (list.includes(x) ? list.filter(y => y !== x) : [...list, x]);
export const toggleDay = (state, day) => withPlan(state, { days: toggleIn(state.plan.days, day).sort() });
export const toggleKind = (state, kind) => withPlan(state, { see: Object.keys(KINDS).filter(k => (k === kind) !== state.plan.see.includes(k)) });
/** @type {(state: DeviceState, need: keyof Needs) => DeviceState} */
export const toggleNeed = (state, need) => withPlan(state, { needs: { ...state.plan.needs, [need]: !state.plan.needs[need] } });
export const setLanguage = (state, language) => withPlan(state, { language });
export const setHowFull = (state, howFull) => withPlan(state, { howFull });
export const atStep = (state, step) => (state.builtAt || state.step === step ? state : { ...state, step });

// Recommendations the plan allows: only kinds the person wants to see, and not items whose only matching topics were switched off.
export function candidatesFor(response, plan) {
  const off = new Set(plan.topics.filter(t => !t.on).map(t => t.conceptId));
  const on = new Set([...plan.topics.filter(t => t.on).map(t => t.conceptId), ...plan.nearbyAdded.map(n => n.conceptId)]);
  const types = new Set(plan.see.flatMap(k => KINDS[k] ?? []));
  return response.items
    .filter(it => types.has(it.feedType))
    .filter(it => !(it.concepts.some(c => off.has(c)) && !it.concepts.some(c => on.has(c))))
    .map(({ paperKey, relevance }) => ({ paperKey, relevance }));
}

// How full: keep the N most valuable stops of a planned day, in time order. Dropping a stop only adds slack between the rest.
// shortcut: travelFromPrevMin is not recomputed after dropping; pass the limit into planDay when Today shows walking times.
export function limitStops(day, n) {
  if (day.stops.length <= n) return day;
  const keep = new Set([...day.stops].sort((a, b) => b.value - a.value || a.start - b.start).slice(0, n).map(s => s.paperKey));
  return { ...day, stops: day.stops.filter(s => keep.has(s.paperKey)), conflicts: day.conflicts.filter(c => keep.has(c.paperKey)) };
}
