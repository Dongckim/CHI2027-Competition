import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import push, { MAX_DELAY_S, resetLimits, vapidJwt } from '../../functions/push.mjs';

const jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
const env = { VAPID_JWK: JSON.stringify(jwk) };
const sub = endpoint => ({ subscription: { endpoint, keys: {} }, delaySeconds: 999 });
const post = (body, opts) => push(new Request('http://x/api/push', { method: 'POST', body: JSON.stringify(body) }), env, opts);

test('push: GET gives the raw public key; POST waits (capped) then sends a signed empty push', async () => {
  resetLimits();
  const { publicKey } = await (await push(new Request('http://x/api/push'), env)).json();
  assert.equal(Buffer.from(publicKey, 'base64url').length, 65);
  let waited, sent;
  const res = await post(sub('https://web.push.apple.com/abc'), { wait: async ms => (waited = ms), send: async (url, init) => ((sent = { url, init }), new Response(null, { status: 201 })) });
  assert.equal(res.status, 200);
  assert.equal(waited, MAX_DELAY_S * 1000);
  assert.equal(sent.url, 'https://web.push.apple.com/abc');
  assert.match(sent.init.headers.authorization, new RegExp(`^vapid t=.+, k=${publicKey}$`));
});

test('push: JWT is ES256 over the push origin and verifies with the public key', async () => {
  const jwt = await vapidJwt(jwk, 'https://web.push.apple.com', 'https://example.org', 0);
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')), { aud: 'https://web.push.apple.com', exp: 12 * 3600, sub: 'https://example.org' });
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('push: refuses made-up endpoints, missing key, and too many requests', async () => {
  resetLimits();
  const never = { wait: async () => {}, send: async () => { throw new Error('should not send'); } };
  assert.equal((await post(sub('https://evil.example/web.push.apple.com'), never)).status, 400);
  assert.equal((await post(sub('http://fcm.googleapis.com/x'), never)).status, 400);
  assert.equal((await post({}, never)).status, 400);
  assert.equal((await push(new Request('http://x/api/push'), {})).status, 500);
  const ok = { wait: async () => {}, send: async () => new Response(null, { status: 201 }) };
  for (let i = 0; i < 20; i++) assert.equal((await post(sub('https://fcm.googleapis.com/x'), ok)).status, 200);
  assert.equal((await post(sub('https://fcm.googleapis.com/x'), ok)).status, 429);
  resetLimits();
});
