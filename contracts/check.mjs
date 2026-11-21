// Validate every contracts/<Name>.schema.json and every contracts/examples/<Name>.<label>.json against it.
// Usage: npm run contracts:check
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { verifiedReasons } from '../app/src/explore/quotes.js';

export async function checkContracts(dir) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const files = await readdir(dir);
  const results = [];
  const validators = new Map();
  for (const f of files.filter(f => f.endsWith('.schema.json')).sort()) {
    const name = f.replace('.schema.json', '');
    try {
      const schema = JSON.parse(await readFile(new URL(f, dir)));
      if (!schema.properties?.schema_version) throw new Error('missing schema_version property');
      validators.set(name, ajv.compile(schema));
      results.push({ file: f, ok: true });
    } catch (e) {
      results.push({ file: f, ok: false, errors: [e.message] });
    }
  }
  const examples = await readdir(new URL('examples/', dir)).catch(() => []);
  for (const f of examples.filter(f => f.endsWith('.json')).sort()) {
    const name = f.split('.')[0];
    const validate = validators.get(name);
    if (!validate) { results.push({ file: `examples/${f}`, ok: false, errors: [`no ${name}.schema.json`] }); continue; }
    const data = JSON.parse(await readFile(new URL(`examples/${f}`, dir)));
    const ok = validate(data);
    let errors = ok ? [] : validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`);
    if (ok && name === 'RecommendResponse') errors = await recommendResponseErrors(data, dir);
    if (ok && name === 'Arc') errors = await withPapers(data.edition, dir, papers => arcRuleErrors(data, papers));
    results.push({ file: `examples/${f}`, ok: !errors.length, errors: errors.length ? errors : undefined });
  }
  return results;
}

// Rules JSON Schema cannot express. Needs data/build/<edition>/papers.json; skipped (with a note) when it is not built.
export function responseRuleErrors(res, papers) {
  const errors = [];
  const sortedUnique = a => a.every((x, i) => i === 0 || a[i - 1] < x);
  const clusterIds = new Set(res.clusters.map(c => c.clusterId));
  res.items.forEach((it, i) => {
    const at = `/items/${i}`;
    const p = papers.get(it.paperKey);
    if (!p) { errors.push(`${at} unknown paperKey ${it.paperKey}`); return; }
    if (p.type !== it.feedType) errors.push(`${at}/feedType "${it.feedType}" but papers.json says "${p.type}"`);
    if (!clusterIds.has(it.clusterId)) errors.push(`${at}/clusterId ${it.clusterId} not in clusters`);
    if (!sortedUnique(it.institutionKeys)) errors.push(`${at}/institutionKeys must be sorted without duplicates`);
    if (!sortedUnique(it.countries)) errors.push(`${at}/countries must be sorted without duplicates`);
    it.reasons.forEach((r, j) => {
      if (p.abstract.slice(r.start, r.end) !== r.quote) errors.push(`${at}/reasons/${j} quote is not abstract.slice(${r.start}, ${r.end})`);
    });
  });
  const { path, via } = res.bridge;
  if (path.length && via.length !== path.length - 1) errors.push(`/bridge via needs ${path.length - 1} entries (one per step), has ${via.length}`);
  for (const k of path) if (!papers.has(k)) errors.push(`/bridge/path unknown paperKey ${k}`);
  return errors;
}

// Arc rules JSON Schema cannot express: real keys of the Arc's edition, each once; evidence is the abstract at its place
// (the same check 06/14 use to show a quote); tension 'found' exactly when there is a T node.
export function arcRuleErrors(arc, papers) {
  const errors = [];
  const seen = new Set();
  arc.nodes.forEach((n, i) => {
    const at = `/nodes/${i}`;
    if (seen.has(n.key)) errors.push(`${at} duplicate key ${n.key}`);
    seen.add(n.key);
    if (!n.key.startsWith(`${arc.edition}:`)) errors.push(`${at} key ${n.key} is not from ${arc.edition}`);
    if (n.kind && n.angle !== 'R') errors.push(`${at}/kind is only for Reframes (angle ${n.angle})`);
    if (n.kind && arc.schema_version === '0.1.0') errors.push(`${at}/kind needs schema_version 0.2.0`);
    const p = papers.get(n.key);
    if (!p) { errors.push(`${at} unknown key ${n.key}`); return; }
    const e = n.evidence;
    if (e && !verifiedReasons([{ quote: e.sentence, start: e.start, end: e.end }], p.abstract).length)
      errors.push(`${at}/evidence is not abstract.slice(${e.start}, ${e.end})`);
  });
  const hasT = arc.nodes.some(n => n.angle === 'T');
  if ((arc.tension === 'found') !== hasT) errors.push(`/tension "${arc.tension}" but ${hasT ? 'there are' : 'there are no'} T nodes`);
  return errors;
}

async function withPapers(edition, dir, rules) {
  const file = new URL(`../data/build/${edition}/papers.json`, dir);
  if (!existsSync(file)) { console.log(`note: data/build/${edition} not built, quote/offset rules skipped`); return []; }
  return rules(new Map(JSON.parse(await readFile(file)).map(p => [p.key, p])));
}

const recommendResponseErrors = (res, dir) => withPapers(res.dataVersion.edition, dir, papers => responseRuleErrors(res, papers));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await checkContracts(new URL('./', import.meta.url));
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.file}`);
    for (const e of r.errors || []) console.log(`  ${e}`);
  }
  if (!results.length) console.log('no contracts yet');
  process.exit(results.every(r => r.ok) ? 0 : 1);
}
