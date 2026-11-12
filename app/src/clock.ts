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

// Re-renders on a demo change and every 30 s on the real clock (card states change on the minute scale).
export function useNow() {
  return useSyncExternalStore(cb => {
    listeners.add(cb);
    const timer = setInterval(() => { if (demo == null) tick(); }, 30_000);
    return () => { listeners.delete(cb); clearInterval(timer); };
  }, () => snapshot);
}
