import { useEffect, useState } from 'react';
import { loadSchedule, loadPeople, loadTopics, loadInstitutions, type Schedule } from '../data/load';
import { buildSearchIndex, NO_FILTERS } from '../../../data/scripts/search.mjs';
import { localDay } from '../planner/plan.js';
import { addItem } from '../today/edits.js';
import { addDay, updateEdits } from '../state/device.js';
import { useDayPlans } from '../today/useDayPlans';
import { useDevice, update } from '../state/useDevice';
import { isDemo } from '../clock';
import { plannedKeys } from './myday.js';

// Explore (05/04), talk detail (06) and author (07) share: the search index, what is in my day, and + Add.

export type Place = { kind: 'institution'; keys: string[]; label: string } | { kind: 'country'; key: string; label: string };
export type Filters = { days: string[]; types: string[]; place: Place | null };
export type ExploreState = { query: string; tab: 'talks' | 'people' | 'sessions'; filters: Filters; shown: number };

// The search as the person left it, kept in memory while they open a talk, a person or the filters and come back.
let saved: ExploreState = { query: '', tab: 'talks', filters: NO_FILTERS as Filters, shown: 30 };
export const explore = { get: () => saved, set: (s: ExploreState) => { saved = s; } };

type People = Awaited<ReturnType<typeof loadPeople>>;
export type Loaded = { schedule: Schedule; people: People; index: ReturnType<typeof buildSearchIndex> };
let loading: Promise<Loaded> | null = null;
const loadAll = () => (loading ??= (async () => {
  const [schedule, people, topics, aliases] = await Promise.all([loadSchedule(), loadPeople(), loadTopics(), loadInstitutions()]);
  const papers = [...schedule.index.papers.values()];
  const index = buildSearchIndex({ schedule: { meta: schedule.meta, papers, sessions: schedule.sessions }, people, topics, aliases });
  return { schedule, people, index };
})().catch(e => { loading = null; throw e; }));

export function useExploreData() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { loadAll().then(setData, e => setError(String(e.message ?? e))); }, []);
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
