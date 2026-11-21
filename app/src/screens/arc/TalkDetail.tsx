// 14 · Talk detail (Figma 597:972): angle and format, title, why this angle (the abstract sentence), when and where with
// the session, every author with "✦ New to CHI" for each one new (user decision), "I heard it", the paper (DOI) and the
// Q&A (api/qa, decision 007). The whole abstract opens below with the sentence marked.
import { useEffect, useState } from 'react';
import { loadSchedule, loadPeople, loadAbstracts, loadDebut, type Schedule } from '../../data/load';
import { highlightSegments } from '../../explore/quotes.js';
import { keySegments } from '../../arc/keyPhrase.js';
import { abstractFileDay, firstSlot, dateOf, clockOf } from '../../explore/format';
import { talkPosition } from '../../today/card.js';
import { getArc, loadArcs } from '../../arc/store';
import { currentArcId, useTribe, viewingArc } from '../../arc/live';
import { useDevice, update } from '../../state/useDevice';
import { heardOf, toggleHeard } from '../../arc/draft.js';
import { useNow } from '../../clock.js';
import { Screen, BackButton, IconButton, Pic } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import { ANGLE_ICON } from './ArcView';
import external from '../../assets/arc/icon-external.svg';
import clock from '../../assets/arc/icon-clock.svg';
import pin from '../../assets/arc/icon-pin.svg';
import person from '../../assets/arc/icon-person.svg';
import sparkle from '../../assets/arc/icon-sparkle.svg';
import check from '../../assets/arc/icon-check.svg';
import talk from '../../assets/arc/icon-talk.svg';
import poster from '../../assets/arc/icon-poster.svg';
import demo from '../../assets/arc/icon-demo.svg';
import panel from '../../assets/arc/icon-panel.svg';
import meetup from '../../assets/arc/icon-meetup.svg';
import keynote from '../../assets/arc/icon-keynote.svg';
import type { Arc, ArcNode } from '../../engine';
import { useQandA, QandAList, QandAAsk } from './QandA';

type People = Awaited<ReturnType<typeof loadPeople>>;
type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
type Paper = { title: string; feedType: string; authors: string[]; doi: string | null; slots: Slot[] };
const FORMAT: Record<string, [string, string]> = {
  Paper: [talk, 'Paper talk'], Journals: [talk, 'Paper talk'], Posters: [poster, 'Poster'], 'Student Research Competition': [poster, 'Poster'],
  'Interactive Demos': [demo, 'Demo'], Panels: [panel, 'Panel'], 'Meet-Ups': [meetup, 'SIG & meetup'], 'Plenary and Keynote': [keynote, 'Keynote'],
};
const WHY = { S: 'WHY IT SUPPORTS', R: 'WHY IT REFRAMES', T: 'WHY IT CHALLENGES' } as const;
const AUTHORS_SHOWN = 4;

const Tag = ({ icon, children }: { icon: string; children: React.ReactNode }) =>
  <span className="inline-flex items-center gap-1.5 rounded-2xl border border-arc-line bg-arc-surface py-1.5 pr-3 pl-2.5 text-[13px] font-semibold"><Pic src={icon} size={14} />{children}</span>;

export function TalkDetail({ paperKey }: { paperKey: string }) {
  const [data, setData] = useState<{ schedule: Schedule; people: People; debut: Set<string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [abstract, setAbstract] = useState<string | null>(null);
  const [found, setFound] = useState<{ arc: Arc; node: ArcNode } | null>(null);
  const [allAuthors, setAllAuthors] = useState(false);
  const [debutNote, setDebutNote] = useState<string | null>(null);
  const heard = heardOf(useDevice()).has(paperKey);
  const qa = useQandA(paperKey);
  const now = useNow();
  useEffect(() => {
    Promise.all([loadSchedule(), loadPeople(), loadDebut()]).then(([schedule, people, debut]) => setData({ schedule, people, debut: new Set(debut) }), () => setFailed(true));
  }, []);
  useEffect(() => { // the Arc opened last, else the newest Arc with this talk
    (async () => {
      const id = currentArcId();
      const v = viewingArc(); // 18 Just read: not saved
      const arcs = [...(v && v.id === id ? [v] : []), ...(id ? [await getArc(id)] : []), ...(await loadArcs())].filter((a): a is Arc => !!a);
      const arc = arcs.find(a => a.nodes.some(n => n.key === paperKey));
      setFound(arc ? { arc, node: arc.nodes.find(n => n.key === paperKey)! } : null);
    })();
  }, [paperKey]);
  const p = data?.schedule.index.papers.get(paperKey) as Paper | undefined;
  useEffect(() => {
    if (!p || !data) return;
    let live = true;
    loadAbstracts(abstractFileDay(p.slots, data.schedule.meta.timeZone)).then(a => live && setAbstract(a[paperKey] ?? ''), () => live && setAbstract(''));
    return () => { live = false; };
  }, [p, data, paperKey]);
  useTribe(found?.arc.tribe);

  const header = (doi?: string | null) => <><BackButton />{doi ? <IconButton icon={external} label="Open the paper (ACM DL)" href={doi} /> : <span />}</>;
  if (failed) return <Screen header={header()} label="Talk"><p role="alert" className="mt-6 text-[16px]">Could not load the programme.</p></Screen>;
  if (!data) return <Screen header={header()} label="Talk"><p className="mt-6 text-[16px] text-arc-text-3">Loading…</p></Screen>;
  if (!p) return <Screen header={header()} label="Talk"><p className="mt-6 text-[16px]">This talk is not in the programme any more.</p></Screen>;

  const { schedule, people, debut } = data;
  const tz = schedule.meta.timeZone;
  const slot = firstSlot(p.slots);
  const room = slot ? schedule.index.rooms.get(slot.roomKey)?.name : null;
  const session = slot ? (schedule.sessions as { key: string; name: string }[]).find(s => s.key === slot.sessionKey) : null;
  const pos = slot ? talkPosition({ paperKey, start: slot.start, sessionKey: slot.sessionKey }, schedule.sessionSlots, schedule.timing.get(slot.sessionKey)) : null;
  const [fIcon, fName] = FORMAT[p.feedType] ?? [talk, p.feedType];
  const ev = found?.node.evidence;
  const quote = ev ? [{ quote: ev.sentence, start: ev.start, end: ev.end }] : [];
  const named = p.authors.filter(k => people[k]?.name);
  const authors = allAuthors ? named : named.slice(0, AUTHORS_SHOWN);
  const started = slot ? slot.start <= now : false;

  return (
    <Screen clock header={header(p.doi)} label="Talk"
      bottom={<QandAAsk qa={qa} />}>
      <div className="mt-1 flex flex-wrap gap-2">
        {found && <Tag icon={ANGLE_ICON[found.node.angle]}>{ANGLE_NAME[found.node.angle]}</Tag>}
        <Tag icon={fIcon}>{fName}</Tag>
      </div>
      <h1 className="mt-3.5 text-[24px] leading-[30px] font-semibold tracking-[-0.02em]">{p.title}</h1>

      {found && (
        <section aria-labelledby="why" className="mt-4 flex flex-col gap-1.5 rounded-[20px] border border-arc-line bg-arc-surface px-4 pt-3.5 pb-4">
          {/* Figma 11px; 12px is the floor */}
          <h2 id="why" className="text-[12px] font-medium tracking-[0.08em] text-arc-text/50">{WHY[found.node.angle]}</h2>
          {ev ? <p className="text-[15px] leading-[22px] text-arc-text/90">“{keySegments(ev.sentence, found.arc.query, found.node.angle).map((x, i) => x.mark
            ? <strong key={i} className="font-semibold underline decoration-1 underline-offset-2">{x.text}</strong> : <span key={i}>{x.text}</span>)}”</p>
            : <p className="text-[15px] leading-[22px] text-arc-text-2">No sentence of the abstract was clear enough to quote.</p>}
        </section>
      )}

      <ul className="mt-6 flex flex-col gap-3.5">
        <li className="flex items-start gap-3 text-[15px] font-medium"><Pic src={clock} size={20} />
          <span>{slot ? `${dateOf(slot.start, tz)} · ${clockOf(slot.start, tz)}` : 'Time to be announced'}{room && ` · ${room}`}</span></li>
        {session && <li className="flex items-start gap-3 text-[15px]"><Pic src={pin} size={20} />
          <span>{session.name}{pos && <span className="text-arc-text-2"> · talk {pos.index} of {pos.count}</span>}</span></li>}
        {authors.map(k => {
          const a = people[k]!, isNew = debut.has(k);
          return (
            <li key={k} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] font-medium">
                <Pic src={person} size={20} />
                <span>{a.name}{a.affiliations[0] && <span className="text-arc-text-2"> · {a.affiliations[0].institution}</span>}</span>
                {isNew && (
                  <button type="button" onClick={() => setDebutNote(n => (n === k ? null : k))} aria-expanded={debutNote === k}
                    className="relative inline-flex h-6 items-center gap-1 rounded-xl border border-arc-line bg-arc-surface pr-2.5 pl-2 text-[12px] font-semibold before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']">
                    <Pic src={sparkle} size={12} />New to CHI
                  </button>
                )}
              </div>
              {debutNote === k && <p className="pl-8 text-[13px] text-arc-text-2">No paper under this name in CHI 2023–2025.</p>}
            </li>
          );
        })}
        {named.length > AUTHORS_SHOWN && (
          <li><button type="button" onClick={() => setAllAuthors(v => !v)} aria-expanded={allAuthors} className="min-h-touch pl-8 text-[14px] font-semibold text-arc-text-2 underline">
            {allAuthors ? 'Fewer authors' : `+${named.length - AUTHORS_SHOWN} more authors`}</button></li>
        )}
      </ul>

      {started && (
        <button type="button" onClick={() => update(s => toggleHeard(s, paperKey))} aria-pressed={heard}
          className={`mt-5 inline-flex min-h-touch items-center gap-2 self-start rounded-full px-4 text-[15px] font-semibold ${heard ? 'bg-arc-chip-on text-arc-on-primary' : 'border border-arc-line bg-arc-surface'}`}>
          {heard && <img src={check} alt="" width={18} height={18} className="brightness-0" />}{heard ? 'Heard' : 'I heard it'}
        </button>
      )}

      {abstract && (
        <details className="mt-5">
          <summary className="min-h-touch cursor-pointer py-2.5 text-[15px] font-semibold">Full abstract</summary>
          <p className="text-[15px] leading-6 text-arc-text-2">
            {highlightSegments(abstract, quote).map((s, i) => s.mark
              ? <mark key={i} className="bg-transparent font-semibold text-arc-text underline decoration-1 underline-offset-2">{s.text}</mark>
              : <span key={i}>{s.text}</span>)}
          </p>
        </details>
      )}

      <hr className="mt-6 border-arc-line" />
      <QandAList qa={qa} />
      <p className="mt-8 mb-4 text-[12px] text-arc-text-3">Programme data © ACM CHI 2026, licensed under CC BY-NC-SA 4.0.</p>
    </Screen>
  );
}
