// Repository secret scan (QA 4): every file git tracks is checked for tokens, keys, passwords in URLs and .env files.
// No dependency. A finding prints the file and line only, never the value. Exceptions: tests/qa/secrets-allow.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['OpenAI / Anthropic key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}\b/],
  ['Stripe key', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/],
  ['Vercel / bearer token', /\b(?:Bearer|token)\s+[A-Za-z0-9_\-.]{32,}\b/],
  ['password in a URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@'"`]+:[^\s/@'"`]{3,}@[^\s/'"`]+/i],
  ['assigned secret', /\b(?:api[_-]?key|secret|token|passwd|password|client[_-]?secret)\b["']?\s*[:=]\s*["'`][A-Za-z0-9_\-+/=.]{20,}["'`]/i],
];
const ENV_FILE = /(^|\/)\.env(\.[\w-]+)?$/;
const ENV_OK = /(^|\/)\.env\.(example|sample|template)$/;
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|gz|wasm|onnx|bin|mp3|mp4|mov)$/i;

export function scan(files, read, allow = []) {
  const out = [];
  const allowed = (file, line, name) => allow.some(a => a.file === file && (a.line == null || a.line === line) && (!a.pattern || a.pattern === name));
  for (const file of files) {
    if (ENV_FILE.test(file) && !ENV_OK.test(file) && !allowed(file, null, '.env file')) out.push({ file, line: 0, kind: '.env file' });
    if (BINARY.test(file)) continue;
    const text = read(file);
    if (text == null) continue;
    text.split('\n').forEach((l, i) => {
      for (const [name, re] of PATTERNS) if (re.test(l) && !allowed(file, i + 1, name)) out.push({ file, line: i + 1, kind: name });
    });
  }
  return out;
}

const tracked = () => execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
const readTracked = f => { try { const p = new URL(f, ROOT); return statSync(p).size > 2_000_000 ? null : readFileSync(p, 'utf8'); } catch { return null; } };

test('secrets: no tokens, keys, passwords in URLs or .env files in tracked files', () => {
  const allow = JSON.parse(readFileSync(new URL('secrets-allow.json', import.meta.url), 'utf8')).allow;
  const found = scan(tracked(), readTracked, allow);
  assert.deepEqual(found.map(f => `${f.file}:${f.line} ${f.kind}`), [], 'file:line only, values are not printed');
});

test('secrets: the scan catches each kind and prints no value', () => {
  const fake = { 'a.js': `const k = "AKIA${'A'.repeat(16)}";`, 'b.md': `see https://user:hunter22@db.example.com/x`, 'c/.env': 'X=1', 'd.env.example': 'X=', 'e.js': `token: '${'x'.repeat(24)}'` };
  const found = scan(Object.keys(fake), f => fake[f]);
  assert.deepEqual(found.map(f => [f.file, f.kind]), [['a.js', 'AWS access key'], ['b.md', 'password in a URL'], ['c/.env', '.env file'], ['e.js', 'assigned secret']]);
  assert.ok(found.every(f => !('value' in f)));
});
