// Starts the demo clock once, before the first screen (main.tsx). isAutoDemo() → the banner on time screens.
import current from '../../../data/build/app-data/chi2026/current.json';
import venue from '../../../data/venue/chi2026.json';
import { setDemoNow, realNow } from '../clock.js';
import { demoInstant } from './demo.js';

let auto = false;
export function startDemoClock() {
  let at: string | null = null;
  try { at = new URLSearchParams(location.search).get('at'); } catch { /* no URL */ }
  const d = demoInstant({ days: current.days, timeZone: venue.timeZone, now: realNow(), at });
  if (d) { setDemoNow(d.ms); auto = d.auto; }
}
export const isAutoDemo = () => auto;
export const DEMO_TZ: string = venue.timeZone;
