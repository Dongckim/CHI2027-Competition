// Web Push test (V3, #4): does a notification reach the phone while the app is closed?
// GET → { publicKey } (VAPID, base64url). POST { subscription, delaySeconds } → waits, then sends one push.
// The push has no payload, so no message encryption is needed; the service worker shows a fixed text.
// Stateless and silent like soniox-key.mjs: the subscription comes in the request and is never logged or stored.
// env: { VAPID_JWK } — a P-256 private key as JWK JSON (x, y, d). VAPID_SUBJECT optional (https: or mailto:).

export const MAX_DELAY_S = 60; // the function waits in-process, so keep it short
export const PER_DEVICE_PER_HOUR = 20;
// only real push services, so the server never posts to an address someone made up
const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;

// shortcut: per-process counter like soniox-key.mjs; move to the host's rate limiting with V8 (#9).
const hits = new Map();

export default async function push(request, env, { now = Date.now(), wait = ms => new Promise(r => setTimeout(r, ms)), send = fetch } = {}) {
  if (!env.VAPID_JWK) return json(500, { error: 'server has no VAPID_JWK' });
  const jwk = JSON.parse(env.VAPID_JWK);
  const publicKey = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
  if (request.method === 'GET') return json(200, { publicKey });
  if (request.method !== 'POST') return json(405, { error: 'GET or POST' });

  const body = await request.json().catch(() => null);
  let endpoint;
  try { endpoint = new URL(body?.subscription?.endpoint); } catch { return json(400, { error: 'no subscription endpoint' }); }
  if (endpoint.protocol !== 'https:' || !PUSH_HOSTS.test(endpoint.hostname)) return json(400, { error: 'not a known push service' });
  const delay = Math.min(Math.max(Number(body.delaySeconds) || 0, 0), MAX_DELAY_S);

  const device = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
  const recent = (hits.get(device) || []).filter(t => now - t < 3600_000);
  if (recent.length >= PER_DEVICE_PER_HOUR) return json(429, { error: 'too many test pushes from this device, try again later' });
  hits.set(device, [...recent, now]);

  await wait(delay * 1000);
  const jwt = await vapidJwt(jwk, endpoint.origin, env.VAPID_SUBJECT || 'https://arc-six-rho.vercel.app');
  const res = await send(endpoint.href, {
    method: 'POST',
    headers: { authorization: `vapid t=${jwt}, k=${publicKey}`, ttl: '60', urgency: 'high', 'content-length': '0' },
  });
  // the push service's status only (201 = accepted); its body can echo the endpoint, so it is not passed on
  return json(res.ok ? 200 : 502, { pushStatus: res.status, delaySeconds: delay });
}

// RFC 8292: an ES256 JWT for the push service's origin, signed with the VAPID private key
export async function vapidJwt(jwk, audience, subject, now = Date.now()) {
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = o => b64url(Buffer.from(JSON.stringify(o)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(Buffer.from(sig))}`;
}

const b64url = buf => buf.toString('base64url');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function resetLimits() { hits.clear(); } // tests only
