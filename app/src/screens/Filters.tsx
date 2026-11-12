import { useMemo, useState } from 'react';
import current from '../../../data/build/app-data/chi2026/current.json';
import { searchTalks, placeChoices, NO_FILTERS } from '../../../data/scripts/search.mjs';
import { explore, useExploreData, type Filters as F, type Place } from '../explore/useExplore';
import { dayLabel } from '../explore/format';
import { go } from '../router';
import { Header } from '../components/Header';
import { Chip } from '../components/Chip';
import { ChoiceRow } from '../components/ChoiceRow';
import { BottomAction } from '../components/BottomAction';

// 04 Explore · Filters (Figma 292:508): a full screen, not a bottom sheet. Day, type and institution (or country);
// an institution counts when any author lists it on any of their affiliations. Show [n] results applies, back discards.
const TYPES = [['paper', 'Papers'], ['poster', 'Posters'], ['demo', 'Demos']] as const;
const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter(y => y !== x) : [...list, x]);
const same = (a: Place | null, b: Place | null) => JSON.stringify(a) === JSON.stringify(b);

export function Filters() {
  const { data } = useExploreData();
  const [draft, setDraft] = useState<F>(explore.get().filters);
  const [text, setText] = useState(draft.place?.label ?? '');
  const choices: Place[] = useMemo(() => (data ? placeChoices(data.index, text) : []), [data, text]);
  const n = useMemo(() => (data ? searchTalks(data.index, explore.get().query, draft).length : null), [data, draft]);
  const back = () => go('explore', { replace: true });
  const apply = () => { explore.set({ ...explore.get(), filters: draft, tab: 'talks' }); back(); };

  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-bg pb-28">
      <Header back={back} title="Filters" right={
        <button type="button" onClick={() => { setDraft(NO_FILTERS); setText(''); }} className="-mr-2 min-h-touch px-3 text-small font-semibold underline">Reset</button>
      } />
      <main className="flex flex-col gap-4 px-gutter pt-2">
        {explore.get().query.trim() && <p className="text-small text-text-2">For “{explore.get().query.trim()}”</p>}
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-3 text-small font-semibold">Day</legend>
          <div className="flex flex-wrap gap-2">
            {current.days.map(d => <Chip key={d} selected={draft.days.includes(d)} onSelect={() => setDraft(f => ({ ...f, days: toggle(f.days, d) }))}>{dayLabel(d)}</Chip>)}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-3 text-small font-semibold">Type</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map(([k, label]) => <Chip key={k} selected={draft.types.includes(k)} onSelect={() => setDraft(f => ({ ...f, types: toggle(f.types, k) }))}>{label}</Chip>)}
          </div>
        </fieldset>
        <div className="flex flex-col gap-3">
          <label htmlFor="place" className="text-small font-semibold">Institution</label>
          <input id="place" type="search" value={text} placeholder="e.g. CMU" autoComplete="off"
            onChange={e => {
              setText(e.target.value);
              const first = data ? placeChoices(data.index, e.target.value)[0] ?? null : null;
              setDraft(f => ({ ...f, place: first }));
            }}
            className="min-h-[59px] rounded-row border border-border-strong bg-bg px-4 text-body text-text placeholder:text-text-3" />
          {choices.length > 0 && (
            <div role="radiogroup" aria-label="Institution" className="flex flex-col gap-2">
              {choices.map(c => <ChoiceRow key={c.label} type="radio" name="place" checked={same(draft.place, c)} onChange={() => setDraft(f => ({ ...f, place: c }))}
                label={c.label} hint={c.kind === 'country' ? 'Country · any author affiliation' : 'Any author affiliation'} />)}
            </div>
          )}
          {text.trim() && data && !choices.length && <p className="text-small text-text-2">No institution or country by that name.</p>}
        </div>
      </main>
      <BottomAction label={n == null ? 'Show results' : `Show ${n} result${n === 1 ? '' : 's'}`} onClick={apply} />
    </div>
  );
}
