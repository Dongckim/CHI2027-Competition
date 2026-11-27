// 14 · Talk detail (Figma 597:972): angle and format, title, why this angle (the abstract sentence), when and where with
// the session, every author with a ✦ after a name new to CHI and one line saying what it means (user 11/25), "I heard it", the paper (DOI) and the
// Q&A (api/qa, decision 007). The whole abstract opens below with the sentence marked.
import { useCallback, useEffect, useState } from 'react';
import { loadSchedule, loadPeople, loadAbstracts, loadDebut, type Schedule } from '../../data/load';
import { highlightSegments } from '../../explore/quotes.js';
import { keySegments } from '../../arc/keyPhrase.js';
import { abstractFileDay, firstSlot, dateOf, clockOf } from '../../explore/format';
import { talkPosition } from '../../today/card.js';
import { getArc, loadArcs } from '../../arc/store';
import { currentArcId, useTribe, viewingArc } from '../../arc/live';
import { useDevice, update } from '../../state/useDevice';
import { heardOf, toggleHeard, arcOf, setTalkTourSeen } from '../../arc/draft.js';
import { MapTour, TALK_TOUR } from './MapTour';
import { useNow } from '../../clock.js';
import { Screen, BackButton, IconButton, Pic } from '../../components/arc';
import { ANGLE_NAME, KIND_NAME } from './AngleHelp';
import { ANGLE_ICON } from './ArcView';
import external from '../../assets/arc/icon-external.svg';
import clock from '../../assets/arc/icon-clock.svg';
import pin from '../../assets/arc/icon-pin.svg';
import person from '../../assets/arc/icon-person.svg';
import check from '../../assets/arc/icon-check.svg';
import talk from '../../assets/arc/icon-talk.svg';
import poster from '../../assets/arc/icon-poster.svg';
import demo from '../../assets/arc/icon-demo.svg';
import panel from '../../assets/arc/icon-panel.svg';
import meetup from '../../assets/arc/icon-meetup.svg';
import keynote from '../../assets/arc/icon-keynote.svg';
import type { Arc, ArcNode } from '../../engine';
import { useQandA, QandAList, QandAAsk } from './QandA';
import { AfterSession, ShowShape, roomLabelOf, takeBackY, type Stop } from './Meet';
import { previousStop, walkSummary } from '../../arc/talk.js';
import { minutesText } from '../../venue/directions.js';
import { localDay } from '../../planner/plan.js';
import { venueClock } from '../../time.js';
import { chairOf, shortRoom } from './useArc';
import { go, href } from '../../router';
import { Interpret } from './Interpret';
import translate from '../../assets/arc/icon-translate.svg';

type People = Awaited<ReturnType<typeof loadPeople>>;
type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
type Paper = { title: string; feedType: string; authors: string[]; doi: string | null; slots: Slot[]; first?: string | null };
export const FORMAT: Record<string, [string, string]> = {
  Paper: [talk, 'Paper talk'], Journals: [talk, 'Paper talk'], Posters: [poster, 'Poster'], 'Student Research Competition': [poster, 'Poster'],
  'Interactive Demos': [demo, 'Demo'], Panels: [panel, 'Panel'], 'Meet-Ups': [meetup, 'SIG & meetup'], 'Plenary and Keynote': [keynote, 'Keynote'],
};
const WHY = { S: 'WHY IT SUPPORTS', R: 'WHY IT REFRAMES', T: 'WHY IT CHALLENGES' } as const;
const AUTHORS_SHOWN = 4;

export const Tag = ({ icon, children }: { icon: string; children: React.ReactNode }) =>
  <span className="inline-flex items-center gap-1.5 rounded-2xl border border-arc-line bg-arc-surface py-1.5 pr-3 pl-2.5 text-[13px] font-semibold"><Pic src={icon} size={14} />{children}</span>;

export function TalkDetail({ paperKey, shape = false, interpret = false }: { paperKey: string; shape?: boolean; interpret?: boolean }) {
  const [data, setData] = useState<{ schedule: Schedule; people: People; debut: Set<string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [abstract, setAbstract] = useState<string | null>(null);
  const [found, setFound] = useState<{ arc: Arc; node: ArcNode } | null>(null);
  const [inArcs, setInArcs] = useState(0); // user 11/25 D: how many of your saved Arcs lead here
  const [allAuthors, setAllAuthors] = useState(false);
  // the first talk opened after the map's tour (so only someone who has just made their first Arc) gets 14's tour, once
  const dev = arcOf(useDevice());
  const [tour, setTour] = useState(false);
  const due = !!dev.tour && !dev.talkTour;
  useEffect(() => { if (!due) return; const t = setTimeout(() => setTour(true), 900); return () => clearTimeout(t); }, [due]);
  const endTour = useCallback(() => { setTour(false); update(setTalkTourSeen); }, []);
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
      setInArcs((await loadArcs()).filter(a => a.nodes.some(n => n.key === paperKey)).length);
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
  // App scrolls to the top on every route; coming back from 14f (Show my shape) returns to where 14 was
  useEffect(() => {
    const back = shape ? 0 : takeBackY();
    if (back) requestAnimationFrame(() => scrollTo(0, back));
  }, [shape]);

  // live: 14b's "Now · Room 111 · Talk 3 of 7" next to Back (Figma 744:1677/1678: a 7px dot 12 after Back, the words 7 after it)
  const header = (doi?: string | null, live?: string | null) => <><BackButton />
    {live && <p className="ml-3 flex min-w-0 flex-1 items-center gap-[7px] text-[12px] font-medium text-arc-text-2">
      {/* Figma #FF8E86 (also the Health tribe's colour); the word Now says it, the dot only decorates */}
      <span aria-hidden="true" className="size-[7px] shrink-0 translate-y-[0.5px] rounded-full bg-[#ff8e86]" /><span className="-translate-y-[1.5px] truncate">{live}</span></p>}
    <span className="flex gap-2">{doi && <IconButton icon={external} label="Open the paper (ACM DL)" href={doi} />}
      {/* prototype 14b: talk to the authors in your own language (14g) */}
      <IconButton icon={translate} label="Talk face to face, interpreted" href={href(`talk/${paperKey}/interpret`)} /></span></>;
  if (failed) return <Screen header={header()} label="Talk"><p role="alert" className="mt-6 text-[16px]">Could not load the programme.</p><p className="mt-2 text-[14px] text-arc-text-2">Connect to the internet once and try again.</p><button type="button" onClick={() => location.reload()} className="mt-5 h-11 self-start rounded-full border border-arc-line px-5 text-[15px] font-semibold">Try again</button></Screen>;
  if (!data) return <Screen header={header()} label="Talk"><p className="mt-6 text-[16px] text-arc-text-3">Loading…</p></Screen>;
  if (!p) return <Screen header={<BackButton />} label="Talk"><p className="mt-6 text-[16px]">We couldn't find this talk in the CHI programme.</p><a href={href('home')} className="mt-4 inline-flex min-h-touch items-center text-[15px] font-semibold underline">Go to My Arcs</a></Screen>; // no translate icon for a talk that isn't there

  const { schedule, people, debut } = data;
  const tz = schedule.meta.timeZone;
  const slot = firstSlot(p.slots);
  const room = slot ? schedule.index.rooms.get(slot.roomKey)?.name : null;
  const session = slot ? (schedule.sessions as { key: string; name: string; end: number | null }[]).find(s => s.key === slot.sessionKey) : null;
  const pos = slot ? talkPosition({ paperKey, start: slot.start, sessionKey: slot.sessionKey }, schedule.sessionSlots, schedule.timing.get(slot.sessionKey)) : null;
  const [fIcon, fName] = FORMAT[p.feedType] ?? [talk, p.feedType];
  const ev = found?.node.evidence;
  const quote = ev ? [{ quote: ev.sentence, start: ev.start, end: ev.end }] : [];
  const named = p.authors.filter(k => people[k]?.name);
  const authors = allAuthors ? named : named.slice(0, AUTHORS_SHOWN);
  const started = slot ? slot.start <= now : false;
  const roomRow = slot ? schedule.index.rooms.get(slot.roomKey) as { key: string; name: string } | undefined : null;
  const roomName = roomRow ? roomLabelOf(schedule, roomRow) : null;
  // 14b: the talk is on now (its own start and end, computed from the session); nothing is saved for it
  const live = !!slot && slot.start <= now && now < slot.end;
  const liveText = live ? ['Now', roomName, pos && `Talk ${pos.index} of ${pos.count}`].filter(Boolean).join(' · ') : null;
  // 14e: the Arc stop right before this talk, the same day (Arc nodes carry no time: their first slot)
  const stops: Stop[] = (found?.arc.nodes ?? []).flatMap(n => {
    const s = firstSlot((schedule.index.papers.get(n.key) as Paper | undefined)?.slots ?? []);
    return s ? [{ key: n.key, start: s.start, roomKey: s.roomKey }] : [];
  });
  const prev = slot ? previousStop(stops, paperKey, slot.start, tz) as Stop | null : null;
  // user 11/25 「14 "다음 정류장 시간·방·걷는 분"」: the Arc's next stop the same day after this talk ends
  const next = slot ? stops.filter(x => x.key !== paperKey && x.start >= slot.end && localDay(x.start, tz) === localDay(slot.start, tz)).sort((a, b) => a.start - b.start)[0] ?? null : null;
  const nextRoom = next ? (schedule.index.rooms.get(next.roomKey) as { name: string } | undefined)?.name ?? '' : '';
  const nextWalk = next && slot ? walkSummary(schedule.venue, schedule.venueMap, slot.roomKey, next.roomKey) : null;
  const chair = slot ? chairOf(schedule, slot.sessionKey) : null;

  if (interpret) return <Interpret paperKey={paperKey} who={p.first?.split(' · ')[0] ?? null} />; // 14g (prototype 3)
  if (shape && found && slot && roomName) return <ShowShape schedule={schedule} roomKey={slot.roomKey} roomName={roomName} tribe={found.arc.tribe} paperKey={paperKey} />;

  return (
    <Screen clock header={header(p.doi, liveText)} label="Talk"
      bottom={<div data-tour="qa"><QandAAsk qa={qa} /></div>}>
      {tour && <MapTour steps={TALK_TOUR} label="How to read a talk" onDone={endTour} />}
      <div data-tour="tags" className="mt-3 flex flex-wrap gap-2">
        {found && <Tag icon={ANGLE_ICON[found.node.angle]}>{ANGLE_NAME[found.node.angle]}{found.node.kind && <span className="font-medium text-arc-text-2"> · {KIND_NAME[found.node.kind]}</span>}</Tag>}
        <Tag icon={fIcon}>{fName}</Tag>
        {inArcs > 1 && <Tag icon={check}>In {inArcs} of your Arcs</Tag>}
      </div>
      <h1 className="mt-3 text-[24px] leading-[30px] font-semibold tracking-[-0.02em]">{p.title}</h1>
      {/* user 11/25 E: who to look for, at the top (never "Presenter": the feed does not say who presents) */}
      {(p.first || chair) && <dl data-tour="who" className="mt-2.5 flex flex-col gap-1 text-[14px] leading-[19px]">
        {p.first && <div className="flex gap-1.5"><dt className="shrink-0 text-arc-text-3">First author</dt><dd className="min-w-0 text-arc-text-2">{p.first}</dd></div>}
        {chair && <div className="flex gap-1.5"><dt className="shrink-0 text-arc-text-3">Session chair</dt><dd className="min-w-0 text-arc-text-2">{chair}</dd></div>}
      </dl>}
      {next && (
        <button data-tour="next" type="button" onClick={() => go(`talk/${next.key}`)} className="mt-3 flex min-h-touch w-full items-center gap-2 rounded-[14px] border border-arc-line bg-arc-surface px-3.5 py-2 text-left text-[14px]">
          <span className="shrink-0 font-semibold">Next stop</span>
          <span className="min-w-0 flex-1 truncate text-arc-text-2">{[venueClock(next.start, tz), nextRoom && shortRoom(nextRoom), nextWalk && nextWalk.minutes[1] > 0 && `${minutesText(nextWalk.minutes)} walk`].filter(Boolean).join(' · ')}</span>
        </button>
      )}
      {live && (
        // 14b Figma 744:1681: 44 high, clock 16 at 14, the words at 38, the count on the right
        <div className="arc-fade mt-4 flex h-[44px] items-center gap-2 rounded-[14px] px-[14px]">
          <Pic src={clock} size={16} />
          <span className="text-[13px] font-semibold">Q&amp;A ends in {Math.max(1, Math.ceil((slot.end - now) / 60_000))} min</span>
          {qa.questions && <span className="ml-auto text-[12px] font-medium text-arc-text-3">{qa.questions.length} asked</span>}
        </div>
      )}

      {found && (
        <section aria-labelledby="why" className="mt-4 flex flex-col gap-1.5 rounded-[20px] border border-arc-line bg-arc-surface px-4 pt-3.5 pb-4">
          {/* Figma 11px at 50%; 12px and 55% are the floor (in Figma's 13px line) */}
          <h2 id="why" className="text-[12px] leading-[13px] font-medium tracking-[0.08em] text-arc-text-3">{WHY[found.node.angle]}</h2>
          {ev ? <p className="text-[15px] leading-[22px] tracking-[-0.0064em] text-arc-text/90">“{keySegments(ev.sentence, found.arc.query, found.node.angle).map((x, i) => x.mark
            ? <strong key={i} className="font-semibold underline decoration-from-font [text-decoration-skip-ink:none] [text-underline-position:from-font]">{x.text}</strong> : <span key={i}>{x.text}</span>)}”</p>
            : <p className="text-[15px] leading-[22px] text-arc-text-2">No sentence of the abstract was clear enough to quote.</p>}
        </section>
      )}

      <ul data-tour="when" className="mt-[35px] flex flex-col gap-3.5">
        <li className="flex items-center gap-3 text-[15px] font-medium tracking-[-0.006em]"><Pic src={clock} size={20} className="opacity-70" />
          <span>{slot ? `${dateOf(slot.start, tz)} · ${clockOf(slot.start, tz)}` : 'Time to be announced'}{room && ` · ${room.split(' - ').pop()}` /* "P1 - Room 116" → "Room 116" (prototype 14) */}</span></li>
        {session && <li className="flex items-center gap-3 text-[15px] tracking-[-0.006em]"><Pic src={pin} size={20} className="opacity-70" />
          <span>{session.name}{pos && <span className="text-arc-text-2"> · talk {pos.index} of {pos.count}</span>}</span></li>}
        {authors.map(k => {
          const a = people[k]!, isNew = debut.has(k);
          return (
            <li key={k} className="flex flex-col gap-1">
              {/* the icon never wraps away from the name (a long name + institution wrapped the whole line under it) */}
              <div className="flex items-center gap-3 text-[15px] font-medium tracking-[-0.006em]">
                <Pic src={person} size={20} className="shrink-0 self-start opacity-70" />
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {/* user 11/25 「14에서 칩은 빼고, 저자 이름 옆에 작은 ✦만 + 목록 아래 "✦ New to CHI" 설명 한 줄」 (Figma 14 dropped the chip) */}
                <span>{a.name}{isNew && <><span aria-hidden="true" className="ml-1 text-[12px]">✦</span><span className="sr-only"> (New to CHI)</span></>}{a.affiliations[0] && ` · ${a.affiliations[0].institution}`}</span>
                </span>
              </div>
            </li>
          );
        })}
        {authors.some(k => debut.has(k)) && <li className="pl-8 text-[13px] text-arc-text-2"><span aria-hidden="true">✦ </span>New to CHI · no paper under this name in CHI 2023–2025</li>}
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

      {slot && roomName && (
        <AfterSession schedule={schedule} roomKey={slot.roomKey} roomName={roomName} sessionEnd={session?.end ?? null} prev={prev}
          tribe={found?.arc.tribe ?? null} paperKey={paperKey} />
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
