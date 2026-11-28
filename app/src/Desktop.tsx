// Desktop (user 11/28 「데스크톱 폰 틀」): on a wide screen with a mouse, ARC in a 390×844 phone frame in the middle, scaled down
// when the window is short, and beside it what ARC is and a QR code to open this same page on a phone.
// The frame is an iframe of this same page (the fallback the user allowed): inside it the app sees a 390×844 phone viewport,
// so its sheets, popups and keyboard code (innerWidth, innerHeight, visualViewport, position: fixed) work unchanged.
// The address follows the frame (hash kept in sync both ways); the QR is drawn here, nothing is fetched.
import { useEffect, useMemo, useRef, useState } from 'react';
import { qrPath } from './screens/arc/Share';

const W = 390, H = 844, GAP = 48, SIDE = 300;
const inFrame = (() => { try { return window.top !== window.self; } catch { return true; } })();
export const isDesktop = () => !inFrame && typeof matchMedia === 'function' && matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches;

/** The address a phone should open: a received Arc's short share link, else this page as it is. */
export const phoneUrl = (href: string) => {
  const u = new URL(href), r = u.hash.match(/^#\/r\/([A-Za-z0-9_.-]+)/);
  return r ? `${u.origin}/s/${r[1]}` : `${u.origin}/${u.search}${u.hash}`;
};

export function Desktop() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [href, setHref] = useState(location.href);
  const [box, setBox] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => { const on = () => setBox({ w: innerWidth, h: innerHeight }); addEventListener('resize', on); return () => removeEventListener('resize', on); }, []);
  const s = Math.min(1, (box.h - GAP) / H, (box.w - GAP) / W), side = box.w >= W * s + SIDE + GAP * 3;
  // the address bar follows the frame; Back or a typed address moves the frame
  useEffect(() => {
    const f = frame.current; if (!f) return;
    let win: Window | null = null;
    const fromFrame = () => { const h = win?.location.hash ?? ''; if (h !== location.hash) history.replaceState(null, '', h || location.pathname + location.search); setHref(location.href); };
    const load = () => { try { win = f.contentWindow; win?.addEventListener('hashchange', fromFrame); fromFrame(); } catch { /* other origin */ } };
    const toFrame = () => { try { if (win && win.location.hash !== location.hash) win.location.hash = location.hash; } catch { /* gone */ } setHref(location.href); };
    f.addEventListener('load', load); addEventListener('hashchange', toFrame);
    return () => { f.removeEventListener('load', load); removeEventListener('hashchange', toFrame); try { win?.removeEventListener('hashchange', fromFrame); } catch { /* gone */ } };
  }, []);
  const url = phoneUrl(href);
  const qr = useMemo(() => qrPath(url), [url]);
  return (
    <main className="fixed inset-0 flex items-center justify-center bg-arc-bg font-sans text-arc-text" style={{ gap: GAP }}>
      <div data-phone-frame="" className="shrink-0" style={{ width: W * s, height: H * s }}>
        <iframe ref={frame} src={location.pathname + location.search + location.hash} title="ARC on a phone" allow="microphone; clipboard-write"
          className="block rounded-[48px] border-0 shadow-[0_0_0_10px_#000,0_0_0_11px_rgba(255,255,255,0.12),0_30px_80px_rgba(0,0,0,0.6)]"
          style={{ width: W, height: H, transform: `scale(${s})`, transformOrigin: '0 0' }} />
      </div>
      {side && (
        <aside className="flex flex-col gap-5" style={{ width: SIDE }}>
          <p className="text-[22px] leading-7 font-semibold tracking-[-0.02em]">ARC finds CHI talks that support, challenge or reframe your question.</p>
          <p className="text-[15px] leading-[22px] text-arc-text-2">It is made for your phone at the conference. This is the same app, framed.</p>
          <div className="flex items-center gap-4">
            <svg role="img" aria-label="QR code: open this page on your phone" viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} width={132} height={132} className="shrink-0 rounded-xl bg-white" shapeRendering="crispEdges">
              <path d={qr.d} fill="#000" />
            </svg>
            <p className="text-[15px] font-semibold">Open on your phone<span className="mt-1 block text-[13px] font-medium text-arc-text-3">Point the camera here.</span></p>
          </div>
        </aside>
      )}
    </main>
  );
}
