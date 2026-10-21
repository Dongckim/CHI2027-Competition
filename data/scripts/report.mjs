// V0 measurements over data/build. Prints JSON; used for docs/validation/V0-data.md.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildEdition, loadEdition, normalizeName } from './build.mjs';

const BUILD = new URL('../build/', import.meta.url);
const load = async (e, f) => JSON.parse(await readFile(new URL(`${e}/${f}.json`, BUILD)));
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);

export function nextAppearance(person, now) {
  return person.appearances.find(a => a.start != null && a.start >= now) ?? null;
}

const localHour = (ms, tz) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(ms));

const curatedNames = new Set(Object.keys(JSON.parse(await readFile(new URL('../curated/institution-abbr.json', import.meta.url))).abbreviations).map(normalizeName));
const editions = (await readdir(BUILD, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
const out = {};
for (const e of editions) {
  const [meta, papers, sessions, people, topics, aliases] = await Promise.all(['meta', 'papers', 'sessions', 'people', 'topics', 'aliases'].map(f => load(e, f)));
  const paperType = papers.filter(p => p.type === 'Paper');
  const sessionsByKey = new Map(sessions.map(s => [s.key, s]));
  const unscheduled = paperType.filter(p => !p.scheduled);
  const noRoom = paperType.filter(p => p.scheduled && p.slots.some(s => s.start != null && !s.roomKey));
  const paperSessions = sessions.filter(s => s.type === 'Paper' && s.kind === 'session');
  const talkSessions = paperSessions.filter(s => s.timing === 'talks');
  const durations = {};
  for (const s of talkSessions) for (const k of s.contentKeys) {
    const sl = papers.find(p => p.key === k)?.slots.find(x => x.sessionKey === s.key);
    if (sl) { const m = (sl.end - sl.start) / 60000; durations[m] = (durations[m] || 0) + 1; }
  }
  const lengths = {};
  for (const s of paperSessions) if (s.start != null) { const m = (s.end - s.start) / 60000; lengths[m] = (lengths[m] || 0) + 1; }
  const sizes = {};
  for (const s of paperSessions) sizes[s.contentKeys.length] = (sizes[s.contentKeys.length] || 0) + 1;

  const authors = people.filter(p => p.contentKeys.length);
  const timed = authors.filter(p => p.appearances.some(a => a.start != null));
  const multi = authors.filter(p => new Set(p.appearances.filter(a => a.start != null).map(a => a.start)).size >= 2);
  const first = sessions.filter(s => s.start != null).map(s => s.start).sort((a, b) => a - b)[0];
  const sample = timed[0];

  const top50 = aliases.institutions.slice(0, 50);
  const withTruth = top50.filter(i => i.abbreviations.curated.length);
  const autoHit = withTruth.filter(i => i.abbreviations.auto.some(a => i.abbreviations.curated.some(c => normalizeName(c) === normalizeName(a))));
  const resolves = withTruth.filter(i => i.abbreviations.curated.every(c => {
    const hit = aliases.lookup[normalizeName(c)];
    return hit && hit.length === 1 && hit[0] === i.key;
  }));
  const ambiguous = Object.entries(aliases.lookup).filter(([, v]) => v.length > 1);

  const topicCovered = new Set(topics.flatMap(t => t.contentKeys));
  const scheduledPapers = paperType.filter(p => p.scheduled);
  const isPoster = t => /poster|late-breaking/i.test(t ?? '');
  const isDemo = t => /demo|interactivity/i.test(t ?? '');
  const kindStats = pred => {
    const items = papers.filter(p => pred(p.type));
    const sch = items.filter(p => p.scheduled);
    const timings = {};
    for (const p of sch) for (const s of p.slots) { const t = sessionsByKey.get(s.sessionKey)?.timing; timings[t] = (timings[t] || 0) + 1; }
    return { types: [...new Set(items.map(p => p.type))], items: items.length, scheduled: sch.length, scheduledPct: pct(sch.length, items.length), slotTiming: timings };
  };
  const starts = sessions.filter(s => s.start != null);
  const daytime = starts.filter(s => { const h = localHour(s.start, meta.timeZone); return h >= 7 && h <= 22; });

  out[e] = {
    revision: meta.revision, publicationVersion: meta.publicationVersion, timeZone: meta.timeZone,
    papers: {
      total: paperType.length, scheduledWithRoom: scheduledPapers.length - noRoom.length, scheduledPct: pct(scheduledPapers.length - noRoom.length, paperType.length),
      unscheduled: unscheduled.length,
      unscheduledIn: [...new Set(unscheduled.flatMap(p => p.slots.map(s => sessionsByKey.get(s.sessionKey)?.name)))].concat(unscheduled.some(p => !p.slots.length) ? ['(no session)'] : []),
    },
    talkTiming: { paperSessions: paperSessions.length, talks: talkSessions.length, block: paperSessions.length - talkSessions.length, sessionLengthMin: lengths, sessionSizes: sizes, talkDurationMin: durations },
    video: { papersWithVideo: paperType.filter(p => p.video).length, pct: pct(paperType.filter(p => p.video).length, paperType.length), scheduledWithVideoPct: pct(scheduledPapers.filter(p => p.video).length, scheduledPapers.length) },
    nextAppearance: {
      authors: authors.length, withTimedAppearance: timed.length, pct: pct(timed.length, authors.length), withTwoOrMore: multi.length, twoOrMorePct: pct(multi.length, authors.length),
      example: sample ? { person: sample.key, now: first, next: nextAppearance(sample, first) } : null,
    },
    institutions: {
      distinct: aliases.institutions.length, top50WithCommonAbbr: withTruth.length,
      autoAcronymHits: autoHit.length, autoAcronymPct: pct(autoHit.length, withTruth.length),
      curatedResolvesUniquely: resolves.length, curatedPct: pct(resolves.length, withTruth.length),
      top50NotReviewed: top50.filter(i => !curatedNames.has(normalizeName(i.name))).map(i => i.name),
      ambiguousAliases: ambiguous.length, ambiguousExamples: ambiguous.slice(0, 5).map(([k, v]) => `${k} → ${v.join(', ')}`),
    },
    topics: {
      chips: topics.length, multiSessionChips: topics.filter(t => t.sessionKeys.length > 1).length,
      scheduledPaperCoveragePct: pct(scheduledPapers.filter(p => topicCovered.has(p.key)).length, scheduledPapers.length),
      examples: topics.slice(0, 5).map(t => t.label),
    },
    posters: kindStats(isPoster), demos: kindStats(isDemo),
    timeZoneSanity: { sessionsWithStart: starts.length, localStart07to22Pct: pct(daytime.length, starts.length) },
  };
}

// Determinism: two in-memory builds of each edition must hash the same.
for (const e of editions) {
  const { feed, opts } = await loadEdition(e);
  const h = () => createHash('sha256').update(JSON.stringify(buildEdition(feed, opts))).digest('hex');
  out[e].deterministic = h() === h();
}
console.log(JSON.stringify(out, null, 2));
