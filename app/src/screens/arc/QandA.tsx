// 14 Q&A (Figma 597:972, decision 007): questions by votes, one vote per phone, Report (three hide a question), Delete
// for your own. The ask box is the screen's one bottom element. Text is plain React text, never HTML.
import { useCallback, useEffect, useState } from 'react';
import { update, useDevice } from '../../state/useDevice';
import { votedOf, addVoted } from '../../arc/draft.js';
import { useQaToken, listQuestions, ask, vote, flag, remove, type Question } from '../../arc/qa';
import { useOnline } from '../../data/offline';
import { Pic, Sheet } from '../../components/arc';
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
  const send = async () => {
    const t = text.trim();
    if (!t || busy || !token) return;
    setBusy(true); setNote('');
    try { await ask(token, paperKey, t); setText(''); setNote('Question added.'); reload(); }
    catch (e) { setNote(String((e as Error).message)); }
    finally { setBusy(false); }
  };
  const act = async (f: () => Promise<unknown>, done: string) => { try { await f(); setNote(done); reload(); } catch (e) { setNote(String((e as Error).message)); } };
  return {
    questions, error, text, setText, busy, note, send, online,
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
  return (
    // Figma: the input at y 742; the one-line note goes under it, in the space above the home indicator
    <form onSubmit={e => { e.preventDefault(); qa.send(); }} className="-mb-[13px] flex flex-col">
      <label className="flex h-[52px] items-center gap-2.5 rounded-full border border-arc-line bg-arc-surface pr-2 pl-[18px]">
        <Pic src={chat} size={18} className="opacity-50" />
        <input value={qa.text} onChange={e => qa.setText(e.target.value.slice(0, MAX))} maxLength={MAX} disabled={!qa.online} enterKeyHint="send"
          placeholder="Add a question for the Q&A" aria-describedby="qa-note"
          className="min-w-0 flex-1 bg-transparent text-[15px] tracking-[-0.006em] text-arc-text placeholder:text-arc-text-3 focus:outline-none" />
        {qa.text.trim() && <button type="submit" disabled={qa.busy} className="h-10 shrink-0 rounded-full bg-arc-primary px-4 text-[14px] font-semibold text-arc-on-primary">Ask</button>}
      </label>
      <p id="qa-note" className="flex min-h-[15px] items-center justify-center gap-1 text-center text-[12px] leading-[15px] text-arc-text-3" aria-live="polite">
        {/* user 「안내는 한 줄 "Public · No personal info · Deleted 13 Jun 2027" + ⓘ(누르면 자세한 설명)」; a status note takes the
            line's words for a while, the ⓘ stays */}
        {qa.note || (left < 40 ? `${left} characters left` : 'Public · No personal info · Deleted 13 Jun 2027')}
          <button type="button" onClick={() => setAbout(true)} aria-label="About questions" className="relative px-0.5 text-[13px] leading-[15px] text-arc-text-2 before:absolute before:-inset-[15px] before:content-['']">ⓘ</button>
      </p>
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
    </form>
  );
}
