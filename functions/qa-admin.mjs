// Q&A store upkeep, run by a person on their machine (not deployed, not an endpoint). It reads the same Upstash env
// names as functions/qa.mjs from the shell or .env.local (git-ignored). Prints counts and key names only, never what
// people wrote.
//   npm run qa:clean -- preview|development     delete that environment's Q&A keys (production is refused)
//   npm run qa:expiry -- production|preview|development   every key must expire: content on 2027-06-13, rate limits sooner
import { DELETE_AT, NAMESPACES, upstashStore } from './qa.mjs';

const RATE_MAX = 2 * 86400; // qa:r:* (per-minute and per-day counters) expire within two days

export async function scanKeys(store, ns) {
  const keys = new Set();
  let cursor = '0';
  do {
    const [next, page] = await store.cmd('SCAN', cursor, 'MATCH', `${ns}:qa:*`, 'COUNT', 500);
    cursor = String(next);
    for (const k of page) keys.add(k);
  } while (cursor !== '0');
  return [...keys].sort();
}

export async function cleanKeys(store, ns) {
  if (ns === 'production') throw new Error('production Q&A is not deleted by hand (every key expires on 2027-06-13)');
  if (!NAMESPACES.includes(ns)) throw new Error(`environment: ${NAMESPACES.filter(n => n !== 'production').join(' or ')}`);
  const keys = await scanKeys(store, ns);
  for (let i = 0; i < keys.length; i += 100) await store.cmd('DEL', ...keys.slice(i, i + 100));
  return keys.length;
}

/** Each key's expiry from TTL: content keys within 5 s of DELETE_AT, rate keys within two days, none without one. */
export async function checkExpiry(store, ns, now = Date.now()) {
  if (!NAMESPACES.includes(ns)) throw new Error(`environment: ${NAMESPACES.join(', ')}`);
  const out = { keys: 0, content: 0, rate: 0, bad: [] };
  for (const key of await scanKeys(store, ns)) {
    const ttl = await store.cmd('TTL', key);
    if (ttl === -2) continue; // gone between SCAN and TTL
    out.keys++;
    const rate = key.startsWith(`${ns}:qa:r:`);
    rate ? out.rate++ : out.content++;
    const ok = ttl > 0 && (rate ? ttl <= RATE_MAX : Math.abs(Math.floor(now / 1000) + ttl - DELETE_AT) <= 5);
    if (!ok) out.bad.push({ key, ttl, expires: ttl > 0 ? new Date((Math.floor(now / 1000) + ttl) * 1000).toISOString() : 'never' });
  }
  return out;
}

async function main([cmd, ns]) {
  if (cmd === 'clean' && ns === 'production') { console.error('production Q&A is not deleted by hand (every key expires on 2027-06-13)'); return 1; }
  try { process.loadEnvFile('.env.local'); } catch {} // optional; the shell's env wins
  const env = process.env;
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { console.error('Upstash env not set (KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN, in the shell or .env.local)'); return 2; }
  const store = upstashStore(url, token);
  if (cmd === 'clean') {
    console.log(`${ns}: deleted ${await cleanKeys(store, ns)} Q&A keys`);
    return 0;
  }
  if (cmd === 'expiry') {
    const r = await checkExpiry(store, ns);
    console.log(`${ns}: ${r.keys} keys (${r.content} questions/votes/flags, ${r.rate} rate limits), ${r.bad.length} without the right expiry`);
    for (const b of r.bad.slice(0, 20)) console.log(`  ${b.key}  ttl ${b.ttl}  → ${b.expires}`);
    if (!r.keys) console.log('  (no keys: post a question on 14 first to check a real one)');
    return r.bad.length ? 1 : 0;
  }
  console.error('usage: qa-admin.mjs clean <preview|development> | expiry <production|preview|development>');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e.message); process.exit(1); });
}
