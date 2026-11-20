// What 12, 13 and 15 need about one Arc: the stored Arc, the programme (titles, times, rooms), the node states on the
// clock (app/src/arc/demoClock.ts: real, or the demo day outside the conference), and the text a node shows.
import { useEffect, useMemo, useState } from 'react';
import { go } from '../../router';
import { getArc, saveArc } from '../../arc/store';
import { loadSchedule, type Schedule } from '../../data/load';
import { useDevice } from '../../state/useDevice';
import { heardOf } from '../../arc/draft.js';
import { nodeStates, type NodeState } from '../../arc/map.js';
import { useNow } from '../../clock.js';
import { venueClock } from '../../time.js';
import { dateOf, clockOf, firstSlot } from '../../explore/format';
import { useTribe, setCurrentArc } from '../../arc/live';
import type { Arc } from '../../engine';
import type { Info } from './ArcView';

type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
type Paper = { title: string; feedType: string; slots: Slot[]; authors: string[]; doi: string | null };

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
  useEffect(() => { loadSchedule().then(setSchedule, () => {}); }, []);
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
