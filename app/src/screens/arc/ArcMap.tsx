// 12 · My Arc (A1 placeholder until the Figma map in A2): the question, tribe and the talks per angle. Every talk is a
// button to 14 (#/talk/<key>); the title shows whole up to two lines (the short label is for map nodes only).
import { useEffect, useState } from 'react';
import { go, href } from '../../router';
import { getArc } from '../../arc/store';
import { loadSchedule, type Schedule } from '../../data/load';
import { TRIBE } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { useTribe, setCurrentArc } from '../../arc/live';
import { Screen, BackButton, Pic } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import { whenWhere, nodeName } from './talkLine';
import type { Arc, Angle } from '../../engine';

export function ArcMap({ id }: { id: string }) {
  const [arc, setArc] = useState<Arc | null | undefined>(undefined);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  useEffect(() => { getArc(id).then(setArc); setCurrentArc(id); }, [id]);
  useEffect(() => { loadSchedule().then(setSchedule, () => {}); }, []);
  useEffect(() => { if (arc === null) go('home', { replace: true }); }, [arc]);
  useTribe(arc?.tribe);
  if (!arc) return null;
  const title = (key: string) => (schedule?.index.papers.get(key) as { title: string } | undefined)?.title;
  return (
    <Screen label="My Arc" header={<><BackButton href={href('home')} /><span /></>}>
      <h1 className="mt-2 text-[26px] leading-8 font-semibold tracking-[-0.02em]">{arc.query}</h1>
      <p className="mt-2 flex items-center gap-1.5 text-[14px] text-arc-text-2"><Pic src={TRIBE_ICON[arc.tribe]} size={14} />{TRIBE[arc.tribe].name}</p>
      {(['S', 'R', 'T'] as Angle[]).map(a => {
        const nodes = arc.nodes.filter(n => n.angle === a);
        return (
          <section key={a} className="mt-6">
            <h2 className="text-[17px] font-semibold">{ANGLE_NAME[a]} <span className="text-arc-text-3">{nodes.length}</span></h2>
            {a === 'T' && arc.tension === 'none' && <p className="mt-1 text-[14px] text-arc-text-3">No clear challenge to it this year.</p>}
            {a === 'T' && arc.tension === 'pending' && <p className="mt-1 text-[14px] text-arc-text-3">Angles still sorting…</p>}
            <ul className="mt-2 flex flex-col gap-2">
              {nodes.map(n => {
                const full = title(n.key) ?? n.label;
                const { time, room } = schedule ? whenWhere(schedule, n.key) : { time: '', room: '' };
                return (
                  <li key={n.key}>
                    <button type="button" onClick={() => go(`talk/${n.key}`)} aria-label={nodeName(a, full, time)}
                      className="flex min-h-touch w-full flex-col items-start rounded-2xl border border-arc-line bg-arc-surface px-4 py-3 text-left">
                      <span className="line-clamp-2 text-[15px] leading-5 font-semibold">{n.debut && <span aria-hidden="true">✦ </span>}{full}</span>
                      {time && <span className="mt-1 text-[13px] text-arc-text-3">{time}{room && ` · ${room}`}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Screen>
  );
}
