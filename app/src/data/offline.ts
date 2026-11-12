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
