// 18 · Shared Arc (Figma 599:994) and 19 · Pick some (599:1117). A link from someone: no sender, only a "Shared Arc"
// chip. Add to my Arcs keeps it all as a new Arc (never merged); Pick some keeps the talks you tick. Talks that are over
// (Figma's "Ended") and talks already in one of your Arcs (the brief) are locked. Nothing is saved until you choose.
import { useEffect, useMemo, useState } from 'react';
import { go, href } from '../../router';
import { decodeLink, receivedArc } from '../../arc/link.js';
import { labelOf } from '../../arc/label.js';
import { nodeStates, layout, type NodeState } from '../../arc/map.js';
import { setOnboarded, QUERY_MAX } from '../../arc/draft.js';
import { addedWords, mineFrom, tensionFor } from '../../arc/yours.js';
import { saveArc, useArcs } from '../../arc/store';
import { useTribe, setCurrentArc, setViewingArc, warm } from '../../arc/live';
import { engine } from '../../engine';
import { update } from '../../state/useDevice';
import { loadSchedule, loadAbstracts, loadDebut, type Schedule } from '../../data/load';
import { abstractFileDay, firstSlot, dateOf, clockOf } from '../../explore/format';
import { useNow, now as nowMs } from '../../clock.js';
import { Screen, ArcButton, BackButton, Pic } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import { AngleRows } from './ArcList';
import { ArcView, useMapFit, type Info } from './ArcView';
import { AddSheet } from './AddSheet';
import { shortRoom, whenLine, chairOf } from './useArc';
import linkIcon from '../../assets/arc/icon-link.svg';
import lockIcon from '../../assets/arc/icon-lock.svg';
import checkIcon from '../../assets/arc/icon-check.svg';
import type { Arc, ArcNode, Angle } from '../../engine';

type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
type Paper = { title: string; authors: string[]; slots: Slot[]; first?: string | null };
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

// One received Arc per link while 18 ⇄ 19 are open (built once: abstracts are checked, ids made).
const built = new Map<string, Promise<{ arc: Arc; missing: number; schedule: Schedule } | { error: string }>>();
function build(payload: string) {
  if (!built.has(payload)) built.set(payload, (async () => {
    const d = decodeLink(payload);
    if (!d.ok) return { error: d.why };
    const [schedule, debut] = await Promise.all([loadSchedule(), loadDebut()]);
    if (d.link.e !== schedule.meta.edition) return { error: `made for another CHI (${d.link.e})` };
    const paper = (k: string) => schedule.index.papers.get(k) as Paper | undefined;
    const tz = schedule.meta.timeZone;
    const days = [...new Set(d.link.n.map(([id]) => paper(`${d.link.e}:${id}`)).filter(Boolean).map(p => abstractFileDay(p!.slots, tz)))];
    const abstracts: Record<string, string> = Object.assign({}, ...(await Promise.all(days.map(day => loadAbstracts(day)))));
    const debutSet = new Set(debut);
    const r = receivedArc(d.link, { edition: schedule.meta.edition, title: k => paper(k)?.title, abstract: k => abstracts[k], label: labelOf,
      firstAuthorNew: k => !!paper(k) && debutSet.has(paper(k)!.authors[0]), id: newId(), createdAt: nowMs() });
    const arc = r.arc as Arc; // link.js is untyped JS; its Arc matches contracts/Arc
    // v2 links carry no evidence places (user 11/26): this phone's engine finds each talk's sentence for the question again,
    // the link's angle kept. Up to 4 s here; if the engine is still getting ready, the rest fill in when it is
    const bare = arc.nodes.filter(n => !n.evidence);
    if (bare.length) {
      const fill = warm().then(() => engine.judge(arc.query, bare.map(n => n.key))).then(l => l.forEach((j, i) => { if (j?.evidence) bare[i].evidence = j.evidence; }), () => {});
      await Promise.race([fill, new Promise(res => setTimeout(res, 4000))]);
    }
    return { arc, missing: r.missing, schedule };
  })());
  return built.get(payload)!;
}

function useReceived(payload: string) {
  const [r, setR] = useState<Awaited<ReturnType<typeof build>> | null>(null);
  useEffect(() => { let live = true; build(payload).then(x => live && setR(x), () => live && setR({ error: 'could not load the programme' })); return () => { live = false; }; }, [payload]);
  const t = useNow();
  const ok = r && 'arc' in r ? r : null;
  useTribe(ok?.arc.tribe);
  const timeOf = (k: string) => { const p = ok?.schedule.index.papers.get(k) as Paper | undefined; const s = p ? firstSlot(p.slots) : null; return s ? { start: s.start, end: s.end } : null; };
  const states = useMemo(() => (ok ? nodeStates(ok.arc.nodes, timeOf, t, new Set()) : new Map()) as Map<string, NodeState>, [ok, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = (k: string): Info => {
    const sc = ok!.schedule, p = sc.index.papers.get(k) as Paper | undefined, s = p ? firstSlot(p.slots) : null, tz = sc.meta.timeZone;
    const room = s ? sc.index.rooms.get(s.roomKey)?.name ?? '' : '';
    return { title: p?.title ?? k, short: labelOf(p?.title ?? k), time: s ? `${dateOf(s.start, tz)} · ${clockOf(s.start, tz)}` : 'Time to be announced',
      when: s ? whenLine(s.start, room, tz, t) : 'Time TBA' /* no time in the feed (14: "Time to be announced") */, room: room ? shortRoom(room) : '',
      first: p?.first ?? null, chair: s ? chairOf(sc, s.sessionKey) : null };
  };
  const paper = (k: string) => ok?.schedule.index.papers.get(k) as Paper | undefined;
  return { r, ok, states, info, paper, timeOf };
}

// to: 18 "Add to my Arcs" opens the new Arc (12); 19 "Add N" and 19b "Keep all theirs" go to My Arcs (prototype 11/23 → 20)
const keep = async (arc: Arc, to: 'arc' | 'home' = 'arc') => { await saveArc(arc); update(setOnboarded); go(to === 'home' ? 'home' : `arc/${arc.id}`, { replace: true }); };
// 18 "Make it mine" opens 19b (user 「18 "Make it mine" → 19b로 변경. 15는 내 Arc 편집용으로 유지」).

// a sentence per reason (audit 11/27: "It is no neighbourhood in the link." read broken)
const brokenText = (why: string) => why === 'not a share link' ? 'Part of the link is missing or changed (a chat may have cut it short). Ask for the link again.'
  : why === 'made by another version of ARC' ? 'It was made by another version of ARC. Ask for a new link.'
  : why.startsWith('made for another CHI') ? `It was ${why}.`
  : why === 'could not load the programme' ? "The CHI programme couldn't load. Check your connection and open the link again."
  : 'Something in the link is broken. Ask for the link again.';
function Broken({ why }: { why: string }) {
  return (
    <Screen label="Shared Arc" bottom={<a href={href('home')} className="inline-flex h-[54px] w-full items-center justify-center rounded-full bg-arc-primary text-[16px] font-semibold text-arc-on-primary">Go to my Arcs</a>}>
      <h1 className="mt-16 text-[26px] leading-8 font-semibold break-words">This link can't be opened</h1>
      <p className="mt-3 text-[16px] text-arc-text-2">{brokenText(why)}</p>
    </Screen>
  );
}

export function Received({ payload }: { payload: string }) {
  const { r, ok, states, info } = useReceived(payload);
  const [fit, mapRef] = useMapFit(0.78); // 18 must not scroll: the map shrinks further on a short screen (Safari, 664)
  const mine = useArcs();
  if (!r) return null;
  if (!ok) return <Broken why={(r as { error: string }).error} />;
  const { arc, missing } = ok;
  // the same link opened again: open the copy already kept instead of adding a second one (persona review 11/25)
  const keys = arc.nodes.map(n => n.key).sort().join();
  const kept = mine?.find(a => a.query === arc.query && a.nodes.map(n => n.key).sort().join() === keys);
  return (
    <Screen clock label="Shared Arc" bottom={<div className="flex flex-col">{/* Figma 18: 10 under Add, 12 above Just read */}
      {kept ? <ArcButton onClick={() => go(`arc/${kept.id}`)}>Open in my Arcs</ArcButton>
        : <ArcButton onClick={() => keep(arc)} disabled={!arc.nodes.length}>Add to my Arcs</ArcButton>}
      {/* Figma 18: Pick some · Make it mine side by side; with larger text each takes its own row rather than breaking its words */}
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-2.5">
        <ArcButton kind="secondary" className="min-w-fit grow basis-[calc(50%-6px)]" onClick={() => go(`r/${payload}/pick`)} disabled={!arc.nodes.length}>Pick some</ArcButton>
        <ArcButton kind="secondary" className="min-w-fit grow basis-[calc(50%-6px)]" onClick={() => go(`r/${payload}/yours`)} disabled={!arc.nodes.length}>Make it mine</ArcButton>
      </div>
      <ArcButton kind="ghost" className="mt-3" onClick={() => go(`r/${payload}/read`)} disabled={!arc.nodes.length}>Just read</ArcButton>
    </div>}>
      <p className="mt-2 inline-flex items-center gap-1.5 self-start rounded-2xl border border-arc-line bg-arc-surface py-1.5 pr-3 pl-2.5 text-[13px] font-semibold"><Pic src={linkIcon} size={14} />Shared Arc</p>
      <Intro />
      <h1 className="mt-3 text-[26px] leading-8 font-semibold tracking-[-0.02em] break-words">{arc.query}</h1>
      {missing > 0 && <p className="mt-2 text-[14px] text-arc-text-2">{missing} {missing === 1 ? 'talk is' : 'talks are'} not in this programme and were left out.</p>}
      <div ref={mapRef} className="-mx-6 mt-4"><ArcView arc={arc} states={states} info={info} scale={fit} readOnly fit /></div>
    </Screen>
  );
}

// 18 "Just read" (user 11/20 「Just read = 저장 없이 보기만」): the 13 list (final prototype: Just read → 13), nothing stored. Talks open 14; a line on top
// says it is not saved, with Add (as "Add to my Arcs").
export function JustRead({ payload }: { payload: string }) {
  const { r, ok, states, info } = useReceived(payload);
  useEffect(() => { if (ok) { setViewingArc(ok.arc); setCurrentArc(ok.arc.id); } }, [ok]);
  if (!r) return null;
  if (!ok) return <Broken why={(r as { error: string }).error} />;
  const { arc } = ok;
  return (
    <Screen clock label="Shared Arc, not saved" header={<BackButton href={href(`r/${payload}`)} />}>
      <div className="mt-2 flex items-center gap-3 rounded-[20px] border border-arc-line bg-arc-surface py-2 pr-2 pl-4">
        <p className="flex-1 text-[14px] font-medium text-arc-text-2">Not saved · Add to keep it</p>
        <ArcButton kind="primary" className="h-11 min-w-[72px]" onClick={() => keep(arc)}>Add</ArcButton>
      </div>
      <Intro />
      <h1 className="mt-4 max-w-[300px] text-[22px] leading-7 font-semibold tracking-[-0.02em] break-words">{arc.query}</h1>
      <AngleRows arc={arc} states={states} info={info} />
    </Screen>
  );
}

export function Pick({ payload }: { payload: string }) {
  const { r, ok, states, info } = useReceived(payload);
  const mine = useArcs();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  if (!r || !mine) return null;
  if (!ok) return <Broken why={(r as { error: string }).error} />;
  const { arc } = ok;
  const myKeys = new Set(mine.flatMap(a => a.nodes.map(n => n.key)));
  const locked = new Map<string, 'ended' | 'mine'>();
  for (const n of arc.nodes) { if (myKeys.has(n.key)) locked.set(n.key, 'mine'); else if (states.get(n.key) === 'ended') locked.set(n.key, 'ended'); }
  const picked = new Set(arc.nodes.filter(n => !locked.has(n.key) && !skipped.has(n.key)).map(n => n.key));
  const toggle = (k: string) => setSkipped(s => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  const save = () => {
    const nodes = arc.nodes.filter(n => picked.has(n.key));
    keep({ ...arc, nodes, tension: nodes.some(n => n.angle === 'T') ? 'found' : 'none' }, 'home');
  };
  const hidden = arc.nodes.length - (layout(arc) as { nodes: unknown[] }).nodes.length; // bundled on the map (+N): pick them in the list
  const legend = (icon: React.ReactNode, label: string) => <span className="flex items-center gap-1.5 text-[12px] font-medium text-arc-text-2">{icon}{label}</span>;
  return (
    <Screen clock label="Pick some" header={<><BackButton href={href(`r/${payload}`)} /><span /></>}
      bottom={<ArcButton onClick={save} disabled={!picked.size}>{picked.size ? `Add ${picked.size} to my Arcs` : 'Pick at least one talk'}</ArcButton>}>
      <h1 className="mt-2.5 text-[26px] leading-8 font-semibold tracking-[-0.02em] break-words">Pick what to keep.</h1>
      <div className="-mx-6 mt-7"><ArcView arc={arc} states={states} info={info} scale={0.78} readOnly pick={{ picked, locked, onToggle: toggle }} /></div>
      {/* the map box keeps room for two-line labels below the bottom row; Figma's legend sits 30 under its one-line labels */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-[18px] gap-y-2" aria-hidden="true">
        {legend(<span className="flex size-4 items-center justify-center rounded-full bg-arc-text"><img src={checkIcon} alt="" width={12} height={12} className="brightness-0" /></span>, 'Keep')}
        {legend(<span className="size-4 rounded-full border-[1.5px] border-arc-text/60" />, 'Skip')}
        {legend(<span className="flex size-4 items-center justify-center"><Pic src={lockIcon} size={14} /></span>, 'Ended')}
        {[...locked.values()].includes('mine') && legend(<span className="flex size-4 items-center justify-center"><Pic src={lockIcon} size={14} /></span>, 'Already yours')}
      </div>
      {hidden > 0 && (
        <section aria-label="All talks" className="mt-[65px] flex flex-col gap-2 pb-2">{/* one row (75) lower than before the legend moved down: no row sits half under the bottom bar (axe target-size) */}
          {/* not in Figma: keeps the place it had before the legend moved up (a row cut by the bottom bar failed axe target-size) */}
          <h2 className="text-[15px] font-semibold">All {arc.nodes.length} talks</h2>
          {arc.nodes.map(n => {
            const lock = locked.get(n.key), on = picked.has(n.key), i = info(n.key);
            return (
              <button key={n.key} type="button" onClick={() => !lock && toggle(n.key)} aria-pressed={lock ? undefined : on} aria-disabled={lock ? true : undefined}
                className={`flex min-h-touch items-center gap-3 rounded-2xl border border-arc-line bg-arc-surface px-3.5 py-2 text-left ${lock ? 'opacity-50' : ''}`}>
                <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-full ${on ? 'bg-arc-text' : 'border-[1.5px] border-arc-text/60'}`}>{on && <img src={checkIcon} alt="" width={14} height={14} className="brightness-0" />}</span>
                <span className="min-w-0 flex-1 text-[14px] font-semibold"><span className="line-clamp-2">{i.title}</span>
                  <span className="block text-[12px] font-medium text-arc-text-3">{ANGLE_NAME[n.angle]} · {i.time}{lock === 'mine' ? ' · already yours' : lock ? ' · ended' : ''}</span></span>
              </button>
            );
          })}
        </section>
      )}
    </Screen>
  );
}

// 19b · Make it yours (Figma 743:1568). Their talks are outlines until kept (tap: solid, tap again: outline); + adds talks
// with 15's sheet, marked "Yours"; the question can be changed (the added words underlined), the talks are not recomputed.
// Save keeps only the kept talks as a new Arc of my own. Kept / Yours live only on this screen.
export function Yours({ payload }: { payload: string }) {
  const { r, ok, states, info, paper, timeOf } = useReceived(payload);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<ArcNode[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<Angle | null>(null);
  const nodes = useMemo(() => (ok ? [...ok.arc.nodes, ...added] : []), [ok, added]);
  const exclude = useMemo(() => nodes.map(n => n.key), [nodes]);
  if (!r) return null;
  if (!ok) return <Broken why={(r as { error: string }).error} />;
  const { arc } = ok;
  const q = query ?? arc.query;
  const draft: Arc = { ...arc, nodes, tension: tensionFor(arc, nodes) as Arc['tension'] }; // the orb keeps their question (Figma 19b)
  const yours = new Set(added.map(n => n.key));
  const toggle = (k: string) => setKept(s => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  const clash = (k: string) => {
    const s = timeOf(k);
    const other = s && nodes.find(n => kept.has(n.key) && (() => { const o = timeOf(n.key); return o && o.start < s.end && s.start < o.end; })());
    return other ? info(other.key).short : null;
  };
  const save = async () => {
    const mine = mineFrom(arc, { nodes: nodes.filter(n => kept.has(n.key)), query: q, id: newId(), createdAt: nowMs() }) as Arc;
    await saveArc(mine); update(setOnboarded); go(`arc/${mine.id}`, { replace: true });
  };
  const commit = (v: string) => { const t = v.trim().slice(0, QUERY_MAX); setQuery(t && t !== arc.query ? t : null); setEditing(false); };
  const [before, words, after] = addedWords(arc.query, q);
  const theirs = arc.nodes.length;
  const hidden = nodes.length - (layout(draft) as { nodes: unknown[] }).nodes.length; // bundled on the map (+N): keep them in the list
  return (
    <Screen clock label="Make it yours" /* prototype 19b: no back, the chip sits where it does on 18 */
      bottom={<div className="flex flex-wrap gap-x-3 gap-y-2.5">
        <ArcButton kind="secondary" className="min-w-fit grow basis-[calc(50%-6px)]" onClick={() => keep(arc, 'home')}>Keep all theirs</ArcButton>
        <ArcButton className="min-w-fit grow basis-[calc(50%-6px)]" onClick={save} disabled={!kept.size} aria-describedby={kept.size ? undefined : 'yours-why'}>Save as my Arc</ArcButton>
      </div>}>
      <p className="mt-2 inline-flex items-center gap-1.5 self-start rounded-2xl border border-arc-line bg-arc-surface py-1.5 pr-3 pl-2.5 text-[13px] font-semibold"><Pic src={linkIcon} size={14} />Shared Arc</p>
      {editing
        ? <input autoFocus defaultValue={q} maxLength={QUERY_MAX} aria-label="Your question" onBlur={e => commit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
            className="mt-3 h-14 w-full rounded-2xl border border-arc-line bg-arc-surface px-4 text-[16px] font-semibold text-arc-text focus:outline-none" />
        : <h1 className="mt-3 text-[24px] leading-8 font-semibold tracking-[-0.02em] break-words">
            <button type="button" onClick={() => setEditing(true)} aria-description="Edit the question" className="min-h-touch text-left">
              {before}{words && <span className="underline">{words}</span>}{after}
            </button>
          </h1>}
      <div className="-mx-6 mt-4"><ArcView arc={draft} states={states} info={info} scale={0.78} fit
        own={{ kept, yours, onToggle: toggle, adding, onAdd: a => setAdding(x => (x === a ? null : a)) }} /></div>
      <p className="mt-6 text-[13px] font-medium text-arc-text/62">Their {theirs} {theirs === 1 ? 'stop stays as an outline' : 'stops stay as outlines'} until you keep {theirs === 1 ? 'it' : 'them'}.</p>
      {!kept.size && <p id="yours-why" className="mt-1 text-[13px] font-medium text-arc-text/62">Keep at least one stop to save.</p>}
      {hidden > 0 && (
        <section aria-label="All talks" className="mt-6 flex flex-col gap-2 pb-2">
          <h2 className="text-[15px] font-semibold">All {nodes.length} talks</h2>
          {nodes.map(n => {
            const on = kept.has(n.key), i = info(n.key);
            return (
              <button key={n.key} type="button" onClick={() => toggle(n.key)} aria-pressed={on} aria-description="Keep"
                className="flex min-h-touch items-center gap-3 rounded-2xl border border-arc-line bg-arc-surface px-3.5 py-2 text-left">
                <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-full ${on ? 'bg-arc-text' : 'border-[1.5px] border-dashed border-arc-text/60'}`}>{on && <img src={checkIcon} alt="" width={14} height={14} className="brightness-0" />}</span>
                <span className="min-w-0 flex-1 text-[14px] font-semibold"><span className="line-clamp-2">{i.title}</span>
                  <span className="block text-[12px] font-medium text-arc-text-3">{ANGLE_NAME[n.angle]} · {i.time}{yours.has(n.key) ? ' · Yours' : ''}</span></span>
              </button>
            );
          })}
        </section>
      )}
      {adding && <AddSheet key={adding} query={q} engineName={arc.engine} target={adding} exclude={exclude} swap={false} info={info} paper={paper} clash={clash}
        onPick={c => { setAdded(a => [...a, c]); setKept(k => new Set([...k, c.key])); setAdding(null); }} />}
    </Screen>
  );
}

/** A link opened by someone who has never seen ARC (user 11/28 「공유 링크로 들어오니 무슨 앱인지 몰랐다」): one line on what this is */
function Intro() {
  return (
    <p className="mt-2 text-[13px] leading-[18px] text-arc-text-2">ARC finds CHI talks that support, challenge or reframe a question.{' '}
      <a href={href('start/1')} className="inline-flex min-h-touch items-center font-semibold whitespace-nowrap text-[#9db2ff]">Make your own ›</a></p>
  );
}
