// 06 "Why for you": a reason is shown only when its quote is really in the abstract, at the place it says.
// Positions are UTF-16 (RecommendResponse: quote === abstract.slice(start, end)), which is what JS strings use.

const isLow = c => c >= 0xdc00 && c <= 0xdfff;
// A position inside a surrogate pair (between the two halves of an emoji or 𝑁) would cut a character in two.
const splitsChar = (text, i) => i > 0 && i < text.length && isLow(text.charCodeAt(i));

/** Reasons whose quote is exactly abstract.slice(start, end); any other reason is hidden. */
export function verifiedReasons(reasons, abstract) {
  if (typeof abstract !== 'string') return [];
  return (reasons ?? []).filter(r => Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end > r.start && r.end <= abstract.length
    && !splitsChar(abstract, r.start) && !splitsChar(abstract, r.end) && abstract.slice(r.start, r.end) === r.quote);
}

/** The abstract cut into plain and highlighted pieces; overlapping quotes merge. Joined, the pieces are the abstract. */
export function highlightSegments(abstract, reasons) {
  const ranges = verifiedReasons(reasons, abstract).map(r => [r.start, r.end]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of ranges) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); else merged.push([s, e]);
  }
  const out = [];
  let at = 0;
  for (const [s, e] of merged) {
    if (s > at) out.push({ text: abstract.slice(at, s), mark: false });
    out.push({ text: abstract.slice(s, e), mark: true });
    at = e;
  }
  if (at < abstract.length) out.push({ text: abstract.slice(at), mark: false });
  return out;
}
