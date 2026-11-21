// 07 · Ask: one question (a word or a sentence). While typing, the tribe it would land in shows as a chip (engine.tribeOf).
// First time this is step 6 of the onboarding dots with Skip; from home it has a back button instead.
import { useEffect, useState } from 'react';
import { go, href } from '../../router';
import { update, useDevice } from '../../state/useDevice';
import { arcOf, setQuery, setOnboarded, QUERY_MAX } from '../../arc/draft.js';
import { engine, type TribeId } from '../../engine';
import { TRIBE } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import { useWarm, warm, useTribe, setPreviewTribe } from '../../arc/live';
import { Screen, ArcButton, TextAction, BackButton, Pic } from '../../components/arc';
import { SKIP_CLASS, StepDots } from './Start';
import offline from '../../assets/arc/icon-offline.svg';
import chevron from '../../assets/arc/icon-chevron-right.svg';

// Figma 741:1586…: three starter questions under the input; one tap puts it in the box.
const STARTERS: [TribeId, string][] = [['access', 'What is accessibility research asking now?'], ['ai', 'Which CHI work can I use in industry?'], ['design', 'My first CHI: how do I spend a day?']];

const hasWords = (q: string) => /[\p{L}\p{N}]/u.test(q);

export function Ask() {
  const state = useDevice();
  const { onboarded, draft } = arcOf(state);
  const warmState = useWarm();
  const [tribe, setTribeChip] = useState<TribeId | null>(null);
  useTribe(null);
  useEffect(() => { warm().catch(() => {}); }, []);
  useEffect(() => { // the tribe chip follows the question, half a second after typing stops
    const q = draft.query.trim();
    if (!hasWords(q)) { setTribeChip(null); return; }
    let live = true;
    const t = setTimeout(() => engine.tribeOf(q).then(r => { if (live) { setTribeChip(r.tribe); setPreviewTribe(r.tribe); } }, () => {}), 500);
    return () => { live = false; clearTimeout(t); };
  }, [draft.query]);
  const ready = hasWords(draft.query);
  const next = () => { if (!ready) return; update(setOnboarded); go('angles'); };
  const t = tribe ? TRIBE[tribe] : null;

  return (
    <Screen label="Ask"
      header={onboarded ? <BackButton href={href('home')} /> : <><StepDots at={8} /><TextAction href={href('home')} className={SKIP_CLASS} onClick={e => { e.preventDefault(); update(setOnboarded); go('home'); }}>Skip</TextAction></>}
      bottom={<>
        {/* Figma: 20 above the button, which ends 20 above the home indicator */}
        <p className="mb-1.5 flex items-center justify-center gap-1.5 text-[12px] font-medium text-arc-text-3" aria-live="polite">
          <Pic src={offline} size={16} />{warmState === 'ready' ? 'Ready offline' : warmState === 'failed' ? 'Needs a connection to get ready' : 'Getting ready for offline…'}
        </p>
        <ArcButton className="mb-1.5" onClick={next} disabled={!ready}>Find my angles</ArcButton>
      </>}>
      <h1 id="ask-title" className="mt-[10px] text-[30px] leading-9 font-semibold tracking-[-0.024em]">What are you<br />bringing to CHI?</h1>
      {/* Figma 591:680: input at y 226. The 1.5px edge is an inset shadow: Chromium draws a 1.5px border as 1px */}
      <form className="mt-[42px]" onSubmit={e => { e.preventDefault(); next(); }}>
        <input aria-labelledby="ask-title" value={draft.query} maxLength={QUERY_MAX} enterKeyHint="go" autoComplete="off" placeholder="A word or a question…"
          onChange={e => update(s => setQuery(s, e.target.value))}
          className="h-16 w-full rounded-[20px] bg-arc-surface pr-4 pl-[16.5px] text-[17px] font-medium tracking-[-0.012em] text-arc-text shadow-[inset_0_0_0_1.5px_rgba(244,246,255,0.2)] placeholder:text-arc-text-3 focus:shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.6),0_0_0_4px_rgba(255,255,255,0.07)] focus:outline-none" />
      </form>
      {/* Figma 591:684: chip at 26,303, the whole chip at 75%; the row keeps its height so the list below does not jump */}
      <div className="mt-[13px] h-[30px]" aria-live="polite">
        {t && (
          <span className="ml-0.5 inline-flex items-center gap-1.5 rounded-2xl border py-1.5 pr-3 pl-2.5 text-[13px] font-semibold text-arc-text opacity-75"
            style={{ background: `color-mix(in srgb, ${t.color} 8%, transparent)`, borderColor: `color-mix(in srgb, ${t.color} 30%, transparent)` }}>
            <Pic src={TRIBE_ICON[t.id as TribeId]} size={14} />{t.name}
          </span>
        )}
      </div>
      <p id="starters" className="mt-[37px] text-[12px] font-medium text-arc-text-3">Or start from one of these</p>
      <ul className="mt-[9.5px] flex flex-col gap-2" aria-labelledby="starters">
        {STARTERS.map(([tid, q]) => (
          <li key={q}>
            <button type="button" onClick={() => update(s => setQuery(s, q))}
              className="flex h-[52px] w-full items-center gap-3 rounded-2xl border border-arc-line bg-arc-surface pr-3.5 pl-[15px] text-left text-[14px] font-medium tracking-[-0.006em] text-arc-text/85">
              <Pic src={TRIBE_ICON[tid]} size={18} /><span className="min-w-0 flex-1 truncate">{q}</span><Pic src={chevron} size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
