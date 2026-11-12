import { useSyncExternalStore } from 'react';
import { realNow } from '../clock';

// Offline support around the service worker (app/sw.js): whether the browser is online, when the data on this phone
// was last fetched online ("saved at"), and a marker that a plan was built here (to tell "cleared" from "first visit").
const SAVED_AT = 'arc.savedAt';
const subscribe = (cb: () => void) => { addEventListener('online', cb); addEventListener('offline', cb); return () => { removeEventListener('online', cb); removeEventListener('offline', cb); }; };
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine);

export function markDataSaved() {
  if (!navigator.onLine) return;
  try { localStorage.setItem(SAVED_AT, String(realNow())); } catch {}
}
export function savedAt(): number | null {
  try { const v = Number(localStorage.getItem(SAVED_AT)); return v > 0 ? v : null; } catch { return null; }
}

// Cache Storage is cleared separately from localStorage by some browsers, so a surviving marker with no saved plan
// means the plan was cleared (03-J2). Best effort: when both are cleared, the app simply starts at O-1.
const MARKER = 'arc-plan-marker';
export function markPlanSaved() {
  if (!('caches' in window)) return;
  caches.open(MARKER).then(c => c.put('/plan-marker', new Response('1'))).catch(() => {});
}
export async function planWasHere(): Promise<boolean> {
  if (!('caches' in window)) return false;
  try { return !!(await caches.match('/plan-marker', { cacheName: MARKER })); } catch { return false; }
}

export function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Offline after one visit: after Today is drawn, when the phone is idle (or a few seconds later where there is no
// requestIdleCallback), fetch files once through the service worker, which keeps /app-data/ (cache first): Explore's
// search files (05) and the abstracts of the planned days (06). Not with Save-Data on, not again once in the cache.
// → a cancel function for the effect cleanup.
export function prefetchWhenIdle(urls: string[]) {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (!import.meta.env.PROD || saveData || !('serviceWorker' in navigator) || !('caches' in window)) return () => {};
  let cancelled = false;
  const run = async () => {
    const sw = navigator.serviceWorker;
    await sw.ready;
    if (!sw.controller) await new Promise(r => sw.addEventListener('controllerchange', r, { once: true })); // first visit: wait for the worker to take the page
    for (const url of urls) {
      if (cancelled || !navigator.onLine) return;
      try { if (!(await caches.match(url, { ignoreVary: true }))) await (await fetch(url)).arrayBuffer(); } catch { /* next visit tries again */ }
    }
  };
  if ('requestIdleCallback' in window) {
    const id = requestIdleCallback(() => void run(), { timeout: 10_000 });
    return () => { cancelled = true; cancelIdleCallback(id); };
  }
  const id = setTimeout(() => void run(), 3000);
  return () => { cancelled = true; clearTimeout(id); };
}
