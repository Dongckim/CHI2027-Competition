// 01 Welcome → 02–05 CHI 101 (first CHI) → 06 How ARC works → 06b Your colour → 06c Before, during, after → 07.
// "I've been before" goes 01 → 06. Skip → home.
// Copy and pictures are Figma Final UI (590:453 … 591:586, 741:1448, 741:1512). Pictures are decorative; every meaning is in text.
import { useEffect } from 'react';
import { go, href } from '../../router';
import { update } from '../../state/useDevice';
import { setOnboarded, setFirstChi } from '../../arc/draft.js';
import { warm, useTribe } from '../../arc/live';
import { TRIBES } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import type { TribeId } from '../../engine/types';
import { Screen, ArcButton, ArcLink, TextAction, Dots, Pic, FRAME_ART } from '../../components/arc';
import holoRing from '../../assets/arc/welcome-holo-ring.svg';
import innerRing from '../../assets/arc/welcome-inner-ring.svg';
import gAi from '../../assets/arc/glow-tribe-ai.svg';
import gXr from '../../assets/arc/glow-tribe-xr.svg';
import gAccess from '../../assets/arc/glow-tribe-access.svg';
import gHealth from '../../assets/arc/glow-tribe-health.svg';
import gLearning from '../../assets/arc/glow-tribe-learning.svg';
import gSociety from '../../assets/arc/glow-tribe-society.svg';
import gDevices from '../../assets/arc/glow-tribe-devices.svg';
import gDesign from '../../assets/arc/glow-tribe-design.svg';
import pathLine from '../../assets/arc/03-path-line.svg';
import timeAxis from '../../assets/arc/03-time-axis.svg';
import talk from '../../assets/arc/icon-talk.svg';
import poster from '../../assets/arc/icon-poster.svg';
import demo from '../../assets/arc/icon-demo.svg';
import panel from '../../assets/arc/icon-panel.svg';
import meetup from '../../assets/arc/icon-meetup.svg';
import keynote from '../../assets/arc/icon-keynote.svg';
import arc05 from '../../assets/arc/05-arc.svg';
import bubbleQ from '../../assets/arc/05-bubble-question.svg';
import bubbleE from '../../assets/arc/05-bubble-exclaim.svg';
import pin from '../../assets/arc/icon-pin.svg';
import clock from '../../assets/arc/icon-clock.svg';
import chat from '../../assets/arc/icon-chat.svg';
import external from '../../assets/arc/icon-external.svg';
import lines06 from '../../assets/arc/06-lines.svg';
import holo06 from '../../assets/arc/06-holo-ring.svg';
import orb06 from '../../assets/arc/06-question-orb.svg';
import orbS from '../../assets/arc/06-orb-supports.svg';
import orbR from '../../assets/arc/06-orb-reframes.svg';
import orbT from '../../assets/arc/06-orb-challenges.svg';
import person from '../../assets/arc/icon-person.svg';
import qr from '../../assets/arc/icon-qr.svg';
import sparkle from '../../assets/arc/icon-sparkle.svg';
import mapIcon from '../../assets/arc/icon-map.svg';
import book from '../../assets/arc/icon-book.svg';

// shortcut: ACM's policy page (Figma has no URL); switch to the CHI 2027 Code of Conduct page once it is published.
export const CODE_OF_CONDUCT = 'https://www.acm.org/about-acm/policy-against-harassment';

const skip = () => { update(setOnboarded); go('home'); };
// Figma: Skip's text centre is at y 73, 5 above the header row's centre; the 44px hit area stays in the row (56–100)
export const SKIP_CLASS = 'pb-[10px] tracking-[-0.006em]';
// Figma: dots at y 72, 3 above the header row's centre
export const StepDots = ({ at }: { at: number }) => <div className="relative -top-[3px]"><Dots at={at} /></div>;
const Skip = () => <TextAction href={href('home')} className={SKIP_CLASS} onClick={e => { e.preventDefault(); skip(); }}>Skip</TextAction>;
// Figma: titles at y 112, 10 below the 48px header row (54–102)
const Title = ({ lines }: { lines: [string, string] }) =>
  <h1 className="mt-[10px] text-[30px] leading-9 font-semibold tracking-[-0.024em]">{lines[0]}<br />{lines[1]}</h1>;
// Figma draws the pictures on the 390-wide frame; this box keeps their coordinates (y is from the frame top).
// top is where the box starts on the frame: 102 under the header, 184 under a two-line title.
const Frame = ({ top, height, children }: { top: number; height: number; children: React.ReactNode }) => (
  // 390 wide and centred on any screen (overflow is clipped by Screen); pictures take no presses, so Skip and links stay pressable
  <div aria-hidden="true" className="pointer-events-none relative w-[390px] shrink-0 self-center" style={{ height }}>
    <div className="absolute left-0 w-[390px]" style={{ top: -top, ...FRAME_ART }}>{children}</div>
  </div>
);
const at = (x: number, y: number, w: number, h = w) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: h });

// x, y of the 22px slot and the glow's inset around it (Figma 590:475…: each glow SVG has its own bleed)
const WELCOME_SHAPES: [string, number, number, string][] = [
  [gAi, 184, 129, '-49.05% -53.22% -44.89%'], [gXr, 290.07, 172.93, '-53.22%'], [gAccess, 334, 279, '-51.14%'],
  [gHealth, 290.07, 385.07, '-51.14%'], [gLearning, 184, 429, '-49.05%'], [gSociety, 77.93, 385.07, '-54.47% -53.84% -48.64%'],
  [gDevices, 34, 279, '-54.47% -49.05%'], [gDesign, 77.93, 172.93, '-51.97% -51.97% -48.22%'],
];
// Figma's bottom rows end 20 above the home indicator, 6 more than Screen's 14
const LAST = 'mb-1.5';

function Welcome() {
  return (
    <Screen header={<><span /><Skip /></>} label="Welcome"
      bottom={<>
        {/* Figma: buttons 640 and 706 (12 apart), footnote 16 under them */}
        <ArcButton className="-mb-0.5" onClick={() => { update(s => setFirstChi(s, true)); go('start/2'); }}>It's my first CHI</ArcButton>
        <ArcButton kind="secondary" onClick={() => { update(s => setFirstChi(s, false)); go('start/6'); }}>I've been before</ArcButton>
        {/* Figma 11px at x 33; 12px is the floor (same line centre) */}
        <p className={`${LAST} mt-[1.5px] pl-[9px] text-[12px] font-medium whitespace-pre text-arc-text-3`}>{'Unofficial  ·  No account  ·  Stays on your phone'}</p>
      </>}>
      <Frame top={102} height={368}>
        <img src={holoRing} alt="" style={at(45, 140, 300)} />
        <img src={innerRing} alt="" style={at(90, 185, 210)} />
        {WELCOME_SHAPES.map(([src, x, y, inset], i) => (
          <span key={i} style={at(x, y, 22)}><span className="absolute" style={{ inset }}><img src={src} alt="" className="block size-full" /></span></span>
        ))}
        <p className="absolute w-[390px] text-center text-[14px] font-medium tracking-[0.14em]" style={{ top: 281.5 }}>ARC</p>{/* Figma 590:496: no arc stroke */}
      </Frame>
      <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.024em]">Bring one question.<br />Leave CHI with an answer.</h1>
      <p className="sr-only">{TRIBES.length} neighbourhoods of CHI research, each a colour and a shape.</p>
    </Screen>
  );
}

const Next = ({ to }: { to: string }) => <ArcLink href={href(to)} className={LAST}>Next</ArcLink>;
const Page = ({ dot, title, next, children, label }: { dot: number; title: [string, string]; next: string; children: React.ReactNode; label: string }) => (
  <Screen label={label} header={<><StepDots at={dot} /><Skip /></>} bottom={<Next to={next} />}>
    <Title lines={title} />
    {children}
  </Screen>
);

function WhatIsChi() {
  // Figma places each label on its own x (gaps after the numbers differ), 38 below the number's top
  const stats: [string, string, number][] = [['4,000', 'people', 223], ['10+', 'rooms at once', 161], ['5', 'days', 79]];
  return (
    <Page dot={1} label="What is CHI" title={['The biggest week', 'in HCI research.']} next="start/3">
      <dl className="mt-[116px] flex flex-col gap-10">{/* rows at y 300 / 412 / 524 */}
        {stats.map(([n, l, x]) => (
          <div key={l} className="relative">
            <dt className="sr-only">{l}</dt>
            <dd className="text-[68px] leading-[72px] font-semibold tracking-[-0.035em]">{n}</dd>
            <dd aria-hidden="true" className="absolute top-[38px] text-[17px] font-medium tracking-[-0.012em] whitespace-nowrap text-arc-text-2" style={{ left: x - 24 }}>{l}</dd>
          </div>
        ))}
      </dl>
    </Page>
  );
}

// 03: four columns of talks at the same time, one picked per row band (Figma picks: col1 row3, col2 row1, col3 row4, col4 row2).
const PICKS = new Set(['0-2', '1-0', '2-3', '3-1']);
function ADay() {
  return (
    <Page dot={2} label="A day at CHI" title={['10+ talks run at once.', 'Pick one per time slot.']} next="start/4">
      <p className="sr-only">Many talks run at the same time; you choose one in each slot.</p>
      <Frame top={184} height={415}>
        {Array.from({ length: 4 }, (_, c) => Array.from({ length: 6 }, (_, r) => (
          <span key={`${c}-${r}`} style={{ ...at(24 + c * 84, 330 + r * 42, 66, 34), opacity: r === 4 ? 0.55 : r === 5 ? 0.22 : undefined }}
            className={`rounded-[8px] ${PICKS.has(`${c}-${r}`) ? 'bg-white shadow-[var(--arc-shadow-lift)]' : 'border border-arc-line bg-arc-surface'}`} />
        )))}
        <img src={pathLine} alt="" style={at(0, 0, 390, 844)} />
        <img src={timeAxis} alt="" style={at(24, 587, 282, 10)} />
        <span className="absolute text-[12px] font-medium text-arc-text-3" style={{ left: 308, top: 584 }}>Time</span>{/* Figma 50%; 55% is the floor */}
      </Frame>
    </Page>
  );
}

// Figma's card fill (Formats, 06b, 06c): fades down from 6% white
const FADE = { background: 'linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.03) 55%, rgba(255,255,255,0))' };

function Formats() {
  const cells: [string, string, string][] = [[talk, 'Listen', 'Paper talk'], [poster, 'Chat', 'Poster'], [demo, 'Try', 'Demo'],
    [panel, 'Debate', 'Panel'], [meetup, 'Join', 'SIG & meetup'], [keynote, 'Zoom out', 'Keynote']];
  return (
    <Page dot={3} label="Formats" title={['Know what to do', 'where.']} next="start/5">
      <ul className="mt-[64px] grid grid-cols-2 gap-3">{/* Figma 590:650…: 165×132 tiles, radius 20, fade from 6% white */}
        {cells.map(([icon, verb, name]) => (
          <li key={name} className="flex h-[132px] flex-col items-center justify-center rounded-[20px] px-2 text-center" style={FADE}>
            <Pic src={icon} size={26} />
            <p className="mt-3 text-[20px] font-semibold tracking-[-0.012em]">{verb}</p>
            <p className="mt-1 text-[13px] font-medium text-arc-text-3">{name}</p>
          </li>
        ))}
      </ul>
    </Page>
  );
}

function HowPeopleTalk() {
  const rules: [string, string][] = [[pin, 'Switch rooms anytime'], [clock, 'Keep questions short'], [chat, 'Say hi at posters']];
  return (
    <Page dot={4} label="How people talk" title={['Breaks are', 'for talking.']} next="start/6">
      <Frame top={184} height={286}>{/* rules start at y 470 */}
        <img src={arc05} alt="" style={at(0, 0, 390, 844)} />
        <img src={bubbleQ} alt="" style={at(68, 328, 84)} />
        <img src={bubbleE} alt="" style={at(238, 328, 84)} />
        <span className="absolute text-[36px] font-semibold tracking-[-0.024em]" style={{ left: 101, top: 346.5 }}>?</span>
        <span className="absolute text-[36px] font-semibold tracking-[-0.024em]" style={{ left: 274, top: 346.5 }}>!</span>
      </Frame>
      <ul className="flex flex-col gap-2.5">
        {rules.map(([icon, text]) => (
          <li key={text} className="flex h-[52px] items-center gap-3 rounded-full border border-arc-line bg-arc-surface pl-[18px] text-[15px] font-medium tracking-[-0.006em]">
            <Pic src={icon} size={20} />{text}
          </li>
        ))}
      </ul>
      <a href={CODE_OF_CONDUCT} target="_blank" rel="noopener noreferrer"
        className="mt-[10.5px] ml-[99.5px] inline-flex min-h-touch items-center gap-1.5 self-start px-2 text-[14px] font-semibold tracking-[-0.006em] text-arc-text/60">
        {/* Figma: text at x 131.5, y 670 (not centred) */}
        Code of Conduct<Pic src={external} size={14} />
      </a>
    </Page>
  );
}

function HowArcWorks() {
  const node = (orb: string, name: string, sub: string, x: number, y: number) => (
    <div style={{ position: 'absolute', left: x, top: y, width: 104 }} className="flex flex-col items-center gap-0.5">
      <img src={orb} alt="" width={64} height={64} />
      <p className="text-[12px] leading-[15px] font-semibold text-arc-text/85">{name}</p>
      <p className="-mt-px text-[12px] font-medium text-arc-text-3">{sub}</p>{/* Figma 10px; 12px is the floor, 1 up keeps its centre */}
    </div>
  );
  return (
    <Page dot={5} label="How ARC works" title={['Your question,', 'seen from three sides.']} next="start/6b">
      {/* not Frame: the node names are read out, only the pictures are hidden */}
      <div className="pointer-events-none relative h-[462px] w-[390px] shrink-0 self-center">
        <div className="absolute left-0 w-[390px]" style={{ top: -184, ...FRAME_ART }}>
          <img src={lines06} alt="" aria-hidden="true" style={at(0, 0, 390, 844)} />
          <img src={holo06} alt="" aria-hidden="true" style={at(123, 348, 144)} />
          <img src={orb06} alt="" aria-hidden="true" style={at(133, 358, 124)} />
          <p className="absolute w-[390px] text-center text-[15px] leading-[19px] font-semibold" style={{ top: 401 }} aria-hidden="true">Your<br />question</p>
          {node(orbS, 'Supports', 'same finding', 12, 388)}
          {node(orbT, 'Challenges', 'different finding', 274, 388)}
          {node(orbR, 'Reframes', 'new lens', 143, 528)}
        </div>
      </div>
    </Page>
  );
}

// 06b chips: Figma's short names (tribes.js has the long ones), in Figma's order; the shapes are the tribe icons at 16, 62%
const CHIPS: [TribeId, string][] = [['ai', 'AI & agents'], ['xr', 'XR & immersive'], ['access', 'Accessibility'], ['health', 'Health & care'],
  ['learning', 'Learning'], ['society', 'Society'], ['devices', 'Devices'], ['design', 'Design']];
function YourColour() {
  const ways: [string, string, string][] = [[person, 'From afar', 'Spot the colour and shape on their screen.'], [qr, 'Up close', 'Scan their QR to get their Arc.']];
  return (
    <Page dot={6} label="Your colour" title={['Same colour,', 'same neighbourhood.']} next="start/6c">
      <ul className="mt-12 grid grid-cols-2 gap-3">{/* Figma 741:1703…: rows at y 232 / 282 / 332 / 382, columns at x 24 / 201 */}
        {CHIPS.map(([id, name]) => (
          <li key={id} className="flex h-[38px] items-center gap-1.5 justify-self-start rounded-full border border-arc-line bg-arc-surface px-3.5 text-[14px] font-medium tracking-[-0.006em] whitespace-nowrap text-arc-text/62">
            <Pic src={TRIBE_ICON[id]} size={16} className="opacity-62" />{name}
          </li>
        ))}
      </ul>
      <ul className="mt-9 grid grid-cols-2 gap-3">{/* cards at y 456, 165×150 */}
        {ways.map(([icon, title, text]) => (
          <li key={title} className="h-[150px] rounded-[20px] px-4 pt-[18px]" style={FADE}>
            <Pic src={icon} size={24} />
            <h2 className="mt-[14px] text-[17px] leading-5 font-semibold tracking-[-0.012em]">{title}</h2>
            <p className="mt-1.5 text-[13px] leading-[17px] font-medium text-arc-text-3">{text}</p>
          </li>
        ))}
      </ul>
    </Page>
  );
}

function BeforeDuringAfter() {
  const stages: [string, string, string, string][] = [[sparkle, 'Before', 'Ask', 'Bring one question tonight.'],
    [mapIcon, 'During', 'Arc', 'Follow it. Swap a stop. Share it.'], [book, 'After', 'Keep', 'CHI’s answer, a reading list, and what’s still open.']];
  return (
    <Page dot={7} label="Before, during, after" title={['Before, during,', 'after.']} next="ask">
      <ul className="mt-12 flex flex-col gap-3">{/* Figma 741:1536…: 342×110 at y 232 / 354 / 476 */}
        {stages.map(([icon, when, name, text]) => (
          <li key={name} className="relative h-[110px] rounded-[20px]" style={FADE}>
            <Pic src={icon} size={24} className="absolute top-5 left-[18px]" />
            <h2 className="absolute top-[22px] left-14 flex flex-col">
              <span className="text-[12px] leading-[15px] font-medium text-arc-text-3">{when}</span>
              <span className="mt-[3px] text-[22px] leading-[27px] font-semibold tracking-[-0.02em]">{name}</span>
            </h2>
            <p className="absolute top-[30px] right-[18px] left-[140px] text-[14px] leading-[19px] font-medium tracking-[-0.006em] text-arc-text-2">{text}</p>
          </li>
        ))}
      </ul>
    </Page>
  );
}

const PAGES: Record<string, () => React.JSX.Element> = { '1': Welcome, '2': WhatIsChi, '3': ADay, '4': Formats, '5': HowPeopleTalk, '6': HowArcWorks,
  '6b': YourColour, '6c': BeforeDuringAfter };
export const START_PAGES = Object.keys(PAGES);

export function Start({ page }: { page: string }) {
  useTribe(null);
  useEffect(() => { warm().catch(() => {}); }, []); // models and data download while these are read
  const P = PAGES[page] ?? Welcome;
  return <P />;
}
