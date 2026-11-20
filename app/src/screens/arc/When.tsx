// 09 · When, and what kind? One "When" (Today / Tomorrow / All week on a conference day, else the days themselves),
// any number of "What". Filters only; no engine call here.
import current from '../../../../data/build/app-data/chi2026/current.json';
import venue from '../../../../data/venue/chi2026.json';
import { go, href } from '../../router';
import { update, useDevice } from '../../state/useDevice';
import { arcOf, setWhen, toggleWhat, whenOptions, whenChoice, WHAT, WHAT_LABEL } from '../../arc/draft.js';
import { localDay } from '../../planner/plan.js';
import { useNow } from '../../clock.js';
import { useTribe } from '../../arc/live';
import { Screen, ArcButton, BackButton, StepBar, Chip, SectionHeader } from '../../components/arc';
import clock from '../../assets/arc/icon-clock.svg';
import talk from '../../assets/arc/icon-talk.svg';

export const TIME_ZONE: string = venue.timeZone;
export const whenNow = (ms: number) => whenOptions(current.days, localDay(ms, TIME_ZONE));

export function When() {
  const state = useDevice();
  const { draft } = arcOf(state);
  const options = whenNow(useNow());
  const chosen = whenChoice(options, draft.when);
  useTribe(null);
  if (!draft.query.trim()) { go('ask', { replace: true }); return null; }
  return (
    <Screen clock label="When and what"
      header={<><BackButton href={href('angles')} /><StepBar at={2} /><span className="w-11" /></>}
      bottom={<ArcButton onClick={() => go('building')} disabled={!draft.what.length}>Build my Arc</ArcButton>}>
      <h1 className="mt-[18px] text-[28px] leading-[34px] font-semibold tracking-[-0.024em]">When, and what kind?</h1>
      <div className="mt-9 flex flex-col gap-[30px]">
        <section aria-labelledby="when-h" className="flex flex-col gap-3">
          <SectionHeader id="when-h" icon={clock} label="When" />
          <div role="radiogroup" aria-labelledby="when-h" className="flex flex-wrap gap-2">
            {options.map(o => <Chip key={o.id} single selected={o.id === chosen.id} onClick={() => update(s => setWhen(s, o.id))}>{o.label}</Chip>)}
          </div>
        </section>
        <section aria-labelledby="what-h" className="flex flex-col gap-3">
          <SectionHeader id="what-h" icon={talk} label="What" />
          <div className="flex flex-wrap gap-2">
            {Object.keys(WHAT).map(k => <Chip key={k} selected={draft.what.includes(k)} onClick={() => update(s => toggleWhat(s, k))}>{WHAT_LABEL[k as keyof typeof WHAT_LABEL]}</Chip>)}
          </div>
        </section>
      </div>
    </Screen>
  );
}
