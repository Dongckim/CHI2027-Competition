import { useEffect, useState, type ReactNode } from 'react';
import current from '../../../data/build/app-data/chi2026/current.json';
import { response } from '../data/fake-recommend';
import { go } from '../router';
import { update, useDevice, isSaved, loadNote, LANGUAGES, type DeviceState } from '../state/useDevice';
import {
  KINDS, REGISTRATION_NEEDED, HOW_FULL, setQuery, topicsFromResponse, toggleTopic, addOwnTopic, toggleNearby,
  toggleDay, toggleKind, toggleNeed, setLanguage, setHowFull, atStep, canBuild,
} from '../state/device.js';
import { Header } from '../components/Header';
import { Chip } from '../components/Chip';
import { ChoiceRow } from '../components/ChoiceRow';
import { SummaryRow } from '../components/SummaryRow';
import { BottomAction } from '../components/BottomAction';

// Onboarding (Figma 288:680): one question per screen, "N of 4", one button at the bottom. Every choice is saved as it
// is made, so closing the browser mid-way reopens the same screen. `edit` = opened from "Your plan": the button says Done.
type Step = 'research' | 'topics' | 'days' | 'needs' | 'summary' | 'see' | 'language' | 'howfull';
const MAIN: Step[] = ['research', 'topics', 'days', 'needs', 'summary'];

const KIND_LABEL: Record<string, string> = { papers: 'Papers', posters: 'Posters', demos: 'Demos', panels: 'Panels', keynotes: 'Keynotes', workshops: 'Workshops' };
const NEED_LABEL = { stepFree: 'Step-free routes', fewerRoomChanges: 'Fewer room changes', breaks: 'Breaks between talks', largerText: 'Larger text' };
const NEED_SHORT: Record<string, string> = { stepFree: 'Step-free', fewerRoomChanges: 'Fewer room changes', breaks: 'Breaks', largerText: 'Larger text', summaries: 'Summaries' };
const FULL_LABEL: Record<string, string> = { light: 'Light', balanced: 'Balanced', full: 'Full' };
const languageName = (code: string) => LANGUAGES.find(l => l.code === code)?.name ?? code;
const dayLabel = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...o }).format(new Date(`${d}T12:00:00Z`));

export function Onboarding({ step, edit }: { step: Step; edit: boolean }) {
  const state = useDevice();
  // Remember where onboarding is; edits from the summary come back to the summary.
  // Every screen after O-1 needs the sentence: without it (e.g. the summary opened directly) go back to O-1.
  const noSentence = step !== 'research' && !state.plan.query.trim();
  useEffect(() => { if (noSentence) go('start/research', { replace: true }); }, [noSentence]);
  useEffect(() => { if (!noSentence && !edit && MAIN.includes(step)) update(s => atStep(s, step)); }, [step, edit, noSentence]);
  if (noSentence) return null;
  const next = (to: Step) => go(edit ? 'start/summary' : `start/${to}`);
  // Back is explicit, not history.back(): a reopened app has no history but should still step back one question.
  const back = () => go(`start/${edit || !MAIN.includes(step) ? 'summary' : MAIN[MAIN.indexOf(step) - 1]}`);
  const props = { state, edit, next, back };
  switch (step) {
    case 'research': return <Research {...props} />;
    case 'topics': return <Topics {...props} />;
    case 'days': return <Days {...props} />;
    case 'needs': return <Needs {...props} />;
    case 'summary': return <Summary {...props} />;
    case 'see': return <EditSee {...props} />;
    case 'language': return <EditLanguage {...props} />;
    case 'howfull': return <EditHowFull {...props} />;
  }
}

type Props = { state: DeviceState; edit: boolean; next: (to: Step) => void; back: () => void };

function Screen({ header, heading, intro, children, action }:
  { header: ReactNode; heading?: string; intro?: ReactNode; children: ReactNode; action: { label: string; onClick: () => void; disabled?: boolean } }) {
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-bg pb-[calc(var(--touch)+var(--safe-bottom)+32px)]">
      {header}
      <main className="flex flex-col gap-4 px-gutter pt-3">
        {heading && <h1 id="question" className="text-[26px] leading-8 font-semibold">{heading}</h1>}
        {intro}
        {children}
      </main>
      <BottomAction {...action} />
    </div>
  );
}
const Count = ({ n }: { n: number }) => <span className="text-small text-text-2">{n} of 4</span>;

function Research({ state, edit, next }: Props) {
  const [text, setText] = useState(state.plan.query);
  const done = () => {
    update(s => topicsFromResponse(setQuery(s, text.trim()), response));
    next('topics');
  };
  return (
    <Screen header={<Header wordmark right={<Count n={1} />} />} heading="What do you research?"
      intro={<p className="text-body text-text-2">One sentence. ARC plans your CHI days around it.</p>}
      action={{ label: edit ? 'Done' : 'Next', onClick: done, disabled: !text.trim() }}>
      <textarea aria-labelledby="question" value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="I study …"
        className="min-h-[96px] w-full resize-none rounded-row border border-border-strong bg-bg p-3 text-body text-text placeholder:text-text-3" />
      <p className="text-small text-text-2">
        {isSaved() ? 'No account. Saved on this phone.' : "No account. This browser won't keep your plan after you close it."}
      </p>
      {loadNote === 'unreadable' && <p className="text-small text-text-2">Your earlier plan could not be read, so ARC is starting fresh.</p>}
      {!edit && (
        <div className="flex justify-center gap-2 pt-6">
          <button type="button" className="min-h-touch px-3 text-link underline" onClick={() => { update(s => ({ ...s, mode: 'browse' })); go('explore'); }}>Just browse</button>
          <button type="button" className="min-h-touch px-3 text-link underline" onClick={() => go('sample')}>Try a sample day</button>
        </div>
      )}
    </Screen>
  );
}

function Topics({ state, edit, next, back }: Props) {
  const [adding, setAdding] = useState(false);
  const [own, setOwn] = useState('');
  const { topics, nearbyAdded } = state.plan;
  const anyOn = topics.some(t => t.on) || nearbyAdded.length > 0;
  const addOwn = () => { update(s => addOwnTopic(s, own)); setOwn(''); setAdding(false); };
  return (
    <Screen header={<Header back={back} right={<Count n={2} />} />} heading="Your topics"
      intro={<p className="text-body text-text-2">{response.totalMatches} talks match your sentence. Tap a topic to leave it out.</p>}
      action={{ label: edit ? 'Done' : 'Next', onClick: () => next('days'), disabled: !anyOn }}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Your topics">
        {topics.map(t => <Chip key={t.conceptId} selected={t.on} onSelect={() => update(s => toggleTopic(s, t.conceptId))}>{t.label}</Chip>)}
        {!adding && <Chip selected={false} onSelect={() => setAdding(true)} label="Add a topic">+ Add</Chip>}
      </div>
      {adding && (
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addOwn(); }}>
          <input autoFocus aria-label="Your own topic" value={own} onChange={e => setOwn(e.target.value)}
            className="min-h-touch flex-1 rounded-row border border-border-strong bg-bg px-3 text-body text-text" />
          <button type="submit" disabled={!own.trim()} className="min-h-touch rounded-button border border-border-strong px-4 text-small font-semibold disabled:opacity-40">Add</button>
        </form>
      )}
      {!anyOn && <p className="text-small text-text-2">Keep at least one topic so ARC has something to look for.</p>}
      {response.nearby.length > 0 && (
        <section aria-labelledby="nearby" className="flex flex-col gap-2 pt-2">
          <h2 id="nearby" className="text-small font-semibold">Close to yours</h2>
          <div className="flex flex-wrap gap-2">
            {response.nearby.map(n => {
              const on = nearbyAdded.some(a => a.conceptId === n.conceptId);
              return (
                <Chip key={n.conceptId} selected={on} onSelect={() => update(s => toggleNearby(s, n))}
                  label={`${on ? '' : 'Add '}${n.label}, ${n.matchCount} talks`}>
                  {on ? '' : '+ '}{n.label} <span className={on ? 'text-on-inverse-2' : 'text-text-3'}>· {n.matchCount} talks</span>
                </Chip>
              );
            })}
          </div>
        </section>
      )}
    </Screen>
  );
}

function Days({ state, edit, next, back }: Props) {
  return (
    <Screen header={<Header back={back} right={<Count n={3} />} />} heading="Which days are you at CHI?"
      action={{ label: edit ? 'Done' : 'Next', onClick: () => next('needs'), disabled: !state.plan.days.length }}>
      <fieldset className="flex flex-col gap-2" aria-labelledby="question">
        {current.days.map(d => (
          <ChoiceRow key={d} checked={state.plan.days.includes(d)} onChange={() => update(s => toggleDay(s, d))}
            label={`${dayLabel(d, { weekday: 'short' })} ${dayLabel(d, { day: 'numeric' })}`} />
        ))}
      </fieldset>
    </Screen>
  );
}

function Needs({ state, edit, next, back }: Props) {
  const { needs, language } = state.plan;
  return (
    <Screen header={<Header back={back} right={<Count n={4} />} />} heading="What would make CHI easier?"
      intro={<p className="text-body text-text-2">Pick any. You can change them later.</p>}
      action={{ label: edit ? 'Done' : 'Next', onClick: () => next('summary') }}>
      <fieldset className="flex flex-col gap-2" aria-labelledby="question">
        {(Object.keys(NEED_LABEL) as (keyof typeof NEED_LABEL)[]).map(k => (
          <ChoiceRow key={k} checked={needs[k]} onChange={() => update(s => toggleNeed(s, k))} label={NEED_LABEL[k]} />
        ))}
        <ChoiceRow checked={needs.summaries} onChange={() => update(s => toggleNeed(s, 'summaries'))} label={`Summaries in ${languageName(language)}`} />
      </fieldset>
    </Screen>
  );
}

function Summary({ state, back }: Props) {
  const p = state.plan;
  const on = [...p.topics.filter(t => t.on).map(t => t.label), ...p.nearbyAdded.map(n => n.label)];
  const topics = on.length > 2 ? `${on.slice(0, 2).join(' · ')} · +${on.length - 2}` : on.join(' · ');
  const idx = p.days.map(d => current.days.indexOf(d));
  const consecutive = idx.every((x, i) => i === 0 || x === idx[i - 1] + 1);
  const short = (d: string) => dayLabel(d, { weekday: 'short' });
  const days = p.days.length === 1 ? short(p.days[0]) : consecutive ? `${short(p.days[0])} – ${short(p.days.at(-1)!)}` : p.days.map(short).join(', ');
  const needs = Object.entries(p.needs).filter(([, v]) => v).map(([k]) => NEED_SHORT[k]).join(', ') || 'None';
  return (
    <Screen header={<Header back={back} />} heading="Your plan" action={{ label: 'Build my day', onClick: () => go('building'), disabled: !canBuild(state) }}>
      <ul>
        <SummaryRow label="Topics" value={topics} href="#/start/topics/edit" />
        <SummaryRow label="Days" value={days} href="#/start/days/edit" />
        <SummaryRow label="See" value={p.see.map(k => KIND_LABEL[k]).join(', ') || 'Nothing yet'} href="#/start/see" />
        <SummaryRow label="Language" value={languageName(p.language)} href="#/start/language" />
        <SummaryRow label="Needs" value={needs} href="#/start/needs/edit" />
        <SummaryRow label="How full" value={FULL_LABEL[p.howFull]} href="#/start/howfull" />
      </ul>
    </Screen>
  );
}

function EditSee({ state, back }: Props) {
  return (
    <Screen header={<Header back={back} title="What to see" />} action={{ label: 'Done', onClick: () => go('start/summary'), disabled: !state.plan.see.length }}>
      <fieldset className="flex flex-col gap-2" aria-label="What to see">
        {Object.keys(KINDS).map(k => (
          <ChoiceRow key={k} checked={state.plan.see.includes(k)} onChange={() => update(s => toggleKind(s, k))} label={KIND_LABEL[k]}
            hint={REGISTRATION_NEEDED.includes(k) ? 'Registration needed' : undefined} />
        ))}
      </fieldset>
    </Screen>
  );
}

function EditLanguage({ state, back }: Props) {
  const device = (navigator.language || 'en').split('-')[0];
  const order = [...LANGUAGES].sort((a, b) => Number(b.code === device) - Number(a.code === device) || Number(b.code === 'en') - Number(a.code === 'en') || a.name.localeCompare(b.name));
  return (
    <Screen header={<Header back={back} title="Language" />} intro={<p className="text-body text-text-2">For summaries and the question helper.</p>}
      action={{ label: 'Done', onClick: () => go('start/summary') }}>
      <fieldset className="flex flex-col gap-2" aria-label="Language">
        {order.map(l => <ChoiceRow key={l.code} type="radio" name="language" checked={state.plan.language === l.code} onChange={() => update(s => setLanguage(s, l.code))} label={l.name} />)}
      </fieldset>
    </Screen>
  );
}

function EditHowFull({ state, back }: Props) {
  return (
    <Screen header={<Header back={back} title="How full" />} action={{ label: 'Done', onClick: () => go('start/summary') }}>
      <fieldset className="flex flex-col gap-2" aria-label="How full">
        {Object.entries(HOW_FULL).map(([k, n]) => (
          <ChoiceRow key={k} type="radio" name="howfull" checked={state.plan.howFull === k} onChange={() => update(s => setHowFull(s, k))} label={FULL_LABEL[k]} hint={`About ${n} stops a day`} />
        ))}
      </fieldset>
    </Screen>
  );
}
