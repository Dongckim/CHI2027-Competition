// 01 Welcome → 02–05 CHI 101 (first CHI) → 06 How ARC works → 07. "I've been before" goes 01 → 06. Skip → home.
// Copy and pictures are Figma Final UI (590:453 … 591:586). Pictures are decorative; every meaning is in text.
import { useEffect } from 'react';
import { go, href } from '../../router';
import { update } from '../../state/useDevice';
import { setOnboarded, setFirstChi } from '../../arc/draft.js';
import { warm, useTribe } from '../../arc/live';
import { TRIBES } from '../../arc/tribes.js';
import { Screen, ArcButton, ArcLink, TextAction, Dots, Pic } from '../../components/arc';
import holoRing from '../../assets/arc/welcome-holo-ring.svg';
import innerRing from '../../assets/arc/welcome-inner-ring.svg';
import arcMark from '../../assets/arc/glow-arc-mark.svg';
import gAi from '../../assets/arc/glow-tribe-ai.svg';
import gXr from '../../assets/arc/glow-tribe-xr.svg';
import gAccess from '../../assets/arc/glow-tribe-access.svg';
import gHealth from '../../assets/arc/glow-tribe-health.svg';
import gLearning from '../../assets/arc/glow-tribe-learning.svg';
import gSociety from '../../assets/arc/glow-tribe-society.svg';
import gDevices from '../../assets/arc/glow-tribe-devices.svg';
import gDesign from '../../assets/arc/glow-tribe-design.svg';
import pathLine from '../../assets/arc/03-path-line.svg';
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

// shortcut: ACM's policy page (Figma has no URL); switch to the CHI 2027 Code of Conduct page once it is published.
export const CODE_OF_CONDUCT = 'https://www.acm.org/about-acm/policy-against-harassment';

const skip = () => { update(setOnboarded); go('home'); };
const Skip = () => <TextAction href={href('home')} onClick={e => { e.preventDefault(); skip(); }}>Skip</TextAction>;
const Title = ({ lines }: { lines: [string, string] }) =>
  <h1 className="mt-[34px] text-[30px] leading-9 font-semibold tracking-[-0.024em]">{lines[0]}<br />{lines[1]}</h1>;
// Figma draws the pictures on the 390-wide frame; this box keeps their coordinates (y is from the frame top).
const Frame = ({ top, height, children }: { top: number; height: number; children: React.ReactNode }) => (
  <div aria-hidden="true" className="relative -mx-6 w-[390px] max-w-[100vw] self-center" style={{ height }}>
    <div className="absolute left-0 w-[390px]" style={{ top: -top, height: 844 }}>{children}</div>
  </div>
);
const at = (x: number, y: number, w: number, h = w) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: h });

const WELCOME_SHAPES: [string, number, number][] = [
  [gAi, 184, 129], [gXr, 290.07, 172.93], [gAccess, 334, 279], [gHealth, 290.07, 385.07],
  [gLearning, 184, 429], [gSociety, 77.93, 385.07], [gDevices, 34, 279], [gDesign, 77.93, 172.93],
];

function Welcome() {
  return (
    <Screen header={<><span /><Skip /></>} label="Welcome"
      bottom={<>
        <ArcButton onClick={() => { update(s => setFirstChi(s, true)); go('start/2'); }}>It's my first CHI</ArcButton>
        <ArcButton kind="secondary" onClick={() => { update(s => setFirstChi(s, false)); go('start/6'); }}>I've been before</ArcButton>
        {/* Figma 11px; 12px is the floor */}
        <p className="text-center text-[12px] font-medium whitespace-pre text-arc-text-3">{'Unofficial  ·  No account  ·  Stays on your phone'}</p>
      </>}>
      <Frame top={120} height={340}>
        <img src={holoRing} alt="" style={at(45, 140, 300)} />
        <img src={innerRing} alt="" style={at(90, 185, 210)} />
        {WELCOME_SHAPES.map(([src, x, y], i) => (
          <span key={i} style={at(x, y, 22)}><img src={src} alt="" className="absolute max-w-none" style={{ inset: '-53%', width: '206%', height: '206%' }} /></span>
        ))}
        <span style={at(135, 242, 120, 70)}><img src={arcMark} alt="" className="absolute max-w-none" style={{ inset: '-19.29% -9.17%', width: '118.34%', height: '138.58%' }} /></span>
        <p className="absolute w-[390px] text-center text-[14px] font-medium tracking-[0.14em]" style={{ top: 324 }}>ARC</p>
      </Frame>
      <h1 className="mt-2 text-[30px] leading-9 font-semibold tracking-[-0.024em]">Bring one question.<br />Leave CHI with an answer.</h1>
      <p className="sr-only">{TRIBES.length} neighbourhoods of CHI research, each a colour and a shape.</p>
    </Screen>
  );
}

const Next = ({ to }: { to: string }) => <ArcLink href={href(to)}>Next</ArcLink>;
const Page = ({ dot, title, next, children, label }: { dot: number; title: [string, string]; next: string; children: React.ReactNode; label: string }) => (
  <Screen label={label} header={<><Dots at={dot} /><Skip /></>} bottom={<Next to={next} />}>
    <Title lines={title} />
    <div className="flex flex-1 flex-col justify-center py-6">{children}</div>
  </Screen>
);

function WhatIsChi() {
  const stats: [string, string][] = [['4,000', 'people'], ['10+', 'rooms at once'], ['5', 'days']];
  return (
    <Page dot={1} label="What is CHI" title={['The biggest week', 'in HCI research.']} next="start/3">
      <dl className="flex flex-col gap-10">
        {stats.map(([n, l]) => (
          <div key={l} className="flex items-baseline gap-3">
            <dt className="sr-only">{l}</dt>
            <dd className="text-[68px] leading-[72px] font-semibold tracking-[-0.035em]">{n}</dd>
            <dd aria-hidden="true" className="text-[17px] font-medium tracking-[-0.012em] text-arc-text-2">{l}</dd>
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
    <Page dot={2} label="A day at CHI" title={['Ten talks at once.', 'You pick one path.']} next="start/4">
      <p className="sr-only">Many talks run at the same time; you choose one in each slot.</p>
      <Frame top={330} height={244}>
        {Array.from({ length: 4 }, (_, c) => Array.from({ length: 6 }, (_, r) => (
          <span key={`${c}-${r}`} style={at(24 + c * 84, 330 + r * 42, 66, 34)}
            className={`rounded-[8px] ${PICKS.has(`${c}-${r}`) ? 'bg-white shadow-[var(--arc-shadow-lift)]' : 'border border-arc-line bg-arc-surface'}`} />
        )))}
        <img src={pathLine} alt="" style={at(0, 0, 390, 844)} />
      </Frame>
    </Page>
  );
}

function Formats() {
  const cells: [string, string, string][] = [[talk, 'Listen', 'Paper talk'], [poster, 'Chat', 'Poster'], [demo, 'Try', 'Demo'],
    [panel, 'Debate', 'Panel'], [meetup, 'Join', 'SIG & meetup'], [keynote, 'Zoom out', 'Keynote']];
  return (
    <Page dot={3} label="Formats" title={['Know what to do', 'where.']} next="start/5">
      <ul className="grid grid-cols-2 gap-3">
        {cells.map(([icon, verb, name]) => (
          <li key={name} className="flex min-h-[112px] flex-col gap-1.5 pt-4 pr-4 pb-3.5 pl-1">
            <Pic src={icon} size={26} className="mb-2.5" />
            <p className="text-[20px] font-semibold tracking-[-0.012em]">{verb}</p>
            <p className="text-[13px] font-medium text-arc-text-3">{name}</p>
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
      <Frame top={250} height={180}>
        <img src={arc05} alt="" style={at(0, 0, 390, 844)} />
        <span style={at(68, 328, 84)} className="flex items-center justify-center"><img src={bubbleQ} alt="" className="absolute inset-0" /><span className="relative text-[36px] font-semibold">?</span></span>
        <span style={at(238, 328, 84)} className="flex items-center justify-center"><img src={bubbleE} alt="" className="absolute inset-0" /><span className="relative text-[36px] font-semibold">!</span></span>
      </Frame>
      <ul className="mt-4 flex flex-col gap-2.5">
        {rules.map(([icon, text]) => (
          <li key={text} className="flex h-[52px] items-center gap-3 rounded-full border border-arc-line bg-arc-surface pl-[18px] text-[15px] font-medium tracking-[-0.006em]">
            <Pic src={icon} size={20} />{text}
          </li>
        ))}
      </ul>
      <a href={CODE_OF_CONDUCT} target="_blank" rel="noopener noreferrer"
        className="mx-auto mt-3 inline-flex min-h-touch items-center gap-1.5 px-2 text-[14px] font-semibold text-arc-text/60">
        Code of Conduct <Pic src={external} size={14} />
      </a>
    </Page>
  );
}

function HowArcWorks() {
  const node = (orb: string, name: string, sub: string, x: number, y: number) => (
    <div style={{ position: 'absolute', left: x, top: y, width: 104 }} className="flex flex-col items-center gap-0.5">
      <img src={orb} alt="" width={64} height={64} />
      <p className="text-[12px] leading-[15px] font-semibold text-arc-text/85">{name}</p>
      <p className="text-[12px] font-medium text-arc-text-3">{sub}</p>{/* Figma 10px; 12px is the floor */}
    </div>
  );
  return (
    <Page dot={5} label="How ARC works" title={['Your question,', 'seen from three sides.']} next="ask">
      <div className="relative -mx-6 h-[280px] w-[390px] max-w-[100vw] self-center">
        <div className="absolute left-0 w-[390px]" style={{ top: -330, height: 844 }}>
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

const PAGES: Record<string, () => React.JSX.Element> = { '1': Welcome, '2': WhatIsChi, '3': ADay, '4': Formats, '5': HowPeopleTalk, '6': HowArcWorks };
export const START_PAGES = Object.keys(PAGES);

export function Start({ page }: { page: string }) {
  useTribe(null);
  useEffect(() => { warm().catch(() => {}); }, []); // models and data download while these are read
  const P = PAGES[page] ?? Welcome;
  return <P />;
}
