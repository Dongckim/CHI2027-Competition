import { useSyncExternalStore } from 'react';

export const TABS = ['today', 'explore', 'questions'] as const;
export type Tab = (typeof TABS)[number];

// Hash routes (#/today, #/start/topics …): work on any static host, survive reload, and the back button just works.
const read = () => location.hash.replace(/^#\/?/, '');
const subscribe = (cb: () => void) => { addEventListener('hashchange', cb); return () => removeEventListener('hashchange', cb); };
export const useRoute = () => useSyncExternalStore(subscribe, read);
export const href = (path: string) => `#/${path}`;
export const go = (path: string, { replace = false } = {}) => {
  if (replace) location.replace(href(path)); else location.hash = `/${path}`;
};
export const tabOf = (route: string): Tab | null => {
  const head = route.split('/')[0];
  return (TABS as readonly string[]).includes(head) ? (head as Tab) : null;
};
