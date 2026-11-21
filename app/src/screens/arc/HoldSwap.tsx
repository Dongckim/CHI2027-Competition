// 12b · Hold a stop · swap (Figma 741:1758). Hold a node for 0.5 s: three talks of the same angle (engine.suggest, as
// 15's Swap) fan out under the map; let go on one to swap it in and save, anywhere else to close. "Swapped · Undo" stays
// 5 s (user 「12b는 바꾼 직후 "Swapped · Undo" 알림을 5초 띄워서 되돌릴 수 있게」). Keyboard and screen readers: each node's
// "Swap" button opens the same three as buttons; Escape (or a press outside) closes. A short tap still opens 14.
import { useEffect, useLayoutEffect, useRef, useState, type DOMAttributes } from 'react';
import { engine, type Angle, type Arc, type ArcNode } from '../../engine';
import { walkMinutes } from '../../venue/walk.js';
import { minutesText } from '../../venue/directions.js';
import { venueClock } from '../../time.js';
import { firstSlot } from '../../explore/format';
import { Pic } from '../../components/arc';
import { ANGLE_ICON } from './ArcView';
import { shortRoom, type useArc } from './useArc';

const HOLD_MS = 500, SLOP = 10, UNDO_MS = 5000;
const ONE: Record<Angle, string> = { S: 'Support', R: 'Reframe', T: 'Challenge' }; // Figma: "keep this Reframe"
type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
const cardAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-swap-key]')?.dataset.swapKey ?? null;
const nodeEl = (key: string) => document.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`);

export function useHoldSwap({ arc, save, paper, schedule }: ReturnType<typeof useArc>) {
  const [fan, setFan] = useState<{ key: string; keyboard: boolean } | null>(null);
  const [cards, setCards] = useState<ArcNode[] | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ arc: Arc; keyboard: boolean } | null>(null);
  const timer = useRef(0), from = useRef<{ x: number; y: number } | null>(null), swallow = useRef(false), openKey = useRef<string | null>(null);
  const asked = useRef(new Map<string, Promise<ArcNode[]>>());
  // asked at the press, so the 1.2 s mock answer is mostly in by the time the hold opens
  const choices = (key: string) => {
    const node = arc?.nodes.find(n => n.key === key);
    if (!arc || !node) return Promise.resolve([]);
    if (!asked.current.has(key)) asked.current.set(key, engine.suggest(arc.query, node.angle, arc.nodes.map(n => n.key), 3).catch(() => []));
    return asked.current.get(key)!;
  };
  const open = (key: string, keyboard: boolean) => {
    openKey.current = key; setFan({ key, keyboard }); setOver(null); setCards(null);
    choices(key).then(l => { if (openKey.current === key) setCards(l); });
  };
  const close = () => {
    const f = fan; openKey.current = null; setFan(null); setOver(null);
    if (f?.keyboard) requestAnimationFrame(() => nodeEl(f.key)?.focus());
  };
  const swap = async (card: ArcNode) => {
    if (!arc || !fan) return;
    const { key, keyboard } = fan;
    openKey.current = null; setFan(null); setOver(null); asked.current.clear();
    await save({ ...arc, nodes: arc.nodes.map(n => (n.key === key ? card : n)) }); // same angle: the tension state stays
    setUndo({ arc, keyboard });
  };
  const restore = async () => {
    if (!undo) return;
    const old = undo.arc.nodes.find(n => !arc?.nodes.some(m => m.key === n.key));
    asked.current.clear(); await save(undo.arc); setUndo(null);
    if (undo.keyboard && old) requestAnimationFrame(() => nodeEl(old.key)?.focus());
  };
  const heldAngle = fan ? arc?.nodes.find(n => n.key === fan.key)?.angle ?? null : null;

  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), UNDO_MS); return () => clearTimeout(t); }, [undo]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { // while open: Escape or a press outside closes; a held finger does not scroll the page
    if (!fan) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const outside = (e: PointerEvent) => { if (fan.keyboard && !(e.target as HTMLElement).closest('[data-swap-fan]')) close(); };
    const still = (e: TouchEvent) => { if (!fan.keyboard) e.preventDefault(); };
    addEventListener('keydown', key); addEventListener('pointerdown', outside); addEventListener('touchmove', still, { passive: false });
    return () => { removeEventListener('keydown', key); removeEventListener('pointerdown', outside); removeEventListener('touchmove', still); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const press = (key: string): DOMAttributes<HTMLButtonElement> => ({
    onPointerDown: e => {
      if (fan || (e.pointerType === 'mouse' && e.button !== 0)) return;
      swallow.current = false; from.current = { x: e.clientX, y: e.clientY };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not an active pointer (synthetic) */ } // a mouse keeps sending to the node; a finger already does
      choices(key);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { swallow.current = true; from.current = null; open(key, false); }, HOLD_MS);
    },
    onPointerMove: e => {
      if (fan && !fan.keyboard) { setOver(cardAt(e.clientX, e.clientY)); return; }
      if (from.current && Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > SLOP) { clearTimeout(timer.current); from.current = null; } // a scroll, not a hold
    },
    onPointerUp: e => {
      clearTimeout(timer.current); from.current = null;
      if (!fan || fan.keyboard) return;
      const k = cardAt(e.clientX, e.clientY), card = k ? cards?.find(c => c.key === k) : null;
      if (card) swap(card); else close();
    },
    onPointerCancel: () => { clearTimeout(timer.current); from.current = null; if (fan && !fan.keyboard) close(); },
    onContextMenu: e => e.preventDefault(), // Android's long-press menu
  });
  /** false when this click ends a hold (it must not open 14) */
  const tap = () => { const ok = !swallow.current; swallow.current = false; return ok; };

  // the choices' line: room · ~time, and the walk from the held talk's room
  const where = (key: string) => {
    const p = paper(key), s = p ? firstSlot(p.slots as Slot[]) : null;
    const room = s ? schedule?.index.rooms.get(s.roomKey)?.name ?? '' : '';
    // Figma "122 · ~14:32": the room number alone fits the 106 card
    return { title: p?.title ?? key, roomKey: s?.roomKey ?? null,
      line: [room && shortRoom(room).replace(/^Rm /, ''), s && `~${venueClock(s.start, schedule!.meta.timeZone)}`].filter(Boolean).join(' · ') };
  };
  const walk = (fromKey: string, toKey: string) => {
    const a = where(fromKey).roomKey, b = where(toKey).roomKey;
    if (!a || !b || !schedule) return null;
    if (a === b) return 'stay';
    const m = walkMinutes(schedule.venue, schedule.venueMap, a, b) as [number, number] | null;
    return !m ? null : m[1] === 0 ? 'stay' : `${minutesText(m)} walk`; // 0 min: the same venue area
  };
  return { fan, cards, over, undo, heldAngle, press, tap, open, close, swap, restore, where, walk };
}
export type HoldSwap = ReturnType<typeof useHoldSwap>;

/** The fanned choices (fixed over the bottom area while open) and the lines from the held node to them. */
export function SwapFan({ hs, title }: { hs: HoldSwap; title: string }) {
  const { fan, cards, over } = hs;
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([]);
  const angle = hs.heldAngle;
  useLayoutEffect(() => { // Figma "Fan lines": dotted curves from under the held node to the top of each card
    if (!fan || !box.current) { setLines([]); return; }
    const n = nodeEl(fan.key)?.getBoundingClientRect();
    if (!n) return;
    const x0 = n.left + n.width / 2, y0 = n.bottom + 4;
    setLines([...box.current.querySelectorAll('[data-swap-key]')].map(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top - 4;
      return `M${x0} ${y0} Q${x} ${y0} ${x} ${y}`;
    }));
  }, [fan, cards]);
  useEffect(() => { if (fan?.keyboard && cards?.length) box.current?.querySelector<HTMLElement>('[data-swap-key]')?.focus(); }, [fan, cards]);
  if (!fan) return null;
  const n = cards?.length ?? 0;
  const keep = angle ? ` ${n === 3 ? 'All three keep' : n === 2 ? 'Both keep' : 'It keeps'} this ${ONE[angle]}.` : '';
  return <>
    <svg aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 h-full w-full" fill="none" stroke="#fff" strokeOpacity={0.3} strokeDasharray="1.5 3">
      {lines.map(d => <path key={d} d={d} />)}
    </svg>
    <div ref={box} data-swap-fan="" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] bg-gradient-to-b from-arc-bg/0 to-arc-bg to-[16px] px-6 pt-4 pb-[calc(var(--safe-bottom)+17px)]">
      <section aria-label={`Swap ${title}`}>
        {cards == null ? <p className="flex h-[112px] items-center text-[14px] text-arc-text-3">Looking…</p>
          : !n ? <p className="flex h-[112px] items-center text-[14px] text-arc-text-3">Nothing more here.</p>
          : <ul className="grid grid-cols-3 gap-3">
            {cards.map((c, i) => {
              const w = hs.walk(fan.key, c.key);
              return (
                <li key={c.key}>
                  {/* Figma 106 × 112; the 11 px lines are 12 px (the floor) */}
                  <button type="button" data-swap-key={c.key} onClick={() => hs.swap(c)} style={{ animationDelay: `${i * 40}ms` }}
                    className={`arc-fan-in flex h-[112px] w-full flex-col rounded-[18px] border bg-arc-surface p-[11px] text-left ${over === c.key ? 'border-arc-text/90' : 'border-arc-line'}`}>
                    <Pic src={ANGLE_ICON[c.angle]} size={18} />
                    <span className="mt-2 line-clamp-2 text-[13px] leading-4 font-semibold">{hs.where(c.key).title}</span>
                    <span className="mt-auto truncate text-[12px] leading-[15px] font-medium text-arc-text-3">{hs.where(c.key).line}</span>
                    {w && <span className="truncate text-[12px] leading-[15px] font-medium text-arc-text-3">{w}</span>}
                  </button>
                </li>
              );
            })}
          </ul>}
        <p className="mt-[14px] text-[12px] font-medium text-arc-text/60">{fan.keyboard ? 'Pick a talk to swap.' : 'Release on a talk to swap.'}{keep}</p>
        {fan.keyboard && <button type="button" onClick={hs.close} className="sr-only">Close</button>}
      </section>
    </div>
  </>;
}

/** "Swapped · Undo" for 5 s, over the bottom area. The status region stays mounted so the change is announced. */
export function SwapUndo({ hs }: { hs: HoldSwap }) {
  const undoBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (hs.undo?.keyboard) undoBtn.current?.focus(); }, [hs.undo]);
  return (
    <div role="status" className="pointer-events-none absolute inset-x-6 bottom-full mb-3 flex justify-center">
      {hs.undo && (
        <p className="pointer-events-auto flex items-center rounded-full border border-arc-line bg-arc-sheet pl-4 text-[14px] font-medium text-arc-text shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          Swapped ·<button ref={undoBtn} type="button" onClick={hs.restore} className="min-h-touch min-w-touch px-3.5 font-semibold">Undo</button>
        </p>
      )}
    </div>
  );
}
