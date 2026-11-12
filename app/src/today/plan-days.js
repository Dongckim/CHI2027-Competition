// Recommendation + plan → one planned day per conference day, with the existing planner (app/src/planner/plan.js,
// the same code tests/planner/try.mjs runs). Pure. Used by Today for every mode.
import { planDay, TRAVEL_COST_PER_MIN } from '../planner/plan.js';
import { candidatesFor, limitStops, HOW_FULL } from '../state/device.js';

/** @typedef {{ paperKey: string, sessionKey: string, roomKey: string, start: number, end: number, value: number, travelFromPrevMin: number }} Stop */
/** @typedef {{ day: string, timeZone: string, wheelchair: boolean, stops: Stop[], conflicts: { paperKey: string, alternatives: Stop[] }[], skipped: { paperKey: string, reason: string }[] }} PlannedDay */

// plan = the saved DeviceState plan, or null for the sample day (everything recommended, no needs, no limit).
/** @returns {PlannedDay[]} */
export function planDays({ index, travelMinutes, days }, response, plan) {
  const candidates = plan ? candidatesFor(response, plan) : response.items.map(({ paperKey, relevance }) => ({ paperKey, relevance }));
  const options = plan
    ? { wheelchair: plan.needs.stepFree, travelCostPerMin: TRAVEL_COST_PER_MIN * (plan.needs.fewerRoomChanges ? 3 : 1) }
    : {};
  return days.map(day => {
    const p = planDay(index, candidates, { day, travelMinutes, ...options });
    return plan ? limitStops(p, HOW_FULL[plan.howFull]) : p;
  });
}
