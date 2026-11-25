// The Swap / Add sheet of 15 (Figma 598:917), also 19b's Add: search, then chips — the angle (engine.suggest), New to CHI
// (first author new), Wildcard (engine.wildcard) — and cards to swap in or add. Every card goes under the angle the engine
// gives it (search: engine.judge), which the card says when it is not the sheet's own angle.
import { useEffect, useState } from 'react';
import { engineFor, type Angle, type Arc, type ArcNode } from '../../engine';
import { searchTalks } from '../../../../data/scripts/search.mjs';
import { useExploreData } from '../../explore/useExplore';
import { labelOf } from '../../arc/label.js';
import { Pic } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import { ANGLE_ICON, type Info } from './ArcView';
import searchIcon from '../../assets/arc/icon-search.svg';
import sparkle from '../../assets/arc/icon-sparkle.svg';
import wild from '../../assets/arc/icon-wildcard.svg';
import warning from '../../assets/arc/icon-warning.svg';

type Filter = 'angle' | 'debut' | 'wild';
type Card = ArcNode & { off?: true }; // off: the engine finds it not about the question
const off = (key: string, label: string): Card => ({ key, angle: 'R', label, evidence: null, debut: false, off: true });
const NOT_ABOUT = 'Not about your question';

export function AddSheet({ query: arcQuery, engineName, filters, target, exclude, swap, info, paper, clash, onPick }: {
  query: string; engineName: string; filters?: Arc['filters']; target: Angle; exclude: string[]; swap: boolean; info: (key: string) => Info;
  paper: (key: string) => { title: string; authors: string[] } | undefined; clash: (key: string) => string | null; onPick: (card: ArcNode) => void;
}) {
  const { data } = useExploreData();
  const [filter, setFilter] = useState<Filter>('angle');
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<Card[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { // cards for the sheet
    let live = true;
    setCards(null); setFailed(false);
    const e = engineFor(engineName);
    if (query.trim() && data) {
      // user 11/25 「A로 하고」: a found talk goes where the engine puts it for this question, never simply the target angle;
      // one it finds not about the question is shown but cannot be added
      const hits = searchTalks(data.index, query).filter(h => !exclude.includes(h.key)).slice(0, 10);
      if (!hits.length) { setCards([]); return; }
      const timer = setTimeout(() => {
        e.judge(arcQuery, hits.map(h => h.key)).then(l => live && setCards(hits.map((h, i) => l[i] ?? off(h.key, labelOf(paper(h.key)?.title ?? h.key)))),
          () => { if (live) { setCards([]); setFailed(true); } });
      }, 300); // after a pause in typing
      return () => { live = false; clearTimeout(timer); };
    }
    const get = filter === 'wild' ? e.wildcard(arcQuery, exclude, 8, filters)
      : e.suggest(arcQuery, target, exclude, filter === 'debut' ? 30 : 8, filters).then(l => (filter === 'debut' ? l.filter(n => n.debut).slice(0, 8) : l));
    get.then(l => live && setCards(l), () => live && setCards([]));
    return () => { live = false; };
  }, [arcQuery, engineName, target, filter, query, data, exclude]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (card: ArcNode) => { setQuery(''); onPick(card); };
  return (
    <section aria-label="Swap" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] rounded-t-[32px] border border-arc-line bg-arc-sheet px-6 pt-[9px] pb-[calc(var(--safe-bottom)+16px)] shadow-[0_-8px_40px_rgba(0,0,0,0.4)]">
      <div className="mx-auto mb-3.5 h-1 w-9 rounded-sm bg-arc-text/30" aria-hidden="true" />
      <h2 className="text-[17px] font-semibold tracking-[-0.012em]">{swap ? 'Swap' : `Add to ${ANGLE_NAME[target]}`}</h2>
      <label className="mt-3 flex h-11 items-center gap-2 rounded-full border border-arc-line bg-arc-surface pl-3.5">
        <Pic src={searchIcon} size={18} />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search all CHI talks by title or author" aria-label="Search talks"
          className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[14px] tracking-[-0.006em] text-arc-text placeholder:text-arc-text-3 focus:outline-none" />
      </label>
      {!query.trim() && (
        <div role="radiogroup" aria-label="Show" className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-1">
          {([['angle', ANGLE_ICON[target], ANGLE_NAME[target]], ['debut', sparkle, 'New to CHI'], ['wild', wild, 'Wildcard']] as [Filter, string, string][]).map(([f, icon, label]) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
              className={`relative inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium tracking-[-0.006em] before:absolute before:inset-x-0 before:-inset-y-[4px] before:content-[''] ${filter === f ? 'bg-arc-chip-on text-arc-on-primary shadow-[var(--arc-shadow-lift)]' : 'border border-arc-line bg-arc-surface text-arc-text/62'}`}>
              {/* the icon in the chip's text colour (a mask): WebKit drew the selected chip's brightness(0) icon blank */}
              <span aria-hidden="true" className={`size-4 shrink-0 bg-current ${filter === f ? '' : 'opacity-60'}`} style={{ WebkitMaskImage: `url("${icon}")`, maskImage: `url("${icon}")`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' }} />{label}
            </button>
          ))}
        </div>
      )}
      {!query.trim() && filter === 'wild' && <p className="mt-2 text-[12px] font-medium text-arc-text-2">Wildcard picks its own angle for each talk.</p>}
      <div className="-mx-6 mt-3 flex min-h-[112px] gap-3 overflow-x-auto px-6 pb-1" aria-live="polite">
        {cards == null ? <p className="py-4 text-[14px] text-arc-text-3">Looking…</p>
          : !cards.length ? <p className="py-4 text-[14px] text-arc-text-3">{failed ? 'Could not sort these talks. Try again.' : query.trim() ? 'No talks match.' : 'Nothing more here.'}</p>
          : cards.map(c => {
            const i = info(c.key), p = paper(c.key), clashWith = c.off ? null : clash(c.key);
            const name = ANGLE_NAME[c.angle], elsewhere = !c.off && c.angle !== target;
            // every visible word in the name (WCAG 2.5.3), where it goes first
            const status = c.off ? [] : [elsewhere && `Goes to ${name}`, clashWith ? `Same time as ${clashWith}` : c.debut && 'New to CHI'].filter(Boolean);
            const action = c.off ? NOT_ABOUT : swap ? `Swap in · ${name}` : `Add to ${name}`;
            const where = `${i.time}${i.room && ` · ${i.room}`}`;
            return (
              <button key={c.key} type="button" onClick={() => !c.off && pick(c)} disabled={c.off} aria-label={`${action}: ${[...status, p?.title ?? c.label, where].join(' · ')}`}
                className={`flex w-[232px] shrink-0 flex-col gap-1.5 rounded-3xl border border-arc-line bg-arc-surface px-3.5 py-3 text-left ${c.off ? 'border-dashed' : ''}`}>
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-semibold text-arc-text/80">
                  {c.off ? <span className="text-arc-text">{NOT_ABOUT}</span> : <>
                    <Pic src={ANGLE_ICON[c.angle]} size={16} />
                    {elsewhere && <span className="text-arc-text">Goes to {name}</span>}
                    {clashWith ? <><Pic src={warning} size={14} />Same time as {clashWith}</> : c.debut ? <><Pic src={sparkle} size={12} />New to CHI</> : null}
                  </>}
                </span>
                <span className="line-clamp-2 text-[15px] leading-[19px] font-semibold tracking-[-0.006em]">{p?.title ?? c.label}</span>
                {/* Figma 11px; 12px is the floor */}
                <span className="text-[12px] font-medium text-arc-text-3">{i.time}{i.room && ` · ${i.room}`}</span>
              </button>
            );
          })}
      </div>
    </section>
  );
}
