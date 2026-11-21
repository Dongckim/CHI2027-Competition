// 07b "Make it a question": when the input reads as a topic, and the question part of a programme title. Pure (node tests).

const QUESTION_WORD = /\b(what|how|why|when|where|which|who|whom|whose|does|do|did|is|are|was|were|can|could|should|would|will|shall|may|might|must)\b/i;

/** A topic, not a question: no "?", no question word, 3 words or fewer (and at least one letter or digit). */
export const isTopic = text => {
  const t = (text ?? '').trim();
  return /[\p{L}\p{N}]/u.test(t) && !t.includes('?') && !QUESTION_WORD.test(t) && t.split(/\s+/).length <= 3;
};

/**
 * The question in a title, as the title has it: the part that ends in its first "?", from the last ": " / "? " / "! " /
 * ". " before it. "Close Enough? Reducing …" → "Close Enough?". Quotes around it are dropped. null when the title asks
 * nothing, or the "?" sits inside brackets ("the Body (and Brain?) in …").
 */
export function questionOf(title) {
  const t = title ?? '';
  const i = t.indexOf('?');
  if (i < 0) return null;
  const head = t.slice(0, i + 1);
  const cut = [...head.slice(0, -1).matchAll(/[:!?.]["'”’]*\s/g)].at(-1);
  const q = (cut ? head.slice(cut.index + cut[0].length) : head).replace(/^[\s"“”'‘’`]+/, '').replace(/["“”`]+\?$/, '?').trim();
  return (q.match(/\(/g)?.length ?? 0) > (q.match(/\)/g)?.length ?? 0) || q.length < 2 ? null : q;
}
