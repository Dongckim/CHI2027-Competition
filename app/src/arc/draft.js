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

export const freshDraft = () => ({ query: '', topicsFor: null, topics: { S: [], R: [], T: [] }, when: 'all', what: [...DEFAULT_WHAT], mine: [] });
const freshArc = () => ({ onboarded: false, firstChi: null, draft: freshDraft() });

/** holdHint: 12a's "Hold a stop" hint was shown (Figma 854:2034, once). walk: 09 "How you walk", kept for every Arc (this
 * phone only, never in an Arc or a link). @returns {{ onboarded: boolean, firstChi: boolean | null, draft: ReturnType<typeof freshDraft>, holdHint?: boolean, tour?: boolean, tourDue?: string, talkTour?: boolean, editTour?: boolean, sheetTour?: boolean, walk?: string[], views?: Record<string, number>, guideSeen?: boolean, hidden?: Record<string, string[]> }} */
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
/** user 11/26 「첫 arc 만들면 … 하나하나 눌러보면서 설명」: the map tour was shown (once, this phone). */
/** the first Arc built on this phone: its map gives the tour (not an Arc opened, received or made before this) */
export const setTourDue = (state, id) => (arcOf(state).tour || arcOf(state).tourDue ? state : withArc(state, { tourDue: id }));
export const setTourSeen = state => (arcOf(state).tour ? state : withArc(state, { tour: true }));
/** How many times each Arc's map was opened (user 11/28: counts say what each angle means the first few times). */
export const MEANING_VIEWS = 3;
export const viewsOf = (state, id) => arcOf(state).views?.[id] ?? 0;
export const countView = (state, id) => (viewsOf(state, id) > MEANING_VIEWS ? state : withArc(state, { views: { ...arcOf(state).views, [id]: viewsOf(state, id) + 1 } }));
/** "New to CHI?" on My Arcs (user 11/28: 02–06c moved there) was opened or put away. */
/** Talks marked "Not relevant" per Arc (user 11/28: kept on this phone only, never sent): not offered again for that Arc. */
export const hiddenOf = (state, id) => arcOf(state).hidden?.[id] ?? [];
export const hideTalk = (state, id, key) => (hiddenOf(state, id).includes(key) ? state : withArc(state, { hidden: { ...arcOf(state).hidden, [id]: [...hiddenOf(state, id), key].slice(-200) } }));
export const unhideTalk = (state, id, key) => withArc(state, { hidden: { ...arcOf(state).hidden, [id]: hiddenOf(state, id).filter(k => k !== key) } });
export const setGuideSeen = state => (arcOf(state).guideSeen ? state : withArc(state, { guideSeen: true }));
export const setTalkTourSeen = state => (arcOf(state).talkTour ? state : withArc(state, { talkTour: true }));
export const setEditTourSeen = state => (arcOf(state).editTour ? state : withArc(state, { editTour: true }));
export const setSheetTourSeen = state => (arcOf(state).sheetTour ? state : withArc(state, { sheetTour: true }));
export const setHoldHintSeen = state => (arcOf(state).holdHint ? state : withArc(state, { holdHint: true }));

/** 07: the question, at most 200 characters (the share link carries it). */
export const setQuery = (state, query) => withDraft(state, { query: query.slice(0, QUERY_MAX) });
/** 07r (Figma 11/25): the question from the person's paper, and their own talks (never stops of this Arc; this phone only). */
export const setPaperStart = (state, query, mine) => withDraft(state, { query: query.slice(0, QUERY_MAX), mine, topicsFor: null, topics: { S: [], R: [], T: [] } });
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
  return { angles, topicIds: angles.flatMap(on), days, types: draft.what.flatMap(k => WHAT[k]), mine: draft.mine ?? [] };
}

const dayLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * 09 "When" (user 11/26 「컨퍼런스 날짜 기준 … 컨퍼런스 날짜들 안에서 선택할 수 있게」): the conference days themselves, any
 * number of them, or All week. Not Today / Tomorrow: those depend on the day the Arc is made, not the conference.
 * draft.when: 'all' or the chosen days joined by ','.
 * @param {string[]} days conference days YYYY-MM-DD (venue-local)
 * @returns {{ id: string, label: string }[]}
 */
export const whenOptions = days => [...days.map(d => ({ id: d, label: dayLabel(d) })), { id: 'all', label: 'All week' }];
/** The chosen conference days ([] = all week); days no longer in the programme drop out. */
export const whenDays = (when, days) => (!when || when === 'all' ? [] : when.split(',').filter(d => days.includes(d)));
/** A day chip on or off; none left, or every day, is All week. */
export const toggleWhenDay = (state, day, days) => {
  const now = new Set(whenDays(arcOf(state).draft.when, days));
  if (now.has(day)) now.delete(day); else now.add(day);
  const list = days.filter(d => now.has(d));
  return setWhen(state, !list.length || list.length === days.length ? 'all' : list.join(','));
};

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
