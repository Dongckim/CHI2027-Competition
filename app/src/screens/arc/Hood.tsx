// 11 · Your neighborhood: the tribe of the new Arc, said once and clearly (colour + shape + name). "Change" picks another.
import { useEffect, useState, useCallback } from 'react';
import { go, href } from '../../router';
import { getArc, saveArc } from '../../arc/store';
import { TRIBE, TRIBES } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { useTribe } from '../../arc/live';
import { TribeShape } from './TribeShape';
import { Screen, ArcButton, ArcLink, Sheet, Pic } from '../../components/arc';
import type { Arc, TribeId } from '../../engine';

const at = (x: number, y: number, w: number) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: w });
// Figma 593:919/920: radial fills of the tribe colour (stops as Figma) with a 1px white 7% edge
const mix = (a: number) => `color-mix(in srgb, var(--c) ${a}%, transparent)`;
const ring = (stops: [number, number][]) => ({ borderColor: 'rgba(255,255,255,0.07)',
  background: `radial-gradient(circle closest-side, ${stops.map(([a, at]) => `${mix(a)} ${at}%`).join(', ')})` });
const OUTER = ring([[30, 0], [14, 70], [2, 100]]), INNER = ring([[75, 0], [35, 60], [6, 100]]);

export function Hood({ id }: { id: string }) {
  const [arc, setArc] = useState<Arc | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const close = useCallback(() => setPicking(false), []);
  useEffect(() => { getArc(id).then(setArc); }, [id]);
  useTribe(arc?.tribe);
  useEffect(() => { if (arc === null) go('home', { replace: true }); }, [arc]);
  if (!arc) return null;
  const t = TRIBE[arc.tribe];
  const choose = async (tribe: TribeId) => { const next = { ...arc, tribe }; await saveArc(next); setArc(next); setPicking(false); };

  return (
    <Screen label="Your neighborhood"
      bottom={<>
        <ArcButton kind="ghost" className="-mb-1" onClick={() => setPicking(true)}>Change</ArcButton>
        <ArcLink className="mb-1.5" href={href(`arc/${arc.id}`)}>See my Arc</ArcLink>
      </>}>
      <div className="pointer-events-none relative mt-[96px] h-[340px] w-[390px] shrink-0 self-center" aria-hidden="true">
        <span className="arc-ring" style={{ ...at(70, 45, 250), ...INNER }} />
        <span className="arc-ring" style={{ ...at(25, 0, 340), ...OUTER }} />
        {/* Figma 593:922 (XR only): the shape in a light-to-deep gradient with a 2px white 45% edge; the same mix for each tribe */}
        <TribeShape tribe={arc.tribe} style={at(129, 104, 132)} />
      </div>
      <p className="mt-[-12px] text-center text-[12px] font-medium tracking-[0.12em] text-arc-text-3">YOU'RE IN</p>
      <h1 className="mt-[7px] text-center text-[36px] leading-[42px] font-semibold tracking-[-0.024em]">{t.name}</h1>
      <p className="mx-auto mt-3.5 w-[320px] max-w-full text-center text-[16px] leading-[23px] tracking-[-0.006em] text-arc-text/70">Look for the {t.look}.</p>
      <Sheet open={picking} onClose={close} title="Pick your neighborhood">
        <div role="radiogroup" aria-label="Neighborhood" className="mb-2 flex max-h-[50dvh] flex-col overflow-y-auto">
          {TRIBES.map(x => (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === arc.tribe} onClick={() => choose(x.id as TribeId)}
              className="flex min-h-touch items-center gap-3 rounded-xl px-1 py-2 text-left text-[16px] font-medium">
              <Pic src={TRIBE_ICON[x.id as TribeId]} size={20} />
              <span className="flex-1">{x.name}</span>
              {x.id === arc.tribe && <span className="text-[14px] text-arc-text-2">Now</span>}
            </button>
          ))}
        </div>
      </Sheet>
    </Screen>
  );
}
