// 10 · Building: the engine reads the talks in scope and makes the Arc (about 3 s, as Figma), then 11.
// The count is real: talks of the chosen kinds on the chosen days. The edge already glows in the question's tribe (07).
import { useEffect, useState } from 'react';
import { go, href } from '../../router';
import { useDevice, update } from '../../state/useDevice';
import { arcOf, buildOptions, whenChoice, resetDraft } from '../../arc/draft.js';
import { engine } from '../../engine';
import { saveArc } from '../../arc/store';
import { loadSchedule } from '../../data/load';
import { localDay } from '../../planner/plan.js';
import { now } from '../../clock.js';
import { warm, useTribe, previewTribe } from '../../arc/live';
import { Screen, ArcLink } from '../../components/arc';
import { whenNow, TIME_ZONE } from './When';
import outer from '../../assets/arc/10-orbit-outer.svg';
import inner from '../../assets/arc/10-orbit-inner.svg';

const MIN_MS = 3000;
const at = (x: number, y: number, w: number, h = w) => ({ position: 'absolute' as const, left: x, top: y, width: w, height: h });

export function Building() {
  const { draft } = arcOf(useDevice());
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useTribe(previewTribe());
  useEffect(() => {
    const query = draft.query.trim();
    if (!query) { go('ask', { replace: true }); return; }
    let live = true;
    const opts = buildOptions(draft, whenChoice(whenNow(now()), draft.when).days) as Parameters<typeof engine.buildArc>[1] & { days: string[]; types: string[] }; // draft.js is untyped JS
    const started = Date.now();
    loadSchedule().then(s => {
      const papers = [...s.index.papers.values()] as { feedType: string; slots: { start: number | null }[] }[];
      const day = (p: (typeof papers)[number]) => { const t = p.slots.map(x => x.start).filter((x): x is number => x != null); return t.length ? localDay(Math.min(...t), TIME_ZONE) : null; };
      if (live) setCount(papers.filter(p => opts.types.includes(p.feedType) && (!opts.days.length || opts.days.includes(day(p)!))).length);
    }, () => {});
    warm().then(() => engine.buildArc(query, opts)).then(async arc => {
      await saveArc(arc);
      await new Promise(r => setTimeout(r, Math.max(0, MIN_MS - (Date.now() - started))));
      if (!live) return;
      update(resetDraft);
      go(`hood/${arc.id}`, { replace: true }); // back from 11 does not build again
    }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen label="Building your Arc" bottom={failed ? <ArcLink href={href('when')} kind="secondary">Try again</ArcLink> : undefined}>
      <div className="relative -mx-6 mt-[100px] h-[340px] w-[390px] max-w-[100vw] self-center" aria-hidden="true">
        <div className="absolute left-0 w-[390px]" style={{ top: -210, height: 844 }}>
          <img src={outer} alt="" style={at(25, 210, 340)} />
          <img src={inner} alt="" style={at(70, 255, 250)} />
          <span className="arc-orb" style={at(125, 310, 140)} />{/* Figma's orb is XR blue; this takes the tribe colour */}
          <span className="arc-spin arc-progress" style={at(113, 298, 164)} />{/* Figma: 2px ring, angular gradient white 0 → 0.95 */}
          <p className="absolute line-clamp-3 w-[104px] text-center text-[14px] leading-[18px] font-semibold" style={{ left: 143, top: 362 }}>{draft.query}</p>
        </div>
      </div>
      <p className="mt-[-20px] text-center text-[13px] font-medium text-arc-text-2" role="status">
        {failed ? 'Could not build the Arc. Check the connection and try again.' : count == null ? 'Reading the programme for you' : `Reading ${count.toLocaleString('en')} talks for you`}
      </p>
    </Screen>
  );
}
