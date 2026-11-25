// 07p (Figma 11/25 "Do you have a paper at CHI?"): finding an author of the programme by name, on this phone. Pure (tests).

/** @typedef {{ key: string, name: string, institution: string, papers: string[] }} Author */

/** A name as typed and as printed meet: lower case, accents off ("Müller" = "muller"), words only (the engine's fold). */
export const fold = s => (s.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? []);

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
