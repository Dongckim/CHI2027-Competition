import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { loadAbstracts } from '../data/load';
import { talkPosition } from '../today/card.js';
import { highlightSegments, verifiedReasons } from '../explore/quotes.js';
import { authorLine } from '../explore/authors.js';
import { useExploreData, useMyDay } from '../explore/useExplore';
import { TYPE_TAG, dateOf, clockOf, weekdayOf, firstSlot, abstractFileDay } from '../explore/format';
import { useOnline } from '../data/offline';
import { useDevice } from '../state/useDevice';
import { go } from '../router';
import { Header } from '../components/Header';
import { Tag } from '../components/Tag';
import { Button, ButtonLink } from '../components/Button';
import { Toast, type ToastValue } from '../components/Toast';

// 06 Talk detail (Figma 292:590): what it is, when and where, whether it can be caught later, why it was recommended
// (only quotes that are really in the abstract, highlighted there), the abstract, Add to my day and Question.
// TODO(S7): "Summary · AI, from the abstract" in the person's language replaces the abstract heading.
type Reason = { conceptId: string; quote: string; start: number; end: number };

export function Talk({ paperKey }: { paperKey: string }) {
  const { data, error } = useExploreData();
  const { planned, add, response, today } = useMyDay();
  const { plan } = useDevice();
  // string = the abstract ('' = none in the programme) · null = loading · false = the day file could not be fetched
  const [abstract, setAbstract] = useState<string | null | false>(null);
  const online = useOnline();
  const [allAuthors, setAllAuthors] = useState(false);
  const [toast, setToast] = useState<ToastValue>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const p = data?.schedule.index.papers.get(paperKey);
  const tz = data?.schedule.meta.timeZone ?? 'UTC';
  const slot = p ? firstSlot(p.slots) : null;
  useEffect(() => {
    if (!p) return;
    let current = true; // a slower answer for the talk opened before must not replace this talk's abstract
    setAbstract(null);
    loadAbstracts(abstractFileDay(p.slots, tz)).then(a => current && setAbstract(a[paperKey] ?? ''), () => current && setAbstract(false));
    return () => { current = false; };
  }, [p, paperKey, online]); // eslint-disable-line react-hooks/exhaustive-deps -- back online: try the day file again

  const header = <Header back={() => history.back()} search />;
  if (error) return <Page>{header}<p role="alert" className="px-gutter py-6 text-body">Could not load the programme. {error}</p></Page>;
  if (!data) return <Page>{header}<p className="px-gutter py-6 text-body text-text-3">Loading…</p></Page>;
  if (!p) return <Page>{header}<p className="px-gutter py-6 text-body">This talk is not in the programme any more.</p></Page>;

  const { index, sessionSlots, timing } = data.schedule;
  const authors: string[] = p.authors;
  const line = authorLine(authors, k => data.people[k]?.name, allAuthors); // unnamed authors only count in "+n"
  const shownAuthors = line.shown;
  const slots = p.slots.filter((s: { start: number | null }) => s.start != null).sort((a: { start: number }, b: { start: number }) => a.start - b.start);
  const item = response?.items.find(i => i.paperKey === paperKey);
  const reasons: Reason[] = abstract ? verifiedReasons(item?.reasons, abstract) : [];
  const labels = new Map<string, string>([...(response?.topics ?? []), ...(response?.nearby ?? []), ...plan.topics].map(t => [t.conceptId, t.label]));
  const why = [...new Set(reasons.map(r => labels.get(r.conceptId) ?? r.conceptId.replace(/^[a-z]+:/, '').replace(/-/g, ' ')))];
  const inDay = planned.has(paperKey);

  return (
    <Page>
      {header}
      <main className="flex flex-col gap-4 px-gutter pt-2 pb-28">
        <Tag>{TYPE_TAG[p.type] ?? 'TALK'}</Tag>
        <h1 className="text-card-title font-semibold">{p.title}</h1>
        {/* Each name and "+n" is a 44px target (they wrap as a list, not as words in a sentence). */}
        <ul aria-label="Authors" className="-my-2 flex flex-wrap items-center gap-x-1 text-small text-text-2">
          {shownAuthors.map((k, i) => (
            <li key={k} className="flex items-center">
              <a href={`#/person/${k}`} className="inline-flex min-h-touch items-center underline">{data.people[k].name}</a>{i < shownAuthors.length - 1 && ','}
            </li>
          ))}
          {line.canExpand ? (
            <li><button type="button" onClick={() => setAllAuthors(a => !a)} aria-expanded={allAuthors}
              className="inline-flex min-h-touch min-w-touch items-center justify-center px-1 font-semibold underline">{allAuthors ? (line.more ? `fewer · +${line.more}` : 'fewer') : `+${line.more}`}</button></li>
          ) : line.more > 0 && <li className="inline-flex min-h-touch items-center px-1">+{line.more}</li>}
        </ul>
        <div className="flex flex-col gap-1">
          {slots.length ? slots.map((s: { start: number; roomKey: string; sessionKey: string }) => {
            const pos = talkPosition({ paperKey, start: s.start, sessionKey: s.sessionKey }, sessionSlots, timing.get(s.sessionKey));
            return (
              <p key={`${s.sessionKey}-${s.start}`} className="font-mono text-body">
                {dateOf(s.start, tz)} · {clockOf(s.start, tz)} · {index.rooms.get(s.roomKey)?.name ?? 'Room to be announced'}
                {pos && <span className="text-text-2"> · Talk {pos.index} of {pos.count}</span>}
              </p>
            );
          }) : <p className="text-body">Not presented in a room · online only</p>}
          {slots[0] && <p className="text-small text-text-3">{index.sessions.get(slots[0].sessionKey)?.name}</p>}
        </div>
        <p className="text-small font-semibold">{p.video ? 'Can catch later · video' : 'Only here now · no video'}</p>
        {p.doi && <a href={p.doi} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-touch items-center self-start text-small underline">Paper in the ACM Digital Library</a>}
        {why.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-small font-semibold">Why for you</h2>
            {why.map(label => <p key={label} className="text-body">Shares <b className="font-semibold">{label}</b> with your research.</p>)}
            <p className="text-small text-text-3">Highlighted and underlined below in the abstract.</p>
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="text-small font-semibold">Abstract · from the programme</h2>
          {abstract == null ? <p className="text-body text-text-3">Loading…</p> : abstract === false ? (
            <p className="text-body text-text-2">{online ? 'Could not load the abstract. Try again in a moment.' : 'Abstract not saved on this phone yet. Connect to load it.'}</p>
          ) : abstract ? (
            <p className="text-body whitespace-pre-line">
              {highlightSegments(abstract, reasons).map((seg, i) => seg.mark ? <mark key={i} className="rounded-[2px] bg-[var(--highlight)] text-text underline decoration-2 underline-offset-2">{seg.text}</mark> : <span key={i}>{seg.text}</span>)}
            </p>
          ) : <p className="text-body text-text-2">No abstract in the programme.</p>}
        </section>
        <p className="text-small text-text-3">{data.schedule.meta.attribution}</p>
      </main>
      <div className="fixed inset-x-0 bottom-0 bg-bg px-gutter pt-3 pb-[calc(var(--safe-bottom)+12px)]">
        <div className="mx-auto flex max-w-[448px] gap-2">
          <ButtonLink href={`#/question/${paperKey}`} variant="secondary" className="flex-1">Question</ButtonLink>
          {slot && (inDay
            ? <Button className="flex-1 opacity-60" disabled>In your day</Button>
            : <Button className="flex-1" onClick={() => {
              add(paperKey, slot.start, tz);
              setToast({ text: `Added · ${weekdayOf(slot.start, tz)} ${clockOf(slot.start, tz)}`, action: today ? { label: 'View', run: () => go(today) } : undefined });
            }}>Add to my day</Button>)}
        </div>
      </div>
      <Toast toast={toast} onClose={closeToast} bottom="calc(var(--safe-bottom) + 76px)" />
    </Page>
  );
}

const Page = ({ children }: { children: ReactNode }) => <div className="mx-auto min-h-dvh max-w-[480px] bg-bg">{children}</div>;
