// Fetch the current revision of each feed into data/raw/<edition>/rev-NNN.json.
// Revision files are immutable, so an existing file is never re-downloaded.
import { mkdir, writeFile, access } from 'node:fs/promises';

const BASE = 'https://chidigitalexperience.org/data';
const EDITIONS = process.argv.slice(2).length ? process.argv.slice(2) : ['chi2026', 'chi2025', 'chi2024', 'chi2023', 'sandbox'];
const RAW = new URL('../raw/', import.meta.url);

// Errors name the URL and the reason (HTTP status or network code), so a failed deploy build says why it stopped.
async function getText(url) {
  let res;
  try { res = await fetch(url, { cache: 'no-store' }); }
  catch (e) { throw new Error(`cannot reach ${url} (${e.cause?.code ?? e.message})`); }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}
async function getJson(url) {
  const text = await getText(url);
  try { return JSON.parse(text); } catch { throw new Error(`not JSON from ${url} (starts with ${JSON.stringify(text.slice(0, 40))})`); }
}

try {
  for (const edition of EDITIONS) {
    const version = await getJson(`${BASE}/${edition}/version.json?t=${Date.now()}`);
    const rev = String(version.revision).padStart(3, '0');
    const dir = new URL(`${edition}/`, RAW);
    const file = new URL(`rev-${rev}.json`, dir);
    await mkdir(dir, { recursive: true });
    await writeFile(new URL(`version-${rev}.json`, dir), JSON.stringify(version, null, 2) + '\n');
    try {
      await access(file);
      console.log(`${edition} rev ${rev}: cached`);
    } catch {
      const text = await getText(version.revision_url);
      try { JSON.parse(text); } catch { throw new Error(`revision ${version.revision_url} is not complete JSON (${(text.length / 1e6).toFixed(1)} MB received)`); } // refuse to store a truncated or HTML response
      await writeFile(file, text);
      console.log(`${edition} rev ${rev}: downloaded ${(text.length / 1e6).toFixed(1)} MB`);
    }
  }
} catch (e) {
  console.error(`data:fetch failed: ${e.message}`);
  process.exit(1);
}
