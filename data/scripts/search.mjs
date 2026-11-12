// Search over the programme, on the phone (Explore, 04/05) and in node (report.mjs, tests). Pure, no I/O.
// Not a recommender: results come in programme order, grouped by where the words matched (title, author, topic,
// affiliation), never by relevance to the person ("Not ranked for you").
import { normalizeName } from './edition.mjs';
import { localDay as localDayOf } from '../../app/src/planner/plan.js';

// Compared without accents or case ("Vazquez" ~ "Baca-Vázquez", "turkiye" ~ "Türkiye"). Hangul is recomposed (NFC).
const fold = s => normalizeName(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const queryWords = query => fold(query).split(' ').filter(Boolean);
// A query with no letter or digit ("(", "-") is no query: nothing is searched.
export const hasWords = query => /[\p{L}\p{N}]/u.test(query ?? '');

// Each query word must be the start of an alias word, in order ("univ of wash" ~ "university of washington").
const wordsPrefix = (q, alias) => {
  let i = 0;
  for (const w of alias) if (i < q.length && w.startsWith(q[i])) i++;
  return i === q.length;
};

// Institution search over aliases ({ institutions: [{ key, authorCount }], lookup: { alias: keys[] } }): people type
// "CMU", "서울대", "Univ. of Washington"; the result is always institution keys (official ROR records), best first.
export function searchInstitutions(aliases, query, limit = 5) {
  return scoredInstitutions(aliases, query).slice(0, limit).map(([k]) => k);
}
// Own keys only: a plain object also "has" constructor, __proto__, toString … (Explore typed "constructor" → crash).
const own = (obj, key) => (Object.hasOwn(obj, key) ? obj[key] : undefined);
const counts = new WeakMap();
function scoredInstitutions(aliases, query) {
  const q = normalizeName(query);
  if (!q) return [];
  const count = counts.get(aliases) ?? counts.set(aliases, new Map(aliases.institutions.map(i => [i.key, i.authorCount]))).get(aliases);
  const score = new Map();
  const hit = (key, s) => score.set(key, Math.max(score.get(key) ?? 0, s));
  for (const key of own(aliases.lookup, q) ?? []) hit(key, 3);
  const qw = q.split(' ');
  for (const [alias, keys] of Object.entries(aliases.lookup)) {
    if (alias === q) continue;
    const s = alias.startsWith(q) ? 2 : wordsPrefix(qw, alias.split(' ')) ? 1 : 0;
    if (s) for (const key of keys) hit(key, s);
  }
  return [...score].sort((a, b) => b[1] - a[1] || count.get(b[0]) - count.get(a[0]) || (a[0] < b[0] ? -1 : 1));
}

/** @typedef {{ kind: 'institution', keys: string[], label: string, others?: number } | { kind: 'country', key: string, label: string }} Place */
/** @typedef {{ days: string[], types: string[], place: Place | null }} Filters */

// Countries as people type them → the folded names authors' affiliations use (edition.mjs countryName).
const COUNTRY_WORDS = { usa: 'united states', us: 'united states', america: 'united states', uk: 'united kingdom', britain: 'united kingdom', korea: 'korea republic of', 'south korea': 'korea republic of' };

// One index per programme: normalized words for every talk, person and session, and the day(s) each talk is on.
// schedule: app schedule.json (papers with paperKey, title, type, slots, authors) · people: people.json
// topics: topics.json [{ key, label, contentKeys }] · aliases: institutions.json { institutions, lookup }
/** @param {{ schedule: any, people: Record<string, any>, topics?: { label: string, contentKeys: string[] }[], aliases: any }} data */
export function buildSearchIndex({ schedule, people, topics = [], aliases }) {
  const tz = schedule.meta.timeZone;
  const words = s => fold(s).split(' ').filter(Boolean);
  const topicsOf = new Map();
  for (const t of topics) for (const k of t.contentKeys) (topicsOf.get(k) ?? topicsOf.set(k, []).get(k)).push(t.label);
  const order = new Map([...schedule.papers].sort((a, b) => firstStart(a) - firstStart(b) || (a.title < b.title ? -1 : 1)).map((p, i) => [p.paperKey, i]));
  const talks = schedule.papers.map(p => {
    const affs = p.authors.flatMap(k => people[k]?.affiliations ?? []);
    return {
      key: p.paperKey, type: p.type, order: order.get(p.paperKey),
      days: [...new Set(p.slots.filter(s => s.start != null).map(s => localDayOf(s.start, tz)))],
      sessions: [...new Set(p.slots.map(s => s.sessionKey))],
      title: words(p.title),
      authors: p.authors.map(k => ({ key: k, name: people[k]?.name ?? '', words: words(people[k]?.name) })),
      topics: (topicsOf.get(p.paperKey) ?? []).map(label => ({ label, words: words(label) })),
      institutions: new Set(affs.map(a => a.institutionKey).filter(Boolean)),
      countries: new Set(affs.map(a => fold(a.country)).filter(Boolean)),
    };
  });
  const peopleList = Object.entries(people).map(([key, p]) => ({
    key, name: p.name, words: words(p.name),
    institutions: new Set(p.affiliations.map(a => a.institutionKey).filter(Boolean)),
    countries: new Set(p.affiliations.map(a => fold(a.country)).filter(Boolean)),
  })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const sessionTalks = new Map();
  for (const t of talks) for (const s of t.sessions) (sessionTalks.get(s) ?? sessionTalks.set(s, []).get(s)).push(t.key);
  const sessions = schedule.sessions.filter(s => sessionTalks.has(s.key)).map(s => ({
    key: s.key, words: words(s.name), start: s.start, days: s.start != null ? [localDayOf(s.start, tz)] : [], talks: sessionTalks.get(s.key),
  })).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  const countryLabel = new Map(Object.values(people).flatMap(p => p.affiliations).filter(a => a.country).map(a => [fold(a.country), a.country]));
  const countries = [...new Set(talks.flatMap(t => [...t.countries]))].sort();
  return { talks, talkByKey: new Map(talks.map(t => [t.key, t])), people: peopleList, sessions, aliases, countries, countryLabel,
    names: new Map(aliases.institutions.map(i => [i.key, i.name])), places: new Map() };
}
const firstStart = p => Math.min(Infinity, ...p.slots.map(s => s.start).filter(s => s != null));

// Every query word is the start of some word of the field (any order): "mellon carn" ~ "carnegie mellon".
const matches = (qw, fieldWords) => qw.every(q => fieldWords.some(w => w.startsWith(q)));

// What a typed word means as a place: the institution an exact alias names (only the largest one: "CMU" is also
// Chiang Mai University, 1 author), or institutions whose name starts with it, or a country.
/** @returns {Place | null} */
export function placeOf(index, query) {
  const q = normalizeName(query);
  if (!q || !hasWords(q)) return null;
  if (!index.places.has(q)) index.places.set(q, findPlace(index, q)); // one alias scan per query, not one per tab
  return index.places.get(q);
}
function findPlace(index, q) {
  const f = fold(q);
  const country = own(COUNTRY_WORDS, f) ?? index.countries.find(c => c === f || (f.length >= 4 && c.startsWith(f)));
  if (country) return { kind: 'country', key: country, label: index.countryLabel.get(country) ?? country };
  const scored = scoredInstitutions(index.aliases, q).filter(([, s]) => s >= 2 && (s === 3 || q.length >= 4));
  if (!scored.length) return null;
  const exact = scored.filter(([, s]) => s === 3).length;
  const best = exact ? [scored[0][0]] : scored.map(([k]) => k);
  // others: more institutions the same alias names ("Other CMUs" opens them in the filter screen)
  return { kind: 'institution', keys: best, label: index.names.get(best[0]), others: Math.max(0, exact - 1) };
}
const atPlace = (item, place) => (place.kind === 'country' ? item.countries.has(place.key) : place.keys.some(k => item.institutions.has(k)));

// Institution filter choices for a typed name: the matching institutions (best first) and a matching country.
/** @returns {Place[]} */
export function placeChoices(index, query, limit = 5) {
  const q = normalizeName(query);
  if (!q || !hasWords(q)) return [];
  const out = searchInstitutions(index.aliases, q, limit).map(k => ({ kind: 'institution', keys: [k], label: index.names.get(k) }));
  const f = fold(q);
  const country = own(COUNTRY_WORDS, f) ?? index.countries.find(c => c.startsWith(f));
  if (country) out.unshift({ kind: 'country', key: country, label: index.countryLabel.get(country) ?? country });
  return out.slice(0, limit);
}

// filters: { days: string[], types: string[], place: null | placeOf/placeChoices value }. Empty lists = no filter.
/** @type {Filters} */
export const NO_FILTERS = Object.freeze({ days: [], types: [], place: null });
/** @param {Filters} f */
export const filterCount = f => (f.days.length > 0) + (f.types.length > 0) + !!f.place;
const passes = (t, f) => (!f.days.length || t.days.some(d => f.days.includes(d))) && (!f.types.length || f.types.includes(t.type)) && (!f.place || atPlace(t, f.place));

// → [{ key, why: { field: 'title' | 'author' | 'topic' | 'place', text? } }] in programme order within each field.
// An empty query lists every talk that passes the filters.
/** @param {Filters} [filters] */
export function searchTalks(index, query, filters = NO_FILTERS) {
  if (!hasWords(query) && query?.trim() && !filterCount(filters)) return [];
  const qw = hasWords(query) ? queryWords(query) : [];
  const place = qw.length ? placeOf(index, query) : null;
  const tiers = [[], [], [], []];
  for (const t of index.talks) {
    if (!passes(t, filters)) continue;
    if (!qw.length || matches(qw, t.title)) { tiers[0].push({ t, why: { field: 'title' } }); continue; }
    const a = t.authors.find(x => matches(qw, x.words));
    if (a) { tiers[1].push({ t, why: { field: 'author', text: a.name, personKey: a.key } }); continue; }
    const tp = t.topics.find(x => matches(qw, x.words));
    if (tp) { tiers[2].push({ t, why: { field: 'topic', text: tp.label } }); continue; }
    if (place && atPlace(t, place)) tiers[3].push({ t, why: { field: 'place', text: place.label } });
  }
  return tiers.flatMap(list => list.sort((a, b) => a.t.order - b.t.order).map(({ t, why }) => ({ key: t.key, why })));
}

// People by name, then people at the place the query names. Only the place filter applies (people have no day or type).
/** @param {Filters} [filters] */
export function searchPeople(index, query, filters = NO_FILTERS) {
  const qw = hasWords(query) ? queryWords(query) : [];
  if (!qw.length && !filters.place) return [];
  const place = qw.length ? placeOf(index, query) : null;
  const byName = [], atIt = [];
  for (const p of index.people) {
    if (filters.place && !atPlace(p, filters.place)) continue;
    if (!qw.length || matches(qw, p.words)) byName.push(p.key);
    else if (place && atPlace(p, place)) atIt.push(p.key);
  }
  return [...byName, ...atIt];
}

// Sessions by name, in time order. Day filter applies; type and place filter the session's talks.
/** @param {Filters} [filters] */
export function searchSessions(index, query, filters = NO_FILTERS) {
  const qw = hasWords(query) ? queryWords(query) : [];
  if (!qw.length && !filterCount(filters)) return [];
  const talks = index.talkByKey;
  return index.sessions
    .filter(s => (!qw.length || matches(qw, s.words)) && (!filters.days.length || s.days.some(d => filters.days.includes(d))))
    .map(s => ({ key: s.key, talks: s.talks.filter(k => passes({ ...talks.get(k), days: s.days.length ? s.days : talks.get(k).days }, filters)) }))
    .filter(s => s.talks.length);
}
