// Deploy build only (npm run build:deploy): the on-device model, served from our own domain at /model/.
// MODEL_URL = the model package (.zip or .tar.gz), MODEL_SHA256 = its sha256 (hex). Not in git (repo cleanup decision).
// No MODEL_URL → skip, and the app runs the mock engine (app/src/engine/index.ts picks mock unless ?engine=ondevice).
// The package must check out against MODEL_SHA256 and hold only plain relative files, or the build stops with the cause.
// Unpacked in Node (fflate for zip and gzip, the tar headers read here), so the build needs no unzip/tar command.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, gunzipSync } from 'fflate';

export const sha256 = buf => createHash('sha256').update(buf).digest('hex');
/** Names that could be written outside the folder (absolute, drive letters, "..") or that are empty. */
export const unsafeNames = names => names.filter(n => !n || n.startsWith('/') || /^[a-zA-Z]:/.test(n) || n.split(/[\\/]/).includes('..'));

/**
 * The files in a tar archive: [{ name, data }]. Regular files only; directories are skipped (made from file paths);
 * links and other entry types stop the build, since a model package has no reason to hold them.
 * ustar names (prefix + name) and GNU long names ('L') are read; pax headers ('x', 'g') are skipped.
 */
export function untar(buf) {
  const files = [];
  const str = (o, n) => { const b = buf.subarray(o, o + n); const z = b.indexOf(0); return new TextDecoder().decode(z < 0 ? b : b.subarray(0, z)); };
  let at = 0, longName = null;
  while (at + 512 <= buf.length) {
    if (buf.subarray(at, at + 512).every(b => b === 0)) break; // end of archive
    const size = parseInt(str(at + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(buf[at + 156] || 48); // '\0' = old-style regular file
    const prefix = str(at + 345, 155);
    let name = longName ?? (prefix ? `${prefix}/${str(at, 100)}` : str(at, 100));
    longName = null;
    const data = buf.subarray(at + 512, at + 512 + size);
    if (type === 'L') longName = str(at + 512, size);
    else if (type === '0' || type === '7') files.push({ name: name.replace(/^\.\//, ''), data });
    else if (type !== '5' && type !== 'x' && type !== 'g') throw new Error(`model: tar entry "${name}" is type ${type} (only files and folders)`);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

// macOS adds "._name" attribute files to tar and a __MACOSX/ folder to zip; they are not part of the model.
const macJunk = name => name.split('/').some(part => part.startsWith('._') || part === '__MACOSX');

/** The files of a .zip (by its "PK" signature) or .tar.gz (by the gzip signature): [{ name, data }]. */
export function unpack(buf) {
  let files;
  if (buf[0] === 0x50 && buf[1] === 0x4b) files = Object.entries(unzipSync(buf)).filter(([n]) => !n.endsWith('/')).map(([name, data]) => ({ name, data }));
  else if (buf[0] === 0x1f && buf[1] === 0x8b) files = untar(gunzipSync(buf));
  else throw new Error('model: the package is neither a .zip nor a .tar.gz');
  return files.filter(f => !macJunk(f.name));
}

async function main() {
  const url = process.env.MODEL_URL?.trim();
  if (!url) { console.log('model: MODEL_URL not set, skipped (the app uses the mock engine)'); return; }
  const want = process.env.MODEL_SHA256?.trim().toLowerCase();
  if (!want || !/^[0-9a-f]{64}$/.test(want)) throw new Error('model: MODEL_SHA256 (64 hex characters) is required with MODEL_URL');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model: ${url} answered HTTP ${res.status}`);
  const pkg = new Uint8Array(await res.arrayBuffer());
  const got = sha256(pkg);
  if (got !== want) throw new Error(`model: sha256 ${got} does not match MODEL_SHA256 ${want}`);
  const files = unpack(pkg);
  const bad = unsafeNames(files.map(f => f.name));
  if (bad.length) throw new Error(`model: package has unsafe paths: ${bad.slice(0, 3).join(', ')}`);
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  if (!existsSync(dist)) throw new Error('model: dist/ missing, run after the app build');
  const out = join(dist, 'model');
  rmSync(out, { recursive: true, force: true });
  for (const f of files) { const to = join(out, f.name); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, f.data); }
  console.log(`model: ${(pkg.length / 1e6).toFixed(1)} MB, ${files.length} files → dist/model/ (sha256 ${got.slice(0, 12)}…)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
