// Wonjune's on-device engine (recsys/) behind the same Engine interface. It runs in a Web Worker (ondevice.worker.js);
// this side only sends requests. The model is fetched only when this module loads, which index.ts does only when the
// ondevice engine is chosen (?engine=ondevice while the two are compared, user 11/21).
import current from '../../../data/build/app-data/chi2026/current.json';
import { EDITION, loadAbstracts } from '../data/load';
import { now } from '../clock.js';
import venue from '../../../data/venue/chi2026.json';
import { newArcId } from './mock';
import { onOurAbstract } from './ondevice-map.js';
import { brokenQuestion } from '../arc/topic.js';
import type { Engine, Progress, Arc, ArcNode } from './types';

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let onProgress: ((p: Progress) => void) | null = null;

function call<T>(op: string, args: object): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./ondevice.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.progress) { onProgress?.(data.progress); return; }
      const w = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.ok) w?.resolve(data.value); else w?.reject(new Error(data.error));
    };
    worker.onerror = e => { for (const w of waiting.values()) w.reject(new Error(e.message || 'ondevice worker failed')); waiting.clear(); worker = null; };
  }
  const id = ++seq;
  return new Promise<T>((resolve, reject) => { waiting.set(id, { resolve: resolve as (v: unknown) => void, reject }); worker!.postMessage({ id, op, args }); });
}

let ready: Promise<void> | null = null;
const init = () => (ready ??= call<void>('init', { edition: EDITION, timeZone: venue.timeZone }).catch(e => { ready = null; throw e; }));
const after = <T,>(op: string, args: object) => init().then(() => call<T>(op, args));

// Every quote checked on our abstract (the one 14 shows), and moved when the package's trimmed abstract shifted it
let abstracts: Promise<Record<string, string>> | null = null;
const ours = () => (abstracts ??= Promise.all([...current.days, 'unscheduled'].map(d => loadAbstracts(d))).then(l => Object.assign({}, ...l)).catch(e => { abstracts = null; throw e; }));
const placed = async (nodes: ArcNode[]) => { const a = await ours(); return nodes.map(n => ({ ...n, evidence: onOurAbstract(n.evidence, a[n.key]) })); };

export const ondeviceEngine: Engine = {
  async init(p) {
    onProgress = p;
    p({ stage: 'download', ratio: 0 });
    await init();
    p({ stage: 'ready', ratio: 1 });
  },
  tribeOf: query => after('tribeOf', { query }),
  angleTopics: query => after('angleTopics', { query }),
  buildArc: async (query, opts) => {
    const arc = await after<Arc>('buildArc', { query, opts, id: newArcId(), createdAt: Date.now(), now: now() });
    return { ...arc, nodes: await placed(arc.nodes) };
  },
  suggest: (query, angle, excludeKeys, limit, filters) => after<ArcNode[]>('suggest', { query, angle, excludeKeys, limit, filters }).then(placed),
  wildcard: (query, excludeKeys, limit, filters) => after<ArcNode[]>('wildcard', { query, excludeKeys, limit, filters }).then(placed),
  judge: async (query, keys) => {
    const l = await after<(ArcNode | null)[]>('judge', { query, keys });
    const ok = await placed(l.filter((n): n is ArcNode => !!n));
    return l.map(n => (n ? ok.shift()! : null));
  },
  paperQuestions: key => after<string[]>('paperQuestions', { key }),
};

// 07b (user 11/21 「원준 방식(조합 문장)」): the engine's composed questions, without those that read wrong; none left →
// the mock's real-title questions. The preview Arcs (counts, mini map) are this engine's, cached per question.
export async function topicQuestions(topic: string): Promise<{ count: number; questions: { text: string; key: string }[] }> {
  const r = await after<{ count: number; questions: string[] }>('topic', { topic, now: now() });
  const composed = r.questions.filter(q => !brokenQuestion(q)).map(text => ({ text, key: text }));
  return { count: r.count, questions: composed.length ? composed : (await (await import('./mock')).topicQuestions(topic)).questions };
}
const previews = new Map<string, Promise<Arc>>();
export function questionArc(question: string): Promise<Arc> {
  if (!previews.has(question)) previews.set(question, ondeviceEngine.buildArc(question, { angles: ['S', 'R', 'T'], days: [], types: [] }).catch(e => { previews.delete(question); throw e; }));
  return previews.get(question)!;
}
