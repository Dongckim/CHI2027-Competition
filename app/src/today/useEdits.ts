import { useSyncExternalStore } from 'react';
import { useDevice, update } from '../state/useDevice';
import { editsOf, updateEdits } from '../state/device.js';
import { NO_EDITS } from './edits.js';

// Edits (Remove / Pick / Swap / Add) for the mode Today is in: saved with the plan, or in memory for the sample day.
type Edits = { removed: string[]; passed: string[]; added: string[] };
let sample: Edits = NO_EDITS;
const listeners = new Set<() => void>();
const useSample = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => sample);
export const resetSampleEdits = () => { sample = NO_EDITS; listeners.forEach(l => l()); };

export function useEdits(mode: 'plan' | 'sample'): [Edits, (change: (e: Edits) => Edits) => void] {
  const state = useDevice();
  const inMemory = useSample();
  if (mode === 'sample') return [inMemory, change => { sample = change(sample); listeners.forEach(l => l()); }];
  return [editsOf(state.plan), change => update(s => updateEdits(s, change))];
}
