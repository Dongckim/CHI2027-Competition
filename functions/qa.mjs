// Talk Q&A (14), decision 007: the one place ARC stores what people write. Anonymous questions with their votes and
// flags; no name, e-mail, IP or user agent; nothing logged; every key expires on 2027-06-13 (CHI 2027 + 30 days).
//   GET    /api/qa?paper=<edition:id>        → { questions: [{ id, text, votes, createdAt, mine, voted }] } by votes
//   POST   /api/qa { action: 'ask', paper, text } · { action: 'vote', id } · { action: 'flag', id }
//   DELETE /api/qa { id }                     → only the device that asked (its token's hash)
// The device sends its random token (DeviceState) in X-ARC-Device; only sha256(salt + token) is kept.
// Store: Upstash Redis over REST when KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN are set, else memory
// (one process; questions are lost on restart — fine for dev and the checks, not for the conference).
// Keys start with the Vercel environment (production: / preview: / development:), so one database serves all three and
// test questions from previews can be removed without touching production (functions/qa-admin.mjs).
import { createHash, randomBytes } from 'node:crypto';

export const TEXT_MAX = 280;
export const PER_MINUTE = 3;
export const PER_DAY = 30;
export const HIDE_AT_FLAGS = 3;
// Per client address, in this instance's memory only (never stored, like soniox-key): the device token is made by the
// phone, so a script could make a new one per request (audit 11/27: spam, vote stuffing, hiding any question with three
// made-up tokens). Writes per minute and flags per ten minutes from one address.
export const IP_WRITES_PER_MINUTE = 60, IP_FLAGS_PER_10_MIN = 12; // generous: a venue Wi-Fi puts many phones behind one address
const ipHits = new Map(); // address|kind -> times
function overIp(request, kind, limit, windowMs, now) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || '';
  if (!ip) return false;
  if (ipHits.size > 20_000) ipHits.clear();
  const k = `${ip}|${kind}`, recent = (ipHits.get(k) ?? []).filter(t => now - t < windowMs);
  recent.push(now); ipHits.set(k, recent);
  return recent.length > limit;
}
export const resetIpLimits = () => ipHits.clear(); // tests
export const DELETE_AT = Date.UTC(2027, 5, 13) / 1000; // 2027-06-13 00:00 UTC, as seconds for EXPIREAT
const PAPER = /^(chi\d{4}|sandbox):\d{1,12}$/;
const ID = /^[0-9a-f]{16}$/;
export const NAMESPACES = ['production', 'preview', 'development'];
/** Key prefix from VERCEL_ENV; anything else (local, tests) is development. */
export const namespaceOf = env => (NAMESPACES.includes(env.VERCEL_ENV) ? env.VERCEL_ENV : 'development');
const glob = (pattern, key) => (pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern);

/** Memory store with the few Redis commands Q&A uses (same shapes as Upstash's REST answers). */
export function memoryStore() {
  const kv = new Map(), sets = new Map(), ttl = new Map();
  const live = (k, now) => { const t = ttl.get(k); if (t != null && now() >= t) { kv.delete(k); sets.delete(k); ttl.delete(k); } };
  const now = () => Date.now();
  return {
    async cmd(c, ...a) {
      const [k] = a; if (k != null) live(k, now);
      switch (c) {
        case 'GET': return kv.get(k) ?? null;
        case 'SET': kv.set(k, a[1]); return 'OK';
        case 'DEL': { let n = 0; for (const x of a) { live(x, now); if (kv.delete(x) | sets.delete(x)) n++; ttl.delete(x); } return n; }
        case 'INCR': { const v = Number(kv.get(k) ?? 0) + 1; kv.set(k, String(v)); return v; }
        case 'EXPIRE': ttl.set(k, now() + a[1] * 1000); return 1;
        case 'EXPIREAT': ttl.set(k, a[1] * 1000); return 1;
        case 'TTL': return !kv.has(k) && !sets.has(k) ? -2 : ttl.has(k) ? Math.ceil((ttl.get(k) - now()) / 1000) : -1;
        case 'SCAN': { const m = a.indexOf('MATCH'), p = m >= 0 ? a[m + 1] : '*'; // one page: cursor back to 0
          return ['0', [...new Set([...kv.keys(), ...sets.keys()])].filter(x => { live(x, now); return (kv.has(x) || sets.has(x)) && glob(p, x); })]; }
        case 'SADD': { const s = sets.get(k) ?? sets.set(k, new Set()).get(k); const n = s.has(a[1]) ? 0 : 1; s.add(a[1]); return n; }
        case 'SREM': return sets.get(k)?.delete(a[1]) ? 1 : 0;
        case 'SMEMBERS': return [...(sets.get(k) ?? [])];
        case 'SCARD': return sets.get(k)?.size ?? 0;
        case 'SISMEMBER': return sets.get(k)?.has(a[1]) ? 1 : 0;
        default: throw new Error(`memory store: ${c}`);
      }
    },
  };
}

/** Upstash Redis REST: POST the command as a JSON array, answer in { result }. */
export function upstashStore(url, token, fetcher = fetch) {
  return {
    async cmd(...c) {
      const r = await fetcher(url, { signal: AbortSignal.timeout(4000), method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(c) });
      if (!r.ok) throw new Error(`store ${r.status}`);
      return (await r.json()).result;
    },
  };
}

let memory = null;
export function storeFrom(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? Object.assign(upstashStore(url, token), { kind: 'upstash' }) : (memory ??= Object.assign(memoryStore(), { kind: 'memory' }));
}

// x-arc-qa-store says which store answered (upstash | memory), so a check can tell the deploy is not on memory.
let storeKind = 'memory';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-arc-qa-store': storeKind } });
const hashOf = (salt, token) => createHash('sha256').update(`${salt}:${token}`).digest('hex');

export async function handle(request, env, store, now = Date.now()) {
  const token = request.headers.get('x-arc-device') ?? '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return json(400, { error: 'no device token' });
  const me = hashOf(env.QA_SALT ?? 'arc-qa', token);
  const ns = namespaceOf(env);
  const keep = async k => store.cmd('EXPIREAT', k, DELETE_AT);
  const load = async id => { const v = await store.cmd('GET', `${ns}:qa:q:${id}`); return v ? JSON.parse(v) : null; };

  if (request.method === 'GET') {
    const paper = new URL(request.url).searchParams.get('paper') ?? '';
    if (!PAPER.test(paper)) return json(400, { error: 'paper key like chi2026:222795' });
    const ids = await store.cmd('SMEMBERS', `${ns}:qa:p:${paper}`);
    const out = [];
    for (const id of ids) {
      const q = await load(id);
      if (!q) continue;
      const mine = q.authorToken === me;
      // hidden after three flags, except to its author, who can still delete it (the app promises they can)
      const hidden = await store.cmd('SCARD', `${ns}:qa:f:${id}`) >= HIDE_AT_FLAGS;
      if (hidden && !mine) continue;
      out.push({ id, text: q.text, createdAt: q.createdAt, votes: await store.cmd('SCARD', `${ns}:qa:v:${id}`),
        mine, voted: !!(await store.cmd('SISMEMBER', `${ns}:qa:v:${id}`, me)), ...(hidden ? { hidden: true } : {}) });
    }
    out.sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt);
    return json(200, { questions: out });
  }

  if (overIp(request, 'w', IP_WRITES_PER_MINUTE, 60_000, now)) return json(429, { error: 'too many changes from this network, try again in a minute' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'JSON body' }); }
  if (request.method === 'DELETE') {
    const q = ID.test(body?.id ?? '') ? await load(body.id) : null;
    if (!q) return json(404, { error: 'no such question' });
    if (q.authorToken !== me) return json(403, { error: 'only the device that asked can delete it' });
    for (const k of [`${ns}:qa:q:${body.id}`, `${ns}:qa:v:${body.id}`, `${ns}:qa:f:${body.id}`]) await store.cmd('DEL', k);
    await store.cmd('SREM', `${ns}:qa:p:${q.paperKey}`, body.id);
    return json(200, { deleted: body.id });
  }
  if (request.method !== 'POST') return json(405, { error: 'GET, POST or DELETE' });

  if (body?.action === 'ask') {
    const text = typeof body.text === 'string' ? body.text.trim().replace(/\s+/g, ' ') : '';
    if (!PAPER.test(body.paper ?? '')) return json(400, { error: 'paper key like chi2026:222795' });
    if (!text || text.length > TEXT_MAX) return json(400, { error: `a question of 1–${TEXT_MAX} characters` });
    const minute = await store.cmd('INCR', `${ns}:qa:r:m:${me}:${Math.floor(now / 60000)}`);
    if (minute === 1) await store.cmd('EXPIRE', `${ns}:qa:r:m:${me}:${Math.floor(now / 60000)}`, 120);
    const day = await store.cmd('INCR', `${ns}:qa:r:d:${me}:${Math.floor(now / 86400000)}`);
    if (day === 1) await store.cmd('EXPIRE', `${ns}:qa:r:d:${me}:${Math.floor(now / 86400000)}`, 2 * 86400);
    if (minute > PER_MINUTE || day > PER_DAY) return json(429, { error: 'too many questions from this phone, try again later' });
    const id = randomBytes(8).toString('hex');
    const q = { id, paperKey: body.paper, text, createdAt: now, authorToken: me };
    await store.cmd('SET', `${ns}:qa:q:${id}`, JSON.stringify(q)); await keep(`${ns}:qa:q:${id}`);
    await store.cmd('SADD', `${ns}:qa:p:${body.paper}`, id); await keep(`${ns}:qa:p:${body.paper}`);
    return json(201, { question: { id, text, createdAt: now, votes: 0, mine: true, voted: false } });
  }
  if (body?.action === 'vote' || body?.action === 'flag') {
    if (body.action === 'flag' && overIp(request, 'f', IP_FLAGS_PER_10_MIN, 600_000, now)) return json(429, { error: 'too many reports from this network, try again later' });
    if (!ID.test(body.id ?? '') || !(await load(body.id))) return json(404, { error: 'no such question' });
    const k = `${ns}:qa:${body.action === 'vote' ? 'v' : 'f'}:${body.id}`;
    await store.cmd('SADD', k, me); await keep(k); // once per device: a set of device hashes
    return json(200, { id: body.id, votes: await store.cmd('SCARD', `${ns}:qa:v:${body.id}`) });
  }
  return json(400, { error: 'action ask, vote or flag' });
}

export default async function qa(request, env) {
  const store = storeFrom(env);
  storeKind = store.kind;
  try { return await handle(request, env, store); }
  catch { return json(503, { error: 'questions are not available right now' }); } // no request content in any log
}
