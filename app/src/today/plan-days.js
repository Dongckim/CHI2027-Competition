// Recommendation + plan → one planned day per conference day, with the existing planner (app/src/planner/plan.js,
// the same code tests/planner/try.mjs runs). Pure. Used by Today for every mode.
import { planDay, TRAVEL_COST_PER_MIN } from '../planner/plan.js';
import { candidatesFor, limitStops, HOW_FULL } from '../state/device.js';
import { applyEdits, NO_EDITS } from './edits.js';

/** @typedef {{ paperKey: string, sessionKey: string, roomKey: string, start: number, end: number, value: number, travelFromPrevMin: number }} Stop */
/** @typedef {{ day: string, timeZone: string, wheelchair: boolean, stops: Stop[], conflicts: { paperKey: string, alternatives: Stop[] }[], skipped: { paperKey: string, reason: string }[] }} PlannedDay */

// plan = the saved DeviceState plan, or null for the sample day (everything recommended, no needs, no limit).
/** @returns {PlannedDay[]} */
// edits = removed / passed / added (today/edits.js): applied before planning, so the result is a normal planner day.
export function planDays({ index, travelMinutes, days }, response, plan, edits = NO_EDITS) {
  const recommended = plan ? candidatesFor(response, plan) : response.items.map(({ paperKey, relevance }) => ({ paperKey, relevance }));
  const relevance = new Map(response.items.map(i => [i.paperKey, i.relevance]));
  const candidates = applyEdits(recommended, edits, k => relevance.get(k) ?? 0);
  const options = plan
    ? { wheelchair: plan.needs.stepFree, travelCostPerMin: TRAVEL_COST_PER_MIN * (plan.needs.fewerRoomChanges ? 3 : 1) }
    : {};
  return days.map(day => {
    const p = planDay(index, candidates, { day, travelMinutes, ...options });
    return plan ? limitStops(p, HOW_FULL[plan.howFull]) : p;
  });
}
