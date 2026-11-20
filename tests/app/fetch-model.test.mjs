import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, gzipSync, strToU8 } from 'fflate';
import { sha256, unsafeNames, unpack, untar } from '../../app/scripts/fetch-model.mjs';

test('model package: sha256 of the bytes, and no path can leave dist/model', () => {
  assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.deepEqual(unsafeNames(['model/a.onnx', 'tokenizer.json', '../x', '/etc/passwd', 'C:/x', 'a/../../b', '']), ['../x', '/etc/passwd', 'C:/x', 'a/../../b', '']);
});

// A minimal ustar archive: header (name, size in octal, type) + data padded to 512.
const header = (name, size, type = '0') => {
  const h = new Uint8Array(512);
  h.set(strToU8(name), 0);
  h.set(strToU8(size.toString(8).padStart(11, '0')), 124);
  h[156] = type.charCodeAt(0);
  h.set(strToU8('ustar'), 257);
  return h;
};
const tar = entries => {
  const parts = entries.flatMap(([name, text, type]) => {
    const d = strToU8(text ?? '');
    const pad = new Uint8Array((512 - (d.length % 512)) % 512);
    return [header(name, d.length, type), d, pad];
  });
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0) + 1024);
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

test('model package: .zip and .tar.gz give the same files; links are refused', () => {
  const files = { 'model/a.onnx': strToU8('weights'), 'tokenizer.json': strToU8('{}') };
  const z = unpack(zipSync({ ...files, 'model/': new Uint8Array() }));
  assert.deepEqual(z.map(f => [f.name, new TextDecoder().decode(f.data)]).sort(), [['model/a.onnx', 'weights'], ['tokenizer.json', '{}']]);
  const t = unpack(gzipSync(tar([['./model/', '', '5'], ['./model/a.onnx', 'weights'], ['tokenizer.json', '{}']])));
  assert.deepEqual(t.map(f => [f.name, new TextDecoder().decode(f.data)]).sort(), [['model/a.onnx', 'weights'], ['tokenizer.json', '{}']]);
  assert.deepEqual(unpack(gzipSync(tar([['./._tokenizer.json', 'x'], ['tokenizer.json', '{}']]))).map(f => f.name), ['tokenizer.json'], 'macOS ._ files skipped');
  assert.deepEqual(unpack(zipSync({ '__MACOSX/._a': strToU8('x'), a: strToU8('y') })).map(f => f.name), ['a']);
  assert.throws(() => untar(tar([['evil', '', '2']])), /type 2/);
  assert.throws(() => unpack(strToU8('not a package')), /neither/);
});
