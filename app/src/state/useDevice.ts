import { useSyncExternalStore } from 'react';
import current from '../../../data/build/app-data/chi2026/current.json';
import languages from '../captions/soniox-languages.json';
import { readState, writeState } from './device.js';

// The one DeviceState, kept in localStorage: small JSON, read synchronously so the first screen is right on the first paint.
const storage: Storage | null = (() => { try { return window.localStorage; } catch { return null; } })();
const blocked = { getItem: () => { throw new Error('no storage'); }, setItem: () => { throw new Error('no storage'); } };

export const LANGUAGES = languages.languages as { code: string; name: string }[];
const deviceLanguage = () => {
  const code = (navigator.language || 'en').split('-')[0].toLowerCase();
  return LANGUAGES.some(l => l.code === code) ? code : 'en';
};

const loaded = readState(storage ?? blocked, { edition: current.edition, days: current.days, language: deviceLanguage() });
let state = loaded.state;
let saved = loaded.note !== 'unavailable';
export const loadNote = loaded.note; // 'unreadable' = the stored plan could not be used and onboarding starts over
export type DeviceState = typeof state;

const listeners = new Set<() => void>();
const applyTextSize = () => { document.documentElement.dataset.text = state.plan.needs.largerText ? 'large' : 'normal'; };
applyTextSize();

export function update(change: (s: DeviceState) => DeviceState) {
  const next = change(state);
  if (next === state) return;
  state = next;
  saved = storage ? writeState(storage, state) : false;
  applyTextSize();
  listeners.forEach(l => l());
}
export const useDevice = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
export const isSaved = () => saved; // false: private mode or full storage, the plan lives only until the tab closes
