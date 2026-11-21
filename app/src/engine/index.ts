// The one place that picks the engine: mock (default) or ondevice (?engine=ondevice, or VITE_ENGINE=ondevice at build).
// Screens import `engine` from here and nothing else from app/src/engine.
import type { Engine } from './types';

const asked = (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('engine')) ?? import.meta.env.VITE_ENGINE;
export const ENGINE_NAME: 'mock' | 'ondevice' = asked === 'ondevice' ? 'ondevice' : 'mock';

let chosen: Promise<Engine> | null = null;
const pick = () => (chosen ??= ENGINE_NAME === 'ondevice'
  ? import('./ondevice').then(m => m.ondeviceEngine)
  : import('./mock').then(m => m.mockEngine));

export const engine: Engine = {
  init: onProgress => pick().then(e => e.init(onProgress)),
  tribeOf: q => pick().then(e => e.tribeOf(q)),
  angleTopics: q => pick().then(e => e.angleTopics(q)),
  buildArc: (q, o) => pick().then(e => e.buildArc(q, o)),
  suggest: (q, a, x, l) => pick().then(e => e.suggest(q, a, x, l)),
  wildcard: (q, x, l) => pick().then(e => e.wildcard(q, x, l)),
};
export type * from './types';
// 07b reads the mock index for its counts whatever engine is chosen (approved 11/21); loaded only when 07b shows.
export const topicHelp = () => import('./mock');
