// Institution search over data/build/<edition>/aliases.json: people type "CMU", "서울대", "Univ. of
// Washington"; the result is always institution keys (official ROR records), best first.
import { normalizeName } from './build.mjs';

// Each query word must be the start of an alias word, in order ("univ of wash" ~ "university of washington").
const wordsPrefix = (q, alias) => {
  let i = 0;
  for (const w of alias) if (i < q.length && w.startsWith(q[i])) i++;
  return i === q.length;
};

export function searchInstitutions(aliases, query, limit = 5) {
  const q = normalizeName(query);
  if (!q) return [];
  const count = new Map(aliases.institutions.map(i => [i.key, i.authorCount]));
  const score = new Map();
  const hit = (key, s) => score.set(key, Math.max(score.get(key) ?? 0, s));
  for (const key of aliases.lookup[q] || []) hit(key, 3);
  const qw = q.split(' ');
  for (const [alias, keys] of Object.entries(aliases.lookup)) {
    if (alias === q) continue;
    const s = alias.startsWith(q) ? 2 : wordsPrefix(qw, alias.split(' ')) ? 1 : 0;
    if (s) for (const key of keys) hit(key, s);
  }
  return [...score].sort((a, b) => b[1] - a[1] || count.get(b[0]) - count.get(a[0]) || (a[0] < b[0] ? -1 : 1)).slice(0, limit).map(([k]) => k);
}
