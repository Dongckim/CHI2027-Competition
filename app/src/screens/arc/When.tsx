// 09 · When, and what kind? "When": the conference days, any number, or All week (user 11/26); any number of "What".
// Filters only; no engine call here. 08 is gone: Back goes to 07.
import current from '../../../../data/build/app-data/chi2026/current.json';
import venue from '../../../../data/venue/chi2026.json';
import type { ReactNode } from 'react';
import { go, href } from '../../router';
import { update, useDevice } from '../../state/useDevice';
import { arcOf, setWhen, toggleWhat, whenOptions, whenDays, toggleWhenDay, WHAT, WHAT_LABEL, WALK, WALK_LABEL, walkOf, toggleWalk } from '../../arc/draft.js';
import { useTribe } from '../../arc/live';
import { Screen, ArcButton, BackButton, Chip, SectionHeader } from '../../components/arc';
import clock from '../../assets/arc/icon-clock.svg';
import talk from '../../assets/arc/icon-talk.svg';

export const TIME_ZONE: string = venue.timeZone;
export const DAYS: string[] = current.days;

// prototype 09 Icon_6 (route: four stops and their links) and Icon_7 (check), 16 px, stroke in currentColor
const WALK_ICON: Record<string, ReactNode> = {
  calm: <svg aria-hidden="true" width={16} height={16} viewBox="38 473 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx={46} cy={481} r={2} /><circle cx={41} cy={477.33} r={1.2} /><circle cx={51} cy={478} r={1.2} /><circle cx={43.33} cy={486} r={1.2} />
    <path d="M42 478.067L44.3333 479.8M49.8667 478.6L47.8 480.067M44 484.867L45.0667 482.733" /></svg>,
  step_free: <svg aria-hidden="true" width={16} height={16} viewBox="174 473 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M178.333 481.333L181.333 484.333L187.667 478" /></svg>,
};

export function When() {
  const state = useDevice();
  const { draft } = arcOf(state);
  const options = whenOptions(DAYS);
  const chosen = whenDays(draft.when, DAYS);
  const walk = walkOf(state) as string[];
  useTribe(null);
  if (!draft.query.trim()) { go('ask', { replace: true }); return null; }
  return (
    <Screen clock label="When and what"
      header={<><BackButton href={href('ask')} /><span /><span className="w-11" /></>}
      bottom={<>{!draft.what.length && <p className="text-center text-[13px] text-arc-text-2">Pick at least one kind of session.</p>}<ArcButton className="mb-1.5" onClick={() => go('building')} disabled={!draft.what.length}>Build my Arc</ArcButton></>}>
      <h1 className="mt-[14px] text-[28px] leading-[34px] font-semibold tracking-[-0.024em]">When, and what kind?</h1>
      <div className="mt-9 flex flex-col gap-[30px]">
        <section aria-labelledby="when-h" className="flex flex-col gap-3">
          <div className="flex h-[21px] items-center"><SectionHeader id="when-h" icon={clock} label="When" /></div>{/* Figma row 21; the 17px line renders 20 */}
          <div role="group" aria-labelledby="when-h" className="flex flex-wrap gap-2">
            {options.map(o => o.id === 'all'
              ? <Chip key="all" selected={!chosen.length} onClick={() => update(s => setWhen(s, 'all'))}>{o.label}</Chip>
              : <Chip key={o.id} selected={chosen.includes(o.id)} onClick={() => update(s => toggleWhenDay(s, o.id, DAYS))}>{o.label}</Chip>)}
          </div>
        </section>
        <section aria-labelledby="what-h" className="flex flex-col gap-3">
          <div className="flex h-[21px] items-center"><SectionHeader id="what-h" icon={talk} label="What" /></div>
          <div className="flex flex-wrap gap-2">
            {Object.keys(WHAT).map(k => <Chip key={k} selected={draft.what.includes(k)} onClick={() => update(s => toggleWhat(s, k))}>{WHAT_LABEL[k as keyof typeof WHAT_LABEL]}</Chip>)}
          </div>
        </section>
        {/* prototype 09 (11/23): "How you walk" is a 13 px caption at x 24 (not a section header), chips 13 apart, each with
            its own icon in the chip's colour (Calm: a route, Step-free: a check); kept on this phone for every Arc */}
        <section aria-labelledby="walk-h" className="flex flex-col gap-[9px]">
          <h2 id="walk-h" className="text-[13px] leading-4 font-medium text-arc-text-3">How you walk</h2>
          <div className="flex flex-wrap gap-[13px]">
            {WALK.map(w => <Chip key={w} selected={walk.includes(w)} icon={WALK_ICON[w]} onClick={() => update(s => toggleWalk(s, w))}>{WALK_LABEL[w as keyof typeof WALK_LABEL]}</Chip>)}
          </div>
        </section>
      </div>
    </Screen>
  );
}
