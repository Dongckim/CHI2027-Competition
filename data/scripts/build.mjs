// Normalize data/raw/<edition>/rev-NNN.json (latest revision) into data/build/<edition>/.
// Output is a pure function of the feed + venue + curated files: no clock, sorted by id.
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { buildAppData } from './app-data.mjs';
import { fileURLToPath } from 'node:url';

const DATA = new URL('../', import.meta.url);

export { normalizeName, countryName, talkSlots, buildEdition } from './edition.mjs';
export { wallToInstant } from '../../app/src/time.js'; // shared with the app (demo clock)
import { buildEdition } from './edition.mjs';

const lines = arr => '[\n' + arr.map(x => JSON.stringify(x)).join(',\n') + '\n]\n';

export async function loadEdition(edition) {
  const dir = new URL(`raw/${edition}/`, DATA);
  const rev = (await readdir(dir)).filter(f => /^rev-\d+\.json$/.test(f)).sort().at(-1);
  if (!rev) throw new Error(`no revision for ${edition}`);
  const n = rev.match(/\d+/)[0];
  const feed = JSON.parse(await readFile(new URL(rev, dir)));
  const version = JSON.parse(await readFile(new URL(`version-${n}.json`, dir)));
  const { timeZone } = JSON.parse(await readFile(new URL(`venue/${edition}.json`, DATA)));
  const curatedJson = name => readFile(new URL(`curated/${name}`, DATA)).then(JSON.parse, () => ({}));
  const [rorCache, rorOrgs, curated] = await Promise.all(['ror-cache.json', 'ror-orgs.json', 'institutions.json'].map(curatedJson));
  return { feed, opts: { edition, version, timeZone, institutions: { rorCache, rorOrgs, curated } } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = (await readdir(new URL('raw/', DATA), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  for (const edition of process.argv.slice(2).length ? process.argv.slice(2) : all) {
    const { feed, opts } = await loadEdition(edition);
    const out = buildEdition(feed, opts);
    const dir = new URL(`build/${edition}/`, DATA);
    await mkdir(dir, { recursive: true });
    for (const [name, value] of Object.entries(out)) {
      await writeFile(new URL(`${name}.json`, dir), Array.isArray(value) ? lines(value) : JSON.stringify(value, null, 2) + '\n');
    }
    // App slices (data/scripts/app-data.mjs). The edition folder is replaced so only the current revision path remains.
    const app = buildAppData(out);
    const appDir = new URL(`build/app-data/${edition}/`, DATA);
    await rm(appDir, { recursive: true, force: true });
    for (const [file, text] of Object.entries(app.text)) {
      const target = new URL(app.path + file, appDir);
      await mkdir(new URL('./', target), { recursive: true });
      await writeFile(target, text);
    }
    await writeFile(new URL('current.json', appDir), JSON.stringify(app.current, null, 2) + '\n');
    console.log(`${edition}: ${JSON.stringify(out.meta.counts)} · app-data/${edition}/${app.path}`);
  }
}
