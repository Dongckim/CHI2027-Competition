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
import { Screen, ArcButton, TextAction, Dots, BackButton, Pic } from '../../components/arc';
import offline from '../../assets/arc/icon-offline.svg';

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
      header={onboarded ? <BackButton href={href('home')} /> : <><Dots at={6} /><TextAction href={href('home')} onClick={e => { e.preventDefault(); update(setOnboarded); go('home'); }}>Skip</TextAction></>}
      bottom={<>
        <p className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-arc-text-3" aria-live="polite">
          <Pic src={offline} size={16} />{warmState === 'ready' ? 'Ready offline' : warmState === 'failed' ? 'Needs a connection to get ready' : 'Getting ready for offline…'}
        </p>
        <ArcButton onClick={next} disabled={!ready}>Find my angles</ArcButton>
      </>}>
      <h1 id="ask-title" className="mt-[34px] text-[30px] leading-9 font-semibold tracking-[-0.024em]">What are you<br />bringing to CHI?</h1>
      <form className="mt-10" onSubmit={e => { e.preventDefault(); next(); }}>
        <input aria-labelledby="ask-title" value={draft.query} maxLength={QUERY_MAX} enterKeyHint="go" autoComplete="off" placeholder="A word or a question…"
          onChange={e => update(s => setQuery(s, e.target.value))}
          className="h-16 w-full rounded-[20px] border-[1.5px] border-arc-text/20 bg-arc-surface px-4 text-[17px] font-medium tracking-[-0.012em] text-arc-text placeholder:text-arc-text-3 focus:border-arc-text/60 focus:shadow-[0_0_0_4px_rgba(255,255,255,0.07)] focus:outline-none" />
      </form>
      <div className="mt-[13px] min-h-7" aria-live="polite">
        {t && (
          <span className="ml-0.5 inline-flex items-center gap-1.5 rounded-2xl border py-1.5 pr-3 pl-2.5 text-[13px] font-semibold text-arc-text/75"
            style={{ background: `color-mix(in srgb, ${t.color} 8%, transparent)`, borderColor: `color-mix(in srgb, ${t.color} 30%, transparent)` }}>
            <Pic src={TRIBE_ICON[t.id as TribeId]} size={14} />{t.name}
          </span>
        )}
      </div>
    </Screen>
  );
}
