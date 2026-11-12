// "Your plan" line: small label, value, chevron. The whole row goes to the screen that changes it.
export function SummaryRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <li className="border-b border-border">
      <a href={href} className="flex min-h-[56px] items-center gap-3 py-2">
        <span className="flex flex-1 flex-col">
          <span className="text-small text-text-3">{label}</span>
          <span className="text-body font-semibold">{value}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        <span className="sr-only">Change {label.toLowerCase()}</span>
      </a>
    </li>
  );
}
