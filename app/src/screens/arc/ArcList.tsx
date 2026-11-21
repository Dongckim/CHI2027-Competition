// 13 · My Arc · list (Figma 597:860): the same Arc as rows by angle, whole titles up to two lines, the state as a word
// ("Heard · …", "Next · …", "Ended · …") so it is never colour alone. A row opens 14.
import { useCallback, useState } from 'react';
import { go, href } from '../../router';
import { Screen, ArcLink, Pic } from '../../components/arc';
import { AngleHelp, ANGLE_NAME } from './AngleHelp';
import { ANGLE_ICON } from './ArcView';
import { ArcHeader } from './ArcHeader';
import { useArc } from './useArc';
import editIcon from '../../assets/arc/icon-edit.svg';
import chevron from '../../assets/arc/icon-chevron-right.svg';
import type { Angle } from '../../engine';

const PREFIX = { next: 'Next · ', heard: 'Heard · ', ended: 'Ended · ', upcoming: '' } as const;

export function ArcList({ id }: { id: string }) {
  const { arc, states, info } = useArc(id);
  const [help, setHelp] = useState(false);
  const closeHelp = useCallback(() => setHelp(false), []);
  if (!arc) return null;
  const pending = arc.tension === 'pending';
  const heard = arc.nodes.filter(n => states.get(n.key) === 'heard').length;
  return (
    <Screen clock label="My Arc list" header={<ArcHeader id={id} view="list" onHelp={() => setHelp(true)} />}
      bottom={<div className="flex gap-3">
        <ArcLink kind="secondary" href={href(`arc/${id}/edit`)} className="min-w-[128px] shrink-0"><Pic src={editIcon} size={20} />Edit</ArcLink>
        <ArcLink href={href(`share/${id}`)}>Share</ArcLink>
      </div>}>
      <h1 className="mt-3.5 max-w-[300px] text-[22px] leading-7 font-semibold tracking-[-0.02em]">{arc.query}</h1>
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5" role="img" aria-label={`${heard} of ${arc.nodes.length} heard`}>
        {arc.nodes.map(n => <span key={n.key} className={`size-[7px] rounded-full ${states.get(n.key) === 'heard' ? 'bg-tribe' : 'border border-arc-text/40'}`} />)}
      </div>
      {pending && <p className="mt-4 text-[14px] text-arc-text-2" role="status">Sorting angles… The talks are here; their angles come next.</p>}
      <div className="mt-6 flex flex-col gap-[18px] pb-4">
        {(['S', 'R', 'T'] as Angle[]).map(a => {
          const nodes = arc.nodes.filter(n => n.angle === a);
          return (
            <section key={a} aria-labelledby={`list-${a}`} className="flex flex-col gap-2">
              <h2 id={`list-${a}`} className="flex items-center gap-2 text-[15px] font-semibold">
                <Pic src={ANGLE_ICON[a]} size={18} />{ANGLE_NAME[a]}
                <span className="text-[12px] font-medium text-arc-text-3">{nodes.length}</span>
              </h2>
              {a === 'T' && arc.tension === 'none' && <p className="text-[14px] text-arc-text/60">No clear challenge at CHI this year.</p>}
              {nodes.map(n => {
                const i = info(n.key), st = (states.get(n.key) ?? 'upcoming') as keyof typeof PREFIX;
                return (
                  <button key={n.key} type="button" onClick={() => go(`talk/${n.key}`)} 
                    className="flex min-h-[62px] items-center gap-3 rounded-[20px] border border-arc-line bg-arc-surface py-2.5 pr-3 pl-3.5 text-left">
                    <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${st === 'heard' ? 'bg-tribe' : st === 'next' ? 'border-2 border-arc-text' : st === 'ended' ? 'border border-dashed border-arc-text/50' : 'border-[1.5px] border-arc-text/45'}`} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="sr-only">{ANGLE_NAME[a]} · </span>
                      <span className={`line-clamp-2 text-[14px] leading-[18px] font-semibold ${st === 'heard' || st === 'ended' ? 'text-arc-text/70' : ''}`}>{n.debut && <span aria-hidden="true">✦ </span>}{i.title}</span>
                      {/* Figma 11px; 12px is the floor */}
                      <span className="text-[12px] font-medium text-arc-text-3">{PREFIX[st]}{i.time}{i.room && ` · ${i.room}`}</span>{/* with the day: an Arc spans the week */}
                    </span>
                    <Pic src={chevron} size={18} />
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
      <AngleHelp open={help} onClose={closeHelp} />
    </Screen>
  );
}
