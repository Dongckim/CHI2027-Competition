// No vertical scroll on short screens (user 11/20 「모든 화면에서 스크롤이 안 생기는지(내용이 짧은 화면 기준)」): as an iPhone
// with a real safe area (54 top, 34 bottom; the body pads the top, so a screen sized 100dvh scrolled by 54).
// A screen is short when its content fits: the sum of the content's own heights (header, main's children, the fixed
// bottom area) is under the viewport. Short screens must not scroll at all; long ones (14, 13 …) may.
//   npm run build && node --experimental-websocket tests/qa/height-check.mjs
import { startServer, launchChrome, phone, reporter, sleep } from './cdp.mjs';
import { STORED, device, SCREENS, seedArcs } from './screens.mjs';

const probe = () => {
  const root = document.querySelector('.arc'); if (!root) return null;
  const h = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); };
  const main = root.querySelector('main');
  let content = parseFloat(getComputedStyle(document.body).paddingTop);
  for (const part of root.children) {
    if (part !== main) { content += h(part); continue; }
    const cs = getComputedStyle(main);
    content += parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    // main's children, without the stretch a flex-1 or mt-auto adds
    let used = 0;
    for (const c of main.children) { const ccs = getComputedStyle(c); if (ccs.position === 'fixed' || ccs.position === 'absolute') continue; used += c.getBoundingClientRect().height + (ccs.marginTop === 'auto' ? 0 : parseFloat(ccs.marginTop)) + (ccs.marginBottom === 'auto' ? 0 : parseFloat(ccs.marginBottom)); }
    content += used + Math.max(0, (main.children.length - 1) * (parseFloat(cs.rowGap) || 0));
  }
  return { content: Math.round(content), view: innerHeight, scroll: document.documentElement.scrollHeight };
};

const R = reporter('height');
const server = await startServer(4397);
const chrome = await launchChrome();
let code = 1;
try {
  const tab = await chrome.first();
  await phone(tab, { cpu: 1 });
  await tab.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 54, bottom: 34, left: 0, right: 0 } });
  await tab.send('Page.navigate', { url: `${server.base}#/start/1` });
  await tab.waitFor(`document.readyState === 'complete'`);
  await tab.ev(`localStorage.setItem('arc.device', ${JSON.stringify(device(true))}); true`);
  await tab.ev(seedArcs(STORED));
  const bad = [], long = [];
  for (const [name, hash, text] of SCREENS) {
    await tab.send('Page.navigate', { url: `${server.base}?at=2026-04-14T12:00${name === '10' ? '&mock=slow' : ''}&s=${name}${hash}` });
    if (!(await tab.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, 30000))) { bad.push({ screen: name, error: `did not show "${text}"` }); continue; }
    await sleep(name === '10' ? 300 : 700);
    const m = await tab.ev(`(${probe})()`);
    if (!m) { bad.push({ screen: name, error: 'no .arc root' }); continue; }
    if (m.content > m.view) { long.push(`${name}(${m.content}/${m.scroll})`); continue; }
    if (m.scroll > m.view) bad.push({ screen: name, ...m });
  }
  R.check(`short screens do not scroll (iPhone, safe area 54/34); long: ${long.join(' ') || 'none'}`, bad.length === 0, bad.length ? { bad } : {});
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message.split('\n')[0]}`);
  R.done();
} finally {
  await chrome.close(); server.stop();
  process.exit(code);
}
