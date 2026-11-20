import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, memoryStore, upstashStore, DELETE_AT, TEXT_MAX } from '../../functions/qa.mjs';

const A = 'deviceAAAAAAAAAAAAAAAA', B = 'deviceBBBBBBBBBBBBBBBB', C = 'deviceCCCCCCCCCCCCCCCC', D = 'deviceDDDDDDDDDDDDDDDD';
const call = async (store, method, token, body, query = '', now = Date.UTC(2026, 10, 21, 10)) => {
  const r = await handle(new Request(`http://x/api/qa${query}`, { method, headers: { 'x-arc-device': token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }), {}, store, now);
  return { status: r.status, body: await r.json() };
};
const paper = 'chi2026:222795';

test('qa: ask, list by votes, one vote per device, mine/voted flags, no device data kept', async () => {
  const s = memoryStore();
  const q1 = (await call(s, 'POST', A, { action: 'ask', paper, text: '  Did presence   hold after 20 minutes? ' })).body.question;
  assert.equal(q1.text, 'Did presence hold after 20 minutes?');
  const q2 = (await call(s, 'POST', B, { action: 'ask', paper, text: 'Which factor mattered most?' })).body.question;
  await call(s, 'POST', A, { action: 'vote', id: q2.id });
  await call(s, 'POST', A, { action: 'vote', id: q2.id }); // twice: still one
  await call(s, 'POST', C, { action: 'vote', id: q2.id });
  const list = (await call(s, 'GET', A, null, `?paper=${paper}`)).body.questions;
  assert.deepEqual(list.map(q => [q.text, q.votes, q.mine, q.voted]), [['Which factor mattered most?', 2, false, true], ['Did presence hold after 20 minutes?', 0, true, false]]);
  const stored = JSON.parse(await s.cmd('GET', `qa:q:${q1.id}`));
  assert.deepEqual(Object.keys(stored).sort(), ['authorToken', 'createdAt', 'id', 'paperKey', 'text']);
  assert.notEqual(stored.authorToken, A, 'only a hash of the device token');
});

test('qa: three flags hide, only the asker deletes, limits and checks', async () => {
  const s = memoryStore();
  const q = (await call(s, 'POST', A, { action: 'ask', paper, text: 'q?' })).body.question;
  for (const t of [B, C, D]) await call(s, 'POST', t, { action: 'flag', id: q.id });
  assert.equal((await call(s, 'GET', A, null, `?paper=${paper}`)).body.questions.length, 0, 'hidden after three flags');
  const q2 = (await call(s, 'POST', A, { action: 'ask', paper, text: 'another?' })).body.question;
  assert.equal((await call(s, 'DELETE', B, { id: q2.id })).status, 403);
  assert.equal((await call(s, 'DELETE', A, { id: q2.id })).status, 200);
  assert.equal((await call(s, 'POST', A, { action: 'ask', paper, text: 'x'.repeat(TEXT_MAX + 1) })).status, 400);
  assert.equal((await call(s, 'POST', A, { action: 'ask', paper: 'chi2026:<script>', text: 'q' })).status, 400);
  assert.equal((await call(s, 'GET', 'short', null, `?paper=${paper}`)).status, 400, 'no device token');
  const s2 = memoryStore();
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call(s2, 'POST', A, { action: 'ask', paper, text: `q${i}` })).status);
  assert.deepEqual(codes, [201, 201, 201, 429], 'three a minute');
});

test('qa: Upstash gets plain Redis commands, every key expires on 2027-06-13', async () => {
  const sent = [];
  const store = upstashStore('https://redis.example', 't0ken', async (url, init) => {
    const c = JSON.parse(init.body); sent.push(c);
    assert.equal(init.headers.authorization, 'Bearer t0ken');
    return new Response(JSON.stringify({ result: c[0] === 'INCR' ? 1 : c[0] === 'SMEMBERS' ? [] : c[0] === 'SCARD' ? 0 : 'OK' }));
  });
  await call(store, 'POST', A, { action: 'ask', paper, text: 'q?' });
  const expiring = sent.filter(c => c[0] === 'EXPIREAT');
  assert.ok(expiring.length >= 2 && expiring.every(c => c[2] === DELETE_AT));
  assert.equal(new Date(DELETE_AT * 1000).toISOString(), '2027-06-13T00:00:00.000Z');
});
