// 20b · After CHI (Figma 743:1741): "Your CHI, in N questions." Up to 3 mini Arcs; heard / to read / questions; one Arc
// still without a Challenge (opens 07 with its question); Share my CHI (each question with its /s/ link); the reading list
// (the talks not heard) as .txt or .bib, made on the phone (arc/afterChi.js). Opens from 20's After CHI tab once CHI is over.
import { useEffect, useState } from 'react';
import { go, href } from '../../router';
import { useArcs } from '../../arc/store';
import { heardOf, setQuery } from '../../arc/draft.js';
import { toReadKeys, stillOpen, readingTxt, readingBib } from '../../arc/afterChi.js';
import { update, useDevice } from '../../state/useDevice';
import { useTribe } from '../../arc/live';
import { loadSchedule, loadPeople, EDITION } from '../../data/load';
import { Screen, ArcButton, BackButton, Pic } from '../../components/arc';
import { MiniArc } from './Home';
import { shareUrl } from './Share';
import challenge from '../../assets/arc/angle-challenge.svg';

type Paper = { title: string; authors: string[]; doi: string | null };

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function AfterChi() {
  const arcs = useArcs();
  const heard = heardOf(useDevice());
  const [lookup, setLookup] = useState<{ paper: (k: string) => Paper | undefined; name: (k: string) => string | undefined } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState('');
  useTribe(null);
  useEffect(() => {
    Promise.all([loadSchedule(), loadPeople()]).then(([s, people]) => setLookup({ paper: k => s.index.papers.get(k) as Paper | undefined, name: k => people[k]?.name }), () => {});
  }, []);
  if (!arcs) return null;
  const toRead = toReadKeys(arcs, heard);
  const open = stillOpen(arcs);
  const n = arcs.length;
  const items = () => toRead.map(k => {
    const p = lookup?.paper(k);
    return { key: k, title: p?.title ?? k, authors: (p?.authors ?? []).map(a => lookup?.name(a)).filter((x): x is string => !!x), doi: p?.doi ?? null };
  });
  const share = async () => {
    const text = arcs.map(a => `“${a.query}”\n${shareUrl(a)}`).join('\n\n');
    if (navigator.share) { try { await navigator.share({ title: 'My CHI', text }); } catch { /* closed */ } return; }
    try { await navigator.clipboard.writeText(text); setNote('Copied.'); } catch { setNote(text); } // no clipboard: show it to copy by hand
  };
  const stat = (value: number, label: string) => (
    <div className="h-[84px] rounded-[18px] bg-[linear-gradient(rgba(255,255,255,0.06),rgba(255,255,255,0.03)_55%,rgba(255,255,255,0))] px-3.5 pt-3">
      <p data-count="" className="text-[30px] leading-[36px] font-semibold tracking-[-0.024em]">{value}</p>
      <p className="mt-1.5 text-[12px] font-medium text-arc-text-3">{label}</p>
    </div>
  );
  return (
    <Screen label="Your CHI" header={<><BackButton href={href('home')} /><span /></>}
      bottom={<>
        {exporting && (
          <div role="group" aria-label="Export reading list" className="flex gap-3">
            <ArcButton kind="secondary" className="min-w-fit grow" disabled={!lookup} onClick={() => download(`${EDITION}-reading-list.txt`, readingTxt(items()), 'text/plain')}>Text (.txt)</ArcButton>
            <ArcButton kind="secondary" className="min-w-fit grow" disabled={!lookup} onClick={() => download(`${EDITION}-reading-list.bib`, readingBib(items(), EDITION), 'application/x-bibtex')}>BibTeX (.bib)</ArcButton>
          </div>
        )}
        <ArcButton onClick={share} disabled={!n}>Share my CHI</ArcButton>
        <ArcButton kind="secondary" onClick={() => setExporting(x => !x)} aria-expanded={exporting} disabled={!toRead.length} aria-describedby={toRead.length ? undefined : 'after-none'}>Export reading list</ArcButton>
        {!toRead.length && <p id="after-none" className="-mt-1.5 text-center text-[13px] font-medium text-arc-text/62">Nothing left to read.</p>}
      </>}>
      <h1 className="mt-3 text-[30px] leading-9 font-semibold tracking-[-0.024em]">Your CHI,<br />in {n} {n === 1 ? 'question' : 'questions'}.</h1>
      <div className="mt-[22px] grid grid-cols-3 gap-[21px]" aria-hidden="true">
        {arcs.map(a => <MiniArc key={a.id} arc={a} heard={heard} />)}{/* every one the title counts (it said 4 over 3) */}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-[21px]">
        {stat(heard.size, 'heard')}{stat(toRead.length, 'to read')}{stat(n, 'questions')}
      </div>
      {open && (
        <button type="button" onClick={() => { update(s => setQuery(s, open.query)); go('ask'); }}
          className="mt-5 flex flex-col gap-2.5 rounded-[20px] border border-arc-line bg-arc-surface p-[15px] text-left">
          <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.006em]"><Pic src={challenge} size={18} />Still open</span>
          <span className="text-[14px] leading-5 font-medium tracking-[-0.006em] text-arc-text/72">“{open.query}” has no challenge yet. Ask a follow-up to look for one.</span>
        </button>
      )}
      <p role="status" className="sr-only">{note}</p>
      {note && <p aria-hidden="true" className="fixed inset-x-0 bottom-48 mx-auto w-fit max-w-[90%] rounded-full bg-arc-primary px-4 py-2 text-[14px] font-semibold break-all whitespace-pre-line text-arc-on-primary">{note}</p>}
    </Screen>
  );
}
