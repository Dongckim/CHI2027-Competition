// The mock engine corpus from data/build/<edition>/ (node side; the phone builds the same shape from app-data in mock.ts).
import { readFileSync, existsSync } from 'node:fs';

export function buildCorpus(edition = 'chi2026') {
  const dir = new URL(`../../data/build/${edition}/`, import.meta.url);
  if (!existsSync(new URL('papers.json', dir))) return null;
  const read = f => JSON.parse(readFileSync(new URL(f, dir)));
  const meta = read('meta.json');
  const papers = read('papers.json').map(p => ({ key: p.key, title: p.title, abstract: p.abstract ?? '', type: p.type,
    authors: p.authors.map(a => a.personKey), slots: p.slots.map(s => ({ sessionKey: s.sessionKey, start: s.start })) }));
  const debut = existsSync(new URL('debut.json', dir)) ? read('debut.json') : [];
  return { meta, papers, sessions: read('sessions.json').map(s => ({ key: s.key, name: s.name })), topics: read('topics.json'), debut };
}
