// Arc JSON for a few questions from the mock engine, checked against contracts/Arc.schema.json and its rules.
// Usage: node tests/engine/try.mjs ["question" ...] [--mode none|pending|crowded] [--no-t]   (data/build/chi2026 needed)
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildCorpus } from './corpus.mjs';
import { buildIndex, buildArc, angleTopics } from '../../app/src/engine/mock-core.js';
import { arcRuleErrors } from '../../contracts/check.mjs';

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i < 0 ? null : args.splice(i, n === '--no-t' ? 1 : 2).at(1) ?? true; };
const mode = flag('--mode') ?? 'normal';
const noT = flag('--no-t');
const questions = args.length ? args : ['presence', 'Does VR fidelity raise presence?', 'What is accessibility research asking now?',
  'LLM writing assistants and student learning', 'privacy of smart home devices'];
const corpus = buildCorpus();
if (!corpus) { console.error('data/build/chi2026 not built: npm run data:build chi2026'); process.exit(1); }
const t0 = performance.now();
const index = buildIndex(corpus);
console.error(`index ${Math.round(performance.now() - t0)} ms`);
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(new URL('../../contracts/Arc.schema.json', import.meta.url))));
const papers = new Map(JSON.parse(readFileSync(new URL('../../data/build/chi2026/papers.json', import.meta.url))).map(p => [p.key, p]));
let bad = 0;
for (const [i, q] of questions.entries()) {
  const t = performance.now();
  const arc = buildArc(index, q, { angles: noT ? ['S', 'R'] : ['S', 'R', 'T'], days: [], types: [] }, { id: `try-arc-${i}`, createdAt: 0, mode });
  const ms = Math.round(performance.now() - t);
  const errors = validate(arc) ? arcRuleErrors(arc, papers) : validate.errors.map(e => `${e.instancePath} ${e.message}`);
  bad += !!errors.length;
  const by = a => arc.nodes.filter(n => n.angle === a).length;
  console.error(`${errors.length ? 'FAIL' : 'PASS'} "${q}" → ${arc.tribe} · ↑${by('S')} ↻${by('R')} ⊣${by('T')} · tension ${arc.tension} · evidence ${arc.nodes.filter(n => n.evidence).length}/${arc.nodes.length} · ${ms} ms`);
  for (const e of errors) console.error(`  ${e}`);
  const topics = angleTopics(index, q);
  console.error(`  08 topics ↑${topics.S.length} ↻${topics.R.length} ⊣${topics.T.length}`);
  console.log(JSON.stringify(arc));
}
process.exit(bad ? 1 : 0);
