# V4 latency without a microphone: stream a 16 kHz mono WAV to Soniox at real-time pace and time the replies.
# Usage: say -v Samantha -o talk.aiff "…" && afconvert -f WAVE -d LEI16@16000 -c 1 talk.aiff talk.wav
#        python3 tests/captions/latency.py .env.local talk.wav   (pip install websockets)
# Delay = wall time since the first chunk − end of the newest word in the audio (end_ms), as on the bench page.
import asyncio, json, sys, time, wave, statistics, websockets
key = [l.split('=',1)[1].strip() for l in open(sys.argv[1]) if l.startswith('SONIOX_API_KEY=')][0]
async def run(translate):
    async with websockets.connect('wss://stt-rt.soniox.com/transcribe-websocket', subprotocols=['soniox-api-key', key]) as ws:
        cfg = {'model':'stt-rt-v5','audio_format':'pcm_s16le','sample_rate':16000,'num_channels':1,'language_hints':['en'],'enable_endpoint_detection':True}
        if translate: cfg['translation'] = {'type':'one_way','target_language':'ko'}
        await ws.send(json.dumps(cfg))
        w = wave.open(sys.argv[2]); data = w.readframes(w.getnframes())
        t0 = time.monotonic()
        async def send():
            for i in range(0, len(data), 3840):  # 120 ms of audio per chunk, at real-time pace
                await ws.send(data[i:i+3840]); await asyncio.sleep(max(0, t0 + (i // 3840 + 1) * 0.12 - time.monotonic()))
            await ws.send('')
        asyncio.create_task(send())
        live, final, tr = [], [], []
        last_orig_end = None
        async for m in ws:
            now = (time.monotonic() - t0) * 1000
            r = json.loads(m)
            if r.get('error_code'): print(r); return
            spoken = [t for t in r.get('tokens', []) if t.get('end_ms') is not None and not t['text'].startswith('<')]
            nf = [t for t in spoken if not t['is_final']]; f = [t for t in spoken if t['is_final']]
            if nf: live.append(now - nf[-1]['end_ms'])
            if f: final.append(now - f[-1]['end_ms']); last_orig_end = f[-1]['end_ms']
            if any(t.get('translation_status') == 'translation' and t['is_final'] for t in r.get('tokens', [])) and last_orig_end is not None:
                tr.append(now - last_orig_end)
            if r.get('finished'): break
        q = lambda xs, p: sorted(xs)[min(len(xs)-1, int(p*len(xs)))] if xs else None
        fmt = lambda xs: f"median {q(xs,.5)/1000:.2f}s p90 {q(xs,.9)/1000:.2f}s (n={len(xs)})" if xs else '-'
        print('translate' if translate else 'captions only', '| first text', fmt(live), '| confirmed', fmt(final), '| translation (after confirmed source)', fmt(tr))
async def main():
    for translate in (False, True):
        for _ in range(1): await run(translate)
asyncio.run(main())
