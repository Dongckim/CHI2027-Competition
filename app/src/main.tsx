import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { registerServiceWorker } from './data/offline';
import { startDemoClock } from './arc/demoClock';

startDemoClock(); // before the first screen: Next / Ended / Today use it
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
registerServiceWorker();
