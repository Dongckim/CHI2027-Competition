import { useEffect, useState } from 'react';
import { loadSchedule } from '../data/load';
import { Header } from '../components/Header';

// Destinations that later stages build. The route and the talk are real, so links can be wired now.
const SCREENS = {
  directions: { title: 'Directions', later: '09 Directions come in S5.' },
  catchup: { title: 'Catch up', later: 'Catch up comes in S6.' },
  question: { title: 'Question', later: 'The question helper comes in S6.' },
  planlink: { title: 'Plan link', later: 'Opening your plan from a link comes in S7.' },
} as const;
export type PlaceholderKind = keyof typeof SCREENS;

export function Placeholder({ kind, paperKey }: { kind: PlaceholderKind; paperKey: string }) {
  const [talk, setTalk] = useState('');
  useEffect(() => { loadSchedule().then(s => setTalk(s.index.papers.get(paperKey)?.title ?? ''), () => {}); }, [paperKey]);
  const { title, later } = SCREENS[kind];
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-bg">
      <Header back={() => history.back()} title={title} />
      <main className="flex flex-col gap-3 px-gutter pt-3">
        {talk && <p className="text-card-title font-semibold">{talk}</p>}
        <p className="text-body text-text-2">{later}</p>
      </main>
    </div>
  );
}
export const isPlaceholder = (head: string): head is PlaceholderKind => Object.hasOwn(SCREENS, head); // not `in`: #/toString/x is no screen
