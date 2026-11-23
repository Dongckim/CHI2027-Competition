// The Arc map (Figma 597:711, 11/23; states 23/24/25; Edit 15 at 0.74). Question orb in the middle of three regions:
// Supports at the top, Reframes lower left, Challenges lower right, each with its count. Positions come from arc/map.js; the orb, rings and node fills take the tribe colour (Figma's
// pictures are drawn in the sample tribe's blue). Every node is a button named "<angle> · <title> · <time>".
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type DOMAttributes, type ReactNode } from 'react';
import { layout, connector, BOX, ADD_AT, BADGE_AT, MAX_SEATS, type NodeState } from '../../arc/map.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { ANGLE_NAME, KIND_NAME } from './AngleHelp';
import sortingOrb from '../../assets/arc/25-orb-sorting.svg';
import support from '../../assets/arc/angle-support.svg';
import reframe from '../../assets/arc/angle-reframe.svg';
import challenge from '../../assets/arc/angle-challenge.svg';
import minus from '../../assets/arc/icon-minus.svg';
import plus from '../../assets/arc/icon-plus.svg';
import lockIcon from '../../assets/arc/icon-lock.svg';
import check from '../../assets/arc/icon-check.svg';
import type { Arc, Angle } from '../../engine';

export const ANGLE_ICON: Record<Angle, string> = { S: support, R: reframe, T: challenge };
const STATE_WORD: Record<NodeState, string> = { next: 'Next', upcoming: 'Upcoming', heard: 'Heard', ended: 'Ended' };
// Figma Regions (808:2039): three 120° fields round the question, 9 px apart, faint white from the centre outwards
const REGION: Record<Angle, string> = {
  S: 'M125.677 179.515C120.769 185.14 112.591 187.227 106.125 183.495L-616.578 -233.762C-623.366 -237.682 -625.614 -246.41 -621.563 -253.121L-501.186 -452.557C-500.283 -454.052 -499.109 -455.366 -497.723 -456.429L-297.772 -609.848C-296.802 -610.593 -295.738 -611.207 -294.607 -611.675L-61.023 -708.435C-59.8926 -708.903 -58.7056 -709.221 -57.4924 -709.381L193.173 -742.379C194.386 -742.539 195.614 -742.539 196.827 -742.379L447.492 -709.381C448.706 -709.221 449.893 -708.903 451.023 -708.435L684.607 -611.675C685.738 -611.207 686.802 -610.593 687.772 -609.848L887.723 -456.429C889.109 -455.366 890.283 -454.052 891.186 -452.557L1011.56 -253.121C1015.61 -246.41 1013.37 -237.682 1006.58 -233.762L283.875 183.495C277.409 187.227 269.231 185.14 264.323 179.515C246.996 159.653 221.787 148 195 148C168.213 148 143.004 159.653 125.677 179.515Z',
  T: 'M282.046 210.207C279.628 203.144 281.91 195.017 288.375 191.284L1011.08 -225.963C1017.87 -229.882 1026.55 -227.464 1030.34 -220.601L1142.86 -16.6346C1143.71 -15.1051 1144.26 -13.4311 1144.49 -11.6991L1177.38 238.173C1177.54 239.386 1177.54 240.614 1177.38 241.827L1144.38 492.492C1144.22 493.706 1143.9 494.893 1143.43 496.023L1046.68 729.607C1046.21 730.738 1045.59 731.801 1044.85 732.772L890.942 933.357C890.197 934.328 889.328 935.197 888.357 935.942L687.772 1089.85C686.802 1090.59 685.738 1091.21 684.607 1091.68L451.762 1188.13C450.148 1188.8 448.424 1189.16 446.677 1189.19L213.772 1193.72C205.935 1193.87 199.5 1187.56 199.5 1179.72V345.221C199.5 337.755 205.397 331.716 212.723 330.278C238.587 325.204 261.281 309.198 274.67 286C288.068 262.802 290.583 235.143 282.046 210.207Z',
  R: 'M177.277 330.278C184.603 331.716 190.5 337.755 190.5 345.221V1179.72C190.5 1187.56 184.065 1193.87 176.228 1193.72L-56.6769 1189.19C-58.4235 1189.16 -60.1484 1188.8 -61.7624 1188.13L-294.607 1091.68C-295.738 1091.21 -296.802 1090.59 -297.772 1089.85L-498.357 935.942C-499.328 935.197 -500.197 934.328 -500.942 933.357L-654.848 732.772C-655.593 731.801 -656.207 730.738 -656.675 729.607L-753.435 496.023C-753.903 494.893 -754.221 493.706 -754.381 492.492L-787.379 241.827C-787.539 240.614 -787.539 239.386 -787.379 238.173L-754.485 -11.6991C-754.257 -13.4311 -753.707 -15.1051 -752.863 -16.6346L-640.336 -220.601C-636.549 -227.464 -627.866 -229.882 -621.077 -225.963L101.625 191.284C108.09 195.017 110.372 203.144 107.954 210.207C99.4171 235.143 101.932 262.802 115.33 286C128.719 309.198 151.413 325.204 177.277 330.278Z',
};
function Regions() {
  const id = useId();
  // as wide as the screen (15, 18, 19 draw the map smaller, the regions still reach the edges), as tall as the box
  return (
    <svg aria-hidden="true" width={790} height={BOX.h} viewBox={`-200 0 790 ${BOX.h}`} className="absolute top-0 left-[-200px]" fill="none">
      <defs>
        <radialGradient id={`${id}f`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(195 240) scale(340 340)"><stop offset={0.27} stopColor="#fff" stopOpacity={0.06} /><stop offset={0.6} stopColor="#fff" stopOpacity={0.026} /><stop offset={1} stopColor="#fff" stopOpacity={0} /></radialGradient>
        <radialGradient id={`${id}s`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(195 240) scale(340 340)"><stop offset={0.27} stopColor="#fff" stopOpacity={0.15} /><stop offset={0.62} stopColor="#fff" stopOpacity={0.055} /><stop offset={1} stopColor="#fff" stopOpacity={0} /></radialGradient>
      </defs>
      {(['S', 'T', 'R'] as Angle[]).map(a => <path key={a} d={REGION[a]} fill={`url(#${id}f)`} stroke={`url(#${id}s)`} />)}
    </svg>
  );
}

const MIN_SCALE = 0.55;
/**
 * The map's scale on a screen that must not scroll (12, 18, 23–25): Figma's 390 box fitted to the width (375, 360), then
 * shrunk until its lowest node, with its 44 px area, clears the fixed bottom area: Safari shows 390×664 between its
 * toolbars (user 11/22 「겹치면 지도 크기를 화면 높이(dvh 기준)에 맞춰 줄이되 글자 12px·누르는 영역 44px는 유지」). Text and
 * touch targets keep their real size whatever the scale (real() below), so it is measured, not computed; again on resize
 * (the toolbars hide and show). Put `ref` on the box that holds the ArcView.
 */
export function useMapFit(base = 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(() => (typeof innerWidth === 'number' ? [innerWidth, innerHeight] : [BOX.w, 844]));
  useEffect(() => {
    const on = () => setView([innerWidth, innerHeight]);
    addEventListener('resize', on); visualViewport?.addEventListener('resize', on);
    return () => { removeEventListener('resize', on); visualViewport?.removeEventListener('resize', on); };
  }, []);
  const wide = base * Math.min(1, view[0] / BOX.w);
  const [scale, setScale] = useState(wide);
  useLayoutEffect(() => { setScale(wide); }, [wide, view[1]]);
  useLayoutEffect(() => { // after every render: one more step down while the lowest target reaches the bottom area
    const el = ref.current;
    if (!el) return;
    const bar = el.closest('.arc')?.querySelector(':scope > .sticky.bottom-0');
    const top = el.getBoundingClientRect().top, floor = (bar ? bar.getBoundingClientRect().top : innerHeight) - 4;
    let low = top;
    for (const t of el.querySelectorAll('button, a')) {
      const r = t.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) low = Math.max(low, r.top + r.height / 2 + Math.max(44, r.height) / 2);
    }
    // and the page itself must not scroll (24: the nodes cleared the bar but the page was 8 px too tall)
    const over = Math.max(low - floor, document.documentElement.scrollHeight - innerHeight);
    if (over > 0.5 && low - top > over && scale > MIN_SCALE) setScale(Math.max(MIN_SCALE, (scale * (low - top - over)) / (low - top)));
  });
  return [scale, ref] as const;
}

const BELOW = 0; // 11/23: every seat's label ends inside Figma's 530 box

export type Info = { title: string; short: string; time: string; when: string; room: string };
// 19: tap a talk to keep or skip it; locked talks (over, or already in one of my Arcs) cannot be picked.
export type Pick = { picked: Set<string>; locked: Map<string, 'ended' | 'mine'>; onToggle: (key: string) => void };
type Edit = { selected: string | null; onSelect: (key: string) => void; onRemove: (key: string) => void; onAdd: (angle: Angle) => void; adding: Angle | null };
// 19b: tap a talk to keep it (solid) or not (outline); talks the person added carry "Yours"; + adds as on 15.
export type Own = { kept: Set<string>; yours: Set<string>; onToggle: (key: string) => void; onAdd: (angle: Angle) => void; adding: Angle | null };

// 12b: hold a node to swap it (ArcMap). press: the node's pointer handlers; held: the node whose choices are open (the
// rest dim to Figma's 22% and go inert); onSwap: the keyboard and screen reader way in, a "Swap" button per node.
type Hold = { held: string | null; press: (key: string) => DOMAttributes<HTMLButtonElement>; onSwap: (key: string) => void };

export function ArcView({ arc, states, info, scale = 1, onNode, onBundle, edit, pick, picture, readOnly, fit, hold, own }: {
  arc: Arc; states: Map<string, NodeState>; info: (key: string) => Info; scale?: number;
  onNode?: (key: string) => void; onBundle?: (angle: Angle) => void; edit?: Edit; hold?: Hold;
  /** picture: a shareable image (16), text scales with the map and nothing is a button. readOnly: shown, not tappable (18). */
  pick?: Pick; picture?: boolean; readOnly?: boolean;
  /** fit: only Figma's 530 box takes room (12, 18 fit one screen as in Figma); the bottom labels hang into the gap above
   *  the bottom area (tests/qa/height-check.mjs keeps every node above it) */
  fit?: boolean;
  own?: Own;
}) {
  type Seat = [number, number];
  const l = layout(arc) as { nodes: { node: Arc['nodes'][number]; at: Seat; oneLine?: boolean }[]; regions: { angle: Angle; count: number; more: number }[]; emptyT: Seat | null }; // map.js is untyped JS
  const pending = arc.tension === 'pending';
  const at = (x: number, y: number, w: number, h = w) => ({ position: 'absolute' as const, left: x - w / 2, top: y - h / 2, width: w, height: h });
  const lines: ReactNode[] = [];
  // Figma Lines: Reframes dashed 3.84 / 4.8 and sorting dotted 1 / 5 (both starting on half a dash), the rest solid;
  // Challenges (and the empty Challenge slot, 23) end in an 18 px bar at the holo ring
  const line = (key: string, p: Seat, angle: Angle | null) => {
    const c = connector(p);
    const style = !angle ? { strokeOpacity: 0.26, strokeDasharray: '1 5', strokeDashoffset: 0.5 } : angle === 'R' ? { strokeOpacity: 0.26, strokeDasharray: '3.84 4.8', strokeDashoffset: 1.92 } : { strokeOpacity: 0.32 };
    lines.push(<line key={key} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} {...style} />);
    if (angle === 'T') lines.push(<line key={`${key}-bar`} x1={c.x1 - c.uy * 9} y1={c.y1 + c.ux * 9} x2={c.x1 + c.uy * 9} y2={c.y1 - c.ux * 9} strokeOpacity={0.32} />);
  };
  for (const { node, at: p } of l.nodes) line(node.key, p, pending ? null : node.angle);
  if (l.emptyT) line('emptyT', l.emptyT, 'T');

  // The map may be drawn smaller (15 at 0.74), but text and touch targets keep their real size: never under 12px / 44px.
  const real = (n: number) => (picture ? n : n / scale);
  const still = picture || readOnly;
  const counts = { S: 0, R: 0, T: 0 } as Record<Angle, number>;
  for (const n of arc.nodes) counts[n.angle]++;

  return (
    <div className="relative mx-auto" style={{ width: BOX.w * scale, height: (BOX.h + (fit ? 0 : BELOW)) * scale }} inert={picture || undefined} aria-hidden={picture || undefined}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: BOX.w, height: BOX.h, transform: scale === 1 ? undefined : `scale(${scale})`, '--map-scale': picture ? 1 : scale } as CSSProperties}>
        <Regions />
        <span aria-hidden="true" className="arc-holo" style={at(BOX.cx, BOX.cy, 164)} />
        <span aria-hidden="true" className="arc-orb" style={at(BOX.cx, BOX.cy, 144)} />
        {/* Figma draws the lines 1 px on screen, also on the scaled 15 */}
        <svg aria-hidden="true" width={BOX.w} height={BOX.h} className="absolute top-0 left-0" stroke="#fff" strokeWidth={real(1)} strokeLinecap="round" fill="none">{lines}</svg>
        <div aria-hidden="true" className="absolute flex flex-col items-center" style={{ left: BOX.cx - 54, top: 214, width: 108 }}>
          {/* the picture (16) is an image: Figma's 14 / 18 scaled with it; elsewhere 12 / 15 on screen at least */}
          <p data-orb-question className="line-clamp-3 text-center font-semibold tracking-[-0.006em]" /* white on the near-black orb: ≥ 4.5:1 in every tribe (tests/qa/orb-check.mjs) */ style={picture ? { fontSize: 14, lineHeight: '18px' } : { fontSize: real(Math.max(12, 14 * scale)), lineHeight: `${real(Math.max(15, 18 * scale))}px` }}>{arc.query}</p>
          <img src={TRIBE_ICON[arc.tribe]} alt="" width={12} height={12} className="mt-2" />
        </div>

        {l.nodes.map(({ node, at: [x, y], oneLine }) => {
          const i = info(node.key), st = states.get(node.key) ?? 'upcoming';
          const selected = edit?.selected === node.key;
          const lock = pick?.locked.get(node.key), kept = !!pick?.picked.has(node.key);
          const mine = own?.kept.has(node.key), yours = own?.yours.has(node.key);
          const dim = !!hold?.held && hold.held !== node.key;
          // Drawn smaller than 0.9 (18, 19, 19b at 0.78): Figma's seats leave no room for 12 px two-line labels, which ran into
          // the next node (independent check 11/22). The title takes one line and the time is only read out (and listed).
          const compact = !picture && !edit && scale < 0.9;
          const showKind = !!node.kind && !oneLine && !edit && !picture && !compact;
          return (
            <div key={node.key} className="absolute" style={{ left: x - 52, top: y - 32, width: 104, opacity: dim ? 0.22 : undefined }} inert={dim || undefined}>
              {hold?.held === node.key && <span aria-hidden="true" className="absolute top-[-8px] left-3 size-20 rounded-full border-[1.5px] border-arc-text/55" />}{/* Figma 12b held ring */}
              <button type="button" data-node-key={node.key} {...hold?.press(node.key)} onClick={() => (own ? own.onToggle(node.key) : pick ? !lock && pick.onToggle(node.key) : edit ? edit.onSelect(node.key) : onNode?.(node.key))}
                // the name is the node's own text (WCAG 2.5.3 label in name): "<angle> · <title> <time · room>", the angle
                // as hidden text; day and state as the description
                aria-description={own ? `${i.time}${yours ? ' · Yours' : ''} · Keep` : `${node.kind && !showKind ? `${KIND_NAME[node.kind]} · ` : ''}${i.time} · ${pick ? (lock === 'mine' ? 'Already in your Arcs' : lock ? 'Ended' : kept ? 'Keep' : 'Skip') : pending ? 'Angle still sorting' : STATE_WORD[st]}`}
                aria-pressed={own ? !!mine : edit ? selected : pick && !lock ? kept : undefined} aria-disabled={pick && lock ? true : undefined} disabled={readOnly && !pick}
                className={`flex w-[104px] flex-col items-center gap-0.5 ${hold ? 'arc-hold' : ''} ${pick && lock ? 'opacity-35 blur-[0.78px]' : pick && !kept ? 'opacity-50' : ''}`}>
                <span className={`arc-node ${pending ? '' : own ? (mine ? 'arc-node-upcoming' : 'arc-node-outline') : `arc-node-${st}`} ${selected || (pick && kept && !lock) ? 'arc-node-selected' : ''}`}>
                  {pending ? <img src={sortingOrb} alt="" width={64} height={64} /> : <span className="arc-node-core"><span className="arc-node-symbol" style={{ WebkitMaskImage: `url("${ANGLE_ICON[node.angle]}")`, maskImage: `url("${ANGLE_ICON[node.angle]}")` }} /></span>}
                </span>
                <span className="sr-only">{ANGLE_NAME[node.angle]} · </span>
                <span style={{ fontSize: real(12), lineHeight: `${real(15)}px` }} className={`${oneLine || showKind || compact ? 'line-clamp-1' : 'line-clamp-2'} max-w-full text-center font-semibold ${own ? (mine ? 'text-arc-text/85' : 'text-arc-text/70' /* over the holo glow: 0.7 as 25 (text-3 was 4.2:1 on 19b) */) : st === 'ended' && !pending ? 'text-arc-text-3' : st === 'heard' ? 'text-arc-text/75' : st === 'next' ? 'text-arc-text' : 'text-arc-text/85'}`}>
                  {node.debut && <span aria-hidden="true">✦ </span>}{i.title}{/* the whole title, cut to two lines (was the 24-character label) */}
                </span>
                {/* Figma 10px; 12px is the floor. Editing (Figma 15) shows the title only.
                    Sorting (25): 0.7, not 0.55, as the two-line title puts the time over the holo ring's edge (3.6:1 at 0.55) */}
                {!edit && !compact && <span style={{ fontSize: picture ? 10 : real(12) }} className={`block max-w-[104px] truncate font-medium ${pending ? 'text-arc-text/70' : 'text-arc-text-3'}`}>{i.when}</span>}
                {/* Arc 0.2.0: how a Reframe differs (user 11/21), in place of the title's second line so the node keeps its
                    height. Not where the layout already cut the title to one line (no room: 13 and 14 show it), on the share
                    picture or while editing */}
                {showKind && <span style={{ fontSize: real(12) }} className="block max-w-[104px] truncate font-medium text-arc-text-3">{KIND_NAME[node.kind!]}</span>}
              </button>
              {hold && !hold.held && ( /* hidden until focused: Tab or a screen reader reaches it right after its node */
                <button type="button" onClick={() => hold.onSwap(node.key)}
                  className="sr-only z-[3] rounded-full border border-arc-line bg-arc-surface px-4 text-[14px] font-semibold text-arc-text focus:not-sr-only focus:absolute focus:top-[66px] focus:left-1/2 focus:min-h-touch focus:-translate-x-1/2">
                  Swap<span className="sr-only"> {i.title}</span>
                </button>
              )}
              {pick && ( /* Figma 19 badge at the orb's top-right; the whole node is the button */
                // Figma 19 draws the badges at 24px outside the scaled map, centred +22, −18 from the orb: real() keeps screen px
                <span aria-hidden="true" style={{ width: real(24), height: real(24), top: 32 - real(30), left: 52 + real(10) }} className={`absolute flex items-center justify-center rounded-full ${lock ? 'border border-white/25 bg-[#2b2a35]' : kept ? 'bg-arc-text' : 'border border-white/25 bg-[#2b2a35]'}`}>
                  {lock ? <img src={lockIcon} alt="" width={real(14)} height={real(14)} /> : kept ? <img src={check} alt="" width={real(16)} height={real(16)} className="brightness-0" /> : null}
                </span>
              )}
              {yours && ( /* Figma 19b "Yours" tag at the orb's top-right; 11px there, 12px is the floor */
                <span aria-hidden="true" style={{ left: 52 + real(10), top: 32 - real(36), height: real(20), fontSize: real(12), paddingInline: real(7), borderRadius: real(10) }}
                  className="absolute flex items-center bg-arc-primary font-semibold whitespace-nowrap text-arc-on-primary">Yours</span>
              )}
              {edit && (
                <button type="button" onClick={() => edit.onRemove(node.key)} aria-label={`Remove ${i.title}`}
                  // Figma 15: 22 px with a 14 px icon outside the 0.74 scale, centred +21, −15 from the orb (screen px). The 44 px
                  // area starts just right of the node's middle (so the node keeps its own 44 px), the badge 2 px left in it
                  className="absolute z-[2] flex items-center justify-center" style={{ width: real(44), height: real(44), left: 52 + real(1), top: 32 - real(15) - real(22) }}>
                  <span className="flex items-center justify-center rounded-full border-solid border-white/24 bg-[rgba(34,29,54,0.94)]" style={{ width: real(22), height: real(22), borderWidth: real(1), transform: `translateX(${-real(2)}px)` }}><img src={minus} alt="" width={real(14)} height={real(14)} /></span>
                </button>
              )}
            </div>
          );
        })}

        {l.regions.map(({ angle: a, count, more }) => {
          // Figma "Angle · support" etc.: the region's symbol and how many talks it holds, 30 tall (22 on the 0.74 map, so
          // its text stays 12 px at least). With more talks than seats (24) it is the way to them, a button.
          const [x, y] = BADGE_AT[a], h = real(Math.max(30 * scale, 30)), font = real(Math.max(12, 13 * scale)), icon = real(Math.max(12, 16 * scale));
          const body = <>
            <span className="flex items-center rounded-full border border-white/10 bg-arc-surface font-semibold text-arc-text/78" style={{ height: h, gap: real(5 * Math.max(scale, 0.8)), paddingLeft: real(9 * Math.max(scale, 0.8)), paddingRight: real(11 * Math.max(scale, 0.8)), fontSize: font }}>
              <img src={ANGLE_ICON[a]} alt="" width={icon} height={icon} />{count}
            </span>
          </>;
          const box = { left: x, top: y, transform: 'translate(-50%, -50%)' };
          return more > 0 && !still && !edit && !own && !pick
            ? <button key={a} type="button" onClick={() => onBundle?.(a)} inert={!!hold?.held || undefined} aria-label={`All ${count} ${ANGLE_NAME[a]}`}
                className="absolute z-[2] flex items-center justify-center" style={{ ...box, minWidth: real(44), minHeight: real(44), opacity: hold?.held ? 0.22 : undefined }}>{body}</button>
            : <span key={a} aria-hidden="true" data-a11y-decor="region-count" className="absolute flex" style={{ ...box, opacity: hold?.held ? 0.22 : undefined }}>{body}</span>;
        })}

        {l.emptyT && !edit && !own && (
          <div className="absolute flex flex-col items-center" style={{ left: l.emptyT[0] - 56, top: l.emptyT[1] - 23, width: 112 }}>
            <span className="arc-node-dash flex size-[46px] items-center justify-center rounded-full"><img src={challenge} alt="" width={24} height={24} /></span>
            <p style={{ fontSize: real(12), lineHeight: `${real(16)}px` }} className="mt-2 text-center text-arc-text/60">No clear challenge at CHI this year.</p>
          </div>
        )}

        {(edit ?? own) && !pending && (['S', 'R', 'T'] as Angle[]).filter(a => counts[a] < MAX_SEATS).map(a => {
          const add = (edit ?? own)!;
          const [x, y] = ADD_AT[a][counts[a]];
          return (
            <button key={`add-${a}`} type="button" onClick={() => add.onAdd(a)} aria-label={`Add a talk to ${ANGLE_NAME[a]}`} aria-pressed={add.adding === a}
              className="absolute z-[2] flex items-center justify-center" style={{ left: x - real(22), top: y - real(22), width: real(44), height: real(44) }}>
              {/* Figma 15 add slot: 34 px with a 16 px +, outside the scale, a faint dashed edge; chosen = the selected ring */}
              <span className={`arc-node-add flex items-center justify-center rounded-full bg-arc-surface ${add.adding === a ? 'arc-node-selected' : ''}`} style={{ width: real(34), height: real(34) }}><img src={plus} alt="" width={real(16)} height={real(16)} /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
