// 07p (Figma 11/25 "Do you have a paper at CHI?"): finding an author of the programme by name, on this phone. Pure (tests).

/** @typedef {{ key: string, name: string, institution: string, papers: string[] }} Author */

/** A name as typed and as printed meet: lower case, accents off ("Müller" = "muller"), words only (the engine's fold). */
export const fold = s => (s.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? []);

/**
 * 07: the authors whose whole name is what was typed ("juho kim"): the engine reads a name as a question and gives talks on
 * other things (user 11/26 「juho kim을 검색어에 쓰니까 왜 health가 나오고」), so 07 offers 07p instead. Two words at least.
 * @param {string} typed @param {Author[]} authors @returns {Author[]}
 */
export function sameName(typed, authors) {
  const t = fold(typed);
  if (t.length < 2 || /\?/.test(typed)) return [];
  return authors.filter(a => fold(a.name).join(' ') === t.join(' '));
}

/**
 * The authors whose name has, for every typed word, a word starting with it (the engine's "mine" rule); whole-name
 * matches first, then by name. At least 2 letters typed.
 * @param {string} typed @param {Author[]} authors @returns {{ hits: Author[], more: number }}
 */
export function findAuthors(typed, authors, limit = 8) {
  const t = fold(typed);
  if (t.join('').length < 2) return { hits: [], more: 0 };
  const hits = authors.filter(a => { const w = fold(a.name); return t.every(x => w.some(y => y.startsWith(x))); });
  const exact = a => (fold(a.name).join(' ') === t.join(' ') ? 0 : 1);
  hits.sort((a, b) => exact(a) - exact(b) || a.name.localeCompare(b.name));
  return { hits: hits.slice(0, limit), more: Math.max(0, hits.length - limit) };
}
