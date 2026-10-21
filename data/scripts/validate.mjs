// Validate each feed in data/raw against the official schema (data/raw/schema-v1.json).
import { readFile, readdir } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const RAW = new URL('../raw/', import.meta.url);
const schema = JSON.parse(await readFile(new URL('schema-v1.json', RAW)));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

let failed = 0;
for (const edition of (await readdir(RAW, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()) {
  const revs = (await readdir(new URL(`${edition}/`, RAW))).filter(f => /^rev-\d+\.json$/.test(f)).sort();
  for (const rev of revs) {
    const feed = JSON.parse(await readFile(new URL(`${edition}/${rev}`, RAW)));
    const ok = validate(feed);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${edition}/${rev}${ok ? '' : ` (${validate.errors.length} errors)`}`);
    for (const e of (validate.errors || []).slice(0, 10)) console.log(`  ${e.instancePath} ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
