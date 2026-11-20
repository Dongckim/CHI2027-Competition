// 15 · Edit (Figma 598:917): the map at 0.74 with − on every talk and + where an angle has room. Tapping a talk (or a +)
// opens "Swap": search, then chips — the angle (engine.suggest), New to CHI (first author new), Wildcard (engine.wildcard)
// — and cards to swap in or add. Nothing is saved until Done.
import { useEffect, useMemo, useState } from 'react';
import { go } from '../../router';
import { engine, type Angle, type Arc, type ArcNode } from '../../engine';
import { loadDebut } from '../../data/load';
import { searchTalks } from '../../../../data/scripts/search.mjs';
import { useExploreData } from '../../explore/useExplore';
import { firstSlot } from '../../explore/format';
import { Screen, Pic } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import { ArcView, ANGLE_ICON } from './ArcView';
import { useArc } from './useArc';
import searchIcon from '../../assets/arc/icon-search.svg';
import sparkle from '../../assets/arc/icon-sparkle.svg';
import wild from '../../assets/arc/icon-wildcard.svg';
import warning from '../../assets/arc/icon-warning.svg';

type Filter = 'angle' | 'debut' | 'wild';
type Slot = { start: number | null; end: number };
// Same rule as the engine's map label (title before the colon, 24 characters), for talks added by search.
const labelOf = (title: string) => { const h = title.split(':')[0].trim() || title.trim(); return h.length <= 24 ? h : `${h.slice(0, 23).trimEnd()}…`; };
const tensionFor = (arc: Arc, nodes: ArcNode[]): Arc['tension'] =>
  nodes.some(n => n.angle === 'T') ? 'found' : arc.tension === 'off' || arc.tension === 'pending' ? arc.tension : 'none';

export function Edit({ id }: { id: string }) {
  const { arc, states, info, paper, save } = useArc(id);
  const { data } = useExploreData();
  const [nodes, setNodes] = useState<ArcNode[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<Angle | null>(null);
  const [filter, setFilter] = useState<Filter>('angle');
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<ArcNode[] | null>(null);
  const [debut, setDebut] = useState<Set<string>>(new Set());
  useEffect(() => { if (arc && !nodes) setNodes(arc.nodes); }, [arc, nodes]);
  useEffect(() => { loadDebut().then(d => setDebut(new Set(d))); }, []);
  const target = selected ? nodes?.find(n => n.key === selected)?.angle ?? null : adding;
  const open = !!target;
  const exclude = useMemo(() => nodes?.map(n => n.key) ?? [], [nodes]);

  useEffect(() => { // cards for the sheet
    if (!arc || !target) { setCards(null); return; }
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
    const get = filter === 'wild' ? engine.wildcard(arc.query, exclude, 8)
      : engine.suggest(arc.query, target, exclude, filter === 'debut' ? 30 : 8).then(l => (filter === 'debut' ? l.filter(n => n.debut).slice(0, 8) : l));
    get.then(l => live && setCards(l), () => live && setCards([]));
    return () => { live = false; };
  }, [arc, target, filter, query, data, exclude, debut]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!arc || !nodes) return null;
  const draft: Arc = { ...arc, nodes, tension: tensionFor(arc, nodes) };
  const slotOf = (key: string) => { const p = paper(key); return p ? firstSlot(p.slots as (Slot & { roomKey: string; sessionKey: string })[]) : null; };
  const clash = (key: string) => {
    const s = slotOf(key);
    if (!s) return null;
    const other = nodes.find(n => n.key !== selected && (() => { const o = slotOf(n.key); return o && o.start < s.end && s.start < o.end; })());
    return other ? info(other.key).short : null;
  };
  const pick = (card: ArcNode) => {
    if (selected) setNodes(nodes.map(n => (n.key === selected ? card : n)));
    else setNodes([...nodes, card]);
    setSelected(null); setAdding(null); setQuery('');
  };
  const done = async () => { await save(draft); go(`arc/${id}`); };

  return (
    <Screen label="Editing" header={<>
      <h1 className="pl-2 text-[17px] font-semibold">Editing</h1>
      <button type="button" onClick={done} className="h-11 rounded-full bg-arc-primary px-5 text-[16px] font-semibold text-arc-on-primary shadow-[var(--arc-shadow-primary)]">Done</button>
    </>}>
      <div className="-mx-6 mt-1">
        <ArcView arc={draft} states={states} info={info} scale={0.74}
          edit={{ selected, adding, onSelect: k => { setSelected(s => (s === k ? null : k)); setAdding(null); setFilter('angle'); },
            onRemove: k => { setNodes(nodes.filter(n => n.key !== k)); if (selected === k) setSelected(null); },
            onAdd: a => { setAdding(x => (x === a ? null : a)); setSelected(null); setFilter('angle'); } }} />
      </div>
      {!open && <p className="mt-2 text-center text-[14px] text-arc-text-2">Tap a talk to swap it. − removes, + adds.</p>}
      {open && target && (
        <section aria-label="Swap" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] rounded-t-[32px] border border-arc-line bg-arc-sheet px-6 pt-[9px] pb-[calc(var(--safe-bottom)+16px)] shadow-[0_-8px_40px_rgba(0,0,0,0.4)]">
          <div className="mx-auto mb-3.5 h-1 w-9 rounded-sm bg-arc-text/30" aria-hidden="true" />
          <h2 className="text-[17px] font-semibold">{selected ? 'Swap' : `Add to ${ANGLE_NAME[target]}`}</h2>
          <label className="mt-3 flex h-11 items-center gap-2 rounded-full border border-arc-line bg-arc-surface pl-3.5">
            <Pic src={searchIcon} size={18} />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search talks"
              className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[14px] text-arc-text placeholder:text-arc-text-3 focus:outline-none" />
          </label>
          {!query.trim() && (
            <div role="radiogroup" aria-label="Show" className="-mx-6 mt-3 flex gap-2 overflow-x-auto px-6 pb-1">
              {([['angle', ANGLE_ICON[target], ANGLE_NAME[target]], ['debut', sparkle, 'New to CHI'], ['wild', wild, 'Wildcard']] as [Filter, string, string][]).map(([f, icon, label]) => (
                <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
                  className={`relative inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium before:absolute before:inset-x-0 before:-inset-y-[3px] before:content-[''] ${filter === f ? 'bg-arc-chip-on text-arc-on-primary shadow-[var(--arc-shadow-lift)]' : 'border border-arc-line bg-arc-surface text-arc-text/62'}`}>
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
                  <button key={c.key} type="button" onClick={() => pick(c)} aria-label={`${selected ? 'Swap in' : 'Add'}: ${ANGLE_NAME[c.angle]} · ${p?.title ?? c.label} · ${i.time}`}
                    className="flex w-[232px] shrink-0 flex-col gap-1.5 rounded-3xl border border-arc-line bg-arc-surface px-3.5 py-3 text-left">
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-arc-text/80">
                      <Pic src={ANGLE_ICON[c.angle]} size={16} />
                      {clashWith ? <><Pic src={warning} size={14} />Same time as {clashWith}</> : c.debut ? <><Pic src={sparkle} size={12} />New to CHI</> : null}
                    </span>
                    <span className="line-clamp-2 text-[15px] leading-[19px] font-semibold">{p?.title ?? c.label}</span>
                    {/* Figma 11px; 12px is the floor */}
                    <span className="text-[12px] font-medium text-arc-text-3">{i.time}{i.room && ` · ${i.room}`}</span>
                  </button>
                );
              })}
          </div>
        </section>
      )}
    </Screen>
  );
}
