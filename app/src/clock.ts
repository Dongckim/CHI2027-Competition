import { useSyncExternalStore } from 'react';

// The only place ARC reads the time. Real clock by default; the sample day (03-P slider) sets a demo instant.
// Everything time-dependent calls now() or useNow(), so the demo moves the whole app at once.
let demo: number | null = null;
let snapshot = Date.now();
const listeners = new Set<() => void>();
const tick = () => { snapshot = demo ?? Date.now(); listeners.forEach(l => l()); };

export const now = () => demo ?? Date.now();
// Wall time for records and timers that must not follow the demo (saved at, built at, version checks).
export const realNow = () => Date.now();
export function setDemoNow(ms: number | null) { demo = ms; tick(); }
export const isDemo = () => demo != null;

// Re-renders on a demo change, every 30 s on the real clock (card states change on the minute scale), and when the
// page becomes visible again (unlocking the phone). A snapshot older than 30 s is re-read before drawing, so a screen
// opened after a pause never starts from an old tick. Subscribe and snapshot are module-level and change the value
// only when it is stale: a new value on every subscribe made React re-render without end on the real clock.
const STALE_MS = 30_000;
const fresh = () => { if (demo == null && Date.now() - snapshot >= STALE_MS) snapshot = Date.now(); return snapshot; };
const onVisible = () => { if (document.visibilityState === 'visible' && demo == null) tick(); };
function subscribeNow(cb: () => void) {
  listeners.add(cb);
  const timer = setInterval(() => { if (demo == null) tick(); }, STALE_MS);
  document.addEventListener('visibilitychange', onVisible);
  return () => { listeners.delete(cb); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
}
export const useNow = () => useSyncExternalStore(subscribeNow, fresh);
