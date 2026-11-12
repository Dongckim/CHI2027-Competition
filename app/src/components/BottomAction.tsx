import { Button } from './Button';

// The one fixed element at the bottom of an onboarding screen (no tab bar there). Sits above the device safe area.
// size lg: the 48px bottom button of 04 Filters (onboarding keeps its 44px one).
export function BottomAction({ label, onClick, disabled = false, size }: { label: string; onClick: () => void; disabled?: boolean; size?: 'lg' }) {
  return (
    <div className="fixed inset-x-0 bottom-0 bg-bg px-gutter pt-3 pb-[calc(var(--safe-bottom)+12px)]">
      <div className="mx-auto max-w-[448px]">
        <Button size={size} className="w-full disabled:opacity-40" onClick={onClick} disabled={disabled}>{label}</Button>
      </div>
    </div>
  );
}
