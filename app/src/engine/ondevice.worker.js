// The on-device engine in a Web Worker, so the 37 MB model's loading and each Arc's reading never block the screen.
// Wonjune's code (recsys/src/web, the same as the package's web/) reads the model from /model/ (dist/model/, put there by
// app/scripts/fetch-model.mjs). Messages: { id, op, args } → { id, ok, value | error }, and { progress } while loading.
import { loadAngles } from '../../../recsys/src/web/load.mjs';
import { Tokenizer } from '../../../recsys/src/web/vendor/tokenizers.min.mjs';
import { toArc, toTopics, toTribe, toNode, angleKey, daysOf, formatsOf, engineNow, idsOf } from './ondevice-map.js';

let eng = null, ctx = null;
const abstractOf = id => eng.items[eng.pos.get(id)]?.abstract ?? '';

// The engine asks "is this file there?" with HEAD and reads files with plain fetch. Answer HEAD from the model's file
// list (a missing file under /model/ can come back as the app page) and add ?v=<sha> so each release is its own URLs
// (the service worker keeps them for offline). Progress = bytes of the files read so far.
async function modelFetch(base) {
  const manifest = await (await fetch('/model.json')).json();
  const total = Object.values(manifest.files).reduce((a, b) => a + b, 0);
  let done = 0;
  const plain = self.fetch.bind(self);
  self.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, self.location.href);
    if (!url.pathname.startsWith(base)) return plain(input, init);
    const name = url.pathname.slice(base.length);
    if (init?.method === 'HEAD') return new Response(null, { status: name in manifest.files ? 200 : 404 });
    url.searchParams.set('v', manifest.sha256.slice(0, 12));
    const res = await plain(url, init);
    done += manifest.files[name] ?? 0;
    self.postMessage({ progress: { stage: 'download', ratio: Math.min(1, done / total) } });
    return res;
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
  async angleTopics({ query }) {
    return toTopics(await eng.handle({ screen: 'angles', question: query }));
  },
  async buildArc({ query, opts, id, createdAt, now }) {
    const res = await eng.handle({ screen: 'arc', question: query, days: daysOf(opts.days), formats: formatsOf(opts.types), chips: opts.topicIds ?? [], now: engineNow(now, ctx.timeZone) });
    return toArc(res, query, opts, { id, createdAt, edition: ctx.edition, version: ctx.version, abstractOf });
  },
  // 15 Add / 12b Hold: the "edit" screen's cards carry no quote, so each card's quote comes from the "node" screen
  async suggest({ query, angle, excludeKeys, limit = 5 }) {
    return cards({ screen: 'edit', question: query, days: 'week', nodes: idsOf(excludeKeys, ctx.edition), add: angleKey(angle), k: limit });
  },
  async wildcard({ query, excludeKeys, limit = 5 }) {
    return cards({ screen: 'edit', question: query, days: 'week', nodes: idsOf(excludeKeys, ctx.edition), add: 'reframe', filter: 'wildcard', k: limit });
  },
};
async function cards(req) {
  const res = await eng.handle(req);
  const out = [];
  for (const c of res.cards) {
    if (!c.angle) continue; // a search hit "not about your question": no angle to put it under
    const n = await eng.handle({ screen: 'node', question: req.question, id: c.id, angle: c.angle });
    out.push(toNode({ ...n, angle: c.angle, label: c.label || n.label }, ctx.edition, abstractOf));
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
