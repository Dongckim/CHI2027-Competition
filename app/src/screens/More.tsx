import { useCallback, useState } from 'react';
import { candidatesFor } from '../state/device.js';
import { addItem, swapStop } from '../today/edits.js';
import { moreForYou, dayBounds } from '../today/more.js';
import { useDayPlans } from '../today/useDayPlans';
import { venueClock } from '../time.js';
import { isDemo } from '../clock';
import { useDevice } from '../state/useDevice';
import { go } from '../router';
import { Header } from '../components/Header';
import { Tag } from '../components/Tag';
import { Button } from '../components/Button';
import { LinkRow } from '../components/LinkRow';
import { Toast, type ToastValue } from '../components/Toast';

// 03-2 More for you: recommendations outside the plan that fit the day's free time (or one gap: Free time; Swap = that
// gap with one stop taken out). + Add puts the talk in and the planner plans again. Nothing fits → the next day.
const TAG: Record<string, string> = { paper: 'PAPER', poster: 'POSTER', demo: 'DEMO', other: 'TALK' };

export function More({ day, range, swap }: { day: string; range?: string; swap?: string }) {
  const { builtAt, plan: mine } = useDevice();
  const mode = !builtAt && isDemo() ? 'sample' : 'plan';
  const { data, view, edits, setEdits, response } = useDayPlans(mode);
  const [toast, setToast] = useState<ToastValue>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const back = mode === 'sample' ? 'sample' : 'today';
  if (!view || !data) return <><Header back={() => go(back)} title="More for you" /><p className="px-gutter py-6 text-body text-text-3">Loading…</p></>;

  const { tz, days, chosen, plans } = view;
  const dayPlan = plans[days.indexOf(day)] ?? plans[0];
  const at = (ms: number) => venueClock(ms, tz);
  const [from, to] = (range ?? '').split('-').map(Number);
  const gap = from && to ? { start: from, end: to, before: null as null | { roomKey: string }, after: null as null | { roomKey: string } } : null;
  if (gap) { // the stops around the gap, for walking times
    gap.before = [...dayPlan.stops].reverse().find(s => s.end <= gap.start && s.paperKey !== swap) ?? null;
    gap.after = dayPlan.stops.find(s => s.start >= gap.end && s.paperKey !== swap) ?? null;
  }
  const planForFit = swap ? { ...dayPlan, stops: dayPlan.stops.filter(s => s.paperKey !== swap) } : dayPlan;
  const candidates = mode === 'plan' ? candidatesFor(response, mine) : response.items.map(({ paperKey, relevance }) => ({ paperKey, relevance }));
  const items = moreForYou({ index: data.index, travelMinutes: data.travelMinutes, timeZone: tz }, candidates, edits, planForFit, dayBounds(data.sessions, day, tz), gap);
  const nextDay = chosen.find(d => d > day);
  const short = (d: string) => new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${d}T12:00:00Z`));
  const kind = (k: string) => TAG[response.items.find(i => i.paperKey === k)?.type ?? 'other'];
  const add = (k: string, startMs: number) => {
    setEdits(e => (swap ? swapStop(e, swap, k) : addItem(e, k)));
    setToast({ text: `Added ${data.index.papers.get(k)?.title ?? k} at ${at(startMs)}`, action: { label: 'View', run: () => go(back) } });
  };

  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-bg pb-24">
      <Header back={() => go(back)} title="More for you" />
      <main className="flex flex-col gap-3 px-gutter pt-3">
        <h1 className="text-card-title font-semibold">
          {gap ? `Free ${at(gap.start)}–${at(gap.end)}` : items.length ? `Fits your free time on ${short(day)}` : `Nothing else fits ${short(day)}`}
        </h1>
        {swap && <p className="text-small text-text-2">Swap for {data.index.papers.get(swap)?.title}</p>}
        {items.length > 0 ? (
          <ul className="flex flex-col">
            {items.map(m => (
              <li key={m.paperKey} className="flex items-start gap-3 border-b border-border py-3">
                <a href={`#/talk/${m.paperKey}`} className="flex flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5"><Tag>{kind(m.paperKey)}</Tag><span className="font-mono text-small text-text-2">~{at(m.slot.start)}</span></span>
                  <span className="text-body">{data.index.papers.get(m.paperKey)?.title}</span>
                </a>
                <Button variant="secondary" onClick={() => add(m.paperKey, m.slot.start)}>+ Add</Button>
              </li>
            ))}
          </ul>
        ) : (<>
          {gap && <p className="text-body text-text-2">Nothing else fits this time.</p>}
          {nextDay && <LinkRow href={`#/more/${nextDay}`}>{`See ${short(nextDay)}`}</LinkRow>}
        </>)}
      </main>
      <Toast toast={toast} onClose={closeToast} bottom="calc(var(--safe-bottom) + 16px)" />
    </div>
  );
}
