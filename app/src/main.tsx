import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { lazy, Suspense } from 'react';
import { registerServiceWorker } from './data/offline';
import { startDemoClock } from './arc/demoClock';

// A share link opened without the share function (offline from the service worker, or the dev server): /s/<payload> → #/r/<payload>
if (location.pathname.startsWith('/s/')) history.replaceState(null, '', `/#/r/${location.pathname.slice(3)}`);
startDemoClock(); // before the first screen: Next / Ended / Today use it
// a wide screen with a mouse: the app in a phone frame beside a QR code (user 11/28); phones and tablets get the app
// (its own file, loaded only there, so a phone's first screen stays small)
const inFrame = (() => { try { return window.top !== window.self; } catch { return true; } })();
const desktop = !inFrame && typeof matchMedia === 'function' && matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches;
const Desktop = lazy(() => import('./Desktop').then(m => ({ default: m.Desktop })));
createRoot(document.getElementById('root')!).render(<StrictMode>{desktop ? <Suspense fallback={null}><Desktop /></Suspense> : <App />}</StrictMode>);
registerServiceWorker();
