// What 12, 13 and 15 need about one Arc: the stored Arc, the programme (titles, times, rooms), the node states on the
// clock, and the text a node shows. `?at=2026-04-14T13:30` (venue time) sets the demo clock, to see Next/Ended states.
import { useEffect, useMemo, useState } from 'react';
import { go } from '../../router';
import { getArc, saveArc } from '../../arc/store';
import { loadSchedule, type Schedule } from '../../data/load';
import { useDevice } from '../../state/useDevice';
import { heardOf } from '../../arc/draft.js';
import { nodeStates, type NodeState } from '../../arc/map.js';
import { useNow, setDemoNow, isDemo } from '../../clock.js';
import { venueInstant, venueClock } from '../../time.js';
import { dateOf, clockOf, firstSlot } from '../../explore/format';
import { useTribe, setCurrentArc } from '../../arc/live';
import type { Arc } from '../../engine';
import type { Info } from './ArcView';

type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
type Paper = { title: string; feedType: string; slots: Slot[]; authors: string[]; doi: string | null };

let demoSet = false;
function demoFromUrl(tz: string) {
  if (demoSet || isDemo()) return;
  demoSet = true;
  const m = new URLSearchParams(location.search).get('at')?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (m) setDemoNow(venueInstant(m[1], Number(m[2]) * 60 + Number(m[3]), tz));
}

/** "P1 - Room 116" → "Rm 116" on the map (Figma), the poster area → "Posters"; other rooms as the programme names them. */
export const shortRoom = (name: string) => {
  const room = name.match(/Room\s+(\S+)/i)?.[1];
  return room ? `Rm ${room}` : /posters?/i.test(name) ? 'Posters' : name; // "Area 1 + 2 + 3: posters" → "Posters"
};

export function useArc(id: string) {
  const [arc, setArc] = useState<Arc | null | undefined>(undefined);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const state = useDevice();
  const heard = useMemo(() => heardOf(state), [state]);
  useEffect(() => { setCurrentArc(id); getArc(id).then(setArc); }, [id]);
  useEffect(() => { loadSchedule().then(s => { demoFromUrl(s.meta.timeZone); setSchedule(s); }, () => {}); }, []);
  useEffect(() => { if (arc === null) go('home', { replace: true }); }, [arc]);
  useTribe(arc?.tribe);
  const now = useNow();
  const tz = schedule?.meta.timeZone ?? 'UTC';
  const paper = (key: string) => schedule?.index.papers.get(key) as Paper | undefined;
  const timeOf = (key: string) => { const s = paper(key) ? firstSlot(paper(key)!.slots) : null; return s ? { start: s.start, end: s.end } : null; };
  const states = useMemo(() => (arc ? nodeStates(arc.nodes, timeOf, now, heard) : new Map()) as Map<string, NodeState>, [arc, schedule, now, heard]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = (key: string): Info => {
    const p = paper(key), s = p ? firstSlot(p.slots) : null;
    const room = s ? schedule!.index.rooms.get(s.roomKey)?.name ?? '' : '';
    const node = arc?.nodes.find(n => n.key === key);
    return {
      title: p?.title ?? node?.label ?? key, short: node?.label ?? p?.title ?? key,
      time: s ? `${dateOf(s.start, tz)} · ${clockOf(s.start, tz)}` : 'Time to be announced',
      when: s ? `${venueClock(s.start, tz)}${room ? ` · ${shortRoom(room)}` : ''}` : '', room: room ? shortRoom(room) : '',
    };
  };
  const save = async (next: Arc) => { await saveArc(next); setArc(next); };
  return { arc, schedule, states, info, paper, save, now };
}
