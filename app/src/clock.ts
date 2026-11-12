import { useSyncExternalStore } from 'react';

// The only place ARC reads the time. Real clock by default; the sample day (03-P slider) sets a demo instant.
// Everything time-dependent calls now() or useNow(), so the demo moves the whole app at once.
let demo: number | null = null;
let snapshot = Date.now();
const listeners = new Set<() => void>();
const tick = () => { snapshot = demo ?? Date.now(); listeners.forEach(l => l()); };

export const now = () => demo ?? Date.now();
export function setDemoNow(ms: number | null) { demo = ms; tick(); }
export const isDemo = () => demo != null;

// Re-renders on a demo change, every 30 s on the real clock (card states change on the minute scale), and when the
// page becomes visible again (unlocking the phone). The time is re-read on subscribe, so a screen opened after a pause
// does not start from the last tick: React sees the changed snapshot and draws again before the user can act on it.
const onVisible = () => { if (document.visibilityState === 'visible' && demo == null) tick(); };
export function useNow() {
  return useSyncExternalStore(cb => {
    snapshot = now();
    listeners.add(cb);
    const timer = setInterval(() => { if (demo == null) tick(); }, 30_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { listeners.delete(cb); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, () => {
    if (demo == null && Date.now() - snapshot >= 30_000) snapshot = Date.now(); // stale since the last tick: re-read before drawing
    return snapshot;
  });
}
