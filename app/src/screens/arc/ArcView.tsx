// The Arc map (Figma 597:711; states 23/24/25; Edit 15 at 0.74). Question orb in the middle, Supports left, Reframes
// below, Challenges right. Positions come from arc/map.js; the orb, rings and node fills take the tribe colour (Figma's
// pictures are drawn in the sample tribe's blue). Every node is a button named "<angle> · <title> · <time>".
import { useEffect, useState, type ReactNode } from 'react';
import { layout, connector, BOX, type NodeState } from '../../arc/map.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { ANGLE_NAME } from './AngleHelp';
import outerOrbit from '../../assets/arc/22-orbit-outer.svg';
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
const SEATS: Record<Angle, number> = { S: 2, R: 3, T: 2 };
const FREE: Record<Angle, [number, number][][]> = { // where an add slot goes when an angle has 0 / 1 / 2 talks (Edit)
  S: [[[66, 236]], [[66, 358]]], T: [[[324, 236]], [[324, 358]]], R: [[[195, 470]], [[252, 446]], [[195, 500]]],
};
// Figma 15 keeps a "+" for every angle; when its seats are full it sits here (Figma's add slots on the 390 map)
const FULL: Record<Angle, [number, number]> = { S: [66, 236], T: [324, 236], R: [195, 395] }; // R: Figma's (195, 452) would cover the − of a third Reframe

/** The map's scale on this screen: Figma's 390 box, shrunk to fit narrower phones (375, 360); text stays real px. */
export function useFitScale(base = 1) {
  const [w, setW] = useState(() => (typeof innerWidth === 'number' ? innerWidth : BOX.w));
  useEffect(() => { const on = () => setW(innerWidth); addEventListener('resize', on); return () => removeEventListener('resize', on); }, []);
  return base * Math.min(1, w / BOX.w);
}

const BELOW = 80; // the bottom row's labels hang below the 530 box (Figma's labels are one line; real titles two)

export type Info = { title: string; short: string; time: string; when: string; room: string };
// 19: tap a talk to keep or skip it; locked talks (over, or already in one of my Arcs) cannot be picked.
export type Pick = { picked: Set<string>; locked: Map<string, 'ended' | 'mine'>; onToggle: (key: string) => void };
type Edit = { selected: string | null; onSelect: (key: string) => void; onRemove: (key: string) => void; onAdd: (angle: Angle) => void; adding: Angle | null };

export function ArcView({ arc, states, info, scale = 1, onNode, onBundle, edit, pick, picture, readOnly }: {
  arc: Arc; states: Map<string, NodeState>; info: (key: string) => Info; scale?: number;
  onNode?: (key: string) => void; onBundle?: (angle: Angle) => void; edit?: Edit;
  /** picture: a shareable image (16), text scales with the map and nothing is a button. readOnly: shown, not tappable (18). */
  pick?: Pick; picture?: boolean; readOnly?: boolean;
}) {
  type Seat = [number, number];
  const l = layout(arc) as { nodes: { node: Arc['nodes'][number]; at: Seat }[]; bundles: { angle: Angle | null; at: Seat; count: number }[]; emptyT: Seat | null }; // map.js is untyped JS
  const pending = arc.tension === 'pending';
  const at = (x: number, y: number, w: number, h = w) => ({ position: 'absolute' as const, left: x - w / 2, top: y - h / 2, width: w, height: h });
  const lines: ReactNode[] = [];
  for (const { node, at: p } of l.nodes) {
    const c = connector(p);
    const style = pending ? { strokeOpacity: 0.26, strokeDasharray: '1 5' } : node.angle === 'R' ? { strokeOpacity: 0.26, strokeDasharray: '5 5' } : { strokeOpacity: 0.32 };
    lines.push(<line key={node.key} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} {...style} />);
    if (!pending && node.angle === 'T') lines.push(<line key={`${node.key}-tick`} x1={c.x1 - c.uy * 6} y1={c.y1 + c.ux * 6} x2={c.x1 + c.uy * 6} y2={c.y1 - c.ux * 6} strokeOpacity={0.32} />);
  }
  for (const b of l.bundles) { const c = connector(b.at, 24); lines.push(<line key={`b-${b.angle}`} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} strokeOpacity={b.angle ? 0.32 : 0.26} strokeDasharray={b.angle === 'R' ? '5 5' : b.angle ? undefined : '1 5'} />); }
  if (l.emptyT) { const c = connector(l.emptyT, 23); lines.push(<line key="emptyT" x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} strokeOpacity={0.2} strokeDasharray="3 4" />); }

  // The map may be drawn smaller (15 at 0.74), but text and touch targets keep their real size: never under 12px / 44px.
  const real = (n: number) => (picture ? n : n / scale);
  const still = picture || readOnly;
  const counts = { S: 0, R: 0, T: 0 } as Record<Angle, number>;
  for (const n of arc.nodes) counts[n.angle]++;

  return (
    <div className="relative mx-auto" style={{ width: BOX.w * scale, height: (BOX.h + BELOW) * scale }} inert={picture || undefined} aria-hidden={picture || undefined}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: BOX.w, height: BOX.h, transform: scale === 1 ? undefined : `scale(${scale})` }}>
        <img src={outerOrbit} alt="" aria-hidden="true" style={{ position: 'absolute', left: -25, top: 20, width: 440, height: 440 }} />
        <span aria-hidden="true" className="arc-ring" style={at(BOX.cx, BOX.cy, 300)} />
        <span aria-hidden="true" className="arc-holo" style={at(BOX.cx, BOX.cy, 164)} />
        <span aria-hidden="true" className="arc-orb" style={at(BOX.cx, BOX.cy, 144)} />
        <svg aria-hidden="true" width={BOX.w} height={BOX.h} className="absolute top-0 left-0" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" fill="none">{lines}</svg>
        <div aria-hidden="true" className="absolute flex flex-col items-center" style={{ left: BOX.cx - 54, top: 206, width: 108 }}>
          <p data-contrast-exception="figma-orb" className="line-clamp-3 text-center font-semibold tracking-[-0.006em]" /* white on the orb as in Figma: 1.3–3.7:1, kept by the user's decision (A4 doc) */ style={{ fontSize: real(Math.max(12, 14 * scale)), lineHeight: `${real(Math.max(15, 18 * scale))}px` }}>{arc.query}</p>
          <img src={TRIBE_ICON[arc.tribe]} alt="" width={12} height={12} className="mt-1.5" />
        </div>

        {l.nodes.map(({ node, at: [x, y] }) => {
          const i = info(node.key), st = states.get(node.key) ?? 'upcoming';
          const selected = edit?.selected === node.key;
          const lock = pick?.locked.get(node.key), kept = !!pick?.picked.has(node.key);
          return (
            <div key={node.key} className="absolute" style={{ left: x - 52, top: y - 32, width: 104 }}>
              <button type="button" onClick={() => (pick ? !lock && pick.onToggle(node.key) : edit ? edit.onSelect(node.key) : onNode?.(node.key))}
                // the name is the node's own text (WCAG 2.5.3 label in name): "<angle> · <title> <time · room>", the angle
                // as hidden text; day and state as the description
                aria-description={`${i.time} · ${pick ? (lock === 'mine' ? 'Already in your Arcs' : lock ? 'Ended' : kept ? 'Keep' : 'Skip') : pending ? 'Angle still sorting' : STATE_WORD[st]}`}
                aria-pressed={edit ? selected : pick && !lock ? kept : undefined} aria-disabled={pick && lock ? true : undefined} disabled={readOnly && !pick}
                className={`flex w-[104px] flex-col items-center gap-0.5 ${pick && lock ? 'opacity-35 blur-[0.78px]' : pick && !kept ? 'opacity-50' : ''}`}>
                <span className={`arc-node ${pending ? '' : `arc-node-${st}`} ${selected || (pick && kept && !lock) ? 'arc-node-selected' : ''}`}>
                  {pending ? <img src={sortingOrb} alt="" width={64} height={64} /> : <span className="arc-node-core"><img src={ANGLE_ICON[node.angle]} alt="" width={24} height={24} /></span>}
                </span>
                <span className="sr-only">{ANGLE_NAME[node.angle]} · </span>
                <span style={{ fontSize: real(12), lineHeight: `${real(15)}px` }} className={`line-clamp-2 text-center font-semibold ${st === 'ended' && !pending ? 'text-arc-text-3' : st === 'heard' ? 'text-arc-text/75' : st === 'next' ? 'text-arc-text' : 'text-arc-text/85'}`}>
                  {node.debut && <span aria-hidden="true">✦ </span>}{i.title}{/* the whole title, cut to two lines (was the 24-character label) */}
                </span>
                {/* Figma 10px; 12px is the floor. Editing (Figma 15) shows the title only */}
                {!edit && <span style={{ fontSize: real(12) }} className="block max-w-[104px] truncate font-medium text-arc-text-3">{i.when}</span>}
              </button>
              {pick && ( /* Figma 19 badge at the orb's top-right; the whole node is the button */
                // Figma 19 draws the badges at 24px outside the scaled map: real() keeps them 24 on screen
                <span aria-hidden="true" style={{ width: real(24), height: real(24), top: -4, left: 82 - real(12) }} className={`absolute flex items-center justify-center rounded-full ${lock ? 'border border-white/25 bg-[#2b2a35]' : kept ? 'bg-arc-text' : 'border border-white/25 bg-[#2b2a35]'}`}>
                  {lock ? <img src={lockIcon} alt="" width={real(14)} height={real(14)} /> : kept ? <img src={check} alt="" width={real(16)} height={real(16)} className="brightness-0" /> : null}
                </span>
              )}
              {edit && (
                <button type="button" onClick={() => edit.onRemove(node.key)} aria-label={`Remove ${i.title}`}
                  className="absolute flex items-center justify-center" style={{ width: real(44), height: real(44), left: 85 - real(22), top: 0 - real(22) + 11 }}>
                  <span className="flex size-[22px] items-center justify-center rounded-full border border-white/24 bg-[rgba(34,29,54,0.94)]"><img src={minus} alt="" width={14} height={14} /></span>
                </button>
              )}
            </div>
          );
        })}

        {l.bundles.map(b => (
          <button key={b.angle ?? 'all'} type="button" disabled={still} onClick={() => onBundle?.(b.angle as Angle)}
            className="absolute flex flex-col items-center gap-0.5" style={{ left: b.at[0] - 40, top: b.at[1] - 24, width: 80 }}>
            <span aria-hidden="true" data-a11y-decor="bundle-count" className="flex size-12 items-center justify-center rounded-full border border-arc-line bg-arc-surface text-[15px] font-semibold">+{b.count}</span>
            <span style={{ fontSize: real(12) }} className="font-semibold text-arc-text/80">{b.count} more<span className="sr-only"> {b.angle ? ANGLE_NAME[b.angle] : 'talks'}</span></span>
          </button>
        ))}

        {l.emptyT && !edit && (
          <div className="absolute flex flex-col items-center" style={{ left: l.emptyT[0] - 56, top: l.emptyT[1] - 23, width: 112 }}>
            <span className="flex size-[46px] items-center justify-center rounded-full border border-dashed border-arc-text/30"><img src={challenge} alt="" width={24} height={24} /></span>
            <p style={{ fontSize: real(12), lineHeight: `${real(16)}px` }} className="mt-2 text-center text-arc-text/60">No clear challenge at CHI this year.</p>
          </div>
        )}

        {edit && !pending && (['S', 'R', 'T'] as Angle[]).map(a => {
          const full = counts[a] >= SEATS[a];
          const [x, y] = !full ? FREE[a][counts[a]][0] : a === 'S' && l.bundles.some(b => b.angle === 'S') ? [96, 236] : FULL[a];
          return (
            <button key={`add-${a}`} type="button" onClick={() => edit.onAdd(a)} aria-label={`Add a talk to ${ANGLE_NAME[a]}`} aria-pressed={edit.adding === a}
              className="absolute flex items-center justify-center" style={{ left: x - real(22), top: y - real(22), width: real(44), height: real(44) }}>
              <span className={`flex size-[34px] items-center justify-center rounded-full border border-dashed bg-arc-surface ${edit.adding === a ? 'border-white/90' : 'border-white/30'}`}><img src={plus} alt="" width={16} height={16} /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
