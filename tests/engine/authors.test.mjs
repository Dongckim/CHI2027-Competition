import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, findAuthors } from '../../app/src/arc/authors.js';

const A = (name, n = 1) => ({ key: name, name, institution: 'X', papers: Array.from({ length: n }, (_, i) => `p${i}`) });
test('07p: names match word starts, accents off, whole names first, at least 2 letters', () => {
  const all = [A('Jiwoo Han'), A('Jiwoo Hwang', 2), A('Han Jiwoo'), A('Lena Müller'), A('Jiwon Kim')];
  assert.deepEqual(fold('Müller-Lüdenscheidt'), ['muller', 'ludenscheidt']);
  assert.deepEqual(findAuthors('Jiwoo H', all).hits.map(a => a.name), ['Han Jiwoo', 'Jiwoo Han', 'Jiwoo Hwang']);
  assert.deepEqual(findAuthors('jiwoo han', all).hits.map(a => a.name), ['Jiwoo Han', 'Han Jiwoo'], 'the name as typed first');
  assert.deepEqual(findAuthors('muller', all).hits.map(a => a.name), ['Lena Müller']);
  assert.deepEqual(findAuthors('j', all), { hits: [], more: 0 });
  assert.equal(findAuthors('ji', all, 2).more, 2);
});
