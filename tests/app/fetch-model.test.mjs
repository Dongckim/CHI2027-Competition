import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, unsafeNames } from '../../app/scripts/fetch-model.mjs';

test('model zip: sha256 of the bytes, and no path can leave dist/model', () => {
  assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.deepEqual(unsafeNames(['model/a.onnx', 'tokenizer.json', '../x', '/etc/passwd', 'C:/x', 'a/../../b', '']), ['../x', '/etc/passwd', 'C:/x', 'a/../../b', '']);
});
