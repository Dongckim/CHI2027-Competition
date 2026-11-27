// 14g · Talk face to face (prototype 3; user 11/26 「통역 부분도 다 진행해줘」). The phone lies flat between two people; the
// top half faces the other person. Each reads the other in their own language (Soniox two-way translation, the V4 bench
// tests/legacy/captions/conversation.html in the app). Interpretation only: nothing is saved, text lives in memory and is
// wiped when the session stops or the screen closes. The key comes from /api/soniox-key (a one-minute temporary key).
import { useEffect, useRef, useState } from 'react';
import { createConversation } from '../../captions/captions.js';
import { LANGUAGES, useDevice } from '../../state/useDevice';
import { go } from '../../router';
import { Screen, Sheet, ArcButton } from '../../components/arc';

const native = (code: string) => { try { return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code; } catch { return code; } };
const SORTED = [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name));
// the languages most people at CHI speak, as big buttons first; every other one is in the list under them
const COMMON = ['en', 'ko', 'ja', 'zh', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'hi', 'ar'].filter(c => LANGUAGES.some(l => l.code === c));
const OK_KEY = 'arc.interpretOk'; // the consent below was given on this phone (only that, no voice or text)
const agreed = () => { try { return localStorage.getItem(OK_KEY) === '1'; } catch { return false; } };

/** Figma 14g's "KO ⇄ 日本語 ▾": a sheet with the common languages as buttons, then all of them */
function LanguageSheet({ open, title, value, exclude, onPick, onClose }: { open: boolean; title: string; value: string; exclude: string; onPick: (c: string) => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {COMMON.filter(c => c !== exclude).map(c => (
          <button key={c} type="button" onClick={() => onPick(c)} aria-pressed={c === value}
            className={`min-h-[52px] rounded-2xl border px-2 text-[15px] font-semibold ${c === value ? 'border-transparent bg-arc-chip-on text-arc-on-primary' : 'border-arc-line bg-arc-surface'}`}>{native(c)}</button>
        ))}
      </div>
      <label className="mt-4 flex flex-col gap-1.5 text-[13px] font-medium text-arc-text-3">All languages
        <select value={value} onChange={e => onPick(e.target.value)} className="min-h-11 rounded-xl border border-arc-line bg-arc-surface px-3 text-[16px] text-arc-text">
          {SORTED.filter(l => l.code !== exclude).map(l => <option key={l.code} value={l.code}>{native(l.code)} · {l.name}</option>)}
        </select>
      </label>
    </Sheet>
  );
}
type Run = { ws: WebSocket; stream: MediaStream; recorder?: MediaRecorder; wake?: WakeLockSentinel | null; conv: ReturnType<typeof createConversation> };

export function Interpret({ paperKey, who }: { paperKey: string; who?: string | null }) {
  const [mine, setMine] = useState<string>(useDevice().plan.language || 'en');
  const [theirs, setTheirs] = useState(mine === 'en' ? 'ko' : 'en');
  const [picking, setPicking] = useState<'mine' | 'theirs' | null>(null);
  const [asking, setAsking] = useState(false); // the consent before the first start on this phone
  const [view, setView] = useState({ me: { theirs: [] as string[], mine: [] as string[] }, them: { theirs: [] as string[], mine: [] as string[] } });
  const [state, setState] = useState<'idle' | 'starting' | 'on'>('idle');
  const [note, setNote] = useState('');
  const run = useRef<Run | null>(null);

  const stop = () => {
    const r = run.current; run.current = null; // the conversation goes with it
    if (r) {
      if (r.recorder?.state === 'recording') r.recorder.stop();
      r.stream.getTracks().forEach(t => t.stop());
      if (r.ws.readyState === WebSocket.OPEN) r.ws.send('');
      r.wake?.release().catch(() => {});
    }
    setState('idle');
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (mine === theirs) { setNote('Pick two different languages.'); return; }
    setState('starting'); setNote('');
    try {
      const res = await fetch('/api/soniox-key', { method: 'POST' });
      const key = await res.json();
      if (!res.ok) throw new Error(key.error || `key ${res.status}`);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const conv = createConversation(mine, theirs);
      const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket', ['soniox-api-key', key.apiKey]);
      const r: Run = { ws, stream, conv, wake: await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } }).wakeLock?.request('screen').catch(() => null) };
      run.current = r;
      ws.onopen = () => {
        ws.send(JSON.stringify({ model: 'stt-rt-v5', audio_format: 'auto', language_hints: [mine, theirs], enable_language_identification: true,
          enable_endpoint_detection: true, translation: { type: 'two_way', language_a: mine, language_b: theirs } }));
        r.recorder = new MediaRecorder(stream);
        r.recorder.ondataavailable = e => { if (e.data.size && ws.readyState === WebSocket.OPEN) ws.send(e.data); };
        r.recorder.start(120);
        setState('on');
      };
      ws.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.error_code != null) { setNote(`Interpreting stopped (${msg.error_message ?? msg.error_code}).`); stop(); return; }
        if (run.current !== r) return;
        r.conv.update(msg);
        setView({ me: r.conv.view(mine), them: r.conv.view(theirs) });
        if (msg.finished) stop();
      };
      ws.onclose = () => { if (run.current === r) { setNote('The connection closed. Tap to talk again.'); stop(); } };
    } catch (err) {
      setNote(/denied|NotAllowed/i.test(String(err)) ? 'ARC needs the microphone to interpret.' : `Could not start: ${String((err as Error).message ?? err)}`);
      stop();
    }
  };
  const toggle = () => (state !== 'idle' ? stop() : agreed() ? start() : setAsking(true));
  const agree = () => { try { localStorage.setItem(OK_KEY, '1'); } catch { /* asked again next time */ } setAsking(false); start(); };
  const talk = (code: string) => (state === 'on' ? `Listening · tap to stop` : state === 'starting' ? 'Starting…' : `Tap to talk · ${native(code)}`);
  const half = (v: { theirs: string[]; mine: string[] }, from: string, lang: string) => (
    <div lang={lang} className="flex min-h-0 flex-1 flex-col justify-end gap-2 px-6">
      <p className="text-[12px] font-medium text-arc-text-3">{from}</p>
      <p aria-live="polite" className="line-clamp-4 text-[22px] leading-[30px] font-semibold tracking-[-0.012em] [word-break:keep-all]">{v.theirs.join('\n') || ' '}</p>
      <p className="line-clamp-2 text-[13px] leading-[18px] text-arc-text-3">{v.mine.join(' ')}</p>
    </div>
  );
  const close = () => { stop(); go(`talk/${paperKey}`, { replace: true }); };

  return (
    <Screen label="Talk face to face" header={<span />}>
      <div className="-mx-6 -mt-2 flex min-h-[calc(100dvh-120px)] flex-col">
        {/* the top half faces the other person */}
        <div className="flex min-h-0 flex-1 rotate-180 flex-col">
          {half(view.them, `${native(mine)} → ${native(theirs)}`, theirs)}
          <button type="button" onClick={toggle} disabled={state === 'starting'} className="mx-6 mt-4 min-h-[52px] rounded-full border border-arc-line bg-arc-surface text-[15px] font-semibold">{talk(theirs)}</button>
        </div>
        <div className="my-3 flex items-center gap-3 border-y border-arc-line bg-arc-surface px-6 py-2">
          {/* Figma 14g: "KO ⇄ 日本語 ▾", each side opens the language sheet */}
          <div className="flex min-w-0 flex-1 items-center gap-1 text-[14px] font-semibold">
            <button type="button" onClick={() => setPicking('mine')} aria-label={`Your language: ${native(mine)}`} className="min-h-11 rounded-full px-2">{mine.toUpperCase()}</button>
            <span aria-hidden="true">⇄</span>
            <button type="button" onClick={() => setPicking('theirs')} aria-label={`Their language: ${native(theirs)}`} className="flex min-h-11 min-w-0 items-center gap-1 rounded-full border border-arc-line px-3">
              <span className="truncate">{native(theirs)}</span><span aria-hidden="true" className="text-[11px]">▾</span>
            </button>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="flex size-11 items-center justify-center rounded-full border border-arc-line text-[18px]">×</button>
        </div>
        {half(view.me, `${who ? `${who} · ` : ''}from ${native(theirs)}`, mine)}
        <p className="mt-3 px-6 text-center text-[12px] text-arc-text-3">{note || 'Put the phone flat between you. The top half faces them. Your voice goes to Soniox to be interpreted; nothing is saved.'}</p>
        <button type="button" onClick={toggle} disabled={state === 'starting'} className="mx-6 mt-3 mb-2 min-h-[52px] rounded-full bg-arc-primary text-[15px] font-semibold text-arc-on-primary">{talk(mine)}</button>
      </div>
      <LanguageSheet open={picking != null} title={picking === 'mine' ? 'Your language' : 'Their language'} value={picking === 'mine' ? mine : theirs}
        exclude={picking === 'mine' ? theirs : mine} onClose={() => setPicking(null)}
        onPick={c => { stop(); if (picking === 'mine') setMine(c); else setTheirs(c); setPicking(null); }} />
      {/* user 11/27: before the microphone, say where the voice goes */}
      <Sheet open={asking} onClose={() => setAsking(false)} title="Before you start">
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[21px] text-arc-text-2">
          <li>Your voice goes to Soniox, an interpreting service, to be translated as you speak.</li>
          <li>Neither ARC nor Soniox saves it: no recording, no transcript. The words on screen are wiped when you stop.</li>
          <li>Everything else in ARC stays on your phone. Interpreting is the one thing that leaves it, only while it runs.</li>
        </ul>
        <ArcButton className="mt-5" onClick={agree}>Start interpreting</ArcButton>
        <ArcButton kind="ghost" className="mt-2" onClick={() => setAsking(false)}>Not now</ArcButton>
      </Sheet>
    </Screen>
  );
}
