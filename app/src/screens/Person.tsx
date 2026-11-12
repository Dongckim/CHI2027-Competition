import { useCallback, useState, type ReactNode } from 'react';
import { useExploreData, useMyDay } from '../explore/useExplore';
import { weekdayOf, clockOf, firstSlot } from '../explore/format';
import { go } from '../router';
import { Header } from '../components/Header';
import { Button, ButtonLink } from '../components/Button';
import { Toast, type ToastValue } from '../components/Toast';

// 07 Author (Figma 292:616): only what the programme says (docs/decisions/004): every affiliation the person is listed
// with, and their talks with time and room. No photo, no links elsewhere, no judgement of expertise.
export function Person({ personKey }: { personKey: string }) {
  const { data, error } = useExploreData();
  const { planned, add, today } = useMyDay();
  const [toast, setToast] = useState<ToastValue>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const header = <Header back={() => history.back()} search />;
  const page = (body: ReactNode) => <div className="mx-auto min-h-dvh max-w-[480px] bg-bg">{header}{body}</div>;
  if (error) return page(<p role="alert" className="px-gutter py-6 text-body">Could not load the programme. {error}</p>);
  if (!data) return page(<p className="px-gutter py-6 text-body text-text-3">Loading…</p>);
  const person = data.people[personKey];
  if (!person) return page(<p className="px-gutter py-6 text-body">This person is not in the programme any more.</p>);

  const tz = data.schedule.meta.timeZone;
  const { papers, rooms } = data.schedule.index;
  const talks = [...papers.values()].filter(p => p.authors.includes(personKey))
    .map(p => ({ p, slot: firstSlot(p.slots) })).sort((a, b) => (a.slot?.start ?? Infinity) - (b.slot?.start ?? Infinity));

  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-bg">
      {header}
      <main className="flex flex-col gap-4 px-gutter pt-2 pb-28">
        <h1 className="text-card-title font-semibold">{person.name}</h1>
        <ul className="flex flex-col gap-1">
          {person.affiliations.map(a => <li key={`${a.institution}|${a.country}`} className="text-small text-text-2">{a.institution} · {a.country}</li>)}
        </ul>
        <h2 className="text-small font-semibold">Their talks</h2>
        {talks.length ? (
          <ul className="flex flex-col">
            {talks.map(({ p, slot }) => (
              <li key={p.paperKey} className="flex items-start gap-3 border-b border-border py-3">
                <a href={`#/talk/${p.paperKey}`} className="flex flex-1 flex-col gap-1">
                  <span className="font-mono text-small text-text-2">{slot ? `${weekdayOf(slot.start, tz)} · ${clockOf(slot.start, tz)} · ${rooms.get(slot.roomKey)?.name ?? ''}` : 'Online'}</span>
                  <span className="text-body">{p.title}</span>
                </a>
                {slot && (planned.has(p.paperKey)
                  ? <span className="inline-flex min-h-touch items-center px-2 text-small text-text-2">Added</span>
                  : <Button variant="secondary" aria-label={`Add ${p.title}`} onClick={() => {
                    add(p.paperKey, slot.start, tz);
                    setToast({ text: `Added ${p.title} · ${weekdayOf(slot.start, tz)} ${clockOf(slot.start, tz)}`, action: today ? { label: 'View', run: () => go(today) } : undefined });
                  }}>+ Add</Button>)}
              </li>
            ))}
          </ul>
        ) : <p className="text-body text-text-2">No talks of their own in the programme.</p>}
        <p className="text-small text-text-2">They may not be at every session.</p>
        <p className="text-small text-text-3">Public programme data only. {data.schedule.meta.attribution}</p>
      </main>
      {talks[0] && (
        <div className="fixed inset-x-0 bottom-0 bg-bg px-gutter pt-3 pb-[calc(var(--safe-bottom)+12px)]">
          <div className="mx-auto max-w-[448px]"><ButtonLink href={`#/question/${talks[0].p.paperKey}`} className="w-full">Prepare a question</ButtonLink></div>
        </div>
      )}
      <Toast toast={toast} onClose={closeToast} bottom="calc(var(--safe-bottom) + 76px)" />
    </div>
  );
}
