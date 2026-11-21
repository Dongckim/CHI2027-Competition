// The one place that picks the engine: mock (default) or ondevice (?engine=ondevice, or VITE_ENGINE=ondevice at build).
// Screens import `engine` from here and nothing else from app/src/engine.
import type { Engine } from './types';

const asked = (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('engine')) ?? import.meta.env.VITE_ENGINE;
export const ENGINE_NAME: 'mock' | 'ondevice' = asked === 'ondevice' ? 'ondevice' : 'mock';

const load = { mock: () => import('./mock').then(m => m.mockEngine), ondevice: () => import('./ondevice').then(m => m.ondeviceEngine) };
let chosen: Promise<Engine> | null = null;
const pick = () => (chosen ??= load[ENGINE_NAME]());

// One engine per Arc (user 11/21 「한 Arc를 만들 때 mock과 ondevice를 섞지 마」): 15 Add/Swap and 12b Hold ask the engine that
// built the Arc (arc.engine "mock@…" / "ondevice@…"), whichever is chosen now. A received Arc ("shared@1") has no engine
// of its own, so it gets the chosen one.
const lazy = (get: () => Promise<Engine>): Engine => ({
  init: p => get().then(e => e.init(p)), tribeOf: q => get().then(e => e.tribeOf(q)), angleTopics: q => get().then(e => e.angleTopics(q)),
  buildArc: (q, o) => get().then(e => e.buildArc(q, o)), suggest: (q, a, x, l) => get().then(e => e.suggest(q, a, x, l)),
  wildcard: (q, x, l) => get().then(e => e.wildcard(q, x, l)),
});
const byName = { mock: lazy(load.mock), ondevice: lazy(load.ondevice) };
export const engineFor = (arcEngine: string): Engine => {
  const name = arcEngine.split('@')[0];
  return name === 'mock' || name === 'ondevice' ? byName[name] : engine;
};

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
