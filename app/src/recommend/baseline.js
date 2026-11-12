// Baseline recommender (modelVersion "baseline-0") until the recsys API exists: TF-IDF keyword match of the research
// sentence against titles and abstracts. Pure, runs in node (contract examples, tests) and on the phone (the sentence
// never leaves it). Output is a RecommendResponse 0.1.0; every reason quotes the abstract sentence that matched.
//
// corpus = { meta, papers: [{ key, title, abstract, type (feed type), authors: [{ personKey, affiliations: [{ institutionKey, country }] }] }],
//            topics: [{ key, label, contentKeys }] }

export const MODEL_VERSION = 'baseline-0';
export const LIMIT = 200;
const TITLE_WEIGHT = 2;
// Bands by rank, not score: keyword scores bunch up (most of the top 200 sit between 0.44 and 0.7), so fixed
// thresholds would call nearly everything near. Top 25% near, next 40% adjacent, rest wild (TRY NEW on Today).
const BAND = { near: 0.25, adjacent: 0.65 };
const TYPE = { Paper: 'paper', Posters: 'poster', 'Interactive Demos': 'demo' }; // same as app-data schedule.json
const SKIP = new Set(['Student Mentoring Program']); // mentoring sign-ups, not talks anyone can attend

const STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours ' +
  'study studies research researcher researchers paper papers work works use uses using used user users people person approach approaches based new design designed findings results result show shows shown propose proposed present presents discuss explore explores exploring across within via toward towards').split(' '));

const stem = w => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
export const terms = text => (text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .match(/[a-z][a-z0-9]+/g)?.filter(w => !STOP.has(w)).map(stem) ?? [];

// Sentences with their UTF-16 positions in the original text (so quote === abstract.slice(start, end)).
export function sentences(text) {
  const out = [];
  for (const m of (text ?? '').matchAll(/[^.!?]+[.!?]*/g)) {
    const lead = m[0].length - m[0].trimStart().length;
    const body = m[0].trim();
    if (body) out.push({ start: m.index + lead, end: m.index + lead + body.length });
  }
  return out;
}

const counts = list => { const m = new Map(); for (const t of list) m.set(t, (m.get(t) ?? 0) + 1); return m; };
const uniqSorted = list => [...new Set(list.filter(Boolean))].sort();
const round = x => Math.round(x * 1000) / 1000;

export function buildIndex(corpus) {
  const docs = corpus.papers.filter(p => !SKIP.has(p.type)).map(p => ({ p, tf: counts([...Array(TITLE_WEIGHT).fill(terms(p.title)).flat(), ...terms(p.abstract)]) }));
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const topicsOf = new Map();
  for (const t of corpus.topics) for (const k of new Set(t.contentKeys)) (topicsOf.get(k) ?? topicsOf.set(k, []).get(k)).push(t.key);
  return { corpus, docs, df, N: docs.length, topicsOf, topics: new Map(corpus.topics.map(t => [t.key, t])) };
}

export function recommend(query, index, { limit = LIMIT } = {}) {
  const { corpus, docs, df, N, topicsOf, topics } = index;
  const q = [...new Set(terms(query))];
  const idf = t => Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1;
  const scored = [];
  for (const d of docs) {
    let s = 0;
    const hit = [];
    for (const t of q) { const f = d.tf.get(t); if (f) { s += (1 + Math.log(f)) * idf(t) ** 2; hit.push(t); } }
    if (s > 0) scored.push({ d, s: s / Math.sqrt(d.tf.size + 1), hit });
  }
  scored.sort((a, b) => b.s - a.s || (a.d.p.key < b.d.p.key ? -1 : 1));
  const best = scored[0]?.s ?? 1;
  const top = scored.slice(0, limit);

  // Concepts: the session topics a talk belongs to; talks without one (posters, demos) get their best matched term.
  const conceptsOf = x => topicsOf.get(x.d.p.key) ?? [`term:${[...x.hit].sort((a, b) => idf(b) - idf(a))[0]}`];
  const topicScore = new Map();
  for (const x of top) for (const c of topicsOf.get(x.d.p.key) ?? []) topicScore.set(c, (topicScore.get(c) ?? 0) + x.s);
  const ranked = [...topicScore].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const topBest = ranked[0]?.[1] ?? 1;
  const mine = ranked.slice(0, 3), close = ranked.slice(3, 5);
  const inTop = c => top.filter(x => (topicsOf.get(x.d.p.key) ?? []).includes(c)).length;

  const items = top.map((x, rank) => {
    const p = x.d.p;
    const relevance = round(x.s / best);
    const concepts = conceptsOf(x);
    const affiliations = p.authors.flatMap(a => a.affiliations ?? []);
    // Reason: the abstract sentence with the most query terms (ties: the earlier one).
    let reason = null;
    for (const s of sentences(p.abstract)) {
      const n = new Set(terms(p.abstract.slice(s.start, s.end)).filter(t => q.includes(t))).size;
      if (n && (!reason || n > reason.n)) reason = { ...s, n };
    }
    return {
      paperKey: p.key, type: TYPE[p.type] ?? 'other', feedType: p.type, relevance,
      band: rank < top.length * BAND.near ? 'near' : rank < top.length * BAND.adjacent ? 'adjacent' : 'wild',
      concepts, clusterId: concepts[0].startsWith('topic:') ? concepts[0] : 'other',
      institutionKeys: uniqSorted(affiliations.map(f => f.institutionKey)),
      countries: uniqSorted(affiliations.map(f => f.country)),
      reasons: reason ? [{ conceptId: concepts[0], quote: p.abstract.slice(reason.start, reason.end), start: reason.start, end: reason.end }] : [],
    };
  });

  const people = new Map();
  const byKey = new Map(top.map(x => [x.d.p.key, x.d.p]));
  for (const it of items) for (const a of byKey.get(it.paperKey).authors) {
    const e = people.get(a.personKey) ?? { personKey: a.personKey, score: 0, concepts: new Set() };
    e.score += it.relevance; it.concepts.forEach(c => e.concepts.add(c));
    people.set(a.personKey, e);
  }
  const topPeople = [...people.values()].sort((a, b) => b.score - a.score || (a.personKey < b.personKey ? -1 : 1)).slice(0, 10);
  const clusterIds = uniqSorted(items.map(i => i.clusterId));

  return {
    topics: mine.map(([c, s]) => ({ conceptId: c, label: topics.get(c).label, weight: round(s / topBest) })),
    schema_version: '0.1.0',
    modelVersion: MODEL_VERSION,
    dataVersion: { edition: corpus.meta.edition, revision: corpus.meta.revision, publicationVersion: corpus.meta.publicationVersion },
    nearby: !mine.length ? [] : close.map(([c], i) => ({ conceptId: c, label: topics.get(c).label, sharedConcept: mine[0][0], matchCount: inTop(c), suggested: i === 0 })),
    totalMatches: scored.length,
    items,
    bridge: { path: [], via: [] }, // shortcut: baseline draws no bridge; recsys fills it
    clusters: clusterIds.map(id => ({ clusterId: id, label: id === 'other' ? 'Other' : topics.get(id).label })),
    people: topPeople.map(e => ({ personKey: e.personKey, relevance: round(e.score / topPeople[0].score), concepts: [...e.concepts].slice(0, 3) })),
  };
}
