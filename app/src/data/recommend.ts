import current from '../../../data/build/app-data/chi2026/current.json';
import type { response as Example } from './fake-recommend';
import { loadSchedule, loadAbstracts, loadPeople } from './load';

export type RecommendResponse = typeof Example;
export type RecommendRequest = { schema_version: '0.1.0'; edition: string; query: string };

// The one place that turns a research sentence into recommendations.
// TODO(recsys): when Wonjune's API is ready, send the RecommendRequest to it here (POST /api/recommend, no logging)
// and return its RecommendResponse. Until then the baseline-0 model runs on the phone over the app data.
export async function recommend(request: RecommendRequest): Promise<RecommendResponse> {
  const [{ buildIndex, recommend: baseline }, corpus] = await Promise.all([import('../recommend/baseline.js'), corpusOnce()]);
  index ??= buildIndex(corpus);
  return baseline(request.query, index) as RecommendResponse;
}

let index: unknown = null;
let corpusPromise: Promise<Parameters<typeof import('../recommend/baseline.js').buildIndex>[0]> | null = null;
// Titles and types from schedule.json, abstracts from every day file, affiliations from people.json, session topics.
function corpusOnce() {
  return (corpusPromise ??= (async () => {
    const [schedule, people, topics, ...days] = await Promise.all([
      loadSchedule(), loadPeople(), fetch(`/app-data/${current.edition}/${current.path}topics.json`).then(r => { if (!r.ok) throw new Error(`topics.json: HTTP ${r.status}`); return r.json(); }),
      ...[...current.days, 'unscheduled'].map(d => loadAbstracts(d)),
    ]);
    const abstracts: Record<string, string> = Object.assign({}, ...days);
    const papers = [...schedule.index.papers.values()].map((p: { paperKey: string; title: string; feedType: string; authors: string[] }) => ({
      key: p.paperKey, title: p.title, type: p.feedType, abstract: abstracts[p.paperKey] ?? '',
      authors: p.authors.map(k => ({ personKey: k, affiliations: people[k]?.affiliations ?? [] })),
    }));
    return { meta: schedule.meta, papers, topics };
  })().catch(e => { corpusPromise = null; throw e; }));
}
