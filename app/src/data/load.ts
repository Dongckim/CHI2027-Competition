import current from '../../../data/build/app-data/chi2026/current.json';
import { indexData, venueTravelMinutes } from '../planner/plan.js';
import { sessionSlotsFrom } from '../today/card.js';

// App data from data/build/app-data/<edition>/<path>/ (data/scripts/app-data.mjs). The path is bundled at build time,
// so a deploy and its data always match, and each file is downloaded once per screen that needs it.
export const EDITION = current.edition;
const base = `/app-data/${current.edition}/${current.path}`;

const get = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};
const once = <T,>(load: () => Promise<T>) => {
  let p: Promise<T> | null = null;
  return () => (p ??= load().catch(e => { p = null; throw e; }));
};
const onceBy = <T,>(load: (k: string) => Promise<T>) => {
  const m = new Map<string, () => Promise<T>>();
  return (k: string) => (m.get(k) ?? m.set(k, once(() => load(k))).get(k)!)();
};

// Today: schedule.json + the venue walking graph. Nothing else.
export const loadSchedule = once(async () => {
  const [schedule, venueMap] = await Promise.all([get(`${base}schedule.json`), get(`/data/venue/${EDITION}.json`)]);
  const venue = await get(`/data/venue/${venueMap.venue}.json`);
  const papers = schedule.papers.map((p: { paperKey: string }) => ({ ...p, key: p.paperKey })); // the planner keys papers by `key`
  const { meta, sessions, rooms } = schedule;
  return {
    meta, sessions, index: indexData({ meta, papers, sessions, rooms }), travelMinutes: venueTravelMinutes(venue, venueMap),
    sessionSlots: sessionSlotsFrom(papers), timing: new Map<string, string>(sessions.map((x: { key: string; timing: string }) => [x.key, x.timing])),
  };
});
export type Schedule = Awaited<ReturnType<typeof loadSchedule>>;

// Detail screen (06): abstracts for one day file. Use abstractDay() from data/scripts/app-data.mjs to pick the file.
export const loadAbstracts = onceBy<Record<string, string>>(day => get(`${base}abstracts/${day}.json`));

// Authors and search (07): personKey → { name, affiliations[] }.
export const loadPeople = once<Record<string, { name: string; affiliations: { institutionKey: string; institution: string; country: string }[] }>>(
  () => get(`${base}people.json`));
