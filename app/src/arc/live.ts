// Shared bits the Arc screens use: getting the engine ready while onboarding is read, and the tribe frame per screen.
import { useEffect, useSyncExternalStore } from 'react';
import { engine, type Progress, type TribeId } from '../engine';
import { setTribe } from './theme';

// Onboarding time is download time (guide 1): start the engine as soon as 01 opens, once.
let progress: Progress = { stage: 'download', ratio: 0 };
let failed = false;
let started: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
export function warm() {
  return (started ??= engine.init(p => { progress = p; notify(); }).catch(e => { failed = true; started = null; notify(); throw e; }));
}
const snapshot = () => (failed ? 'failed' : progress.stage === 'ready' ? 'ready' : 'loading');
export const useWarm = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, snapshot);
/** How much of the engine is in, 0–1 (10 shows it while the on-device model downloads). */
export const useWarmRatio = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => (progress.stage === 'ready' ? 1 : progress.ratio));

/** The screen's tribe frame: a tribe lights the edge, null turns it off. */
export function useTribe(tribe: TribeId | null | undefined) {
  useEffect(() => { setTribe(tribe ?? null); }, [tribe]);
}

// 07's live preview of the question's tribe, kept so 10 can light the edge before the Arc is built.
let preview: TribeId | null = null;
export const setPreviewTribe = (t: TribeId | null) => { preview = t; };
export const previewTribe = () => preview;

// The Arc last opened on 12, so 14 (#/talk/<key>) can show that Arc's angle and evidence for the talk.
let currentArc: string | null = null;
export const setCurrentArc = (id: string | null) => { currentArc = id; };
export const currentArcId = () => currentArc;
// 18 "Just read": the shared Arc being looked at without saving it, so 14 can show why each talk is there
let viewing: import('../engine').Arc | null = null;
export const setViewingArc = (arc: typeof viewing) => { viewing = arc; };
export const viewingArc = () => viewing;
