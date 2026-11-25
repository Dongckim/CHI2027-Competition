// 01's picture and its motion (final prototype 11/23): the ARC orb is born, its glow spreads, the outer line draws itself
// round with a bright head, and each neighbourhood lands as the head passes it (a glow and a ripple in its colour). Then
// the neighbourhoods drift slowly clockwise and the question visits them one at a time: a thin arc of light from the orb,
// the shape bounces, the orb takes its colour for a moment. Still under reduced motion; loops pause in a hidden tab.
import { useEffect, useRef, type CSSProperties } from 'react';
import { play, loop, still, OUT } from '../../arc/motion';
import innerOrb from '../../assets/arc/welcome-inner-orb.svg';

const CX = 195, CY = 290, R = 149.5, C = 2 * Math.PI * R, DRAW = 1750, START = 480;
const at = (x: number, y: number, w: number): CSSProperties => ({ position: 'absolute', left: x, top: y, width: w, height: w });
export type Shape = { src: string; x: number; y: number; inset: string; color: string };

export function WelcomeOrbit({ shapes }: { shapes: Shape[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || still()) return;
    const Q = (s: string) => root.querySelector<HTMLElement>(s);
    const orb = Q('[data-w-orb]'), glow = Q('[data-w-glow]'), base = root.querySelector<SVGCircleElement>('[data-w-line]'), head = root.querySelector<SVGGElement>('[data-w-head]'), tint = Q('[data-w-tint]');
    const icons = [...root.querySelectorAll<HTMLElement>('[data-w-shape]')].map(el => {
      const x = Number(el.dataset.cx), y = Number(el.dataset.cy);
      return { el, x, y, col: el.dataset.color!, a: (Math.atan2(y - CY, x - CX) * 180 / Math.PI + 90 + 360) % 360, on: false };
    });
    play(orb, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], { duration: 950, delay: 60, easing: 'cubic-bezier(.25,.8,.3,1)' });
    play(Q('[data-w-arc]'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 420, easing: OUT });
    play(glow, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1300, delay: 280, easing: OUT });
    icons.forEach(ic => { ic.el.style.opacity = '0'; });
    const land = (ic: typeof icons[number], big = false) => {
      const g = document.createElement('span'), r = document.createElement('span');
      Object.assign(g.style, { position: 'absolute', left: '-5px', top: '-5px', width: '32px', height: '32px', borderRadius: '50%', pointerEvents: 'none', background: `radial-gradient(circle, ${ic.col}d9 0, ${ic.col}59 45%, transparent 70%)` });
      Object.assign(r.style, { position: 'absolute', left: '-2px', top: '-2px', width: '26px', height: '26px', borderRadius: '50%', pointerEvents: 'none', border: `1.4px solid ${ic.col}` });
      ic.el.append(g, r);
      g.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: `scale(${big ? 1.5 : 1.25})`, offset: big ? 0.3 : 0.25 }, { opacity: 0, transform: `scale(${big ? 2.8 : 2.1})` }], { duration: big ? 1000 : 760, easing: 'ease-out' }).onfinish = () => g.remove();
      r.animate([{ opacity: 0.95, transform: 'scale(1)' }, { opacity: 0, transform: `scale(${big ? 3.2 : 2.7})` }], { duration: big ? 1100 : 900, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => r.remove();
      orb?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.1)' }, { filter: 'brightness(1)' }], { duration: 620, delay: 140, easing: 'ease-in-out' }); // the orb answers each landing
    };
    let raf = 0, timer = 0, alive = true;
    const t0 = performance.now() + START;
    if (base) base.style.strokeDashoffset = String(C);
    const draw = (now: number) => {
      if (!alive) return;
      const p = Math.max(0, Math.min(1, (now - t0) / DRAW)), e = -(Math.cos(Math.PI * p) - 1) / 2, deg = 360 * e;
      if (base) base.style.strokeDashoffset = (C * (1 - e)).toFixed(2);
      if (head) { head.setAttribute('transform', `rotate(${deg.toFixed(2)} ${CX} ${CY})`); head.style.opacity = (now < t0 ? 0 : Math.min(1, p / 0.06, (1 - p) / 0.12)).toFixed(3); }
      for (const ic of icons) if (!ic.on && now >= t0 && deg >= ic.a - 3) {
        ic.on = true; ic.el.style.opacity = '';
        ic.el.firstElementChild?.animate([{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1.3)', offset: 0.55 }, { opacity: 1, transform: 'scale(1)' }], { duration: 620, easing: 'ease-out' });
        land(ic);
      }
      if (p < 1) raf = requestAnimationFrame(draw);
      else { icons.forEach(ic => { ic.el.style.opacity = ''; }); if (head) head.style.opacity = '0'; timer = window.setTimeout(orbit, 500); }
    };
    // afterwards: 3° a second clockwise, easing in; the question visits each neighbourhood in turn
    let th = 0;
    const orbit = () => {
      const ts = performance.now();
      const drift = (now: number) => {
        if (!alive) return;
        const t = (now - ts) / 1000; th = 3 * (t - 2.2 * (1 - Math.exp(-t / 2.2)));
        for (const ic of icons) {
          const rad = (ic.a + th - 90) * Math.PI / 180;
          ic.el.style.translate = `${(CX + R * Math.cos(rad) - ic.x).toFixed(2)}px ${(CY + R * Math.sin(rad) - ic.y).toFixed(2)}px`;
        }
        raf = requestAnimationFrame(drift);
      };
      raf = requestAnimationFrame(drift);
      breath.push(loop(orb, [{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }, { transform: 'scale(1)' }], { duration: 5200, easing: 'ease-in-out' }));
      const order = icons.slice().sort((p, q) => p.a - q.a);
      let i = 0;
      const tick = () => { if (!alive) return; if (!document.hidden) visit(order[i % order.length]); i++; timer = window.setTimeout(tick, i % order.length === 0 ? 2400 : 1050); };
      timer = window.setTimeout(tick, 700);
    };
    const svg = root.querySelector<SVGSVGElement>('[data-w-fx]');
    const visit = (ic: typeof icons[number]) => {
      if (!svg) return;
      const rad = (ic.a + th - 90) * Math.PI / 180, ix = CX + R * Math.cos(rad), iy = CY + R * Math.sin(rad), ux = (ix - CX) / R, uy = (iy - CY) / R;
      const sx = CX + ux * 84, sy = CY + uy * 84, ex = ix - ux * 16, ey = iy - uy * 16, mx = (sx + ex) / 2 - uy * 24, my = (sy + ey) / 2 + ux * 24;
      const ns = 'http://www.w3.org/2000/svg', id = `wv${Math.random().toString(36).slice(2, 8)}`;
      const g = document.createElementNS(ns, 'linearGradient');
      g.id = id; g.setAttribute('gradientUnits', 'userSpaceOnUse');
      [['x1', sx], ['y1', sy], ['x2', ex], ['y2', ey]].forEach(([k, v]) => g.setAttribute(k as string, (v as number).toFixed(1)));
      g.innerHTML = `<stop offset="0" stop-color="${ic.col}" stop-opacity="0"/><stop offset=".55" stop-color="${ic.col}" stop-opacity=".55"/><stop offset="1" stop-color="${ic.col}"/>`;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
      Object.entries({ fill: 'none', stroke: `url(#${id})`, 'stroke-width': '1.8', 'stroke-linecap': 'round' }).forEach(([k, v]) => path.setAttribute(k, v));
      svg.append(g, path);
      const L = path.getTotalLength();
      path.style.strokeDasharray = `${L} ${L}`;
      path.animate([{ strokeDashoffset: L, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.42 }, { strokeDashoffset: -L, opacity: 0 }], { duration: 1150, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' }).onfinish = () => { path.remove(); g.remove(); };
      timer = window.setTimeout(() => {
        if (!alive) return;
        ic.el.firstElementChild?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.75)', offset: 0.32 }, { transform: 'scale(.9)', offset: 0.58 }, { transform: 'scale(1.08)', offset: 0.78 }, { transform: 'scale(1)' }], { duration: 900, easing: 'ease-out' });
        land(ic, true);
      }, 420);
      if (tint) { tint.style.background = ic.col; tint.animate([{ opacity: 0 }, { opacity: 0.22, offset: 0.4 }, { opacity: 0 }], { duration: 1300, delay: 300, easing: 'ease-in-out' }); }
    };
    const breath = [loop(glow, [{ opacity: 1 }, { opacity: 0.7 }, { opacity: 1 }], { duration: 6000, delay: START + DRAW + 700, easing: 'ease-in-out' })];
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(timer); breath.forEach(a => a?.cancel()); };
  }, []);
  return (
    <div ref={ref} aria-hidden="true" className="absolute inset-0">
      {/* Figma 01 holo ring (300): its glow and its line, apart so the line can draw itself */}
      <svg width={300} height={300} viewBox="0 0 300 300" style={at(45, 140, 300)} overflow="visible">
        <defs>
          <radialGradient id="w-glow" cx="150" cy="150" r="150" gradientUnits="userSpaceOnUse"><stop stopColor="#7C5CFF" stopOpacity={0.34} /><stop offset={0.62} stopColor="#7C5CFF" stopOpacity={0.16} /><stop offset={1} stopColor="#7C5CFF" stopOpacity={0.04} /></radialGradient>
          <linearGradient id="w-head" gradientUnits="userSpaceOnUse" x1={CX + R * Math.cos(-200 * Math.PI / 180)} y1={CY + R * Math.sin(-200 * Math.PI / 180)} x2={CX} y2={CY - R}><stop stopColor="#fff" stopOpacity={0} /><stop offset={0.65} stopColor="#fff" stopOpacity={0.32} /><stop offset={1} stopColor="#fff" stopOpacity={0.95} /></linearGradient>
        </defs>
        <g data-w-glow="" style={{ transformOrigin: '150px 150px' }}><circle cx={150} cy={150} r={150} fill="url(#w-glow)" /></g>
        <g transform="translate(-45 -140)">
          <circle data-w-line="" cx={CX} cy={CY} r={R} stroke="#fff" strokeOpacity={0.16} fill="none" strokeDasharray={C.toFixed(2)} transform={`rotate(-90 ${CX} ${CY})`} />
          <g data-w-head="" style={{ opacity: 0 }}>
            <path d={`M ${(CX + R * Math.cos(-200 * Math.PI / 180)).toFixed(2)} ${(CY + R * Math.sin(-200 * Math.PI / 180)).toFixed(2)} A ${R} ${R} 0 0 1 ${CX} ${CY - R}`} fill="none" stroke="url(#w-head)" strokeWidth={1.6} strokeLinecap="round" />
            <circle cx={CX} cy={CY - R} r={2.2} fill="#fff" />
          </g>
          <g data-w-fx="" />
        </g>
      </svg>
      <span data-w-orb="" style={{ ...at(115, 210, 160), transformOrigin: "center" }}>
        <img src={innerOrb} alt="" className="block size-full" />
        <span data-w-tint="" className="absolute inset-px rounded-full opacity-0" />
      </span>
      {shapes.map(s => (
        <span key={s.src} data-w-shape="" data-cx={s.x + 11} data-cy={s.y + 11} data-color={s.color} style={at(s.x, s.y, 22)}>
          <span className="absolute" style={{ inset: s.inset }}><img src={s.src} alt="" className="block size-full" /></span>
        </span>
      ))}
      <p data-w-arc="" className="absolute w-[390px] text-center text-[14px] font-medium tracking-[0.14em]" style={{ top: 281.5 }}>ARC</p>{/* Figma 590:496 */}
    </div>
  );
}
