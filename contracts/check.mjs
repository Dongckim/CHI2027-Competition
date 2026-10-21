// Validate every contracts/<Name>.schema.json and every contracts/examples/<Name>.<label>.json against it.
// Usage: npm run contracts:check
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

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
    const ok = validate(JSON.parse(await readFile(new URL(`examples/${f}`, dir))));
    results.push({ file: `examples/${f}`, ok, errors: ok ? undefined : validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`) });
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await checkContracts(new URL('./', import.meta.url));
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.file}`);
    for (const e of r.errors || []) console.log(`  ${e}`);
  }
  if (!results.length) console.log('no contracts yet');
  process.exit(results.every(r => r.ok) ? 0 : 1);
}
