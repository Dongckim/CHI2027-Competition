import { useEffect, useMemo, useState } from 'react';
import { loadSchedule, loadPeople, loadTopics, loadInstitutions, type Schedule } from '../data/load';
import { buildSearchIndex, NO_FILTERS } from '../../../data/scripts/search.mjs';
import { localDay } from '../planner/plan.js';
import { addItem } from '../today/edits.js';
import { addDay, updateEdits } from '../state/device.js';
import { useDayPlans } from '../today/useDayPlans';
import { useDevice, update } from '../state/useDevice';
import { isDemo } from '../clock';
import { useProgrammeUpdate } from '../data/programme';
import { plannedKeys } from './myday.js';

// Explore (05/04), talk detail (06) and author (07) share: the search index, what is in my day, and + Add.

export type Place = { kind: 'institution'; keys: string[]; label: string } | { kind: 'country'; key: string; label: string };
export type Filters = { days: string[]; types: string[]; place: Place | null };
export type ExploreState = { query: string; tab: 'talks' | 'people' | 'sessions'; filters: Filters; shown: number };

// The search as the person left it, kept in memory while they open a talk, a person or the filters and come back.
let saved: ExploreState = { query: '', tab: 'talks', filters: NO_FILTERS as Filters, shown: 30 };
export const explore = { get: () => saved, set: (s: ExploreState) => { saved = s; } };

type People = Awaited<ReturnType<typeof loadPeople>>;
type Files = { base: Schedule; people: People; topics: Awaited<ReturnType<typeof loadTopics>>; aliases: Awaited<ReturnType<typeof loadInstitutions>> };
export type Loaded = { schedule: Schedule; people: People; index: ReturnType<typeof buildSearchIndex> };
let loading: Promise<Files> | null = null;
const loadAll = () => (loading ??= Promise.all([loadSchedule(), loadPeople(), loadTopics(), loadInstitutions()])
  .then(([base, people, topics, aliases]) => ({ base, people, topics, aliases }))
  .catch(e => { loading = null; throw e; }));

// One search index per programme: the deploy's, or the newer revision Today watches for (and the sample day's
// simulated change), so Explore, 06 and 07 show the same rooms and times as Today. Rebuilt only when that changes.
const indexes = new WeakMap<Schedule, ReturnType<typeof buildSearchIndex>>();
function indexFor(schedule: Schedule, f: Files) {
  if (!indexes.has(schedule)) {
    const papers = [...schedule.index.papers.values()];
    indexes.set(schedule, buildSearchIndex({ schedule: { meta: schedule.meta, papers, sessions: schedule.sessions }, people: f.people, topics: f.topics, aliases: f.aliases }));
  }
  return indexes.get(schedule)!;
}

export function useExploreData() {
  const [files, setFiles] = useState<Files | null>(null);
  const [error, setError] = useState('');
  const programme = useProgrammeUpdate();
  useEffect(() => { loadAll().then(setFiles, e => setError(String(e.message ?? e))); }, []);
  const data = useMemo<Loaded | null>(() => {
    if (!files) return null;
    const schedule = programme?.schedule ?? files.base;
    return { schedule, people: files.people, index: indexFor(schedule, files) };
  }, [files, programme]);
  return { data, error };
}

// Which talks are in my day, and + Add. A built plan or the sample day: the planned stops, and the edit goes to that
// plan. Just browsing: no plan yet, so Add keeps the talk (and its day) in the plan being made on this phone.
export function useMyDay() {
  const state = useDevice();
  const mode = state.builtAt ? 'plan' : isDemo() ? 'sample' : null;
  const { view, edits, setEdits, response } = useDayPlans(mode ?? 'plan', !!mode);
  const planned = plannedKeys(mode ? view ?? { days: [], chosen: [], plans: [] } : null, edits.added);
  const add = (paperKey: string, start: number, timeZone: string) => {
    const day = localDay(start, timeZone);
    if (mode === 'sample') setEdits(e => addItem(e, paperKey));
    else update(s => addDay(updateEdits(s, (e: Parameters<typeof addItem>[0]) => addItem(e, paperKey)), day));
  };
  return { mode, planned, add, response: mode ? response : null, today: mode === 'sample' ? 'sample' : mode ? 'today' : null };
}
