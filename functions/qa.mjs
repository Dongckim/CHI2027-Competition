// Talk Q&A (14), decision 007: the one place ARC stores what people write. Anonymous questions with their votes and
// flags; no name, e-mail, IP or user agent; nothing logged; every key expires on 2027-06-13 (CHI 2027 + 30 days).
//   GET    /api/qa?paper=<edition:id>        → { questions: [{ id, text, votes, createdAt, mine, voted }] } by votes
//   POST   /api/qa { action: 'ask', paper, text } · { action: 'vote', id } · { action: 'flag', id }
//   DELETE /api/qa { id }                     → only the device that asked (its token's hash)
// The device sends its random token (DeviceState) in X-ARC-Device; only sha256(salt + token) is kept.
// Store: Upstash Redis over REST when KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN are set, else memory
// (one process; questions are lost on restart — fine for dev and the checks, not for the conference).
import { createHash, randomBytes } from 'node:crypto';

export const TEXT_MAX = 280;
export const PER_MINUTE = 3;
export const PER_DAY = 30;
export const HIDE_AT_FLAGS = 3;
export const DELETE_AT = Date.UTC(2027, 5, 13) / 1000; // 2027-06-13 00:00 UTC, as seconds for EXPIREAT
const PAPER = /^(chi\d{4}|sandbox):\d{1,12}$/;
const ID = /^[0-9a-f]{16}$/;

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
        case 'DEL': kv.delete(k); sets.delete(k); return 1;
        case 'INCR': { const v = Number(kv.get(k) ?? 0) + 1; kv.set(k, String(v)); return v; }
        case 'EXPIRE': ttl.set(k, now() + a[1] * 1000); return 1;
        case 'EXPIREAT': ttl.set(k, a[1] * 1000); return 1;
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
      const r = await fetcher(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(c) });
      if (!r.ok) throw new Error(`store ${r.status}`);
      return (await r.json()).result;
    },
  };
}

let memory = null;
export function storeFrom(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstashStore(url, token) : (memory ??= memoryStore());
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const hashOf = (salt, token) => createHash('sha256').update(`${salt}:${token}`).digest('hex');

export async function handle(request, env, store, now = Date.now()) {
  const token = request.headers.get('x-arc-device') ?? '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return json(400, { error: 'no device token' });
  const me = hashOf(env.QA_SALT ?? 'arc-qa', token);
  const keep = async k => store.cmd('EXPIREAT', k, DELETE_AT);
  const load = async id => { const v = await store.cmd('GET', `qa:q:${id}`); return v ? JSON.parse(v) : null; };

  if (request.method === 'GET') {
    const paper = new URL(request.url).searchParams.get('paper') ?? '';
    if (!PAPER.test(paper)) return json(400, { error: 'paper key like chi2026:222795' });
    const ids = await store.cmd('SMEMBERS', `qa:p:${paper}`);
    const out = [];
    for (const id of ids) {
      const q = await load(id);
      if (!q) continue;
      if (await store.cmd('SCARD', `qa:f:${id}`) >= HIDE_AT_FLAGS) continue; // hidden after three flags
      out.push({ id, text: q.text, createdAt: q.createdAt, votes: await store.cmd('SCARD', `qa:v:${id}`),
        mine: q.authorToken === me, voted: !!(await store.cmd('SISMEMBER', `qa:v:${id}`, me)) });
    }
    out.sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt);
    return json(200, { questions: out });
  }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'JSON body' }); }
  if (request.method === 'DELETE') {
    const q = ID.test(body?.id ?? '') ? await load(body.id) : null;
    if (!q) return json(404, { error: 'no such question' });
    if (q.authorToken !== me) return json(403, { error: 'only the device that asked can delete it' });
    for (const k of [`qa:q:${body.id}`, `qa:v:${body.id}`, `qa:f:${body.id}`]) await store.cmd('DEL', k);
    await store.cmd('SREM', `qa:p:${q.paperKey}`, body.id);
    return json(200, { deleted: body.id });
  }
  if (request.method !== 'POST') return json(405, { error: 'GET, POST or DELETE' });

  if (body?.action === 'ask') {
    const text = typeof body.text === 'string' ? body.text.trim().replace(/\s+/g, ' ') : '';
    if (!PAPER.test(body.paper ?? '')) return json(400, { error: 'paper key like chi2026:222795' });
    if (!text || text.length > TEXT_MAX) return json(400, { error: `a question of 1–${TEXT_MAX} characters` });
    const minute = await store.cmd('INCR', `qa:r:m:${me}:${Math.floor(now / 60000)}`);
    if (minute === 1) await store.cmd('EXPIRE', `qa:r:m:${me}:${Math.floor(now / 60000)}`, 120);
    const day = await store.cmd('INCR', `qa:r:d:${me}:${Math.floor(now / 86400000)}`);
    if (day === 1) await store.cmd('EXPIRE', `qa:r:d:${me}:${Math.floor(now / 86400000)}`, 2 * 86400);
    if (minute > PER_MINUTE || day > PER_DAY) return json(429, { error: 'too many questions from this phone, try again later' });
    const id = randomBytes(8).toString('hex');
    const q = { id, paperKey: body.paper, text, createdAt: now, authorToken: me };
    await store.cmd('SET', `qa:q:${id}`, JSON.stringify(q)); await keep(`qa:q:${id}`);
    await store.cmd('SADD', `qa:p:${body.paper}`, id); await keep(`qa:p:${body.paper}`);
    return json(201, { question: { id, text, createdAt: now, votes: 0, mine: true, voted: false } });
  }
  if (body?.action === 'vote' || body?.action === 'flag') {
    if (!ID.test(body.id ?? '') || !(await load(body.id))) return json(404, { error: 'no such question' });
    const k = `qa:${body.action === 'vote' ? 'v' : 'f'}:${body.id}`;
    await store.cmd('SADD', k, me); await keep(k); // once per device: a set of device hashes
    return json(200, { id: body.id, votes: await store.cmd('SCARD', `qa:v:${body.id}`) });
  }
  return json(400, { error: 'action ask, vote or flag' });
}

export default async function qa(request, env) {
  try { return await handle(request, env, storeFrom(env)); }
  catch { return json(503, { error: 'questions are not available right now' }); } // no request content in any log
}
