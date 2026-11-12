import { useEffect, useState } from 'react';
import { response } from '../data/fake-recommend';
import { go } from '../router';
import { update, useDevice } from '../state/useDevice';
import { candidatesFor, canBuild } from '../state/device.js';
import { loadSchedule } from '../data/load';
import { realNow } from '../clock';
import { markPlanSaved } from '../data/offline';
import { Header } from '../components/Header';
import { Button } from '../components/Button';

// 03-1: three steps while the day is built, then Today on its own. Each step stays on screen briefly so it can be read
// (none with reduced motion). The plan is marked built only after the schedule loaded, so a failure can be retried.
const PAUSE_MS = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700;
const pause = () => new Promise(r => setTimeout(r, PAUSE_MS));

export function Building() {
  const state = useDevice();
  const { plan } = state;
  const allowed = canBuild(state);
  useEffect(() => { if (!allowed) go('start/research', { replace: true }); }, [allowed]);
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const found = candidatesFor(response, plan).length;

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    (async () => {
      try {
        setError(''); setDone(0);
        await pause(); if (!live) return; setDone(1);       // read the sentence (the request would go to recsys here)
        await pause(); if (!live) return; setDone(2);       // matches
        await Promise.all([loadSchedule(), pause()]); if (!live) return; setDone(3); // rooms and walking graph
        navigator.storage?.persist?.().catch(() => {});     // ask the browser not to clear the plan under storage pressure
        update(s => ({ ...s, builtAt: realNow(), mode: 'plan' }));
        markPlanSaved();
        await pause(); if (live) go('today', { replace: true });
      } catch (e) {
        if (live) setError(String((e as Error).message ?? e));
      }
    })();
    return () => { live = false; };
  }, [attempt, allowed]);

  const steps = ['Read your research', `Found ${found} talks for you`, plan.needs.stepFree ? 'Checking rooms and step-free paths' : 'Checking rooms and walking times'];
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-bg">
      <Header wordmark right={<span />} />
      <main className="flex flex-1 flex-col justify-center gap-4 px-gutter pb-24">
        <h1 className="text-[26px] leading-8 font-semibold">Building your day</h1>
        <ol className="flex flex-col gap-3" aria-live="polite">
          {steps.map((label, i) => (
            <li key={label} className={`flex items-center gap-3 text-body ${i === done ? 'font-semibold' : i > done ? 'text-text-3' : ''}`}>
              <span aria-hidden="true" className={`grid size-5 place-items-center rounded-full ${i < done ? 'bg-inverse text-on-inverse' : 'border-[1.5px] border-text'}`}>
                {i < done && <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m2.5 7.5 3 3 6-7" /></svg>}
              </span>
              {label}<span className="sr-only">{i < done ? ' (done)' : i === done ? ' (working)' : ''}</span>
            </li>
          ))}
        </ol>
        {error && (
          <div role="alert" className="flex flex-col gap-3 pt-2">
            <p className="text-body">Could not load the programme. {error}</p>
            <Button className="self-start" onClick={() => setAttempt(a => a + 1)}>Try again</Button>
          </div>
        )}
      </main>
    </div>
  );
}
