// 19b · Make it yours (Figma 743:1568): a shared Arc made into one of my own. Pure, so tests check it.

/**
 * The words the person added to the question, for the underline (Figma: "presence in social VR?"): what is between the
 * longest common start and end. [before, added, after]; added is '' when nothing was added.
 */
export function addedWords(original, edited) {
  let s = 0;
  while (s < original.length && s < edited.length && original[s] === edited[s]) s++;
  let e = 0;
  while (e < original.length - s && e < edited.length - s && original[original.length - 1 - e] === edited[edited.length - 1 - e]) e++;
  let a = s, b = edited.length - e;
  while (a < b && /\s/.test(edited[a])) a++; // the underline starts and ends on a word
  while (b > a && /\s/.test(edited[b - 1])) b--;
  return [edited.slice(0, a), edited.slice(a, b), edited.slice(b)];
}

/** The tension for a changed set of nodes: found with a Challenge, else as it was when off or pending, else none. */
export const tensionFor = (arc, nodes) =>
  nodes.some(n => n.angle === 'T') ? 'found' : arc.tension === 'off' || arc.tension === 'pending' ? arc.tension : 'none';

/** My new Arc from theirs: the kept and added nodes (in that order), the question as edited, a new id, source mine. */
export function mineFrom(arc, { nodes, query, id, createdAt }) {
  return { ...arc, id, createdAt, query, nodes, tension: tensionFor(arc, nodes), source: 'mine' };
}
