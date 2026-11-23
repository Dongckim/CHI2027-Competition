// 12 · My Arc · map (Figma 597:711) with its states: 23 no clear Challenge, 24 crowded (+N), 25 angles still sorting.
// Bottom: the next talk (to 14), Edit (15) and Share (A3).
import { useCallback, useState } from 'react';
import { go, href } from '../../router';
import { Screen, ArcLink, Pic } from '../../components/arc';
import { AngleHelp, ANGLE_NAME } from './AngleHelp';
import { ArcView, ANGLE_ICON, useMapFit } from './ArcView';
import { ArcHeader } from './ArcHeader';
import { useArc } from './useArc';
import { useHoldSwap, SwapFan, SwapUndo } from './HoldSwap';
import editIcon from '../../assets/arc/icon-edit.svg';
import chevron from '../../assets/arc/icon-chevron-right.svg';
import spinner from '../../assets/arc/25-spinner.svg';

export function ArcMap({ id }: { id: string }) {
  const use = useArc(id);
  const { arc, states, info } = use;
  const hs = useHoldSwap(use);
  const [help, setHelp] = useState(false);
  const [fit, mapRef] = useMapFit();
  const closeHelp = useCallback(() => setHelp(false), []);
  if (!arc) return null;
  const pending = arc.tension === 'pending';
  const held = hs.fan?.key ?? null;
  const next = pending ? null : arc.nodes.find(n => states.get(n.key) === 'next') ?? null;
  const ni = next ? info(next.key) : null;
  return (
    <Screen clock label="My Arc" header={<ArcHeader id={id} view="map" onHelp={() => setHelp(true)} />}
      bottom={<>
        <SwapUndo hs={hs} />
        {next && ni && (
          <a href={href(`talk/${next.key}`)} inert={!!held || undefined} aria-description={`Next up: ${ANGLE_NAME[next.angle]} · ${ni.title} · ${ni.time}`}
            className="flex min-h-[68px] items-center gap-3.5 rounded-[20px] border border-arc-line bg-arc-surface pr-4 pl-3.5">
            {/* Figma: a 38 circle in a 40 frame, 18 px symbol */}
            <span className="m-px flex size-[38px] shrink-0 items-center justify-center rounded-full border border-arc-line bg-arc-surface"><Pic src={ANGLE_ICON[next.angle]} size={18} /></span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[16px] font-semibold tracking-[-0.006em]">{ni.short}</span>
              <span className="truncate text-[13px] text-arc-text/60">Next · {ni.when}</span>
            </span>
            <Pic src={chevron} size={20} className="opacity-50" />
          </a>
        )}
        <div className="flex gap-3" inert={!!held || undefined}>
          <ArcLink kind="secondary" href={href(`arc/${id}/edit`)} className="min-w-[128px] shrink-0"><Pic src={editIcon} size={20} />Edit</ArcLink>
          <ArcLink href={href(`share/${id}`)}>Share</ArcLink>
        </div>
      </>}>
      <h1 className="sr-only">{arc.query}</h1>
      {/* Figma: the map box at y 112 on every state; 25's pill sits over its top, its centre 2.75 right of the middle */}
      <div ref={mapRef} className="relative -mx-6 mt-[10px]">
        {pending && (
          <p role="status" className="absolute top-0 left-[calc(50%-73px)] z-10 flex h-9 items-center gap-2 rounded-[18px] border border-arc-line bg-arc-surface pr-3.5 pl-2.5 text-[13px] font-medium whitespace-nowrap text-arc-text/85">
            <img src={spinner} alt="" width={16} height={16} />Sorting angles…{/* Figma 25: a still 3/4 arc */}
          </p>
        )}
        <ArcView arc={arc} states={states} info={info} scale={fit} fit onNode={k => hs.tap() && go(`talk/${k}`)} onBundle={() => go(`arc/${id}/list`)}
          hold={pending ? undefined : { held, press: hs.press, onSwap: k => hs.open(k, true) }} />
      </div>
      {held && <SwapFan hs={hs} title={info(held).title} />}
      <AngleHelp open={help} onClose={closeHelp} />
    </Screen>
  );
}
