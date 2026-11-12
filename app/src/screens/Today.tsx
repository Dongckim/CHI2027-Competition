import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { response } from '../data/fake-recommend';
import { localDay } from '../planner/plan.js';
import { todayRows, conferenceDays } from '../today/rows.js';
import { planDays } from '../today/plan-days.js';
import { dayCard, laterStops, talkPosition, WALK_MIN, FIRST_WALK_MIN } from '../today/card.js';
import { venueInstant, venueClock } from '../time.js';
import { useNow, setDemoNow, isDemo } from '../clock';
import { loadSchedule, EDITION, type Schedule } from '../data/load';
import { useDevice, update } from '../state/useDevice';
import { go } from '../router';
import { Header } from '../components/Header';
import { DayTabs } from '../components/DayTabs';
import { NowCard } from '../components/NowCard';
import { RouteRow } from '../components/RouteRow';
import { Button, ButtonLink } from '../components/Button';
import { LinkRow } from '../components/LinkRow';

// Today (Figma 288:1174). Recommendations (still the fake contract example) → planner → one planned day per date →
// the card for "now" from app/src/today/card.js. The time comes from app/src/clock.ts only.
// mode: plan = saved plan, real clock · sample = "Try a sample day" (03-P): the chi2026 day the sample recommends,
//   a slider sets the demo clock, nothing saved · none = "Just browse", no plan yet.
if (response.dataVersion.edition !== EDITION) throw new Error(`fake response is for ${response.dataVersion.edition}, app data is ${EDITION}`);

export const SLIDER = { min: 8 * 60 + 30, max: 18 * 60 + 30, step: 5, start: 8 * 60 + 40 }; // minutes of the venue day
const range = ([a, b]: number[]) => `${a}–${b} min`;

export function Today({ mode }: { mode: 'plan' | 'sample' | 'none' }) {
  const { plan: mine } = useDevice();
  const [data, setData] = useState<Schedule | null>(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState('');
  const [wholeDay, setWholeDay] = useState(false);
  const nowMs = useNow();
  useEffect(() => { loadSchedule().then(setData, e => setError(String(e.message ?? e))); }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const tz = data.meta.timeZone;
    const all = conferenceDays(data.sessions, tz);
    const chosen = mode === 'plan' ? all.filter(d => mine.days.includes(d)) : [];
    const days = chosen.length ? chosen : all;
    const plans = planDays({ index: data.index, travelMinutes: data.travelMinutes, days }, response, mode === 'plan' ? mine : null);
    const firstWithStops = plans.find(p => p.stops.length)?.day ?? days[0];
    return { tz, days, plans, firstWithStops };
  }, [data, mode, mine]);

  // Sample day: start the demo clock on the sample's day (kept while visiting a talk and coming back). Layout effect:
  // set before the first paint, so the real clock never flashes a "done" card on the sample day.
  useLayoutEffect(() => {
    if (mode === 'sample' && view && !isDemo()) setDemoNow(venueInstant(view.firstWithStops, SLIDER.start, view.tz));
  }, [mode, view]);

  if (mode === 'none') return (
    <><Header />
      <div className="flex flex-col gap-4 px-gutter pt-3">
        <h1 className="text-card-title font-semibold">No plan yet</h1>
        <p className="text-body text-text-2">Tell ARC what you research and it plans your days.</p>
        <Button className="self-start" onClick={() => { update(s => ({ ...s, mode: null })); go('start/research'); }}>Plan my days</Button>
      </div></>
  );
  if (error) return <><Header /><p role="alert" className="px-gutter py-6 text-body">Could not load the programme. {error}</p></>;
  if (!view || !data) return <><Header /><p className="px-gutter py-6 text-body text-text-3">Loading the programme…</p></>;

  const { tz, days, plans } = view;
  const today = mode === 'sample' ? view.firstWithStops : localDay(nowMs, tz);
  const selected = day || (days.includes(today) ? today : view.firstWithStops);
  const plan = plans[days.indexOf(selected)];
  const live = selected === today;
  const card = live ? dayCard(plan.stops, nowMs) : null;
  const rows: typeof plan.stops = live && card && !(card.kind === 'done' && wholeDay) ? laterStops(plan.stops, card) : plan.stops;
  const tags = new Map(todayRows(plan, response).map(r => [r.paperKey, r]));
  const weekday = (d: string, o: Intl.DateTimeFormatOptions = { weekday: 'long' }) => new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...o }).format(new Date(`${d}T12:00:00Z`));
  const title = (k: string) => data.index.papers.get(k)?.title ?? k;
  const room = (k: string) => data.index.rooms.get(k)?.name ?? '';
  const at = (ms: number) => venueClock(ms, tz);
  const nextDay = days.slice(days.indexOf(selected) + 1).find(d => plans[days.indexOf(d)].stops.length);

  return (
    <>
      <Header />
      {mode === 'sample' && <SampleBar day={today} tz={tz} nowMs={nowMs} />}
      <div className="flex flex-col gap-4 pt-3">
        <DayTabs days={days} selected={selected} timeZone={tz} onSelect={d => { setDay(d); setWholeDay(false); }} />
        {card && <TopCard card={card} plan={plan} data={data} at={at} title={title} room={room} weekday={weekday(selected)} short={`${weekday(selected, { weekday: 'short' })} ${weekday(selected, { day: 'numeric' })}`}
          onWholeDay={() => setWholeDay(w => !w)} wholeDay={wholeDay} />}
        {card?.kind === 'done' && nextDay && <LinkRow href={`#/${mode === 'sample' ? 'sample' : 'today'}`} onClick={() => setDay(nextDay)}>{`Your ${weekday(nextDay)} is ready`}</LinkRow>}
        {rows.length > 0 && (
          <section aria-labelledby="day-title" className="px-gutter">
            <div className="flex items-center justify-between">
              <h2 id="day-title" className="text-small font-semibold">
                {live && card ? `Your ${weekday(selected)} · ${card.done} of ${card.total}` : `Your ${weekday(selected)}`}
              </h2>
              <button type="button" className="-mr-2 min-h-touch px-2 text-link text-text-2 underline">Edit</button>
            </div>
            <ul>
              {rows.map(s => {
                const r = tags.get(s.paperKey);
                return <RouteRow key={s.paperKey} time={at(s.start)} tag={r?.tag ?? 'TALK'} href={`#/talk/${s.paperKey}`}
                  title={r?.pickOf ? `Pick one of ${r.pickOf} talks` : title(s.paperKey)} />;
              })}
            </ul>
          </section>
        )}
        {!plan.stops.length && <p className="px-gutter text-body text-text-3">Nothing planned for {weekday(selected)}.</p>}
        {card?.kind !== 'done' && <LinkRow href="#/explore">More for you</LinkRow>}
        <p className="px-gutter pt-2 text-tag text-text-3">{data.meta.attribution}</p>
      </div>
    </>
  );
}

type Card = ReturnType<typeof dayCard>;
function TopCard({ card, plan, data, at, title, room, weekday, short, onWholeDay, wholeDay }: {
  card: Card; plan: { stops: { paperKey: string }[] }; data: Schedule; at: (ms: number) => string; title: (k: string) => string; room: (k: string) => string;
  weekday: string; short: string; onWholeDay: () => void; wholeDay: boolean;
}) {
  if (card.kind === 'empty') return null;
  if (card.kind === 'done') return (
    <NowCard status="DONE" where={short} title={`Your ${weekday} is done`} note={`${card.total} of ${card.total} stops`}
      actions={<Button className="flex-1" onDark onClick={onWholeDay} aria-expanded={wholeDay}>{wholeDay ? 'Hide your day' : 'See your day'}</Button>} dark />
  );
  const s = card.stop!;
  const href = `#/talk/${s.paperKey}`;
  const isFirst = s.paperKey === plan.stops[0].paperKey;
  const walk = isFirst ? `${range(FIRST_WALK_MIN)} from Registration` : `${range(WALK_MIN)} walk`;
  const go = (variantDark = false) => (
    <><ButtonLink href={`#/directions/${s.paperKey}`} className="flex-1" onDark={variantDark}>Directions</ButtonLink>
      <Button variant="secondary" className="w-[104px]" onDark={variantDark}>Skip</Button></>
  );
  if (card.kind === 'now') {
    const pos = talkPosition(s, data.sessionSlots, data.timing.get(s.sessionKey));
    const where = pos ? `Talk ${pos.index} of ${pos.count} · ~${card.minutesIn} min in` : `~${card.minutesIn} min in · ${room(s.roomKey)}`;
    return (
      <NowCard status="NOW" where={where} title={title(s.paperKey)} href={href}
        note={pos?.missed ? `You missed ${pos.missed} earlier talk${pos.missed > 1 ? 's' : ''}` : undefined}
        actions={<><ButtonLink href={`#/catchup/${s.paperKey}`} className="flex-1">Catch up</ButtonLink>
          <ButtonLink href={`#/question/${s.paperKey}`} variant="secondary" className="w-[104px]">Question</ButtonLink></>} />
    );
  }
  const where = `~${at(s.start)} · ${room(s.roomKey)}`;
  if (card.kind === 'leave') return <NowCard status="LEAVE NOW" where={where} title={title(s.paperKey)} href={href} note={`Starts in ~${card.startsInMin} min · ${walk}`} actions={go(true)} dark />;
  return <NowCard status={card.kind === 'first' ? 'FIRST STOP' : 'NEXT'} where={where} title={title(s.paperKey)} href={href} note={walk} actions={go()} />;
}

// 03-P: the demo clock for judges and before the conference. Moving it re-times the whole app (clock.ts).
function SampleBar({ day, tz, nowMs }: { day: string; tz: string; nowMs: number }) {
  const [h, m] = venueClock(nowMs, tz).split(':').map(Number);
  const minutes = Math.min(SLIDER.max, Math.max(SLIDER.min, h * 60 + m));
  const label = (v: number) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
  const date = new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T12:00:00Z`));
  return (
    <div className="mx-gutter mt-2 flex flex-col gap-1 rounded-[var(--radius-bar)] bg-inverse px-3 py-2 text-on-inverse">
      <div className="flex items-center justify-between gap-3">
        <span className="text-small font-semibold">Preview · sample day</span>
        <button type="button" onClick={() => { setDemoNow(null); go('start/research'); }} className="min-h-touch px-2 text-small underline">Make my own</button>
      </div>
      <p className="text-tag text-on-inverse-2">{date} · CHI 2026 programme · venue time</p>
      <label className="flex items-center gap-3">
        <span className="w-12 font-mono text-body font-medium" aria-hidden="true">{label(minutes)}</span>
        <input type="range" min={SLIDER.min} max={SLIDER.max} step={SLIDER.step} value={minutes} aria-label="Time of day" aria-valuetext={label(minutes)}
          onChange={e => setDemoNow(venueInstant(day, Number(e.target.value), tz))} className="min-h-touch flex-1 accent-[var(--inverse-text)]" />
      </label>
    </div>
  );
}
