// 17 "Lock screen" (user, 11/20): a 9:19.5 picture (1170 × 2532) of the QR, the question and the tribe colour, drawn on
// the phone (nothing is sent; works offline), then the share sheet ("Save Image" on iPhone) or a download. The top 30%
// is left for the lock screen clock. Only the question and the link (as the QR) are in it, never a name.
import { TRIBE } from './tribes.js';
import { TRIBE_ICON } from './tribeIcons';
import type { Arc } from '../engine';

const W = 1170, H = 2532;
const image = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

function lines(g: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= width || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  if (out.length > max) { out.length = max; out[max - 1] = `${out[max - 1].replace(/\s*\S*$/, '')}…`; }
  return out;
}

export async function lockScreenPng(arc: Arc, qr: { d: string; size: number }): Promise<Blob> {
  await document.fonts.ready;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d')!;
  const t = TRIBE[arc.tribe];
  g.fillStyle = '#121119'; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.58, 0, W / 2, H * 0.58, W * 0.9);
  glow.addColorStop(0, `${t.color}55`); glow.addColorStop(1, `${t.color}00`);
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  // tribe chip
  const icon = await image(TRIBE_ICON[arc.tribe]);
  g.font = '600 42px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
  const chipW = 42 + 18 + g.measureText(t.name).width + 76, chipY = H * 0.31;
  g.fillStyle = `${t.color}24`; g.strokeStyle = `${t.color}80`; g.lineWidth = 3;
  g.beginPath(); g.roundRect((W - chipW) / 2, chipY, chipW, 84, 42); g.fill(); g.stroke();
  g.drawImage(icon, (W - chipW) / 2 + 34, chipY + 21, 42, 42);
  g.fillStyle = '#f4f6ff'; g.fillText(t.name, (W - chipW) / 2 + 34 + 42 + 18, chipY + 43);
  // question
  g.font = '600 78px Inter, system-ui, sans-serif'; g.textAlign = 'center';
  const q = lines(g, arc.query, W - 220, 3);
  q.forEach((l, i) => g.fillText(l, W / 2, chipY + 200 + i * 96));
  // QR on a white tile, the tribe shape in the middle (as 17)
  const tile = 744, tx = (W - tile) / 2, ty = chipY + 200 + q.length * 96 + 40;
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(tx, ty, tile, tile, 84); g.fill();
  const inner = 600, scale = inner / qr.size;
  g.save(); g.translate(tx + (tile - inner) / 2, ty + (tile - inner) / 2); g.scale(scale, scale);
  g.fillStyle = '#15121F'; g.fill(new Path2D(qr.d)); g.restore();
  g.drawImage(icon, W / 2 - 54, ty + tile / 2 - 54, 108, 108);
  g.textAlign = 'center';
  g.font = '500 48px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(244,246,255,0.8)';
  g.fillText('Scan to get this Arc', W / 2, ty + tile + 110);
  g.font = '500 36px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(244,246,255,0.55)';
  g.fillText('ARC · unofficial', W / 2, H - 150);
  return new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('no picture'))), 'image/png'));
}

/** The share sheet with the picture (iPhone: "Save Image"), else a download. Resolves when handed over. */
export async function saveLockScreen(blob: Blob, name: string) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
