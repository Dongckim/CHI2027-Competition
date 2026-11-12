// Run the baseline recommender on data/build/<edition> from the command line.
// Usage: node tests/recommend/baseline.mjs "<research sentence>" [--out contracts/examples/RecommendResponse.<label>.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildIndex, recommend } from '../../app/src/recommend/baseline.js';

export function corpusFrom(edition = 'chi2026') {
  const read = f => JSON.parse(readFileSync(new URL(`../../data/build/${edition}/${f}.json`, import.meta.url)));
  return { meta: read('meta'), papers: read('papers'), topics: read('topics') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [query, flag, out] = process.argv.slice(2);
  if (!query) { console.error('usage: node tests/recommend/baseline.mjs "<sentence>" [--out file]'); process.exit(1); }
  const t = performance.now();
  const res = recommend(query, buildIndex(corpusFrom()));
  const ms = Math.round(performance.now() - t);
  if (flag === '--out') writeFileSync(out, JSON.stringify(res, null, 2) + '\n');
  console.log(`${res.items.length} items of ${res.totalMatches} matches in ${ms} ms · topics: ${res.topics.map(t => t.label).join(' · ')}`);
  for (const i of res.items.slice(0, 5)) console.log(`  ${i.relevance.toFixed(2)} ${i.band.padEnd(8)} ${i.type.padEnd(6)} ${i.paperKey}  “${i.reasons[0]?.quote.slice(0, 70) ?? '-'}…”`);
}
