// "Hear the turns": each turn of the route as a short tone that comes from its direction (Web Audio, HRTF panning).
// Starts only from a button press (browsers require it), plays once, then closes the audio. Nothing is recorded or kept.
// cues: directions().cues — { kind: 'walk' | 'elevator' | 'escalator' | 'arrive', angle (radians, + right), up?, text }.

const GAP_S = 1.5; // between cues

/** Plays the cues; onCue(i) as each starts (-1 at the end). → stop(), or null without Web Audio.
 * @param {{ kind: string, angle: number, up?: boolean, text: string }[]} cues @param {(i: number) => void} [onCue] @returns {(() => void) | null} */
export function playCues(cues, onCue = () => {}) {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* iPhone: sound even with the silent switch on, where allowed */ }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  ctx.resume?.();
  const tone = (t0, f0, f1, dur, angle) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1;
    const x = Math.sin(angle) * 1.5, z = -Math.cos(angle) * 1.5; // ahead is -z for the listener
    if (p.positionX) { p.positionX.value = x; p.positionY.value = 0; p.positionZ.value = z; } else p.setPosition(x, 0, z);
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(p); p.connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  };
  const play = c => {
    const t = ctx.currentTime + 0.05;
    if (c.kind === 'walk') { tone(t, 880, 880, 0.22, c.angle); tone(t + 0.26, 880, 880, 0.22, c.angle); }
    else if (c.kind === 'arrive') { tone(t, 660, 660, 0.3, c.angle); tone(t + 0.3, 990, 990, 0.45, c.angle); }
    else tone(t, c.up ? 520 : 1040, c.up ? 1040 : 520, 0.6, 0); // a ride: a rising or falling sweep, straight ahead
  };
  let i = 0, timer = 0, stopped = false;
  const next = () => {
    if (stopped) return;
    if (i >= cues.length) { stop(); return; }
    onCue(i); play(cues[i]); i++;
    timer = setTimeout(next, GAP_S * 1000);
  };
  function stop() {
    if (stopped) return;
    stopped = true; clearTimeout(timer); onCue(-1);
    setTimeout(() => ctx.close?.(), 700); // let the last tone finish
  }
  next();
  return stop;
}
