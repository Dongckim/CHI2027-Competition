// 14e (alternative to Figma 745:1736, approved): "Meet the authors after the session" inside 14, with the rooms on the
// floor and a Directions summary. 14f (alternative to 745:1823): Show my shape, a full screen at #/talk/<key>/shape.
// Nothing here is saved or sent: Directions and the places are worked out on the phone, sharing goes through the phone's
// own share sheet.
import { useEffect, useRef, useState } from 'react';
import { go } from '../../router';
import { Screen, ArcButton, Sheet, Pic } from '../../components/arc';
import { floorRooms, placesNear, fromPreviousText, walkSummary, shareText, roomLabel } from '../../arc/talk.js';
import { minutesText } from '../../venue/directions.js';
import { REGISTRATION } from '../../venue/walk.js';
import { venueClock } from '../../time.js';
import { TRIBE } from '../../arc/tribes.js';
import { TribeShape } from './TribeShape';
import type { Schedule } from '../../data/load';
import type { TribeId } from '../../engine';
import pin from '../../assets/arc/icon-pin.svg';
import clock from '../../assets/arc/icon-clock.svg';

type Room = { key: string; name: string };
export type Stop = { key: string; start: number; roomKey: string };
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
// "Floor P1"; a level off the stack by its plan name ("Auditorium (lower level)")
const floorName = (s: Schedule, level: string) => (/^[PM]\d$/.test(level) ? `Floor ${level}` : s.venue.levels.find((l: { id: string }) => l.id === level)?.name ?? level);

// 14f is opened from 14, so leaving goes back in history; opened from a link, it replaces itself with 14
let fromTalk = false;
let backY = 0; // 14's scroll, given back when 14 shows again (App scrolls to the top on every route)
export const openShape = (paperKey: string) => { fromTalk = true; backY = scrollY; go(`talk/${paperKey}/shape`); };
export const takeBackY = () => { const y = backY; backY = 0; return y; };
const leaveShape = (paperKey: string) => { if (fromTalk) { fromTalk = false; history.back(); } else go(`talk/${paperKey}`, { replace: true }); };

export function AfterSession({ schedule, roomKey, roomName, sessionEnd, prev, tribe, paperKey }:
  { schedule: Schedule; roomKey: string; roomName: string; sessionEnd: number | null; prev: Stop | null; tribe: TribeId | null; paperKey: string }) {
  const [directions, setDirections] = useState(false);
  const row = useRef<HTMLUListElement>(null);
  const { venue, venueMap, venueLabels } = schedule;
  const floor = floorRooms(venue, venueMap, venueLabels, [...schedule.index.rooms.values()] as Room[], roomKey);
  const fromPrev = prev ? fromPreviousText(venue, venueMap, prev.roomKey, roomKey) : null;
  // the row scrolls sideways on its own (P1 has 23 rooms); start with this room in view
  useEffect(() => {
    const ul = row.current, cur = ul?.querySelector<HTMLElement>('[aria-current]');
    if (ul && cur) ul.scrollLeft = cur.offsetLeft - ul.clientWidth / 2 + cur.offsetWidth / 2;
  }, [roomKey]);

  return (
    <section aria-labelledby="meet" className="arc-fade mt-6 flex flex-col rounded-[20px] px-[14px] pt-3.5 pb-4">
      <h2 id="meet" className="text-[17px] font-semibold tracking-[-0.012em]">Meet the authors after the session</h2>
      <p className="mt-1.5 text-[13px] leading-[18px] font-medium text-arc-text-3">
        {[sessionEnd != null && `Session ends ${venueClock(sessionEnd, schedule.meta.timeZone)}`, `${roomName} door`, floor && floorName(schedule, floor.level)].filter(Boolean).join(' · ')}
      </p>
      {fromPrev && <p className="mt-1 text-[13px] leading-[18px] font-medium text-arc-text-3">{fromPrev}</p>}
      {floor && floor.rooms.length > 1 && (
        // Figma 745:1755: 28×38 rooms 3.6 apart, this one light with "Meet" under it (shape and word, not colour alone).
        // Figma 9px room numbers and 11px floor name; 12px is the floor. The "You" dot is left out: ARC does not know where you are.
        // tabIndex: a row that scrolls must be reachable by keyboard (axe scrollable-region-focusable)
        <ul ref={row} tabIndex={0} aria-label={`Rooms on ${floorName(schedule, floor.level)}`} className="mt-3 -mx-[14px] flex gap-[3.6px] overflow-x-auto px-[14px] pb-1 [scrollbar-width:none]">
          {floor.rooms.map(r => (
            <li key={r.key} aria-current={r.current ? 'location' : undefined} className="flex shrink-0 flex-col items-center gap-1">
              <span className={`flex h-[38px] min-w-[28px] items-center justify-center rounded-[8px] px-1 text-[12px] font-medium whitespace-nowrap ${
                r.current ? 'bg-arc-primary text-arc-on-primary' : 'bg-[#2b2a35] text-arc-text-2'}`}>{r.label}</span>
              <span className="h-[15px] text-[12px] font-semibold text-arc-text/85">{r.current ? 'Meet' : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {/* one under the other, as Figma's two buttons: side by side, "Show my shape" breaks at 200% text */}
      <div className="mt-3 flex flex-col gap-3">
        {tribe && <ArcButton kind="secondary" onClick={() => openShape(paperKey)}>Show my shape</ArcButton>}
        <ArcButton kind="secondary" onClick={() => setDirections(true)}><Pic src={pin} size={20} />Directions</ArcButton>
      </div>
      <Sheet open={directions} onClose={() => setDirections(false)} title="Directions">
        <DirectionsSummary schedule={schedule} fromKey={prev?.roomKey ?? REGISTRATION} roomKey={roomKey} roomName={roomName} />
      </Sheet>
    </section>
  );
}

// Directions = a summary (approved option a): minutes, floor change, step-free or not. From the previous Arc stop, else Registration.
function DirectionsSummary({ schedule, fromKey, roomKey, roomName }: { schedule: Schedule; fromKey: string; roomKey: string; roomName: string }) {
  const { venue, venueMap } = schedule;
  const fromRoom = ([...schedule.index.rooms.values()] as Room[]).find(r => r.key === fromKey);
  const fromName = fromRoom ? roomLabelOf(schedule, fromRoom) : venueMap.places?.find((p: { id: string }) => `place:${p.id}` === fromKey)?.name ?? 'Registration';
  const w = walkSummary(venue, venueMap, fromKey, roomKey);
  return (
    <div className="mb-2 flex flex-col">
      <p className="text-[15px] leading-[21px] text-arc-text-2">From {fromKey === REGISTRATION ? fromName : `your previous stop, ${fromName}`} to {roomName}</p>
      {!w ? <p className="mt-4 text-[16px]">No walking time for this room on the venue plan.</p> : (
        <ul className="mt-4 flex flex-col gap-3 text-[16px] font-medium">
          <li className="flex items-center gap-3"><Pic src={clock} size={20} className="opacity-70" />
            {w.minutes[1] === 0 ? 'Same room as your previous stop' : `${minutesText(w.minutes)} walk`}</li>
          <li className="flex items-center gap-3"><Pic src={pin} size={20} className="opacity-70" />{cap(w.floor)}</li>
          {w.stepFree != null && <li className="pl-8 text-[15px] leading-[21px] text-arc-text-2">
            {w.stepFree ? 'Step-free' : w.stepFreeMinutes ? `Escalators on the way · step-free by elevator in ${minutesText(w.stepFreeMinutes)}` : 'Escalators on the way'}
          </li>}
        </ul>
      )}
    </div>
  );
}
export const roomLabelOf = (s: Schedule, r: Room) => roomLabel(r.name, s.venueMap.rooms?.[r.key], s.venueLabels) as string;

/** 14f: the Arc's tribe shape, big, to be found by; the screen stays awake while it is open. */
export function ShowShape({ schedule, roomKey, roomName, tribe, paperKey }: { schedule: Schedule; roomKey: string; roomName: string; tribe: TribeId; paperKey: string }) {
  const t = TRIBE[tribe];
  const [note, setNote] = useState('');
  useWakeLock();
  const places = placesNear(schedule.venue, schedule.venueMap, roomKey, roomName) as string[];
  const share = async (place: string) => {
    const text = shareText(place, t.name);
    setNote('');
    if (navigator.share) {
      try { await navigator.share({ text }); return; }
      catch (e) { if ((e as Error).name === 'AbortError') return; } // cancelled by the person: nothing to do
    }
    try { await navigator.clipboard.writeText(text); setNote(`Copied: “${text}”`); }
    catch { setNote(`Send this: “${text}”`); } // no share sheet and no clipboard (http on a LAN): the words to copy by hand
  };
  return (
    <Screen label="Show my shape"
      bottom={<>
        {/* prototype 3 14f: found each other → talk, interpreted (14g) */}
        <ArcButton className="-mb-0.5" onClick={() => go(`talk/${paperKey}/interpret`, { replace: true })}>Start live translation</ArcButton>
        <ArcButton kind="ghost" onClick={() => leaveShape(paperKey)}>Cancel</ArcButton>
      </>}>
      {/* Figma 745:1839 at y 104 (no header row: 54 + 50) */}
      <h1 className="mt-[50px] text-[30px] font-semibold tracking-[-0.024em]">Find each other.</h1>
      <div className="arc-fade relative mt-5 h-[320px] shrink-0 rounded-[24px]">
        <TribeShape tribe={tribe} className="absolute top-[40px] left-1/2 size-[170px] -translate-x-1/2" />
        <p className="absolute inset-x-0 top-[232px] text-center text-[13px] font-medium text-arc-text-3">Look for the same shape</p>
        {/* Figma 745:1844: a 7px dot and the line; here the tribe's colour and name (never colour alone) */}
        <p className="absolute inset-x-0 top-[262px] flex items-center justify-center gap-[7px] text-[15px] font-semibold tracking-[-0.006em]">
          <span aria-hidden="true" className="size-[7px] rounded-full" style={{ background: t.color }} />{t.name}
        </p>
      </div>
      <h2 className="mt-5 text-[13px] font-medium text-arc-text-3">Where are you?</h2>
      <div className="mt-2 flex flex-wrap gap-2.5">
        {places.map(p => (
          <button key={p} type="button" onClick={() => share(p)}
            className="relative inline-flex h-[38px] max-w-full items-center rounded-full border border-arc-line bg-arc-surface px-3.5 text-[14px] font-medium tracking-[-0.006em] whitespace-nowrap text-arc-text-2 before:absolute before:inset-x-0 before:-inset-y-[4px] before:content-['']">
            <span className="truncate">{p}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-[18px] text-arc-text-2 break-words" aria-live="polite">{note}</p>
    </Screen>
  );
}

// Screen Wake Lock where the browser has it: asked on open and again when the page is shown (the browser drops it when
// hidden), released on leave.
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null, gone = false;
    const ask = () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then(l => { if (gone) l.release(); else lock = l; }, () => {});
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => { gone = true; document.removeEventListener('visibilitychange', ask); lock?.release().catch(() => {}); };
  }, []);
}
