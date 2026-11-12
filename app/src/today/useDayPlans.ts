import { useEffect, useMemo, useState } from 'react';
import { useRecommendation } from '../data/recommendation';
import { loadSchedule, type Schedule } from '../data/load';
import { useProgrammeUpdate } from '../data/programme';
import { useDevice } from '../state/useDevice';
import { conferenceDays } from './rows.js';
import { planDays } from './plan-days.js';
import { diffStops } from './changes.js';
import { useEdits } from './useEdits';

// Today and More for you plan the same way: the programme (the deploy's, or a newer revision), the recommendations,
// the plan (saved, or none for the sample day) and the edits → one planned day per conference day, plus what moved
// in my plan if the programme changed.
export function useDayPlans(mode: 'plan' | 'sample') {
  const { plan: mine } = useDevice();
  const [edits, setEdits] = useEdits(mode);
  const response = useRecommendation(mode);
  const [base, setBase] = useState<Schedule | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { loadSchedule().then(setBase, e => setError(String(e.message ?? e))); }, []);
  const programme = useProgrammeUpdate();
  const data = programme?.schedule ?? base;
  const plan = mode === 'plan' ? mine : null;

  const view = useMemo(() => {
    if (!data || !base) return null;
    const tz = data.meta.timeZone;
    const days = conferenceDays(data.sessions, tz);
    const chosen = plan ? days.filter(d => plan.days.includes(d)) : days;
    const plans = planDays({ index: data.index, travelMinutes: data.travelMinutes, days }, response, plan, edits);
    // What moved: my plan on the deploy's programme vs the same plan's talks in the newer one.
    const before = programme ? planDays({ index: base.index, travelMinutes: base.travelMinutes, days }, response, plan, edits) : null;
    const changes = before ? diffStops(before.flatMap(p => p.stops), base.index, data.index) : [];
    const firstWithStops = plans.find((p, i) => p.stops.length && chosen.includes(days[i]))?.day ?? chosen[0] ?? days[0];
    return { tz, days, chosen, plans, firstWithStops, changes };
  }, [data, base, plan, edits, programme, response]);

  return { data, base, error, view, edits, setEdits, programme, response };
}
export type DayView = NonNullable<ReturnType<typeof useDayPlans>['view']>;
