import { href, type Tab } from '../router';

// Figma v3 tab icons (22px, stroke 1.7 in both states; only the colour says which tab is open), drawn in currentColor.
const ICONS: Record<Tab, string[]> = {
  today: [
    'M7.33333 17.4167C7.33333 18.4292 6.51252 19.25 5.5 19.25C4.48748 19.25 3.66667 18.4292 3.66667 17.4167C3.66667 16.4041 4.48748 15.5833 5.5 15.5833C6.51252 15.5833 7.33333 16.4041 7.33333 17.4167Z',
    'M18.3333 4.58333C18.3333 5.59586 17.5125 6.41667 16.5 6.41667C15.4875 6.41667 14.6667 5.59586 14.6667 4.58333C14.6667 3.57081 15.4875 2.75 16.5 2.75C17.5125 2.75 18.3333 3.57081 18.3333 4.58333Z',
    'M7.33333 17.4167H13.75C14.6009 17.4167 15.417 17.0786 16.0186 16.477C16.6203 15.8753 16.9583 15.0592 16.9583 14.2083C16.9583 13.3574 16.6203 12.5414 16.0186 11.9397C15.417 11.338 14.6009 11 13.75 11H8.25C7.3991 11 6.58305 10.662 5.98137 10.0603C5.37969 9.45862 5.04167 8.64257 5.04167 7.79167C5.04167 6.94076 5.37969 6.12471 5.98137 5.52303C6.58305 4.92135 7.3991 4.58333 8.25 4.58333H14.6667',
  ],
  explore: [
    'M16.5 10.0833C16.5 13.6272 13.6272 16.5 10.0833 16.5C6.53951 16.5 3.66667 13.6272 3.66667 10.0833C3.66667 6.53951 6.53951 3.66667 10.0833 3.66667C13.6272 3.66667 16.5 6.53951 16.5 10.0833Z',
    'M18.3333 18.3333L14.6667 14.6667',
  ],
  questions: [
    'M19.25 11C19.2431 12.2485 18.9176 13.4746 18.3042 14.5621C17.6909 15.6496 16.81 16.5625 15.7451 17.2142C14.6802 17.866 13.4665 18.2351 12.2191 18.2866C10.9716 18.3381 9.73163 18.0702 8.61667 17.5083L3.66667 18.3333L4.675 14.3C4.23739 12.3672 4.5855 10.3398 5.64273 8.66369C6.69997 6.98758 8.37973 5.80011 10.3125 5.3625C12.2453 4.92489 14.2727 5.273 15.9488 6.33023C17.6249 7.38747 18.8124 9.06723 19.25 11Z',
  ],
};
const LABELS: Record<Tab, string> = { today: 'Today', explore: 'Explore', questions: 'Questions' };

// The only fixed element at the bottom of every screen. 44px tabs + the device safe area.
export function TabBar({ current }: { current: Tab }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 border-t border-border-strong bg-bg pt-2 pb-[var(--safe-bottom)]">
      <ul className="mx-auto flex max-w-[480px]">
        {(Object.keys(LABELS) as Tab[]).map(t => (
          <li key={t} className="flex-1">
            <a href={href(t)} aria-current={t === current ? 'page' : undefined}
              className={`flex min-h-touch flex-col items-center justify-center gap-1 text-tag ${t === current ? 'font-semibold text-text' : 'font-medium text-text-3'}`}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ICONS[t].map(d => <path key={d} d={d} />)}
              </svg>
              {LABELS[t]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
