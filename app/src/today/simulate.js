// The fake programme change (03-M without a feed change) belongs to the sample day only. Pure, so tests check the rule.

/** Open the sample day with ?simulate=room-change → one talk of the day moves room. Ignored in a real plan. */
export const simulateRequested = (mode, search) => mode === 'sample' && new URLSearchParams(search).get('simulate') === 'room-change';

// Screens that keep the sample day's demo clock and simulated change: the sample day and what it opens. Anywhere else
// (Today with a plan, onboarding …) both are dropped, so a real plan never shows a fake change.
const SAMPLE_SCREENS = ['sample', 'more', 'explore', 'talk', 'person', 'directions'];
/** @param {string} head first part of the route · @param {boolean} placeholder a later-stage screen (Directions …) */
export const keepsSample = (head, placeholder) => SAMPLE_SCREENS.includes(head) || placeholder;
