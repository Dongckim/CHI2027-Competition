// Shared headless Chrome helper for tests/qa/*-check.mjs (CDP over WebSocket, no dependency).
// - vite preview on a port that must be free (a stale server would serve an old build: fail instead)
// - Chrome picks its own debugging port (--remote-debugging-port=0 → DevToolsActivePort), so a leftover Chrome from
//   another run can never be the one we talk to; its profile is a fresh temp folder, removed at the end
// - tabs: openTab() gives { send, ev, waitFor, on, close } per tab, all on the same origin and profile
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function startServer(port) {
  const base = `http://localhost:${port}/`;
  if (await fetch(base).then(() => true, () => false)) throw new Error(`port ${port} is already serving (a stale vite preview?); stop it first`);
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 80; i++) { if (await fetch(base).then(r => r.ok, () => false)) return { base, stop: () => { try { process.kill(-proc.pid); } catch {} } }; await sleep(250); }
  try { process.kill(-proc.pid); } catch {}
  throw new Error(`vite preview did not start on ${port} (run npm run build first)`);
}

// A Chrome profile in the temp folder that is deleted when this process ends, however it ends (user 11/21: 443 left-over
// profiles, 12 GB, filled the disk). shortcut: a SIGKILL still leaves it; qa:auto sweeps what a check leaves behind.
const profiles = new Set();
const sweep = () => { for (const p of profiles) try { rmSync(p, { recursive: true, force: true }); } catch {} profiles.clear(); };
process.on('exit', sweep);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { sweep(); process.exit(130); });
export function tempProfile(prefix = 'arc-qa') { const p = mkdtempSync(join(tmpdir(), `${prefix}-`)); profiles.add(p); return p; }

export async function launchChrome({ args = [] } = {}) {
  const profile = tempProfile('arc-qa');
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', ...args, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 80 && !port; i++) {
    const f = join(profile, 'DevToolsActivePort');
    if (existsSync(f)) port = Number(readFileSync(f, 'utf8').split('\n')[0]);
    else await sleep(125);
  }
  if (!port) { proc.kill(); throw new Error('Chrome did not open a debugging port'); }
  const http = `http://127.0.0.1:${port}`;
  const tabs = [];
  async function attach(target) {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let id = 0; const pending = new Map(), listeners = new Map();
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method) for (const f of listeners.get(m.method) ?? []) f(m.params, m.sessionId);
    });
    const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
    const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return !r.result || r.result.exceptionDetails ? undefined : r.result.result.value; };
    const evOrThrow = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.slice(0, 300) ?? 'page error'); return r.result?.result.value; };
    const waitFor = async (expr, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return Date.now() - t; await sleep(120); } return null; };
    const on = (method, f) => { (listeners.get(method) ?? listeners.set(method, []).get(method)).push(f); };
    const tab = { send, ev, evOrThrow, waitFor, on, close: () => { try { ws.close(); } catch {} } };
    tabs.push(tab);
    return tab;
  }
  const firstTarget = async () => { for (let i = 0; i < 40; i++) { const t = (await (await fetch(`${http}/json`)).json()).find(x => x.type === 'page'); if (t) return t; await sleep(125); } throw new Error('no page target'); };
  return {
    first: async () => attach(await firstTarget()),
    /** The browser target, for Target.* (e.g. attaching to service workers). Events carry sessionId (flatten). */
    browser: async () => attach({ webSocketDebuggerUrl: (await (await fetch(`${http}/json/version`)).json()).webSocketDebuggerUrl }),
    openTab: async () => attach(await (await fetch(`${http}/json/new?about:blank`, { method: 'PUT' })).json()),
    close: async () => { for (const t of tabs) t.close(); const gone = proc.exitCode != null ? null : new Promise(r => proc.once('exit', r)); proc.kill(); await Promise.race([gone, sleep(3000)]); try { rmSync(profile, { recursive: true, force: true }); } catch {} }, // after Chrome exits: removing it earlier left files Chrome was still writing
  };
}

/** A phone tab: 390×844 (or width), touch, DPR 2, CPU slowed. */
export async function phone(tab, { width = 390, height = 844, cpu = 4 } = {}) {
  await tab.send('Page.enable'); await tab.send('Runtime.enable');
  await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await tab.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  if (cpu > 1) await tab.send('Emulation.setCPUThrottlingRate', { rate: cpu });
}

/** Results with a reason each, printed as a table; exit 1 on any failure. */
export function reporter(name) {
  const rows = [];
  return {
    check: (what, ok, detail = {}) => { rows.push({ what, ok, detail }); return ok; },
    done: () => {
      const bad = rows.filter(r => !r.ok);
      for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.what}${Object.keys(r.detail).length ? `  ${JSON.stringify(r.detail)}` : ''}`);
      console.log(bad.length ? `FAIL ${name}: ${bad.length} of ${rows.length}` : `PASS ${name}: ${rows.length}/${rows.length}`);
      return bad.length ? 1 : 0;
    },
  };
}
