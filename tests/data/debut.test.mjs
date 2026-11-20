import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debutKeys, earlierEditions } from '../../data/scripts/debut.mjs';

test('debut: same full name or same first initial + last name earlier means not new', () => {
  const earlier = [[{ firstName: 'Ana', lastName: 'Silva' }], [{ firstName: 'J.', lastName: "O'Brien" }]];
  const now = [
    { id: 3, firstName: 'Ana', lastName: 'Silva' },          // same full name
    { id: 1, firstName: 'Ana', lastName: 'SILVA', middleInitial: 'M' }, // A + Silva seen
    { id: 2, firstName: 'James', lastName: "O'Brien" },       // J + O'Brien seen
    { id: 5, firstName: 'Bo', lastName: 'Silva' },            // B + Silva not seen
    { id: 4, firstName: 'Ana', lastName: 'Silvaa' },
    { id: 6, firstName: '', lastName: '' },                   // no name: never shown as new
  ];
  assert.deepEqual(debutKeys('chi2026', now, earlier), ['chi2026:4', 'chi2026:5']);
});

test('debut: compares with the three editions before; none for sandbox', () => {
  assert.deepEqual(earlierEditions('chi2026'), ['chi2023', 'chi2024', 'chi2025']);
  assert.deepEqual(earlierEditions('sandbox'), []);
});
