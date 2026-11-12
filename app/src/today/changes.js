// Programme updates (03-M). Pure: what changed for the stops in my plan between two programme versions, a fake change
// for testing, and when the next version check is due.
export const CHECK_EVERY_MS = 60_000; // CLAUDE.md: version.json at most every 30 s, 1 min recommended
export const MIN_CHECK_MS = 30_000;
export const checkDue = (lastCheckedAt, now) => lastCheckedAt == null || now - lastCheckedAt >= CHECK_EVERY_MS;

// stops: the planned stops (with sessionKey, roomKey, start). Indexes: { papers: Map, rooms: Map } before and after.
// → [{ paperKey, kind: 'room' | 'time' | 'gone', from, to }] — only for my stops.
export function diffStops(stops, before, after) {
  const changes = [];
  for (const s of stops) {
    const now = after.papers.get(s.paperKey);
    const slot = now?.scheduled ? now.slots.find(x => x.sessionKey === s.sessionKey) ?? null : null;
    if (!slot || slot.start == null) { changes.push({ paperKey: s.paperKey, kind: 'gone', from: s.start, to: null }); continue; }
    if (slot.roomKey !== s.roomKey) changes.push({ paperKey: s.paperKey, kind: 'room', from: s.roomKey, to: slot.roomKey });
    if (slot.start !== s.start) changes.push({ paperKey: s.paperKey, kind: 'time', from: s.start, to: slot.start });
  }
  return changes;
}

// A copy of the programme where one talk moved to another room (for trying 03-M without a real feed change).
export function fakeRoomChange(index, paperKey) {
  const paper = index.papers.get(paperKey);
  const from = paper?.slots[0]?.roomKey;
  const to = [...index.rooms.keys()].find(k => k !== from && index.rooms.get(k).name?.startsWith('P1 - Room')) ?? [...index.rooms.keys()].find(k => k !== from);
  if (!paper || !to) return index;
  const papers = new Map(index.papers);
  papers.set(paperKey, { ...paper, slots: paper.slots.map(s => ({ ...s, roomKey: to })) });
  return { ...index, papers };
}
