import { useSyncExternalStore } from 'react';
import current from '../../../data/build/app-data/chi2026/current.json';
import { response as sample } from './fake-recommend';
import type { RecommendResponse } from './recommend';

// The recommendations for the saved plan, kept on the phone next to it (about 120 KB), so Today works offline and
// after reopening. The sample day keeps the fixed contract example (deterministic demo).
const KEY = 'arc.recommendation';
type Stored = { query: string; response: RecommendResponse };
const read = (): Stored | null => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return s?.response?.dataVersion?.edition === current.edition ? s : null;
  } catch { return null; }
};
let stored = read();
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };

export function saveRecommendation(query: string, response: RecommendResponse) {
  stored = { query, response };
  try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* full or blocked: kept in memory for this visit */ }
  listeners.forEach(l => l());
}
// shortcut: a plan built before the baseline existed has no stored response and falls back to the example.
export const useRecommendation = (mode: 'plan' | 'sample'): RecommendResponse =>
  useSyncExternalStore(subscribe, () => (mode === 'plan' ? stored?.response ?? sample : sample));
