// 14 · Talk detail (minimal, A2 first step): title, authors, time and room, and the evidence sentence highlighted in the
// abstract, so an Arc's results can be checked. Q&A, sessions, debut marks and DOI follow in A2.
import { useEffect, useState } from 'react';
import { loadSchedule, loadPeople, loadAbstracts, type Schedule } from '../../data/load';
import { highlightSegments } from '../../explore/quotes.js';
import { abstractFileDay } from '../../explore/format';
import { getArc, loadArcs } from '../../arc/store';
import { currentArcId, useTribe } from '../../arc/live';
import { Screen, BackButton, Pic } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import { whenWhere } from './talkLine';
import support from '../../assets/arc/angle-support.svg';
import reframe from '../../assets/arc/angle-reframe.svg';
import challenge from '../../assets/arc/angle-challenge.svg';
import type { Arc, ArcNode } from '../../engine';

const ICON = { S: support, R: reframe, T: challenge };
type People = Awaited<ReturnType<typeof loadPeople>>;

export function TalkDetail({ paperKey }: { paperKey: string }) {
  const [data, setData] = useState<{ schedule: Schedule; people: People } | null>(null);
  const [failed, setFailed] = useState(false);
  const [abstract, setAbstract] = useState<string | null>(null);
  const [found, setFound] = useState<{ arc: Arc; node: ArcNode } | null>(null);
  useEffect(() => { Promise.all([loadSchedule(), loadPeople()]).then(([schedule, people]) => setData({ schedule, people }), () => setFailed(true)); }, []);
  useEffect(() => { // the Arc opened last, else the newest Arc with this talk
    (async () => {
      const id = currentArcId();
      const arcs = [...(id ? [await getArc(id)] : []), ...(await loadArcs())].filter((a): a is Arc => !!a);
      const arc = arcs.find(a => a.nodes.some(n => n.key === paperKey));
      setFound(arc ? { arc, node: arc.nodes.find(n => n.key === paperKey)! } : null);
    })();
  }, [paperKey]);
  const p = data?.schedule.index.papers.get(paperKey) as { title: string; authors: string[]; slots: { start: number | null; end: number; roomKey: string; sessionKey: string }[] } | undefined;
  useEffect(() => {
    if (!p || !data) return;
    let live = true;
    loadAbstracts(abstractFileDay(p.slots, data.schedule.meta.timeZone)).then(a => live && setAbstract(a[paperKey] ?? ''), () => live && setAbstract(''));
    return () => { live = false; };
  }, [p, data, paperKey]);
  useTribe(found?.arc.tribe);

  const header = <><BackButton /><span /></>;
  if (failed) return <Screen header={header} label="Talk"><p role="alert" className="mt-6 text-[16px]">Could not load the programme.</p></Screen>;
  if (!data) return <Screen header={header} label="Talk"><p className="mt-6 text-[16px] text-arc-text-3">Loading…</p></Screen>;
  if (!p) return <Screen header={header} label="Talk"><p className="mt-6 text-[16px]">This talk is not in the programme any more.</p></Screen>;
  const { time, room } = whenWhere(data.schedule, paperKey);
  const ev = found?.node.evidence;
  const quote = ev ? [{ quote: ev.sentence, start: ev.start, end: ev.end }] : [];

  return (
    <Screen header={header} label="Talk">
      {found && (
        <p className="mt-2 inline-flex items-center gap-1.5 self-start rounded-full border border-arc-line bg-arc-surface py-1 pr-3 pl-2 text-[13px] font-semibold">
          <Pic src={ICON[found.node.angle]} size={16} />{ANGLE_NAME[found.node.angle]}
        </p>
      )}
      <h1 className="mt-3 text-[24px] leading-[30px] font-semibold tracking-[-0.02em]">{p.title}</h1>
      <p className="mt-2 text-[14px] leading-5 text-arc-text-2">{p.authors.map(k => data.people[k]?.name).filter(Boolean).join(', ')}</p>
      <p className="mt-3 text-[15px] font-medium">{time}{room && ` · ${room}`}</p>
      <section aria-labelledby="why" className="mt-6">
        <h2 id="why" className="text-[17px] font-semibold">{found ? `Why ${ANGLE_NAME[found.node.angle]}` : 'Abstract'}</h2>
        {found && !ev && <p className="mt-1 text-[14px] text-arc-text-3">No sentence of the abstract was clear enough to quote.</p>}
        {abstract == null ? <p className="mt-2 text-[15px] text-arc-text-3">Loading the abstract…</p>
          : abstract ? (
            <p className="mt-2 text-[15px] leading-6 text-arc-text-2">
              {highlightSegments(abstract, quote).map((s, i) => s.mark
                ? <mark key={i} className="rounded-[2px] bg-arc-text/15 text-arc-text underline decoration-2 underline-offset-2">{s.text}</mark>
                : <span key={i}>{s.text}</span>)}
            </p>
          ) : <p className="mt-2 text-[15px] text-arc-text-3">No abstract in the programme.</p>}
      </section>
      <p className="mt-8 mb-6 text-[12px] text-arc-text-3">Programme data © ACM CHI 2026, licensed under CC BY-NC-SA 4.0.</p>
    </Screen>
  );
}
