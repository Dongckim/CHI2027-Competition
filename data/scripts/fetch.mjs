// Fetch the current revision of each feed into data/raw/<edition>/rev-NNN.json.
// Revision files are immutable, so an existing file is never re-downloaded.
import { mkdir, writeFile, access } from 'node:fs/promises';

const BASE = 'https://chidigitalexperience.org/data';
const EDITIONS = process.argv.slice(2).length ? process.argv.slice(2) : ['chi2026', 'chi2025', 'chi2024', 'chi2023', 'sandbox'];
const RAW = new URL('../raw/', import.meta.url);

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

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
    const text = await (await fetch(version.revision_url)).text();
    JSON.parse(text); // refuse to store a truncated or HTML response
    await writeFile(file, text);
    console.log(`${edition} rev ${rev}: downloaded ${(text.length / 1e6).toFixed(1)} MB`);
  }
}
