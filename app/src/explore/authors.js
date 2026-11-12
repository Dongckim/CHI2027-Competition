// 06 author line. Pure, so tests check the rule.

/**
 * Authors without a name in the programme (e.g. new in a revision, not in its people list) are not shown as a blank
 * or a made-up "Author"; they only count in "+n". shown: the named authors to list (3, or all when expanded),
 * more: everyone not listed, canExpand: there are more named authors to open.
 * @param {string[]} authors person keys in programme order
 * @param {(key: string) => string | null | undefined} nameOf
 */
export function authorLine(authors, nameOf, expanded, limit = 3) {
  const named = authors.filter(k => nameOf(k)?.trim());
  const shown = expanded ? named : named.slice(0, limit);
  return { shown, more: authors.length - shown.length, canExpand: named.length > limit };
}
