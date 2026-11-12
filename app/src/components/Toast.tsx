import { useEffect } from 'react';

// Short message with one action (Undo, View), above the tab bar. Leaves by itself after 6 s; screen readers hear it.
export type ToastValue = { text: string; action?: { label: string; run: () => void } } | null;
export function Toast({ toast, onClose, bottom = 'calc(var(--touch) + var(--safe-bottom) + 20px)' }: { toast: ToastValue; onClose: () => void; bottom?: string }) {
  useEffect(() => { if (!toast) return; const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [toast, onClose]);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 z-10 px-gutter" style={{ bottom }}>
      {toast && (
        <div className="pointer-events-auto mx-auto flex max-w-[448px] items-center gap-3 rounded-row bg-inverse py-1 pr-1 pl-4 text-on-inverse shadow-lg">
          <span className="flex-1 text-small">{toast.text}</span>
          {toast.action && <button type="button" onClick={() => { toast.action!.run(); onClose(); }} className="min-h-touch px-3 text-small font-semibold underline">{toast.action.label}</button>}
        </div>
      )}
    </div>
  );
}
