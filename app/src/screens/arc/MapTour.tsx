// The first Arc's tour (user 11/26 「첫 arc 만들면 각 그걸 알려주는 가이드 표시 … 하나하나 눌러보면서 설명되는 그건 figma에
// 없는데 넣어줘」; not in Figma). One part of 12 at a time is lit, the rest dimmed; a tap anywhere or Next goes on, Skip ends.
// Parts that are not on this map (no Challenges yet) are left out.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type TourStep = { at: string | string[]; title: string; text: string }; // several: the first found
// a count of 0 is not a step to point at (audit 11/27: "Challenges" over ⊣ 0)
const find = (at: TourStep['at']) => [at].flat().map(q => document.querySelector(q)).find(el => el && el.querySelector('[data-count]')?.textContent?.trim() !== '0') ?? null;
export const TOUR: TourStep[] = [
  // user 11/28 「지도 가이드 7장 → 2장」: the angles light up one by one before this (ArcMap REVEAL); the ? keeps them all
  { at: ['[data-arc-map] button:has(.arc-node-next)', '[data-arc-map] [data-node-wrap] button'], title: 'A talk', text: 'White is your next stop; dashed has ended. Tap it for details and Swap.' },
  { at: '[data-tour="card"]', title: 'Next up', text: 'When and where, and the first author to look for.' },
];

// 14, the first talk opened after the map tour (user 11/26 「논문 페이지 처음 들어왔을때 지금 처럼 가이드 있으면 좋을꺼 같아」)
export const TALK_TOUR: TourStep[] = [
  { at: '[data-tour="tags"]', title: 'Its angle', text: 'How this talk meets your question, and what kind of session it is.' },
  { at: '[data-tour="who"]', title: 'Who to look for', text: 'The first author, and the session’s chair.' },
  { at: '[data-tour="next"]', title: 'Next stop', text: 'The next talk on your Arc, and the walk there.' },
  { at: 'section[aria-labelledby="why"]', title: 'Why it’s here', text: 'The sentence from this paper’s abstract that puts it on your map.' },
  { at: '[data-tour="when"]', title: 'When and where', text: 'Time, room and session. ✦ marks an author new to CHI.' },
  { at: '[data-tour="qa"]', title: 'Ask the authors', text: 'The authors answer in the session. Questions with the most votes come first, so vote for the ones you want asked.' },
];

// 15, the first time Edit opens after the map tour (user 11/27 「처음 editing들어가면 다른 곳처럼 가이드」)
export const EDIT_TOUR: TourStep[] = [
  { at: 'button[aria-label^="Add a talk to"]', title: 'Add a talk', text: 'Tap + to open the talks for that angle in a sheet below.' },
  { at: '[data-arc-map] [data-node-key]', title: 'A talk', text: 'Tap a talk for its details, Swap or Remove. Your changes wait here while you read it.' },
  { at: 'button[aria-label^="Remove"]', title: 'Remove', text: 'The − takes a talk off your Arc.' },
  { at: '[data-tour="done"]', title: 'Done', text: 'Done keeps your changes; Cancel throws them away.' },
];

// the sheet of 15, the first time it shows talks (user 11/27 「노드 꾹 누르는게 아니라 서칭 창에서 꾹 누르면 << 이거 가이드가 정정해주고」)
export const SHEET_TOUR: TourStep[] = [
  { at: '[data-tour="sheet-chips"]', title: 'Pick the angle', text: 'Switch between Supports, Reframes and Challenges right here.' },
  { at: '[data-tour="sheet-cards"]', title: 'Hold to read, tap to add', text: 'Hold a card: the paper opens above it and stays, to scroll; tap outside or × to close. Tap a card to add it; ARC asks first.' },
];

export function MapTour({ onDone, steps: all = TOUR, label = 'How to read your Arc' }: { onDone: () => void; steps?: TourStep[]; label?: string }) {
  const steps = useRef(all.filter(s => find(s.at))).current;
  const [i, setI] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  useLayoutEffect(() => {
    const measure = () => { const el = step && find(step.at); setBox(el ? el.getBoundingClientRect() : null); };
    // a step below the fold comes into view first (audit 11/27: 14's steps 4–5 described what the dim hid)
    const el = step && find(step.at);
    if (el) { const r = el.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 200) el.scrollIntoView({ block: 'center' }); }
    measure();
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, [step]);
  useEffect(() => { next.current?.focus(); }, [i]);
  // the page under the tour stands still (user 11/26 「가이드 창일때는 뒤에 컨텐츠 스크롤 안되게」); iOS also needs the touch stopped
  useEffect(() => {
    const root = document.documentElement, was = root.style.overflow;
    root.style.overflow = 'hidden';
    const stop = (e: TouchEvent) => e.preventDefault();
    addEventListener('touchmove', stop, { passive: false });
    return () => { root.style.overflow = was; removeEventListener('touchmove', stop); };
  }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onDone]);
  useEffect(() => { if (!steps.length) onDone(); }, [steps, onDone]);
  if (!step || !box) return null;
  const go = () => (i + 1 < steps.length ? setI(i + 1) : onDone());
  const pad = 8, below = box.bottom + 180 < innerHeight;
  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[60]" onClick={go}>
      <div aria-hidden="true" className="pointer-events-none absolute rounded-[28px] motion-safe:transition-all motion-safe:duration-300"
        style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: '0 0 0 9999px rgba(8, 7, 14, 0.74), 0 0 0 2px rgba(255, 255, 255, 0.7)' }} />
      <div className="absolute inset-x-4 mx-auto max-w-[358px] rounded-[20px] border border-arc-line bg-arc-sheet p-4 shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
        style={below ? { top: Math.min(box.bottom + pad + 12, innerHeight - 190) } : { bottom: Math.max(innerHeight - box.top + pad + 12, 16) }}>
        <p className="text-[12px] font-medium text-arc-text-3">{i + 1} of {steps.length}</p>
        <p className="mt-1 text-[17px] font-semibold tracking-[-0.012em]">{step.title}</p>
        <p className="mt-1 text-[14px] leading-5 text-arc-text-2">{step.text}</p>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={e => { e.stopPropagation(); onDone(); }} className="min-h-touch px-1 text-[14px] font-semibold text-arc-text-2">Skip</button>
          <button ref={next} type="button" onClick={e => { e.stopPropagation(); go(); }} className="min-h-touch rounded-full bg-arc-primary px-5 text-[15px] font-semibold text-arc-on-primary">{i + 1 < steps.length ? 'Next' : 'Done'}</button>
        </div>
      </div>
    </div>
  );
}
