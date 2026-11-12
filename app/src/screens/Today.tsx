import { useEffect, useMemo, useState } from 'react';
import { response } from '../data/fake-recommend';
import { planDay, TRAVEL_COST_PER_MIN } from '../planner/plan.js';
import { todayRows, candidatesFrom, conferenceDays } from '../today/rows.js';
import { candidatesFor, limitStops, HOW_FULL } from '../state/device.js';
import { useDevice, update } from '../state/useDevice';
import { go } from '../router';
import { loadSchedule, EDITION, type Schedule } from '../data/load';
import { Header } from '../components/Header';
import { DayTabs } from '../components/DayTabs';
import { NowCard } from '../components/NowCard';
import { RouteRow } from '../components/RouteRow';
import { Button } from '../components/Button';
import { LinkRow } from '../components/LinkRow';

// The recommendation is still the fake contract example (chi2026 Tuesday). No clock yet, so the first stop is shown as NEXT.
// mode: plan = the saved plan (topics, kinds, days, step-free, fewer room changes, how full) · sample = "Try a sample day",
// everything recommended, nothing saved · none = "Just browse", no plan yet.
if (response.dataVersion.edition !== EDITION) throw new Error(`fake response is for ${response.dataVersion.edition}, app data is ${EDITION}`);

export function Today({ mode }: { mode: 'plan' | 'sample' | 'none' }) {
  const { plan: mine } = useDevice();
  const [data, setData] = useState<Schedule | null>(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState('');
  useEffect(() => { loadSchedule().then(setData, e => setError(String(e.message ?? e))); }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const tz = data.meta.timeZone;
    const all = conferenceDays(data.sessions, tz);
    const chosen = mode === 'plan' ? all.filter(d => mine.days.includes(d)) : [];
    const days = chosen.length ? chosen : all;
    const candidates = mode === 'plan' ? candidatesFor(response, mine) : candidatesFrom(response);
    const options = mode === 'plan'
      ? { wheelchair: mine.needs.stepFree, travelCostPerMin: TRAVEL_COST_PER_MIN * (mine.needs.fewerRoomChanges ? 3 : 1) }
      : {};
    const plans = days.map(d => {
      const p = planDay(data.index, candidates, { day: d, travelMinutes: data.travelMinutes, ...options });
      return mode === 'plan' ? limitStops(p, HOW_FULL[mine.howFull as keyof typeof HOW_FULL]) : p;
    });
    const first = plans.find(p => p.stops.length)?.day ?? days[0];
    return { tz, days, plans, first };
  }, [data, mode, mine]);

  if (mode === 'none') return (
    <><Header />
      <div className="flex flex-col gap-4 px-gutter pt-3">
        <h1 className="text-card-title font-semibold">No plan yet</h1>
        <p className="text-body text-text-2">Tell ARC what you research and it plans your days.</p>
        <button type="button" onClick={() => { update(s => ({ ...s, mode: null })); go('start/research'); }}
          className="min-h-touch self-start rounded-button bg-inverse px-4 text-small font-semibold text-on-inverse">Plan my days</button>
      </div></>
  );

  if (error) return <><Header /><p role="alert" className="px-gutter py-6 text-body">Could not load the programme. {error}</p></>;
  if (!view || !data) return <><Header /><p className="px-gutter py-6 text-body text-text-3">Loading the programme…</p></>;

  const selected = day || view.first;
  const plan = view.plans[view.days.indexOf(selected)];
  const rows = todayRows(plan, response);
  const time = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: view.tz, hour: '2-digit', minute: '2-digit' }).format(ms);
  const weekday = new Intl.DateTimeFormat('en', { timeZone: view.tz, weekday: 'long' }).format(new Date(`${selected}T12:00:00Z`));
  const title = (k: string) => data.index.papers.get(k)?.title ?? k;
  const room = (k: string) => data.index.rooms.get(k)?.name ?? '';
  const [next, ...rest] = rows;

  return (
    <>
      <Header />
      {mode === 'sample' && (
        <div className="mx-gutter mt-2 flex items-center justify-between gap-3 rounded-[var(--radius-bar)] bg-inverse px-3 py-2 text-on-inverse">
          <span className="text-small font-semibold">Preview · sample day</span>
          <button type="button" onClick={() => go('start/research')} className="min-h-touch px-2 text-small underline">Make my own</button>
        </div>
      )}
      <div className="flex flex-col gap-4 pt-3">
        <DayTabs days={view.days} selected={selected} timeZone={view.tz} onSelect={setDay} />
        {next ? (
          <NowCard status="NEXT" where={`~${time(next.start)} · ${room(next.roomKey)}`} title={title(next.paperKey)}
            note={next.pickOf ? `Pick one of ${next.pickOf} talks at this time` : undefined}
            actions={<><Button className="flex-1">Directions</Button><Button variant="secondary" className="w-[104px]">Skip</Button></>} />
        ) : (
          <p className="px-gutter text-body text-text-3">Nothing picked for {weekday} yet.</p>
        )}
        {rest.length > 0 && (
          <section aria-labelledby="day-title" className="px-gutter">
            <div className="flex items-center justify-between">
              <h2 id="day-title" className="text-small font-semibold">Your {weekday} · {rows.length} stops</h2>
              <button type="button" className="-mr-2 min-h-touch px-2 text-link text-text-2 underline">Edit</button>
            </div>
            <ul>
              {rest.map(r => <RouteRow key={r.paperKey} time={time(r.start)} tag={r.tag} title={r.pickOf ? `Pick one of ${r.pickOf} talks` : title(r.paperKey)} />)}
            </ul>
          </section>
        )}
        <LinkRow href="#/explore">More for you</LinkRow>
        <p className="px-gutter pt-2 text-tag text-text-3">{data.meta.attribution}</p>
      </div>
    </>
  );
}
