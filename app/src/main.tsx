import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { Desktop, isDesktop } from './Desktop';
import { registerServiceWorker } from './data/offline';
import { startDemoClock } from './arc/demoClock';

// A share link opened without the share function (offline from the service worker, or the dev server): /s/<payload> → #/r/<payload>
if (location.pathname.startsWith('/s/')) history.replaceState(null, '', `/#/r/${location.pathname.slice(3)}`);
startDemoClock(); // before the first screen: Next / Ended / Today use it
// a wide screen with a mouse: the app in a phone frame beside a QR code (user 11/28); phones and tablets get the app
createRoot(document.getElementById('root')!).render(<StrictMode>{isDesktop() ? <Desktop /> : <App />}</StrictMode>);
registerServiceWorker();
