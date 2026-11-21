// The Swap / Add sheet of 15 (Figma 598:917), also 19b's Add: search, then chips — the angle (engine.suggest), New to CHI
// (first author new), Wildcard (engine.wildcard) — and cards to swap in or add.
import { useEffect, useState } from 'react';
import { engine, type Angle, type ArcNode } from '../../engine';
import { loadDebut } from '../../data/load';
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

export function AddSheet({ query: arcQuery, target, exclude, swap, info, paper, clash, onPick }: {
  query: string; target: Angle; exclude: string[]; swap: boolean; info: (key: string) => Info;
  paper: (key: string) => { title: string; authors: string[] } | undefined; clash: (key: string) => string | null; onPick: (card: ArcNode) => void;
}) {
  const { data } = useExploreData();
  const [filter, setFilter] = useState<Filter>('angle');
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<ArcNode[] | null>(null);
  const [debut, setDebut] = useState<Set<string>>(new Set());
  useEffect(() => { loadDebut().then(d => setDebut(new Set(d))); }, []);

  useEffect(() => { // cards for the sheet
    let live = true;
    setCards(null);
    if (query.trim() && data) {
      const hits = searchTalks(data.index, query).filter(h => !exclude.includes(h.key)).slice(0, 10);
      setCards(hits.map(h => {
        const p = paper(h.key);
        return { key: h.key, angle: target, label: labelOf(p?.title ?? h.key), evidence: null, debut: !!p && debut.has(p.authors[0]) };
      }));
      return;
    }
    const get = filter === 'wild' ? engine.wildcard(arcQuery, exclude, 8)
      : engine.suggest(arcQuery, target, exclude, filter === 'debut' ? 30 : 8).then(l => (filter === 'debut' ? l.filter(n => n.debut).slice(0, 8) : l));
    get.then(l => live && setCards(l), () => live && setCards([]));
    return () => { live = false; };
  }, [arcQuery, target, filter, query, data, exclude, debut]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (card: ArcNode) => { setQuery(''); onPick(card); };
  return (
    <section aria-label="Swap" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] rounded-t-[32px] border border-arc-line bg-arc-sheet px-6 pt-[9px] pb-[calc(var(--safe-bottom)+16px)] shadow-[0_-8px_40px_rgba(0,0,0,0.4)]">
      <div className="mx-auto mb-3.5 h-1 w-9 rounded-sm bg-arc-text/30" aria-hidden="true" />
      <h2 className="text-[17px] font-semibold tracking-[-0.012em]">{swap ? 'Swap' : `Add to ${ANGLE_NAME[target]}`}</h2>
      <label className="mt-3 flex h-11 items-center gap-2 rounded-full border border-arc-line bg-arc-surface pl-3.5">
        <Pic src={searchIcon} size={18} />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search talks"
          className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[14px] tracking-[-0.006em] text-arc-text placeholder:text-arc-text-3 focus:outline-none" />
      </label>
      {!query.trim() && (
        <div role="radiogroup" aria-label="Show" className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-1">
          {([['angle', ANGLE_ICON[target], ANGLE_NAME[target]], ['debut', sparkle, 'New to CHI'], ['wild', wild, 'Wildcard']] as [Filter, string, string][]).map(([f, icon, label]) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
              className={`relative inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium tracking-[-0.006em] before:absolute before:inset-x-0 before:-inset-y-[4px] before:content-[''] ${filter === f ? 'bg-arc-chip-on text-arc-on-primary shadow-[var(--arc-shadow-lift)]' : 'border border-arc-line bg-arc-surface text-arc-text/62'}`}>
              <img src={icon} alt="" width={16} height={16} className={filter === f ? 'brightness-0' : 'opacity-60'} />{label}
            </button>
          ))}
        </div>
      )}
      <div className="-mx-6 mt-3 flex min-h-[112px] gap-3 overflow-x-auto px-6 pb-1" aria-live="polite">
        {cards == null ? <p className="py-4 text-[14px] text-arc-text-3">Looking…</p>
          : !cards.length ? <p className="py-4 text-[14px] text-arc-text-3">{query.trim() ? 'No talks match.' : 'Nothing more here.'}</p>
          : cards.map(c => {
            const i = info(c.key), p = paper(c.key), clashWith = clash(c.key);
            return (
              <button key={c.key} type="button" onClick={() => pick(c)} aria-label={`${swap ? 'Swap in' : 'Add'}: ${ANGLE_NAME[c.angle]} · ${p?.title ?? c.label} · ${i.time}`}
                className="flex w-[232px] shrink-0 flex-col gap-1.5 rounded-3xl border border-arc-line bg-arc-surface px-3.5 py-3 text-left">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-arc-text/80">
                  <Pic src={ANGLE_ICON[c.angle]} size={16} />
                  {clashWith ? <><Pic src={warning} size={14} />Same time as {clashWith}</> : c.debut ? <><Pic src={sparkle} size={12} />New to CHI</> : null}
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
