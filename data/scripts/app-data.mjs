// App-sized slices of data/build/<edition>/ so the phone downloads only what a screen needs.
// Output: data/build/app-data/<edition>/r<revision>-<hash>/{schedule.json, abstracts/<day>.json, people.json, topics.json}
//         data/build/app-data/<edition>/current.json  → { edition, revision, path, days } (the app bundles it at build time)
// The path changes when the feed revision or any file's content changes, so the files can be cached forever.
import { createHash } from 'node:crypto';
import { localDay } from '../../app/src/planner/plan.js';

const TYPE = { Paper: 'paper', Posters: 'poster', 'Interactive Demos': 'demo' }; // same mapping as RecommendResponse.items[].type

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
    // scheduled and video are what the planner needs on top of the listed fields.
    papers: papers.map(p => ({
      paperKey: p.key, title: p.title, type: TYPE[p.type] ?? 'other', feedType: p.type, scheduled: p.scheduled, video: !!p.video,
      slots: p.slots.map(({ start, end, roomKey, sessionKey }) => ({ start, end, roomKey, sessionKey })),
      authors: p.authors.map(a => a.personKey),
    })),
  };

  const abstracts = {};
  for (const p of papers) (abstracts[abstractDay(p, tz)] ??= {})[p.key] = p.abstract;

  // Affiliations: every distinct one the person is listed with as an author; people who only chair use their institution keys.
  const inst = new Map(aliases.institutions.map(i => [i.key, i]));
  const seen = new Map();
  for (const p of papers) for (const a of p.authors) {
    const list = seen.get(a.personKey) ?? seen.set(a.personKey, new Map()).get(a.personKey);
    for (const f of a.affiliations) list.set(`${f.institutionKey}|${f.institution}|${f.country}`, { institutionKey: f.institutionKey, institution: f.institution, country: f.country });
  }
  const peopleOut = {};
  for (const person of people) {
    const affiliations = seen.has(person.key)
      ? [...seen.get(person.key).values()]
      : person.institutionKeys.map(k => inst.get(k)).filter(Boolean).map(i => ({ institutionKey: i.key, institution: i.name, country: i.country }));
    peopleOut[person.key] = { name: person.name, affiliations };
  }

  // Session topics for the on-device baseline recommender (concepts and topic labels).
  const topicsOut = topics.map(({ key, label, contentKeys }) => ({ key, label, contentKeys }));
  const files = { 'schedule.json': schedule, 'people.json': peopleOut, 'topics.json': topicsOut };
  for (const day of Object.keys(abstracts).sort()) files[`abstracts/${day}.json`] = abstracts[day];
  const text = Object.fromEntries(Object.entries(files).map(([f, v]) => [f, JSON.stringify(v)]));
  const hash = createHash('sha256');
  for (const f of Object.keys(text).sort()) hash.update(f).update('\0').update(text[f]).update('\0');
  const path = `r${meta.revision}-${hash.digest('hex').slice(0, 8)}/`;
  // Conference days (venue-local), so onboarding can offer and pre-select them before any data file is downloaded.
  const days = [...new Set(sessions.filter(x => x.start != null).map(x => localDay(x.start, tz)))].sort();
  return { path, text, current: { edition: meta.edition, revision: meta.revision, path, days } };
}
