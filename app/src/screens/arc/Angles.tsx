// 08 · Choose your angles: for each angle, the sessions its talks sit in (engine.angleTopics, real session names).
// Defaults as Figma: the first two Supports and Reframes on, the first Challenge on. No chip on = that angle is left out.
import { useCallback, useEffect, useState } from 'react';
import { go, href } from '../../router';
import { update, useDevice } from '../../state/useDevice';
import { arcOf, setTopics, toggleTopic } from '../../arc/draft.js';
import { engine, type Angle } from '../../engine';
import { useTribe } from '../../arc/live';
import { Screen, ArcButton, BackButton, StepBar, Chip, SectionHeader } from '../../components/arc';
import { AngleHelp, ANGLE_NAME } from './AngleHelp';
import support from '../../assets/arc/angle-support.svg';
import reframe from '../../assets/arc/angle-reframe.svg';
import challenge from '../../assets/arc/angle-challenge.svg';

const ICON: Record<Angle, string> = { S: support, R: reframe, T: challenge };
const NONE: Record<Angle, string> = {
  S: 'No talk this year matches it closely.',
  R: 'No talk looks at it from another side.',
  T: 'No clear challenge', // the abstracts do not say so; nothing is made up
};

export function Angles() {
  const state = useDevice();
  const { draft } = arcOf(state);
  const query = draft.query.trim();
  const [help, setHelp] = useState(false);
  const [error, setError] = useState(false);
  const closeHelp = useCallback(() => setHelp(false), []);
  useTribe(null);
  useEffect(() => { if (!query) go('ask', { replace: true }); }, [query]);
  const loaded = draft.topicsFor === query;
  useEffect(() => {
    if (!query || loaded) return;
    let live = true;
    setError(false);
    engine.angleTopics(query).then(t => { if (live) update(s => setTopics(s, query, t)); }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, [query, loaded]);
  const anyOn = (['S', 'R', 'T'] as Angle[]).some(a => draft.topics[a].some((t: { on: boolean }) => t.on));

  return (
    <Screen label="Choose your angles"
      header={<><BackButton href={href('ask')} /><StepBar at={1} /><span className="w-11" /></>}
      bottom={<ArcButton onClick={() => go('when')} disabled={!loaded || !anyOn}>Next</ArcButton>}>
      <h1 className="mt-[18px] text-[28px] leading-[34px] font-semibold tracking-[-0.024em]">Choose your angles.</h1>
      {!loaded ? (
        <p className="mt-8 text-[16px] text-arc-text-2" aria-live="polite">{error ? 'Could not read the programme. Check the connection and go back.' : 'Finding angles…'}</p>
      ) : (
        <div className="mt-9 flex flex-col gap-[30px] pb-4">
          {(['S', 'R', 'T'] as Angle[]).map(a => (
            <section key={a} aria-labelledby={`angle-${a}`} className="flex flex-col gap-3">
              <SectionHeader id={`angle-${a}`} icon={ICON[a]} label={ANGLE_NAME[a]} onHelp={() => setHelp(true)} />
              {draft.topics[a].length ? (
                <div className="flex flex-wrap gap-2">
                  {draft.topics[a].map((t: { id: string; label: string; on: boolean }) => (
                    <Chip key={t.id} selected={t.on} onClick={() => update(s => toggleTopic(s, a, t.id))}>{t.label}</Chip>
                  ))}
                </div>
              ) : <p className="text-[14px] text-arc-text-3">{NONE[a]}</p>}
            </section>
          ))}
        </div>
      )}
      <AngleHelp open={help} onClose={closeHelp} />
    </Screen>
  );
}
