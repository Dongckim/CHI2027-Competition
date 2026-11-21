// 14b · 14e · 14f, the pure parts: a close question while typing, the rooms on the talk's floor, the places near its door,
// the previous Arc stop and the walk from it. Pure: node (tests) and the phone. Names come from the programme and the
// venue files only (data/venue/<venue>.json, <edition>.json, <venue>.labels.json).
import { terms } from '../engine/mock-core.js';
import { walkMinutes, areaOf } from '../venue/walk.js';
import { route } from '../venue/route.js';
import { minutesText, LEVEL_ORDER } from '../venue/directions.js';

// 14b: shared word roots (the mock engine's: plural, -ing, -ed, -ic) over the smaller question's words. Two shared roots at
// least, so one common word ("robot") is not "close".
export const CLOSE_MIN_SHARED = 2;
export const CLOSE_MIN_RATIO = 0.6;

/** The existing question closest to the typed text → { question, count } (count = its votes + 1: the asker and everyone who
 * voted), or null. Your own questions are not offered. */
export function closeQuestion(text, questions) {
  const mine = new Set(terms(text));
  if (mine.size < CLOSE_MIN_SHARED) return null;
  let best = null;
  for (const q of questions ?? []) {
    if (q.mine) continue;
    const theirs = new Set(terms(q.text));
    const shared = [...mine].filter(w => theirs.has(w)).length;
    const ratio = shared / Math.min(mine.size, theirs.size);
    if (shared < CLOSE_MIN_SHARED || ratio < CLOSE_MIN_RATIO) continue;
    if (!best || ratio > best.ratio || (ratio === best.ratio && q.votes > best.question.votes)) best = { question: q, ratio };
  }
  return best && { question: best.question, count: best.question.votes + 1 };
}
export const closeText = n => `${n} ${n === 1 ? 'person' : 'people'} asked something close.`;

/** A programme room's name as people say it: "P1 - Room 111" → "Room 111"; a venue area the programme splits (Areas 1+2+3)
 * by labels.areas ("Exhibit Hall (Areas 1–3)"). */
export const roomLabel = (name, area, labels) => labels?.areas?.[area] ?? name.replace(/^[A-Z]\d - /, '');
// "Room 111" → "111" for the floor row; named rooms stay whole
const short = label => label.replace(/^Room /, '');

/** 14e: the programme rooms on the talk's floor, one per venue area, in name order → { level, rooms: [{ key, label, current }] }
 * or null when the venue does not place the room. rooms: schedule.rooms ([{ key, name }]). */
export function floorRooms(venue, edition, labels, rooms, roomKey) {
  const area = edition.rooms?.[roomKey];
  const level = venue.areas[area]?.level;
  if (!level) return null;
  const seen = new Map();
  for (const r of rooms) {
    const a = edition.rooms?.[r.key];
    if (venue.areas[a]?.level !== level || (seen.has(a) && r.key !== roomKey)) continue;
    seen.set(a, { key: r.key, label: short(roomLabel(r.name, a, labels)), current: a === area });
  }
  const list = [...seen.values()].sort((x, y) => x.label.localeCompare(y.label, 'en', { numeric: true }));
  return { level, rooms: list };
}

/** 14f "Where are you?": the room's door and the corridor or foyer that door opens onto (its name on the plan). */
export function placesNear(venue, edition, roomKey, roomName) {
  const door = venue.areas[edition.rooms?.[roomKey]]?.doors?.[0];
  const out = [`${roomName} door`];
  if (!door) return out;
  const near = venue.edges.filter(e => e.a === door || e.b === door).map(e => venue.nodes[e.a === door ? e.b : e.a]?.name).find(Boolean);
  if (near && !out.includes(near)) out.push(near);
  return out;
}
export const shareText = (place, tribeName) => `I'm at ${place} · look for the ${tribeName} shape on my phone`;

/** The Arc stop right before this talk: the latest one that starts earlier the same venue day (interpretation: a stop on an
 * earlier day is not "right before"). stops: [{ key, start, roomKey }]. */
export function previousStop(stops, key, start, timeZone) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone });
  const today = day.format(start);
  let best = null;
  for (const s of stops) {
    if (s.key === key || s.start == null || s.start >= start || day.format(s.start) !== today) continue;
    if (!best || s.start > best.start) best = s;
  }
  return best;
}

const levelOf = (venue, edition, key) => venue.areas[areaOf(edition, key)]?.level ?? null;
/** "same floor", "1 floor up", "2 floors down" between the main floors (P0, P1, P2); to or from a mezzanine "up to M2";
 * levels off the stack (the Auditorium) → "another floor". */
export function floorChange(from, to) {
  if (from === to) return 'same floor';
  const a = LEVEL_ORDER.indexOf(from), b = LEVEL_ORDER.indexOf(to);
  if (a < 0 || b < 0) return 'another floor';
  const n = Math.abs(b - a) / 2; // P0 M1 P1 M2 P2: a main floor every second level
  const dir = b > a ? 'up' : 'down';
  return Number.isInteger(n) ? `${n} ${n === 1 ? 'floor' : 'floors'} ${dir}` : `${dir} to ${to}`;
}

/** 14e: "2–4 min from your previous stop · same floor", or null when the venue does not know one of the rooms. */
export function fromPreviousText(venue, edition, fromKey, toKey) {
  if (fromKey === toKey) return 'Same room as your previous stop';
  const m = walkMinutes(venue, edition, fromKey, toKey);
  if (!m) return null;
  if (m[1] === 0) return 'Same room as your previous stop';
  return `${minutesText(m)} from your previous stop · ${floorChange(levelOf(venue, edition, fromKey), levelOf(venue, edition, toKey))}`;
}

/** 14e Directions: { minutes, floor, stepFree, stepFreeMinutes } or null. The walk takes escalators where it can (the plans
 * mark no stairs); it is step-free when it uses none and stays on its level or rides an elevator, otherwise the elevator way's
 * minutes are given (null if none). stepFree null: the plan does not say how the level changes (the Auditorium): say nothing. */
export function walkSummary(venue, edition, fromKey, toKey) {
  const a = areaOf(edition, fromKey), b = areaOf(edition, toKey);
  if (!venue.areas[a]?.doors?.length || !venue.areas[b]?.doors?.length) return null;
  const floor = floorChange(venue.areas[a].level, venue.areas[b].level);
  if (a === b) return { minutes: [0, 0], floor, stepFree: true, stepFreeMinutes: null };
  const r = route(venue, a, b);
  if (!r) return null;
  const kinds = new Set(r.edges.map(e => e.kind));
  const stepFree = kinds.has('escalator') ? false : venue.areas[a].level === venue.areas[b].level || kinds.has('elevator') ? true : null;
  return { minutes: r.minutes, floor, stepFree, stepFreeMinutes: stepFree !== false ? null : route(venue, a, b, { wheelchair: true })?.minutes ?? null };
}
