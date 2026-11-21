// 18 · Shared Arc (Figma 599:994) and 19 · Pick some (599:1117). A link from someone: no sender, only a "Shared Arc"
// chip. Add to my Arcs keeps it all as a new Arc (never merged); Pick some keeps the talks you tick. Talks that are over
// (Figma's "Ended") and talks already in one of your Arcs (the brief) are locked. Nothing is saved until you choose.
import { useEffect, useMemo, useState } from 'react';
import { go, href } from '../../router';
import { decodeLink, receivedArc } from '../../arc/link.js';
import { labelOf } from '../../arc/label.js';
import { nodeStates, layout, type NodeState } from '../../arc/map.js';
import { setOnboarded } from '../../arc/draft.js';
import { saveArc, useArcs } from '../../arc/store';
import { useTribe, setCurrentArc, setViewingArc } from '../../arc/live';
import { update } from '../../state/useDevice';
import { loadSchedule, loadAbstracts, loadDebut, type Schedule } from '../../data/load';
import { abstractFileDay, firstSlot, dateOf, clockOf } from '../../explore/format';
import { useNow, now as nowMs } from '../../clock.js';
import { venueClock } from '../../time.js';
import { Screen, ArcButton, BackButton, Pic } from '../../components/arc';
import { ANGLE_NAME } from './AngleHelp';
import { ArcView, type Info } from './ArcView';
import { shortRoom } from './useArc';
import linkIcon from '../../assets/arc/icon-link.svg';
import lockIcon from '../../assets/arc/icon-lock.svg';
import checkIcon from '../../assets/arc/icon-check.svg';
import type { Arc } from '../../engine';

type Slot = { start: number | null; end: number; roomKey: string; sessionKey: string };
type Paper = { title: string; authors: string[]; slots: Slot[] };
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
    return { arc: r.arc as Arc, missing: r.missing, schedule }; // link.js is untyped JS; its Arc matches contracts/Arc
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
      when: s ? `${venueClock(s.start, tz)}${room ? ` · ${shortRoom(room)}` : ''}` : '', room: room ? shortRoom(room) : '' };
  };
  return { r, ok, states, info };
}

const keep = async (arc: Arc) => { await saveArc(arc); update(setOnboarded); go(`arc/${arc.id}`, { replace: true }); };
// 18 "Make it mine" (user 11/20 「Make it mine = 내 Arc로 저장(수정 가능)」, 「Make it mine 뒤에는 15 Edit으로」): one of my own
// Arcs (no "shared with you"), opened in 15 to change it.
const makeMine = async (arc: Arc) => { await saveArc({ ...arc, source: 'mine' }); update(setOnboarded); go(`arc/${arc.id}/edit`, { replace: true }); };

function Broken({ why }: { why: string }) {
  return (
    <Screen label="Shared Arc" bottom={<a href={href('home')} className="inline-flex h-[54px] w-full items-center justify-center rounded-full bg-arc-primary text-[16px] font-semibold text-arc-on-primary">Go to my Arcs</a>}>
      <h1 className="mt-16 text-[26px] leading-8 font-semibold">This link can't be opened</h1>
      <p className="mt-3 text-[16px] text-arc-text-2">It is {why}. Ask for the link again.</p>
    </Screen>
  );
}

export function Received({ payload }: { payload: string }) {
  const { r, ok, states, info } = useReceived(payload);
  if (!r) return null;
  if (!ok) return <Broken why={(r as { error: string }).error} />;
  const { arc, missing } = ok;
  return (
    <Screen clock label="Shared Arc" bottom={<div className="flex flex-col">{/* Figma 18: 10 under Add, 12 above Just read */}
      <ArcButton onClick={() => keep(arc)} disabled={!arc.nodes.length}>Add to my Arcs</ArcButton>
      {/* Figma 18: Pick some · Make it mine side by side; with larger text each takes its own row rather than breaking its words */}
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-2.5">
        <ArcButton kind="secondary" className="min-w-fit grow basis-[calc(50%-6px)]" onClick={() => go(`r/${payload}/pick`)} disabled={!arc.nodes.length}>Pick some</ArcButton>
        <ArcButton kind="secondary" className="min-w-fit grow basis-[calc(50%-6px)]" onClick={() => makeMine(arc)} disabled={!arc.nodes.length}>Make it mine</ArcButton>
      </div>
      <ArcButton kind="ghost" className="mt-3" onClick={() => go(`r/${payload}/read`)} disabled={!arc.nodes.length}>Just read</ArcButton>
    </div>}>
      <p className="mt-2 inline-flex items-center gap-1.5 self-start rounded-2xl border border-arc-line bg-arc-surface py-1.5 pr-3 pl-2.5 text-[13px] font-semibold"><Pic src={linkIcon} size={14} />Shared Arc</p>
      <h1 className="mt-3 text-[26px] leading-8 font-semibold tracking-[-0.02em]">{arc.query}</h1>
      {missing > 0 && <p className="mt-2 text-[14px] text-arc-text-2">{missing} {missing === 1 ? 'talk is' : 'talks are'} not in this programme and were left out.</p>}
      <div className="-mx-6 mt-4"><ArcView arc={arc} states={states} info={info} scale={0.78} readOnly fit /></div>
    </Screen>
  );
}

// 18 "Just read" (user 11/20 「Just read = 저장 없이 보기만」): the map, read-only, nothing stored. Talks open 14; a line on top
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
      <h1 className="mt-4 text-[26px] leading-8 font-semibold tracking-[-0.02em]">{arc.query}</h1>
      <div className="-mx-6 mt-3"><ArcView arc={arc} states={states} info={info} scale={0.78} onNode={k => go(`talk/${k}`)} onBundle={() => {}} /></div>
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
    keep({ ...arc, nodes, tension: nodes.some(n => n.angle === 'T') ? 'found' : 'none' });
  };
  const hidden = arc.nodes.length - (layout(arc) as { nodes: unknown[] }).nodes.length; // bundled on the map (+N): pick them in the list
  const legend = (icon: React.ReactNode, label: string) => <span className="flex items-center gap-1.5 text-[12px] font-medium text-arc-text-2">{icon}{label}</span>;
  return (
    <Screen clock label="Pick some" header={<><BackButton href={href(`r/${payload}`)} /><span /></>}
      bottom={<ArcButton onClick={save} disabled={!picked.size}>{picked.size ? `Add ${picked.size} to my Arcs` : 'Pick at least one talk'}</ArcButton>}>
      <h1 className="mt-2.5 text-[26px] leading-8 font-semibold tracking-[-0.02em]">Pick what to keep.</h1>
      <div className="-mx-6 mt-7"><ArcView arc={arc} states={states} info={info} scale={0.78} readOnly pick={{ picked, locked, onToggle: toggle }} /></div>
      {/* the map box keeps room for two-line labels below the bottom row; Figma's legend sits 30 under its one-line labels */}
      <div className="-mt-8 flex flex-wrap justify-center gap-x-[18px] gap-y-2" aria-hidden="true">
        {legend(<span className="flex size-4 items-center justify-center rounded-full bg-arc-text"><img src={checkIcon} alt="" width={12} height={12} className="brightness-0" /></span>, 'Keep')}
        {legend(<span className="size-4 rounded-full border-[1.5px] border-arc-text/60" />, 'Skip')}
        {legend(<span className="flex size-4 items-center justify-center"><Pic src={lockIcon} size={14} /></span>, 'Ended')}
        {[...locked.values()].includes('mine') && legend(<span className="flex size-4 items-center justify-center"><Pic src={lockIcon} size={14} /></span>, 'Already yours')}
      </div>
      {hidden > 0 && (
        <section aria-label="All talks" className="mt-[34px] flex flex-col gap-2 pb-2">
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
