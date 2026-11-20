// The tribe frame: one attribute on <html>, so CSS (tokens.css --tribe, index.css glow) does the rest. null = no Arc, no glow.
import { TRIBE, type TribeId } from './tribes.js';

export function setTribe(tribe: TribeId | null) {
  const root = document.documentElement;
  if (tribe && tribe in TRIBE) root.dataset.tribe = tribe;
  else delete root.dataset.tribe;
}

/** "still" stops the slow breathing for people who want no motion even without the system setting. */
export const setGlowStill = (still: boolean) => { document.documentElement.dataset.glow = still ? 'still' : 'breathe'; };
