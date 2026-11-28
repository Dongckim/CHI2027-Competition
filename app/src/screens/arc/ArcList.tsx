// 13 · My Arc · list (Figma 597:860): the same Arc as rows by angle, one-line titles (the whole title is the name), the state as a word
// ("Heard · …", "Next · …", "Ended · …") so it is never colour alone. A row opens 14.
import { useCallback, useState } from 'react';
import { go, href } from '../../router';
import { Screen, ArcLink, Pic } from '../../components/arc';
import { AngleHelp, ANGLE_NAME, ANGLE_MEANING, KIND_NAME } from './AngleHelp';
import { Broader, EMPTY_LINE } from './Broader';
import { ANGLE_ICON } from './ArcView';
import { ArcHeader } from './ArcHeader';
import { useArc } from './useArc';
import editIcon from '../../assets/arc/icon-edit.svg';
import chevron from '../../assets/arc/icon-chevron-right.svg';
import type { Angle, Arc } from '../../engine';
import type { Info } from './ArcView';

const PREFIX = { next: 'Next · ', heard: 'Heard · ', ended: 'Ended · ', upcoming: '' } as const;

export function ArcList({ id }: { id: string }) {
  const { arc, onMap, other, states, info } = useArc(id);
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
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="img" aria-label={`${heard} of ${arc.nodes.length} heard`}>
        {arc.nodes.map(n => <span key={n.key} className={`size-2 rounded-full ${states.get(n.key) === 'heard' ? 'bg-tribe' : 'border border-arc-text/40'}`} />)}
      </div>
      {pending && <p className="mt-4 text-[14px] text-arc-text-2" role="status">Sorting angles… The talks are here; their angles come next.</p>}
      <AngleRows arc={onMap ?? arc} states={states} info={info} own />
      <OtherDays nodes={other} states={states} info={info} />
      <AngleHelp open={help} onClose={closeHelp} />
    </Screen>
  );
}

/** 13's rows by angle; also 18's "Just read" (prototype LINKS: Just read → 13), for an Arc that is not saved. */
export function AngleRows({ arc, states, info, own }: { arc: Arc; states: Map<string, string>; info: (key: string) => Info; own?: boolean }) {
  return (
    <div className="mt-[26px] flex flex-col gap-[18px] pb-4">
      {(['S', 'R', 'T'] as Angle[]).map(a => {
        const nodes = arc.nodes.filter(n => n.angle === a);
        return (
          <section key={a} aria-labelledby={`list-${a}`} className="flex flex-col gap-2">
            <h2 id={`list-${a}`} className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.006em]">
              <Pic src={ANGLE_ICON[a]} size={18} />{ANGLE_NAME[a]}<span className="font-medium text-arc-text-3">· {ANGLE_MEANING[a]}</span>
              <span className="text-[12px] font-medium text-arc-text-3">{nodes.length}</span>
            </h2>
            {!nodes.length && arc.tension !== 'pending' && <p className="text-[14px] text-arc-text/60">{EMPTY_LINE[a]}</p>}
            {!nodes.length && own && arc.tension !== 'pending' && <Broader arc={arc} angle={a} className="items-start" />}
            {nodes.map(n => <Row key={n.key} n={n} info={info} states={states} />)}
          </section>
        );
      })}
    </div>
  );
}

/** One talk as a row (13, 18 Just read, 13's Other days): the state as a word, the first author, the kind of Reframe. */
function Row({ n, info, states }: { n: Arc['nodes'][number]; info: (key: string) => Info; states: Map<string, string> }) {
  const i = info(n.key), st = (states.get(n.key) ?? 'upcoming') as keyof typeof PREFIX, a = n.angle;
  return (
    <button type="button" onClick={() => go(`talk/${n.key}`)}
      className="flex min-h-[62px] items-center gap-3 rounded-[20px] border border-arc-line bg-arc-surface py-2.5 pr-3 pl-3.5 text-left">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${st === 'heard' ? 'bg-tribe' : st === 'next' ? 'border-2 border-arc-text' : st === 'ended' ? 'border border-dashed border-arc-text/50' : 'shadow-[inset_0_0_0_1.5px_rgba(244,246,255,0.45)]' /* Chrome snaps a 1.5px border to 1 */}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="sr-only">{ANGLE_NAME[a]} · </span>
        <span className={`truncate text-[14px] font-semibold tracking-[-0.006em] ${st === 'heard' || st === 'ended' ? 'text-arc-text/70' : ''}`}>{n.debut && <span aria-hidden="true">✦ </span>}{i.title}</span>
        {i.first && <span className="truncate text-[12px] font-medium text-arc-text-2">by {i.first}</span>}{/* user 11/25 E */}
        {/* Figma 11px; 12px is the floor */}
        <span className="truncate text-[12px] font-medium text-arc-text-3">{n.kind && `${KIND_NAME[n.kind]} · `}{PREFIX[st]}{i.when}</span>{/* Figma: "Heard · 11:26 · Rm 116" (time and room) */}
      </span>
      <Pic src={chevron} size={18} className="opacity-40" />
    </button>
  );
}

/** 13's last group (user 11/25 「"Today" Arc: 끝난 발표와 다른 날 발표는 … 13 목록 맨 아래 "Other days" 묶음으로만」). */
export function OtherDays({ nodes, info, states }: { nodes: Arc['nodes']; info: (key: string) => Info; states: Map<string, string> }) {
  if (!nodes.length) return null;
  return (
    <section aria-labelledby="list-other" className="flex flex-col gap-2 pb-4">
      <h2 id="list-other" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.006em]">Other days<span className="text-[12px] font-medium text-arc-text-3">{nodes.length}</span></h2>
      <p className="text-[13px] text-arc-text-3">Not on your map: another day, or already over.</p>
      {nodes.map(n => <Row key={n.key} n={n} info={info} states={states} />)}
    </section>
  );
}
