import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { searchTalks, searchPeople, searchSessions, placeOf, filterCount, hasWords, peopleFilterOnly, NO_FILTERS } from '../../../data/scripts/search.mjs';
import { explore, openFilters, useExploreData, useMyDay, type ExploreState, type Loaded } from '../explore/useExplore';
import { TYPE_TAG, weekdayOf, clockOf, firstSlot } from '../explore/format';
import { go } from '../router';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { Toast, type ToastValue } from '../components/Toast';

// 05 Explore (Figma 292:446) and 05 No results (292:550): search the whole programme, not only recommendations.
// Results are in programme order, grouped by where the words matched; nothing here is ranked for the person.
const TABS = [['talks', 'Talks'], ['people', 'People'], ['sessions', 'Sessions']] as const;
const PAGE = 30;

export function Explore() {
  const [s, setS] = useState<ExploreState>(explore.get);
  useEffect(() => explore.set(s), [s]);
  const { data, error } = useExploreData();
  const myDay = useMyDay(); // planned here, not in the result list, so the first search does not wait for the planner
  const query = useDeferredValue(s.query);
  const filters = s.filters;
  const count = filterCount(filters);
  const results = useMemo(() => {
    if (!data) return null;
    const empty = !hasWords(query) && !count; // "(" or "-" alone is no search
    return {
      talks: empty ? [] : searchTalks(data.index, query, filters),
      people: empty ? [] : searchPeople(data.index, query, filters),
      sessions: empty ? [] : searchSessions(data.index, query, filters),
      place: placeOf(data.index, query),
      empty,
    };
  }, [data, query, filters, count]);
  const peopleOnlyFilters = peopleFilterOnly(query, filters);
  const nothingAnywhere = !!results && !results.empty && !peopleOnlyFilters && !results.talks.length && !results.people.length && !results.sessions.length;
  const set = (change: Partial<ExploreState>) => setS(x => ({ ...x, shown: PAGE, ...change }));

  return (
    <>
      <Header search={false} />
      <div className="flex flex-col gap-4 px-gutter pt-2">
        <div className="flex gap-2">
          <label className="flex min-h-12 flex-1 items-center gap-2 rounded-bar border-[length:var(--card-border)] border-border-strong px-3.5">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-text-2">
              <path d="M13.5 8.25C13.5 11.1495 11.1495 13.5 8.25 13.5C5.35051 13.5 3 11.1495 3 8.25C3 5.35051 5.35051 3 8.25 3C11.1495 3 13.5 5.35051 13.5 8.25Z" /><path d="M15 15L12 12" />
            </svg>
            <input type="search" value={s.query} onChange={e => set({ query: e.target.value })} placeholder="Search talks, people, topics"
              aria-label="Search talks, people, topics" enterKeyHint="search" className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-3" />
          </label>
          <a href="#/explore/filters" onClick={openFilters} className="inline-flex min-h-12 items-center rounded-row border border-text px-4 text-body font-semibold">
            {count ? `Filters · ${count}` : 'Filters'}
          </a>
        </div>
        {/* 05 No results (Figma 292:550): nothing in any tab → no tabs, the empty state in the middle of the screen */}
        {!nothingAnywhere && (
          <div role="group" aria-label="Show" className="flex">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={s.tab === key} onClick={() => set({ tab: key })}
                className={`min-h-touch flex-1 text-small ${s.tab === key ? 'border-b-2 border-text font-semibold text-text' : 'border-b border-border text-text-2'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {error && <p role="alert" className="text-body">Could not load the programme. {error}</p>}
        {!error && !results && <p className="text-body text-text-3">Loading the programme…</p>}
        {results && results.empty && <p className="text-body text-text-2">Type a title, a name, a topic or a place, like CMU.</p>}
        {results && !results.empty && s.tab === 'people' && peopleOnlyFilters ? (
          // Day and type are about talks; people have neither, so this is not "no matches".
          <p className="py-16 text-center text-body text-text-2">{filters.days.length && filters.types.length ? 'Day and type filters' : filters.days.length ? 'Day filters' : 'Type filters'} apply to talks only. Type a name to find people.</p>
        ) : results && !results.empty && (results[s.tab].length === 0 ? (
          <div className={`flex flex-col items-center justify-center gap-3 text-center ${nothingAnywhere ? 'min-h-[55dvh]' : 'py-16'}`}>
            <p className="text-empty-title leading-[1.4] font-semibold">No matches</p>
            {count > 0
              ? <button type="button" onClick={() => set({ filters: NO_FILTERS })} className="min-h-touch px-3 text-link font-semibold underline">Clear filters</button>
              : <p className="text-small text-text-2">Try fewer or shorter words.</p>}
          </div>
        ) : (<>
          {results.place?.kind === 'institution' && !!results.place.others && (
            // "CMU" names more than one institution: say which one the results use, and offer the others in the filter screen.
            <p className="text-small text-text-2">
              {query.trim()} = {results.place.label} ·{' '}
              <a href={`#/explore/filters?place=${encodeURIComponent(query.trim())}`} onClick={openFilters} className="inline-flex min-h-touch items-center font-semibold underline">Other {query.trim()}s</a>
            </p>
          )}
          <p className="text-small text-text-3">
            Not ranked for you · in programme order
            {s.tab !== 'sessions' && results.place && ` · includes people at ${results.place.label}`}
          </p>
          {s.tab === 'talks' && <TalkResults data={data!} myDay={myDay} results={results.talks.slice(0, s.shown)} />}
          {s.tab === 'people' && <PeopleResults data={data!} keys={results.people.slice(0, s.shown)} />}
          {s.tab === 'sessions' && <SessionResults data={data!} sessions={results.sessions.slice(0, s.shown)} />}
          {results[s.tab].length > s.shown && (
            <Button variant="outline" className="self-center" onClick={() => setS(x => ({ ...x, shown: x.shown + PAGE }))}>
              {`Show ${Math.min(PAGE, results[s.tab].length - s.shown)} more`}
            </Button>
          )}
        </>))}
        {data && <p className="pt-2 text-small text-text-3">{data.schedule.meta.attribution}</p>}
      </div>
    </>
  );
}

type Why = { field: 'title' | 'author' | 'topic' | 'place'; text?: string };
const WHY: Record<Why['field'], string> = { title: '', author: 'Author', topic: 'Topic', place: 'At' };

function TalkResults({ data, results, myDay }: { data: Loaded; results: { key: string; why: Why }[]; myDay: ReturnType<typeof useMyDay> }) {
  const { planned, add, today } = myDay;
  const [toast, setToast] = useState<ToastValue>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const tz = data.schedule.meta.timeZone;
  return (
    <>
      <ul className="flex flex-col">
        {results.map(({ key, why }) => {
          const p = data.schedule.index.papers.get(key);
          const slot = firstSlot(p.slots);
          return (
            <li key={key} className="flex items-center gap-3 border-b border-border py-3">
              <a href={`#/talk/${key}`} className="flex flex-1 flex-col gap-0.5">
                <span className="font-mono text-tag font-medium text-text-2">{TYPE_TAG[p.type] ?? 'TALK'} · {slot ? weekdayOf(slot.start, tz) : 'Online'}</span>
                <span className="text-body leading-[22px]">{p.title}</span>
                {why.field !== 'title' && <span className="text-small text-text-3">{WHY[why.field]} {why.text}</span>}
              </a>
              {slot && (planned.has(key)
                ? <span className="inline-flex min-h-touch items-center px-2 text-small text-text-2">Added</span>
                : <Button variant="outline" aria-label={`Add ${p.title}`} onClick={() => {
                  add(key, slot.start, tz);
                  setToast({ text: `Added ${p.title} · ${weekdayOf(slot.start, tz)} ${clockOf(slot.start, tz)}`, action: today ? { label: 'View', run: () => go(today) } : undefined });
                }}>+ Add</Button>)}
            </li>
          );
        })}
      </ul>
      <Toast toast={toast} onClose={closeToast} />
    </>
  );
}

function PeopleResults({ data, keys }: { data: Loaded; keys: string[] }) {
  return (
    <ul className="flex flex-col">
      {keys.map(k => {
        const p = data.people[k];
        const [first, ...more] = p.affiliations;
        return (
          <li key={k} className="border-b border-border">
            <a href={`#/person/${k}`} className="flex min-h-[69px] flex-col justify-center gap-0.5 py-3">
              <span className="text-body leading-[22px]">{p.name}</span>
              {first && <span className="text-small text-text-2">{first.institution} · {first.country}{more.length > 0 && ` · +${more.length}`}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// A session opens in place to its talks (there is no session screen in the design).
function SessionResults({ data, sessions }: { data: Loaded; sessions: { key: string; talks: string[] }[] }) {
  const tz = data.schedule.meta.timeZone;
  return (
    <ul className="flex flex-col">
      {sessions.map(({ key, talks }) => {
        const s = data.schedule.index.sessions.get(key);
        const room = data.schedule.index.rooms.get(data.schedule.index.papers.get(talks[0])?.slots.find((x: { sessionKey: string }) => x.sessionKey === key)?.roomKey)?.name;
        return (
          <li key={key} className="border-b border-border">
            <details>
              <summary className="flex min-h-[69px] cursor-pointer flex-col justify-center gap-0.5 py-3">
                <span className="font-mono text-tag font-medium text-text-2">{s.start != null ? `${weekdayOf(s.start, tz)} · ${clockOf(s.start, tz)}` : 'Online'}{room && ` · ${room}`}</span>
                <span className="text-body leading-[22px]">{s.name}</span>
                <span className="text-small text-text-2">{talks.length} talk{talks.length > 1 ? 's' : ''}</span>
              </summary>
              <ul className="flex flex-col pb-2 pl-3">
                {talks.map(k => <li key={k}><a href={`#/talk/${k}`} className="flex min-h-touch items-center text-small underline">{data.schedule.index.papers.get(k)?.title}</a></li>)}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
