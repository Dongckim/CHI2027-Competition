// 22 · Three angles: the ? sheet, the same from 08 and 12. Copy is Figma's (600:1266).
import { Sheet, Pic, ArcButton } from '../../components/arc';
import support from '../../assets/arc/22-sheet-support.svg';
import reframe from '../../assets/arc/22-sheet-reframe.svg';
import challenge from '../../assets/arc/22-sheet-challenge.svg';

export const ANGLE_NAME = { S: 'Supports', R: 'Reframes', T: 'Challenges' } as const; // screen names; keys stay S/R/T
const ROWS = [
  { icon: support, name: ANGLE_NAME.S, text: 'Same question, same finding.' },
  { icon: reframe, name: ANGLE_NAME.R, text: 'Same question through a different factor, measure, or group.' },
  { icon: challenge, name: ANGLE_NAME.T, text: 'Same question, a different finding. Not a verdict on the paper.' },
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
      <p className="mt-[15px] mb-[13px] text-[12px] font-medium text-arc-text-3">Read from each paper’s abstract.</p>
      <ArcButton kind="secondary" className="-mb-[7px]" onClick={onClose}>Got it</ArcButton>{/* Figma: 14 above the safe area; Sheet gives 20 + its border */}
    </Sheet>
  );
}
