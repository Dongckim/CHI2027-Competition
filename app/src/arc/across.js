// Talks that more than one of your Arcs leads to (user 11/25 D: "In 2 of your Arcs" and Home's "Talks across your Arcs").
/** @param {{ nodes: { key: string }[] }[]} arcs @returns {Map<string, number>} talk key → how many Arcs hold it (2 or more) */
export function acrossArcs(arcs) {
  const count = new Map();
  for (const a of arcs) for (const k of new Set(a.nodes.map(n => n.key))) count.set(k, (count.get(k) ?? 0) + 1);
  return new Map([...count].filter(([, n]) => n > 1));
}
