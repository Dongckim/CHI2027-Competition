// A whole-row checkbox or radio (days, needs, what to see, language, how full). Native input, so screen readers and
// keyboards get the right role and state; the row is the label, at least 52px high. Selected rows get the strong border.
export function ChoiceRow({ type = 'checkbox', name, checked, onChange, label, hint }:
  { type?: 'checkbox' | 'radio'; name?: string; checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-row border px-3.5 py-2 ${checked ? 'border-[length:var(--card-border)] border-text' : 'border-border-strong'}`}>
      <span className="flex flex-1 flex-col">
        <span className="text-body">{label}</span>
        {hint && <span className="text-small text-text-3">{hint}</span>}
      </span>
      <input type={type} name={name} checked={checked} onChange={onChange} className="size-5 shrink-0 accent-[var(--text)]" />
    </label>
  );
}
