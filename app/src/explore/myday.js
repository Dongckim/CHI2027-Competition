// "In your day" on Explore, 06 and 07. Pure, so tests check the rule.

/**
 * Talks that are in my day: the planned stops on the days I attend (view.chosen). A talk the planner placed on a day
 * I don't attend is not shown on Today ("You're not at CHI"), so it stays addable (+ Add also adds that day).
 * Browsing without a plan (view = null): only the talks added on this phone.
 * @param {{ days: string[], chosen: string[], plans: { day: string, stops: { paperKey: string }[] }[] } | null} view
 * @param {string[]} added
 */
export function plannedKeys(view, added) {
  if (!view) return new Set(added);
  return new Set(view.plans.filter(p => view.chosen.includes(p.day)).flatMap(p => p.stops.map(s => s.paperKey)));
}
