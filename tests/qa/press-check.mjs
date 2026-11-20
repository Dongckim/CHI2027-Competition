// Real presses (QA V7 fix 1): touch events (CDP Input.dispatchTouchEvent), not element.click(), so whatever lies on top
// takes the press. Skip on 01, 03, 05, 06 — at its centre and 20 px up, down, left and right of it — must go home;
// on 05 the Code of Conduct link must get the press (its opening is stopped so no page leaves the test).
// npm run build && node --experimental-websocket tests/qa/press-check.mjs
import { startServer, launchChrome, phone, reporter } from './cdp.mjs';

const R = reporter('press');
const server = await startServer(4375);
const chrome = await launchChrome();
let code = 1;
try {
  const tab = await chrome.first();
  await phone(tab, { cpu: 1 });
  const tap = async (x, y) => {
    await tab.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await tab.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const centre = sel => tab.ev(`(() => { const el = ${sel}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const skip = `[...document.querySelectorAll('a, button')].find(b => b.innerText.trim() === 'Skip')`;
  for (const page of ['1', '3', '5', '6']) {
    const missed = [];
    for (const [dx, dy] of [[0, 0], [0, -20], [0, 20], [-20, 0], [20, 0]]) {
      await tab.send('Storage.clearDataForOrigin', { origin: server.base.slice(0, -1), storageTypes: 'local_storage' });
      await tab.send('Page.navigate', { url: `${server.base}#/start/${page}` });
      await tab.waitFor(`!!(${skip})`, 20000);
      const c = await centre(skip);
      await tap(c[0] + dx, c[1] + dy);
      if ((await tab.waitFor(`location.hash === '#/home'`, 4000)) == null) missed.push(`${dx},${dy}`);
    }
    R.check(`0${page}: a touch on Skip (centre and ±20 px) goes home`, missed.length === 0, missed.length ? { missed } : {});
  }
  await tab.send('Page.navigate', { url: `${server.base}#/start/5` });
  const link = `[...document.querySelectorAll('a')].find(a => a.innerText.trim().startsWith('Code of Conduct'))`;
  await tab.waitFor(`!!(${link})`, 20000);
  await tab.ev(`(window.__pressed = null, document.addEventListener('click', e => { const a = e.target.closest('a'); window.__pressed = a ? a.innerText.trim() : e.target.tagName; e.preventDefault(); }, true), true)`);
  const c = await centre(link);
  await tap(c[0], c[1]);
  const got = await tab.waitFor(`window.__pressed != null`, 4000) != null ? await tab.ev(`window.__pressed`) : null;
  R.check('05: a touch on Code of Conduct reaches the link', typeof got === 'string' && got.startsWith('Code of Conduct'), { got });
  code = R.done();
} catch (e) {
  console.error(`stopped: ${e.message}`);
  R.done();
} finally {
  await chrome.close(); server.stop();
  process.exit(code);
}
