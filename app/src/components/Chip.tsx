import type { ReactNode } from 'react';

// Selectable chip (e.g. the preview bar's time choices). 44px touch target.
export function Chip({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect}
      className={`min-h-touch rounded-button px-3 font-mono text-small font-medium ${selected ? 'bg-inverse text-on-inverse' : 'bg-surface text-text'}`}>
      {children}
    </button>
  );
}
