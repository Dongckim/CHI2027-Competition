// 14g · Talk face to face (prototype 3; user 11/26 「통역 부분도 다 진행해줘」). The phone lies flat between two people; the
// top half faces the other person. Each reads the other in their own language (Soniox two-way translation, the V4 bench
// tests/legacy/captions/conversation.html in the app). Interpretation only: nothing is saved, text lives in memory and is
// wiped when the session stops or the screen closes. The key comes from /api/soniox-key (a one-minute temporary key).
import { useEffect, useRef, useState } from 'react';
import { createConversation } from '../../captions/captions.js';
import { LANGUAGES, useDevice } from '../../state/useDevice';
import { go } from '../../router';
import { Screen } from '../../components/arc';

const native = (code: string) => { try { return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code; } catch { return code; } };
const SORTED = [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name));
type Run = { ws: WebSocket; stream: MediaStream; recorder?: MediaRecorder; wake?: WakeLockSentinel | null; conv: ReturnType<typeof createConversation> };

export function Interpret({ paperKey, who }: { paperKey: string; who?: string | null }) {
  const mine: string = useDevice().plan.language || 'en';
  const [theirs, setTheirs] = useState(mine === 'en' ? 'ko' : 'en');
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
  const toggle = () => (state === 'idle' ? start() : stop());
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
          <label className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold">
            <span>{mine.toUpperCase()} ⇄</span>
            <select value={theirs} onChange={e => { stop(); setTheirs(e.target.value); }} aria-label="Their language" className="min-h-11 min-w-0 flex-1 appearance-none rounded-full bg-transparent text-[14px] font-semibold text-arc-text underline decoration-arc-text/30 underline-offset-4">
              {SORTED.filter(l => l.code !== mine).map(l => <option key={l.code} value={l.code}>{native(l.code)} · {l.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={close} aria-label="Close" className="flex size-11 items-center justify-center rounded-full border border-arc-line text-[18px]">×</button>
        </div>
        {half(view.me, `${who ? `${who} · ` : ''}from ${native(theirs)}`, mine)}
        <p className="mt-3 px-6 text-center text-[12px] text-arc-text-3">{note || 'Put the phone flat between you. The top half faces them. Nothing is saved.'}</p>
        <button type="button" onClick={toggle} disabled={state === 'starting'} className="mx-6 mt-3 mb-2 min-h-[52px] rounded-full bg-arc-primary text-[15px] font-semibold text-arc-on-primary">{talk(mine)}</button>
      </div>
    </Screen>
  );
}
