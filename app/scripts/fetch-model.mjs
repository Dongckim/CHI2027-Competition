// Deploy build only (npm run build:deploy): the on-device model, served from our own domain at /model/.
// MODEL_URL = the model zip (Wonjune's package), MODEL_SHA256 = its sha256 (hex). Not in git (decision: repo cleanup).
// No MODEL_URL → skip, and the app runs the mock engine (app/src/engine/index.ts picks mock unless ?engine=ondevice).
// The zip must check out against MODEL_SHA256 and hold only plain relative paths, or the build stops with the cause.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sha256 = buf => createHash('sha256').update(buf).digest('hex');
/** Names that unzip could write outside the folder (absolute, drive letters, "..") or that are empty. */
export const unsafeNames = names => names.filter(n => !n || n.startsWith('/') || /^[a-zA-Z]:/.test(n) || n.split(/[\\/]/).includes('..'));

async function main() {
  const url = process.env.MODEL_URL?.trim();
  if (!url) { console.log('model: MODEL_URL not set, skipped (the app uses the mock engine)'); return; }
  const want = process.env.MODEL_SHA256?.trim().toLowerCase();
  if (!want || !/^[0-9a-f]{64}$/.test(want)) throw new Error('model: MODEL_SHA256 (64 hex characters) is required with MODEL_URL');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model: ${url} answered HTTP ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  const got = sha256(zip);
  if (got !== want) throw new Error(`model: sha256 ${got} does not match MODEL_SHA256 ${want}`);
  const file = join(tmpdir(), `arc-model-${got.slice(0, 12)}.zip`);
  writeFileSync(file, zip);
  try {
    let names;
    try { names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).split('\n').filter(Boolean); }
    catch (e) { throw new Error(`model: could not list the zip with unzip (${e.message.split('\n')[0]})`); }
    const bad = unsafeNames(names);
    if (bad.length) throw new Error(`model: zip has unsafe paths: ${bad.slice(0, 3).join(', ')}`);
    const out = fileURLToPath(new URL('../../dist/model/', import.meta.url));
    if (!existsSync(fileURLToPath(new URL('../../dist/', import.meta.url)))) throw new Error('model: dist/ missing, run after the app build');
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    execFileSync('unzip', ['-q', '-o', file, '-d', out]);
    console.log(`model: ${(zip.length / 1e6).toFixed(1)} MB, ${names.length} files → dist/model/ (sha256 ${got.slice(0, 12)}…)`);
  } finally { rmSync(file, { force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
