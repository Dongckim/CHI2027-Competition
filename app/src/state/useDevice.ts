import { useSyncExternalStore } from 'react';
import current from '../../../data/build/app-data/chi2026/current.json';
import languages from '../captions/soniox-languages.json';
import { readState, writeState, STORAGE_KEY } from './device.js';

// The one DeviceState, kept in localStorage: small JSON, read synchronously so the first screen is right on the first paint.
const storage: Storage | null = (() => { try { return window.localStorage; } catch { return null; } })();
const blocked = { getItem: () => { throw new Error('no storage'); }, setItem: () => { throw new Error('no storage'); } };

export const LANGUAGES = languages.languages as { code: string; name: string }[];
const deviceLanguage = () => {
  const code = (navigator.language || 'en').split('-')[0].toLowerCase();
  return LANGUAGES.some(l => l.code === code) ? code : 'en';
};

const defaults = { edition: current.edition, days: current.days, language: deviceLanguage() };
const loaded = readState(storage ?? blocked, defaults);
let state = loaded.state;
let saved = loaded.note !== 'unavailable';
export const loadNote = loaded.note; // 'unreadable' = the stored plan could not be used and onboarding starts over
export type DeviceState = typeof state;

const listeners = new Set<() => void>();
const applyTextSize = () => { document.documentElement.dataset.text = state.plan.needs.largerText ? 'large' : 'normal'; };
applyTextSize();

// Another tab may have written since this one read: every change starts from what is stored now (QA V7: a tab that
// read before another marked a talk heard wrote the old list back). When storing fails, memory is the latest.
const latest = (): DeviceState => {
  if (!storage || !saved) return state;
  const r = readState(storage, defaults);
  return r.note === 'saved' ? r.state : state;
};
const changed = () => { applyTextSize(); listeners.forEach(l => l()); };

export function update(change: (s: DeviceState) => DeviceState) {
  const base = latest();
  const next = change(base);
  if (next === base) { if (base !== state && JSON.stringify(base) !== JSON.stringify(state)) { state = base; changed(); } return; }
  state = next;
  saved = storage ? writeState(storage, state) : false;
  changed();
}
// and what another tab stores shows here too
if (storage) addEventListener('storage', e => {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  const r = readState(storage, defaults);
  if (r.note === 'saved' && JSON.stringify(r.state) !== JSON.stringify(state)) { state = r.state; changed(); }
});
export const useDevice = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
export const isSaved = () => saved; // false: private mode or full storage, the plan lives only until the tab closes
