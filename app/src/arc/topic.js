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

// 07b with the ondevice engine (user 11/21 「원준 방식(조합 문장). 단, 문법이 깨진 문장(동사 뒤 동사 등)은 간단한 규칙으로
// 빼고」): its questions are "Do|Does <factor> improve|increase|reduce|affect <outcome>?" made from finding cards.
const VERB = /\b(improve|increase|reduce|affect|raise)\s+([a-z]+)/i;
// verbs that are not also common nouns, so "improve participate" is caught and "improve trust" is not
const BARE_VERB = new Set(['participate', 'engage', 'interact', 'perform', 'collaborate', 'communicate', 'navigate', 'learn', 'adopt',
  'explore', 'understand', 'create', 'decide', 'complete', 'respond', 'recover', 'contribute', 'continue', 'cope', 'express', 'feel',
  'become', 'make', 'get', 'go', 'take', 'do', 'be', 'to']); // not use, help: nouns too ("improve use of …")
const PLURAL_WORD = new Set(['people', 'children', 'men', 'women', 'data']);
/**
 * A composed question that reads wrong: a verb right after its verb ("Do older adults improve participate …"), or "Do"/"Does"
 * not matching the subject's head noun ("Do digitalisation of public services improve …": the head is before "of").
 */
export function brokenQuestion(text) {
  const t = (text ?? '').trim();
  const v = t.match(VERB);
  if (v && BARE_VERB.has(v[2].toLowerCase())) return true;
  const m = t.match(/^(?:how\s+)?(do|does)\s+(.+?)\s+(?:improve|increase|reduce|affect|raise)\b/i);
  if (!m) return false;
  const head = m[2].split(/\s+(?:of|for|in|on|with|among|by|to|from)\s+/i)[0].trim().split(/\s+/).at(-1).toLowerCase();
  const plural = PLURAL_WORD.has(head) || /[^s]s$/.test(head);
  return m[1].toLowerCase() === 'do' ? !plural : plural;
}
