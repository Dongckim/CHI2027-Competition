// The app's shape of papers and people, from a normalized edition (edition.mjs buildEdition). Pure, so the data build
// (app-data.mjs → schedule.json, people.json) and the phone (a new feed revision, app/src/data/programme.ts) agree.

export const TYPE = { Paper: 'paper', Posters: 'poster', 'Interactive Demos': 'demo' }; // same mapping as RecommendResponse.items[].type

// scheduled and video are what the planner needs on top of the listed fields; authors are person keys.
/** @param {any} p */
export const appPaper = p => ({
  paperKey: p.key, title: p.title, type: TYPE[p.type] ?? 'other', feedType: p.type, scheduled: p.scheduled, video: !!p.video, doi: p.doi ?? null,
  slots: p.slots.map(({ start, end, roomKey, sessionKey }) => ({ start, end, roomKey, sessionKey })),
  authors: p.authors.map(a => a.personKey),
});

// personKey → { name, affiliations }. Affiliations: every distinct one the person is listed with as an author; people
// who only chair use their institution keys (institutions = the alias table's list).
/** @param {{ papers: any[], people: any[], institutions?: { key: string, name: string, country: string | null }[] }} edition */
export function appPeople({ papers, people, institutions = [] }) {
  const inst = new Map(institutions.map(i => [i.key, i]));
  const seen = new Map();
  for (const p of papers) for (const a of p.authors) {
    const list = seen.get(a.personKey) ?? seen.set(a.personKey, new Map()).get(a.personKey);
    for (const f of a.affiliations) list.set(`${f.institutionKey}|${f.institution}|${f.country}`, { institutionKey: f.institutionKey, institution: f.institution, country: f.country });
  }
  const out = {};
  for (const person of people) {
    const affiliations = seen.has(person.key)
      ? [...seen.get(person.key).values()]
      : person.institutionKeys.map(k => inst.get(k)).filter(Boolean).map(i => ({ institutionKey: i.key, institution: i.name, country: i.country }));
    out[person.key] = { name: person.name, affiliations };
  }
  return out;
}

// People after a new revision on the phone: the newer names and new authors, but the deploy's affiliations for people
// it already had. The phone normalizes without the build's ROR cache, so its institution keys are slugs the alias
// table does not know; keeping the deploy's keeps "CMU" finding those people. next = null: nothing newer.
/** @template T @param {Record<string, T & { name: string }>} deploy @param {Record<string, T & { name: string }> | null} next */
export function updatedPeople(deploy, next) {
  if (!next) return deploy;
  const out = { ...deploy };
  for (const [key, p] of Object.entries(next)) out[key] = deploy[key] ? { ...deploy[key], name: p.name } : p;
  return out;
}
