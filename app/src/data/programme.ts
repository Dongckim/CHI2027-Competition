import { useSyncExternalStore } from 'react';
import current from '../../../data/build/app-data/chi2026/current.json';
import { indexData } from '../planner/plan.js';
import { sessionSlotsFrom } from '../today/card.js';
import { checkDue, fakeRoomChange, CHECK_EVERY_MS } from '../today/changes.js';
import { realNow } from '../clock';
import type { Schedule } from './load';

// Programme updates while the app is open (03-M). Every minute, only while the page is visible, ask the feed for
// version.json?t=… (CLAUDE.md: never more than every 30 s). A new revision → download that revision file only (the
// service worker keeps it) → normalize it with the same buildEdition as the data build → Today plans on the new
// programme and shows what moved in my plan. The deploy's own app data stays as it is.
const FEED = 'https://chidigitalexperience.org/data';
type Update = { revision: number; schedule: Schedule; simulated?: boolean } | null;

let update: Update = null;
let lastCheckedAt: number | null = null;
let checking = false;
const listeners = new Set<() => void>();
const set = (u: Update) => { update = u; listeners.forEach(l => l()); };
export const useProgrammeUpdate = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => update);

const SEEN = 'arc.programmeSeen';
export const seenRevision = () => { try { return Number(localStorage.getItem(SEEN)) || null; } catch { return null; } };
export const markSeen = (revision: number) => { try { localStorage.setItem(SEEN, String(revision)); } catch {} listeners.forEach(l => l()); };

async function check(base: Schedule) {
  if (checking || document.visibilityState !== 'visible' || !checkDue(lastCheckedAt, realNow())) return;
  checking = true;
  lastCheckedAt = realNow();
  try {
    // A simple GET (no custom headers): the feed answers with access-control-allow-origin: * but no preflight.
    const version = await (await fetch(`${FEED}/${current.edition}/version.json?t=${realNow()}`, { cache: 'no-store' })).json();
    const known = update?.revision ?? current.revision;
    if (!(version.revision > known)) return;
    const feed = await (await fetch(version.revision_url)).json();
    const { buildEdition } = await import('../../../data/scripts/edition.mjs');
    const out = buildEdition(feed, { edition: current.edition, version, timeZone: base.meta.timeZone, institutions: {} });
    set({ revision: version.revision, schedule: scheduleFrom(base, out) });
  } catch {
    // offline or the feed is down: keep the programme we have, try again next minute
  } finally { checking = false; }
}

type Edition = ReturnType<typeof import('../../../data/scripts/edition.mjs').buildEdition>;
function scheduleFrom(base: Schedule, out: Edition): Schedule {
  const papers = out.papers.map((p: { key: string | null }) => ({ ...p, paperKey: p.key as string }));
  return {
    ...base, meta: { ...base.meta, revision: out.meta.revision, publicationVersion: out.meta.publicationVersion }, sessions: out.sessions,
    index: indexData({ meta: out.meta, papers, sessions: out.sessions, rooms: out.rooms }),
    sessionSlots: sessionSlotsFrom(papers), timing: new Map(out.sessions.map(s => [s.key as string, s.timing])),
  };
}

// Started by Today. Checks now, then every minute; a hidden tab skips checks, coming back checks if one is due.
export function watchProgramme(base: Schedule) {
  const tick = () => { void check(base); };
  tick();
  const timer = setInterval(tick, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', tick);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
}

// For testing 03-M without a real feed change: the same path, with one talk moved to another room.
// Sample day only: "Simulate a room change", or open the sample day with ?simulate=room-change. Leaving the sample day
// drops the simulated change (clearSimulated), so a real plan never shows it.
export function simulateRoomChange(base: Schedule, paperKey: string) {
  set({ revision: (update?.revision ?? current.revision) + 1, schedule: { ...base, index: fakeRoomChange(base.index, paperKey) }, simulated: true });
}
export const clearProgrammeUpdate = () => set(null);
export const clearSimulated = () => { if (update?.simulated) set(null); };
