// 01 Welcome → 02–05 CHI 101 (first CHI) → 06 How ARC works → 06b Your colour → 06c Before, during, after → 07.
// "I've been before" goes 01 → 06. Skip → home.
// Copy and pictures are Figma Final UI (590:453 … 591:586, 741:1448, 741:1512). Pictures are decorative; every meaning is in text.
import { lazy, Suspense, useEffect } from 'react';
import { go, href } from '../../router';
import { update } from '../../state/useDevice';
import { setOnboarded, setFirstChi } from '../../arc/draft.js';
import { warm, useTribe } from '../../arc/live';
import { TRIBES } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import type { TribeId } from '../../engine/types';
import { Screen, ArcButton, ArcLink, TextAction, Dots, Pic, FRAME_ART } from '../../components/arc';
import { WelcomeOrbit } from './WelcomeOrbit';
import gAi from '../../assets/arc/glow-tribe-ai.svg';
import gXr from '../../assets/arc/glow-tribe-xr.svg';
import gAccess from '../../assets/arc/glow-tribe-access.svg';
import gHealth from '../../assets/arc/glow-tribe-health.svg';
import gLearning from '../../assets/arc/glow-tribe-learning.svg';
import gSociety from '../../assets/arc/glow-tribe-society.svg';
import gDevices from '../../assets/arc/glow-tribe-devices.svg';
import gDesign from '../../assets/arc/glow-tribe-design.svg';

// shortcut: ACM's policy page (Figma has no URL); switch to the CHI 2027 Code of Conduct page once it is published.
export const CODE_OF_CONDUCT = 'https://www.acm.org/about-acm/policy-against-harassment';

const skip = () => { update(setOnboarded); go('home'); };
// Figma: Skip's text centre is at y 73, 5 above the header row's centre; the 44px hit area stays in the row (56–100)
export const SKIP_CLASS = 'pb-[10px] tracking-[-0.006em]';
// Figma: dots at y 72, 3 above the header row's centre
export const StepDots = ({ at }: { at: number }) => <div className="relative -top-[3px]"><Dots at={at} /></div>;
export const Skip = () => <TextAction href={href('home')} className={SKIP_CLASS} onClick={e => { e.preventDefault(); skip(); }}>Skip</TextAction>;
// Figma: titles at y 112, 10 below the 48px header row (54–102)
// prototype (3) 11/26: each page asks its question, a line under it answers (02–06c)
export const Title = ({ lines }: { lines: [string, string] }) => <>
  <h1 className="mt-[10px] text-[30px] leading-9 font-semibold tracking-[-0.024em]">{lines[0]}</h1>
  <p className="mt-2 text-[15px] leading-5 text-arc-text-2">{lines[1]}</p>
</>;
// Figma draws the pictures on the 390-wide frame; this box keeps their coordinates (y is from the frame top).
// top is where the box starts on the frame: 102 under the header, 184 under a two-line title.
export const Frame = ({ top, height, children, className = '' }: { top: number; height: number; children: React.ReactNode; className?: string }) => (
  // 390 wide and centred on any screen (overflow is clipped by Screen); pictures take no presses, so Skip and links stay pressable
  <div aria-hidden="true" className={`pointer-events-none relative w-[390px] shrink-0 self-center ${className}`} style={{ height }}>
    <div className="absolute left-0 w-[390px]" style={{ top: -top, ...FRAME_ART }}>{children}</div>
  </div>
);
export const at = (x: number, y: number, w: number, h = w) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: h });

// x, y of the 22px slot and the glow's inset around it (Figma 590:475…: each glow SVG has its own bleed)
const WELCOME_SHAPES: [string, number, number, string][] = [
  [gAi, 184, 129, '-49.05% -53.22% -44.89%'], [gXr, 290.07, 172.93, '-53.22%'], [gAccess, 334, 279, '-51.14%'],
  [gHealth, 290.07, 385.07, '-51.14%'], [gLearning, 184, 429, '-49.05%'], [gSociety, 77.93, 385.07, '-54.47% -53.84% -48.64%'],
  [gDevices, 34, 279, '-54.47% -49.05%'], [gDesign, 77.93, 172.93, '-51.97% -51.97% -48.22%'],
];
// the same order as WELCOME_SHAPES: ai, xr, access, health, learning, society, devices, design
const TRIBE_COLOR = ['ai', 'xr', 'access', 'health', 'learning', 'society', 'devices', 'design'].map(id => TRIBES.find((t: { id: string }) => t.id === id)!.color as string);
// Figma's bottom rows end 20 above the home indicator, 6 more than Screen's 14
export const LAST = 'mb-1.5';

function Welcome() {
  return (
    <Screen header={<><span /><Skip /></>} label="Welcome"
      bottom={<>
        {/* Figma: buttons 640 and 706 (12 apart), footnote 16 under them */}
        <ArcButton className="-mb-0.5" onClick={() => { update(s => setFirstChi(s, true)); go('start/2'); }}>It's my first CHI</ArcButton>
        <ArcButton kind="secondary" onClick={() => { update(s => setFirstChi(s, false)); go('start/6'); }}>I've been before</ArcButton>
        {/* Figma 11px at x 33; 12px is the floor (same line centre) */}
        <p className={`mt-[1.5px] pl-[9px] text-[12px] font-medium whitespace-pre text-arc-text-3`}>{'Unofficial  ·  No account  ·  Stays on your phone'}</p>
        {/* user 11/27 「Soniox 언급하지 말고 어디에도 저장되지 않는다는걸 확인만」 */}
        <p className={`${LAST} -mt-3 pl-[9px] text-[12px] font-medium text-arc-text-3`}>Live interpreting is never saved, anywhere</p>
      </>}>
      <Frame top={102} height={368} className="arc-welcome-art">
        {/* Figma 844:1847 (11/23): a filled orb; the ring draws itself and the neighbourhoods land and drift (prototype) */}
        <WelcomeOrbit shapes={WELCOME_SHAPES.map(([src, x, y, inset], i) => ({ src, x, y, inset, color: TRIBE_COLOR[i] }))} />
      </Frame>
      <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.024em]">Bring one question<br />Leave CHI<br />with an answer</h1>
      <p className="sr-only">{TRIBES.length} neighbourhoods of CHI research, each a colour and a shape.</p>
    </Screen>
  );
}

export const START_PAGES = ['1', '2', '3', '4', '5', '6', '6b', '6c'];
const Rest = lazy(() => import('./StartPages').then(m => ({ default: ({ page }: { page: string }) => { const P = m.PAGES_REST[page]; return <P />; } })));

export function Start({ page }: { page: string }) {
  useTribe(null);
  useEffect(() => { warm().catch(() => {}); import('./StartPages').catch(() => {}); }, []); // models, data and 02–06c download while 01 is read
  return page === '1' || !START_PAGES.includes(page) ? <Welcome /> : <Suspense fallback={null}><Rest page={page} /></Suspense>;
}
