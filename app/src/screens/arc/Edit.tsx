// 15 · Edit (Figma 598:917): the map at 0.74 with − on every talk and + where an angle has room. Tapping a talk (or a +)
// opens "Swap": search, then chips — the angle (engine.suggest), New to CHI (first author new), Wildcard (engine.wildcard)
// — and cards to swap in or add. Nothing is saved until Done.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { go } from '../../router';
import { type Angle, type Arc, type ArcNode } from '../../engine';
import { firstSlot } from '../../explore/format';
import { tensionFor } from '../../arc/yours.js';
import { BOX } from '../../arc/map.js';
import { Screen } from '../../components/arc';
import { ArcView, useMapFit } from './ArcView';
import { AddSheet } from './AddSheet';
import { useArc } from './useArc';

type Slot = { start: number | null; end: number };

export function Edit({ id }: { id: string }) {
  const { arc, states, info, paper, save } = useArc(id);
  const [nodes, setNodes] = useState<ArcNode[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<Angle | null>(null);
  // the regions reach the bottom of the screen, as on 12 (prototype 15: no bare lower half before the sheet opens)
  const [room, setRoom] = useState(0);
  // the map fills the screen as on 12 until a + or a talk is pressed; then 0.74 and the sheet rises from below (user 11/26
  // 「일단 화면 꽉차게 있다가 누르면 이제 아래에서 editing 화면이 올라오는 식으로」)
  const [fill, mapRef] = useMapFit();
  const box = useCallback((el: HTMLDivElement | null) => {
    (mapRef as { current: HTMLDivElement | null }).current = el;
    if (!el || typeof ResizeObserver !== 'function') return;
    new ResizeObserver(() => setRoom(el.getBoundingClientRect().height)).observe(el);
  }, [mapRef]);
  useEffect(() => { if (arc && !nodes) setNodes(arc.nodes); }, [arc, nodes]);
  const target = selected ? nodes?.find(n => n.key === selected)?.angle ?? null : adding;
  const exclude = useMemo(() => nodes?.map(n => n.key) ?? [], [nodes]);

  const pad = target ? 0 : Math.max(0, Math.round((room - (BOX.h + 40) * fill) / 2)); // 40: the labels under the lowest seats
  if (!arc || !nodes) return null;
  const draft: Arc = { ...arc, nodes, tension: tensionFor(arc, nodes) as Arc['tension'] };
  const slotOf = (key: string) => { const p = paper(key); return p ? firstSlot(p.slots as (Slot & { roomKey: string; sessionKey: string })[]) : null; };
  const clash = (key: string) => {
    const s = slotOf(key);
    if (!s) return null;
    const other = nodes.find(n => n.key !== selected && (() => { const o = slotOf(n.key); return o && o.start < s.end && s.start < o.end; })());
    return other ? info(other.key).short : null;
  };
  // the talk being swapped out: "Same time" lists the talks of its hour (Figma 11/25 Swap sheet)
  const out = selected ? slotOf(selected) : null;
  const sameTime = out ? (key: string) => { const s = slotOf(key); return !!s && s.start < out.end && out.start < s.end; } : undefined;
  const pick = (card: ArcNode) => {
    if (selected) setNodes(nodes.map(n => (n.key === selected ? card : n)));
    else setNodes([...nodes, card]);
    setSelected(null); setAdding(null);
  };
  const done = async () => { await save(draft); go(`arc/${id}`); };

  return (
    <Screen clock label="Editing" header={<>
      {/* Figma: "Editing" at y 66, Done 40 high at y 58 ending 24 from the edge */}
      <h1 className="mb-[3px] pl-2 text-[17px] font-semibold tracking-[-0.012em]">Editing</h1>
      <button type="button" onClick={done} className="relative z-10 mr-2 h-10 rounded-full tracking-[-0.006em] before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] bg-arc-primary px-5 text-[16px] font-semibold text-arc-on-primary shadow-[var(--arc-shadow-primary)]">Done</button>
    </>}>
      <div ref={box} className="-mx-6 -mt-1.5 flex-1">{/* Figma: the 0.74 map at y 96 */}
        {/* before a press: the room the map leaves split above and below it, so no bare band at the bottom (user 11/26) */}
        <div style={{ height: pad }} className="transition-[height] duration-300 motion-reduce:transition-none" />
        <ArcView arc={draft} states={states} info={info} scale={target ? 0.74 : fill} room={room - pad} lift={pad}
          edit={{ selected, adding, onSelect: k => { setSelected(s => (s === k ? null : k)); setAdding(null); },
            onRemove: k => { setNodes(nodes.filter(n => n.key !== k)); if (selected === k) setSelected(null); },
            onAdd: a => { setAdding(x => (x === a ? null : a)); setSelected(null); } }} />
      </div>
      {target && <AddSheet key={selected ?? adding} query={arc.query} engineName={arc.engine} filters={arc.filters} target={target} exclude={exclude} swap={!!selected} info={info} paper={paper} clash={clash} sameTime={sameTime} onPick={pick} />}
    </Screen>
  );
}
