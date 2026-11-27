// 14 Q&A (Figma 597:972, decision 007): questions by votes, one vote per phone, Report (three hide a question), Delete
// for your own. The ask box is the screen's one bottom element. Text is plain React text, never HTML.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { update, useDevice } from '../../state/useDevice';
import { votedOf, addVoted } from '../../arc/draft.js';
import { useQaToken, listQuestions, ask, vote, flag, remove, type Question } from '../../arc/qa';
import { useOnline } from '../../data/offline';
import { Pic, Sheet, ArcButton } from '../../components/arc';
import { closeQuestion, closeText } from '../../arc/talk.js';
import voteIcon from '../../assets/arc/icon-vote.svg';
import voteOnIcon from '../../assets/arc/icon-vote-on.svg';
import chat from '../../assets/arc/icon-chat.svg';

const MAX = 280;

export function useQandA(paperKey: string) {
  const token = useQaToken();
  const voted = votedOf(useDevice());
  const online = useOnline();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const reload = useCallback(() => {
    if (!token) return;
    listQuestions(token, paperKey).then(q => { setQuestions(q); setError(''); }, e => setError(String(e.message ?? e)));
  }, [token, paperKey]);
  useEffect(() => { reload(); }, [reload, online]);
  // 14b: an existing question close to the one being typed, matched on the phone (nothing is sent until a button)
  const close = useMemo(() => closeQuestion(text, questions) as { question: Question; count: number } | null, [text, questions]);
  // also: "Me too + add mine" votes for the close question first (the existing vote), then posts the typed one
  const send = async (also?: Question): Promise<boolean> => {
    const t = text.trim();
    if (!t || busy || !token) return false;
    setBusy(true); setNote('');
    try {
      if (also && !(also.voted || voted.has(also.id))) { await vote(token, also.id); update(s => addVoted(s, also.id)); }
      await ask(token, paperKey, t); setText(''); setNote('Question added.'); reload();
      return true;
    }
    catch (e) { setNote(String((e as Error).message)); return false; }
    finally { setBusy(false); }
  };
  const act = async (f: () => Promise<unknown>, done: string) => { try { await f(); setNote(done); reload(); } catch (e) { setNote(String((e as Error).message)); } };
  return {
    questions, error, text, setText, busy, note, send, online, close,
    voteOn: (q: Question) => act(async () => { await vote(token, q.id); update(s => addVoted(s, q.id)); }, 'Vote counted.'),
    flagOn: (q: Question) => act(() => flag(token, q.id), 'Reported. Three reports hide a question.'),
    deleteOn: (q: Question) => act(() => remove(token, q.id), 'Your question was deleted.'),
    isVoted: (q: Question) => q.voted || voted.has(q.id),
  };
}

export function QandAList({ qa }: { qa: ReturnType<typeof useQandA> }) {
  const { questions, error, online } = qa;
  return (
    <section aria-labelledby="qa" className="mt-[18px]">
      <h2 id="qa" className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.012em]">Questions
        {/* Figma 45% (4.28:1); 55% */}
        <span className="text-[12px] font-medium tracking-normal text-arc-text-3">{questions?.length ?? ''}</span>
      </h2>
      {!online && <p className="mt-3 text-[15px] text-arc-text-2">Questions need a connection.</p>}
      {online && error && <p role="alert" className="mt-3 text-[15px] text-arc-text-2">Questions are not available right now.</p>}
      {online && !error && questions == null && <p className="mt-3 text-[15px] text-arc-text-3">Loading questions…</p>}
      {online && !error && questions?.length === 0 && <p className="mt-3 text-[15px] text-arc-text-2">Be the first to ask</p>}
      <ul className="mt-3 flex flex-col gap-2.5">
        {questions?.map(q => {
          const v = qa.isVoted(q);
          return (
            <li key={q.id} className="flex min-h-16 items-center gap-2.5 rounded-[20px] border border-arc-line bg-arc-surface py-2 pr-2.5 pl-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-5 tracking-[-0.006em] break-words">{q.text}</p>
                <div className="-ml-2 flex">
                  {q.mine
                    ? <button type="button" onClick={() => qa.deleteOn(q)} className="min-h-touch px-2 text-[13px] font-semibold text-arc-text-2 underline">Delete</button>
                    : <button type="button" onClick={() => qa.flagOn(q)} className="min-h-touch px-2 text-[13px] font-semibold text-arc-text-2 underline">Report</button>}
                </div>
              </div>
              {/* voted = filled arrow on the primary fill (user 「누른 상태가 눈으로 구분되게(아이콘 채움 + 색, 비텍스트 대비 3:1)」:
                  #f4f3f8 on the #1c1b24 card is 15:1); Figma's surface fill read the same as not voted. Screen readers: aria-pressed */}
              <button type="button" onClick={() => !v && qa.voteOn(q)} aria-pressed={v} aria-label={`${v ? 'Voted' : 'Vote for this question'}, ${q.votes} ${q.votes === 1 ? 'vote' : 'votes'}`}
                className={`flex h-12 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border ${v ? 'border-transparent bg-arc-primary text-arc-on-primary' : 'border-arc-text/[0.14]'}`}>
                <Pic src={v ? voteOnIcon : voteIcon} size={16} />
                <span className="text-[12px] font-medium">{q.votes}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function QandAAsk({ qa }: { qa: ReturnType<typeof useQandA> }) {
  const left = MAX - qa.text.length;
  const [about, setAbout] = useState(false);
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  // the composer opens and takes the focus in the same tap, or iOS does not raise the keyboard
  const start = () => { flushSync(() => setOpen(true)); field.current?.focus(); };
  const note = qa.note || (left < 40 ? `${left} characters left` : 'Public · No personal info · Deleted 13 Jun 2027');
  return (
    // 14 (user 11/27): the box under the talk only opens the composer; typing happens there, over the page
    <div className="-mb-[13px] flex flex-col">
      <button type="button" onClick={start} disabled={!qa.online} aria-haspopup="dialog" aria-describedby="qa-note"
        className="flex h-[52px] items-center gap-2.5 rounded-full border border-arc-line bg-arc-surface pr-2 pl-[18px] text-left select-none disabled:opacity-60">
        <Pic src={chat} size={18} className="opacity-50" />
        <span className={`min-w-0 flex-1 truncate text-[16px] tracking-[-0.006em] ${qa.text ? 'text-arc-text' : 'text-arc-text-3'}`}>{qa.text || 'Ask the authors anything'}</span>
      </button>
      <p id="qa-note" className="flex min-h-[15px] items-center justify-center gap-1 text-center text-[12px] leading-[15px] text-arc-text-3" aria-live="polite">
        {/* user 「안내는 한 줄 "Public · No personal info · Deleted 13 Jun 2027" + ⓘ(누르면 자세한 설명)」 */}
        {note}
          <button type="button" onClick={() => setAbout(true)} aria-label="About questions" className="relative -my-[4.5px] inline-flex size-6 items-center justify-center text-[13px] leading-[15px] text-arc-text-2 before:absolute before:-inset-[10px] before:content-['']">ⓘ</button>{/* 24 px box (axe target-size), 44 px touch area */}
      </p>
      {open && <Composer qa={qa} field={field} note={note} onClose={() => setOpen(false)} />}
      <Sheet open={about} onClose={() => setAbout(false)} title="About questions">
        {/* 해석(확인 전): the detail text, from decision 007 and functions/qa.mjs (it keeps sha256(salt + device token)) */}
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[21px] text-arc-text-2">
          <li>Anyone who opens this talk in ARC can read its questions.</li>
          <li>Only the question, its votes and reports are kept, with a scrambled code for this phone so you can vote once and delete your own. No name, email, IP address or browser details.</li>
          <li>A question reported by three people is hidden.</li>
          <li>You can delete your own questions from this phone.</li>
          <li>Everything is deleted on 13 June 2027.</li>
        </ul>
      </Sheet>
    </div>
  );
}

/**
 * The question composer (user 11/27, after the box kept fighting Safari's keyboard): a sheet exactly over the visual
 * viewport (fixed, top = offsetTop, height = height, kept so on its resize and scroll), the page under it held still
 * (body fixed, its scroll put back on close). Nothing to follow: the keyboard can only push the sheet's own bottom.
 */
function Composer({ qa, field, note, onClose }: { qa: ReturnType<typeof useQandA>; field: React.RefObject<HTMLTextAreaElement | null>; note: string; onClose: () => void }) {
  const [box, setBox] = useState(() => ({ top: visualViewport?.offsetTop ?? 0, height: visualViewport?.height ?? innerHeight }));
  useEffect(() => {
    const vv = visualViewport;
    const fit = () => setBox({ top: vv?.offsetTop ?? 0, height: vv?.height ?? innerHeight });
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);
    const y = scrollY, b = document.body.style, was = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width };
    Object.assign(b, { position: 'fixed', top: `${-y}px`, left: '0', right: '0', width: '100%' });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', esc);
    return () => { vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); removeEventListener('keydown', esc); Object.assign(b, was); scrollTo(0, y); };
  }, [onClose]);
  const close = qa.online && qa.text.trim() ? qa.close : null;
  const send = async (also?: Parameters<typeof qa.send>[0]) => { if (await qa.send(also)) onClose(); }; // a failure stays, with its note
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Ask the authors" className="fixed inset-x-0 z-[70] mx-auto flex max-w-[480px] flex-col bg-arc-sheet px-5 pt-3 pb-3 font-sans text-arc-text"
      style={{ top: box.top, height: box.height }}>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold tracking-[-0.012em]">Ask the authors</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex size-11 items-center justify-center"><span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-white/10 text-[15px] text-arc-text-2">×</span></button>
      </div>
      <textarea ref={field} value={qa.text} onChange={e => qa.setText(e.target.value.slice(0, MAX))} maxLength={MAX} rows={4} enterKeyHint="send"
        placeholder="Ask the authors anything" aria-describedby="qa-note-sheet"
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!close) send(); } }}
        className="mt-2 min-h-0 flex-1 resize-none rounded-2xl border border-arc-line bg-arc-surface px-4 py-3 text-[16px] leading-[22px] text-arc-text placeholder:text-arc-text-3 focus:outline-none" />
      {close && (
        <div role="status" className="mt-2 rounded-2xl bg-white/5 px-4 py-2.5">
          <p className="text-[13px] font-semibold">{closeText(close.count)}</p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-arc-text-2">“{close.question.text}”</p>
        </div>
      )}
      <p id="qa-note-sheet" className="mt-1.5 text-center text-[12px] text-arc-text-3">{note}</p>
      <div className="mt-2 flex gap-2">
        {close
          ? <><ArcButton kind="secondary" className="flex-1" disabled={qa.busy} onClick={() => send()}>Post on its own</ArcButton>
              <ArcButton className="flex-1" disabled={qa.busy} onClick={() => send(close.question)}>Me too + add mine</ArcButton></>
          : <ArcButton disabled={qa.busy || !qa.text.trim()} onClick={() => send()}>Ask</ArcButton>}
      </div>
    </div>, document.body);
}

