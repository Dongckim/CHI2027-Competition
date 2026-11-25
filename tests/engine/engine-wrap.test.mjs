import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 11/25: #98 gave suggest and wildcard the Arc's filters, but both wrappers in engine/index.ts called on without them, so
// swap, add and 24b still offered other days and kinds. Every wrapper must pass on every argument.
test('engine wrappers pass every argument on (suggest and wildcard carry the Arc filters)', () => {
  const src = readFileSync(new URL('../../app/src/engine/index.ts', import.meta.url), 'utf8');
  for (const m of src.matchAll(/(\w+): \(([^)]*)\) => (?:get|pick)\(\)\.then\(e => e\.(\w+)\(([^)]*)\)\)/g)) {
    assert.equal(m[1], m[3], `${m[1]} calls ${m[3]}`);
    assert.equal(m[4], m[2], `${m[1]}(${m[2]}) passes on (${m[4]})`);
  }
  assert.match(src, /suggest: \(q, a, x, l, f\)/);
});
