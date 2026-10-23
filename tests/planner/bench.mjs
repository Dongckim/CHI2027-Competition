// V2 timing: planDay per conference day, with top-50 / top-200 recommendations and with every scheduled paper.
// Usage: node tests/planner/bench.mjs [edition...]
import { readFileSync } from 'node:fs';
import { indexData, localDay, planDay } from '../../app/src/planner/plan.js';

const out = {};
for (const edition of process.argv.slice(2).length ? process.argv.slice(2) : ['chi2026', 'chi2025']) {
  const load = f => JSON.parse(readFileSync(new URL(`../../data/build/${edition}/${f}.json`, import.meta.url)));
  const data = { meta: load('meta'), papers: load('papers'), sessions: load('sessions'), rooms: load('rooms') };
  const index = indexData(data);
  const scheduled = data.papers.filter(p => p.scheduled);
  const all = scheduled.map((p, i) => ({ paperKey: p.key, relevance: ((i * 7919) % 1000) / 1000 }));
  const ranked = all.slice().sort((a, b) => b.relevance - a.relevance || (a.paperKey < b.paperKey ? -1 : 1));
  const days = [...new Set(scheduled.flatMap(p => p.slots.filter(s => s.start != null).map(s => localDay(s.start, data.meta.timeZone))))].sort();
  const time = cands => {
    const ms = [];
    for (const day of days) {
      planDay(index, cands, { day }); // warm up
      const t = performance.now();
      for (let k = 0; k < 5; k++) planDay(index, cands, { day });
      ms.push((performance.now() - t) / 5);
    }
    return { maxMs: Math.round(Math.max(...ms) * 10) / 10, meanMs: Math.round((ms.reduce((a, b) => a + b, 0) / ms.length) * 10) / 10 };
  };
  out[edition] = { days: days.length, scheduledPapers: scheduled.length, top50: time(ranked.slice(0, 50)), top200: time(ranked.slice(0, 200)), allPapers: time(all) };
}
console.log(JSON.stringify(out, null, 2));
