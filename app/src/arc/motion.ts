// Motion from the final prototype (ARC_prototype, 11/23): screen entrances, the map's bloom, count-ups. Web Animations
// only, nothing kept in state. Off under prefers-reduced-motion (and so in the headless checks, which ask for it); endless
// loops also stop while the page is hidden.
export const EASE = 'cubic-bezier(.2,.8,.2,1)';
export const OUT = 'cubic-bezier(.22,1,.36,1)';
export const POP = 'cubic-bezier(.34,1.5,.64,1)';
export const GENTLE = 'cubic-bezier(.34,1.25,.64,1)';
export const SOFT = 'cubic-bezier(.33,1,.68,1)';

export const still = () => typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One animation that holds its first frame until it starts (fill backwards), none when motion is off. */
export function play(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions = {}) {
  if (!el || still() || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, { fill: 'backwards', easing: EASE, ...opts });
}

const loops = new Set<Animation>();
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => loops.forEach(a => (document.hidden ? a.pause() : a.play())));
/** An endless animation: paused while the page is hidden, gone with its element. */
export function loop(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions) {
  const a = play(el, frames, { iterations: Infinity, fill: 'none', ...opts });
  if (!a) return null;
  loops.add(a);
  a.addEventListener('cancel', () => loops.delete(a));
  return a;
}

/** A number that counts up to its value (prototype: 700 ms, ease-out cubic), e.g. "12" or "2,614". */
export function countUp(el: Element | null | undefined, delay = 0) {
  if (!el || still()) return;
  const raw = el.textContent ?? '', m = raw.match(/^(~?)([\d,]+)(\+?)$/);
  if (!m) return;
  const n = Number(m[2].replace(/,/g, '')), comma = m[2].includes(',');
  if (!n) return;
  const fmt = (v: number) => m[1] + (comma ? v.toLocaleString('en-US') : String(v)) + m[3];
  const t0 = performance.now() + delay;
  el.textContent = fmt(0);
  const step = (now: number) => {
    if (!el.isConnected) return;
    const p = Math.min(1, Math.max(0, (now - t0) / 700));
    el.textContent = fmt(Math.round(n * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step); else el.textContent = raw;
  };
  requestAnimationFrame(step);
}

const born: Keyframe[] = [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.75 }, { opacity: 1, transform: 'scale(1)' }];
const ANIM: Record<string, [Keyframe[], number, string]> = {
  pop: [[{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], 620, 'ease-out'],
  grow: [born, 900, 'ease-out'],
  node: [[{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }], 620, 'cubic-bezier(.3,.7,.4,1)'],
  ring: [[{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)' }], 800, EASE],
  holo: [[{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }], 1000, OUT],
  fade: [[{ opacity: 0 }, { opacity: 1 }], 420, 'ease-out'],
  rise: [[{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], 480, EASE],
  cell: [[{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 320, EASE],
  lit: [[{ opacity: 0.08 }, { opacity: 1 }], 260, EASE],
  reveal: [[{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], 1050, 'cubic-bezier(.4,0,.2,1)'],
  qr: [[{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], 700, POP],
  morb: [[{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)' }], 700, GENTLE],
  mregion: [[{ opacity: 0, transform: 'scale(.75)' }, { opacity: 1, transform: 'scale(1)' }], 900, OUT],
  mdot: [[{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], 620, GENTLE],
};

/**
 * A screen's entrance (prototype choreo): its parts rise 12 px and fade in, top to bottom, 32–70 ms apart; a sheet-like
 * block at the bottom slides up 70 px. Parts marked data-motion="own" animate themselves (the map), "none" never.
 */
export function enter(parts: Element[], t0 = 80) {
  if (still()) return;
  // the map blooms by itself
  const list = parts.filter(p => !(p as HTMLElement).dataset?.motion && !p.matches('[data-arc-map]') && !p.querySelector('[data-arc-map]'))
    .map(p => ({ p, r: p.getBoundingClientRect() })).filter(x => x.r.height > 0);
  list.sort((a, b) => Math.round(a.r.top / 20) - Math.round(b.r.top / 20) || a.r.left - b.r.left);
  const step = Math.max(32, Math.min(70, 700 / Math.max(1, list.length)));
  // pictures that move on their own: data-anim="<kind> <delay ms>" (03 grid and path, 05 bubbles, 06 map, 11 shape, 17 QR,
  // 20's mini Arcs). What arrives a moment later (data read from the phone) gets its entrance too, for two seconds.
  const own = (el: Element) => {
    const [kind, d] = ((el as HTMLElement).dataset.anim ?? '').split(' '), k = ANIM[kind];
    if (k) play(el, k[0], { duration: k[1], delay: Number(d) || 0, easing: k[2] });
  };
  for (const root of new Set(parts.map(p => p.closest('.arc') ?? p))) {
    root.querySelectorAll('[data-anim]').forEach(own);
    const main = root.querySelector(':scope > main'), t = performance.now();
    if (!main || typeof MutationObserver !== 'function') continue;
    const mo = new MutationObserver(ms => {
      if (performance.now() - t > 2000) { mo.disconnect(); return; }
      for (const m of ms) for (const n of m.addedNodes) if (n instanceof Element) {
        if (n.matches('[data-anim]')) own(n);
        n.querySelectorAll('[data-anim]').forEach(own);
        if (n.parentElement === main && !n.matches('[data-arc-map]') && !n.querySelector('[data-arc-map]')) play(n, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 540 });
      }
    });
    mo.observe(main, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 2100);
  }
  list.forEach(({ p }, i) => {
    play(p, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 540, delay: t0 + i * step });
    p.querySelectorAll('[data-count]').forEach(c => countUp(c, t0 + i * step + 120));
  });
}

/**
 * The map's bloom (prototype bloom()): the question orb is born, its ring opens, then region by region — the one with the
 * most important talk first (next, then upcoming by time, heard, ended) — the region's field spreads, its line reaches
 * out just before each talk pops in, and its count rises. Then the ring breathes and the next talk's ring pulses.
 * quick: the same at about a third of the time (12b, 12c, back from 24b).
 */
export function bloom(root: HTMLElement | null, quick = false) {
  if (!root || still()) return;
  const k = quick ? 0.35 : 1, t0 = 80, Q = (s: string) => root.querySelector<HTMLElement>(s), QA = (s: string) => [...root.querySelectorAll<HTMLElement>(s)];
  play(Q('.arc-orb'), [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.035)', offset: 0.72 }, { opacity: 1, transform: 'scale(1)' }], { duration: 900 * k, delay: t0, easing: 'cubic-bezier(.25,.8,.3,1)' });
  const holo = Q('.arc-holo');
  play(holo, [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1000 * k, delay: t0 + 120 * k, easing: OUT });
  play(Q('[data-orb-text]'), [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 560 * k, delay: t0 + 340 * k, easing: OUT });
  const W0 = t0 + 360 * k, GAP = 125 * k;
  const secs = (['S', 'T', 'R'] as const).map((a, si) => {
    const nodes = QA(`[data-node-wrap][data-angle="${a}"]`).sort((p, q) => Number(p.dataset.score) - Number(q.dataset.score));
    return { a, si, nodes, badge: Q(`[data-badge="${a}"]`), score: nodes.length ? Number(nodes[0].dataset.score) : 9, S: 0, end: 0 };
  }).filter(x => x.nodes.length || x.badge).sort((p, q) => p.score - q.score || p.si - q.si);
  let S = W0, last = W0;
  const at = new Map<HTMLElement, number>();
  for (const x of secs) {
    x.S = S;
    let t = S + 270 * k;
    for (const n of x.nodes) { at.set(n, t); last = Math.max(last, t); t += GAP; }
    const bt = x.nodes.length ? t - GAP + 150 * k : S + 270 * k;
    if (x.badge) {
      play(x.badge, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.05)', offset: 0.65 }, { opacity: 1, transform: 'scale(1)' }], { duration: 560 * k, delay: bt, easing: 'ease-out' });
      if (!quick) countUp(x.badge.querySelector('[data-count]'), bt + 60);
      last = Math.max(last, bt);
    }
    x.end = x.badge ? bt : t - GAP;
    // the region's own field spreads from the centre as its turn comes
    play(Q(`[data-region="${x.a}"]`), [{ opacity: 0 }, { opacity: 1 }], { duration: 420 * k, delay: S, easing: 'ease-out' });
    S = x.end + 140 * k;
  }
  // a region with nothing in it still appears, with the last
  for (const r of QA('[data-region]')) if (!secs.some(x => x.a === r.dataset.region)) play(r, [{ opacity: 0 }, { opacity: 1 }], { duration: 420 * k, delay: S, easing: 'ease-out' });
  for (const [n, t] of at) {
    play(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 * k, delay: t, easing: 'ease-out' });
    play(n.querySelector('.arc-node'), [{ transform: 'scale(.3)' }, { transform: 'scale(1.08)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 620 * k, delay: t, easing: 'cubic-bezier(.3,.7,.4,1)' });
    [...n.querySelectorAll('[data-node-text]')].forEach((tx, m) => play(tx, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 480 * k, delay: t + (140 + m * 70) * k, easing: OUT }));
    play(Q(`[data-line="${CSS.escape(n.dataset.key ?? '')}"]`), [{ opacity: 0 }, { opacity: 1 }], { duration: 300 * k, delay: Math.max(W0, t - 230 * k), easing: SOFT });
  }
  const end = last + 600 * k + 200;
  loop(holo, [{ opacity: 1 }, { opacity: 0.72 }, { opacity: 1 }], { duration: 5600, delay: end, easing: 'ease-in-out' });
  for (const n of QA('.arc-node-next')) loop(n, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.6)', offset: 0.72 }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 2600, delay: end, easing: 'ease-out', pseudoElement: '::before' });
  if (root.dataset.pending) {
    QA('[data-region]').forEach((r, i) => loop(r, [{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 2700, delay: end + i * 450, easing: 'ease-in-out' }));
    QA('[data-node-wrap] .arc-node').forEach((n, j) => loop(n, [{ transform: 'translateY(0px)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0px)' }], { duration: 3400, delay: end + j * 280, easing: 'ease-in-out' }));
  }
  loop(Q('[data-empty-slot]'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 24000, delay: end, easing: 'linear' });
  // 24 / 24c: the chevrons that point where more talks wait drift that way and back
  for (const c of QA('[data-more]')) {
    const d = c.dataset.more === 'S' ? 'translate(0px,-3px)' : c.dataset.more === 'R' ? 'translate(-2.5px,2.5px)' : 'translate(2.5px,2.5px)';
    loop(c, [{ opacity: 0.2, translate: '0px 0px' }, { opacity: 1, translate: d.slice(10, -1).replace(',', ' ') }], { duration: 1100, delay: end, direction: 'alternate', easing: 'ease-in-out' });
  }
}

/** 24b (prototype): the camera moves toward the angle — everything slides into place from the old centre — then the talks not on the Arc
 *  pop in, nearest first, and the other angles' counts fade in. */
export function moveToward(root: HTMLElement | null) {
  if (!root || still()) return;
  const QA = (s: string) => [...root.querySelectorAll<HTMLElement>(s)];
  const [dx, dy] = (root.dataset.shift ?? '0,0').split(',').map(Number); // where the question went: everything comes from there
  QA('[data-node-wrap]:not([data-candidate])').forEach(n => play(n, [{ transform: `translate(${-dx}px, ${-dy}px)` }, { transform: 'translate(0px, 0px)' }], { duration: 900, delay: 60, easing: OUT }));
  QA('[data-node-wrap][data-candidate]').forEach((n, i) => play(n, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 520, delay: 900 + i * 95, easing: GENTLE }));
  const tEnd = 900 + 9 * 95 + 300;
  QA('[data-badge], [data-more]').forEach(b => play(b, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: tEnd, easing: 'ease-out' }));
}

/** 12a (prototype): after the bloom, the hold ring appears and fills, empties, fills (2.4 s), the stop under it sinks while
 *  it fills, and the bubble slides in from the left. */
export function hintMotion(root: HTMLElement | null) {
  if (!root || still()) return;
  const T = 2500, ring = root.querySelector('[data-hint-ring]'), prog = root.querySelector('[data-hint-progress]'), bub = root.querySelector('[data-hint-bubble]');
  play(ring, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 520, delay: T, easing: OUT });
  loop(prog, [{ strokeDashoffset: 215.2, offset: 0 }, { strokeDashoffset: 215.2, offset: 0.12 }, { strokeDashoffset: 0, offset: 0.62 }, { strokeDashoffset: 0, offset: 0.8 }, { strokeDashoffset: 215.2, offset: 0.81 }, { strokeDashoffset: 215.2, offset: 1 }], { duration: 2400, delay: T, easing: 'ease-in-out', fill: 'backwards' });
  play(bub, [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: T + 260, easing: OUT });
}

/** 12c (prototype): the picked stop's ring springs out. */
export function pickMotion(root: HTMLElement | null, key: string) {
  const n = root?.querySelector(`[data-node-wrap][data-key="${CSS.escape(key)}"] .arc-node`);
  play(n, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }], { duration: 520, delay: 60, easing: 'ease-out', pseudoElement: '::after' });
}
