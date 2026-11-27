// iOS Simulator (Safari 26.5) via safaridriver: 14's question composer with the software keyboard up
import { execFileSync } from 'node:child_process';
import { STORED, ARC, device, seedArcs } from './screens.mjs';
const WD = 'http://127.0.0.1:4723', BASE = process.argv[2] ?? 'http://127.0.0.1:4180/', OUT = process.argv[3], TAG = process.argv[4] ?? 'new';
const req = async (m, p, b) => { const r = await fetch(WD + p, { signal: AbortSignal.timeout(60000), method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return (await r.json()).value; };
const s = (await req('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari', platformName: 'iOS', 'safari:useSimulator': true } } })).sessionId;
const S = (m, p, b) => req(m, `/session/${s}${p}`, b);
const js = (script, args = []) => S('POST', '/execute/async', { script: `const done = arguments[arguments.length - 1]; Promise.resolve((async () => { ${script} })()).then(done, e => done(String(e)));`, args });
const shot = name => execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', `${OUT}/${TAG}-${name}.png`]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  await S('POST', '/url', { url: BASE + '#/start/1' }); await sleep(1500);
  await js(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); await (${seedArcs(STORED)}); return true;`);
  await S('POST', '/url', { url: BASE + '?at=2026-04-14T12:00#/talk/' + ARC.nodes[0].key }); await sleep(3000);
  await S('POST', '/url', { url: BASE + '?at=2026-04-14T12:00&kbdebug#/talk/' + ARC.nodes[0].key }); await sleep(3000);
  const sel = TAG === 'old' ? 'input[aria-describedby="qa-note"]' : 'button[aria-describedby="qa-note"]';
  const el = await S('POST', '/element', { using: 'css selector', value: sel });
  await S('POST', `/element/${Object.values(el)[0]}/click`, {});
  await sleep(2500);
  shot('1-tapped');
  console.log('after tap', JSON.stringify(await js(`return { active: document.activeElement?.tagName, iH: innerHeight, vvH: Math.round(visualViewport.height), vvTop: Math.round(visualViewport.offsetTop), sY: scrollY, sheet: !!document.querySelector('[aria-label="Ask the authors"]') };`)));
  // try to scroll to the very bottom: a finger swipe up on the page, then scrollTo
  await S('POST', '/actions', { actions: [{ type: 'pointer', id: 'f', parameters: { pointerType: 'touch' }, actions: [
    { type: 'pointerMove', x: 200, y: 300, duration: 0 }, { type: 'pointerDown', button: 0 }, { type: 'pointerMove', x: 200, y: 60, duration: 300 }, { type: 'pointerUp', button: 0 } ] }] });
  await js(`scrollTo(0, 1e6); return true;`); await sleep(1500);
  shot('2-scrolled');
  console.log('after scroll', JSON.stringify(await js(`return { active: document.activeElement?.tagName, iH: innerHeight, vvH: Math.round(visualViewport.height), vvTop: Math.round(visualViewport.offsetTop), sY: scrollY };`)));
} finally { await req('DELETE', `/session/${s}`); }
