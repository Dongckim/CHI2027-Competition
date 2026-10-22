import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CONTEXT_MAX_CHARS, KEEP_CHARS, createCaptions, createConversation, sessionContext } from '../../app/src/captions/captions.js';
import sonioxKey, { PER_DEVICE_PER_HOUR, resetLimits } from '../../functions/soniox-key.mjs';

const tok = (text, is_final, extra = {}) => ({ text, is_final, ...extra });

test('captions: final appends, non-final replaces, translation apart, control tokens dropped', () => {
  const c = createCaptions();
  c.update({ tokens: [tok('Hello', true), tok(' every', false)] });
  assert.deepEqual(c.view().original, ['Hello every']);
  c.update({ tokens: [tok(' everyone', false)] });
  assert.deepEqual(c.view().original, ['Hello everyone']);
  c.update({ tokens: [tok(' everyone.', true), tok('<end>', true), tok('안녕하세요', true, { translation_status: 'translation' })] });
  assert.deepEqual(c.view(), { original: ['Hello everyone.'], translation: ['안녕하세요'] });
});

test('captions: a change of speaker starts a new paragraph with a label', () => {
  const c = createCaptions();
  c.update({ tokens: [tok('Thanks', true, { speaker: '1' }), tok(' for', true, { speaker: '1' })] });
  assert.deepEqual(c.view().original, ['S1: Thanks for']);
  c.update({ tokens: [tok(' Question', false, { speaker: '2' })] });
  assert.deepEqual(c.view().original, ['S1: Thanks for', 'S2: Question']);
  c.update({ tokens: [tok(' Question', true, { speaker: '2' }), tok(' here', true, { speaker: '2' }), tok(' Sure', false, { speaker: '1' })] });
  assert.deepEqual(c.view().original, ['S1: Thanks for', 'S2: Question here', 'S1: Sure']);
  c.clear();
  c.update({ tokens: [tok('Hi', true, { speaker: '2' })] });
  assert.deepEqual(c.view().original, ['S2: Hi']);
});

test('captions: a pause (<end>) starts a new paragraph in the original and the translation', () => {
  const c = createCaptions();
  const tr = (text, is_final = true) => tok(text, is_final, { translation_status: 'translation' });
  c.update({ tokens: [tok('Thank you.', true), tr('감사합니다.'), tok('<end>', true)] });
  c.update({ tokens: [tok(' Next', false)] });
  assert.deepEqual(c.view().original, ['Thank you.', 'Next']);
  c.update({ tokens: [tok(' Next slide.', true), tok('<end>', true), tok('<end>', true)] }); // a second <end> adds no empty paragraph
  c.update({ tokens: [tr(' 다음 슬라이드.'), tok(' So', true)] });
  assert.deepEqual(c.view(), { original: ['Thank you.', 'Next slide.', 'So'], translation: ['감사합니다.', '다음 슬라이드.'] });
});

test('conversation: each half gets the other person in its own language and its own words, in paragraphs', () => {
  // token shapes as Soniox sent them for two-way en/ko (probe, 2026-10-22)
  const o = (text, language, is_final = true) => ({ text, language, is_final, translation_status: 'original', speaker: '1' });
  const tr = (text, language, source_language, is_final = true) => ({ text, language, source_language, is_final, translation_status: 'translation' });
  const end = { text: '<end>', is_final: true, translation_status: 'none' };
  const c = createConversation('en', 'ko');
  c.update({ tokens: [o('Hi, nice to meet you.', 'en'), tr('안녕하세요, 만나서 반가워요.', 'ko', 'en'), end] });
  c.update({ tokens: [o(' 반갑습니다.', 'ko'), tr(' Nice to', 'en', 'ko', false)] });
  assert.deepEqual(c.view('en'), { theirs: ['Nice to'], mine: ['Hi, nice to meet you.'] });
  assert.deepEqual(c.view('ko'), { theirs: ['안녕하세요, 만나서 반가워요.'], mine: ['반갑습니다.'] });
  c.update({ tokens: [tr(' Nice to meet you.', 'en', 'ko'), o(' Bonjour', 'fr'), end] });
  c.update({ tokens: [o(' 어디서 오셨어요?', 'ko'), tr(' Where are you from?', 'en', 'ko')] });
  assert.deepEqual(c.view('en'), { theirs: ['Nice to meet you.', 'Where are you from?'], mine: ['Hi, nice to meet you.'] });
  assert.deepEqual(c.view('ko').mine, ['어디서 오셨어요?']);
  c.clear();
  assert.deepEqual(c.view('ko'), { theirs: [], mine: [] });
  assert.throws(() => createConversation('en', 'en'));
});

test('captions: only the last paragraphs are handed out and old text is not kept', () => {
  const c = createCaptions();
  for (let i = 0; i < 2000; i++) c.update({ tokens: [tok(` w${i}`, true)] });
  const [p] = c.view().original;
  assert.ok(p.length <= KEEP_CHARS && p.endsWith('w1999'));
  for (let i = 0; i < 5; i++) c.update({ tokens: [tok(` s${i}.`, true), tok('<end>', true)] });
  assert.deepEqual(c.view().original, ['s2.', 's3.', 's4.']);
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
