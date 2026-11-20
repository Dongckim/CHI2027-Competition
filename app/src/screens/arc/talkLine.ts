// What a talk node says: its time and room (data/build, not the engine) and the screen-reader name
// "<angle> · <title> · <time>".
import { dateOf, clockOf, firstSlot } from '../../explore/format';
import type { Schedule } from '../../data/load';
import { ANGLE_NAME } from './AngleHelp';
import type { Angle } from '../../engine';

type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
export function whenWhere(schedule: Schedule, paperKey: string) {
  const p = schedule.index.papers.get(paperKey) as { slots: Slot[] } | undefined;
  const s = p ? firstSlot(p.slots) : null;
  const tz = schedule.meta.timeZone;
  if (!s) return { time: 'Time to be announced', room: '' };
  return { time: `${dateOf(s.start, tz)} · ${clockOf(s.start, tz)}`, room: schedule.index.rooms.get(s.roomKey)?.name ?? 'Room to be announced' };
}
export const nodeName = (angle: Angle, title: string, time: string) => `${ANGLE_NAME[angle]} · ${title} · ${time}`;
