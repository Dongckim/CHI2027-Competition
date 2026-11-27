// 20 · Home · My Arcs (Figma 600:1105) and 21 empty (600:1225). Rows: a small Arc, the tribe, the question, dots for the
// talks (filled = heard) and the day of the next talk ("Today", "Wed", or "… · all heard"). Newest Arc first.
import { useEffect, useId, useMemo, useState } from 'react';
import { href } from '../../router';
import { useArcs, isPersistent, lastDeleted, saveArc } from '../../arc/store';
import { TRIBE } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { heardOf, resetDraft } from '../../arc/draft.js';
import { acrossArcs } from '../../arc/across.js';
import { keepAdvice } from '../../arc/keep.js';
import { whenLine } from './useArc';
import { nodeStates } from '../../arc/map.js';
import { localDay } from '../../planner/plan.js';
import { useDevice, update } from '../../state/useDevice';
import { useTribe } from '../../arc/live';
import { useNow } from '../../clock.js';
import { loadSchedule, type Schedule } from '../../data/load';
import { firstSlot } from '../../explore/format';
import { Screen, ArcLink, ArcButton, Pic, DemoBanner } from '../../components/arc';
import { periodsOf, firstPeriod, isOver } from '../../arc/period.js';
import { DEMO_TZ } from '../../arc/demoClock';
import current from '../../../../data/build/app-data/chi2026/current.json';
import type { Arc } from '../../engine';
import holo from '../../assets/arc/21-holo-ring.svg';
import orbit from '../../assets/arc/21-empty-orbit.svg';
import newOrb from '../../assets/arc/21-new-arc-orb.svg';
import plus from '../../assets/arc/icon-plus.svg';
import plusDark from '../../assets/arc/button-icon-primary.svg';
import book from '../../assets/arc/icon-book.svg';
import chevron from '../../assets/arc/icon-chevron-right.svg';

// New Arc starts from an empty 07; the last draft is kept until then, so back from 11 can change the day (persona review 11/25)
const fresh = () => update(resetDraft);

const at = (x: number, y: number, w: number) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: w });
type Period = 'today' | 'week' | 'after';
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
/** An Arc's heading on 20: the conference days it was made for (09), All week last */
const groupOf = (a: { filters?: { days?: string[] } }) => {
  const d = [...(a.filters?.days ?? [])].sort();
  return d.length ? { label: d.map(dayName).join(' · '), order: d.join(',') } : { label: 'All week', order: '~' };
};
const PERIOD_TABS: [Period, string][] = [['today', 'Today'], ['week', 'This week'], ['after', 'After CHI']];
type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
// Figma 20 "Mini Arc" (11/23, 600:1128): the 12 map's three regions in a 100 box, 2 Supports at the top, 2 Reframes lower
// left (dashed), 1 Challenge lower right (its bar).
const SEAT = { S: [[36.58, 19.85], [63.42, 19.85]], T: [[78.58, 66.5]], R: [[17.18, 53.45], [30.6, 76.7]] } as const;
const LINE: Record<'S' | 'T' | 'R', string[]> = { S: ['M43.09 34.47L39.83 27.16', 'M56.91 34.47L60.17 27.16'], T: ['M64.72 58.5L71.65 62.5M62.25 62.79L67.2 54.21'],
  R: ['M33.09 51.78L32.295 51.863M25.14 52.61L25.935 52.527M28.32 52.278L29.91 52.112', 'M40.01 63.75L39.54 64.398M35.31 70.23L35.78 69.582M37.19 67.638L38.13 66.342'] };
// scale round the tile's centre
const MID = { transformBox: 'view-box', transformOrigin: '50px 50px' } as const;
const MINI_REGION = [
  'M35.2642 36.4825C34.2075 37.6367 32.495 38.0466 31.1398 37.2641L-67.7893 -19.8594C-69.2446 -20.6997 -69.7259 -22.5714 -68.8565 -24.0094L-52.2524 -51.4763C-52.0592 -51.796 -51.808 -52.0767 -51.5117 -52.3041L-22.4134 -74.6394C-22.2054 -74.7991 -21.9773 -74.9308 -21.735 -75.0312L12.3149 -89.1387C12.5572 -89.2391 12.8117 -89.3073 13.0718 -89.3416L49.6087 -94.1485C49.8684 -94.1827 50.1316 -94.1827 50.3913 -94.1485L86.9281 -89.3416C87.1882 -89.3073 87.4427 -89.2391 87.6851 -89.1387L121.735 -75.0312C121.977 -74.9308 122.205 -74.7991 122.413 -74.6394L151.512 -52.3041C151.808 -52.0767 152.059 -51.796 152.252 -51.4763L168.857 -24.0094C169.726 -22.5713 169.245 -20.6997 167.789 -19.8594L68.8602 37.2641C67.505 38.0466 65.7925 37.6367 64.7357 36.4825C60.9799 32.3801 55.6484 30 50 30C44.3516 30 39.0201 32.3801 35.2642 36.4825Z',
  'M69.0754 43.9973C68.6041 42.5048 69.1052 40.8166 70.4606 40.034L169.39 -17.0801C170.845 -17.9201 172.706 -17.4017 173.517 -15.9304L189.017 12.1842C189.197 12.5119 189.315 12.8704 189.364 13.2413L194.149 49.6087C194.183 49.8684 194.183 50.1316 194.149 50.3913L189.342 86.9282C189.307 87.1883 189.239 87.4428 189.139 87.6851L175.031 121.735C174.931 121.977 174.799 122.205 174.639 122.413L152.2 151.647C152.041 151.855 151.855 152.041 151.647 152.2L122.413 174.639C122.205 174.799 121.977 174.931 121.735 175.031L87.8428 189.073C87.4973 189.217 87.1281 189.294 86.7542 189.301L54.6596 189.939C52.9798 189.973 51.6 188.62 51.6 186.94V72.7071C51.6 71.144 52.8085 69.8668 54.3342 69.5275C59.7618 68.3205 64.4954 64.8936 67.32 60C70.1441 55.1072 70.7503 49.3007 69.0754 43.9973Z',
  'M45.6658 69.5275C47.1915 69.8668 48.4 71.144 48.4 72.7071V186.94C48.4 188.62 47.0202 189.973 45.3404 189.939L13.2458 189.301C12.8719 189.294 12.5027 189.217 12.1572 189.073L-21.735 175.031C-21.9773 174.931 -22.2054 174.799 -22.4134 174.639L-51.6471 152.2C-51.8548 152.041 -52.0407 151.855 -52.2002 151.647L-74.6394 122.413C-74.7991 122.205 -74.9308 121.977 -75.0312 121.735L-89.1387 87.6851C-89.2391 87.4428 -89.3073 87.1883 -89.3416 86.9282L-94.1485 50.3913C-94.1827 50.1316 -94.1827 49.8684 -94.1485 49.6087L-89.3638 13.2413C-89.315 12.8704 -89.1973 12.5119 -89.0167 12.1842L-73.5172 -15.9304C-72.7061 -17.4017 -70.8451 -17.9201 -69.3901 -17.0801L29.5394 40.034C30.8948 40.8166 31.3959 42.5048 30.9246 43.9973C29.2497 49.3007 29.8559 55.1072 32.68 60C35.5046 64.8936 40.2382 68.3205 45.6658 69.5275Z',
];

/** A 100px Arc as Figma draws it: tile and orb in the tribe colour, up to 5 talks, filled when heard. */
// d: when it starts (prototype miniChoreo: orb, then the regions from the centre, the lines, the stops round the clock)
export function MiniArc({ arc, heard, d = 200 }: { arc: Arc; heard: Set<string>; d?: number }) {
  const c = TRIBE[arc.tribe].color, id = useId().replace(/[^a-zA-Z0-9]/g, ''); // safe inside url(#…)
  const seats = (['S', 'T', 'R'] as const).flatMap(a => arc.nodes.filter(n => n.angle === a).slice(0, SEAT[a].length).map((n, i) => ({ n, a, i, xy: SEAT[a][i] })));
  return (
    <svg aria-hidden="true" width={100} height={100} viewBox="0 0 100 100" fill="none" className="block aspect-square h-auto max-w-full shrink">{/* shrinks in 20b's 3-column grid at 375 (audit 11/27) */}
      <defs>
        <radialGradient id={`${id}t`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) scale(50)">
          <stop stopColor={c} stopOpacity="0.35" /><stop offset="0.7" stopColor={c} stopOpacity="0.14" /><stop offset="1" stopColor={c} stopOpacity="0.06" />
        </radialGradient>
        <radialGradient id={`${id}f`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) scale(66)"><stop offset="0.303" stopColor="#fff" stopOpacity="0.1" /><stop offset="0.6" stopColor="#fff" stopOpacity="0.045" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}s`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) scale(66)"><stop offset="0.303" stopColor="#fff" stopOpacity="0.22" /><stop offset="0.7" stopColor="#fff" stopOpacity="0.06" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}o`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 50) scale(15)">
          <stop stopColor={c} stopOpacity="0.95" /><stop offset="0.55" stopColor={c} stopOpacity="0.6" /><stop offset="1" stopColor={c} stopOpacity="0.22" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" rx="20" fill={`url(#${id}t)`} />
      <clipPath id={`${id}c`}><rect width="100" height="100" rx="20" /></clipPath>
      <g clipPath={`url(#${id}c)`}>{MINI_REGION.map((p, i) => <path key={i} data-anim={`mregion ${d + 80 + i * 70}`} style={MID} d={p} fill={`url(#${id}f)`} stroke={`url(#${id}s)`} />)}</g>
      <g data-anim={`fade ${d + 260}`}>{seats.map(({ n, a, i }) => <path key={`l${n.key}`} d={LINE[a][i]} stroke="#F4F6FF" strokeOpacity="0.45" />)}</g>
      <g data-anim={`morb ${d}`} style={MID}><circle cx="50" cy="50" r="15" fill={`url(#${id}o)`} /><circle cx="50" cy="50" r="14.5" stroke="white" strokeOpacity="0.55" /></g>
      {seats.slice().sort((p, q) => Math.atan2(p.xy[1] - 50, p.xy[0] - 50) - Math.atan2(q.xy[1] - 50, q.xy[0] - 50)).map(({ n, xy: [x, y] }, j) => (
        <g key={n.key} data-anim={`mdot ${d + 300 + j * 70}`} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>{heard.has(n.key)
          ? <circle cx={x} cy={y} r="5" fill={c} />
          : <><circle cx={x} cy={y} r="5" fill="#F4F6FF" fillOpacity="0.06" /><circle cx={x} cy={y} r="4.5" stroke="#F4F6FF" strokeOpacity="0.6" /></>}</g>
      ))}
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
  // "Deleted · Undo" for 5 s after Delete on 15
  const [undo, setUndo] = useState(() => (lastDeleted && Date.now() - lastDeleted.at < 5000 ? lastDeleted.arc : null));
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(t); }, [undo]);
  const heard = heardOf(useDevice());
  const now = useNow();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  useEffect(() => { if (arcs?.length) loadSchedule().then(setSchedule, () => {}); }, [arcs?.length]);
  useTribe(null);
  const rows = useMemo(() => arcs?.map(a => {
    const tz = schedule?.meta.timeZone ?? DEMO_TZ;
    const timeOf = (k: string) => { const p = schedule?.index.papers.get(k) as { slots: Slot[] } | undefined; const s = p ? firstSlot(p.slots) : null; return s ? { start: s.start as number, end: s.end } : null; };
    return { a, day: dayLine(a, schedule, now, heard), period: periodsOf(a, timeOf, now, heard, { days: current.days, timeZone: tz }) };
  }) ?? [], [arcs, schedule, now, heard]);
  // user 11/25 D: talks more than one Arc leads to, still to come, soonest first (up to three)
  const across = useMemo(() => {
    if (!arcs || !schedule) return [];
    const tz = schedule.meta.timeZone;
    return [...acrossArcs(arcs)].flatMap(([key, n]) => {
      const p = schedule.index.papers.get(key) as { title: string; slots: Slot[] } | undefined, s = p ? firstSlot(p.slots) : null;
      if (!p || !s || s.end <= now) return [];
      const room = (schedule.index.rooms.get(s.roomKey) as { name: string } | undefined)?.name ?? '';
      return [{ key, n, start: s.start as number, title: p.title, when: whenLine(s.start as number, room, tz, now) }];
    }).sort((a, b) => a.start - b.start).slice(0, 3);
  }, [arcs, schedule, now]);
  const [picked, setPicked] = useState<Period | null>(null);
  const period: Period = picked ?? (schedule ? firstPeriod(rows.map(r => r.period)) : 'week');
  if (!arcs) return null;
  const chi101 = (
    <a href={href('start/2')} className="flex h-14 items-center gap-3 rounded-[20px] border border-arc-line bg-arc-surface pr-3.5 pl-4 text-[15px] font-semibold tracking-[-0.006em]">
      <Pic src={book} size={20} /><span className="flex-1">CHI 101</span><Pic src={chevron} size={18} />
    </a>
  );
  if (!arcs.length) return (
    <Screen label="My Arcs" bottom={<div className="flex flex-col gap-5 pb-1.5">{/* Figma 21: 20 between, New Arc 20 above the home indicator */}{chi101}<ArcLink href={href('ask')} onClick={fresh}><Pic src={plusDark} size={20} />New Arc</ArcLink></div>}>
      <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.024em]">My Arcs</h1>
      {!isPersistent() && <p className="mt-2 text-[14px] text-arc-text-2">This browser does not keep Arcs. They stay until you close the tab.</p>}
      <div className="mt-[113px] flex flex-col items-center">{/* Figma 21: the art at a fixed 215, not centred */}
        <a href={href('ask')} onClick={fresh} aria-label="New Arc" className="relative -mx-6 h-[250px] w-[390px] max-w-[100vw]">
          <img src={holo} alt="" style={at(70, 0, 250)} />
          <img src={orbit} alt="" style={at(110, 40, 170)} />
          <img src={newOrb} alt="" style={at(147, 77, 96)} />
          <img src={plus} alt="" style={at(179, 109, 32)} />
        </a>
        <p className="mt-[23px] text-center text-[26px] leading-8 font-semibold tracking-[-0.02em]">Start with one question.</p>
      </div>
      {undo && (
        <div role="status" className="fixed inset-x-0 top-[max(16px,env(safe-area-inset-top))] z-50 mx-auto flex w-fit items-center gap-1 rounded-full bg-arc-primary py-1 pr-1 pl-4 text-[14px] font-semibold text-arc-on-primary">
          Deleted<button type="button" onClick={() => { const a = undo; setUndo(null); saveArc(a); }} className="min-h-touch rounded-full px-3 underline">Undo</button>
        </div>
      )}
    </Screen>
  );
  return (
    <Screen label="My Arcs" header={<>
      {/* Figma 20: title at 24, 66; New Arc at 64, 24 from the edge (the header row is 16 from it). mb-1: the button's
          lower edge is not flush with main, where a press on it landed on main (a11y check) */}
      <h1 className="mt-3 self-start pl-2 text-[30px] font-semibold tracking-[-0.024em]">My Arcs</h1>
      <ArcLink href={href('ask')} onClick={fresh} className="mt-2.5 mr-2 mb-1 h-11 min-w-[116px] shrink-0 self-start"><Pic src={plusDark} size={20} />New Arc</ArcLink>{/* Figma 20: 116×44, grows with its words */}
    </>}>
      <DemoBanner />
      {!isPersistent() && <p className="mt-2 text-[14px] text-arc-text-2">This browser does not keep Arcs. They stay until you close the tab.</p>}
      <KeepNote />
      {across.length > 0 && (
        <section aria-labelledby="across-h" className="mt-2.5 flex flex-col gap-2">
          <h2 id="across-h" className="text-[15px] font-semibold tracking-[-0.006em]">Talks across your Arcs</h2>
          {across.map(t => (
            <a key={t.key} href={href(`talk/${t.key}`)} className="flex min-h-[56px] items-center gap-3 rounded-[18px] border border-arc-line bg-arc-surface py-2 pr-3 pl-3.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px] font-semibold">{t.title}</span>
                <span className="truncate text-[12px] font-medium text-arc-text-3">In {t.n} of your Arcs · {t.when}</span>
              </span>
              <Pic src={chevron} size={18} className="opacity-40" />
            </a>
          ))}
        </section>
      )}
      {/* Figma 20 (743:1736): Today / This week / After CHI; which Arcs each shows is an interpretation, designer to confirm */}
      <div role="tablist" aria-label="When" className="mt-2.5 flex h-10 rounded-[20px] border border-arc-line bg-arc-surface p-[3px]">
        {PERIOD_TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={period === k} aria-controls="arc-list" onClick={() => setPicked(k)}
            className={`relative flex-1 rounded-2xl text-[13px] font-semibold before:absolute before:inset-x-0 before:-inset-y-[6px] before:content-[''] ${period === k ? 'bg-arc-chip-on text-arc-on-primary shadow-[var(--arc-shadow-lift)]' : 'text-arc-text/62'}`}>{label}</button>
        ))}
      </div>
      {period === 'today' && !rows.some(r => r.period.today) && (
        <div className="mt-8 flex flex-col items-center gap-4">
          <p className="text-center text-[16px] text-arc-text-2">Nothing left today in your Arcs.</p>
          <ArcButton kind="secondary" className="min-w-[160px]" onClick={() => setPicked('week')}>See this week</ArcButton>
        </div>
      )}
      {period === 'week' && !rows.some(r => r.period.week) && rows.length > 0 && ( /* audit 11/27: after CHI this tab was empty with no word */
        <div className="mt-8 flex flex-col items-center gap-4">
          <p className="text-center text-[16px] text-arc-text-2">Nothing left this week in your Arcs.</p>
          <ArcButton kind="secondary" className="min-w-[160px]" onClick={() => setPicked('after')}>See After CHI</ArcButton>
        </div>
      )}
      <div id="arc-list" role="tabpanel">
      {/* opens 20b (Figma 743:1741) once CHI is over; Figma 20 has no such card: its words are ours, designer to confirm */}
      {/* during CHI the tab was an empty page (persona review 11/25): say what will come here */}
      {/* user 11/27 「After CHI는 뭐 아무것도 안나와?」: the summary (20b) is there at any time, "so far" until CHI ends,
          and every Arc is listed with what was heard and what is left to read */}
      {period === 'after' && (
        <a href={href('after')} className="mt-5 flex min-h-14 items-center gap-3 rounded-[20px] border border-arc-line bg-arc-surface py-2 pr-3.5 pl-4">
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-semibold tracking-[-0.006em]">{isOver(now, { days: current.days, timeZone: schedule?.meta.timeZone ?? DEMO_TZ }) ? 'Your CHI' : 'Your CHI so far'}</span>
            <span className="text-[12px] font-medium text-arc-text-3">What you heard, and a reading list of the rest</span>
          </span><Pic src={chevron} size={18} />
        </a>
      )}
      <ul className="mt-5 flex flex-col gap-4">
        {rows.filter(r => period === 'after' || r.period[period]).sort((x, y) => groupOf(x.a).order.localeCompare(groupOf(y.a).order)).map(({ a, day }, i, list) => {
          const t = TRIBE[a.tribe], h = a.nodes.filter(n => heard.has(n.key)).length;
          // user 11/27 「My arcs 페이지에 날짜별로 나눠지게」: Arcs under the conference days they were made for
          const g = groupOf(a), head = i === 0 || groupOf(list[i - 1].a).label !== g.label;
          return (
            <li key={a.id} className="flex flex-col">
              {head && <h2 className="mb-2 mt-1 text-[13px] font-semibold text-arc-text-3">{g.label}</h2>}
              <a href={href(`arc/${a.id}`)} aria-description={`${a.nodes.length} talks${h ? `, ${h} heard` : ''}${a.source === 'received' ? ', shared with you' : ''}`}
                className="flex min-h-[136px] items-center gap-3.5 rounded-3xl border border-arc-line py-4 pr-4 pl-3.5"
                style={{ background: `linear-gradient(color-mix(in srgb, ${t.color} 8%, transparent), color-mix(in srgb, ${t.color} 8%, transparent)), var(--arc-surface)` }}>
                <MiniArc arc={a} heard={heard} d={260 + i * 90} />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-[14px] border py-1 pr-2.5 pl-2 text-[12px] font-semibold"
                    style={{ background: `color-mix(in srgb, ${t.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${t.color} 50%, transparent)` }}>
                    <Pic src={TRIBE_ICON[a.tribe]} size={12} />{t.name}
                  </span>
                  <span className="line-clamp-2 text-[16px] leading-[21px] font-semibold tracking-[-0.006em]">{a.query}</span>
                  <span aria-hidden="true" className="flex flex-wrap items-center gap-1">
                    {a.nodes.slice(0, 9).map(n => <span key={n.key} className="size-1.5 rounded-full" style={heard.has(n.key) ? { background: t.color } : { border: '1px solid rgba(244,246,255,0.4)' }} />)}
                    {/* Figma 11px at 50% in a 13px line; 12px and 55% are the floor */}
                    {day && <span className="text-[12px] leading-[13px] font-medium text-arc-text-3">{day}</span>}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul></div>
      <div className="mt-[30px] mb-6">{chi101}</div>
      {undo && (
        <div role="status" className="fixed inset-x-0 top-[max(16px,env(safe-area-inset-top))] z-50 mx-auto flex w-fit items-center gap-1 rounded-full bg-arc-primary py-1 pr-1 pl-4 text-[14px] font-semibold text-arc-on-primary">
          Deleted<button type="button" onClick={() => { const a = undo; setUndo(null); saveArc(a); }} className="min-h-touch rounded-full px-3 underline">Undo</button>
        </div>
      )}
    </Screen>
  );
}

// Keeping the Arcs on this phone for the whole week (user 11/25 「하루 지나면 페이지가 사라지는데 … 일주일 정도」): in a
// messenger's browser, open ARC in Safari or Chrome; in iPhone Safari, add it to the Home Screen (kept past Safari's 7 days).
const KEEP_SEEN = 'arc.keepNote';
function KeepNote() {
  const standalone = typeof window !== 'undefined' && (matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const advice = typeof navigator === 'undefined' ? null : keepAdvice(navigator.userAgent, !!standalone);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEEP_SEEN) === advice; } catch { return false; } });
  const [copied, setCopied] = useState(false);
  if (!advice || (hidden && advice === 'homeScreen')) return null;
  const hide = () => { try { localStorage.setItem(KEEP_SEEN, advice); } catch {} setHidden(true); };
  const copy = async () => { try { await navigator.clipboard.writeText(location.origin); setCopied(true); } catch { /* no clipboard */ } };
  return (
    <div role="note" className="mt-2.5 flex flex-col gap-2 rounded-[18px] border border-arc-line bg-arc-surface px-4 py-3 text-[14px] leading-5 text-arc-text-2">
      {advice === 'inApp'
        ? <p><span className="font-semibold text-arc-text">This app&rsquo;s browser may delete your Arcs.</span> Open {location.host} in Safari or Chrome to keep them all week; Arcs made here don&rsquo;t move by themselves, so share each one and open its link there.</p>
        : <p><span className="font-semibold text-arc-text">Keep your Arcs all week:</span> add ARC to your Home Screen (Share <span aria-hidden="true">↑</span> → &ldquo;Add to Home Screen&rdquo;) and use it from there. The Home Screen app starts empty: to bring an Arc made here, share it and open its link there.</p>}{/* iOS keeps a Home Screen app's data apart from Safari's (audit 11/27) */}
      <div className="flex gap-2">
        {advice === 'inApp' && <button type="button" onClick={copy} className="min-h-touch rounded-full bg-arc-chip-on px-4 text-[14px] font-semibold text-arc-on-primary">{copied ? 'Copied' : 'Copy link'}</button>}
        {advice === 'homeScreen' && <button type="button" onClick={hide} className="min-h-touch rounded-full border border-arc-line px-4 text-[14px] font-semibold text-arc-text">Got it</button>}
      </div>
    </div>
  );
}
