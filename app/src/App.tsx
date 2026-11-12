import { useEffect } from 'react';
import { useRoute, go, tabOf } from './router';
import { useDevice } from './state/useDevice';
import { startRoute } from './state/device.js';
import { TabBar } from './components/TabBar';
import { Today } from './screens/Today';
import { Explore } from './screens/Explore';
import { Questions } from './screens/Questions';
import { Onboarding } from './screens/Onboarding';
import { Building } from './screens/Building';

const TITLES = { today: 'Today', explore: 'Explore', questions: 'Questions' };
const STEPS = ['research', 'topics', 'days', 'needs', 'summary', 'see', 'language', 'howfull'] as const;

export function App() {
  const route = useRoute();
  const state = useDevice();
  const [head, step, edit] = route.split('/');
  const tab = tabOf(route);
  // Opening the app: a built plan → Today, browsing → Explore, otherwise back to the onboarding step that was left.
  // Tabs need a plan (or "Just browse"); without one they send people to where onboarding stopped.
  const misplaced = !route || (head === 'start' && !STEPS.includes(step as never)) || (!!tab && !state.builtAt && state.mode !== 'browse')
    || (!tab && !['start', 'building', 'sample'].includes(head));
  useEffect(() => { if (misplaced) go(startRoute(state), { replace: true }); }, [misplaced, state]);
  useEffect(() => { document.title = `${tab ? TITLES[tab] : 'Plan your days'} · ARC`; window.scrollTo(0, 0); }, [route, tab]);

  if (misplaced) return null;
  if (head === 'start') return <Onboarding step={step as (typeof STEPS)[number]} edit={edit === 'edit'} />;
  if (head === 'building') return <Building />;
  if (head === 'sample') return <Today mode="sample" />;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-bg">
      <main className="flex-1 pb-[calc(var(--touch)+var(--safe-bottom)+16px)]">
        {tab === 'today' ? <Today mode={state.builtAt ? 'plan' : 'none'} /> : tab === 'explore' ? <Explore /> : <Questions />}
      </main>
      <TabBar current={tab!} />
    </div>
  );
}
