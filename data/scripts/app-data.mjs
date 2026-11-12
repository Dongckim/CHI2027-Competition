// App-sized slices of data/build/<edition>/ so the phone downloads only what a screen needs.
// Output: data/build/app-data/<edition>/r<revision>-<hash>/{schedule.json, abstracts/<day>.json, people.json, topics.json, institutions.json}
//         data/build/app-data/<edition>/current.json  → { edition, revision, path, days } (the app bundles it at build time)
// The path changes when the feed revision or any file's content changes, so the files can be cached forever.
import { createHash } from 'node:crypto';
import { localDay } from '../../app/src/planner/plan.js';
import { appPaper, appPeople } from './app-shape.mjs';

// Which abstracts/<day>.json holds a paper: the venue-local day of its first timed slot, else "unscheduled" (remote only).
export function abstractDay(paper, timeZone) {
  const starts = paper.slots.map(s => s.start).filter(s => s != null);
  return starts.length ? localDay(Math.min(...starts), timeZone) : 'unscheduled';
}

export function buildAppData({ meta, papers, sessions, rooms, people, aliases, topics = [] }) {
  const tz = meta.timeZone;
  const schedule = {
    meta: { edition: meta.edition, revision: meta.revision, publicationVersion: meta.publicationVersion, timeZone: tz, attribution: meta.attribution },
    rooms: rooms.map(({ key, name, floor }) => ({ key, name, floor })),
    sessions: sessions.map(({ key, name, start, end, timing }) => ({ key, name, start, end, timing })), // timing: talks | block | none
    papers: papers.map(appPaper),
  };

  const abstracts = {};
  for (const p of papers) (abstracts[abstractDay(p, tz)] ??= {})[p.key] = p.abstract;

  const peopleOut = appPeople({ papers, people, institutions: aliases.institutions });

  // Session topics for the on-device baseline recommender (concepts and topic labels).
  const topicsOut = topics.map(({ key, label, contentKeys }) => ({ key, label, contentKeys }));
  // Explore (04 Institution, "CMU" → Carnegie Mellon): the alias table without the spelling variants the build used.
  const institutionsOut = { institutions: aliases.institutions.map(({ key, name, authorCount }) => ({ key, name, authorCount })), lookup: aliases.lookup ?? {} };
  const files = { 'schedule.json': schedule, 'people.json': peopleOut, 'topics.json': topicsOut, 'institutions.json': institutionsOut };
  for (const day of Object.keys(abstracts).sort()) files[`abstracts/${day}.json`] = abstracts[day];
  const text = Object.fromEntries(Object.entries(files).map(([f, v]) => [f, JSON.stringify(v)]));
  const hash = createHash('sha256');
  for (const f of Object.keys(text).sort()) hash.update(f).update('\0').update(text[f]).update('\0');
  const path = `r${meta.revision}-${hash.digest('hex').slice(0, 8)}/`;
  // Conference days (venue-local), so onboarding can offer and pre-select them before any data file is downloaded.
  const days = [...new Set(sessions.filter(x => x.start != null).map(x => localDay(x.start, tz)))].sort();
  return { path, text, current: { edition: meta.edition, revision: meta.revision, path, days } };
}
