// An empty angle (user 11/28 「빈 관점: "No clear challenge at CHI this year." 유지 + 아래에 "Try a broader question ›" + 질문 1개.
// Supports 비었을 때도 같은 틀」): the empty line stays a finding, and under it one wider question whose Arc has that angle.
// Wider = the question's factor (or topic) alone, asked the way 07b does; on this phone, nothing sent.
import { useEffect, useState } from 'react';
import { go } from '../../router';
import { topicHelp, type Angle, type Arc } from '../../engine';
import { factorOf, topicOf } from '../../arc/topic.js';
import { setQuery } from '../../arc/draft.js';
import { update } from '../../state/useDevice';
import { ANGLE_NAME } from './AngleHelp';

export const EMPTY_LINE: Record<Angle, string> = {
  S: 'No talk at CHI supports this yet.', R: 'No talk at CHI reframes this yet.', T: 'No clear challenge at CHI this year.',
};

const found = new Map<string, Promise<string | null>>(); // per question and angle, for this visit
function broader(query: string, angle: Angle) {
  const id = `${angle}|${query}`;
  if (!found.has(id)) found.set(id, (async () => {
    const m = await topicHelp();
    const topic = factorOf(query) ?? topicOf(query);
    if (!topic || topic.toLowerCase() === query.toLowerCase()) return null;
    const { questions } = await m.topicQuestions(topic);
    for (const q of questions.slice(0, 8)) {
      if (q.text.toLowerCase() === query.toLowerCase()) continue;
      const arc = await m.questionArc(q.text);
      if (arc.nodes.some(n => n.angle === angle)) return q.text;
    }
    return null;
  })().catch(() => null));
  return found.get(id)!;
}

export function Broader({ arc, angle, className = '' }: { arc: Arc; angle: Angle; className?: string }) {
  const [q, setQ] = useState<string | null>(null);
  useEffect(() => { let live = true; broader(arc.query, angle).then(t => { if (live) setQ(t); }); return () => { live = false; }; }, [arc.query, angle]);
  if (!q) return null;
  return (
    <div className={`flex flex-col gap-1 ${className || 'items-center'}`}>
      <p className="text-[13px] font-semibold text-arc-text">Try a broader question ›</p>
      <button type="button" onClick={() => { update(s => setQuery(s, q)); go('ask'); }} aria-label={`Try a broader question: ${q} (finds ${ANGLE_NAME[angle]})`}
        className="min-h-touch rounded-2xl border border-arc-line bg-arc-surface px-4 py-2 text-center text-[14px] leading-[19px] font-semibold text-[#9db2ff]">{q}</button>
    </div>
  );
}
