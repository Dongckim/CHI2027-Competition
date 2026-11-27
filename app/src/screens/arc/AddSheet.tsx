// The Swap / Add sheet of 15 (Figma 598:917), also 19b's Add: search, then chips — the angle (engine.suggest), New to CHI
// (Same time: when swapping, talks at the hour of the one going out), Wildcard (engine.wildcard) — and cards to swap in or add. Every card goes under the angle the engine
// gives it (search: engine.judge), which the card says when it is not the sheet's own angle.
import { notOver } from './useArc';
import { now as nowMs } from '../../clock.js';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadAbstracts } from '../../data/load';
import { abstractFileDay } from '../../explore/format';
import { TIME_ZONE } from './When';
import { MapTour, SHEET_TOUR } from './MapTour';
import { arcOf, setSheetTourSeen } from '../../arc/draft.js';
import { update, useDevice } from '../../state/useDevice';
import { engineFor, type Angle, type Arc, type ArcNode } from '../../engine';
import { searchTalks } from '../../../../data/scripts/search.mjs';
import { useExploreData } from '../../explore/useExplore';
import { labelOf } from '../../arc/label.js';
import { Pic, ArcButton, useKeyboardInset } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import { ANGLE_ICON, type Info } from './ArcView';
import searchIcon from '../../assets/arc/icon-search.svg';
import sparkle from '../../assets/arc/icon-sparkle.svg';
import wild from '../../assets/arc/icon-wildcard.svg';
import warning from '../../assets/arc/icon-warning.svg';

type Filter = 'angle' | 'same' | 'wild';
type Card = ArcNode & { off?: true }; // off: the engine finds it not about the question
const off = (key: string, label: string): Card => ({ key, angle: 'R', label, evidence: null, debut: false, off: true });
const NOT_ABOUT = 'Not about your question';

export function AddSheet({ query: arcQuery, engineName, filters, target, exclude, swap, info, paper, clash, sameTime, onPick, onTarget, onClose }: {
  query: string; engineName: string; filters?: Arc['filters']; target: Angle; exclude: string[]; swap: boolean; info: (key: string) => Info;
  paper: (key: string) => { title: string; authors: string[] } | undefined; clash: (key: string) => string | null; onPick: (card: ArcNode) => void;
  /** Swap only: whether a talk overlaps the one being swapped out (Figma 11/25 "Same time" chip, in place of First CHI paper) */
  sameTime?: (key: string) => boolean;
  /** Add only: the sheet's own angle can be changed in place (user 11/27 「각 3파트 자유롭게 돌아다니면서 editing」) */
  onTarget?: (a: Angle) => void;
  onClose?: () => void;
}) {
  const { data } = useExploreData();
  const [filter, setFilter] = useState<Filter>('angle');
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<Card[] | null>(null);
  const [failed, setFailed] = useState(false);
  // user 11/27: a card asks before it goes in ("Add …?"), and a long press shows the whole paper first
  const [confirm, setConfirm] = useState<Card | null>(null);
  const [peek, setPeek] = useState<Card | null>(null);
  const [abs, setAbs] = useState<string | null>(null);
  const hold = useRef(0), held = useRef(false), opened = useRef(0), sheet = useRef<HTMLElement>(null);
  const kb = useKeyboardInset();
  // Escape closes the top layer: the preview, then the question, then the sheet (audit 11/27)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (peek) setPeek(null); else if (confirm) setConfirm(null); else onClose?.(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [peek, confirm, onClose]);
  // its own short tour the first time it has talks to show, after the map's (so not in a stranger's first look)
  const dev = arcOf(useDevice());
  const [tour, setTour] = useState(false);
  // the Add sheet's tour (Swap has no angle chips)
  useEffect(() => { if (swap || !dev.tour || dev.sheetTour || !cards?.length) return; const t = setTimeout(() => setTour(true), 500); return () => clearTimeout(t); }, [dev.tour, dev.sheetTour, cards?.length]);
  useEffect(() => {
    setAbs(null);
    const p = peek && (paper(peek.key) as { slots?: { start: number | null }[] } | undefined);
    if (!p?.slots) return;
    let live = true;
    loadAbstracts(abstractFileDay(p.slots as never, TIME_ZONE)).then(a => live && setAbs(a[peek!.key] ?? ''), () => live && setAbs(''));
    return () => { live = false; };
  }, [peek]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // cards for the sheet
    let live = true;
    setCards(null); setFailed(false);
    const e = engineFor(engineName);
    if (query.trim() && data) {
      // user 11/25 「A로 하고」: a found talk goes where the engine puts it for this question, never simply the target angle;
      // one it finds not about the question is shown but cannot be added
      const hits = searchTalks(data.index, query).filter(h => !exclude.includes(h.key)).slice(0, 10);
      if (!hits.length) { setCards([]); return; }
      const timer = setTimeout(() => {
        e.judge(arcQuery, hits.map(h => h.key)).then(l => live && setCards(hits.map((h, i) => l[i] ?? off(h.key, labelOf(paper(h.key)?.title ?? h.key)))),
          () => { if (live) { setCards([]); setFailed(true); } });
      }, 300); // after a pause in typing
      return () => { live = false; clearTimeout(timer); };
    }
    const get = filter === 'wild' ? e.wildcard(arcQuery, exclude, 8, filters)
      : e.suggest(arcQuery, target, exclude, filter === 'same' ? 40 : 8, filters).then(l => (filter === 'same' && sameTime ? l.filter(n => sameTime(n.key)).slice(0, 8) : l));
    get.then(l => live && setCards(l.filter(notOver(paper, nowMs()))), () => live && setCards([]));
    return () => { live = false; };
  }, [arcQuery, engineName, target, filter, query, data, exclude]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (card: ArcNode) => { setQuery(''); onPick(card); };
  return (
    <section ref={sheet} data-sheet="" aria-label={swap ? 'Swap' : `Add to ${ANGLE_NAME[target]}`} style={kb.inset ? { bottom: kb.inset, maxHeight: kb.height - 8, overflowY: 'auto' } : undefined} /* typing in its search: the sheet sits on the keyboard (11/27) */ className="arc-sheet-up fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] rounded-t-[32px] border border-arc-line bg-arc-sheet px-6 pt-[9px] pb-[calc(var(--safe-bottom)+16px)] shadow-[0_-8px_40px_rgba(0,0,0,0.4)]">
      <div className="mx-auto mb-3.5 h-1 w-9 rounded-sm bg-arc-text/30" aria-hidden="true" />
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold tracking-[-0.012em]">{swap ? 'Swap' : `Add to ${ANGLE_NAME[target]}`}</h2>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="-my-2 -mr-2 flex size-11 items-center justify-center"><span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-white/10 text-[15px] text-arc-text-2">×</span></button>}
      </div>
      <label className="mt-3 flex h-11 items-center gap-2 rounded-full border border-arc-line bg-arc-surface pl-3.5">
        <Pic src={searchIcon} size={18} />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search talks or authors" aria-label="Search talks"
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[16px] tracking-[-0.006em] text-arc-text placeholder:text-arc-text-3 focus:outline-none" />{/* 16 px: iOS zooms into smaller fields */}
      </label>
      {!query.trim() && (
        <div data-tour="sheet-chips" role="radiogroup" aria-label="Show" className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-1">
          {([...(onTarget && !swap ? (['S', 'R', 'T'] as Angle[]).map(a => [`angle:${a}`, ANGLE_ICON[a], ANGLE_NAME[a]]) : [['angle', ANGLE_ICON[target], ANGLE_NAME[target]]]), ...(sameTime ? [['same', sparkle, 'Same time']] : []), ['wild', wild, 'Wildcard']] as [string, string, string][]).map(([key, icon, label]) => {
            const f = (key.startsWith('angle') ? 'angle' : key) as Filter, on = key.startsWith('angle:') ? filter === 'angle' && key === `angle:${target}` : filter === f;
            return (
            <button key={key} type="button" role="radio" aria-checked={on} onClick={() => { setFilter(f); if (key.startsWith('angle:')) onTarget?.(key.slice(6) as Angle); }}
              className={`relative inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium tracking-[-0.006em] before:absolute before:inset-x-0 before:-inset-y-[4px] before:content-[''] ${on ? 'bg-arc-chip-on text-arc-on-primary shadow-[var(--arc-shadow-lift)]' : 'border border-arc-line bg-arc-surface text-arc-text/62'}`}>
              {/* the icon in the chip's text colour (a mask): WebKit drew the selected chip's brightness(0) icon blank */}
              <span aria-hidden="true" className={`size-4 shrink-0 bg-current ${on ? '' : 'opacity-60'}`} style={{ WebkitMaskImage: `url("${icon}")`, maskImage: `url("${icon}")`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' }} />{label}
            </button>
          ); })}
        </div>
      )}
      {!query.trim() && filter === 'wild' && <p className="mt-2 text-[12px] font-medium text-arc-text-2">Wildcard picks its own angle for each talk.</p>}
      <div data-tour="sheet-cards" className="-mx-6 mt-3 flex min-h-[112px] gap-3 overflow-x-auto px-6 pb-1" aria-live="polite">
        {cards == null ? <p className="py-4 text-[14px] text-arc-text-3">Looking…</p>
          : !cards.length ? <p className="py-4 text-[14px] text-arc-text-3">{failed ? 'Could not sort these talks. Try again.' : query.trim() ? 'No talks match.' : 'Nothing more here.'}</p>
          : cards.map(c => {
            const i = info(c.key), p = paper(c.key), clashWith = c.off ? null : clash(c.key);
            const name = ANGLE_NAME[c.angle], elsewhere = !c.off && c.angle !== target;
            // every visible word in the name (WCAG 2.5.3), where it goes first
            const status = c.off ? [] : [elsewhere && `Goes to ${name}`, clashWith ? `Same time as ${clashWith}` : c.debut && 'New to CHI'].filter(Boolean);
            const action = c.off ? NOT_ABOUT : swap ? `Swap in · ${name}` : `Add to ${name}`;
            const where = `${i.time}${i.room && ` · ${i.room}`}`;
            return (
              <button key={c.key} type="button" onClick={() => { if (held.current) { held.current = false; return; } if (!c.off) setConfirm(c); }} disabled={c.off}
                // user 11/27 「꾹 누르면 그 위쪽으로 다른 창으로 보이게 해주고, 때면 사라지는」: the preview lives while the finger does
                onPointerDown={e => { held.current = false; clearTimeout(hold.current); const el = e.currentTarget, id = e.pointerId;
                  hold.current = window.setTimeout(() => { held.current = true; opened.current = Date.now(); try { el.setPointerCapture(id); } catch { /* gone */ } setPeek(c); }, 450); }}
                onPointerUp={() => clearTimeout(hold.current)} onPointerLeave={() => { if (!held.current) clearTimeout(hold.current); }}
                onPointerCancel={() => clearTimeout(hold.current)}
                onContextMenu={e => e.preventDefault()} style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }} aria-label={`${action}: ${[...status, p?.title ?? c.label, where].join(' · ')}`}
                className={`flex w-[232px] shrink-0 flex-col gap-1.5 rounded-3xl border border-arc-line bg-arc-surface px-3.5 py-3 text-left ${c.off ? 'border-dashed' : ''}`}>
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-semibold text-arc-text/80">
                  {c.off ? <span className="text-arc-text">{NOT_ABOUT}</span> : <>
                    <Pic src={ANGLE_ICON[c.angle]} size={16} />
                    {elsewhere && <span className="text-arc-text">Goes to {name}</span>}
                    {clashWith ? <><Pic src={warning} size={14} />Same time as {clashWith}</> : c.debut ? <><Pic src={sparkle} size={12} />New to CHI</> : null}
                  </>}
                </span>
                <span className="line-clamp-2 text-[15px] leading-[19px] font-semibold tracking-[-0.006em]">{p?.title ?? c.label}</span>
                {/* Figma 11px; 12px is the floor */}
                <span className="text-[12px] font-medium text-arc-text-3">{i.time}{i.room && ` · ${i.room}`}</span>
              </button>
            );
          })}
      </div>
      {!!cards?.length && <p className="mt-1 text-[12px] text-arc-text-3">Hold a card to read the paper · tap it to {swap ? 'swap it in' : 'add'}</p>}
      {peek && (() => {
        // user 11/27 「B로 해줘」, as iOS does: the preview opens on a long press and stays after the finger lifts, so the
        // abstract can be scrolled; a press outside it or × closes it, and Add is right there
        const i = info(peek.key), p = paper(peek.key);
        const top = sheet.current?.getBoundingClientRect().top ?? innerHeight * 0.5;
        return createPortal(
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => { if (Date.now() - opened.current > 450) setPeek(null); }}>{/* the lift that opened it lands here too: not a close */}
            <div role="dialog" aria-modal="true" aria-label={p?.title ?? peek.label} onClick={e => e.stopPropagation()}
              className="arc-peek absolute inset-x-0 mx-auto flex max-w-[448px] flex-col overflow-hidden rounded-[22px] border border-arc-line bg-arc-sheet font-sans text-arc-text shadow-[0_12px_48px_rgba(0,0,0,0.6)]"
              style={{ bottom: innerHeight - top + 10, top: 'max(12px, env(safe-area-inset-top, 0px))', marginInline: 16 }}>
              <div className="flex items-start gap-2 px-5 pt-4">
                <p className="min-w-0 flex-1 text-[12px] font-semibold text-arc-text-2">{ANGLE_NAME[peek.angle]} · {i.time}{i.room && ` · ${i.room}`}</p>
                <button type="button" onClick={() => setPeek(null)} aria-label="Close" className="-mt-2.5 -mr-2.5 flex size-11 shrink-0 items-center justify-center"><span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-white/10 text-[15px] text-arc-text-2">×</span></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
                <p className="text-[17px] leading-[22px] font-semibold tracking-[-0.012em]">{p?.title ?? peek.label}</p>
                {i.first && <p className="mt-1.5 text-[13px] font-medium text-arc-text-2">by {i.first}{p && p.authors.length > 1 && ` and ${p.authors.length - 1} more`}</p>}
                <p className="mt-2.5 text-[14px] leading-[21px] text-arc-text-2">{abs == null ? 'Loading the abstract…' : abs || 'No abstract in the programme.'}</p>
              </div>
              {!peek.off && <div className="border-t border-arc-line px-5 py-3"><ArcButton onClick={() => { const c = peek; setPeek(null); pick(c); }}>{swap ? 'Swap in' : `Add to ${ANGLE_NAME[peek.angle]}`}</ArcButton></div>}
            </div>
          </div>, document.body);
      })()}
      {confirm && (() => {
        const c = confirm, i = info(c.key), p = paper(c.key), name = ANGLE_NAME[c.angle];
        const go = () => { setConfirm(null); pick(c); };
        const close = () => setConfirm(null);
        return (
          <div role="dialog" aria-label={`${swap ? 'Swap in' : 'Add'} this talk?`} className="absolute inset-0 z-10 flex flex-col rounded-t-[32px] bg-arc-sheet px-6 pt-5 pb-[calc(var(--safe-bottom)+16px)]">
            <p className="text-[13px] font-semibold text-arc-text-2">{`${swap ? 'Swap in' : 'Add'} this talk to ${name}?`}</p>
            <p className="mt-1.5 text-[18px] leading-[23px] font-semibold tracking-[-0.012em]">{p?.title ?? c.label}</p>
            {i.first && <p className="mt-1.5 text-[13px] font-medium text-arc-text-2">by {i.first}{p && p.authors.length > 1 && ` and ${p.authors.length - 1} more`}</p>}
            <p className="mt-1 text-[13px] text-arc-text-3">{i.time}{i.room && ` · ${i.room}`}</p>
            <div className="mt-auto flex gap-3 pt-4">
              <ArcButton kind="secondary" className="flex-1" onClick={close}>Cancel</ArcButton>
              <ArcButton className="flex-[1.4]" onClick={go}>{swap ? 'Swap in' : `Add to ${name}`}</ArcButton>
            </div>
          </div>
        );
      })()}
      {tour && <MapTour steps={SHEET_TOUR} label="How to add" onDone={() => { setTour(false); update(setSheetTourSeen); }} />}
    </section>
  );
}
