import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { localDay } from '../planner/plan.js';
import { todayRows } from '../today/rows.js';
import { dayCard, laterStops, talkPosition, walkNote, WALK_MIN, FIRST_WALK_MIN } from '../today/card.js';
import { walkMinutes, REGISTRATION } from '../venue/walk.js';
import { removeStop, pickOne } from '../today/edits.js';
import { freeGaps, dayBounds } from '../today/more.js';
import { offlineNote } from '../today/offline.js';
import { simulateRequested } from '../today/simulate.js';
import { useDayPlans, type DayView } from '../today/useDayPlans';
import { venueInstant, venueClock } from '../time.js';
import { useNow, setDemoNow, isDemo } from '../clock';
import type { Schedule } from '../data/load';
import { watchProgramme, simulateRoomChange, markSeen, seenRevision } from '../data/programme';
import { useOnline, savedAt, prefetchWhenIdle } from '../data/offline';
import { EXPLORE_FILES, abstractsUrl } from '../data/load';
import { abstractFileDay } from '../explore/format';
import { update } from '../state/useDevice';
import { addDay } from '../state/device.js';
import { go } from '../router';
import { Header } from '../components/Header';
import { DayTabs } from '../components/DayTabs';
import { NowCard } from '../components/NowCard';
import { RouteRow, FreeRow } from '../components/RouteRow';
import { Button, ButtonLink } from '../components/Button';
import { LinkRow } from '../components/LinkRow';
import { Toast, type ToastValue } from '../components/Toast';

// Today (Figma 288:1174, 288:1903). Recommendations (baseline-0 for a plan, the contract example on the sample day) → planner → one planned day per
// date, with the person's edits (Remove / Pick / Swap / Add) applied → the card for "now" (today/card.js). Time comes
// from app/src/clock.ts only.
// mode: plan = saved plan, real clock · sample = "Try a sample day" (03-P): the chi2026 day the sample recommends,
//   a slider sets the demo clock, edits kept in memory only · none = "Just browse", no plan yet (03-J).

export const SLIDER = { min: 8 * 60 + 30, max: 18 * 60 + 30, step: 5, start: 8 * 60 + 40 }; // minutes of the venue day
const weekday = (d: string, o: Intl.DateTimeFormatOptions = { weekday: 'long' }) => new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...o }).format(new Date(`${d}T12:00:00Z`));
const shortDay = (d: string) => `${weekday(d, { weekday: 'short' })} ${weekday(d, { day: 'numeric' })}`;

export function Today({ mode }: { mode: 'plan' | 'sample' | 'none' }) {
  useEffect(() => prefetchWhenIdle(EXPLORE_FILES), []); // after the first paint, when idle: Explore works offline later
  if (mode === 'none') return (
    <><Header />
      <div className="flex flex-col gap-4 px-gutter pt-3">
        <h1 className="text-card-title font-semibold">No plan yet</h1>
        <p className="text-body text-text-2">Tell ARC what you research and it plans your days.</p>
        <Button className="self-start" onClick={() => { update(s => ({ ...s, mode: null })); go('start/research'); }}>Plan my days</Button>
      </div></>
  );
  return <PlannedToday mode={mode} />;
}

function PlannedToday({ mode }: { mode: 'plan' | 'sample' }) {
  const { data, base, error, view, edits, setEdits, programme, response } = useDayPlans(mode);
  const [day, setDay] = useState('');
  const [wholeDay, setWholeDay] = useState(false);
  const [open, setOpen] = useState<string | null>(null); // row whose actions or choices are shown
  const [toast, setToast] = useState<ToastValue>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const nowMs = useNow();
  const online = useOnline();

  // Sample day: start the demo clock before the first paint (kept while visiting a talk and coming back).
  useLayoutEffect(() => {
    if (mode === 'sample' && view && !isDemo()) setDemoNow(venueInstant(view.firstWithStops, SLIDER.start, view.tz));
  }, [mode, view]);
  // Watch for programme updates while Today is open. Sample day only: ?simulate=room-change tries 03-M without a feed change.
  useEffect(() => (base ? watchProgramme(base) : undefined), [base]);
  // Offline talk details (06): the abstracts of the days I plan to be there (the sample day for the sample), and the
  // day file of each planned talk (a talk's abstract sits under the day of its first slot, which may be another day).
  const abstractDays = !view || !data ? '' : [...new Set([
    ...(mode === 'sample' ? [view.firstWithStops] : view.chosen),
    ...view.plans.filter(p => mode !== 'sample' || p.day === view.firstWithStops).flatMap(p => p.stops)
      .map((s: { paperKey: string }) => data.index.papers.get(s.paperKey)).filter(Boolean).map((p: { slots: [] }) => abstractFileDay(p.slots, view.tz)),
  ])].sort().join(',');
  useEffect(() => (abstractDays ? prefetchWhenIdle(abstractDays.split(',').map(abstractsUrl)) : undefined), [abstractDays]);
  useEffect(() => {
    if (!simulateRequested(mode, location.search) || !base || !view) return;
    const stops = view.plans.find(p => p.stops.length)?.stops ?? [];
    if (stops.length) simulateRoomChange(base, stops[Math.min(2, stops.length - 1)].paperKey);
  }, [base, !!view]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <><Header /><p role="alert" className="px-gutter py-6 text-body">Could not load the programme. {error}</p></>;
  if (!view || !data) return <><Header /><p className="px-gutter py-6 text-body text-text-3">Loading the programme…</p></>;

  const { tz, days, chosen, plans, changes } = view;
  const today = mode === 'sample' ? view.firstWithStops : localDay(nowMs, tz);
  const selected = day || (chosen.includes(today) ? today : view.firstWithStops);
  const plan = plans[days.indexOf(selected)];
  const attending = chosen.includes(selected);
  const live = attending && selected === today;
  // Walking minutes on the venue's routes: from the stop before, the first from Registration; step-free plans walk step-free.
  const walkOf = (stop: { roomKey: string }, i: number) =>
    walkMinutes(data.venue, data.venueMap, i > 0 ? plan.stops[i - 1].roomKey : REGISTRATION, stop.roomKey, { wheelchair: plan.wheelchair });
  const card = live ? dayCard(plan.stops, nowMs, walkOf) : null;
  const later = live && card && !(card.kind === 'done' && wholeDay) ? laterStops(plan.stops, card) : plan.stops;
  const tags = new Map(todayRows(plan, response).map(r => [r.paperKey, r]));
  const title = (k: string) => data.index.papers.get(k)?.title ?? k;
  const room = (k: string) => data.index.rooms.get(k)?.name ?? '';
  const at = (ms: number) => venueClock(ms, tz);
  const nextDay = chosen.filter(d => d > selected).find(d => plans[days.indexOf(d)].stops.length);
  const bounds = dayBounds(data.sessions, selected, tz);
  const back = mode === 'sample' ? 'sample' : 'today';

  // Free rows (03-I): gaps that hold a talk the person removed, shown where that talk was.
  const gaps = bounds ? freeGaps(plan.stops, bounds.start, bounds.end) : [];
  const removedHere = edits.removed.flatMap(k => (data.index.papers.get(k)?.slots as { start: number | null; end: number }[] | undefined)?.filter(s => s.start != null && localDay(s.start, tz) === selected) ?? []);
  const freeRows = gaps.filter(g => removedHere.some(s => s.start! >= g.start && s.end <= g.end) && (!card?.stop || g.start >= card.stop.start));
  const items = [...later.map((s: (typeof plan.stops)[number]) => ({ at: s.start, stop: s })), ...freeRows.map(g => ({ at: g.start, gap: g }))].sort((a, b) => a.at - b.at);

  const act = (text: string, change: Parameters<typeof setEdits>[0]) => {
    const before = edits;
    setEdits(change);
    setOpen(null);
    setToast({ text, action: { label: 'Undo', run: () => setEdits(() => before) } });
  };
  const remove = (k: string) => act(`Removed ${title(k)}`, e => removeStop(e, k));
  const swapHref = (k: string) => {
    const g = bounds && freeGaps(plan.stops.filter(s => s.paperKey !== k), bounds.start, bounds.end).find(x => plan.stops.some(s => s.paperKey === k && s.start >= x.start && s.end <= x.end));
    return g ? `#/more/${selected}/${g.start}-${g.end}?swap=${encodeURIComponent(k)}` : `#/more/${selected}`;
  };
  const moved = new Map(changes.map(c => [c.paperKey, c]));
  const what = (c: (typeof changes)[number]) => (c.kind === 'room' ? `moved to ${room(c.to)}` : c.kind === 'time' ? `moved to ~${at(c.to)}` : 'is no longer in the programme');
  const movedNote = (k: string) => { const c = moved.get(k); return c && what(c).replace(/^./, x => x.toUpperCase()).replace(/^Is no/, 'No'); };
  const showChange = programme && changes.length > 0 && seenRevision() !== programme.revision;
  const offline = offlineNote(online, savedAt()); // phone time

  return (
    <>
      <Header />
      {mode === 'sample' && <SampleBar day={today} tz={tz} nowMs={nowMs} onSimulate={() => {
        const s = plan.stops.at(-2) ?? plan.stops[0];
        if (base && s) simulateRoomChange(base, s.paperKey);
      }} />}
      {offline && <p role="status" className="mx-gutter mt-2 rounded-row bg-surface px-3 py-2 text-small font-semibold">{offline}</p>}
      {showChange && (
        <div role="alert" className="mx-gutter mt-2 flex items-center gap-3 rounded-row border-[length:var(--card-border)] border-text px-3 py-2">
          <p className="flex-1 text-small">
            Programme updated. {title(changes[0].paperKey)} {what(changes[0])}.
            {changes.length > 1 && ` +${changes.length - 1} more`}
          </p>
          <button type="button" onClick={() => markSeen(programme.revision)} className="min-h-touch px-3 text-small font-semibold underline">OK</button>
        </div>
      )}
      <div className="flex flex-col gap-4 pt-3">
        <DayTabs days={days} selected={selected} timeZone={tz} onSelect={d => { setDay(d); setWholeDay(false); setOpen(null); }} />
        {!attending && mode === 'plan' ? (
          // 03-K: a day the person is not at CHI
          <div className="flex flex-col gap-3 px-gutter">
            <h1 className="text-card-title font-semibold">You're not at CHI on {shortDay(selected)}</h1>
            <Button className="self-start" onClick={() => update(s => addDay(s, selected))}>Add this day</Button>
          </div>
        ) : (<>
          {card && <TopCard card={card} plan={plan} data={data} walkOf={walkOf} at={at} title={title} room={room} weekday={weekday(selected)} short={shortDay(selected)}
            onSkip={remove} onWholeDay={() => setWholeDay(w => !w)} wholeDay={wholeDay} />}
          {card?.kind === 'done' && nextDay && <LinkRow href={`#/${back}`} onClick={() => setDay(nextDay)}>{`Your ${weekday(nextDay)} is ready`}</LinkRow>}
          {items.length > 0 && (
            <section aria-labelledby="day-title" className="px-gutter">
              <div className="flex items-center justify-between">
                <h2 id="day-title" className="text-small font-semibold">
                  {live && card ? `Your ${weekday(selected)} · ${card.done} of ${card.total}` : `Your ${weekday(selected)}`}
                </h2>
                <button type="button" className="-mr-2 min-h-touch px-2 text-link text-text-2 underline">Edit</button>
              </div>
              <ul>
                {items.map(it => it.gap ? (
                  <FreeRow key={`free-${it.gap.start}`} from={at(it.gap.start)} to={at(it.gap.end)} href={`#/more/${selected}/${it.gap.start}-${it.gap.end}`} />
                ) : (() => {
                  const s = it.stop!;
                  const r = tags.get(s.paperKey);
                  const conflict = plan.conflicts.find(c => c.paperKey === s.paperKey);
                  if (r?.pickOf && conflict) {
                    // 03-H: pick one of the talks at the same time; the others go to More for you
                    const options = [s, ...conflict.alternatives];
                    return (
                      <RouteRow key={s.paperKey} time={at(s.start)} tag="PICK ONE" title={`Pick one of ${options.length} talks`} note={movedNote(s.paperKey)}
                        onOpen={() => setOpen(open === s.paperKey ? null : s.paperKey)} actionsOpen={open === s.paperKey}>
                        {options.map(o => (
                          <div key={o.paperKey} className="flex items-start gap-3 rounded-row border border-border-strong p-3">
                            <a href={`#/talk/${o.paperKey}`} className="flex flex-1 flex-col">
                              <span className="text-body">{title(o.paperKey)}</span>
                              <span className="text-small text-text-3">{room(o.roomKey)} · {data.index.papers.get(o.paperKey)?.video ? 'Can catch later' : 'Only here now'}</span>
                            </a>
                            <Button variant="secondary" onClick={() => act(`Picked ${title(o.paperKey)}`, e => pickOne(e, o.paperKey, options.filter(x => x.paperKey !== o.paperKey).map(x => x.paperKey)))}>Choose</Button>
                          </div>
                        ))}
                      </RouteRow>
                    );
                  }
                  return (
                    <RouteRow key={s.paperKey} time={at(s.start)} tag={r?.tag ?? 'TALK'} href={`#/talk/${s.paperKey}`} title={title(s.paperKey)} note={movedNote(s.paperKey)}
                      onMore={() => setOpen(open === s.paperKey ? null : s.paperKey)} actionsOpen={open === s.paperKey}>
                      <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => remove(s.paperKey)}>Remove</Button>
                        <ButtonLink variant="secondary" className="flex-1" href={swapHref(s.paperKey)}>Swap</ButtonLink>
                      </div>
                    </RouteRow>
                  );
                })())}
              </ul>
            </section>
          )}
          {!plan.stops.length && !freeRows.length && <p className="px-gutter text-body text-text-3">Nothing planned for {weekday(selected)}.</p>}
          {card?.kind !== 'done' && <LinkRow href={`#/more/${selected}`}>More for you</LinkRow>}
        </>)}
        <p className="px-gutter pt-2 text-small text-text-3">{data.meta.attribution}</p>
      </div>
      <Toast toast={toast} onClose={closeToast} bottom={mode === 'sample' ? 'calc(var(--safe-bottom) + 16px)' : undefined} />
    </>
  );
}

type Card = ReturnType<typeof dayCard>;
function TopCard({ card, plan, data, walkOf, at, title, room, weekday, short, onSkip, onWholeDay, wholeDay }: {
  card: Card; plan: DayView['plans'][number]; data: Schedule; walkOf: (stop: { roomKey: string }, i: number) => number[] | null;
  at: (ms: number) => string; title: (k: string) => string; room: (k: string) => string;
  weekday: string; short: string; onSkip: (k: string) => void; onWholeDay: () => void; wholeDay: boolean;
}) {
  if (card.kind === 'empty') return null;
  if (card.kind === 'done') return (
    <NowCard status="DONE" where={short} title={`Your ${weekday} is done`} note={`${card.total} of ${card.total} stops`}
      actions={<Button className="flex-1" onDark onClick={onWholeDay} aria-expanded={wholeDay}>{wholeDay ? 'Hide your day' : 'See your day'}</Button>} dark />
  );
  const s = card.stop!;
  const href = `#/talk/${s.paperKey}`;
  const i = plan.stops.indexOf(s), isFirst = i === 0;
  const minutes = walkOf(s, i) ?? (isFirst ? FIRST_WALK_MIN : WALK_MIN);
  const { text: walk, directions } = walkNote(minutes, { first: isFirst, sameRoom: !isFirst && plan.stops[i - 1]?.roomKey === s.roomKey });
  const buttons = (dark = false) => (
    <>{directions && <ButtonLink href={`#/directions/${s.paperKey}`} className="flex-1" onDark={dark}>Directions</ButtonLink>}
      <Button variant="secondary" className={directions ? 'w-[104px]' : 'flex-1'} onDark={dark} onClick={() => onSkip(s.paperKey)}>Skip</Button></>
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
  if (card.kind === 'leave') return <NowCard status="LEAVE NOW" where={where} title={title(s.paperKey)} href={href} note={`Starts in ~${card.startsInMin} min · ${walk}`} actions={buttons(true)} dark />;
  return <NowCard status={card.kind === 'first' ? 'FIRST STOP' : 'NEXT'} where={where} title={title(s.paperKey)} href={href} note={walk} actions={buttons()} />;
}

// 03-P: the demo clock for judges and before the conference. Moving it re-times the whole app (clock.ts).
function SampleBar({ day, tz, nowMs, onSimulate }: { day: string; tz: string; nowMs: number; onSimulate: () => void }) {
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
      <p className="text-small text-on-inverse-2">{date} · CHI 2026 programme · venue time</p>
      <label className="flex items-center gap-3">
        <span className="w-12 font-mono text-body font-medium" aria-hidden="true">{label(minutes)}</span>
        <input type="range" min={SLIDER.min} max={SLIDER.max} step={SLIDER.step} value={minutes} aria-label="Time of day" aria-valuetext={label(minutes)}
          onChange={e => setDemoNow(venueInstant(day, Number(e.target.value), tz))} className="min-h-touch flex-1 accent-[var(--inverse-text)]" />
      </label>
      <button type="button" onClick={onSimulate} className="min-h-touch self-start text-small underline">Simulate a room change</button>
    </div>
  );
}
