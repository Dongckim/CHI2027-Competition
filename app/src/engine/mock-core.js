// Mock engine rules ("mock@0.1"). Pure: node (tests, tests/engine/try.mjs, contract examples) and the phone (mock.ts) share it.
// Real data only: titles and abstracts as the feed has them, evidence is an abstract sentence checked by quotes.js.
// Similarity is the baseline TF-IDF (app/src/recommend/baseline.js); the angles are simple keyword rules, not judgement.
//
// corpus = { meta: { edition, revision, publicationVersion, timeZone },
//            papers: [{ key, title, abstract, type (feed type), authors: [personKey], slots: [{ sessionKey, start }] }],
//            sessions: [{ key, name }], topics: [{ key, label, contentKeys }], debut: [personKey] }
import { buildIndex as baselineIndex, recommend, terms as baseTerms, sentences } from '../recommend/baseline.js';
import { verifiedReasons } from '../explore/quotes.js';
import { localDay } from '../planner/plan.js';
import { tribeOfText, tribeByCount, majority } from '../arc/tribes.js';
// Word roots (A4, user request; anything smarter is the real engine's job): after the baseline's plural rule, drop
// -ing, -ed and -ic so robotics / robotic / robot / robots, haptics / haptic and designed / designing / design meet.
const root = w => w.replace(/(?<=.{3})(ing|ed)$/, '').replace(/(?<=.{3})ic$/, '');
const terms = text => baseTerms(text).map(root);

export const ENGINE = 'mock@0.1';
export const POOL = 30; // candidates per question (top TF-IDF)
export const CAPS = { S: 4, R: 3, T: 2 }; // nodes per angle on a normal Arc (9 at most); "crowded" lifts them
// Score bands on the baseline relevance (1 = as good as the top 3 matches for this question), so the counts follow the data instead of
// always filling the caps: S needs a strong match, R a middle one, T a fair one plus its cue sentence.
export const MIN = { S: 0.6, T: 0.4 };
export const R_BAND = [0.35, 0.8];
const LABEL_MAX = 24;

// Tension: an abstract sentence with a contrast or null-result cue. Only then a T node, and that sentence is its evidence.
// "mixed" only as mixed results/findings/evidence/effects (not mixed-methods, mixed reality).
const TENSION = /\b(no significant|did not|however|contrary|fail(?:ed|s)? to|mixed (?:results|findings|evidence|effects))\b/i;
// A 1–2 word topic ("VR") has no claim to contradict, so only finding-like cues count, not "however".
const RESULT = /\b(no significant|did not|contrary|fail(?:ed|s)? to|mixed (?:results|findings|evidence|effects))\b/i;
// "However, little is known…" names a gap in the literature, not a different finding.
const GAP = /\b(lack of|little is known|remains? (?:limited|unclear|unexplored|underexplored|understudied)|few (?:studies|works)|under-?explored|has not been)\b/i;
// Abbreviations → the words papers also write. The question is searched with both (shortcut: a fixed list for the mock).
const EXPAND = { vr: 'virtual reality', ar: 'augmented reality', xr: 'extended reality', mr: 'mixed reality', llm: 'large language model',
  llms: 'large language models', ai: 'artificial intelligence', hci: 'human computer interaction', bci: 'brain computer interface',
  hri: 'human robot interaction', ml: 'machine learning', nlp: 'natural language processing', genai: 'generative ai', iot: 'internet of things' };
export const expandQuery = query => {
  const extra = (query.toLowerCase().match(/[a-z]+/g) ?? []).map(w => EXPAND[w]).filter(Boolean);
  return extra.length ? `${query} ${extra.join(' ')}` : query;
};
const isShort = query => terms(query).length <= 2;
// Reframe: a method, group of people or measure word that the question itself does not use.
const REFRAME = ['interview', 'survey', 'diary', 'field study', 'field deployment', 'workshop', 'participatory', 'co-design', 'ethnograph',
  'experiment', 'controlled study', 'longitudinal', 'eye tracking', 'eye-tracking', 'physiological', 'log data', 'questionnaire', 'think-aloud',
  'children', 'older adults', 'teenagers', 'students', 'clinicians', 'patients', 'caregivers', 'workers', 'developers', 'designers', 'families',
  'accuracy', 'workload', 'trust', 'engagement', 'performance', 'satisfaction', 'presence', 'usability'];

export function buildIndex(corpus) {
  const byKey = new Map(corpus.papers.map(p => [p.key, p]));
  const base = baselineIndex({
    meta: corpus.meta, topics: corpus.topics,
    papers: corpus.papers.map(p => ({ ...p, authors: p.authors.map(k => ({ personKey: k, affiliations: [] })) })),
  }, { words: terms });
  const tf = new Map(base.docs.map(d => [d.p.key, d.tf]));
  const sessionName = new Map(corpus.sessions.map(s => [s.key, s.name]));
  const topicLabels = new Map();
  for (const t of corpus.topics) for (const k of t.contentKeys) (topicLabels.get(k) ?? topicLabels.set(k, []).get(k)).push(t.label);
  return { corpus, base, byKey, tf, sessionName, topicLabels, debut: new Set(corpus.debut ?? []) };
}

/** Title before the colon, cut to 24 characters with "…". */
export function labelOf(title) {
  const head = (title ?? '').split(':')[0].trim() || (title ?? '').trim();
  return head.length <= LABEL_MAX ? head : head.slice(0, LABEL_MAX - 1).trimEnd() + '…';
}

const dayOf = (p, tz) => { const s = p.slots.map(x => x.start).filter(x => x != null); return s.length ? localDay(Math.min(...s), tz) : null; };
const sessionsOf = p => [...new Set(p.slots.map(s => s.sessionKey).filter(Boolean))];
const evidenceOf = (abstract, s) => {
  if (!s) return null;
  const e = { sentence: abstract.slice(s.start, s.end), start: s.start, end: s.end };
  return verifiedReasons([{ quote: e.sentence, start: e.start, end: e.end }], abstract).length ? e : null;
};
// The sentence of `abstract` (optionally only those matching `only`) with the most question words; ties: the earlier one.
function bestSentence(abstract, q, only) {
  let best = null;
  for (const s of sentences(abstract)) {
    const text = abstract.slice(s.start, s.end);
    if (only && !only.test(text)) continue;
    const n = new Set(terms(text).filter(t => q.includes(t))).size;
    if (only ? !best || n > best.n : n && (!best || n > best.n)) best = { ...s, n };
  }
  return best;
}

// 08 chips are topical sessions only, so a talk whose sessions are all format blocks (most posters and demos sit in
// "Posters (Tuesday)", "Interactivity Demos") cannot be picked by a chip: it passes, and 09's What chips decide.
const inSessions = (index, p, keys) => {
  const topical = sessionsOf(p).filter(k => !FORMAT_BLOCK.test(index.sessionName.get(k) ?? ''));
  return !topical.length || topical.some(k => keys.includes(k));
};

/**
 * Top candidates for the question after the filters, best first: [{ paper, score }].
 * @param {{ days?: string[], types?: string[], sessionKeys?: string[], limit?: number }} [filters]
 */
export function candidates(index, query, { days = [], types = [], sessionKeys = [], limit = POOL } = {}) {
  const tz = index.corpus.meta.timeZone;
  const keep = p => (!types.length || types.includes(p.type)) && (!days.length || days.includes(dayOf(p, tz)))
    && (!sessionKeys.length || inSessions(index, p, sessionKeys));
  const items = recommend(expandQuery(query), index.base, { limit: index.base.N }).items;
  // Score against the mean of the top 3, not the top 1: one standout match (1.00, then 0.60) would push every other
  // talk under the S bar ("Does VR fidelity raise presence?" had no Supports). Capped at 1.
  const ref = items.slice(0, 3).reduce((a, it) => a + it.relevance, 0) / Math.min(3, items.length || 1) || 1;
  return items.map(it => ({ paper: index.byKey.get(it.paperKey), score: Math.min(1, it.relevance / ref) }))
    .filter(x => keep(x.paper)).slice(0, limit);
}

/**
 * Sort candidates into angles. T first: an abstract sentence with a contrast cue that also uses a question word (a
 * "however" about something else is not a tension with the question), score ≥ MIN.T. S: score ≥ MIN.S and has the
 * core question words. R: score in R_BAND and a method / people / measure word the question does not use. Others are left out. No caps.
 * Core words: the (up to) two question words most candidates share (in a third of them), so a rare word like "raise" does not empty S.
 * @returns {{ S: object[], R: object[], T: object[] }} ArcNodes per angle, best first
 */
export function classify(index, query, list, { tension = true } = {}) {
  const q = [...new Set(terms(expandQuery(query)))]; // question words with the long forms of abbreviations
  const own = [...new Set(terms(query))];
  const textOf = p => `${p.title} ${p.abstract}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  // A core word counts when the paper has it or its long form ("vr" or "virtual reality").
  const has = (p, w) => index.tf.get(p.key)?.has(w) || (EXPAND[w] && textOf(p).includes(EXPAND[w]));
  const inPool = w => list.filter(x => has(x.paper, w)).length;
  const shared = own.map(w => [w, inPool(w)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  // Words in at least a third of the candidates; at least the most shared one.
  const core = shared.filter(([, n], i) => i === 0 || n >= list.length / 3).slice(0, 2).map(([w]) => w);
  const qText = ` ${expandQuery(query).toLowerCase()} `;
  const short = isShort(query);
  const cue = short ? RESULT : TENSION;
  const tensionLine = text => cue.test(text) && !GAP.test(text);
  const out = { S: [], R: [], T: [] };
  list.forEach(({ paper: p, score }) => {
    const node = (angle, s) => ({ key: p.key, angle, label: labelOf(p.title), evidence: evidenceOf(p.abstract, s), debut: index.debut.has(p.authors[0]) }); // map/list ✦: first author new (14 marks every new author)
    const t = tension && bestSentence(p.abstract, q, { test: tensionLine });
    if (t?.n && score >= MIN.T) { out.T.push(node('T', t)); return; }
    const text = `${p.title} ${p.abstract}`.toLowerCase();
    const reframe = REFRAME.some(w => text.includes(w) && !qText.includes(w));
    // A topic word matches almost every candidate, so after the top Supports the rest with a method / people / measure
    // word go to Reframes (the R band reaches up to 1 for short questions).
    const sFull = short && out.S.length >= CAPS.S;
    const s = bestSentence(p.abstract, q);
    if (!sFull && score >= MIN.S && core.length && core.every(w => has(p, w)) && s?.n) { out.S.push(node('S', s)); return; }
    if (score >= R_BAND[0] && (short || score < R_BAND[1]) && reframe) out.R.push(node('R', s));
  });
  return out;
}

/**
 * Every talk gets one of the 8 tribes, in this order: (1) its session names and topic labels, (2) its title,
 * (3) the tribe with the most keyword hits in its abstract, (4) the tribe whose talks (from 1–3) share the most
 * weighted words with it, (5) when it shares no word at all (award sessions with no abstract), the largest tribe.
 * Computed once per index. Returns { tribe, step } so reports can show how each was decided.
 */
export function tribesOf(index) {
  if (index.tribes) return index.tribes;
  const out = new Map();
  for (const p of index.byKey.values()) {
    const names = sessionsOf(p).map(k => index.sessionName.get(k)).concat(index.topicLabels.get(p.key) ?? []).join(' · ');
    const steps = [() => tribeOfText(names), () => tribeOfText(p.title), () => tribeByCount(p.abstract)];
    const i = steps.findIndex(f => (out.set(p.key, { tribe: f(), step: 0 }), out.get(p.key).tribe));
    if (i >= 0) out.get(p.key).step = i + 1; else out.delete(p.key);
  }
  // (4) word profile per tribe from the talks already placed
  const { df, N } = index.base;
  const idf = t => Math.log((N + 1) / ((df.get(t) ?? 0) + 1));
  const profile = new Map(), size = new Map();
  for (const [key, { tribe }] of out) {
    const tf = index.tf.get(key) ?? new Map(termsOf(index.byKey.get(key)));
    const prof = profile.get(tribe) ?? profile.set(tribe, new Map()).get(tribe);
    for (const [t, n] of tf) prof.set(t, (prof.get(t) ?? 0) + n);
    size.set(tribe, (size.get(tribe) ?? 0) + 1);
  }
  const largest = [...size].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'society';
  for (const p of index.byKey.values()) {
    if (out.has(p.key)) continue;
    const tf = index.tf.get(p.key) ?? new Map(termsOf(p));
    let best = null, top = 0;
    for (const [tribe, prof] of profile) {
      let score = 0;
      for (const [t, n] of tf) score += n * ((prof.get(t) ?? 0) / size.get(tribe)) * idf(t) ** 2;
      if (score > top) { best = tribe; top = score; }
    }
    out.set(p.key, best ? { tribe: best, step: 4 } : { tribe: largest, step: 5 });
  }
  return (index.tribes = out);
}
const termsOf = p => { const m = new Map(); for (const t of terms(`${p.title} ${p.abstract}`)) m.set(t, (m.get(t) ?? 0) + 1); return m; };

/** One talk's tribe (always one of the 8). */
export const paperTribe = (index, p) => tribesOf(index).get(p.key).tribe;

export function tribeOf(index, query) {
  const votes = candidates(index, query).map(({ paper: p }) => paperTribe(index, p));
  return majority(votes) ?? { tribe: tribeOfText(query) ?? 'design', confidence: 0 };
}

// Sessions named after a format or a time slot, not a topic ("Posters (Tuesday)", "Interactivity Demos"): no use as a 08 chip.
const FORMAT_BLOCK = /^(Posters \(|Video Presentations|Interactivity Demos|Reception and Interactivity|Student Research Competition|Student Mentoring|Global Science Program)/;

/** 08: per angle, the sessions (real names) the angle's talks are in; 3–5 each when the data has them. */
export function angleTopics(index, query) {
  const groups = classify(index, query, candidates(index, query));
  const out = {};
  for (const angle of ['S', 'R', 'T']) {
    const count = new Map();
    for (const n of groups[angle]) for (const k of sessionsOf(index.byKey.get(n.key))) count.set(k, (count.get(k) ?? 0) + 1);
    const seen = new Set();
    out[angle] = [...count].sort((a, b) => b[1] - a[1])
      .map(([id]) => ({ id, label: index.sessionName.get(id) ?? id }))
      .filter(t => !FORMAT_BLOCK.test(t.label) && !seen.has(t.label) && seen.add(t.label)) // a two-part workshop once
      .slice(0, 5);
  }
  return out;
}

/**
 * The Arc for a question. mode: 'normal' | 'none' (no Tension found → 23) | 'pending' (angles still sorting → 25) |
 * 'crowded' (no caps → 24). id and createdAt come from the caller (the device), so this stays pure.
 * @param {{ angles: ('S'|'R'|'T')[], topicIds?: string[], days?: string[], types?: string[] }} opts
 * @param {{ id: string, createdAt: number, mode?: string }} make
 */
export function buildArc(index, query, { angles, topicIds = [], days = [], types = [] }, { id, createdAt, mode = 'normal' }) {
  const wantT = angles.includes('T');
  const groups = classify(index, query, candidates(index, query, { days, types, sessionKeys: topicIds }), { tension: wantT && mode !== 'none' && mode !== 'pending' });
  const nodes = ['S', 'R', 'T'].filter(a => angles.includes(a)).flatMap(a => (mode === 'crowded' ? groups[a] : groups[a].slice(0, CAPS[a])));
  const hasT = nodes.some(n => n.angle === 'T');
  return {
    schema_version: '0.1.0', id, edition: index.corpus.meta.edition, query, tribe: tribeOf(index, query).tribe, nodes,
    tension: !wantT ? 'off' : mode === 'pending' ? 'pending' : hasT ? 'found' : 'none',
    filters: { days, types }, source: 'mine', engine: ENGINE, createdAt,
  };
}

/** 15: more talks under the same angle, not already on the Arc. */
export function suggest(index, query, angle, excludeKeys, limit = 5) {
  const exclude = new Set(excludeKeys);
  return classify(index, query, candidates(index, query, { limit: POOL * 2 }))[angle].filter(n => !exclude.has(n.key)).slice(0, limit);
}

/**
 * 15 Wildcard: talks that share a word with the question but sit well below the Arc (score 0.15–0.35 of the top 3),
 * spread through that band rather than the best of it. Shown as Reframes (another lens), quoting the sentence with the
 * most question words when there is one.
 */
export function wildcard(index, query, excludeKeys, limit = 5) {
  const exclude = new Set(excludeKeys);
  const q = [...new Set(terms(expandQuery(query)))];
  const band = candidates(index, query, { limit: index.base.N }).filter(c => c.score >= 0.15 && c.score < 0.35 && !exclude.has(c.paper.key));
  const step = Math.max(1, Math.floor(band.length / limit));
  return band.filter((_, i) => i % step === 0).slice(0, limit).map(({ paper: p }) =>
    ({ key: p.key, angle: 'R', label: labelOf(p.title), evidence: evidenceOf(p.abstract, bestSentence(p.abstract, q)), debut: index.debut.has(p.authors[0]) }));
}
