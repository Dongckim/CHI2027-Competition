// The offline line (03-L). Pure.
import { venueClock } from '../time.js';
export const offlineNote = (online, savedAt, timeZone) =>
  online ? null : savedAt ? `Offline · saved at ${venueClock(savedAt, timeZone)}` : 'Offline · showing what is on this phone';
