// Normalize data/raw/<edition>/rev-NNN.json (latest revision) into data/build/<edition>/.
// Output is a pure function of the feed + venue + curated files: no clock, sorted by id.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DATA = new URL('../', import.meta.url);
const STOPWORDS = new Set(['of', 'the', 'and', 'at', 'for', 'de', 'in', 'du', 'des', 'la', 'le']);

export const normalizeName = s =>
  s.normalize('NFKC').toLowerCase().replace(/[.,;:()\[\]\-–—'"’/&]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');

const slug = s => normalizeName(s).replace(/ /g, '-');
const byId = (a, b) => a.id - b.id;
const personName = p => [p.firstName, p.middleInitial, p.lastName].filter(Boolean).join(' ').trim();

// "Carnegie Mellon University" -> "CMU"; a short all-caps single word ("KAIST") is its own acronym.
export function autoAcronym(display) {
  const words = normalizeName(display).split(' ').filter(w => w && !STOPWORDS.has(w));
  if (words.length === 1) return /^[A-Z]{2,6}$/.test(display.trim()) ? display.trim() : null;
  return words.length >= 2 ? words.map(w => w[0]).join('').toUpperCase() : null;
}

// Feed epoch ms are venue wall-clock times written as if they were UTC (every edition's sessions start at
// 09:00Z). Convert to the real instant so that comparing with Date.now() and formatting in the venue's
// IANA zone both give the right answer.
const formatters = new Map();
export function wallToInstant(ms, timeZone) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }));
  const offset = t => {
    const p = Object.fromEntries(formatters.get(timeZone).formatToParts(t).map(x => [x.type, x.value]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  };
  return ms - offset(ms - offset(ms));
}

// Talk start = session start + sum of earlier talks' durations, in contentIds order.
// Only when every talk has a duration and they all fit in the session; otherwise the whole block.
export function talkSlots(start, end, durations) {
  if (start == null || end == null || end <= start) return null;
  if (durations.length < 2 || durations.some(d => !(d > 0))) return null;
  if (durations.reduce((a, b) => a + b, 0) * 60000 > end - start) return null;
  let t = start;
  return durations.map(d => [t, (t += d * 60000)]);
}

function buildInstitutions(feed, curated) {
  const byKey = new Map();
  for (const c of feed.contents) for (const a of c.authors || []) for (const f of a.affiliations || []) {
    const raw = f?.institution?.trim();
    if (!raw) continue;
    const k = normalizeName(raw);
    if (!k) continue;
    const inst = byKey.get(k) ?? { norm: k, variants: new Map(), authorCount: 0 };
    inst.variants.set(raw, (inst.variants.get(raw) || 0) + 1);
    inst.authorCount++;
    byKey.set(k, inst);
  }
  const curatedByNorm = new Map(Object.entries(curated).map(([name, abbrs]) => [normalizeName(name), abbrs]));
  // An institution recorded under its abbreviation ("MIT") folds into the curated full name.
  for (const [norm, abbrs] of curatedByNorm) {
    const target = byKey.get(norm);
    if (!target || !abbrs) continue;
    for (const ab of abbrs) {
      const src = byKey.get(normalizeName(ab));
      if (!src || src === target) continue;
      for (const [v, n] of src.variants) target.variants.set(v, (target.variants.get(v) || 0) + n);
      target.authorCount += src.authorCount;
      byKey.set(normalizeName(ab), target);
    }
  }
  const list = [...new Set(byKey.values())].map(inst => {
    const variants = [...inst.variants].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(v => v[0]);
    // Name by the institution's own spelling, not an abbreviation folded into it.
    const name = variants.find(v => normalizeName(v) === inst.norm) ?? variants[0];
    const auto = autoAcronym(name);
    inst.key = `inst:${slug(name)}`;
    return {
      key: inst.key,
      name,
      variants,
      abbreviations: { auto: auto ? [auto] : [], curated: curatedByNorm.get(inst.norm) ?? [] },
      authorCount: inst.authorCount,
    };
  }).sort((a, b) => b.authorCount - a.authorCount || (a.key < b.key ? -1 : 1));

  // A curated abbreviation names exactly one institution; names and auto acronyms may collide.
  const lookup = {};
  const curatedAlias = new Set();
  for (const i of list) for (const a of i.abbreviations.curated) {
    const k = normalizeName(a);
    lookup[k] = [i.key];
    curatedAlias.add(k);
  }
  const add = (alias, key) => {
    const k = normalizeName(alias);
    if (!k || curatedAlias.has(k)) return;
    lookup[k] ??= [];
    if (!lookup[k].includes(key)) lookup[k].push(key);
  };
  for (const i of list) {
    for (const v of i.variants) add(v, i.key);
    for (const a of i.abbreviations.auto) add(a, i.key);
  }
  const keyOfNorm = new Map([...byKey].map(([norm, inst]) => [norm, inst.key]));
  return { list, lookup: Object.fromEntries(Object.entries(lookup).sort(([a], [b]) => (a < b ? -1 : 1))), keyOfNorm };
}

export function buildEdition(feed, { edition, version, timeZone, curated = {} }) {
  const key = id => (id == null ? null : `${edition}:${id}`);
  const types = new Map((feed.contentTypes || []).map(t => [t.id, t]));
  const timeSlots = new Map((feed.timeSlots || []).map(t => [t.id, t]));
  const contents = new Map(feed.contents.map(c => [c.id, c]));
  const floorOf = new Map();
  for (const f of feed.floors || []) for (const r of f.roomIds || []) floorOf.set(r, f.name);

  const rooms = (feed.rooms || []).slice().sort(byId).map(r => ({
    key: key(r.id), id: r.id, name: r.name, floor: floorOf.get(r.id) ?? null, capacity: r.capacity ?? null, setup: r.setup ?? null,
  }));

  const duration = c => c.durationOverride ?? types.get(c.typeId)?.duration ?? null;
  const slotsByContent = new Map();
  const sessionAppearances = [];
  const sessions = [
    ...feed.sessions.map(s => ({ s, kind: 'session', start: timeSlots.get(s.timeSlotId)?.startDate, end: timeSlots.get(s.timeSlotId)?.endDate })),
    ...(feed.events || []).map(s => ({ s, kind: 'event', start: s.startDate, end: s.endDate })),
  ].sort((a, b) => a.s.id - b.s.id).map(({ s, kind, start: wallStart, end: wallEnd }) => {
    const start = wallStart == null ? null : wallToInstant(wallStart, timeZone);
    const end = wallEnd == null ? null : wallToInstant(wallEnd, timeZone);
    const scheduled = start != null && end != null && end > start;
    const ids = (s.contentIds || []).filter(id => contents.has(id));
    const talks = scheduled ? talkSlots(start, end, ids.map(id => duration(contents.get(id)))) : null;
    const timing = !scheduled ? 'none' : talks ? 'talks' : 'block';
    ids.forEach((id, i) => {
      const slot = {
        sessionKey: key(s.id), roomKey: key(s.roomId),
        start: scheduled ? (talks ? talks[i][0] : start) : null,
        end: scheduled ? (talks ? talks[i][1] : end) : null,
        order: talks ? i + 1 : null,
      };
      if (!slotsByContent.has(id)) slotsByContent.set(id, []);
      slotsByContent.get(id).push(slot);
    });
    const chairIds = s.chairIds || s.presenterIds || [];
    for (const p of chairIds) sessionAppearances.push([p, { role: 'chair', sessionKey: key(s.id), contentKey: null, roomKey: key(s.roomId), start: scheduled ? start : null, end: scheduled ? end : null }]);
    return {
      key: key(s.id), id: s.id, kind, name: s.name, type: types.get(s.typeId)?.name ?? null, roomKey: key(s.roomId),
      start: scheduled ? start : null, end: scheduled ? end : null, timing,
      contentKeys: ids.map(key), chairKeys: chairIds.map(key),
    };
  });

  const inst = buildInstitutions(feed, curated);
  const people = new Map(feed.people.map(p => [p.id, p]));
  const appearances = new Map();
  const authored = new Map();
  const institutionsOf = new Map();
  const pushTo = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

  const papers = feed.contents.slice().sort(byId).map(c => {
    const slots = (slotsByContent.get(c.id) || []).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || (a.sessionKey < b.sessionKey ? -1 : 1));
    const authors = (c.authors || []).map(a => {
      const raw = a.affiliations?.find(f => f?.institution?.trim())?.institution?.trim() ?? null;
      const instKey = raw ? inst.keyOfNorm.get(normalizeName(raw)) ?? null : null;
      pushTo(authored, a.personId, key(c.id));
      if (instKey) pushTo(institutionsOf, a.personId, instKey);
      for (const sl of slots) pushTo(appearances, a.personId, { role: 'author', sessionKey: sl.sessionKey, contentKey: key(c.id), roomKey: sl.roomKey, start: sl.start, end: sl.end });
      const p = people.get(a.personId);
      return { personKey: key(a.personId), name: p ? personName(p) : null, institutionKey: instKey, institution: raw };
    });
    const video = Object.values(c.addons || {}).find(a => a?.type === 'video')?.url ?? null;
    return {
      key: key(c.id), id: c.id, type: types.get(c.typeId)?.name ?? null, title: c.title, abstract: c.abstract ?? null,
      authors, doi: c.addons?.doi?.url ?? null, video, award: c.award ?? null,
      scheduled: slots.some(s => s.start != null), slots,
    };
  });
  for (const [p, a] of sessionAppearances) pushTo(appearances, p, a);

  const peopleOut = feed.people.slice().sort(byId).map(p => ({
    key: key(p.id), id: p.id, name: personName(p),
    institutionKeys: [...new Set(institutionsOf.get(p.id) || [])].sort(),
    contentKeys: [...new Set(authored.get(p.id) || [])].sort(),
    appearances: (appearances.get(p.id) || []).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || (a.sessionKey < b.sessionKey ? -1 : 1) || ((a.contentKey ?? '') < (b.contentKey ?? '') ? -1 : 1)),
  }));

  // Topic chips: talk sessions grouped by name with trailing part markers ("I", "B", "2") removed.
  const topicMap = new Map();
  for (const s of sessions.filter(s => s.timing === 'talks')) {
    const label = s.name.replace(/\s*[:\-–]?\s*(?:[IVX]+|[A-D]|\d+)$/, '').trim() || s.name;
    const k = `topic:${slug(label)}`;
    const t = topicMap.get(k) ?? { key: k, label, sessionKeys: [], contentKeys: [] };
    t.sessionKeys.push(s.key);
    t.contentKeys.push(...s.contentKeys);
    topicMap.set(k, t);
  }
  const topics = [...topicMap.values()].sort((a, b) => (a.key < b.key ? -1 : 1));

  const year = feed.conference?.year;
  const meta = {
    edition,
    revision: version.revision,
    generatedAt: version.generated_at,
    publicationVersion: feed.publicationInfo?.version ?? null,
    schemeVersion: feed.schemeVersion,
    timeZone,
    timeBasis: 'All start/end values are real UTC instants (epoch ms), converted from the feed\'s venue wall-clock values with timeZone.',
    licence: feed.cc_licence ?? null,
    attribution: `Programme data © ACM CHI ${year ?? edition}, licensed under CC BY-NC-SA 4.0.`,
    counts: { papers: papers.length, sessions: sessions.length, rooms: rooms.length, people: peopleOut.length, topics: topics.length, institutions: inst.list.length },
  };
  return { meta, papers, sessions, rooms, people: peopleOut, topics, aliases: { institutions: inst.list, lookup: inst.lookup } };
}

const lines = arr => '[\n' + arr.map(x => JSON.stringify(x)).join(',\n') + '\n]\n';

export async function loadEdition(edition) {
  const dir = new URL(`raw/${edition}/`, DATA);
  const rev = (await readdir(dir)).filter(f => /^rev-\d+\.json$/.test(f)).sort().at(-1);
  if (!rev) throw new Error(`no revision for ${edition}`);
  const n = rev.match(/\d+/)[0];
  const feed = JSON.parse(await readFile(new URL(rev, dir)));
  const version = JSON.parse(await readFile(new URL(`version-${n}.json`, dir)));
  const { timeZone } = JSON.parse(await readFile(new URL(`venue/${edition}.json`, DATA)));
  const { abbreviations } = JSON.parse(await readFile(new URL('curated/institution-abbr.json', DATA)));
  return { feed, opts: { edition, version, timeZone, curated: abbreviations } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = (await readdir(new URL('raw/', DATA), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  for (const edition of process.argv.slice(2).length ? process.argv.slice(2) : all) {
    const { feed, opts } = await loadEdition(edition);
    const out = buildEdition(feed, opts);
    const dir = new URL(`build/${edition}/`, DATA);
    await mkdir(dir, { recursive: true });
    for (const [name, value] of Object.entries(out)) {
      await writeFile(new URL(`${name}.json`, dir), Array.isArray(value) ? lines(value) : JSON.stringify(value, null, 2) + '\n');
    }
    console.log(`${edition}: ${JSON.stringify(out.meta.counts)}`);
  }
}
