// The engine contract shared with recsys (Wonjune). Arc matches contracts/Arc.schema.json 0.2.0 (0.1.0 Arcs still read).
// The engine decides only what to show and under which angle; times, rooms, authors and sessions come from data/build by key.

export type Angle = 'S' | 'R' | 'T'; // Support ↑ · Reframe ↻ · Tension ⊣
export type TribeId =
  | 'ai' | 'xr' | 'access' | 'health'
  | 'learning' | 'society' | 'devices' | 'design';

export interface Evidence { sentence: string; start: number; end: number } // abstract.slice(start, end) === sentence (UTF-16)

export interface ArcNode {
  key: string;               // "chi2026:222795" (with edition)
  angle: Angle;
  label: string;             // short name for the map node, at most 24 characters
  evidence: Evidence | null; // abstract quote; null when not sure
  debut: boolean;            // first author new to CHI (map/list ✦); 14 marks every new author from debut.json
  kind?: ReframeKind;        // 0.2.0, Reframes only: how it looks at the question differently (12, 13, 14 show it)
}
export type ReframeKind = 'subject' | 'factor' | 'measure' | 'people';

export interface Arc {
  schema_version: '0.1.0' | '0.2.0'; // new Arcs are 0.2.0
  id: string;                // random id made on the device
  edition: string;           // "chi2026"
  query: string;             // as the user wrote it (200 characters at most)
  tribe: TribeId;
  nodes: ArcNode[];
  tension: 'found' | 'none' | 'pending' | 'off'; // none ≠ pending (23 vs 25); off = Tension not chosen (no 23)
  filters: { days: string[]; types: string[] };
  source: 'mine' | 'received';
  engine: string;            // "mock@0.1" | "ondevice@<model version>"
  createdAt: number;
}

export type Progress = { stage: 'download' | 'warmup' | 'ready'; ratio: number };
export type AngleTopic = { id: string; label: string }; // id = sessionKey

export interface Engine {
  init(onProgress: (p: Progress) => void): Promise<void>;
  // runnerUp: the second tribe, first in 11's Change list (user 11/21). The ondevice engine gives it; added after Arc
  // 0.1.0 was shared, outside the Arc contract: Wonjune to confirm.
  tribeOf(query: string): Promise<{ tribe: TribeId; confidence: number; runnerUp?: TribeId }>;
  angleTopics(query: string): Promise<Record<Angle, AngleTopic[]>>; // 08: 3–5 per angle
  // walk: 09 "How you walk" (calm, step_free); the mock engine ignores it
  buildArc(query: string, opts: { angles: Angle[]; topicIds?: string[]; days: string[]; types: string[]; walk?: string[] }): Promise<Arc>;
  // filters (user 11/25 「Swap·24b가 09의 날짜·형식 선택을 따르게 (엔진 선택 필드, 원준 확인 필요)」): the Arc's own days and
  // kinds, so a swap or 24b offers no poster or other day the person left out; none = the whole week, every kind
  suggest(query: string, angle: Angle, excludeKeys: string[], limit?: number, filters?: Arc['filters']): Promise<ArcNode[]>; // 15: same angle
  // 15 Wildcard (user decision 2026-11-20): talks a step away from the question, to break the filter bubble. The engine
  // picks each one's angle. Added after Arc 0.1.0 was shared: Wonjune to confirm.
  wildcard(query: string, excludeKeys: string[], limit?: number, filters?: Arc['filters']): Promise<ArcNode[]>;
}

export const QUERY_MAX = 200;
