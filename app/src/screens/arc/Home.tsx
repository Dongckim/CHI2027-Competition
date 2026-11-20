// 20 · Home · My Arcs (Figma 600:1105) and 21 empty (600:1225). Rows: a small Arc, the tribe, the question, dots for the
// talks (filled = heard) and the day of the next talk ("Today", "Wed", or "… · all heard"). Newest Arc first.
import { useEffect, useMemo, useState } from 'react';
import { href } from '../../router';
import { useArcs, isPersistent } from '../../arc/store';
import { TRIBE } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { heardOf } from '../../arc/draft.js';
import { nodeStates } from '../../arc/map.js';
import { localDay } from '../../planner/plan.js';
import { useDevice } from '../../state/useDevice';
import { useTribe } from '../../arc/live';
import { useNow } from '../../clock.js';
import { loadSchedule, type Schedule } from '../../data/load';
import { firstSlot } from '../../explore/format';
import { Screen, ArcLink, Pic, DemoBanner } from '../../components/arc';
import type { Arc } from '../../engine';
import holo from '../../assets/arc/21-holo-ring.svg';
import orbit from '../../assets/arc/21-empty-orbit.svg';
import newOrb from '../../assets/arc/21-new-arc-orb.svg';
import plus from '../../assets/arc/icon-plus.svg';
import plusDark from '../../assets/arc/button-icon-primary.svg';
import book from '../../assets/arc/icon-book.svg';
import chevron from '../../assets/arc/icon-chevron-right.svg';

const at = (x: number, y: number, w: number) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: w });
type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
const SEAT = { S: [[22, 34], [22, 66]], T: [[78, 50], [78, 70]], R: [[40, 82], [60, 82]] } as const; // mini map seats (100 box)

/** A 100px Arc: the question orb in the tribe colour and up to 2 talks per angle, filled when heard. */
function MiniArc({ arc, heard }: { arc: Arc; heard: Set<string> }) {
  const c = TRIBE[arc.tribe].color;
  const dots = (['S', 'T', 'R'] as const).flatMap(a => arc.nodes.filter(n => n.angle === a).slice(0, 2).map((n, i) => ({ n, xy: SEAT[a][i] })));
  return (
    <span aria-hidden="true" className="relative block size-[100px] shrink-0 overflow-hidden rounded-[20px]" style={{ background: `radial-gradient(circle, color-mix(in srgb, ${c} 22%, transparent), transparent 70%)`, ['--tribe-now' as string]: c }}>
      <span className="arc-orb" style={at(36, 36, 28)} />
      {dots.map(({ n, xy: [x, y] }) => (
        <span key={n.key} className="absolute size-2.5 rounded-full" style={{ left: x - 5, top: y - 5, ...(heard.has(n.key) ? { background: c } : { border: '1.5px solid rgba(244,246,255,0.55)' }) }} />
      ))}
    </span>
  );
}

function dayLine(arc: Arc, schedule: Schedule | null, now: number, heard: Set<string>) {
  if (!schedule) return '';
  const tz = schedule.meta.timeZone;
  const timeOf = (k: string) => { const p = schedule.index.papers.get(k) as { slots: Slot[] } | undefined; const s = p ? firstSlot(p.slots) : null; return s ? { start: s.start, end: s.end } : null; };
  const st = nodeStates(arc.nodes, timeOf, now, heard);
  const wd = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(ms);
  const next = arc.nodes.map(n => ({ n, t: timeOf(n.key) })).filter(x => x.t && st.get(x.n.key) !== 'ended' && st.get(x.n.key) !== 'heard').sort((a, b) => a.t!.start - b.t!.start)[0];
  if (arc.nodes.length && arc.nodes.every(n => st.get(n.key) === 'heard')) {
    const last = Math.max(...arc.nodes.map(n => timeOf(n.key)?.start ?? 0));
    return `${last ? `${wd(last)} · ` : ''}all heard`;
  }
  if (!next) return arc.nodes.some(n => timeOf(n.key)) ? 'All over' : '';
  return localDay(next.t!.start, tz) === localDay(now, tz) ? 'Today' : wd(next.t!.start);
}

export function Home() {
  const arcs = useArcs();
  const heard = heardOf(useDevice());
  const now = useNow();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  useEffect(() => { if (arcs?.length) loadSchedule().then(setSchedule, () => {}); }, [arcs?.length]);
  useTribe(null);
  const rows = useMemo(() => arcs?.map(a => ({ a, day: dayLine(a, schedule, now, heard) })) ?? [], [arcs, schedule, now, heard]);
  if (!arcs) return null;
  const chi101 = (
    <a href={href('start/2')} className="flex h-14 items-center gap-3 rounded-[20px] border border-arc-line bg-arc-surface pr-3.5 pl-4 text-[15px] font-semibold">
      <Pic src={book} size={20} /><span className="flex-1">CHI 101</span><Pic src={chevron} size={18} />
    </a>
  );
  if (!arcs.length) return (
    <Screen label="My Arcs" bottom={<>{chi101}<ArcLink href={href('ask')}><Pic src={plusDark} size={20} />New Arc</ArcLink></>}>
      <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.024em]">My Arcs</h1>
      {!isPersistent() && <p className="mt-2 text-[14px] text-arc-text-2">This browser does not keep Arcs. They stay until you close the tab.</p>}
      <div className="flex flex-1 flex-col items-center justify-center">
        <a href={href('ask')} aria-label="New Arc" className="relative -mx-6 h-[250px] w-[390px] max-w-[100vw]">
          <img src={holo} alt="" style={at(70, 0, 250)} />
          <img src={orbit} alt="" style={at(110, 40, 170)} />
          <img src={newOrb} alt="" style={at(147, 77, 96)} />
          <img src={plus} alt="" style={at(179, 109, 32)} />
        </a>
        <p className="mt-6 text-center text-[26px] leading-8 font-semibold tracking-[-0.02em]">Start with one question.</p>
      </div>
    </Screen>
  );
  return (
    <Screen label="My Arcs" header={<>
      <h1 className="pl-2 text-[30px] font-semibold tracking-[-0.024em]">My Arcs</h1>
      <ArcLink href={href('ask')} className="h-11 w-auto px-5"><Pic src={plusDark} size={20} />New Arc</ArcLink>
    </>}>
      <DemoBanner />
      {!isPersistent() && <p className="mt-2 text-[14px] text-arc-text-2">This browser does not keep Arcs. They stay until you close the tab.</p>}
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map(({ a, day }) => {
          const t = TRIBE[a.tribe], h = a.nodes.filter(n => heard.has(n.key)).length;
          return (
            <li key={a.id}>
              <a href={href(`arc/${a.id}`)} aria-label={`${a.query} · ${t.name} · ${a.nodes.length} talks${h ? `, ${h} heard` : ''}${day ? ` · ${day}` : ''}${a.source === 'received' ? ' · shared with you' : ''}`}
                className="flex min-h-[136px] items-center gap-3.5 rounded-3xl border border-arc-line py-4 pr-4 pl-3.5"
                style={{ background: `linear-gradient(color-mix(in srgb, ${t.color} 8%, transparent), color-mix(in srgb, ${t.color} 8%, transparent)), var(--arc-surface)` }}>
                <MiniArc arc={a} heard={heard} />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-[14px] border py-1 pr-2.5 pl-2 text-[12px] font-semibold"
                    style={{ background: `color-mix(in srgb, ${t.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${t.color} 50%, transparent)` }}>
                    <Pic src={TRIBE_ICON[a.tribe]} size={12} />{t.name}
                  </span>
                  <span className="line-clamp-2 text-[16px] leading-[21px] font-semibold tracking-[-0.006em]">{a.query}</span>
                  <span aria-hidden="true" className="flex flex-wrap items-center gap-1">
                    {a.nodes.slice(0, 9).map(n => <span key={n.key} className="size-1.5 rounded-full" style={heard.has(n.key) ? { background: t.color } : { border: '1px solid rgba(244,246,255,0.4)' }} />)}
                    {/* Figma 11px; 12px is the floor */}
                    {day && <span className="ml-1.5 text-[12px] font-medium text-arc-text/60">{day}</span>}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <div className="mt-[30px] mb-6">{chi101}</div>
    </Screen>
  );
}
