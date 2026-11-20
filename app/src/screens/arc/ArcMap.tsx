// 12 · My Arc (A1 placeholder so 01 → 12 can be walked): the question, tribe and the talks per angle as text.
// The Figma 12 map, 13 list, 14 detail and 15 edit come in A2.
import { useEffect, useState } from 'react';
import { go, href } from '../../router';
import { getArc } from '../../arc/store';
import { TRIBE } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { useTribe } from '../../arc/live';
import { Screen, BackButton, Pic } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import type { Arc, Angle } from '../../engine';

export function ArcMap({ id }: { id: string }) {
  const [arc, setArc] = useState<Arc | null | undefined>(undefined);
  useEffect(() => { getArc(id).then(setArc); }, [id]);
  useEffect(() => { if (arc === null) go('home', { replace: true }); }, [arc]);
  useTribe(arc?.tribe);
  if (!arc) return null;
  return (
    <Screen label="My Arc" header={<><BackButton href={href('home')} /><span /></>}>
      <h1 className="mt-2 text-[26px] leading-8 font-semibold tracking-[-0.02em]">{arc.query}</h1>
      <p className="mt-2 flex items-center gap-1.5 text-[14px] text-arc-text-2"><Pic src={TRIBE_ICON[arc.tribe]} size={14} />{TRIBE[arc.tribe].name}</p>
      {(['S', 'R', 'T'] as Angle[]).map(a => {
        const nodes = arc.nodes.filter(n => n.angle === a);
        return (
          <section key={a} className="mt-6">
            <h2 className="text-[17px] font-semibold">{ANGLE_NAME[a]} <span className="text-arc-text-3">{nodes.length}</span></h2>
            {a === 'T' && arc.tension === 'none' && <p className="mt-1 text-[14px] text-arc-text-3">No clear challenge to it this year.</p>}
            {a === 'T' && arc.tension === 'pending' && <p className="mt-1 text-[14px] text-arc-text-3">Angles still sorting…</p>}
            <ul className="mt-2 flex flex-col gap-1">{nodes.map(n => <li key={n.key} className="text-[15px]">{n.debut ? '✦ ' : ''}{n.label}</li>)}</ul>
          </section>
        );
      })}
    </Screen>
  );
}
