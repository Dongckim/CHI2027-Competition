// 07 · Ask: one question (a word or a sentence). While typing, the tribe it would land in shows as a chip (engine.tribeOf).
// First time this is step 6 of the onboarding dots with Skip; from home it has a back button instead.
import { useEffect, useId, useState } from 'react';
import { go, href } from '../../router';
import { update, useDevice } from '../../state/useDevice';
import { arcOf, setQuery, setOnboarded, QUERY_MAX } from '../../arc/draft.js';
import { engine, topicHelp, type Arc, type Angle, type TribeId } from '../../engine';
import { isTopic, topicOf } from '../../arc/topic.js';
import { layout } from '../../arc/map.js';
import { play, POP } from '../../arc/motion';
import { ANGLE_NAME } from './AngleHelp';
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
type Help = { topic: string; count: number; cards: { text: string; arc: Arc }[] };
const yieldToTyping = () => new Promise(r => setTimeout(r));

// 07b: the topic's talk count, then up to three questions whose Arc is not empty (one Arc at a time, so typing stays
// smooth; the engine caches them). ondevice: composed questions, or title questions when none reads right; mock: titles.
async function helpFor(topic: string, live: () => boolean): Promise<Help | null> {
  const m = await topicHelp();
  const { count, questions } = await m.topicQuestions(topic);
  const cards: Help['cards'] = [];
  for (const q of questions) {
    if (cards.length === 3) break;
    await yieldToTyping();
    if (!live()) return null;
    const arc = await m.questionArc(q.text);
    if (arc.nodes.length) cards.push({ text: q.text, arc });
  }
  return { topic, count, cards };
}

// Figma 741:1638: the 12 map shrunk to 60 (x 0.155, y 0.117 round the orb); the first talk filled in the tribe colour
function MiniArc({ arc }: { arc: Arc }) {
  const id = useId(), c = TRIBE[arc.tribe].color;
  const l = layout(arc) as unknown as { nodes: { node: Arc['nodes'][number]; at: [number, number] }[] };
  const pts = l.nodes.map(n => ({ at: n.at, angle: n.node.angle }))
    .map(p => ({ angle: p.angle, x: 30 + (p.at[0] - 195) * 0.155, y: 30 + (p.at[1] - 240) * 0.117 }));
  return (
    <svg width={60} height={60} viewBox="0 0 60 60" aria-hidden="true" className="shrink-0">
      <defs>
        <radialGradient id={`${id}b`} cx="30" cy="30" r="30" gradientUnits="userSpaceOnUse"><stop stopColor={c} stopOpacity={0.35} /><stop offset={0.7} stopColor={c} stopOpacity={0.14} /><stop offset={1} stopColor={c} stopOpacity={0.06} /></radialGradient>
        <radialGradient id={`${id}o`} cx="30" cy="30" r="9" gradientUnits="userSpaceOnUse"><stop stopColor={c} stopOpacity={0.95} /><stop offset={0.55} stopColor={c} stopOpacity={0.6} /><stop offset={1} stopColor={c} stopOpacity={0.22} /></radialGradient>
      </defs>
      <rect width={60} height={60} rx={12} fill={`url(#${id}b)`} />
      {pts.map((p, i) => {
        const dx = p.x - 30, dy = p.y - 30, d = Math.hypot(dx, dy) || 1;
        return <line key={`l${i}`} x1={30 + (dx / d) * 9} y1={30 + (dy / d) * 9} x2={p.x - (dx / d) * 3} y2={p.y - (dy / d) * 3} stroke="#f4f6ff" strokeOpacity={0.45} strokeWidth={0.6} strokeDasharray={p.angle === 'R' ? '0.7 1.4' : undefined} />;
      })}
      <circle cx={30} cy={30} r={9} fill={`url(#${id}o)`} />
      <circle cx={30} cy={30} r={8.7} stroke="#fff" strokeOpacity={0.55} strokeWidth={0.6} fill="none" />
      {pts.map((p, i) => (i === 0 ? <circle key={i} cx={p.x} cy={p.y} r={3} fill={c} />
        : <circle key={i} cx={p.x} cy={p.y} r={2.7} fill="#f4f6ff" fillOpacity={0.06} stroke="#f4f6ff" strokeOpacity={0.6} strokeWidth={0.6} />))}
      <rect x={0.3} y={0.3} width={59.4} height={59.4} rx={11.7} stroke="#fff" strokeOpacity={0.1} strokeWidth={0.6} fill="none" />
    </svg>
  );
}

// prototype 07: the tribe chip pops in when the question finds its neighbourhood (and again when it changes)
const chipIn = (el: HTMLElement | null) => { play(el, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 0.75, transform: 'scale(1)' }], { duration: 480, easing: POP }); };

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
  const topic = isTopic(draft.query) && topicOf(draft.query) ? topicOf(draft.query) : null; // 07b on "VR", not "I study VR" (persona review 11/25)
  const [help, setHelp] = useState<Help | null>(null);
  useEffect(() => { // 07b, half a second after typing stops; typing more or a question hides it
    if (!topic) { setHelp(null); return; }
    let live = true;
    const t = setTimeout(() => helpFor(topic, () => live).then(h => { if (live && h) setHelp(h); }, () => {}), 500);
    return () => { live = false; clearTimeout(t); };
  }, [topic]);
  const shown = help && help.topic === topic && help.count > 0 ? help : null;
  const ready = hasWords(draft.query);
  const next = () => { if (!ready) return; update(setOnboarded); go('angles'); };
  const ask = (q: string) => { update(s => setQuery(s, q)); update(setOnboarded); go('angles'); };
  const count = (arc: Arc, a: Angle) => arc.nodes.filter(n => n.angle === a).length;
  const t = tribe ? TRIBE[tribe] : null;

  return (
    <Screen label="Ask"
      header={onboarded ? <BackButton href={href('home')} /> : <><StepDots at={8} /><TextAction href={href('home')} className={SKIP_CLASS} onClick={e => { e.preventDefault(); update(setOnboarded); go('home'); }}>Skip</TextAction></>}
      // 07b (Figma 741:1605) has no bottom bar: "Keep ‘<topic>’ as a topic" is the same step as Find my angles, and the
      // bar covered it and "Or keep typing your own." (independent check 11/22)
      bottom={shown ? undefined : <>
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
          <span key={t.id} ref={chipIn} className="ml-0.5 inline-flex items-center gap-1.5 rounded-2xl border py-1.5 pr-3 pl-2.5 text-[13px] font-semibold text-arc-text opacity-75"
            style={{ background: `color-mix(in srgb, ${t.color} 8%, transparent)`, borderColor: `color-mix(in srgb, ${t.color} 30%, transparent)` }}>
            <Pic src={TRIBE_ICON[t.id as TribeId]} size={14} />{t.name}
          </span>
        )}
      </div>
      {shown ? <>
        {/* Figma 741:1605: the note at y 348, cards 86 high every 96 from 428, the line under them at 724 */}
        <p id="topic-note" className="mt-[15px] min-h-16 rounded-2xl bg-gradient-to-b from-white/6 via-white/3 via-55% to-white/0 px-4 py-[13px] text-[13px] leading-[19px] font-medium text-arc-text/72">
          That’s a topic. {shown.count} {shown.count === 1 ? 'talk matches' : 'talks match'} it.{shown.cards.length > 0 && <><br />Pick a sharper question:</>}
        </p>
        <ul className="mt-4 flex flex-col gap-2.5" aria-labelledby="topic-note">
          {shown.cards.map(({ text, arc }) => (
            <li key={text}>
              <button type="button" onClick={() => ask(text)}
                className="relative flex h-[86px] w-full items-start gap-3.5 rounded-[20px] border border-arc-line bg-arc-surface pt-[11px] pr-[30px] pl-[10px] text-left">
                <MiniArc arc={arc} />
                <span className="line-clamp-2 min-w-0 flex-1 pt-px text-[15px] leading-[19px] font-semibold tracking-[-0.006em]">{text}</span>
                {/* Figma: the counts at y 57 in the card, the angle symbols as text; read out by name. "Suggested" before them:
                    the card is the engine's suggestion, not a talk (user 11/21 「제안 카드라는 게 보이게」; designer to confirm) */}
                <span className="absolute top-[56px] left-[84px] text-[12px] font-medium whitespace-pre text-arc-text/60">
                  <span className="font-semibold text-arc-text/75">Suggested</span><span aria-hidden="true">{`   ↑ ${count(arc, 'S')}   ↻ ${count(arc, 'R')}   ⊣ ${count(arc, 'T')}`}</span>
                </span>
                <span className="sr-only">{` · ${(['S', 'R', 'T'] as Angle[]).map(a => `${count(arc, a)} ${ANGLE_NAME[a]}`).join(', ')}`}</span>
                <Pic src={chevron} size={16} className="absolute top-[34px] right-[11px]" />
              </button>
            </li>
          ))}
        </ul>
        {/* user 11/21: a word stays a valid start. Not in Figma (designer to confirm) */}
        <button type="button" onClick={next}
          className="mt-4 min-h-touch w-full rounded-full border border-arc-line bg-arc-surface px-5 py-2.5 text-[15px] font-semibold tracking-[-0.006em] text-arc-text">
          Keep ‘{shown.topic}’ as a topic
        </button>
        <p className="mt-[18px] mb-4 text-[13px] font-medium text-arc-text-3">Or keep typing your own.</p>{/* Figma 0.5; 0.55 is the floor */}
      </> : <>
      <p id="starters" className="mt-[37px] text-[12px] font-medium text-arc-text-3">Or start from one of these</p>
      <ul className="mt-[9.5px] flex flex-col gap-2" aria-labelledby="starters">
        {STARTERS.map(([tid, q]) => (
          <li key={q}>
            <button type="button" onClick={() => ask(q)} /* prototype LINKS "Starter ·" → 08 */
              className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-arc-line bg-arc-surface py-2 pr-3.5 pl-[15px] text-left text-[14px] font-medium tracking-[-0.006em] text-arc-text/85">
              <Pic src={TRIBE_ICON[tid]} size={18} /><span className="min-w-0 flex-1">{q}</span>{/* 사용자 「말줄임 대신 화살표 앞에서 두 줄 줄바꿈」: two lines still fit the 52 row */}<Pic src={chevron} size={16} />
            </button>
          </li>
        ))}
      </ul>
      </>}
    </Screen>
  );
}
