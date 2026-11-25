// The Arc part of the one DeviceState (state.arc): onboarding done, first CHI or not, and the Arc being made (07–09).
// Pure, so tests use plain objects. Kept inside arc.device (app/src/state/useDevice.ts); never sent anywhere.
// Older saved states have no `arc`: a person who had built a plan or browsed counts as onboarded.

/** 09 "What" chips → feed content types (papers.json `type`). */
export const WHAT = {
  talks: ['Paper', 'Journals'],
  posters: ['Posters', 'Student Research Competition'],
  demos: ['Interactive Demos'],
  panels: ['Panels'],
  sigs: ['Meet-Ups'],
};
export const WHAT_LABEL = { talks: 'Talks', posters: 'Posters', demos: 'Demos', panels: 'Panels', sigs: 'SIGs' };
const DEFAULT_WHAT = ['talks', 'posters', 'demos']; // Figma 09
export const QUERY_MAX = 200;

export const freshDraft = () => ({ query: '', topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: [...DEFAULT_WHAT] });
const freshArc = () => ({ onboarded: false, firstChi: null, draft: freshDraft() });

/** holdHint: 12a's "Hold a stop" hint was shown (Figma 854:2034, once). walk: 09 "How you walk", kept for every Arc (this
 * phone only, never in an Arc or a link). @returns {{ onboarded: boolean, firstChi: boolean | null, draft: ReturnType<typeof freshDraft>, holdHint?: boolean, walk?: string[] }} */
export const arcOf = state => state.arc ?? { ...freshArc(), onboarded: !!state.builtAt || state.mode === 'browse' };
const withArc = (state, change) => ({ ...state, arc: { ...arcOf(state), ...change } });
const withDraft = (state, change) => withArc(state, { draft: { ...arcOf(state).draft, ...change } });

export const setOnboarded = state => (arcOf(state).onboarded ? state : withArc(state, { onboarded: true }));
export const setFirstChi = (state, firstChi) => withArc(state, { firstChi });
/** 09 "How you walk" (user 11/23 「원준 엔진의 walk: calm / step_free를 그대로」): Calm route on until changed, as Figma 09. */
export const WALK = ['calm', 'step_free'];
export const WALK_LABEL = { calm: 'Calm route', step_free: 'Step-free' };
export const walkOf = state => arcOf(state).walk ?? ['calm'];
export const toggleWalk = (state, w) => { const now = walkOf(state); return withArc(state, { walk: WALK.filter(x => (x === w ? !now.includes(x) : now.includes(x))) }); };
export const setHoldHintSeen = state => (arcOf(state).holdHint ? state : withArc(state, { holdHint: true }));

/** 07: the question, at most 200 characters (the share link carries it). */
export const setQuery = (state, query) => withDraft(state, { query: query.slice(0, QUERY_MAX) });
/** 07 Build now (user 11/25 「08·09 건너뛰고 기본값으로 12」): no chips (every angle, the engine picks), All week, the default kinds. */
export const quickDraft = state => withDraft(state, { topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: [...DEFAULT_WHAT] });

/**
 * 08: topic chips per angle from engine.angleTopics, for this question. Defaults as in Figma: the first two of Supports
 * and Reframes on, the first Challenge on. Kept as they are when the question did not change (going back and forth).
 */
export function setTopics(state, query, byAngle) {
  const d = arcOf(state).draft;
  if (d.topicsFor === query) return state;
  const on = { S: 2, R: 2, T: 1 };
  const topics = Object.fromEntries(['S', 'R', 'T'].map(a => [a, (byAngle[a] ?? []).map((t, i) => ({ ...t, on: i < on[a] }))]));
  return withDraft(state, { topicsFor: query, topics });
}

export const toggleTopic = (state, angle, id) => {
  const d = arcOf(state).draft;
  return withDraft(state, { topics: { ...d.topics, [angle]: d.topics[angle].map(t => (t.id === id ? { ...t, on: !t.on } : t)) } });
};

export const setWhen = (state, when) => withDraft(state, { when });
export const toggleWhat = (state, what) => {
  const list = arcOf(state).draft.what;
  return withDraft(state, { what: Object.keys(WHAT).filter(k => (k === what) !== list.includes(k)) });
};
export const resetDraft = state => withArc(state, { draft: freshDraft() });

/**
 * The buildArc options for a draft. An angle whose chips are all switched off is left out (no T → tension off, no 23).
 * An angle that had no chip to offer stays in, so the engine can say there is none (T → tension none → 23).
 */
export function buildOptions(draft, days) {
  const on = a => draft.topics[a].filter(t => t.on).map(t => t.id);
  const angles = ['S', 'R', 'T'].filter(a => on(a).length || !draft.topics[a].length);
  return { angles, topicIds: angles.flatMap(on), days, types: draft.what.flatMap(k => WHAT[k]) };
}

const dayLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * 09 "When" chips (one at a time). On a conference day: Today, Tomorrow (if there is one), All week, as in Figma.
 * Any other day "Today" would mean nothing, so the chips are the conference days themselves, then All week.
 * @param {string[]} days conference days YYYY-MM-DD (venue-local)
 * @param {string} today venue-local YYYY-MM-DD
 * @returns {{ id: string, label: string, days: string[] }[]}
 */
export function whenOptions(days, today) {
  const all = { id: 'all', label: 'All week', days: [] };
  const i = days.indexOf(today);
  if (i < 0) return [...days.map(d => ({ id: d, label: dayLabel(d), days: [d] })), all];
  return [{ id: 'today', label: 'Today', days: [today] }, ...(days[i + 1] ? [{ id: 'tomorrow', label: 'Tomorrow', days: [days[i + 1]] }] : []), all];
}
/** The chosen option, or All week when the saved one is not offered any more (e.g. "today" after the conference). */
export const whenChoice = (options, when) => options.find(o => o.id === when) ?? options.find(o => o.id === 'all');

// 14 "I heard it": talks the person marked as heard (paper keys), on this device only. Heard = tribe colour on the map.
export const heardOf = state => new Set(arcOf(state).heard ?? []);
export const toggleHeard = (state, key) => {
  const h = heardOf(state);
  if (h.has(key)) h.delete(key); else h.add(key);
  return withArc(state, { heard: [...h].sort() });
};

// 14 Q&A (decision 007): a random token made on this phone, sent as X-ARC-Device (the server keeps only its hash),
// and the questions this phone voted for. Both stay in arc.device.
/** @param {() => string} make a new random token (crypto in the app, fixed in tests) */
export const withQaToken = (state, make) => (arcOf(state).qaToken ? state : withArc(state, { qaToken: make() }));
export const qaTokenOf = state => arcOf(state).qaToken ?? null;
export const votedOf = state => new Set(arcOf(state).voted ?? []);
export const addVoted = (state, id) => (votedOf(state).has(id) ? state : withArc(state, { voted: [...votedOf(state), id] }));
