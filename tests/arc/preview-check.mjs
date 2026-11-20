// Deploy check (A3/A4): a real Vercel deploy, not vite preview. /s/<payload> → share page tags, /api/og picture, → 18 in headless Chrome,
// and a Q&A round trip (ask → list → vote → delete) on a test paper key nobody sees (chi2026:0).
//   VERCEL_BYPASS_TOKEN=… node --experimental-websocket tests/arc/preview-check.mjs <deploy url> [--expect-upstash]
//   node --experimental-websocket tests/arc/preview-check.mjs <production url> --public [--expect-upstash]
// The bypass token (Vercel "Protection Bypass for Automation") goes only in request headers: never in a URL, never
// printed (every message is masked). --public sends no token and fails if the deploy asks for a login (the submission
// address must open in a browser that is not signed in). --expect-upstash fails unless Q&A answers from Upstash.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { encodeLink } from '../../app/src/arc/link.js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = args.find(a => /^https?:\/\//.test(a))?.replace(/\/+$/, '');
const PUBLIC = args.includes('--public'), UPSTASH = args.includes('--expect-upstash');
const TOKEN = PUBLIC ? '' : (process.env.VERCEL_BYPASS_TOKEN ?? '');
if (!BASE) { console.error('usage: preview-check.mjs <deploy url> [--public] [--expect-upstash]'); process.exit(2); }
if (!PUBLIC && !TOKEN) { console.error('VERCEL_BYPASS_TOKEN is not set (or use --public for an address without protection)'); process.exit(2); }
const mask = s => (TOKEN ? String(s).split(TOKEN).join('***') : String(s));
const headers = TOKEN ? { 'x-vercel-protection-bypass': TOKEN } : {};
const out = {}, fails = [];
const check = (name, ok, detail = {}) => { out[name] = { ok, ...detail }; if (!ok) fails.push(name); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const example = JSON.parse(readFileSync(new URL('../../contracts/examples/Arc.chi2026-presence.json', import.meta.url)));
const PAYLOAD = encodeLink(example);
const profile = `${tmpdir()}/arc-deploy-${Date.now()}`;
let chrome, ws;

try {
  // 1. the address itself (no redirect to a Vercel login)
  const home = await fetch(`${BASE}/`, { headers, redirect: 'manual' });
  check(PUBLIC ? 'opens without signing in (no protection)' : 'opens with the bypass header', home.status === 200, { status: home.status });

  // 2. the share page messengers read
  const s = await fetch(`${BASE}/s/${PAYLOAD}`, { headers, redirect: 'manual' });
  const html = s.status === 200 ? await s.text() : '';
  check('/s/<payload> → share page with preview tags', html.includes('<meta property="og:title" content="Does VR fidelity raise presence?">') && html.includes(`/#/r/${PAYLOAD}`) && html.includes(`/api/og?d=${PAYLOAD}`), { status: s.status });

  // 2b. the preview picture (its wasm, fonts and SVGs come from vercel.json includeFiles: only a deploy can prove them)
  const og = await fetch(`${BASE}/api/og?d=${PAYLOAD}`, { headers, redirect: 'manual' });
  const png = og.status === 200 ? Buffer.from(await og.arrayBuffer()) : Buffer.alloc(0);
  check('/api/og → 1200×630 PNG', og.headers.get('content-type') === 'image/png' && png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1200, { status: og.status, bytes: png.length });

  // 3. Q&A round trip on chi2026:0 (no talk has that id), deleted at the end
  const device = `deploycheck${Math.random().toString(36).slice(2, 14).padEnd(12, '0')}`;
  const qa = async (method, body, query = '') => {
    const r = await fetch(`${BASE}/api/qa${query}`, { method, headers: { ...headers, 'x-arc-device': device, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: r.status, store: r.headers.get('x-arc-qa-store'), body: await r.json().catch(() => ({})) };
  };
  const asked = await qa('POST', { action: 'ask', paper: 'chi2026:0', text: `deploy check ${new Date().toISOString()}` });
  const id = asked.body.question?.id;
  const listed = await qa('GET', null, '?paper=chi2026:0');
  const voted = id ? await qa('POST', { action: 'vote', id }) : { status: 0 };
  const deleted = id ? await qa('DELETE', { id }) : { status: 0 };
  const after = await qa('GET', null, '?paper=chi2026:0');
  check('Q&A: ask → listed → vote → delete', asked.status === 201 && listed.body.questions?.some(q => q.id === id) && voted.body.votes === 1 && deleted.status === 200 && !after.body.questions?.some(q => q.id === id),
    { status: [asked.status, listed.status, voted.status, deleted.status], store: asked.store });
  if (UPSTASH) check('Q&A answers from Upstash (not instance memory)', [asked, listed, deleted].every(r => r.store === 'upstash'), { store: asked.store });

  // 4. the same link in a phone browser: /s/ → 18
  const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9357', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9357/json')).json(); break; } catch { await sleep(250); } }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let n = 0; const pending = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++n; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return !r.result || r.result.exceptionDetails ? undefined : r.result.result.value; };
  const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await sleep(200); } return null; };
  await send('Network.enable');
  if (TOKEN) await send('Network.setExtraHTTPHeaders', { headers }); // header only, the URL stays clean
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `${BASE}/s/${PAYLOAD}` });
  const ms = await waitFor(`location.hash === '#/r/${PAYLOAD}' && /Shared Arc/.test(document.body.innerText) && /Add to my Arcs/.test(document.body.innerText)`);
  check('/s/ link in a phone browser → 18 Shared Arc', ms != null, { ms });
} catch (e) {
  fails.push(`stopped: ${mask(e.message)}`);
} finally {
  console.log(mask(JSON.stringify(out, null, 2)));
  console.log(mask(fails.length ? `FAIL ${fails.length}: ${fails.join(' | ')}` : `PASS ${Object.keys(out).length}/${Object.keys(out).length}`));
  try { ws?.close(); } catch {}
  chrome?.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {} // the profile held the header's cookies, if any
  process.exit(fails.length ? 1 : 0);
}
