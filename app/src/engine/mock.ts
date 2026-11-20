// Mock engine on the phone: the rules in mock-core.js over the app data, with a delay so screens see the same flow as the
// real model. ?mock=slow (5 s loading) · none (no Tension → 23) · pending (angles still sorting → 25) · crowded (→ 24).
import current from '../../../data/build/app-data/chi2026/current.json';
import { loadSchedule, loadAbstracts, loadTopics, loadDebut } from '../data/load';
import * as core from './mock-core.js';
import type { Engine, Arc, ArcNode, Angle, AngleTopic, TribeId } from './types';

type Mode = 'normal' | 'slow' | 'none' | 'pending' | 'crowded';
const MODES: Mode[] = ['normal', 'slow', 'none', 'pending', 'crowded'];
const asked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('mock');
export const MODE: Mode = MODES.includes(asked as Mode) ? (asked as Mode) : 'normal';
const DELAY_MS = 1200;
const SLOW_MS = 5000;

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
let indexPromise: Promise<ReturnType<typeof core.buildIndex>> | null = null;

async function loadIndex(onProgress: (ratio: number) => void) {
  const days = [...current.days, 'unscheduled'];
  let done = 0;
  const step = <T,>(p: Promise<T>) => p.then(x => { onProgress(++done / (days.length + 3)); return x; });
  const [schedule, topics, debut, ...abstractDays] = await Promise.all([
    step(loadSchedule()), step(loadTopics()), step(loadDebut()), ...days.map(d => step(loadAbstracts(d))),
  ]);
  const abstracts: Record<string, string> = Object.assign({}, ...abstractDays);
  type P = { paperKey: string; title: string; feedType: string; authors: string[]; slots: { sessionKey: string; start: number | null }[] };
  const papers = (schedule as { index: { papers: Map<string, P> } }).index.papers;
  return core.buildIndex({
    meta: schedule.meta, topics, debut,
    sessions: schedule.sessions.map((s: { key: string; name: string }) => ({ key: s.key, name: s.name })),
    papers: [...papers.values()].map(p => ({ key: p.paperKey, title: p.title, type: p.feedType, abstract: abstracts[p.paperKey] ?? '',
      authors: p.authors, slots: p.slots.map(s => ({ sessionKey: s.sessionKey, start: s.start })) })),
  });
}

const index = () => (indexPromise ??= loadIndex(() => {}).catch(e => { indexPromise = null; throw e; }));
const answer = async <T,>(f: (i: Awaited<ReturnType<typeof index>>) => T): Promise<T> => {
  const [i] = await Promise.all([index(), wait(DELAY_MS)]);
  return f(i);
};

export const mockEngine: Engine = {
  async init(onProgress) {
    const started = Date.now();
    const total = MODE === 'slow' ? SLOW_MS : DELAY_MS;
    onProgress({ stage: 'download', ratio: 0 });
    indexPromise ??= loadIndex(r => onProgress({ stage: 'download', ratio: r })).catch(e => { indexPromise = null; throw e; });
    await indexPromise;
    onProgress({ stage: 'warmup', ratio: 1 });
    await wait(Math.max(0, total - (Date.now() - started)));
    onProgress({ stage: 'ready', ratio: 1 });
  },
  tribeOf: query => answer(i => core.tribeOf(i, query) as { tribe: TribeId; confidence: number }),
  angleTopics: query => answer(i => core.angleTopics(i, query) as Record<Angle, AngleTopic[]>),
  buildArc: (query, opts) => answer(i => (core.buildArc as (...a: unknown[]) => unknown)(i, query, opts, { // mock-core.js is untyped JS
    id: crypto.randomUUID(), createdAt: Date.now(), mode: MODE === 'slow' ? 'normal' : MODE,
  }) as Arc),
  suggest: (query, angle, excludeKeys, limit) => answer(i => core.suggest(i, query, angle, excludeKeys, limit) as ArcNode[]),
};
