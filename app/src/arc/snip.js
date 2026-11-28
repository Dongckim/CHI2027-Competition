// 15 search in abstracts (user 11/28, feedback 10): does the abstract hold every word of the query, and where, to show in bold.
import { fold } from './authors.js';

/** The query's words (3+ letters) all in the abstract → { before, hit, after } around the match (the whole query as a
 * phrase when it is there, else its longest word), else null. Offsets are the abstract's own (lower-casing keeps them). */
export function abstractHit(abstract, query) {
  const words = fold(query ?? '').filter(w => w.length > 2);
  if (!words.length || !abstract) return null;
  const low = abstract.toLowerCase();
  if (low.length !== abstract.length || !words.every(w => low.includes(w))) return null;
  const phrase = words.join(' '), p = low.indexOf(phrase);
  const word = words.reduce((a, b) => (b.length > a.length ? b : a)); // not a phrase: the longest word, the telling one
  const at = p >= 0 ? p : low.indexOf(word), len = p >= 0 ? phrase.length : word.length;
  const from = Math.max(0, at - 40), to = Math.min(abstract.length, at + len + 60);
  return { before: (from ? '…' : '') + abstract.slice(from, at), hit: abstract.slice(at, at + len), after: abstract.slice(at + len, to) + (to < abstract.length ? '…' : '') };
}
