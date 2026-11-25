import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitLabel } from '../../app/src/arc/label.js';

test('map names cut at whole words, never on a small word, no ellipsis (user 11/25: about 12 characters, 13 fit one line)', () => {
  assert.equal(fitLabel('A Tree’s Perspective', 13), 'A Tree’s');
  assert.equal(fitLabel('Effects of Virtual Reali…', 13), 'Effects');
  assert.equal(fitLabel('Virtual Perspectives', 13), 'Virtual');
  assert.equal(fitLabel('Body Swapping', 13), 'Body Swapping');
  assert.equal(fitLabel('VoiceRay', 13), 'VoiceRay');
  assert.equal(fitLabel('Superconductivity', 13), 'Superconductivity', 'a long first word is kept (the clamp cuts it)');
  assert.equal(fitLabel('Virtual Perspectives', 24), 'Virtual Perspectives');
  assert.equal(fitLabel('Learning, Play and', 13), 'Learning');
  assert.equal(fitLabel('Effects of Virtual Real…', 24), 'Effects of Virtual', 'the cut piece goes');
  assert.equal(fitLabel('Beyond "Being There"', 13), 'Beyond Being', 'no open quote');
  assert.equal(fitLabel('"I store some" photos', 14), '"I store some"', 'a closed quote stays');
});

test('map names: wrapping by measured width', async () => {
  const { wrapsInto } = await import('../../app/src/arc/label.js');
  const m = t => t.length * 10; // 10 px a character
  assert.equal(wrapsInto('Virtual Perspectives', 120, 2, m), true); // "Virtual" / "Perspectives"
  assert.equal(wrapsInto('Virtual Perspectives', 110, 2, m), false); // "Perspectives" alone is 120
  assert.equal(wrapsInto('A Tree’s Perspective', 120, 1, m), false);
  assert.equal(fitLabel('A Tree’s Perspective', t => wrapsInto(t, 120, 1, m)), 'A Tree’s');
});
