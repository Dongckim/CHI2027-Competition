import type { ReactNode } from 'react';

// Toggle chip (topics, nearby fields). 44px touch target; on = filled with a check, off = outlined.
export function Chip({ selected, onSelect, children, label }: { selected: boolean; onSelect: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" aria-pressed={selected} aria-label={label} onClick={onSelect}
      className={`inline-flex min-h-touch items-center gap-1.5 rounded-[22px] px-4 py-2 text-left text-body ${selected ? 'bg-inverse text-on-inverse' : 'border border-border-strong bg-bg text-text'}`}>
      {selected && <svg className="shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m2.5 7.5 3 3 6-7" /></svg>}
      <span>{children}</span>
    </button>
  );
}
