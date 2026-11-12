import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkContracts } from '../../contracts/check.mjs';

test('contracts check: schemas need schema_version, examples must match their schema', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'contracts-'));
  mkdirSync(join(dir, 'examples'));
  const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['schema_version', 'paperKey'],
    properties: { schema_version: { const: '0.1.0' }, paperKey: { type: 'string', pattern: '^[a-z0-9]+:\\d+$' } } };
  writeFileSync(join(dir, 'Thing.schema.json'), JSON.stringify(schema));
  writeFileSync(join(dir, 'Bad.schema.json'), JSON.stringify({ type: 'object', properties: {} }));
  writeFileSync(join(dir, 'examples', 'Thing.ok.json'), JSON.stringify({ schema_version: '0.1.0', paperKey: 'chi2026:223018' }));
  writeFileSync(join(dir, 'examples', 'Thing.bad-key.json'), JSON.stringify({ schema_version: '0.1.0', paperKey: '223018' }));
  writeFileSync(join(dir, 'examples', 'Orphan.x.json'), '{}');
  const r = Object.fromEntries((await checkContracts(pathToFileURL(dir + '/'))).map(x => [x.file, x.ok]));
  assert.deepEqual(r, { 'Bad.schema.json': false, 'Thing.schema.json': true, 'examples/Orphan.x.json': false, 'examples/Thing.bad-key.json': false, 'examples/Thing.ok.json': true });
});

test('RecommendResponse rules: quote offsets, sorted keys, clusters, bridge steps', async () => {
  const { responseRuleErrors } = await import('../../contracts/check.mjs');
  const papers = new Map([['chi2026:1', { key: 'chi2026:1', type: 'Paper', abstract: 'We study maps. Maps help.' }]]);
  const res = {
    clusters: [{ clusterId: 'c1', label: 'x' }],
    items: [{ paperKey: 'chi2026:1', feedType: 'Paper', clusterId: 'c1', institutionKeys: ['inst:a', 'inst:b'], countries: ['Japan'],
      reasons: [{ conceptId: 'topic:maps', quote: 'Maps help.', start: 15, end: 25 }] }],
    bridge: { path: ['chi2026:1'], via: [] },
  };
  assert.deepEqual(responseRuleErrors(res, papers), []);
  const bad = structuredClone(res);
  Object.assign(bad.items[0], { feedType: 'Posters', clusterId: 'c9', institutionKeys: ['inst:b', 'inst:a'], countries: ['Japan', 'Japan'] });
  bad.items[0].reasons[0].start = 14;
  bad.bridge = { path: ['chi2026:1', 'chi2026:2'], via: [] };
  assert.equal(responseRuleErrors(bad, papers).length, 7);
});
