// 20 Today / This week / After CHI (user 11/20 「A안(Arc 단위로 거르기)」; which Arcs each tab shows: interpretation,
// designer to confirm). An Arc is in a tab by its own talks, at the (demo) clock:
//   today: a talk left today (venue day)      week: any talk left until the conference's last day
//   after: nothing left (all over or heard), and every Arc once the conference is over
// A talk is "left" when it has not ended and is not heard; a talk with no time counts as left during the conference.
import { localDay } from '../planner/plan.js';
import { nodeStates } from './map.js';

export const PERIODS = /** @type {const} */ (['today', 'week', 'after']);

export function periodsOf(arc, timeOf, now, heard, { days, timeZone }) {
  const today = localDay(now, timeZone);
  const over = today > days[days.length - 1];
  const st = nodeStates(arc.nodes, timeOf, now, heard);
  const left = arc.nodes.filter(n => st.get(n.key) !== 'ended' && st.get(n.key) !== 'heard');
  const isToday = left.some(n => { const t = timeOf(n.key); return t && localDay(t.start, timeZone) === today; });
  return { today: !over && isToday, week: !over && left.length > 0, after: over || left.length === 0 };
}

/** The tab to open on: today if any Arc has a talk left today, else this week, else after CHI. */
export function firstPeriod(list) {
  return list.some(p => p.today) ? 'today' : list.some(p => p.week) ? 'week' : 'after';
}
