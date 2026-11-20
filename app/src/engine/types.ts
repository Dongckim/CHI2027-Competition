// The engine contract shared with recsys (Wonjune). Arc matches contracts/Arc.schema.json 0.1.0.
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
}

export interface Arc {
  schema_version: '0.1.0';
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
  tribeOf(query: string): Promise<{ tribe: TribeId; confidence: number }>;
  angleTopics(query: string): Promise<Record<Angle, AngleTopic[]>>; // 08: 3–5 per angle
  buildArc(query: string, opts: { angles: Angle[]; topicIds?: string[]; days: string[]; types: string[] }): Promise<Arc>;
  suggest(query: string, angle: Angle, excludeKeys: string[], limit?: number): Promise<ArcNode[]>; // 15: same angle
}

export const QUERY_MAX = 200;
