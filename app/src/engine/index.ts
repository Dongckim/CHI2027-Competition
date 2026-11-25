// The one place that picks the engine: ondevice in the deploy build (VITE_ENGINE=ondevice, user 11/21 「기본 엔진 ondevice로
// 전환」), mock in a plain build (no model there). ?engine=mock|ondevice picks one for that visit.
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
  buildArc: (q, o) => get().then(e => e.buildArc(q, o)), suggest: (q, a, x, l, f) => get().then(e => e.suggest(q, a, x, l, f)),
  wildcard: (q, x, l, f) => get().then(e => e.wildcard(q, x, l, f)), // f: the Arc's days and kinds (dropped here until 11/25)
  judge: (q, k) => get().then(e => e.judge(q, k)),
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
  suggest: (q, a, x, l, f) => pick().then(e => e.suggest(q, a, x, l, f)),
  wildcard: (q, x, l, f) => pick().then(e => e.wildcard(q, x, l, f)),
  judge: (q, k) => pick().then(e => e.judge(q, k)),
};
export type * from './types';
// 07b: the chosen engine's topic questions and their preview Arcs (ondevice: composed questions, user 11/21); loaded only
// when 07b shows.
export const topicHelp = (): Promise<{ topicQuestions(t: string): Promise<{ count: number; questions: { text: string; key: string }[] }>; questionArc(q: string): Promise<import('./types').Arc> }> =>
  ENGINE_NAME === 'ondevice' ? import('./ondevice') : import('./mock');
