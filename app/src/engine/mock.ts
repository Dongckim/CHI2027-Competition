// Mock engine on the phone: the rules in mock-core.js over the app data, with a delay so screens see the same flow as the
// real model. ?mock=slow (5 s loading) · none (no Tension → 23) · pending (angles still sorting → 25) · crowded (→ 24).
import current from '../../../data/build/app-data/chi2026/current.json';
import { loadSchedule, loadAbstracts, loadTopics, loadDebut } from '../data/load';
import * as core from './mock-core.js';
import { questionOf } from '../arc/topic.js';
import { labelOf } from '../arc/label.js';
import type { Engine, Arc, ArcNode, Angle, AngleTopic, TribeId } from './types';

type Mode = 'normal' | 'slow' | 'none' | 'pending' | 'crowded';
const MODES: Mode[] = ['normal', 'slow', 'none', 'pending', 'crowded'];
const asked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('mock');
export const MODE: Mode = MODES.includes(asked as Mode) ? (asked as Mode) : 'normal';
const DELAY_MS = 1200;
const SLOW_MS = 5000;

// Random id on the device. getRandomValues works on any origin; randomUUID needs https or localhost, and the phone opens
// `npm run dev` over plain http on the LAN.
export const newArcId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
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
  buildArc: (query, opts) => answer(i => {
    const arc = (core.buildArc as (...a: unknown[]) => unknown)(i, query, opts, { // mock-core.js is untyped JS
      id: newArcId(), createdAt: Date.now(), mode: MODE === 'slow' ? 'normal' : MODE,
    }) as Arc;
    return opts.mine?.length ? { ...arc, nodes: arc.nodes.filter(n => !opts.mine!.includes(n.key)) } : arc; // the person's own talks are no stops
  }),
  suggest: (query, angle, excludeKeys, limit) => answer(i => core.suggest(i, query, angle, excludeKeys, limit) as ArcNode[]),
  wildcard: (query, excludeKeys, limit) => answer(i => core.wildcard(i, query, excludeKeys, limit) as ArcNode[]),
  judge: async (query, keys) => core.judge(await index(), query, keys) as (ArcNode | null)[], // no delay: it runs as the person types
  // 07r: the mock has no results reading; the paper's own question, else one about its title
  paperQuestions: async key => {
    const p = (await index()).byKey?.get(key) as { title: string } | undefined;
    if (!p) return [];
    return [questionOf(p.title) ?? `What does ${labelOf(p.title)} find?`];
  },
};

// 07b "Make it a question" (approved 11/21): not part of the Engine contract. It reads the mock index directly, with no
// delay, so the counts on its cards are what the mock engine builds for that question. Arcs are cached per question.
const questionArcs = new Map<string, Arc>();
export const topicQuestions = async (topic: string) => core.topicQuestions(await index(), topic) as { count: number; questions: { text: string; key: string }[] };
export async function questionArc(question: string): Promise<Arc> {
  const i = await index();
  if (!questionArcs.has(question)) questionArcs.set(question, (core.buildArc as (...a: unknown[]) => Arc)(i, question, { angles: ['S', 'R', 'T'] }, { id: 'preview', createdAt: 0 }));
  return questionArcs.get(question)!;
}
