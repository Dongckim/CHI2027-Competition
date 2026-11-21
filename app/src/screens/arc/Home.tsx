// 20 · Home · My Arcs (Figma 600:1105) and 21 empty (600:1225). Rows: a small Arc, the tribe, the question, dots for the
// talks (filled = heard) and the day of the next talk ("Today", "Wed", or "… · all heard"). Newest Arc first.
import { useEffect, useId, useMemo, useState } from 'react';
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
// Figma 20 "Mini Arc" (app/src/assets/arc/20-mini-arc-{xr,ai,accessibility}.svg, the same drawing in three tribes):
// seats and connectors in a 100 box, 2 Supports left, 1 Challenge right, 2 Reframes below (dashed).
const SEAT = { S: [[18, 26], [18, 74]], T: [[84, 50]], R: [[38, 88], [64, 88]] } as const;
const LINE: Record<'S' | 'T' | 'R', string[]> = { S: ['M22.8 29.6L36.4 39.8', 'M22.8 70.4L36.4 60.2'], T: ['M78 50H67'],
  R: ['M39.8068 82.2785L40.1451 81.2073M44.8808 66.2109L44.5425 67.2821M41.1599 77.9938L41.8364 75.8515M42.8512 72.6379L43.5277 70.4956',
    'M61.9258 82.3699L61.5225 81.2754M55.877 65.9518L56.2802 67.0464M57.49 70.33L58.2965 72.5191M59.5063 75.8027L60.3128 77.9918'] };

/** A 100px Arc as Figma draws it: tile and orb in the tribe colour, up to 5 talks, filled when heard. */
function MiniArc({ arc, heard }: { arc: Arc; heard: Set<string> }) {
  const c = TRIBE[arc.tribe].color, id = useId().replace(/[^a-zA-Z0-9]/g, ''); // safe inside url(#…)
  const seats = (['S', 'T', 'R'] as const).flatMap(a => arc.nodes.filter(n => n.angle === a).slice(0, SEAT[a].length).map((n, i) => ({ n, a, i, xy: SEAT[a][i] })));
  return (
    <svg aria-hidden="true" width={100} height={100} viewBox="0 0 100 100" fill="none" className="block shrink-0">
      <defs>
        <radialGradient id={`${id}t`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) scale(50)">
          <stop stopColor={c} stopOpacity="0.35" /><stop offset="0.7" stopColor={c} stopOpacity="0.14" /><stop offset="1" stopColor={c} stopOpacity="0.06" />
        </radialGradient>
        <radialGradient id={`${id}o`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) scale(15)">
          <stop stopColor={c} stopOpacity="0.95" /><stop offset="0.55" stopColor={c} stopOpacity="0.6" /><stop offset="1" stopColor={c} stopOpacity="0.22" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" rx="20" fill={`url(#${id}t)`} />
      {seats.map(({ n, a, i }) => <path key={`l${n.key}`} d={LINE[a][i]} stroke="#F4F6FF" strokeOpacity="0.45" />)}
      <circle cx="50" cy="50" r="15" fill={`url(#${id}o)`} /><circle cx="50" cy="50" r="14.5" stroke="white" strokeOpacity="0.55" />
      {seats.map(({ n, xy: [x, y] }) => heard.has(n.key)
        ? <circle key={n.key} cx={x} cy={y} r="5" fill={c} />
        : <g key={n.key}><circle cx={x} cy={y} r="5" fill="#F4F6FF" fillOpacity="0.06" /><circle cx={x} cy={y} r="4.5" stroke="#F4F6FF" strokeOpacity="0.6" /></g>)}
      <rect x="0.5" y="0.5" width="99" height="99" rx="19.5" stroke="white" strokeOpacity="0.1" />
    </svg>
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
      <ArcLink href={href('ask')} className="h-11 w-[116px] px-0"><Pic src={plusDark} size={20} />New Arc</ArcLink>{/* Figma 20: 116×44 */}
    </>}>
      <DemoBanner />
      {!isPersistent() && <p className="mt-2 text-[14px] text-arc-text-2">This browser does not keep Arcs. They stay until you close the tab.</p>}
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map(({ a, day }) => {
          const t = TRIBE[a.tribe], h = a.nodes.filter(n => heard.has(n.key)).length;
          return (
            <li key={a.id}>
              <a href={href(`arc/${a.id}`)} aria-description={`${a.nodes.length} talks${h ? `, ${h} heard` : ''}${a.source === 'received' ? ', shared with you' : ''}`}
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
