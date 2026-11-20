import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRIBES, tribeOfText, majority } from '../../app/src/arc/tribes.js';

test('tribes: 8, each with its own shape, and the same colour as tokens.css', () => {
  assert.deepEqual(TRIBES.map(t => t.id).sort(), ['access', 'ai', 'design', 'devices', 'health', 'learning', 'society', 'xr']);
  assert.equal(new Set(TRIBES.map(t => t.shape)).size, 8);
  const css = readFileSync(new URL('../../app/src/tokens.css', import.meta.url), 'utf8');
  for (const t of TRIBES) assert.match(css, new RegExp(`--tribe-${t.id}: ${t.color.toLowerCase()};`), t.id);
});

test('tribe keywords: field first, AI last, short words only whole', () => {
  assert.equal(tribeOfText('Blind and Low-Vision Interaction'), 'access');
  assert.equal(tribeOfText('Mental Health Chatbots and Conversational Agents'), 'health');
  assert.equal(tribeOfText('VR AR XR'), 'xr');
  assert.equal(tribeOfText('LLM Interaction & Conversational Agents'), 'ai');
  assert.equal(tribeOfText('Aim of the study'), null); // "ai" is not the start of "aim"
  assert.equal(tribeOfText('Posters (Monday)'), null);
});

test('majority: most votes, ties in TRIBES order, confidence is the share', () => {
  assert.deepEqual(majority(['ai', 'xr', 'xr', null, 'ai']), { tribe: 'xr', confidence: 0.5 });
  assert.equal(majority([null]), null);
});
