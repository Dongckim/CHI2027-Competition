import { lazy, Suspense, useEffect } from 'react';
import { useRoute, go } from './router';
import { useDevice } from './state/useDevice';
import { arcOf } from './arc/draft.js';
import { Start, START_PAGES } from './screens/arc/Start';

// Arc screens (decision 006). 01–06 load with the app (the first screen); every other screen is its own chunk, so the
// first download does not grow with the app. The planner screens (Legacy) load only when their address is opened.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, name: K) => lazy(() => load().then(m => ({ default: m[name] }))); // eslint-disable-line @typescript-eslint/no-explicit-any
const Ask = named(() => import('./screens/arc/Ask'), 'Ask');
const Angles = named(() => import('./screens/arc/Angles'), 'Angles');
const When = named(() => import('./screens/arc/When'), 'When');
const Building = named(() => import('./screens/arc/Building'), 'Building');
const Hood = named(() => import('./screens/arc/Hood'), 'Hood');
const Home = named(() => import('./screens/arc/Home'), 'Home');
const ArcMap = named(() => import('./screens/arc/ArcMap'), 'ArcMap');
const TalkDetail = named(() => import('./screens/arc/TalkDetail'), 'TalkDetail');
const ArcList = named(() => import('./screens/arc/ArcList'), 'ArcList');
const Edit = named(() => import('./screens/arc/Edit'), 'Edit');
const Share = named(() => import('./screens/arc/Share'), 'Share');
const Qr = named(() => import('./screens/arc/Share'), 'Qr');
const Received = named(() => import('./screens/arc/Received'), 'Received');
const JustRead = named(() => import('./screens/arc/Received'), 'JustRead');
const Pick = named(() => import('./screens/arc/Received'), 'Pick');
const Yours = named(() => import('./screens/arc/Received'), 'Yours');
const AfterChi = named(() => import('./screens/arc/AfterChi'), 'AfterChi');
const Legacy = named(() => import('./legacy/Legacy'), 'Legacy');

const TITLES: Record<string, string> = { start: 'Welcome', ask: 'Ask', angles: 'Choose your angles', when: 'When and what', building: 'Building your Arc',
  hood: 'Your neighborhood', home: 'My Arcs', arc: 'My Arc', talk: 'Talk', share: 'Share', qr: 'QR code', r: 'Shared Arc', after: 'Your CHI' };

export function App() {
  const route = useRoute();
  const state = useDevice();
  const [head, step, sub] = route.split('/');
  const { onboarded } = arcOf(state);
  // Opening the app: first time → 01, afterwards → My Arcs.
  useEffect(() => { if (!route) go(onboarded ? 'home' : 'start/1', { replace: true }); }, [route, onboarded]); // #/r/… opens as is, onboarded or not
  useEffect(() => { if (TITLES[head]) { document.title = `${TITLES[head]} · ARC`; window.scrollTo(0, 0); } }, [route, head]);
  if (!route) return null;

  const screen = (() => {
    switch (head) {
      case 'start': return <Start page={START_PAGES.includes(step) ? step : '1'} />;
      case 'ask': return <Ask />;
      case 'angles': return <Angles />;
      case 'when': return <When />;
      case 'building': return <Building />;
      case 'hood': return step ? <Hood id={step} /> : <Home />;
      case 'home': return <Home />;
      case 'arc': return !step ? <Home /> : sub === 'list' ? <ArcList id={step} /> : sub === 'edit' ? <Edit id={step} /> : <ArcMap id={step} />;
      case 'talk': return step ? <TalkDetail paperKey={step} shape={sub === 'shape'} /> : <Home />; // 14 (the planner's 06 is replaced), 14f #/talk/<key>/shape
      case 'share': return step ? <Share id={step} /> : <Home />;
      case 'qr': return step ? <Qr id={step} /> : <Home />;
      case 'after': return <AfterChi />; // 20b
      case 'r': return sub === 'pick' ? <Pick payload={step ?? ''} /> : sub === 'yours' ? <Yours payload={step ?? ''} /> : sub === 'read' ? <JustRead payload={step ?? ''} /> : <Received payload={step ?? ''} />; // a share link (18, 19)
      default: return <Legacy />;
    }
  })();
  return <Suspense fallback={<div className="min-h-dvh bg-arc-bg" />}>{screen}</Suspense>;
}
