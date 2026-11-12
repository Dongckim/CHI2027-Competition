import type { ReactNode } from 'react';
import { useDevice } from '../state/useDevice';

// 44px header. Default: wordmark left, search and settings right. Onboarding: a back button, an optional title and a step count.
// search: the magnifier that opens Explore from any screen (on by default with the wordmark; off on Explore itself).
export function Header({ title, back, right, wordmark = !back, search = wordmark }: { title?: string; back?: () => void; right?: ReactNode; wordmark?: boolean; search?: boolean }) {
  return (
    <header className="flex min-h-touch items-center gap-1 px-gutter">
      {back && (
        <button type="button" aria-label="Back" onClick={back} className="-ml-3 grid size-touch place-items-center text-text">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m12.5 4-6 6 6 6" /></svg>
        </button>
      )}
      {wordmark && <span className="text-card-title font-semibold">ARC</span>}
      {title && <h1 className="text-header font-semibold">{title}</h1>}
      <span className="ml-auto flex items-center">
        {search && <a href="#/explore" aria-label="Search" className="grid size-touch place-items-center text-text">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2" /></svg>
        </a>}
        {right ?? (wordmark && <Settings />)}
      </span>
    </header>
  );
}

// TODO(S7): point to the 17 Settings screen. Until then the gear opens "Your plan" (O-5) so the plan can be changed.
// Only once a plan is built: before that, the gear would let people skip onboarding (sample day, browse).
function Settings() {
  if (!useDevice().builtAt) return null;
  return (
    <a href="#/start/summary" aria-label="Settings" className="-mr-3 grid size-touch place-items-center text-text">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.1z" />
      </svg>
    </a>
  );
}
