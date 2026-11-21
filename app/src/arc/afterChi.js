// 20b · After CHI (Figma 743:1741): the numbers, the one Arc still open, and the reading list (.txt and .bib). Pure, so
// tests check them. The .bib uses only the feed's title, authors, DOI and year (user 「.bib은 피드의 제목·저자·DOI·연도만으로,
// 없는 필드는 비워 둬」).

/** Talks in the Arcs not marked heard, each once, in Arc order (newest Arc first, as My Arcs lists them). */
export const toReadKeys = (arcs, heard) => [...new Set(arcs.flatMap(a => a.nodes.map(n => n.key)))].filter(k => !heard.has(k));

/** The first Arc with no Challenge on it (no T node), or null when every Arc has one. */
export const stillOpen = arcs => arcs.find(a => !a.nodes.some(n => n.angle === 'T')) ?? null;

const bareDoi = doi => (doi ?? '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');

/**
 * Plain text: title, authors, DOI link (the ACM DL page); one talk per block. A talk without a DOI has no link line (the
 * feed has no other link, and nothing is made up).
 * @param {{ key: string, title: string, authors: string[], doi: string | null }[]} items
 */
export function readingTxt(items) {
  return items.map(t => {
    const doi = bareDoi(t.doi);
    return [t.title, t.authors.join(', '), doi && `https://doi.org/${doi}`].filter(Boolean).join('\n');
  }).join('\n\n') + '\n';
}

const BIB = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '&': '\\&', '%': '\\%', $: '\\$', '#': '\\#', _: '\\_', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' };
/** BibTeX special characters, in one pass (so the backslash a replacement adds is not escaped again). */
export const bibEscape = s => String(s ?? '').replace(/[\\{}&%$#_~^]/g, c => BIB[c]);

/**
 * @inproceedings per talk: key = edition:id, author, title, doi (bare), year = the edition's year. A missing field stays
 * empty (doi = {}).
 * @param {{ key: string, title: string, authors: string[], doi: string | null }[]} items
 * @param {string} edition e.g. chi2026
 */
export function readingBib(items, edition) {
  const year = edition.match(/\d{4}/)?.[0] ?? '';
  return items.map(t => [
    `@inproceedings{${t.key},`,
    `  author = {${t.authors.map(bibEscape).join(' and ')}},`,
    `  title = {${bibEscape(t.title)}},`,
    `  doi = {${bibEscape(bareDoi(t.doi))}},`,
    `  year = {${year}}`,
    '}',
  ].join('\n')).join('\n\n') + '\n';
}
