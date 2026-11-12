import { indexData, venueTravelMinutes } from '../planner/plan.js';

// Programme data from data/build/<edition>/ (same paths in dev and in dist/). Loaded once per session.
export type Paper = { key: string; title: string; type: string };
export type Programme = Awaited<ReturnType<typeof fetchProgramme>>;

const get = async (path: string) => {
  const r = await fetch(`/data/${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};

async function fetchProgramme(edition: string) {
  const [meta, papers, sessions, rooms, venueMap] = await Promise.all([
    ...['meta', 'papers', 'sessions', 'rooms'].map(f => get(`build/${edition}/${f}.json`)),
    get(`venue/${edition}.json`),
  ]);
  const venue = await get(`venue/${venueMap.venue}.json`);
  return { meta, sessions, index: indexData({ meta, papers, sessions, rooms }), travelMinutes: venueTravelMinutes(venue, venueMap) };
}

const cache = new Map<string, ReturnType<typeof fetchProgramme>>();
export const loadProgramme = (edition: string) => {
  if (!cache.has(edition)) cache.set(edition, fetchProgramme(edition).catch(e => { cache.delete(edition); throw e; }));
  return cache.get(edition)!;
};
