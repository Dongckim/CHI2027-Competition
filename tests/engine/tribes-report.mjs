// Tribe of every chi2026 talk under the mock rules (paperTribe): count and share per tribe, all talks and Papers only.
// Usage: node tests/engine/tribes-report.mjs   (data/build/chi2026 needed). Flags any tribe above 30%; every talk has a tribe.
import { buildCorpus } from './corpus.mjs';
import { buildIndex, tribesOf } from '../../app/src/engine/mock-core.js';
import { TRIBES } from '../../app/src/arc/tribes.js';

const index = buildIndex(buildCorpus());
const report = (label, papers) => {
  const n = new Map(), steps = new Map();
  for (const p of papers) {
    const { tribe, step } = tribesOf(index).get(p.key);
    n.set(tribe, (n.get(tribe) ?? 0) + 1);
    steps.set(step, (steps.get(step) ?? 0) + 1);
  }
  console.log(`\n${label}: ${papers.length}`);
  for (const id of TRIBES.map(t => t.id)) {
    const c = n.get(id) ?? 0, share = c / papers.length;
    console.log(`${id.padEnd(9)} ${String(c).padStart(5)}  ${(share * 100).toFixed(1).padStart(5)}%${share > 0.3 ? '  ← over 30%' : ''}`);
  }
  const STEP = ['', 'session/topic', 'title', 'abstract keywords', 'closest tribe words', 'largest tribe (no shared word)'];
  console.log('decided by: ' + [...steps].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${STEP[k]} ${v}`).join(' · '));
};
const all = [...index.byKey.values()];
report('all talks', all);
report('Paper', all.filter(p => p.type === 'Paper'));
