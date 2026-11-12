import { href, type Tab } from '../router';

const ICONS: Record<Tab, string> = {
  today: 'M5 6h14M5 12h14M5 18h9',
  explore: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2',
  questions: 'M4 5h16v11H9l-5 4z',
};
const LABELS: Record<Tab, string> = { today: 'Today', explore: 'Explore', questions: 'Questions' };

// The only fixed element at the bottom of every screen. 44px tabs + the device safe area.
export function TabBar({ current }: { current: Tab }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 border-t border-border bg-bg pt-2 pb-[var(--safe-bottom)]">
      <ul className="mx-auto flex max-w-[480px]">
        {(Object.keys(LABELS) as Tab[]).map(t => (
          <li key={t} className="flex-1">
            <a href={href(t)} aria-current={t === current ? 'page' : undefined}
              className={`flex min-h-touch flex-col items-center justify-center gap-0.5 text-tag ${t === current ? 'font-semibold text-text' : 'text-text-3'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={t === current ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[t]} /></svg>
              {LABELS[t]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
