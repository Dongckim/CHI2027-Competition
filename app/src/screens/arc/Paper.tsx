// 07p · Do you have a paper at CHI? (Figma 950:2182) and 07r · Is this your paper? (Figma 950:2258), 11/25: an author
// finds their name, confirms the paper, and the Arc starts from a question made from its results (the engine's "mine";
// the mock asks its title). Their own talks are never stops of that Arc. The name is matched on this phone against the
// programme (the same rule as the engine: accents off, every typed word starts a word of the name); nothing is sent or
// kept but the draft. No paper → 07.
import { useEffect, useMemo, useState } from 'react';
import { go, href } from '../../router';
import { useDevice, update } from '../../state/useDevice';
import { arcOf, setOnboarded, setPaperStart, QUERY_MAX } from '../../arc/draft.js';
import { engine } from '../../engine';
import { loadSchedule, loadPeople, type Schedule } from '../../data/load';
import { firstSlot, weekdayOf } from '../../explore/format';
import { venueClock } from '../../time.js';
import { questionOf } from '../../arc/topic.js';
import { Screen, ArcButton, ArcLink, BackButton, TextAction, Pic } from '../../components/arc';
import { SKIP_CLASS, StepDots } from './Start';
import { FORMAT, Tag } from './TalkDetail';
import { roomLabelOf } from './Meet';
import searchIcon from '../../assets/arc/icon-search.svg';
import lockIcon from '../../assets/arc/icon-lock.svg';
import chevron from '../../assets/arc/icon-chevron-right.svg';

type People = Awaited<ReturnType<typeof loadPeople>>;
type Paper = { key: string; title: string; feedType: string; authors: string[]; slots: { start: number | null; end: number; roomKey: string; sessionKey: string }[] };
import { fold, findAuthors, type Author } from '../../arc/authors.js';

let authorsOnce: Promise<{ authors: Author[]; schedule: Schedule }> | null = null;
const authorsOf = () => (authorsOnce ??= Promise.all([loadSchedule(), loadPeople()]).then(([schedule, people]: [Schedule, People]) => {
  const byPerson = new Map<string, string[]>();
  for (const p of schedule.index.papers.values() as Iterable<Paper>) for (const k of p.authors) (byPerson.get(k) ?? byPerson.set(k, []).get(k)!).push(p.key);
  const authors = [...byPerson].filter(([k]) => people[k]?.name).map(([k, papers]) => ({ key: k, name: people[k].name, institution: people[k].affiliations[0]?.institution ?? '', papers }));
  return { authors, schedule };
}).catch(e => { authorsOnce = null; throw e; }));

const initials = (name: string) => { const w = name.split(/\s+/).filter(Boolean); return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };

function Header({ onboarded }: { onboarded: boolean }) {
  return onboarded ? <BackButton href={href('home')} />
    : <><StepDots at={8} /><TextAction href={href('home')} className={SKIP_CLASS} onClick={e => { e.preventDefault(); update(setOnboarded); go('home'); }}>Skip</TextAction></>;
}

/** 07p */
export function FindPaper() {
  const { onboarded } = arcOf(useDevice());
  const [typed, setTyped] = useState('');
  const [data, setData] = useState<{ authors: Author[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { authorsOf().then(setData, () => setFailed(true)); }, []);
  const found = useMemo(() => (data ? findAuthors(typed, data.authors) : { hits: [], more: 0 }), [typed, data]);
  return (
    <Screen label="Do you have a paper" header={<Header onboarded={onboarded} />}
      bottom={<ArcLink kind="secondary" data-arc-wrap="" className="h-auto min-h-[var(--arc-button-h)] py-2 text-center mb-1.5" href={href('ask')}>No paper? Start from a question</ArcLink>}>
      <h1 id="paper-title" className="mt-[10px] text-[30px] leading-9 font-semibold tracking-[-0.024em]">Do you have a paper<br />at CHI?</h1>
      <p className="mt-2.5 text-[15px] text-arc-text-2">Find your name to start from your paper.</p>
      <label className="mt-[24px] flex h-16 items-center gap-2.5 rounded-[20px] bg-arc-surface pr-4 pl-[18px] shadow-[inset_0_0_0_1.5px_rgba(244,246,255,0.2)] focus-within:shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.6),0_0_0_4px_rgba(255,255,255,0.07)]">
        <Pic src={searchIcon} size={20} />
        <input aria-labelledby="paper-title" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="name" enterKeyHint="search" placeholder="Your name as on your paper"
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] font-medium tracking-[-0.012em] text-arc-text placeholder:text-arc-text-3 focus:outline-none" />
      </label>
      <div aria-live="polite">
        {failed ? <p className="mt-5 text-[14px] text-arc-text-2">Could not load the programme. Connect to the internet once and try again.</p>
          : !data ? (typed ? <p className="mt-5 text-[14px] text-arc-text-3">Loading the programme…</p> : null)
          : fold(typed).join('').length < 2 ? null
          : !found.hits.length ? <p className="mt-5 text-[14px] text-arc-text-2">No author of CHI 2026 by that name. Try your name as printed on the paper.</p>
          : <>
            <p id="paper-hits" className="mt-[22px] text-[12px] font-medium text-arc-text-3">Matching authors in the CHI programme</p>
            <ul className="mt-[9px] flex flex-col gap-2" aria-labelledby="paper-hits">
              {found.hits.map(a => (
                <li key={a.key}>
                  <a href={href(`paper/${a.key}`)} className="flex min-h-16 items-center gap-3 rounded-[18px] border border-arc-line bg-arc-surface py-2.5 pr-4 pl-3.5">
                    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-[12px] font-semibold text-arc-text-2">{initials(a.name)}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold tracking-[-0.006em]">{a.name}</span>
                      <span className="truncate text-[12px] font-medium text-arc-text-3">{[a.institution, `${a.papers.length} ${a.papers.length === 1 ? 'paper' : 'papers'}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <Pic src={chevron} size={16} />
                  </a>
                </li>
              ))}
            </ul>
            {found.more > 0 && <p className="mt-2 text-[12px] text-arc-text-3">{found.more} more · type more of your name</p>}
          </>}
      </div>
      <p className="mt-5 flex gap-2 text-[12px] leading-[18px] text-arc-text-3"><Pic src={lockIcon} size={14} className="mt-0.5 size-[14px] shrink-0 self-start" />ARC only checks that this name is on a CHI paper. No account, and nothing else about you is used.</p>
    </Screen>
  );
}

/** 07r (user 11/25 「2편 이상 저자: 07r에서 논문 카드를 나란히 보여 주고 하나 고르게. 기본은 첫 번째 선택됨」,
 *  「07r Edit: 그 자리에서 질문 고치기. Build 누르면 고친 질문으로 만들기」) */
export function ConfirmPaper({ person }: { person: string }) {
  const { onboarded } = arcOf(useDevice());
  const [data, setData] = useState<{ author: Author | null; schedule: Schedule } | null>(null);
  const [chosen, setChosen] = useState(0);
  const [question, setQuestion] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { authorsOf().then(({ authors, schedule }) => setData({ author: authors.find(a => a.key === person) ?? null, schedule }), () => go('paper', { replace: true })); }, [person]);
  const papers = data?.author ? data.author.papers.map(k => data.schedule.index.papers.get(k) as Paper).filter(Boolean) : [];
  const paper = papers[chosen] ?? null;
  useEffect(() => { // the paper's own question: the engine reads its results (it may still be getting ready)
    if (!paper) return;
    let live = true;
    setQuestion(null); setEditing(false);
    engine.paperQuestions(paper.key).then(q => live && setQuestion(q[0] ?? questionOf(paper.title) ?? paper.title), () => live && setQuestion(questionOf(paper.title) ?? paper.title));
    return () => { live = false; };
  }, [paper?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return null;
  if (!data.author) { go('paper', { replace: true }); return null; }
  const tz = data.schedule.meta.timeZone, a = data.author;
  const build = () => {
    const q = (question ?? '').trim();
    if (!q) return;
    update(s => setPaperStart(s, q, a.papers)); update(setOnboarded); go('angles');
  };
  return (
    <Screen label="Is this your paper" header={<Header onboarded={onboarded} />}
      bottom={<div className="flex flex-col gap-3 pb-1.5">
        <ArcButton data-arc-wrap="" className="h-auto min-h-[var(--arc-button-h)] py-2 text-center" onClick={build} disabled={!question?.trim()}>Build my Arc from this paper</ArcButton>
        <ArcLink kind="secondary" data-arc-wrap="" className="h-auto min-h-[var(--arc-button-h)] py-2 text-center" href={href('paper')}>Not me · search again</ArcLink>{/* Figma's long words: two whole lines at large text, never cut (data-arc-wrap) */}
      </div>}>
      <h1 className="mt-[10px] text-[30px] leading-9 font-semibold tracking-[-0.024em]">Is this<br />your paper?</h1>
      <div role={papers.length > 1 ? 'radiogroup' : undefined} aria-label={papers.length > 1 ? 'Your papers' : undefined}
        className={`-mx-6 mt-[24px] flex gap-3 px-6 pb-1 ${papers.length > 1 ? 'snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]' : ''}`}>
        {papers.map((p, i) => {
          const s = firstSlot(p.slots), room = s ? (data.schedule.index.rooms.get(s.roomKey) as { key: string; name: string } | undefined) : undefined;
          const [icon, kind] = FORMAT[p.feedType] ?? FORMAT.Paper;
          const card = <>
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5"><Tag icon={icon}>{kind}</Tag>
              {s && <span className="text-[13px] font-medium text-arc-text/80">{`${weekdayOf(s.start as number, tz)} ${venueClock(s.start as number, tz)}`}{room && ` · ${roomLabelOf(data.schedule, room)}`}</span>}</span>
            <span className="mt-3 line-clamp-3 text-[19px] leading-6 font-semibold tracking-[-0.012em]">{p.title}</span>
            <span className="mt-2 text-[13px] text-arc-text/80">{[a.name, a.institution].filter(Boolean).join(' · ')}</span>
          </>;
          const box = 'flex shrink-0 snap-center flex-col rounded-[22px] border bg-arc-surface p-[19px] text-left'; // the card's small text at 0.8: 0.72 was 4.3:1 on the surface
          return papers.length > 1
            ? <button key={p.key} type="button" role="radio" aria-checked={i === chosen} onClick={() => setChosen(i)}
                className={`${box} w-[300px] ${i === chosen ? 'border-arc-text/80' : 'border-arc-line opacity-70'}`}>{card}</button>
            : <div key={p.key} className={`${box} w-full border-arc-line`}>{card}</div>;
        })}
      </div>
      <p id="paper-q" className="mt-[22px] text-[12px] font-medium text-arc-text-3">Your Arc starts from its question</p>
      <div className="mt-2 flex min-h-[56px] items-center gap-3 rounded-[18px] bg-gradient-to-b from-white/6 to-white/2 py-2 pr-2 pl-3.5">
        <span aria-hidden="true" className="size-6 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,#8fa2ff,#5c3cff_70%)] opacity-80" />
        {question == null ? <p className="flex-1 text-[15px] text-arc-text-3" role="status">Reading your paper…</p>
          : editing ? <input aria-labelledby="paper-q" autoFocus value={question} maxLength={QUERY_MAX} onChange={e => setQuestion(e.target.value)} onBlur={() => setEditing(false)} enterKeyHint="done"
              onKeyDown={e => { if (e.key === 'Enter') setEditing(false); }}
              className="h-11 min-w-0 flex-1 rounded-xl bg-arc-surface px-3 text-[16px] font-semibold text-arc-text shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.5)] focus:outline-none" />
          : <p className="min-w-0 flex-1 text-[15px] leading-5 font-semibold tracking-[-0.006em]" aria-describedby="paper-q">{question}</p>}
        {question != null && !editing && <button type="button" onClick={() => setEditing(true)} className="min-h-touch min-w-touch shrink-0 px-2 text-[13px] font-semibold text-arc-text-2">Edit<span className="sr-only"> the question</span></button>}
      </div>
    </Screen>
  );
}
