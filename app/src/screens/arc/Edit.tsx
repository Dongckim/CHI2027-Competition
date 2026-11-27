// 15 · Edit (Figma 598:917): the map at 0.74 with − on every talk and + where an angle has room. Tapping a talk (or a +)
// opens "Swap": search, then chips — the angle (engine.suggest), New to CHI (first author new), Wildcard (engine.wildcard)
// — and cards to swap in or add. Nothing is saved until Done.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { go } from '../../router';
import { type Angle, type Arc, type ArcNode } from '../../engine';
import { firstSlot } from '../../explore/format';
import { tensionFor } from '../../arc/yours.js';
import { BOX } from '../../arc/map.js';
import { Screen, Pic } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import { ArcView, useMapFit, ANGLE_ICON } from './ArcView';
import { AddSheet } from './AddSheet';
import { useArc } from './useArc';
import { MapTour, EDIT_TOUR } from './MapTour';
import { arcOf, setEditTourSeen } from '../../arc/draft.js';
import { update, useDevice } from '../../state/useDevice';

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
  const [fill, mapRef] = useMapFit(1, `${!!(selected || adding)}|${nodes?.map(n => n.key).join() ?? ''}`); // start over when the sheet closes or a talk comes in (11/27: it shrank)
  const box = useCallback((el: HTMLDivElement | null) => {
    (mapRef as { current: HTMLDivElement | null }).current = el;
    if (!el || typeof ResizeObserver !== 'function') return;
    new ResizeObserver(() => setRoom(el.getBoundingClientRect().height)).observe(el);
  }, [mapRef]);
  useEffect(() => { if (arc && !nodes) setNodes(arc.nodes); }, [arc, nodes]);
  // the first Edit after the map's tour, once (user 11/27 「처음 editing들어가면 다른 곳처럼 가이드」)
  const dev = arcOf(useDevice());
  const [tour, setTour] = useState(false);
  const tourDue = !!dev.tour && !dev.editTour && !!nodes;
  useEffect(() => { if (!tourDue) return; const t = setTimeout(() => setTour(true), 900); return () => clearTimeout(t); }, [tourDue]);
  const endTour = useCallback(() => { setTour(false); update(setEditTourSeen); }, []);
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
    if (selected) { setNodes(nodes.map(n => (n.key === selected ? card : n))); setSelected(null); }
    else setNodes([...nodes, card]); // Add keeps the sheet open on its angle: add more, or switch angle in the sheet (11/27)
  };
  const done = async () => { await save(draft); go(`arc/${id}`); };

  return (
    <Screen clock label="Editing" header={<>
      {/* Figma: "Editing" at y 66, Done 40 high at y 58 ending 24 from the edge */}
      <h1 className="mb-[3px] pl-2 text-[17px] font-semibold tracking-[-0.012em]">Editing</h1>
      <button type="button" onClick={done} className="relative z-10 mr-2 h-10 rounded-full tracking-[-0.006em] before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-[''] bg-arc-primary px-5 text-[16px] font-semibold text-arc-on-primary shadow-[var(--arc-shadow-primary)]">Done</button>
    </>}>
      <div ref={box} className="-mx-6 -mt-1.5 flex min-h-[calc(100dvh-110px)] flex-1 flex-col">{/* Figma: the 0.74 map at y 96; the list of every talk is under it */}
        {/* before a press: the room the map leaves split above and below it, so no bare band at the bottom (user 11/26) */}
        <div style={{ height: pad }} className="transition-[height] duration-300 motion-reduce:transition-none" />
        <ArcView arc={draft} states={states} info={info} scale={target ? 0.74 : fill} room={room - pad} lift={pad}
          edit={{ selected, adding, onSelect: k => { setSelected(s => (s === k ? null : k)); setAdding(null); },
            onRemove: k => { setNodes(nodes.filter(n => n.key !== k)); if (selected === k) setSelected(null); },
            onAdd: a => { setAdding(x => (x === a ? null : a)); setSelected(null); } }} />
      </div>
      {/* user 11/27 「editing 할때 각 파트 전부 다 노드 볼 수 있도록」: the map shows three a region; every talk of each angle
          is listed under it, to swap or take off from here too */}
      {!target && (
        <section aria-label="Every talk on this Arc" className="mt-2 mb-6 flex flex-col gap-5">
          {(['S', 'R', 'T'] as Angle[]).map(a => {
            const list = nodes.filter(n => n.angle === a);
            return (
              <div key={a} className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Pic src={ANGLE_ICON[a]} size={18} />{ANGLE_NAME[a]}<span className="font-medium text-arc-text-3">{list.length}</span>
                  <button type="button" onClick={() => { setAdding(a); setSelected(null); }} className="ml-auto min-h-touch px-2 text-[14px] font-semibold text-arc-text-2">+ Add</button></h2>
                {!list.length && <p className="text-[13px] text-arc-text-3">None yet.</p>}
                {list.map(n => {
                  const i = info(n.key);
                  return (
                    <div key={n.key} className="flex items-center gap-2 rounded-[16px] border border-arc-line bg-arc-surface py-2 pr-1.5 pl-3.5">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[14px] font-semibold">{i.title}</span>
                        <span className="truncate text-[12px] text-arc-text-3">{i.when}</span>
                      </span>
                      <button type="button" onClick={() => { setSelected(n.key); setAdding(null); }} className="min-h-touch shrink-0 rounded-full px-3 text-[13px] font-semibold text-arc-text-2">Swap</button>
                      <button type="button" onClick={() => setNodes(nodes.filter(m => m.key !== n.key))} aria-label={`Remove ${i.title}`} className="flex size-11 shrink-0 items-center justify-center text-[20px] text-arc-text-2">−</button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}
      {tour && <MapTour steps={EDIT_TOUR} label="How to edit" onDone={endTour} />}
      {target && <AddSheet key={selected ?? 'add'} query={arc.query} engineName={arc.engine} filters={arc.filters} target={target} exclude={exclude} swap={!!selected} info={info} paper={paper} clash={clash} sameTime={sameTime} onPick={pick} onTarget={selected ? undefined : a => setAdding(a)} onClose={() => { setSelected(null); setAdding(null); }} />}
    </Screen>
  );
}
