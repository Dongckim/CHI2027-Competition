// The on-device engine in a Web Worker, so the 37 MB model's loading and each Arc's reading never block the screen.
// Wonjune's code (recsys/src/web, the same as the package's web/) reads the model from /model/ (dist/model/, put there by
// app/scripts/fetch-model.mjs). Messages: { id, op, args } → { id, ok, value | error }, and { progress } while loading.
import { loadAngles } from '../../../recsys/src/web/load.mjs';
import { Tokenizer } from '../../../recsys/src/web/vendor/tokenizers.min.mjs';
import { toArc, toTopics, toTribe, toNode, angleKey, daysOf, formatsOf, engineNow, idsOf, judgeKeys } from './ondevice-map.js';

let eng = null, ctx = null;
const abstractOf = id => eng.items[eng.pos.get(id)]?.abstract ?? '';

// The engine asks "is this file there?" with HEAD and reads files with plain fetch. Answer HEAD from the model's file
// list (a missing file under /model/ can come back as the app page) and add ?v=<sha> so each release is its own URLs
// (the service worker keeps them for offline). Progress = bytes read so far of the data files the loader reads (the
// top-level .json/.npy, 36 MB), counted as they arrive so a slow big file still moves the number (10 waits on it).
async function modelFetch(base) {
  const manifest = await (await fetch('/model.json')).json();
  const read = name => !name.includes('/') && /\.(json|npy)$/.test(name) && !name.startsWith('example_');
  const total = Object.entries(manifest.files).filter(([n]) => read(n)).reduce((a, [, b]) => a + b, 0);
  let done = 0, told = 0;
  const tell = () => { const r = Math.min(0.99, done / total); if (r - told >= 0.01) { told = r; self.postMessage({ progress: { stage: 'download', ratio: r } }); } };
  const plain = self.fetch.bind(self);
  self.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, self.location.href);
    if (!url.pathname.startsWith(base)) return plain(input, init);
    const name = url.pathname.slice(base.length);
    if (init?.method === 'HEAD') return new Response(null, { status: name in manifest.files ? 200 : 404 });
    url.searchParams.set('v', manifest.sha256.slice(0, 12));
    const res = await plain(url, init);
    if (!res.ok || !res.body) return res;
    const chunks = [], reader = res.body.getReader();
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value); done += value.length; tell();
    }
    return new Response(new Blob(chunks), { status: res.status, headers: res.headers });
  };
  return manifest;
}

const ops = {
  async init({ edition, timeZone }) {
    if (eng) return;
    const manifest = await modelFetch('/model/');
    eng = await loadAngles('/model/', { Tokenizer });
    ctx = { edition, timeZone, version: `${eng.version ?? manifest.sha256.slice(0, 12)}` };
  },
  async tribeOf({ query }) {
    return toTribe(await eng.handle({ screen: 'ask', text: query }));
  },
  // 07b: the engine's sharper questions for a topic and how many talks match it (all days, user 11/21 「N talks」)
  async topic({ topic, now }) {
    const res = await eng.handle({ screen: 'ask', text: topic, now: engineNow(now, ctx.timeZone) });
    return { count: res.matching ?? 0, questions: (res.suggestions ?? []).map(s => s.question) };
  },
  async angleTopics({ query }) {
    return toTopics(await eng.handle({ screen: 'angles', question: query }));
  },
  async buildArc({ query, opts, id, createdAt, now }) {
    const res = await eng.handle({ screen: 'arc', question: query, days: daysOf(opts.days), formats: formatsOf(opts.types), chips: opts.topicIds ?? [], walk: opts.walk ?? [], now: engineNow(now, ctx.timeZone) });
    return toArc(res, query, opts, { id, createdAt, edition: ctx.edition, version: ctx.version, abstractOf });
  },
  // 15 Add / 12b Hold: the "edit" screen's cards carry no quote, so each card's quote comes from the "node" screen
  async suggest({ query, angle, excludeKeys, limit = 5, filters }) {
    // a Challenge whose quote is not a result turns into a Reframe (toNode): not one for this angle then
    return (await cards({ screen: 'edit', question: query, ...scope(filters), nodes: idsOf(excludeKeys, ctx.edition), add: angleKey(angle), k: limit })).filter(n => n.angle === angle);
  },
  async wildcard({ query, excludeKeys, limit = 5, filters }) {
    return cards({ screen: 'edit', question: query, ...scope(filters), nodes: idsOf(excludeKeys, ctx.edition), add: 'reframe', filter: 'wildcard', k: limit });
  },
  judge({ query, keys }) {
    return judgeKeys(eng, query, keys, ctx.edition, abstractOf);
  },
};
// the Arc's days and kinds for the edit screen (none: the whole week, every kind, as before)
const scope = filters => ({ days: daysOf(filters?.days ?? []), formats: formatsOf(filters?.types ?? []) });
async function cards(req) {
  const res = await eng.handle(req);
  const out = [];
  for (const c of res.cards) {
    if (!c.angle) continue; // a search hit "not about your question": no angle to put it under
    const n = await eng.handle({ screen: 'node', question: req.question, id: c.id });
    out.push(toNode({ ...n, angle: c.angle, subtype: c.subtype ?? n.subtype, label: c.label || n.label }, ctx.edition, abstractOf));
  }
  return out;
}

self.onmessage = async ({ data: { id, op, args } }) => {
  try {
    self.postMessage({ id, ok: true, value: await ops[op](args) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message ?? e) });
  }
};
