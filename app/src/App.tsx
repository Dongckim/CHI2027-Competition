import { useEffect } from 'react';
import { useRoute, go, tabOf } from './router';
import { useDevice } from './state/useDevice';
import { startRoute } from './state/device.js';
import { TabBar } from './components/TabBar';
import { Today } from './screens/Today';
import { Explore } from './screens/Explore';
import { Filters } from './screens/Filters';
import { Talk } from './screens/Talk';
import { Person } from './screens/Person';
import { Questions } from './screens/Questions';
import { Onboarding } from './screens/Onboarding';
import { Building } from './screens/Building';
import { Placeholder, isPlaceholder } from './screens/Placeholder';
import { More } from './screens/More';
import { Cleared } from './screens/Cleared';
import { loadNote } from './state/useDevice';
import { planWasHere } from './data/offline';
import { setDemoNow, isDemo } from './clock';
import { clearSimulated } from './data/programme';

const TITLES = { today: 'Today', explore: 'Explore', questions: 'Questions' };
const STEPS = ['research', 'topics', 'days', 'needs', 'summary', 'see', 'language', 'howfull'] as const;

export function App() {
  const route = useRoute();
  const state = useDevice();
  const [head, step, edit] = route.split('/');
  const tab = tabOf(route);
  // Opening the app: a built plan → Today, browsing → Explore, otherwise back to the onboarding step that was left.
  // Today and Questions need a plan (or "Just browse"); without one they send people to where onboarding stopped.
  // Explore, a talk and a person open from anywhere (the magnifier, the sample day).
  const misplaced = !route || (head === 'start' && !STEPS.includes(step as never)) || (!!tab && tab !== 'explore' && !state.builtAt && state.mode !== 'browse')
    || (head === 'explore' && !!step && step !== 'filters') || (['talk', 'person'].includes(head) && !step)
    || (!tab && !['start', 'building', 'sample', 'more', 'cleared', 'talk', 'person'].includes(head) && !isPlaceholder(head));
  useEffect(() => { if (misplaced) go(startRoute(state), { replace: true }); }, [misplaced, state]);
  // The demo clock belongs to the sample day (and the talks opened from it); anywhere else the real clock runs.
  // The demo clock and a simulated programme change belong to the sample day (and screens opened from it).
  useEffect(() => { if (!['sample', 'more', 'explore', 'talk', 'person'].includes(head) && !isPlaceholder(head)) { if (isDemo()) setDemoNow(null); clearSimulated(); } }, [head]);
  // 03-J2: no usable plan here, but one was built on this phone (or the stored one could not be read).
  useEffect(() => {
    if (state.builtAt || state.mode) return;
    if (loadNote === 'unreadable') go('cleared', { replace: true });
    else if (loadNote === 'none') planWasHere().then(was => { if (was) go('cleared', { replace: true }); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const screen = head === 'talk' ? 'Talk' : head === 'person' ? 'Author' : step === 'filters' ? 'Filters' : tab ? TITLES[tab] : 'Plan your days';
  useEffect(() => { document.title = `${screen} · ARC`; window.scrollTo(0, 0); }, [route, screen]);

  if (misplaced) return null;
  if (head === 'start') return <Onboarding step={step as (typeof STEPS)[number]} edit={edit === 'edit'} />;
  if (head === 'building') return <Building />;
  if (head === 'sample') return <Today mode="sample" />;
  if (isPlaceholder(head)) return <Placeholder kind={head} paperKey={step} />;
  if (head === 'more') { const [path, query] = route.split('?'); const [, d, r] = path.split('/'); return <More day={d} range={r} swap={new URLSearchParams(query).get('swap') ?? undefined} />; }
  if (head === 'cleared') return <Cleared />;
  if (head === 'talk') return <Talk paperKey={step} />;
  if (head === 'person') return <Person personKey={step} />;
  if (head === 'explore' && step === 'filters') return <Filters />;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-bg">
      <main className="flex-1 pb-[calc(var(--touch)+var(--safe-bottom)+16px)]">
        {tab === 'today' ? <Today mode={state.builtAt ? 'plan' : 'none'} /> : tab === 'explore' ? <Explore /> : <Questions />}
      </main>
      <TabBar current={tab!} />
    </div>
  );
}
