// 16 · Share (Figma 598:1098) and 17 · QR (598:1247). The link carries the question, the tribe and the talks (and where
// each quote sits in its abstract); nothing about the person. The cards are pictures (the map at 0.6) for people to see.
import { useEffect, useMemo, useRef, useState } from 'react';
import { encode } from 'uqr';
import { href } from '../../router';
import { encodeLink, angleCounts } from '../../arc/link.js';
import { TRIBE } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { Screen, IconButton, Pic, ArcButton } from '../../components/arc';
import { lockScreenPng, saveLockScreen } from '../../arc/lockscreen';
import lockIcon from '../../assets/arc/icon-lock.svg';
import { ArcView, ANGLE_ICON } from './ArcView';
import { useArc } from './useArc';
import type { Arc } from '../../engine';
import closeIcon from '../../assets/arc/icon-close.svg';
import qrIcon from '../../assets/arc/icon-qr.svg';
import linkIcon from '../../assets/arc/icon-link.svg';
import shareIcon from '../../assets/arc/icon-share.svg';
import arcMark from '../../assets/arc/arc-mark.svg';

export const shareUrl = (arc: Arc) => `${location.origin}/s/${encodeLink(arc)}`;

export function TribeChip({ arc, size = 13 }: { arc: Arc; size?: number }) {
  const t = TRIBE[arc.tribe];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-2xl border py-1.5 pr-3 pl-2.5 font-semibold" style={{ fontSize: size, background: `color-mix(in srgb, ${t.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${t.color} 50%, transparent)` }}>
      <Pic src={TRIBE_ICON[arc.tribe]} size={14} />{t.name}
    </span>
  );
}
const tint = (arc: Arc) => ({ background: `linear-gradient(color-mix(in srgb, ${TRIBE[arc.tribe].color} 8%, transparent), color-mix(in srgb, ${TRIBE[arc.tribe].color} 8%, transparent)), var(--arc-surface)` });

const CARDS = ['Arc picture', 'Link preview'];

export function Share({ id }: { id: string }) {
  const { arc, states, info } = useArc(id);
  const [note, setNote] = useState('');
  const [page, setPage] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  // 16 cards (user 11/20 「옆으로 안 넘어가」): dots, arrow keys, ‹ › on mouse screens, and a drag or swipe anywhere on a
  // card (the picture card is inert, so its own content takes no events; the strip pages instead of scrolling freely)
  const toCard = (i: number) => {
    const s = strip.current; if (!s) return;
    const n = Math.max(0, Math.min(CARDS.length - 1, i));
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.scrollTo({ left: n * 312, behavior: still ? 'auto' : 'smooth' });
    setPage(n);
  };
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) toCard(page + (dx < 0 ? 1 : -1));
  };
  if (!arc) return null;
  const url = shareUrl(arc);
  const c = angleCounts(arc.nodes.map(n => [n.key, n.angle]));
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setNote('Link copied.'); setTimeout(() => setNote(n => (n === 'Link copied.' ? '' : n)), 3000); } catch { setNote(url); } // no clipboard: show it to copy by hand
  };
  const more = async () => {
    if (navigator.share) { try { await navigator.share({ title: arc.query, text: 'An Arc for CHI', url }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; } } // closed by the person: nothing; refused: copy instead
    copy();
  };
  const round = (icon: string, label: string, onClick: () => void, link?: string) => (
    <div className="flex w-[60px] flex-col items-center gap-2.5">
      {link ? <a href={link} aria-label={label} className="flex size-[60px] items-center justify-center rounded-full border border-arc-line bg-arc-surface"><Pic src={icon} size={24} /></a>
        : <button type="button" onClick={onClick} aria-label={label} className="flex size-[60px] items-center justify-center rounded-full border border-arc-line bg-arc-surface"><Pic src={icon} size={24} /></button>}
      <span aria-hidden="true" className="text-[13px] font-medium whitespace-nowrap text-arc-text/75">{label}</span>
    </div>
  );
  return (
    <Screen label="Share your Arc" header={<><IconButton icon={closeIcon} label="Close" href={href(`arc/${id}`)} /><span /></>}
      bottom={<p className="-mb-[5px] text-center text-[12px] leading-[17px] font-medium text-arc-text-3">
        {/* Figma 11px at 50%; 12px and 55% are the floor. Second line: user request (A0 B-answers). The fixed bottom keeps it on
            screen; the last line ends 9 above the home indicator, where Figma's one line does */}
        Your question and talks only. Never your name.<br />Your question is part of the link.
      </p>}>
      <h1 className="sr-only">Share your Arc: {arc.query}</h1>
      <div className="relative">
      {/* ‹ › beside the cards where there is a mouse (wide screens); touch screens swipe */}
      <button type="button" aria-label="Previous card" onClick={() => toCard(page - 1)} disabled={page === 0}
        className="absolute top-[193px] -left-5 z-10 hidden size-11 items-center justify-center rounded-full border border-arc-line bg-arc-surface text-[22px] disabled:opacity-30 [@media(hover:hover)_and_(pointer:fine)]:flex">‹</button>
      <button type="button" aria-label="Next card" onClick={() => toCard(page + 1)} disabled={page === CARDS.length - 1}
        className="absolute top-[193px] -right-5 z-10 hidden size-11 items-center justify-center rounded-full border border-arc-line bg-arc-surface text-[22px] disabled:opacity-30 [@media(hover:hover)_and_(pointer:fine)]:flex">›</button>
      <div ref={strip} onScroll={e => setPage(Math.round(e.currentTarget.scrollLeft / 312))}
        onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); toCard(page + (e.key === 'ArrowRight' ? 1 : -1)); } }}
        onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; }}
        role="region" tabIndex={0} aria-roledescription="carousel" className="-mx-6 mt-4 flex cursor-grab touch-pan-y snap-x snap-mandatory gap-3 overflow-x-auto px-[calc(50%-126px)] pb-1 select-none [scrollbar-width:none]" aria-label="What people see">
        <figure className="relative h-[430px] w-[300px] shrink-0 snap-center overflow-hidden rounded-[28px] border border-arc-line" style={tint(arc)}>
          <figcaption className="sr-only">Your Arc as a picture: {c.S} Supports, {c.R} Reframes, {c.T} Challenges.</figcaption>
          <div className="absolute top-[17px] left-[17px]"><TribeChip arc={arc} /></div>
          <div className="absolute top-[55px] left-[32px]"><ArcView arc={arc} states={states} info={info} scale={0.6} picture /></div>
          <div aria-hidden="true" className="absolute bottom-[18px] left-[17px] flex items-center gap-1.5 text-[12px] font-medium text-arc-text/80">
            <Pic src={ANGLE_ICON.S} size={14} />{c.S}<Pic src={ANGLE_ICON.R} size={14} />{c.R}<Pic src={ANGLE_ICON.T} size={14} />{c.T}
          </div>
          {/* TODO(designer): is this gradient mark the ARC logo? At 34×20 it reads like a loading spinner (user, 16 feedback) */}
          <Pic src={arcMark} w={34} h={20} alt="ARC" className="absolute right-[17px] bottom-[17px]" />
        </figure>
        {/* Figma draws only a peek of this card: the messenger preview, as the share page's tags make it (image in A4) */}
        <figure className="relative flex h-[430px] w-[300px] shrink-0 snap-center flex-col overflow-hidden rounded-[28px] border border-arc-line" style={tint(arc)}>
          <figcaption className="sr-only">How the link looks in a message.</figcaption>
          <div aria-hidden="true" className="flex h-[170px] items-center justify-center" style={{ background: `color-mix(in srgb, ${TRIBE[arc.tribe].color} 18%, transparent)` }}>
            <img src={TRIBE_ICON[arc.tribe]} alt="" width={127} height={127} className="opacity-80" />{/* prototype 16: the peek is the big tribe shape */}
          </div>
          <div className="flex flex-col gap-2 p-5">
            <p className="text-[12px] font-medium text-arc-text-3">arc2027.com</p>{/* as the messenger shows it (16b, functions/share.mjs) */}
            <p className="line-clamp-3 text-[18px] leading-6 font-semibold">{arc.query}</p>
            <p className="text-[14px] text-arc-text-2">ARC · ↑ {c.S} support · ↻ {c.R} reframe · ⊣ {c.T} challenge</p>{/* the og:description's words (16b) */}
          </div>
        </figure>
      </div>
      </div>
      {/* the dots are the card buttons: each 44 × 44, 2 apart, the dot at the inner edge so the dots stay 6 apart */}
      <div className="relative z-10 mt-[-3px] -mb-[19px] flex justify-center gap-0.5">{/* above the strip, whose bottom it overlaps by 3 */}
        {CARDS.map((name, i) => (
          <button key={name} type="button" onClick={() => toCard(i)} aria-label={`Card ${i + 1} of ${CARDS.length}: ${name}`} aria-current={i === page ? 'true' : undefined}
            className={`flex size-11 items-center ${i === 0 ? 'justify-end pr-[2px]' : 'justify-start pl-[2px]'}`}>
            <span aria-hidden="true" className={`h-1.5 rounded-full ${i === page ? 'w-[18px] bg-arc-text' : 'w-1.5 bg-arc-text/30'}`} />
          </button>
        ))}
      </div>
      {/* Figma's "Follow along / Read only" is out of scope (user): the row keeps the 30 Figma has above it */}
      <div className="mt-[30px] flex justify-center gap-12">
        {round(qrIcon, 'QR code', () => {}, href(`qr/${id}`))}
        {round(linkIcon, 'Copy link', copy)}
        {round(shareIcon, 'More', more)}
      </div>
      <p role="status" className="sr-only">{note}</p>
      {note && <p aria-hidden="true" className="fixed inset-x-0 top-[max(16px,env(safe-area-inset-top))] z-50 mx-auto w-fit max-w-[90%] [font-feature-settings:'calt'_0] rounded-full bg-arc-primary px-4 py-2 text-[14px] font-semibold break-all text-arc-on-primary">{note}</p>}
    </Screen>
  );
}

/** The QR modules for a URL, as an SVG path. Level Q (25% may be lost): the 36px tribe shape covers about 3% of the code,
 *  and H made a long link too dense to scan easily at 200px. */
export function qrPath(url: string) {
  const q = encode(url, { ecc: 'Q', border: 0 });
  let d = '';
  q.data.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z`; }));
  return { d, size: q.size };
}

export function Qr({ id }: { id: string }) {
  const { arc } = useArc(id);
  const qr = useMemo(() => (arc ? qrPath(shareUrl(arc)) : null), [arc]);
  const [saved, setSaved] = useState(false);
  useEffect(() => { document.title = 'QR · ARC'; }, []);
  if (!arc || !qr) return null;
  const lockScreen = async () => { await saveLockScreen(await lockScreenPng(arc, qr), `arc-${arc.tribe}.png`); setSaved(true); };
  return (
    // Figma 17 also has "Print badge": out of scope for now (planned for the finals), so Lock screen is full width
    <Screen label="QR code" header={<><span /><IconButton icon={closeIcon} label="Close" href={href(`share/${id}`)} /></>}
      bottom={<div className="flex flex-col gap-[14px] pb-1.5">{/* Figma 17: the button ends 20 above the home indicator */}
        <p className="text-center text-[14px] font-medium text-arc-text-2" aria-live="polite">{saved ? 'Image ready to save' : ''}</p>
        <ArcButton kind="secondary" onClick={lockScreen}><Pic src={lockIcon} size={20} />Lock screen</ArcButton>
      </div>}>
      <div className="mt-[14px] flex justify-center"><TribeChip arc={arc} /></div>
      <h1 className="mx-auto mt-[14px] w-[320px] max-w-full text-center text-[26px] leading-8 font-semibold tracking-[-0.02em]">{arc.query}</h1>
      <div data-anim="qr 200" className="relative mx-auto mt-[38px] flex size-[248px] items-center justify-center rounded-[28px] bg-white">{/* prototype 17: the card, code and shape pop together */}
        <svg role="img" aria-label={`QR code for the link to this Arc: ${arc.query}`} width={200} height={200} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges">
          <path d={qr.d} fill="#15121F" />
        </svg>
        <img src={TRIBE_ICON[arc.tribe]} alt="" width={36} height={36} className="absolute" />
      </div>
      <p className="mt-[30px] text-center text-[16px] font-medium tracking-[-0.006em] text-arc-text/80">Scan to get this Arc</p>
    </Screen>
  );
}
