import { useEffect, useMemo, useState } from 'react';
import response from '../../../contracts/examples/RecommendResponse.chi2026-tuesday.json';
import { planDay } from '../planner/plan.js';
import { todayRows, candidatesFrom, conferenceDays } from '../today/rows.js';
import { loadProgramme, type Programme } from '../data/load';
import { Header } from '../components/Header';
import { DayTabs } from '../components/DayTabs';
import { NowCard } from '../components/NowCard';
import { RouteRow } from '../components/RouteRow';
import { Button } from '../components/Button';
import { LinkRow } from '../components/LinkRow';

// S0: the recommendation is the fake contract example (chi2026 Tuesday). No clock yet, so the first stop is shown as NEXT.
const EDITION = response.dataVersion.edition;

export function Today() {
  const [data, setData] = useState<Programme | null>(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState('');
  useEffect(() => { loadProgramme(EDITION).then(setData, e => setError(String(e.message ?? e))); }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const tz = data.meta.timeZone;
    const days = conferenceDays(data.sessions, tz);
    const plans = days.map(d => planDay(data.index, candidatesFrom(response), { day: d, travelMinutes: data.travelMinutes }));
    const first = plans.find(p => p.stops.length)?.day ?? days[0];
    return { tz, days, plans, first };
  }, [data]);

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
