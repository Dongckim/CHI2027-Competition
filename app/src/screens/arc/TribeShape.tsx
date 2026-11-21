// The big tribe shape of 11 (Figma 593:922) and 14f (745:1841): the shape in a light-to-deep gradient of the tribe colour
// with a 2px white 45% edge; the same mix for each tribe. Decorative: the tribe's name is always written next to it.
import { TRIBE } from '../../arc/tribes.js';
import { TRIBE_ICON } from '../../arc/tribeIcons';
import type { TribeId } from '../../engine';

const mask = (src: string) => ({ WebkitMask: `url(${src}) center / contain no-repeat`, mask: `url(${src}) center / contain no-repeat` });
// Figma 593:922 (XR): #C3CFFF → #7D96FF @55% → #5873F2, i.e. the tribe colour moved in OKLCH lightness and chroma
const shade = (c: string, dl: number, k: number) => `oklch(from ${c} calc(l + ${dl}) calc(c * ${k}) h)`;

export function TribeShape({ tribe, style, className = '' }: { tribe: TribeId; style?: React.CSSProperties; className?: string }) {
  const c = TRIBE[tribe].color;
  return (
    <span aria-hidden="true" className={`block ${className}`} style={style}>{/* Figma: no glow */}
      <span className="absolute inset-0" style={{ ...mask(TRIBE_ICON[tribe]), background: 'rgba(255,255,255,0.45)' }} />
      <span className="absolute inset-[2px]" style={{ ...mask(TRIBE_ICON[tribe]),
        background: `linear-gradient(135deg, ${shade(c, 0.191, 0.392)} 0%, ${shade(c, 0.031, 0.898)} 55%, ${shade(c, -0.067, 1.105)} 100%)` }} />
    </span>
  );
}
