// What the person changed on top of the planner's result. Pure; stored in the DeviceState plan (`plan.edits`),
// or in memory for the sample day. The planner is simply run again with these applied: no server call.
//   removed: taken out with Remove (never suggested again)
//   passed:  the other talks of a PICK ONE (kept out of the plan, still offered in More for you)
//   added:   put in with Pick, Swap or More for you (kept by the planner and by How full)
export const NO_EDITS = Object.freeze({ removed: [], passed: [], added: [] });
export const ADDED_BOOST = 10; // relevance is 0..1, so an added talk always outweighs what it overlaps

const without = (list, keys) => list.filter(k => !keys.includes(k));
const withAll = (list, keys) => [...without(list, keys), ...keys];
const norm = e => ({ ...NO_EDITS, ...e });

export const removeStop = (edits, paperKey) => { const e = norm(edits); return { removed: withAll(e.removed, [paperKey]), passed: without(e.passed, [paperKey]), added: without(e.added, [paperKey]) }; };
export const addItem = (edits, paperKey) => { const e = norm(edits); return { removed: without(e.removed, [paperKey]), passed: without(e.passed, [paperKey]), added: withAll(e.added, [paperKey]) }; };
export function pickOne(edits, chosen, others) {
  const e = addItem(edits, chosen);
  return { ...e, passed: withAll(e.passed, others), added: without(e.added, others) };
}
export const swapStop = (edits, out, into) => addItem(removeStop(edits, out), into);

// Planner input: recommendations minus removed and passed, plus added (boosted so they stay).
export function applyEdits(candidates, edits, relevanceOf = () => 1) {
  const e = norm(edits);
  const out = new Set([...e.removed, ...e.passed]);
  const added = new Set(e.added);
  const list = candidates.filter(c => !out.has(c.paperKey) && !added.has(c.paperKey));
  return [...list, ...e.added.map(paperKey => ({ paperKey, relevance: ADDED_BOOST + relevanceOf(paperKey) }))];
}
