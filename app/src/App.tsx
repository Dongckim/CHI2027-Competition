import { useEffect } from 'react';
import { useTab } from './router';
import { TabBar } from './components/TabBar';
import { Today } from './screens/Today';
import { Explore } from './screens/Explore';
import { Questions } from './screens/Questions';

const TITLES = { today: 'Today', explore: 'Explore', questions: 'Questions' };

export function App() {
  const tab = useTab();
  useEffect(() => { document.title = `${TITLES[tab]} · ARC`; window.scrollTo(0, 0); }, [tab]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-bg">
      <main className="flex-1 pb-[calc(var(--touch)+var(--safe-bottom)+16px)]">
        {tab === 'today' ? <Today /> : tab === 'explore' ? <Explore /> : <Questions />}
      </main>
      <TabBar current={tab} />
    </div>
  );
}
