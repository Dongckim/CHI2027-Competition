// 02–06c, loaded after 01 (perf 11/27: the first screen went over its 100 KB with them in it)
import peopleArt from '../../assets/arc/06b-people.svg';
import afarArt from '../../assets/arc/06b-afar.svg';
import closeArt from '../../assets/arc/06b-close.svg';
import { useEffect } from 'react';
import { go, href } from '../../router';
import { update } from '../../state/useDevice';
import { setOnboarded, setFirstChi } from '../../arc/draft.js';
import { warm, useTribe } from '../../arc/live';
import { TRIBES } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import type { TribeId } from '../../engine/types';
import { Screen, ArcButton, ArcLink, TextAction, Dots, Pic, FRAME_ART } from '../../components/arc';
import { WelcomeOrbit } from './WelcomeOrbit';
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
import regions06 from '../../assets/arc/06-regions.svg';
import holo06 from '../../assets/arc/06-holo-ring.svg';
import orb06 from '../../assets/arc/06-question-orb.svg';
import orbS from '../../assets/arc/06-orb-supports.svg';
import orbR from '../../assets/arc/06-orb-reframes.svg';
import orbT from '../../assets/arc/06-orb-challenges.svg';
import sparkle from '../../assets/arc/icon-sparkle.svg';
import mapIcon from '../../assets/arc/icon-map.svg';
import book from '../../assets/arc/icon-book.svg';
import { Skip, Title, Frame, at, LAST, StepDots, CODE_OF_CONDUCT } from './Start';

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
    <Page dot={1} label="What is CHI" title={['What is CHI 2027?', 'CHI is the biggest week in HCI research.']} next="start/3">
      <dl className="mt-[116px] flex flex-col gap-10">{/* rows at y 300 / 412 / 524 */}
        {stats.map(([n, l, x]) => (
          <div key={l} className="relative">
            <dt className="sr-only">{l}</dt>
            <dd data-count="" className="text-[68px] leading-[72px] font-semibold tracking-[-0.035em]">{n}</dd>
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
    <Page dot={2} label="A day at CHI" title={['What do I do all day?', '10+ talks run at once. Pick one per time slot.']} next="start/4">
      <p className="sr-only">Many talks run at the same time; you choose one in each slot.</p>
      <Frame top={184} height={415}>
        {Array.from({ length: 4 }, (_, c) => Array.from({ length: 6 }, (_, r) => (
          <span key={`${c}-${r}`} data-anim={PICKS.has(`${c}-${r}`) ? `lit ${c === 0 ? 330 : 380 + c * 220}` : `cell ${60 + c * 120 + ((c * 7 + r * 13) % 6) * 10}`} style={{ ...at(24 + c * 84, 330 + r * 42, 66, 34), opacity: r === 4 ? 0.55 : r === 5 ? 0.22 : undefined }}
            className={`rounded-[8px] ${PICKS.has(`${c}-${r}`) ? 'bg-white shadow-[var(--arc-shadow-lift)]' : 'border border-arc-line bg-arc-surface'}`} />
        )))}
        <img src={pathLine} alt="" data-anim="fade 380 1050" style={at(0, 0, 390, 844)} />{/* prototype 03: the dashed path fades in under the picks (drawPath on a dashed line) */}
        <img src={timeAxis} alt="" data-anim="reveal 300 420" style={at(24, 587, 282, 10)} />
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
    <Page dot={3} label="Formats" title={['What are all these formats?', 'Here’s what to do at each one.']} next="start/5">
      <ul className="mt-[64px] [@media(max-height:700px)]:mt-6 grid grid-cols-2 gap-3">{/* short screens (Safari 664): less air so the last row clears Next (audit 11/27) */}{/* Figma 590:650…: 165×132 tiles, radius 20, fade from 6% white */}
        {cells.map(([icon, verb, name]) => (
          <li key={name} className="flex h-[132px] [@media(max-height:700px)]:h-[120px] flex-col items-center justify-center rounded-[20px] px-2 text-center" style={FADE}>
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
    <Page dot={4} label="How people talk" title={['How do people meet?', 'Mostly in the breaks. Three rules help.']} next="start/6">
      <Frame top={184} height={286} className="[@media(max-height:700px)]:!h-[230px]">{/* rules start at y 470; 56 less on short screens so the Code of Conduct link clears Next */}
        <img src={arc05} alt="" data-anim="reveal 620 700" style={at(0, 0, 390, 844)} />{/* prototype 05: ? then !, then the arc between them */}
        <img src={bubbleQ} alt="" data-anim="pop 120" data-flash="640" style={at(68, 328, 84)} />
        <img src={bubbleE} alt="" data-anim="pop 360" data-flash="1320" style={at(238, 328, 84)} />
        <span data-anim="pop 120" className="absolute text-[36px] font-semibold tracking-[-0.024em]" style={{ left: 101, top: 346.5 }}>?</span>
        <span data-anim="pop 360" className="absolute text-[36px] font-semibold tracking-[-0.024em]" style={{ left: 274, top: 346.5 }}>!</span>
      </Frame>
      <ul className="flex flex-col gap-2.5">
        {rules.map(([icon, text], i) => (
          <li key={text} data-anim={`rise ${1150 + i * 110}`} className="flex h-[52px] items-center gap-3 rounded-full border border-arc-line bg-arc-surface pl-[18px] text-[15px] font-medium tracking-[-0.006em]">
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
  const node = (orb: string, name: string, sub: string, x: number, y: number, d: number) => (
    <div data-anim={`node ${d}`} style={{ position: 'absolute', left: x, top: y, width: 104 }} className="flex flex-col items-center gap-0.5">
      <img src={orb} alt="" width={64} height={64} />
      <p className="text-[12px] leading-[15px] font-semibold text-arc-text/85">{name}</p>
      <p className="-mt-px text-[12px] font-medium text-arc-text-3">{sub}</p>{/* Figma 10px; 12px is the floor, 1 up keeps its centre */}
    </div>
  );
  return (
    <Page dot={5} label="How ARC works" title={['What is ARC?', 'ARC finds talks that support, reframe or challenge your question.']} next="start/6b">
      {/* not Frame: the node names are read out, only the pictures are hidden */}
      <div className="pointer-events-none relative h-[446px] w-[390px] shrink-0 self-center">
        <div className="absolute left-0 w-[390px]" style={{ top: -200, /* the answer line under the title took 16 more (prototype 3) */ ...FRAME_ART }}>
          {/* prototype 06: the 12 map's bloom — orb, ring, the three regions, then Supports, Challenges, Reframes */}
          <img src={regions06} alt="" aria-hidden="true" data-anim="fade 560" style={at(0, 196, 390, 524)} />{/* Figma 11/23: the 12 map's three regions */}
          <img src={lines06} alt="" aria-hidden="true" data-anim="fade 760" style={at(0, 0, 390, 844)} />
          <img src={holo06} alt="" aria-hidden="true" data-anim="holo 320" style={at(123, 348, 144)} />
          <img src={orb06} alt="" aria-hidden="true" data-anim="grow 200" style={at(133, 358, 124)} />
          <p className="absolute w-[390px] text-center text-[15px] leading-[19px] font-semibold" style={{ top: 401 }} aria-hidden="true">Your<br />question</p>
          {node(orbS, 'Supports', 'same finding', 143, 223, 830)}
          {node(orbR, 'Reframes', 'new lens', 13.1, 463, 1230)}
          {node(orbT, 'Challenges', 'different finding', 272.9, 463, 1030)}
        </div>
      </div>
    </Page>
  );
}

// 06b chips: Figma's short names (tribes.js has the long ones), in Figma's order; the shapes are the tribe icons at 16, 62%
const CHIPS: [TribeId, string][] = [['ai', 'AI & agents'], ['xr', 'XR & immersive'], ['access', 'Accessibility'], ['health', 'Health & care'],
  ['learning', 'Learning'], ['society', 'Society'], ['devices', 'Devices'], ['design', 'Design']];
function YourColour() {
  // prototype (3) 11/26: people with shapes, "You" joined to the two with yours; each way has its picture (Figma's own art)
  const ways: [string, string, string][] = [[afarArt, 'From afar', 'Spot the shape on their phone or badge.'], [closeArt, 'Up close', 'Scan their QR to get their Arc.']];
  return (
    <Page dot={6} label="Your colour" title={['Where are my people?', 'ARC finds people who share your interests. Same colour, same neighbourhood.']} next="start/6c">
      <img src={peopleArt} alt="" aria-hidden="true" width={390} height={226} className="mt-4 w-[390px] max-w-none shrink-0 self-center" />
      <ul className="mt-[42px] [@media(max-height:700px)]:mt-[14px] grid grid-cols-2 gap-3">{/* cards 165×190 at y 500, the picture is the card */}
        {ways.map(([art, title, text]) => (
          <li key={title} className="relative h-[190px] overflow-hidden rounded-[20px]">
            <img src={art} alt="" aria-hidden="true" width={165} height={190} className="absolute inset-0 h-full w-full max-w-none" />
            <div className="absolute inset-x-4 top-[110px]">
              <h2 className="text-[17px] leading-5 font-semibold tracking-[-0.012em]">{title}</h2>
              <p className="mt-1.5 text-[13px] leading-[17px] font-medium text-arc-text-3">{text}</p>
            </div>
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
    <Page dot={7} label="Before, during, after" title={['When do I use ARC?', 'ARC helps you get the most out of CHI, before, during and after.']} next="paper">{/* Figma 11/25: 06c → 07p (a paper?) → 07r, or 07 */}
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

export const PAGES_REST: Record<string, () => React.JSX.Element> = { '2': WhatIsChi, '3': ADay, '4': Formats, '5': HowPeopleTalk, '6': HowArcWorks, '6b': YourColour, '6c': BeforeDuringAfter };
