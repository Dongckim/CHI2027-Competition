import { useSyncExternalStore } from 'react';

export const TABS = ['today', 'explore', 'questions'] as const;
export type Tab = (typeof TABS)[number];

// Hash routes (#/today …): work on any static host, survive reload, and the back button just works.
const current = (): Tab => {
  const t = location.hash.replace(/^#\/?/, '').split('/')[0];
  return (TABS as readonly string[]).includes(t) ? (t as Tab) : 'today';
};
const subscribe = (cb: () => void) => { addEventListener('hashchange', cb); return () => removeEventListener('hashchange', cb); };
export const useTab = () => useSyncExternalStore(subscribe, current);
export const href = (t: Tab) => `#/${t}`;
