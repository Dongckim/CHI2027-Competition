// Normalize data/raw/<edition>/rev-NNN.json (latest revision) into data/build/<edition>/.
// Output is a pure function of the feed + venue + curated files: no clock, sorted by id.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DATA = new URL('../', import.meta.url);

export const normalizeName = s =>
  s.normalize('NFKC').toLowerCase().replace(/[.,;:()\[\]\-–—'"’/&]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');

const slug = s => normalizeName(s).replace(/ /g, '-');
const byId = (a, b) => a.id - b.id;
const personName = p => [p.firstName, p.middleInitial, p.lastName].filter(Boolean).join(' ').trim();

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

// Institutions are grouped by ROR id (data/curated/ror-*.json, CC0): every spelling of one organization
// becomes one record under its official ROR name, and searches by acronym, alias or local-language label
// land on it. Names ROR does not match stay as written.
function buildInstitutions(feed, { rorCache = {}, rorOrgs = {}, curated = {} }) {
  const overrides = new Map(Object.entries(curated.ror || {}).map(([n, v]) => [normalizeName(n), v]));
  const rorOf = (raw, country) => {
    const o = overrides.get(normalizeName(raw));
    if (o) return typeof o === 'string' ? o : o[country] ?? null;
    return rorCache[normalizeName(raw)] ?? null;
  };
  const keyOf = (raw, country) => {
    const id = rorOf(raw, country);
    return id ? `inst:ror-${id.split('/').pop()}` : `inst:${slug(raw)}`;
  };

  const groups = new Map();
  for (const c of feed.contents) for (const a of c.authors || []) for (const f of a.affiliations || []) {
    const raw = f?.institution?.trim();
    if (!raw || !normalizeName(raw)) continue;
    const key = keyOf(raw, f.country);
    const g = groups.get(key) ?? { key, rorId: rorOf(raw, f.country), variants: new Map(), authorCount: 0 };
    g.variants.set(raw, (g.variants.get(raw) || 0) + 1);
    g.authorCount++;
    groups.set(key, g);
  }

  // A feed name ROR could not match that is a name of a matched org in this edition ("CMU") folds into it
  // when one candidate clearly has the most authors.
  // shortcut: 3x author-count dominance rule; pin misfires in data/curated/institutions.json instead.
  const extra = new Map(Object.entries(curated.aliases || {}).map(([k, v]) => [k.startsWith('https://ror.org/') ? k : normalizeName(k), v]));
  const byOrgName = new Map();
  for (const g of groups.values()) {
    const org = g.rorId && rorOrgs[g.rorId];
    if (!org) continue;
    for (const n of [org.name, ...org.acronyms, ...org.aliases, ...org.labels, ...(extra.get(g.rorId) || [])]) {
      const k = normalizeName(n);
      if (!byOrgName.has(k)) byOrgName.set(k, new Set());
      byOrgName.get(k).add(g);
    }
  }
  const redirect = new Map();
  for (const g of [...groups.values()].filter(g => !g.rorId)) {
    const cands = [...(byOrgName.get(normalizeName([...g.variants.keys()][0])) || [])].sort((a, b) => b.authorCount - a.authorCount);
    if (!cands.length || (cands[1] && cands[0].authorCount < 3 * cands[1].authorCount)) continue;
    for (const [v, n] of g.variants) cands[0].variants.set(v, (cands[0].variants.get(v) || 0) + n);
    cands[0].authorCount += g.authorCount;
    groups.delete(g.key);
    redirect.set(g.key, cands[0].key);
  }

  const list = [...groups.values()].map(g => {
    const variants = [...g.variants].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(v => v[0]);
    const org = g.rorId ? rorOrgs[g.rorId] : null;
    const curatedAliases = [g.rorId, ...variants.map(normalizeName)].flatMap(k => extra.get(k) || []);
    const aliases = [...new Set([...(org ? [...org.acronyms, ...org.aliases, ...org.labels] : []), ...curatedAliases])];
    return { key: g.key, name: org?.name ?? variants[0], rorId: g.rorId, country: org?.country ?? null, aliases, variants, authorCount: g.authorCount };
  }).sort((a, b) => b.authorCount - a.authorCount || (a.key < b.key ? -1 : 1));

  // Different organizations can share an alias ("UW", "Northeastern University"); lookup keeps them all,
  // most authors first.
  const lookup = {};
  for (const i of list) for (const alias of [i.name, ...i.aliases, ...i.variants]) {
    const k = normalizeName(alias);
    if (!k) continue;
    lookup[k] ??= [];
    if (!lookup[k].includes(i.key)) lookup[k].push(i.key);
  }
  const finalKey = (raw, country) => { const k = keyOf(raw, country); return redirect.get(k) ?? k; };
  return { list, lookup: Object.fromEntries(Object.entries(lookup).sort(([a], [b]) => (a < b ? -1 : 1))), keyOf: finalKey };
}

export function buildEdition(feed, { edition, version, timeZone, institutions = {} }) {
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

  const inst = buildInstitutions(feed, institutions);
  const people = new Map(feed.people.map(p => [p.id, p]));
  const appearances = new Map();
  const authored = new Map();
  const institutionsOf = new Map();
  const pushTo = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

  const papers = feed.contents.slice().sort(byId).map(c => {
    const slots = (slotsByContent.get(c.id) || []).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || (a.sessionKey < b.sessionKey ? -1 : 1));
    const authors = (c.authors || []).map(a => {
      const aff = a.affiliations?.find(f => f?.institution?.trim() && normalizeName(f.institution));
      const raw = aff?.institution.trim() ?? null;
      const instKey = raw ? inst.keyOf(raw, aff.country) : null;
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
  const curatedJson = name => readFile(new URL(`curated/${name}`, DATA)).then(JSON.parse, () => ({}));
  const [rorCache, rorOrgs, curated] = await Promise.all(['ror-cache.json', 'ror-orgs.json', 'institutions.json'].map(curatedJson));
  return { feed, opts: { edition, version, timeZone, institutions: { rorCache, rorOrgs, curated } } };
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
