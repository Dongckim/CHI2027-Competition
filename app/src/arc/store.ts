// My Arcs, on this phone only: IndexedDB database "arc", object store "arcs" (key = Arc.id). Never sent to a server.
// When IndexedDB is blocked (some private windows) the Arcs live in memory until the tab closes; `persistent` says so.
import { useSyncExternalStore } from 'react';
import type { Arc } from '../engine/types';

const DB = 'arc', STORE = 'arcs';
let memory = new Map<string, Arc>();
let persistent = true;
let ready: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  return (ready ??= new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { persistent = false; resolve(null); };
    } catch { persistent = false; resolve(null); }
  }));
}

const tx = async <T,>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => {
  const db = await open();
  if (!db) return undefined;
  return new Promise(resolve => {
    try {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { persistent = false; resolve(undefined); };
    } catch { persistent = false; resolve(undefined); }
  });
};

// Newest first. Loaded once, then kept in memory and written through.
let list: Arc[] | null = null;
const listeners = new Set<() => void>();
const changed = () => { list = [...memory.values()].sort((a, b) => b.createdAt - a.createdAt); listeners.forEach(l => l()); };

export async function loadArcs(): Promise<Arc[]> {
  if (list) return list;
  const stored = (await tx<Arc[]>('readonly', s => s.getAll() as IDBRequest<Arc[]>)) ?? [];
  memory = new Map([...stored, ...memory.values()].map(a => [a.id, a]));
  changed();
  if (list!.length) keepOnPhone();
  return list!;
}

export async function saveArc(arc: Arc) {
  await loadArcs(); // first save in this tab (e.g. a link opened 18): read the stored Arcs, or the list would be just this one
  memory.set(arc.id, arc);
  changed();
  await tx('readwrite', s => s.put(arc));
  keepOnPhone();
}

export async function deleteArc(id: string) {
  await loadArcs();
  memory.delete(id);
  changed();
  await tx('readwrite', s => s.delete(id));
}

// Ask the browser to keep this site's data when the phone runs short of space (user 11/25 「하루 지나면 페이지가 사라지는데
// … 한 일주일 정도 데이터가 핸드폰에 저장」). Once there is an Arc to keep; the browser decides (Safari grants it more readily
// to a Home Screen app). Best effort: no prompt in Safari or Chrome, nothing when the API is missing.
let asked = false;
function keepOnPhone() {
  if (asked || typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  asked = true;
  navigator.storage.persisted().then(p => (p ? true : navigator.storage.persist())).catch(() => {});
}

export const getArc = async (id: string) => (await loadArcs()).find(a => a.id === id) ?? null;
export const isPersistent = () => persistent;

/** null while loading, then the Arcs newest first. */
export function useArcs(): Arc[] | null {
  return useSyncExternalStore(cb => { listeners.add(cb); if (!list) loadArcs(); return () => listeners.delete(cb); }, () => list);
}
