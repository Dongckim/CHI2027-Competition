import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toReadKeys, stillOpen, readingTxt, readingBib, bibEscape } from '../../app/src/arc/afterChi.js';
import { addedWords, mineFrom } from '../../app/src/arc/yours.js';
import { isOver } from '../../app/src/arc/period.js';

const arcs = [
  { id: 'a', query: 'A?', nodes: [{ key: 'chi2026:1', angle: 'S' }, { key: 'chi2026:2', angle: 'T' }] },
  { id: 'b', query: 'B?', nodes: [{ key: 'chi2026:2', angle: 'S' }, { key: 'chi2026:3', angle: 'R' }] },
];

test('20b: to read = talks in the Arcs not heard, each once; still open = an Arc with no Challenge', () => {
  assert.deepEqual(toReadKeys(arcs, new Set(['chi2026:1'])), ['chi2026:2', 'chi2026:3']);
  assert.equal(stillOpen(arcs).id, 'b');
  assert.equal(stillOpen([arcs[0]]), null);
});

const items = [
  { key: 'chi2026:1', title: 'Fast & cheap: 100% of {VR}_x', authors: ['Ana Pérez', 'Bo Li'], doi: 'https://doi.org/10.1145/1.2' },
  { key: 'chi2026:2', title: 'No DOI here', authors: [], doi: null },
];

test('20b .txt: title, authors, DOI link (none when the feed has no DOI); one block per talk', () => {
  assert.equal(readingTxt(items), 'Fast & cheap: 100% of {VR}_x\nAna Pérez, Bo Li\nhttps://doi.org/10.1145/1.2\n\n'
    + 'No DOI here\n');
});

test('20b .bib: escapes, bare DOI, empty field when missing, year from the edition', () => {
  assert.equal(bibEscape('a\\b{c}&%$#_~^'), 'a\\textbackslash{}b\\{c\\}\\&\\%\\$\\#\\_\\textasciitilde{}\\textasciicircum{}');
  assert.equal(readingBib(items, 'chi2026'), [
    '@inproceedings{chi2026:1,', '  author = {Ana Pérez and Bo Li},', '  title = {Fast \\& cheap: 100\\% of \\{VR\\}\\_x},', '  doi = {10.1145/1.2},', '  year = {2026}', '}', '',
    '@inproceedings{chi2026:2,', '  author = {},', '  title = {No DOI here},', '  doi = {},', '  year = {2026}', '}', ''].join('\n'));
});

test('19b: the added words are what lies between the common start and end', () => {
  assert.deepEqual(addedWords('Does VR fidelity raise presence?', 'Does VR fidelity raise presence in social VR?'), ['Does VR fidelity raise presence ', 'in social VR', '?']);
  assert.deepEqual(addedWords('same', 'same'), ['same', '', '']);
  assert.deepEqual(addedWords('VR', 'social VR'), ['', 'social', ' VR']);
});

test('19b: my Arc keeps only the given nodes, a new id, source mine, tension from its nodes', () => {
  const theirs = { id: 'x', source: 'received', tension: 'found', query: 'Q?', nodes: [{ key: 'k1', angle: 'T' }, { key: 'k2', angle: 'S' }] };
  const mine = mineFrom(theirs, { nodes: [theirs.nodes[1]], query: 'Q2?', id: 'new-id-0001', createdAt: 5 });
  assert.deepEqual(mine, { id: 'new-id-0001', source: 'mine', tension: 'none', query: 'Q2?', createdAt: 5, nodes: [{ key: 'k2', angle: 'S' }] });
});

test('20: the conference is over after its last venue day', () => {
  const c = { days: ['2026-04-13', '2026-04-17'], timeZone: 'Europe/Madrid' };
  assert.equal(isOver(Date.parse('2026-04-17T23:30+02:00'), c), false);
  assert.equal(isOver(Date.parse('2026-04-18T00:30+02:00'), c), true);
});
