// Mock engine rules ("mock@0.1"). Pure: node (tests, tests/engine/try.mjs, contract examples) and the phone (mock.ts) share it.
// Real data only: titles and abstracts as the feed has them, evidence is an abstract sentence checked by quotes.js.
// Similarity is the baseline TF-IDF (app/src/recommend/baseline.js); the angles are simple keyword rules, not judgement.
//
// corpus = { meta: { edition, revision, publicationVersion, timeZone },
//            papers: [{ key, title, abstract, type (feed type), authors: [personKey], slots: [{ sessionKey, start }] }],
//            sessions: [{ key, name }], topics: [{ key, label, contentKeys }], debut: [personKey] }
import { buildIndex as baselineIndex, recommend, terms, sentences } from '../recommend/baseline.js';
import { verifiedReasons } from '../explore/quotes.js';
import { localDay } from '../planner/plan.js';
import { tribeOfText, majority } from '../arc/tribes.js';

export const ENGINE = 'mock@0.1';
export const POOL = 30; // candidates per question (top TF-IDF)
export const CAPS = { S: 4, R: 3, T: 2 }; // nodes per angle on a normal Arc (9 at most); "crowded" lifts them
const LABEL_MAX = 24;

// Tension: an abstract sentence with a contrast or null-result cue. Only then a T node, and that sentence is its evidence.
// "mixed" only as mixed results/findings/evidence/effects (not mixed-methods, mixed reality).
const TENSION = /\b(no significant|did not|however|contrary|fail(?:ed|s)? to|mixed (?:results|findings|evidence|effects))\b/i;
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
  });
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

/**
 * Top candidates for the question after the filters, best first: [{ paper, score }].
 * @param {{ days?: string[], types?: string[], sessionKeys?: string[], limit?: number }} [filters]
 */
export function candidates(index, query, { days = [], types = [], sessionKeys = [], limit = POOL } = {}) {
  const tz = index.corpus.meta.timeZone;
  const keep = p => (!types.length || types.includes(p.type)) && (!days.length || days.includes(dayOf(p, tz)))
    && (!sessionKeys.length || sessionsOf(p).some(k => sessionKeys.includes(k)));
  return recommend(query, index.base, { limit: index.base.N }).items
    .map(it => ({ paper: index.byKey.get(it.paperKey), score: it.relevance }))
    .filter(x => keep(x.paper)).slice(0, limit);
}

/**
 * Sort candidates into angles. T first: an abstract sentence with a contrast cue that also uses a question word (a
 * "however" about something else is not a tension with the question). S: in the top half and has the core question
 * words. R: the rest that use a method / people / measure word the question does not. Others are left out. No caps.
 * Core words: the (up to) two question words most candidates share (in a third of them), so a rare word like "raise" does not empty S.
 * @returns {{ S: object[], R: object[], T: object[] }} ArcNodes per angle, best first
 */
export function classify(index, query, list, { tension = true } = {}) {
  const q = [...new Set(terms(query))];
  const inPool = w => list.filter(x => index.tf.get(x.paper.key)?.has(w)).length;
  const shared = q.map(w => [w, inPool(w)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  // Words in at least a third of the candidates; at least the most shared one.
  const core = shared.filter(([, n], i) => i === 0 || n >= list.length / 3).slice(0, 2).map(([w]) => w);
  const qText = ` ${query.toLowerCase()} `;
  const out = { S: [], R: [], T: [] };
  list.forEach(({ paper: p }, rank) => {
    const node = (angle, s) => ({ key: p.key, angle, label: labelOf(p.title), evidence: evidenceOf(p.abstract, s), debut: p.authors.some(k => index.debut.has(k)) });
    const t = tension && bestSentence(p.abstract, q, TENSION);
    if (t?.n) { out.T.push(node('T', t)); return; }
    const tf = index.tf.get(p.key);
    if (rank < list.length / 2 && core.length && core.every(w => tf?.has(w))) { out.S.push(node('S', bestSentence(p.abstract, q))); return; }
    const text = `${p.title} ${p.abstract}`.toLowerCase();
    if (REFRAME.some(w => text.includes(w) && !qText.includes(w))) out.R.push(node('R', bestSentence(p.abstract, q)));
  });
  return out;
}

export function tribeOf(index, query) {
  const votes = candidates(index, query).map(({ paper: p }) => {
    const names = sessionsOf(p).map(k => index.sessionName.get(k)).concat(index.topicLabels.get(p.key) ?? []).join(' · ');
    return tribeOfText(names) ?? tribeOfText(p.title);
  });
  return majority(votes) ?? { tribe: tribeOfText(query) ?? 'design', confidence: 0 };
}

/** 08: per angle, the sessions (real names) the angle's talks are in; 3–5 each when the data has them. */
export function angleTopics(index, query) {
  const groups = classify(index, query, candidates(index, query));
  const out = {};
  for (const angle of ['S', 'R', 'T']) {
    const count = new Map();
    for (const n of groups[angle]) for (const k of sessionsOf(index.byKey.get(n.key))) count.set(k, (count.get(k) ?? 0) + 1);
    out[angle] = [...count].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => ({ id, label: index.sessionName.get(id) ?? id }));
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
