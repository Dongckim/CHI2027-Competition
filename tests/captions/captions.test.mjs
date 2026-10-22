import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CONTEXT_MAX_CHARS, createCaptions, sessionContext, wrap } from '../../app/src/captions/captions.js';
import sonioxKey, { PER_DEVICE_PER_HOUR, resetLimits } from '../../functions/soniox-key.mjs';

const tok = (text, is_final, extra = {}) => ({ text, is_final, ...extra });

test('wrap: at spaces, long words cut', () => {
  assert.deepEqual(wrap('aa bb cc', 5), ['aa bb', 'cc']);
  assert.deepEqual(wrap('abcdefgh', 3), ['abc', 'def', 'gh']);
  assert.deepEqual(wrap('  ', 5), []);
});

test('captions: final appends, non-final replaces, translation apart, control tokens dropped', () => {
  const c = createCaptions({ lines: 3, width: 20 });
  c.update({ tokens: [tok('Hello', true), tok(' every', false)] });
  assert.deepEqual(c.view().original, ['Hello every']);
  c.update({ tokens: [tok(' everyone', false)] });
  assert.deepEqual(c.view().original, ['Hello everyone']);
  c.update({ tokens: [tok(' everyone.', true), tok('<end>', true), tok('안녕하세요', true, { translation_status: 'translation' })] });
  assert.deepEqual(c.view(), { original: ['Hello everyone.'], translation: ['안녕하세요'] });
});

test('captions: a change of speaker starts with a label', () => {
  const c = createCaptions({ lines: 3, width: 60 });
  c.update({ tokens: [tok('Thanks', true, { speaker: '1' }), tok(' for', true, { speaker: '1' })] });
  assert.deepEqual(c.view().original, ['S1: Thanks for']);
  c.update({ tokens: [tok(' Question', false, { speaker: '2' })] });
  assert.deepEqual(c.view().original, ['S1: Thanks for S2: Question']);
  c.update({ tokens: [tok(' Question', true, { speaker: '2' }), tok(' here', true, { speaker: '2' }), tok(' Sure', false, { speaker: '1' })] });
  assert.deepEqual(c.view().original, ['S1: Thanks for S2: Question here S1: Sure']);
  c.clear();
  c.update({ tokens: [tok('Hi', true, { speaker: '2' })] });
  assert.deepEqual(c.view().original, ['S2: Hi']);
});

test('captions: only the last 3 lines are shown and the old text is not kept', () => {
  const c = createCaptions({ lines: 3, width: 10 });
  for (let i = 0; i < 200; i++) c.update({ tokens: [tok(` w${i}`, true)] });
  const v = c.view().original;
  assert.equal(v.length, 3);
  assert.ok(v.at(-1).endsWith('w199'));
  c.clear();
  assert.deepEqual(c.view(), { original: [], translation: [] });
});

const dir = new URL('../../data/build/chi2026/', import.meta.url);
test('session glossary: names and coined words, under the Soniox limit for every talk session', { skip: !existsSync(dir) && 'run npm run data:build first' }, () => {
  const load = f => JSON.parse(readFileSync(new URL(`${f}.json`, dir)));
  const data = { papers: load('papers'), sessions: load('sessions') };
  const talks = data.sessions.filter(s => s.timing === 'talks' && s.contentKeys.length);
  for (const s of talks) assert.ok(JSON.stringify(sessionContext(data, s.key)).length <= CONTEXT_MAX_CHARS, s.key);
  const s = talks.find(t => t.contentKeys.length >= 5);
  const ctx = sessionContext(data, s.key);
  const author = data.papers.find(p => p.key === s.contentKeys[0]).authors[0].name;
  assert.ok(ctx.terms.includes(author));
  assert.deepEqual(ctx.translation_terms.find(t => t.source === author), { source: author, target: author });
  assert.equal(ctx.general.find(g => g.key === 'topic').value, s.name);
  assert.throws(() => sessionContext(data, 'chi2026:0'));
});

test('soniox-key: one-minute single-use key, long key stays server-side, per-device limit', async () => {
  resetLimits();
  const real = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url, init }); return new Response(JSON.stringify({ api_key: 'temp:abc', expires_at: '2026-10-21T00:01:00Z' }), { status: 201 }); };
  try {
    const env = { SONIOX_API_KEY: 'long-lived' };
    const post = (ip = '1.2.3.4') => sonioxKey(new Request('http://x/api/soniox-key', { method: 'POST', headers: { 'x-forwarded-for': ip } }), env);
    const r = await post();
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.apiKey, 'temp:abc');
    assert.ok(!JSON.stringify(body).includes('long-lived'));
    const req = JSON.parse(sent[0].init.body);
    assert.equal(req.usage_type, 'transcribe_websocket');
    assert.equal(req.expires_in_seconds, 60);
    assert.equal(req.single_use, true);
    assert.ok(req.max_session_duration_seconds > 0);
    assert.equal(req.client_reference_id, undefined); // nothing about the device goes to Soniox
    for (let i = 1; i < PER_DEVICE_PER_HOUR; i++) assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 429);
    assert.equal((await post('5.6.7.8')).status, 200);
    assert.equal((await sonioxKey(new Request('http://x', { method: 'GET' }), env)).status, 405);
    assert.equal((await sonioxKey(new Request('http://x', { method: 'POST' }), {})).status, 500);
  } finally {
    globalThis.fetch = real;
    resetLimits();
  }
});
