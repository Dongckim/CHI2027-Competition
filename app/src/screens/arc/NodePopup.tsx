// 12c / 24b (prototype 3, 11/26): a tap on a stop opens its title over the map: the state, time and place, the whole title,
// "View details" (14) and, for a talk the engine offers on 24b that is not on the Arc, "Add to my Arc". The rest dims;
// a tap anywhere else, × or Escape closes it. The stop itself stays pressable: a second tap opens 14 (ArcMap).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { href } from '../../router';
import { Pic } from '../../components/arc';
import chevron from '../../assets/arc/icon-chevron-right.svg';

export function NodePopup({ k, line, title, by, outside, onAdd, onClose }: {
  k: string; line: string; title: string; by?: string | null; outside: boolean; onAdd: () => void; onClose: () => void;
}) {
  const [box, setBox] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    const at = () => setBox((document.querySelector(`[data-arc-map] [data-node-key="${CSS.escape(k)}"] .arc-node`) ?? document.querySelector(`[data-arc-map] [data-node-key="${CSS.escape(k)}"]`))?.getBoundingClientRect() ?? null);
    at(); addEventListener('resize', at);
    return () => removeEventListener('resize', at);
  }, [k]);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, [k]);
  useEffect(() => {
    const out = (e: PointerEvent) => { const t = e.target as Element; if (!card.current?.contains(t) && !t.closest?.('[data-node-key]')) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('pointerdown', out); addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc); };
  }, [onClose]);
  if (!box) return null;
  const w = Math.min(330, innerWidth - 32), cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  const left = Math.max(16, Math.min(innerWidth - 16 - w, cx - w / 2));
  const below = cy < innerHeight * 0.42; // a stop high on the screen: the title under it, else over it (prototype 12c-1 / 12c-3)
  const r = Math.max(box.width, box.height) / 2 + 4;
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed z-[45] rounded-full motion-safe:transition-all motion-safe:duration-200"
        style={{ left: cx - r, top: cy - r, width: r * 2, height: r * 2, boxShadow: '0 0 0 9999px rgba(10, 9, 16, 0.62), 0 0 0 2px rgba(255, 255, 255, 0.85)' }} />
      <div ref={card} role="dialog" aria-label={title} className="fixed z-[46] rounded-[18px] border border-arc-line bg-arc-sheet py-3.5 pr-3 pl-4 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
        style={{ left, width: w, ...(below ? { top: cy + r + 10 } : { bottom: innerHeight - (cy - r) + 10 }) }}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-arc-text-3">{line}</p>
            <p className="mt-1 text-[16px] leading-[21px] font-semibold tracking-[-0.012em]">{title}</p>
            {/* user 11/27 「간이 디테일 페이지에 1저자랑 소속까진」 */}
            {by && <p className="mt-1 text-[13px] leading-[18px] font-medium text-arc-text-2">by {by}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mt-1.5 -mr-1 flex size-11 shrink-0 items-center justify-center">
            <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-white/10 text-[15px] leading-none text-arc-text-2">×</span>
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          {outside && <button ref={el => { if (outside) first.current = el; }} type="button" onClick={onAdd} className="min-h-touch rounded-full bg-arc-primary px-4 text-[14px] font-semibold text-arc-on-primary">Add to my Arc</button>}
          <a ref={el => { if (!outside) first.current = el; }} href={href(`talk/${k}`)} className="inline-flex min-h-touch items-center gap-1 text-[14px] font-semibold text-[#9db2ff]">View details<Pic src={chevron} size={14} /></a>
        </div>
      </div>
    </>
  );
}
