// 12 · My Arc · map (Figma 597:711) with its states: 23 no clear Challenge, 24 crowded (+N), 25 angles still sorting.
// Bottom: the next talk (to 14), Edit (15) and Share (A3).
import { useCallback, useEffect, useRef, useState } from 'react';
import { engineFor, type ArcNode } from '../../engine';
import { play, OUT } from '../../arc/motion';
// 12c: the picked stop's card rises into place (prototype: 16 px, 520 ms)
const cardIn = (el: HTMLElement | null) => { play(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 120, easing: OUT }); };
import { update, useDevice } from '../../state/useDevice';
import { arcOf, setHoldHintSeen } from '../../arc/draft.js';
import { go, href } from '../../router';
import { Screen, ArcLink, ArcButton, Pic } from '../../components/arc';
import type { Angle } from '../../engine';
import { AngleHelp, ANGLE_NAME } from './AngleHelp';
const STATE_WORD = { next: 'Next', upcoming: 'Upcoming', heard: 'Heard', ended: 'Ended' } as const;
import { ArcView, ANGLE_ICON, useMapFit } from './ArcView';
import { ArcHeader } from './ArcHeader';
import { useArc } from './useArc';
import { useHoldSwap, SwapFan, SwapUndo } from './HoldSwap';
import editIcon from '../../assets/arc/icon-edit.svg';
import chevron from '../../assets/arc/icon-chevron-right.svg';
import spinner from '../../assets/arc/25-spinner.svg';
import elevator from '../../assets/arc/icon-elevator.svg';

export function ArcMap({ id, focus = null }: { id: string; focus?: Angle | null }) {
  const use = useArc(id);
  const { arc, states, info } = use;
  const hs = useHoldSwap(use);
  const [help, setHelp] = useState(false);
  const [fit, mapRef] = useMapFit();
  const closeHelp = useCallback(() => setHelp(false), []);
  // the map's box grows down to the bottom area; its height lets the regions reach that far (iPhone 11/23: cut short)
  const [room, setRoom] = useState(0);
  const watch = useRef<ResizeObserver | null>(null);
  const setBox = useCallback((el: HTMLDivElement | null) => {
    (mapRef as { current: HTMLDivElement | null }).current = el;
    watch.current?.disconnect(); watch.current = null;
    if (!el || typeof ResizeObserver !== 'function') return;
    watch.current = new ResizeObserver(() => setRoom(el.getBoundingClientRect().height));
    watch.current.observe(el);
  }, [mapRef]);
  // 12c: a tap picks a stop and the card shows its paper; the card (or a second tap) opens 14
  const [sel, setSel] = useState<string | null>(null);
  // 24b (#/arc/<id>/S|R|T): a region's count moves the map toward that angle and shows all its talks at CHI, the Arc's
  // and the engine's others (outlined, "Not on your Arc", Add). Back and "See all three angles" return to the map.
  const toFocus = (a: Angle | null) => { setSel(null); go(a ? `arc/${id}/${a}` : `arc/${id}`, a && focus ? { replace: true } : undefined); };
  useEffect(() => { setSel(null); }, [focus]);
  const [others, setOthers] = useState<Partial<Record<Angle, ArcNode[]>>>({});
  const keys = use.arc?.nodes.map(n => n.key).join() ?? '';
  useEffect(() => {
    const arc = use.arc;
    if (!arc || arc.tension === 'pending') return;
    let live = true;
    // up to twelve per angle in all (24b's seats); the count on each region is the Arc's + these
    for (const a of ['S', 'R', 'T'] as Angle[]) {
      const mine = arc.nodes.filter(n => n.angle === a).length;
      if (mine >= 12) continue;
      engineFor(arc.engine).suggest(arc.query, a, arc.nodes.map(n => n.key), 12 - mine, arc.filters)
        .then(c => { if (live) setOthers(o => ({ ...o, [a]: c.filter(n => n.angle === a) })); }, () => {});
    }
    return () => { live = false; };
  }, [keys]); // eslint-disable-line react-hooks/exhaustive-deps
  // 12a: the first time, a bubble says a stop can be held; gone at the first touch, never again
  const seen = !!arcOf(useDevice()).holdHint;
  const [hint, setHint] = useState(!seen);
  useEffect(() => { if (hint && !seen) update(setHoldHintSeen); }, [hint, seen]);
  if (!arc) return null;
  const pending = arc.tension === 'pending';
  const held = hs.fan?.key ?? null;
  const extra = focus ? others[focus] ?? [] : [];
  const candidates = new Set(extra.map(n => n.key));
  const map = use.onMap ?? arc; // the talks of the chosen days still to come or heard (useArc)
  const shown = focus ? { ...map, nodes: [...map.nodes, ...extra] } : map;
  const totals = Object.fromEntries((['S', 'R', 'T'] as Angle[]).map(a => [a, map.nodes.filter(n => n.angle === a).length + (others[a]?.length ?? 0)]));
  const picked = sel ? shown.nodes.find(n => n.key === sel) ?? null : null;
  const next = pending ? null : picked ?? (focus ? map.nodes.find(n => n.angle === focus) : map.nodes.find(n => states.get(n.key) === 'next')) ?? null;
  const ni = next ? info(next.key) : null;
  const outside = !!next && candidates.has(next.key);
  // the talk under way says Now, not Next (14 says "Now · Talk 2 of 7")
  const word = next ? (outside ? '' : ni?.on && states.get(next.key) === 'next' ? 'Now' : STATE_WORD[states.get(next.key) ?? 'upcoming']) : '';
  const add = async (n: ArcNode) => { // 24b Add: onto this Arc, in its angle (prototype "내 Arc에 더해집니다")
    await use.save({ ...arc, nodes: [...arc.nodes, n], tension: n.angle === 'T' ? 'found' : arc.tension });
    setOthers(o => ({ ...o, [n.angle]: (o[n.angle] ?? []).filter(x => x.key !== n.key) }));
  };
  // the stop the card already shows opens 14 at once (prototype 12: the Next node → 14); any other is picked first (12c)
  // prototype 12c: the Next stop while another is picked goes back to plain 12 (nothing picked)
  const tapNode = (k: string) => { if (!hs.tap()) return; if (k === next?.key && sel && sel !== k) setSel(null); else if (k === next?.key || k === sel) go(`talk/${k}`); else setSel(k); };
  return (
    <Screen clock label="My Arc" header={<ArcHeader id={id} view="map" onHelp={() => setHelp(true)} back={focus ? `arc/${id}` : 'home'} title={focus ? (
      <h2 className="mt-0.5 flex h-[42px] items-center gap-2 rounded-[21px] border border-arc-line bg-arc-surface pr-4 pl-[15px] text-[15px] font-semibold">
        <Pic src={ANGLE_ICON[focus]} size={16} />{ANGLE_NAME[focus]}<span className="font-medium text-arc-text/60">{totals[focus]}</span>
      </h2>) : undefined} />}
      bottom={<>
        <SwapUndo hs={hs} />
        {next && ni && outside && ( /* prototype 24b: a talk not on the Arc, with Add */
          <div className="flex min-h-[88px] items-center gap-3.5 rounded-[20px] border border-arc-line bg-arc-surface py-3.5 pr-4 pl-3.5">
            <span className="m-px flex size-[38px] shrink-0 items-center justify-center rounded-full border border-arc-line bg-arc-surface"><Pic src={ANGLE_ICON[next.angle]} size={18} /></span>
            <a href={href(`talk/${next.key}`)} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="line-clamp-2 text-[15px] leading-[19px] font-semibold tracking-[-0.006em]">{ni.title}</span>
              <span className="truncate text-[13px] text-arc-text/60">{ni.when} · Not on your Arc</span>
            </a>
            <ArcButton className="h-11 w-auto shrink-0 px-4 text-[14px]" onClick={() => add(next)}>Add<span className="sr-only"> {ni.title} to this Arc</span></ArcButton>
          </div>
        )}
        {next && ni && !outside && (
          <a key={next.key} ref={sel ? cardIn : undefined} href={href(`talk/${next.key}`)} inert={!!held || undefined} aria-description={`${word === 'Next' ? 'Next up' : word}: ${ANGLE_NAME[next.angle]} · ${ni.title} · ${ni.time}`}
            className="flex min-h-[88px] items-center gap-3.5 rounded-[20px] border border-arc-line bg-arc-surface py-3.5 pr-4 pl-3.5">
            {/* Figma: a 38 circle in a 40 frame, 18 px symbol */}
            <span className="m-px flex size-[38px] shrink-0 items-center justify-center rounded-full border border-arc-line bg-arc-surface"><Pic src={ANGLE_ICON[next.angle]} size={18} /></span>
            {/* Figma 11/23: the paper's title in two lines (15 / 19), then the time and room */}
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="line-clamp-2 text-[15px] leading-[19px] font-semibold tracking-[-0.006em]">{ni.title}</span>
              {/* user 11/25 E: the first author (and the session's chair) to look for */}
              {(ni.first || ni.chair) && <span className="truncate text-[12px] font-medium text-arc-text-3">{[ni.first && `by ${ni.first}`, ni.chair && `Chair ${ni.chair.split(' · ')[0]}`].filter(Boolean).join(' · ')}</span>}
              <span className="truncate text-[13px] text-arc-text/60">{word} · {ni.when.replace(' · Rm ', ' · Room ') /* prototype 12: the card spells "Room", the nodes keep "Rm" */}{use.lift(next.key) && <> · <span className="inline-flex items-center gap-1 align-[-2px]"><Pic src={elevator} size={14} className="opacity-80" />Elevator</span></>}</span>
            </span>
            <Pic src={chevron} size={20} className="opacity-50" />
          </a>
        )}
        {focus ? <ArcButton kind="secondary" onClick={() => toFocus(null)}>See all three angles</ArcButton> : (
          <div className="flex gap-3" inert={!!held || undefined}>
            <ArcLink kind="secondary" href={href(`arc/${id}/edit`)} className="min-w-[128px] shrink-0"><Pic src={editIcon} size={20} />Edit</ArcLink>
            <ArcLink href={href(`share/${id}`)}>Share</ArcLink>
          </div>
        )}
      </>}>
      <h1 className="sr-only">{arc.query}</h1>
      {/* Figma: the map box at y 112 on every state; 25's pill sits over its top, its centre 2.75 right of the middle */}
      {/* 24b Reframes / Challenges (no Figma): the other two angles as a centred row under the header, the same pills as
          the map's counts. Pinned inside the scaled map they sat at odd places against the region lines (iPhone 11/25) */}
      {(focus === 'R' || focus === 'T') && (
        <div className="relative z-[1] mt-2 flex justify-center gap-2">{/* over the region field, which runs up behind it */}
          {(['S', 'R', 'T'] as Angle[]).filter(a => a !== focus).map(a => (
            <button key={a} type="button" onClick={() => toFocus(a)} aria-label={`All ${totals[a]} ${ANGLE_NAME[a]}`} className="flex min-h-touch items-center">
              <span data-badge={a} className="flex h-[30px] items-center gap-[5px] rounded-full border border-white/10 bg-arc-surface pr-[11px] pl-[9px] text-[13px] font-semibold text-arc-text/78">
                <Pic src={ANGLE_ICON[a]} size={16} /><span data-count="">{totals[a]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div ref={setBox} data-motion="own" /* the map blooms by itself; the entrance moved this box 12 px while the map was sized, 1% too small (flow-check 11/25) */ className="relative -mx-6 mt-[10px] flex-1" onPointerDownCapture={() => setHint(false)} onKeyDownCapture={() => setHint(false)}>
        {pending && (
          <p role="status" className="absolute top-0 left-[calc(50%-73px)] z-10 flex h-9 items-center gap-2 rounded-[18px] border border-arc-line bg-arc-surface pr-3.5 pl-2.5 text-[13px] font-medium whitespace-nowrap text-arc-text/85">
            <img src={spinner} alt="" width={16} height={16} />Sorting angles…{/* Figma 25: a still 3/4 arc */}
          </p>
        )}
        {use.schedule && <ArcView arc={shown} states={states} info={info} scale={fit} fit onNode={tapNode} selected={sel} hint={hint && !pending && !focus} onBundle={a => toFocus(a)} focus={focus}
          totals={pending ? undefined : totals} candidates={candidates} room={room}
          hold={pending || focus ? undefined : { held, press: hs.press, onSwap: k => hs.open(k, true) }} />}{/* drawn once the times are in: the bloom orders talks by their state */}
      </div>
      {held && <SwapFan hs={hs} title={info(held).title} />}
      <AngleHelp open={help} onClose={closeHelp} />
    </Screen>
  );
}
