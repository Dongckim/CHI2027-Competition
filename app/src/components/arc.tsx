// Final UI parts (Figma Components 588:446): the dark screen shell, pill buttons, chips, icon buttons, step marks and the
// bottom sheet. Sizes are Figma's; where Figma is under the accessibility floor (44px touch, 12px text) the hit area or
// size is raised without changing the look (docs/stages/A1-create.md lists each).
import { useEffect, useRef, type CSSProperties, type ReactNode, type ComponentPropsWithRef, type AnchorHTMLAttributes } from 'react';
import chevronLeft from '../assets/arc/icon-chevron-left.svg';
import helpIcon from '../assets/arc/icon-help.svg';
import chipCheck from '../assets/arc/08-chip-check.svg';
import { isAutoDemo, DEMO_TZ } from '../arc/demoClock';
import { useNow } from '../clock.js';
import { venueClock } from '../time.js';

/** A decorative picture: no alt text, hidden from screen readers. */
export const Pic = ({ src, size, className = '', w, h, alt }: { src: string; size?: number; w?: number; h?: number; className?: string; alt?: string }) =>
  <img src={src} alt={alt ?? ''} aria-hidden={alt ? undefined : true} width={w ?? size} height={h ?? size} className={`block shrink-0 ${className}`} draggable={false} />;

/** Outside the conference the app runs on a demo day (arc/demoClock.ts); screens where time matters say so. */
export function DemoBanner() {
  const now = useNow();
  if (!isAutoDemo()) return null;
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: DEMO_TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(now);
  return (
    <p role="note" className="mx-4 mt-1 rounded-xl border border-arc-line bg-arc-surface px-3 py-2 text-center text-[13px] text-arc-text-2">
      Demo time: {day}, {venueClock(now, DEMO_TZ)} at the venue. CHI 2026 is over.
    </p>
  );
}

/** The dark Final UI page: 24px sides, header row, content, and one bottom area 20px above the home indicator.
 *  clock: a screen whose content depends on the time (shows the demo banner when the demo day is on). */
// A Figma-frame art layer (390 × 844 from the frame's top, 54 above the content): no taller than the screen, so on a shorter
// one (Safari 664 with its toolbars, user 11/22) it ends at the bottom edge instead of making a short screen scroll
export const FRAME_ART: CSSProperties = { height: 'min(844px, calc(100dvh + 54px - env(safe-area-inset-top, 0px)))', overflow: 'hidden' };

export function Screen({ header, children, bottom, label, clock }: { header?: ReactNode; children: ReactNode; bottom?: ReactNode; label?: string; clock?: boolean }) {
  return (
    <div className="arc mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top,0px))] max-w-[480px] flex-col overflow-x-clip bg-arc-bg font-sans text-arc-text">{/* nothing scrolls sideways (QA V7); the screen minus body's top safe-area padding, so a short screen never scrolls (user 11/20) */}
      {/* Figma: buttons 44 at y 56 (54 + 2), so a 48 row centred */}
      {header && <header className="flex min-h-[48px] items-center justify-between px-4">{header}</header>}
      {clock && <DemoBanner />}
      <main aria-label={label} className="flex flex-1 flex-col px-6">{children}</main>
      {/* the one fixed bottom area: stays on screen while the content scrolls under it */}
      {/* Figma: the last button ends 14 above the home indicator, 14 between rows, nothing above the first row */}
      {bottom && <div className="sticky bottom-0 z-10 flex flex-col gap-[14px] bg-arc-bg px-6 pb-[calc(var(--safe-bottom)+14px)]">{bottom}</div>}
    </div>
  );
}

type Kind = 'primary' | 'secondary' | 'ghost';
// Full width unless the caller sets a width ("w-[128px]": Edit next to Share).
// A button given a width (w-… or min-w-…) sizes to its words and never breaks them (iPhone: "New / Arc" in a fixed 116 px).
const sized = (cls: string) => /(^|\s)(min-)?w-/.test(cls);
const look = (kind: Kind, cls = '') => `inline-flex ${/(^|\s)h-/.test(cls) ? '' : 'h-[var(--arc-button-h)]'} ${sized(cls) ? 'whitespace-nowrap' : 'w-full'} items-center justify-center gap-2 rounded-full px-5 text-[16px] font-semibold tracking-[-0.006em] ${
  kind === 'primary' ? 'bg-arc-primary text-arc-on-primary shadow-[var(--arc-shadow-primary)]'
  : kind === 'secondary' ? 'border border-arc-line bg-arc-surface text-arc-text'
  : 'text-arc-text/72'} disabled:opacity-40`;
export function ArcButton({ kind = 'primary', className = '', ...rest }: ComponentPropsWithRef<'button'> & { kind?: Kind }) {
  return <button type="button" data-arc-button="" className={`${look(kind, className)} ${className}`} {...rest} />;
}
export function ArcLink({ kind = 'primary', className = '', ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { kind?: Kind }) {
  return <a data-arc-button="" className={`${look(kind, className)} ${className}`} {...rest} />;
}

/** Skip / text link in the header: 15px, with a 44px hit area. */
export const TextAction = ({ className = '', ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
  <a className={`inline-flex min-h-touch min-w-touch items-center justify-center px-2 text-[15px] font-semibold text-arc-text/60 ${className}`} {...rest} />;

/** 44px round button (back, help). */
export function IconButton({ icon, label, onClick, href }: { icon: string; label: string; onClick?: () => void; href?: string }) {
  const cls = 'inline-flex size-11 items-center justify-center rounded-full border border-arc-line bg-arc-surface';
  return href
    ? <a href={href} aria-label={label} className={cls}><Pic src={icon} size={24} /></a>
    : <button type="button" aria-label={label} onClick={onClick} className={cls}><Pic src={icon} size={24} /></button>;
}
export const BackButton = ({ href, onClick }: { href?: string; onClick?: () => void }) =>
  <IconButton icon={chevronLeft} label="Back" href={href} onClick={onClick ?? (href ? undefined : () => history.back())} />;

/** Onboarding dots: Figma draws 8 (02–06 are 1–5, 06b 6, 06c 7, 07 is 8); the active one is a pill. */
export function Dots({ at, total = 8 }: { at: number; total?: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2" role="img" aria-label={`Step ${at} of ${total}`}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={`h-1.5 rounded-full ${i + 1 === at ? 'w-[18px] bg-arc-text' : 'w-1.5 bg-arc-text/[0.28]'}`} />)}
    </div>
  );
}

/** 08–09 step bars (3). */
export function StepBar({ at, total = 3 }: { at: number; total?: number }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={`Step ${at} of ${total}`}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={`h-1 w-7 rounded-sm ${i < at ? 'bg-arc-text' : 'bg-arc-text/20'}`} />)}
    </div>
  );
}

/** A choice chip: 38px look, 44px hit area. Selected = light fill with a check. */
export function Chip({ selected, onClick, children, single }: { selected: boolean; onClick: () => void; children: ReactNode; single?: boolean }) {
  return (
    <button type="button" onClick={onClick} {...(single ? { role: 'radio', 'aria-checked': selected } : { 'aria-pressed': selected })}
      className={`relative inline-flex h-[38px] max-w-full items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium tracking-[-0.006em] whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-[4px] before:content-[''] ${
        selected ? 'bg-arc-chip-on text-arc-on-primary shadow-[var(--arc-shadow-lift)]' : 'border border-arc-line bg-arc-surface text-arc-text/62'}`}>
      {selected && <Pic src={chipCheck} size={16} />}
      <span className="truncate">{children}</span>
    </button>
  );
}

/** Section header: icon + 17px label (+ a ? that opens the angle help sheet, 44px hit area). */
export function SectionHeader({ icon, label, onHelp, id }: { icon: string; label: string; onHelp?: () => void; id?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Pic src={icon} size={20} />
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.012em]">{label}</h2>
      {onHelp && (
        <button type="button" onClick={onHelp} aria-label={`What are ${label}?`} className="-m-[13px] inline-flex size-11 items-center justify-center">
          <Pic src={helpIcon} size={18} />
        </button>
      )}
    </div>
  );
}

/** Bottom sheet over a 55% scrim. Escape, the scrim and the close button dismiss it; focus moves in and comes back. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); before?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className="relative w-full max-w-[480px] rounded-t-[32px] border border-arc-line bg-arc-sheet px-[23px] pt-[9px] pb-[calc(var(--safe-bottom)+20px)] text-arc-text shadow-[0_-8px_40px_rgba(0,0,0,0.4)] outline-none">
        <div className="mx-auto mb-5 h-1 w-9 rounded-sm bg-arc-text/30" aria-hidden="true" />
        <h2 className="mb-6 text-[22px] font-semibold tracking-[-0.02em]">{title}</h2>
        {children}
      </div>
    </div>
  );
}
