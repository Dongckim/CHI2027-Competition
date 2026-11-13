import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadSchedule, type Schedule } from '../data/load';
import { route as findRoute } from '../venue/route.js';
import { directions } from '../venue/directions.js';
import { playCues } from '../venue/sound.js';
import { REGISTRATION } from '../venue/walk.js';
import { useDayPlans } from '../today/useDayPlans';
import { firstSlot } from '../explore/format';
import { useDevice } from '../state/useDevice';
import { isDemo } from '../clock';
import { go } from '../router';
import { Header } from '../components/Header';
import { Button, ButtonLink } from '../components/Button';
import { ChoiceRow } from '../components/ChoiceRow';

// 09 Getting there (Figma 292:646) and 09-1 Where are you now (292:683): #/directions/<paperKey>[/from].
// From the stop before this one (or Registration, or a room or place picked in 09-1) to the talk's room, on the official
// venue plan. The written steps are the directions; the 3D view below them only helps, and loads when this screen opens.
// No location tracking: the app does not know where you are, you say it.

type Venue = Schedule['venue'];
type Place = { key: string; name: string; area: string; hint?: string };

// The start picked in 09-1, per talk, kept while 09 and 09-1 are open (not saved: it is only about now).
const picked = new Map<string, string>();
let fromDirections = false; // 09-1 opened from 09's Change: go back to it instead of stacking another 09

const roomLabel = (name: string) => name.replace(/^[A-Z]\d - /, ''); // "P1 - Room 117" → "Room 117"

function useStart(paperKey: string) {
  const state = useDevice();
  const mode = state.builtAt ? 'plan' : isDemo() ? 'sample' : null;
  const { data, view } = useDayPlans(mode ?? 'plan', !!mode);
  const [base, setBase] = useState<Schedule | null>(null);
  useEffect(() => { loadSchedule().then(setBase, () => {}); }, []);
  const schedule = data ?? base;
  // The planned stop for this talk (any day), and the stop before it that day: "Your last stop".
  let stop: { roomKey: string } | null = null, before: { roomKey: string } | null = null;
  for (const p of view?.plans ?? []) {
    const i = p.stops.findIndex((s: { paperKey: string }) => s.paperKey === paperKey);
    if (i >= 0) { stop = p.stops[i]; before = i > 0 ? p.stops[i - 1] : null; break; }
  }
  const paper = schedule?.index.papers.get(paperKey);
  const toKey: string | null = stop?.roomKey ?? (paper ? firstSlot(paper.slots)?.roomKey ?? null : null);
  return { schedule, paper, toKey, lastStop: before?.roomKey ?? null, stepFree: !!(state.builtAt && state.plan.needs.stepFree) };
}

function places(schedule: Schedule, lastStop: string | null): Place[] {
  const ed = schedule.venueMap;
  const name = (k: string) => roomLabel(schedule.index.rooms.get(k)?.name ?? k);
  const out: Place[] = [];
  if (lastStop && ed.rooms?.[lastStop]) out.push({ key: lastStop, name: name(lastStop), area: ed.rooms[lastStop], hint: 'Your last stop' });
  for (const p of ed.places ?? []) out.push({ key: `place:${p.id}`, name: p.name, area: p.area });
  return out;
}
const nameOf = (schedule: Schedule, key: string) => (key.startsWith('place:')
  ? schedule.venueMap.places?.find((p: { id: string }) => `place:${p.id}` === key)?.name ?? key
  : roomLabel(schedule.index.rooms.get(key)?.name ?? key));
const areaOf = (schedule: Schedule, key: string) => (key.startsWith('place:')
  ? schedule.venueMap.places?.find((p: { id: string }) => `place:${p.id}` === key)?.area
  : schedule.venueMap.rooms?.[key]);

export function Directions({ paperKey, sub }: { paperKey: string; sub?: string }) {
  const start = useStart(paperKey);
  if (sub === 'from') return <WhereNow paperKey={paperKey} {...start} />;
  return <GettingThere paperKey={paperKey} {...start} />;
}

type Start = ReturnType<typeof useStart> & { paperKey: string };

function GettingThere({ paperKey, schedule, toKey, lastStop, stepFree }: Start) {
  const fromKey = picked.get(paperKey) ?? lastStop ?? REGISTRATION;
  const back = () => history.back();
  const [step, setStep] = useState(-1); // the step the 3D plan shows (−1: none)
  const goStep = useRef<(i: number) => void>(() => {});
  const result = useMemo(() => {
    if (!schedule || !toKey) return null;
    const a = areaOf(schedule, fromKey), b = schedule.venueMap.rooms?.[toKey];
    if (!a || !b || !schedule.venue.areas[a] || !schedule.venue.areas[b]) return { missing: true as const };
    if (a === b) return { same: true as const };
    const r = findRoute(schedule.venue, a, b, { wheelchair: stepFree });
    if (!r) return { missing: true as const };
    return { r, d: directions(schedule.venue, schedule.venueLabels, r, { fromName: nameOf(schedule, fromKey), toName: nameOf(schedule, toKey) }) };
  }, [schedule, toKey, fromKey, stepFree]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-bg">
      <Header back={back} title="Getting there" />
      <main className="flex flex-1 flex-col gap-4 px-gutter pt-2 pb-28">
        {!schedule ? <p className="text-body text-text-3">Loading…</p> : !toKey ? (
          <p className="text-body">This talk has no room in the programme.</p>
        ) : (<>
          <div className="flex min-h-touch items-center gap-2 rounded-bar bg-surface py-2.5 pr-1 pl-4">
            <p className="flex-1 text-small">From {nameOf(schedule, fromKey)}</p>
            <a href={`#/directions/${paperKey}/from`} onClick={() => { fromDirections = true; }} className="inline-flex min-h-touch items-center px-3 text-small font-semibold underline">Change</a>
          </div>
          {result && 'same' in result ? <p className="text-body">You are already there.</p>
            : result && 'missing' in result ? <p className="text-body">No route on the venue plan for this room yet.</p>
            : result && (<>
              <p className="text-display leading-[1.3] font-semibold">{result.r.minutes[0]}–{result.r.minutes[1]} min</p>
              <p className="text-body leading-6">to {result.d.to} · {result.r.levels.at(-1)}{stepFree ? ' · step-free' : ''}</p>
              {/* Each step is a 44px row: tapping it shows that step on the plan. The step the plan is at is filled. */}
              <ol className="flex flex-col" aria-label="Steps">
                {result.d.lines.map((l: { text: string }, i: number) => (
                  <li key={i} aria-current={i === step ? 'step' : undefined}>
                    <button type="button" onClick={() => goStep.current(i)} className="flex min-h-touch w-full items-start gap-3 py-1 text-left">
                      <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-small font-semibold ${i === step ? 'bg-inverse text-on-inverse' : 'bg-surface'}`}>{i + 1}</span>
                      <span className="flex-1 text-body leading-6">{l.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <Plan3D venue={schedule.venue} r={result.r} summary={result.d.summary} cues={result.d.cues} lines={result.d.lines as Line[]} onStep={setStep} goStep={goStep} />
            </>)}
        </>)}
      </main>
      <div className="fixed inset-x-0 bottom-0 bg-bg px-gutter pt-2 pb-[calc(var(--safe-bottom)+12px)]">
        <div className="mx-auto max-w-[448px]"><Button size="lg" className="w-full" onClick={() => go(isDemo() ? 'sample' : 'today')}>I'm here</Button></div>
      </div>
    </div>
  );
}

// The 3D view (three.js, loaded now): the venue at the angle of the official plans. Previous / Next (or a sideways
// swipe) stop at each step, with a card on top: a big direction icon and the step's line. The steps above are complete
// on their own; if WebGL is missing the box says so.
type Line = { text: string; card: string; node: string; level: string; icon: string; dir: { x: number; y: number } | null };
type View = { show: (i: number) => void; mode: (m: string) => boolean; pad: (p: { top: number; bottom: number }) => void; dispose: () => void };
const ICON: Record<string, string> = { // 24px, stroke 2: which way to go
  right: 'M5 19V11a4 4 0 0 1 4-4h10M15 3l4 4-4 4', left: 'M19 19V11a4 4 0 0 0-4-4H5M9 3 5 7l4 4', straight: 'M12 21V4M6 10l6-6 6 6',
  up: 'M4 20h4l8-14h4M14 6h6v6', down: 'M4 4h4l8 14h4M14 18h6v-6', arrive: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
};

// Phones held sideways: the plan takes the whole screen by itself (no button needed), and goes back when turned upright.
const SIDEWAYS = '(orientation: landscape) and (max-height: 540px)';

function Plan3D({ venue, r, summary, cues, lines, onStep, goStep }: {
  venue: Venue; r: ReturnType<typeof findRoute>; summary: string; cues: { text: string }[]; lines: Line[];
  onStep: (i: number) => void; goStep: { current: (i: number) => void };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  const [step, setStepHere] = useState(-1);
  const stepRef = useRef(-1);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [shown, setShown] = useState<'whole' | 'route'>('whole');
  const [floorsOnly, setFloorsOnly] = useState(false);
  const [cue, setCue] = useState(-1);
  const stop = useRef<(() => void) | null>(null);
  const go = (i: number) => view.current?.show(Math.min(lines.length - 1, Math.max(-1, i)));
  useEffect(() => {
    let cancelled = false;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reached = (i: number) => { stepRef.current = i; setStepHere(i); onStep(i); if (i >= 0) setShown('whole'); };
    const swipe = (d: number) => go(stepRef.current + d);
    import('../venue/view3d.js').then(({ mount }) => {
      if (cancelled || !canvas.current) return;
      try { view.current = mount(canvas.current, { venue, route: r, summary, steps: lines, onStep: reached, onSwipe: swipe, reduceMotion }); setState('ready'); } catch { setState('failed'); }
    }, () => setState('failed'));
    return () => { cancelled = true; view.current?.dispose(); view.current = null; stop.current?.(); };
  }, [venue, r, summary]); // eslint-disable-line react-hooks/exhaustive-deps -- lines and onStep follow the route
  goStep.current = i => go(i);
  const line = step >= 0 ? lines[step] : null;

  // Large view: by turning the phone sideways, or with the button. The same canvas moves into a layer over the window
  // (no remount). From the button, where the browser allows it (Android Chrome), it also goes fullscreen and landscape;
  // iPhone Safari has neither for a page, so there the layer covers the window. Back, Esc or Close returns.
  const [sideways, setSideways] = useState(() => matchMedia(SIDEWAYS).matches);
  const [opened, setOpened] = useState(false); // from the button
  const [dismissed, setDismissed] = useState(false); // closed while sideways: stays closed until the phone is upright again
  useEffect(() => {
    const mq = matchMedia(SIDEWAYS);
    const change = () => { setSideways(mq.matches); if (!mq.matches) setDismissed(false); };
    mq.addEventListener('change', change); return () => mq.removeEventListener('change', change);
  }, []);
  const big = opened || (sideways && !dismissed);
  const openedRef = useRef(false);
  const close = (fromHistory = false) => {
    if (openedRef.current) {
      openedRef.current = false; setOpened(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      try { (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.(); } catch { /* not locked */ }
      if (!fromHistory) history.back(); // drop the entry added on opening
    } else setDismissed(true);
  };
  const open = () => {
    openedRef.current = true; setOpened(true);
    history.pushState({ arcPlan: true }, ''); // so Back closes the large view instead of leaving 09
    (canvas.current?.parentElement as HTMLElement | null)?.requestFullscreen?.({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
      .catch(() => { /* no fullscreen or lock here: the layer still covers the window */ });
  };
  useEffect(() => {
    if (!big) return;
    const pop = () => { if (openedRef.current) close(true); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const scroll = document.body.style.overflow; document.body.style.overflow = 'hidden';
    addEventListener('popstate', pop); addEventListener('keydown', key);
    return () => { document.body.style.overflow = scroll; removeEventListener('popstate', pop); removeEventListener('keydown', key); };
  }, [big]); // eslint-disable-line react-hooks/exhaustive-deps -- close() reads refs
  useEffect(() => () => { if (openedRef.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }, []);

  const nav = (cls = '') => (
    <div className={`flex gap-2 ${cls}`} role="group" aria-label="Steps on the plan">
      <Button variant="outline" aria-label="Previous step" className="w-touch bg-bg px-0" disabled={step < 0} onClick={() => go(step - 1)}>‹</Button>
      <Button className="min-w-0 flex-1" onClick={() => go(step + 1 >= lines.length ? -1 : step + 1)}>
        {step < 0 ? 'Show step 1' : step + 1 >= lines.length ? 'Whole plan' : `Next: step ${step + 2}`}
      </Button>
      <Button variant="outline" aria-label="Next step" className="w-touch bg-bg px-0" disabled={step >= lines.length - 1} onClick={() => go(step + 1)}>›</Button>
    </div>
  );
  // The view slides the step into the part of the plan the card and the bars leave free.
  const topRef = useRef<HTMLDivElement>(null), bottomRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { view.current?.pad({ top: topRef.current?.offsetHeight ?? 0, bottom: bottomRef.current?.offsetHeight ?? 0 }); });
  const seg = (label: string, pressed: boolean, onClick: () => void) => (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      className={`min-h-touch rounded-full px-3 text-small font-semibold ${pressed ? 'bg-inverse text-on-inverse' : 'text-text'}`}>{label}</button>
  );
  const bar = (
    <div role="group" aria-label="What the plan shows" className={`flex rounded-full p-0.5 ${big ? 'bg-bg/95 shadow' : 'self-start bg-surface'}`}>
      {seg('Whole', step < 0 && shown === 'whole', () => { setShown('whole'); view.current?.mode('original'); })}
      {seg('Route', step < 0 && shown === 'route', () => { setShown('route'); view.current?.mode('fit'); })}
      {seg('Floors', floorsOnly, () => setFloorsOnly(!!view.current?.mode('floors')))}
    </div>
  );
  return (
    <section aria-label="Floor plan" className="flex flex-1 flex-col gap-2">
      {/* At least 300 px (Figma's box is 140 px): the step card sits on top and the plan around the step needs room. */}
      <div role={big ? 'dialog' : undefined} aria-modal={big || undefined} aria-label={big ? 'Floor plan, large' : undefined}
        className={big ? 'fixed inset-0 z-50 bg-[var(--plan-bg)]' : 'relative min-h-[300px] flex-1 overflow-hidden rounded-bar bg-surface'}>
        <canvas ref={canvas} className="absolute inset-0 size-full touch-none" />
        {state !== 'ready' && <p className="absolute inset-0 grid place-items-center text-small text-text-2">{state === 'loading' ? 'Floor plan' : 'The 3D plan cannot be shown here. The steps above are complete.'}</p>}
        {state === 'ready' && (<>
          {/* top: the step card (same step as the list) and the large-view button */}
          <div ref={topRef} className={`absolute inset-x-0 top-0 flex items-start gap-2 ${big ? 'pt-[max(8px,env(safe-area-inset-top))] pr-[max(8px,env(safe-area-inset-right))] pl-[max(8px,env(safe-area-inset-left))]' : 'p-2'}`}>
            {line ? (
              <div aria-hidden={!big || undefined} aria-live={big ? 'polite' : undefined} className={`flex flex-1 items-center gap-3 rounded-bar bg-bg/95 p-2 pr-3 shadow ${big ? 'max-w-[520px]' : ''}`}>
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-inverse text-on-inverse">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[line.icon] ?? ICON.straight} /></svg>
                </span>
                <p className="flex-1 text-body leading-6"><span className="font-semibold">{step + 1}.</span> {line.card}</p>
              </div>
            ) : <span className="flex-1" />}
            <button type="button" aria-label={big ? 'Close the large plan' : 'Larger plan'} onClick={() => (big ? close() : open())}
              className="grid size-touch shrink-0 place-items-center rounded-full bg-bg/95 text-text shadow">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={big ? 'M18 6L12 12M12 12L6 18M12 12L6 6M12 12L18 18' : 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5'} />
              </svg>
            </button>
          </div>
          {/* large: what the view shows and the step buttons, over the plan (there is no room around it) */}
          {big && (
            <div ref={bottomRef} className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 pr-[max(8px,env(safe-area-inset-right))] pb-[max(8px,env(safe-area-inset-bottom))] pl-[max(8px,env(safe-area-inset-left))]">
              {bar}
              {nav('w-full max-w-[420px] rounded-bar bg-bg/95 p-2 shadow')}
            </div>
          )}
        </>)}
      </div>
      {/* in the page: the view bar under the plan, not on it, then the step buttons */}
      {state === 'ready' && !big && bar}
      {state === 'ready' && !big && nav()}
      {/* the step line is the card on the plan; screen readers hear it here */}
      {state === 'ready' && <p aria-live={big ? undefined : 'polite'} className={line ? 'sr-only' : 'min-h-6 text-small'}>{line ? `Step ${step + 1} of ${lines.length}: ${line.card}` : 'Swipe the plan or press Show step 1 to go step by step. Two fingers turn, tilt and zoom it; Whole goes back. Turn the phone sideways for a larger plan.'}</p>}
      <Button variant="outline" aria-pressed={cue >= 0} onClick={() => {
        if (stop.current) { stop.current(); stop.current = null; return; }
        stop.current = playCues(cues as never, (i: number) => { setCue(i); if (i < 0) stop.current = null; });
        if (!stop.current) setCue(-2);
      }}>{cue >= 0 ? 'Stop the sounds' : 'Hear the turns'}</Button>
      <p aria-live="polite" className="min-h-6 text-small text-text-2">{cue >= 0 ? `${cue + 1}. ${cues[cue].text}` : cue === -2 ? 'This browser cannot play the sounds.' : 'Headphones help: each turn sounds from its side.'}</p>
    </section>
  );
}

function WhereNow({ paperKey, schedule, lastStop }: Start) {
  const [query, setQuery] = useState('');
  const current = picked.get(paperKey) ?? lastStop ?? REGISTRATION;
  const choose = (key: string) => {
    picked.set(paperKey, key);
    if (fromDirections) { fromDirections = false; history.back(); } else go(`directions/${paperKey}`, { replace: true });
  };
  const experiment = (() => { try { return new URLSearchParams(location.search).get('experiments')?.split(',').includes('sign-scan') || localStorage.getItem('arc.experiments')?.includes('sign-scan'); } catch { return false; } })();
  if (!schedule) return <div className="mx-auto min-h-dvh max-w-[480px] bg-bg"><Header back={() => history.back()} title="Where are you now?" /><p className="px-gutter text-body text-text-3">Loading…</p></div>;
  const fixed = places(schedule, lastStop);
  // The start picked before (a room found by searching) stays in the list, so it can be seen and tapped again.
  if (!fixed.some(f => f.key === current) && areaOf(schedule, current)) fixed.unshift({ key: current, name: nameOf(schedule, current), area: areaOf(schedule, current), hint: 'Picked' });
  const q = query.trim().toLowerCase();
  // Every programme room on the venue plan, by its programme name, when the person types.
  const rooms: Place[] = q ? [...schedule.index.rooms.values()]
    .filter((r: { key: string; name: string }) => schedule.venueMap.rooms?.[r.key] && r.name.toLowerCase().includes(q))
    .map((r: { key: string; name: string }) => ({ key: r.key, name: roomLabel(r.name), area: schedule.venueMap.rooms[r.key] }))
    .sort((a: Place, b: Place) => a.name.localeCompare(b.name, 'en', { numeric: true })).slice(0, 20) : [];
  const shown = [...fixed.filter(p => !q || p.name.toLowerCase().includes(q)), ...rooms.filter(r => !fixed.some(f => f.key === r.key))];
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-bg">
      <Header back={() => history.back()} title="Where are you now?" />
      <main className="flex flex-col gap-4 px-gutter pt-2 pb-10">
        <label className="flex min-h-12 items-center gap-2 rounded-bar border-[length:var(--card-border)] border-border-strong px-3.5">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-text-2">
            <path d="M13.5 8.25C13.5 11.1495 11.1495 13.5 8.25 13.5C5.35051 13.5 3 11.1495 3 8.25C3 5.35051 5.35051 3 8.25 3C11.1495 3 13.5 5.35051 13.5 8.25Z" /><path d="M15 15L12 12" />
          </svg>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Room or place" aria-label="Room or place"
            className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-3" />
        </label>
        <div role="radiogroup" aria-label="Where are you now?" className="flex flex-col gap-2">
          {/* Picking a row (also the one already picked: a radio sends no change then) returns to 09 with that start. */}
          {shown.map(p => <div key={p.key} onClick={p.key === current ? e => { if ((e.target as HTMLElement).tagName === 'INPUT') choose(p.key); } : undefined}>
            <ChoiceRow type="radio" name="from" checked={p.key === current} onChange={() => choose(p.key)} label={p.name} hint={p.hint} />
          </div>)}
          {q && !shown.length && <p className="text-body text-text-2">No room or place by that name.</p>}
        </div>
        {experiment && <ButtonLink variant="outline" href={`#/signscan/${paperKey}`} className="self-start">Scan a room sign · experiment</ButtonLink>}
        <p className="text-small text-text-3">ARC does not track where you are. Pick the room or place you are at.</p>
      </main>
    </div>
  );
}
