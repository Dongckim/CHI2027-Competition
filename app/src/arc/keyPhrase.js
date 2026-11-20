// 14 "Why it …" card (Figma 597:1002): the key words of the quoted sentence in 600 and underlined. Which words is
// ARC's rule, not Figma's (it shows one example): the words the question also uses (same word roots as the mock
// engine) and, for a Challenge, its contrary-result cue. Neighbouring marked words join into one phrase.
import { terms } from '../recommend/baseline.js';

const root = w => w.replace(/(?<=.{3})(ing|ed)$/, '').replace(/(?<=.{3})ic$/, '');
const CUE = /\b(no significant(?: \w+)?|did not|contrary to|failed to|fails? to|mixed (?:results|findings|evidence|effects))\b/gi;

/** @returns {{ text: string, mark: boolean }[]} the sentence in order, nothing added or dropped */
export function keySegments(sentence, query, angle) {
  const want = new Set(terms(query).map(root));
  const marks = [];
  for (const m of sentence.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)) {
    const t = terms(m[0]).map(root);
    if (t.length && t.every(x => want.has(x))) marks.push([m.index, m.index + m[0].length]);
  }
  if (angle === 'T') for (const m of sentence.matchAll(CUE)) marks.push([m.index, m.index + m[0].length]);
  marks.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of marks) {
    const last = merged.at(-1);
    if (last && (s <= last[1] || /^\s+$/.test(sentence.slice(last[1], s)))) last[1] = Math.max(last[1], e); else merged.push([s, e]);
  }
  const out = [];
  let at = 0;
  for (const [s, e] of merged) {
    if (s > at) out.push({ text: sentence.slice(at, s), mark: false });
    out.push({ text: sentence.slice(s, e), mark: true });
    at = e;
  }
  if (at < sentence.length) out.push({ text: sentence.slice(at), mark: false });
  return out;
}
