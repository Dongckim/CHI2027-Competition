import { useEffect, useMemo, useRef, useState } from 'react';
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
              <Plan3D venue={schedule.venue} r={result.r} summary={result.d.summary} cues={result.d.cues} lines={result.d.lines} onStep={setStep} goStep={goStep} />
            </>)}
        </>)}
      </main>
      <div className="fixed inset-x-0 bottom-0 bg-bg px-gutter pt-2 pb-[calc(var(--safe-bottom)+12px)]">
        <div className="mx-auto max-w-[448px]"><Button size="lg" className="w-full" onClick={() => go(isDemo() ? 'sample' : 'today')}>I'm here</Button></div>
      </div>
    </div>
  );
}

// The 3D view (three.js, loaded now) with its three views, and "Hear the turns". If WebGL is missing it says so; the
// steps above are complete on their own.
type View = { mode: (m: string) => boolean; walk: (on: boolean) => boolean; step: (i: number) => void; walking: () => boolean; dispose: () => void };
function Plan3D({ venue, r, summary, cues, lines, onStep, goStep }: {
  venue: Venue; r: ReturnType<typeof findRoute>; summary: string; cues: { text: string }[]; lines: { text: string; node: string; level: string }[];
  onStep: (i: number) => void; goStep: { current: (i: number) => void };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  const [step, setStepHere] = useState(-1);
  const [walking, setWalking] = useState(false), [playing, setPlaying] = useState(false);
  const reduceMotion = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [floorsOnly, setFloorsOnly] = useState(false);
  const [view3d, setView] = useState<'original' | 'fit'>('original');
  const [cue, setCue] = useState(-1);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => {
    let cancelled = false;
    const reached = (i: number, end?: string) => { setStepHere(i); onStep(i); if (end) setPlaying(false); };
    import('../venue/view3d.js').then(({ mount }) => {
      if (cancelled || !canvas.current) return;
      try { view.current = mount(canvas.current, { venue, route: r, summary, steps: lines, onStep: reached, reduceMotion }); setState('ready'); } catch { setState('failed'); }
    }, () => setState('failed'));
    return () => { cancelled = true; view.current?.dispose(); view.current = null; stop.current?.(); };
  }, [venue, r, summary]); // eslint-disable-line react-hooks/exhaustive-deps -- lines and onStep follow the route
  goStep.current = i => { view.current?.step(i); setPlaying(false); };
  const pick = (m: 'original' | 'fit') => { setView(m); setWalking(false); setPlaying(false); view.current?.mode(m); };
  const walk = () => { const p = view.current?.walk(true) ?? false; setWalking(true); setPlaying(p); };
  const near = (d: number) => goStep.current(Math.min(lines.length - 1, Math.max(0, (step < 0 ? 0 : step + d))));
  const walkLabel = !walking ? 'Walk the route' : reduceMotion ? 'Next step' : playing ? 'Pause' : 'Walk on';
  return (
    <section aria-label="Floor plan" className="flex flex-1 flex-col gap-2">
      <div className="relative min-h-[140px] flex-1 overflow-hidden rounded-bar bg-surface">
        <canvas ref={canvas} className="absolute inset-0 size-full touch-none" />
        {state !== 'ready' && <p className="absolute inset-0 grid place-items-center text-small text-text-2">{state === 'loading' ? 'Floor plan' : 'The 3D plan cannot be shown here. The steps above are complete.'}</p>}
      </div>
      {state === 'ready' && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="3D view">
          <Button variant="outline" aria-pressed={view3d === 'original'} onClick={() => pick('original')}>Original angle</Button>
          <Button variant="outline" aria-pressed={view3d === 'fit'} onClick={() => pick('fit')}>Fit route</Button>
          <Button variant="outline" aria-pressed={floorsOnly} onClick={() => setFloorsOnly(!!view.current?.mode('floors'))}>Route floors only</Button>
        </div>
      )}
      {state === 'ready' && (
        // First person: walk the route at eye height; the step reached shows in the list above and here.
        <div className="flex gap-2" role="group" aria-label="Walk the route">
          <Button variant="outline" aria-label="Previous step" className="w-touch px-0" disabled={step <= 0} onClick={() => near(-1)}>‹</Button>
          <Button variant="outline" className="flex-1" aria-pressed={walking} onClick={walk}>{walkLabel}</Button>
          <Button variant="outline" aria-label="Next step" className="w-touch px-0" disabled={step >= lines.length - 1} onClick={() => near(1)}>›</Button>
        </div>
      )}
      {state === 'ready' && <p aria-live="polite" className="min-h-6 text-small">{step >= 0 ? `Step ${step + 1} of ${lines.length}: ${lines[step].text}` : walking ? '' : 'Tap a step to see it on the plan.'}</p>}
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
