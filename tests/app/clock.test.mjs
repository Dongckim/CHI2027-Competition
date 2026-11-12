// Regression: on the real clock, a screen using useNow() rendered without end (blank Today, React error #185).
// The test renders a component with the real hook (react-test-renderer, no DOM) and counts renders.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useNow, setDemoNow } from '../../app/src/clock.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.document ??= { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };

// Time moves on between renders (a real Today render takes milliseconds): every Date.now() call is 1 ms later.
const realDateNow = Date.now;
let fake = Date.UTC(2027, 4, 11, 9, 0);
beforeEach(() => { Date.now = () => (fake += 1); setDemoNow(null); });
afterEach(() => { Date.now = realDateNow; setDemoNow(null); });

async function countRenders() {
  let renders = 0;
  let last = 0;
  function Today() { renders++; last = useNow(); return createElement('main', null, 'Today'); }
  let root;
  let error = null;
  try {
    await act(async () => { root = TestRenderer.create(createElement(Today)); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  } catch (e) { error = e; }
  const drawn = root?.toJSON()?.children?.[0] ?? null;
  root?.unmount();
  return { renders, last, error, drawn };
}

test('real clock: a screen using useNow is drawn and renders only a few times', async () => {
  const { renders, error, drawn, last } = await countRenders();
  assert.equal(error, null, `render failed: ${error?.message}`);
  assert.equal(drawn, 'Today');
  assert.ok(renders <= 3, `rendered ${renders} times`);
  assert.ok(last > 0);
});

test('demo clock: useNow gives the demo instant, and moving it re-renders once', async () => {
  const demo = Date.UTC(2026, 3, 14, 6, 40);
  setDemoNow(demo);
  let seen = [];
  function Probe() { seen.push(useNow()); return null; }
  let root;
  await act(async () => { root = TestRenderer.create(createElement(Probe)); });
  await act(async () => { setDemoNow(demo + 60_000); });
  root.unmount();
  assert.equal(seen[0], demo);
  assert.equal(seen.at(-1), demo + 60_000);
  assert.ok(seen.length <= 3, `rendered ${seen.length} times`);
});
