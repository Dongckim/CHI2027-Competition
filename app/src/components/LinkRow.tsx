// Full-width link with a chevron (e.g. "More for you").
export function LinkRow({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className="mx-gutter flex min-h-[52px] items-center justify-between rounded-row border border-border-strong px-4 text-link font-medium text-text">
      {children}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
    </a>
  );
}
