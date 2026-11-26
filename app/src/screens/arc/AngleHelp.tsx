// 22 · Three angles: the ? sheet, the same from 08 and 12. Copy is Figma's (600:1266).
import { Sheet, Pic, ArcButton } from '../../components/arc';
import support from '../../assets/arc/22-sheet-support.svg';
import reframe from '../../assets/arc/22-sheet-reframe.svg';
import challenge from '../../assets/arc/22-sheet-challenge.svg';

export const ANGLE_NAME = { S: 'Supports', R: 'Reframes', T: 'Challenges' } as const; // screen names; keys stay S/R/T
// Arc 0.2.0 `kind` of a Reframe, shown on 12, 13, 14 (user 11/21; Wonjune's engine words, new to the design: designer to confirm)
export const KIND_NAME = { subject: 'Same subject', factor: 'Other factor', measure: 'Other measure', people: 'Other people' } as const;
const ROWS = [
  { icon: support, name: ANGLE_NAME.S, text: 'Same question, same finding.' },
  { icon: reframe, name: ANGLE_NAME.R, text: 'Same question through a different factor, measure, or group.' },
  { icon: challenge, name: ANGLE_NAME.T, text: 'Same question, a different finding. Not a verdict on the paper.' },
];

// user 11/26 「? 버튼에 각 색깔 표기도 해주고」: what the map's fills, rings and colour mean (not in Figma; drawn as the map does)
const ring = 'size-[22px] shrink-0 rounded-full';
const LEGEND = [
  { mark: <span className={`${ring} bg-white/95`} />, name: 'Next', text: 'your next stop' },
  { mark: <span className={`${ring} border-[1.5px] border-white/55`} />, name: 'Upcoming', text: 'later on your Arc' },
  { mark: <span className={`${ring} border-[1.5px] border-dashed border-white/40`} />, name: 'Ended or not added', text: 'over, or a talk not on your Arc yet' },
  { mark: <span className="flex size-[22px] shrink-0 items-center justify-center text-[14px] text-arc-text">✦</span>, name: 'New to CHI', text: 'a first CHI paper' },
  { mark: <span className={`${ring} border-2`} style={{ borderColor: 'var(--tribe, #7c83ff)', boxShadow: '0 0 10px var(--tribe, #7c83ff)' }} />, name: 'Your field’s colour', text: 'the question and the screen edge' },
];

export function AngleHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Three angles">
      <ul className="pt-0.5 flex flex-col gap-[18px]">{/* rows 86 below the sheet top, as Figma (the title line is 26, Figma 27 + 25) */}
        {ROWS.map(r => (
          <li key={r.name} className="flex items-start gap-3.5">
            <Pic src={r.icon} size={40} />
            <div className="flex flex-col gap-0.5">
              <p className="text-[16px] leading-[19px] font-semibold tracking-[-0.006em]">{r.name}</p>
              <p className="text-[14px] leading-5 tracking-[-0.006em] text-arc-text-2">{r.text}</p>
            </div>
          </li>
        ))}
      </ul>
      {/* Figma: 11px at 45% (≈ 4.1:1); raised to 12px at --arc-text-3 (≈ 5.3:1 on the sheet) */}
      <p className="mt-[15px] text-[12px] font-medium text-arc-text-3">Read from each paper’s abstract.</p>
      <p id="legend" className="mt-5 text-[13px] font-semibold text-arc-text-2">On the map</p>
      <ul aria-labelledby="legend" className="mt-2.5 mb-[13px] flex flex-col gap-2.5">
        {LEGEND.map(r => (
          <li key={r.name} className="flex items-center gap-3 text-[14px] leading-5">
            <span aria-hidden="true" className="flex w-10 justify-center">{r.mark}</span>
            <span><span className="font-semibold">{r.name}</span><span className="text-arc-text-2"> · {r.text}</span></span>
          </li>
        ))}
      </ul>
      <ArcButton kind="secondary" className="-mb-[7px]" onClick={onClose}>Got it</ArcButton>{/* Figma: 14 above the safe area; Sheet gives 20 + its border */}
    </Sheet>
  );
}
