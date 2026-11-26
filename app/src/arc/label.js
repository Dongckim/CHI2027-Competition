// The short name a map node shows: the title before the colon, at most 24 characters (same rule as the mock engine's
// label). For talks the engine did not pick: added in 15, or received in a share link.
export const labelOf = title => { const t = (title ?? '').trim(); const h = t.split(':')[0].trim() || t; return h.length <= 24 ? h : `${h.slice(0, 23).trimEnd()}…`; };

// Small words a cut name must not end on ("Effects of" → "Effects")
// Opening words a name skips: question titles start the same way and their first word alone told nothing (iPhone 11/26:
// 24b showed "Do", "The", "When", "Who")
const LEAD = new Set(['a', 'an', 'the', 'do', 'does', 'did', 'can', 'could', 'should', 'will', 'would', 'is', 'are', 'how', 'what', 'when', 'who', 'why', 'where', 'which']);
const TAIL = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'for', 'in', 'on', 'to', 'with', 'by', 'at', 'from', 'as', 'via', 'vs', 'is', 'are']);
/**
 * The name as the map can show it (user 11/25 「12자 정도만 표시하는식으로 … 길게 오더라도」): whole words from the start,
 * at most `max` characters, never ending on a small word or punctuation, no "…". A first word longer than `max` is kept
 * whole (the line clamp cuts it). The whole title stays in the node's description, the card and 14.
 */
/** @param {string} label @param {number | ((text: string) => boolean)} max characters, or whether a text fits */
export function fitLabel(label, max) {
  const fits = typeof max === 'number' ? t => t.length <= max : max;
  const cut = /…$/.test((label ?? '').trim()); // already cut mid-word: its last word is a piece ("Effects of Virtual Real…")
  const words = (label ?? '').replace(/…$/, '').trim().split(/\s+/).filter(Boolean);
  if (cut && words.length > 1) words.pop();
  while (words.length > 1 && LEAD.has(words[0].toLowerCase().replace(/[^a-z]/g, ''))) words.shift();
  const out = [];
  for (const w of words) { if (!fits([...out, w].join(' '))) break; out.push(w); }
  while (out.length > 1 && TAIL.has(out.at(-1).toLowerCase().replace(/[^a-z]/g, ''))) out.pop();
  const s = (out.length ? out : words.slice(0, 1)).join(' ');
  const t = s.replace(/[\s,;:–—-]+$/, '');
  return (t.match(/["“”]/g)?.length ?? 0) % 2 ? t.replace(/["“”]/g, '') : t; // a quote left open by the cut goes
}

/**
 * Whether `text` wraps into at most `lines` lines of `width` px, word by word, each word fitting a line (measure: a text's
 * width in px). For fitLabel on the map, with the canvas measuring the node font.
 */
export function wrapsInto(text, width, lines, measure) {
  let n = 1, line = '';
  for (const w of text.split(' ')) {
    if (measure(w) > width) return false;
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= width) line = next; else { n += 1; line = w; }
  }
  return n <= lines;
}
