// Wonjune's angle engine (recsys/src/web/angles.mjs) → our Engine interface and Arc 0.2.0. Pure, so the worker and the
// Node checks (tests/engine/) use the same mapping. The engine's screen requests are in recsys/docs/angle_model.md.
import { TRIBES } from '../arc/tribes.js';
import { WHAT } from '../arc/draft.js';
import { labelOf, BACKGROUND, GAP } from './mock-core.js';

const ANGLE = { support: 'S', reframe: 'R', challenge: 'T' };
const ANGLE_KEY = { S: 'support', R: 'reframe', T: 'challenge' };
export const angleKey = a => ANGLE_KEY[a];

// The engine names its 8 tribes exactly as tribes.js does ("XR & immersive" …)
const TRIBE_ID = new Map(TRIBES.map(t => [t.name, t.id]));
export const tribeId = name => TRIBE_ID.get(name) ?? null;

/** Our feed types (empty = every type) → the engine's formats. */
export function formatsOf(types) {
  const all = Object.keys(WHAT);
  if (!types?.length) return all;
  return all.filter(k => WHAT[k].some(t => types.includes(t)));
}
/** Our days (empty = every day) → the engine's days. */
export const daysOf = days => (days?.length ? days : 'week');

/** A moment as the venue's wall clock with its offset ("2026-04-14T10:00:00+02:00"), the only form the engine takes. */
export function venueIso(ms, timeZone) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const off = Math.round((wall - Math.floor(ms / 1000) * 1000) / 60000);
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0'), mm = String(Math.abs(off) % 60).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off < 0 ? '-' : '+'}${hh}:${mm}`;
}

/**
 * `now` for the engine. The package reads the feed's times as real UTC instants (session 225080: 09:00Z → 11:00+02:00),
 * but they are the venue's wall clock (docs/decisions/001: 09:00 in Barcelona), so every package time is late by the
 * venue's UTC offset. Shifting `now` by the same offset keeps "already over" and "next" right.
 * shortcut: remove once the package reads feed times as wall clock (Wonjune to confirm).
 */
export function engineNow(ms, timeZone) {
  const iso = venueIso(ms, timeZone), m = iso.match(/([+-])(\d\d):(\d\d)$/);
  const off = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000;
  return venueIso(ms + off, timeZone);
}

/**
 * The quote for a talk. The engine's offsets count code points (they come from Python); the contract counts UTF-16
 * (abstract.slice(start, end) === sentence), and they differ after any character outside the BMP (an emoji, 𝑥).
 * null when the span is empty or out of the abstract.
 */
export function evidenceOf(abstract, s) {
  if (!s || !abstract || !(s.end > s.start)) return null;
  const cp = Array.from(abstract);
  if (s.end > cp.length) return null;
  const sentence = cp.slice(s.start, s.end).join('');
  const start = cp.slice(0, s.start).join('').length;
  return sentence.trim() ? { sentence, start, end: start + sentence.length } : null;
}

/**
 * The quote placed on our abstract (data/build), the one 14 and the contract read. The package's abstracts are trimmed
 * (Python strip), ours keep the feed's leading spaces, so the offsets can be off by those: find the sentence then.
 * null when our abstract does not have it.
 */
export function onOurAbstract(e, ours) {
  if (!e || ours == null) return null;
  if (ours.slice(e.start, e.end) === e.sentence) return e;
  const at = ours.indexOf(e.sentence);
  return at < 0 ? null : { sentence: e.sentence, start: at, end: at + e.sentence.length };
}

const label = (n) => labelOf(n.label || n.title);

// What a study set out to do, not what it found ("This study investigated how …", "We explore …")
const AIM = /\b(?:(?:this|our|the present) (?:study|paper|work|research)|we|in this (?:paper|work|study),? we) (?:aim(?:s|ed)? to|set out to|seek(?:s)? to|sought to|investigat(?:e|es|ed)|examin(?:e|es|ed)|explor(?:e|es|ed)|stud(?:y|ies|ied)|present(?:s|ed)?|propos(?:e|es|ed)|introduc(?:e|es|ed))\b/i;
/**
 * A Challenge stands only on the study's own result sentence (#52, as the mock): the engine's card says "result", and the
 * sentence is not the abstract's first, an aim, prior work or a gap in the literature. abstract: the package's.
 */
export function resultQuote(n, abstract) {
  const s = n.why?.sentence;
  if (!s || n.why?.status !== 'result') return false;
  const cp = Array.from(abstract ?? '');
  if (!cp.slice(0, s.start).join('').trim()) return false; // the first sentence
  const text = cp.slice(s.start, s.end).join('');
  return !AIM.test(text) && !BACKGROUND.test(text) && !GAP.test(text);
}

// The engine's Reframe subtypes → Arc 0.2.0 `kind`
const KIND = { factor: 'factor', measure: 'measure', people: 'people', related: 'subject' };

/**
 * One engine node (arc, node screens) → ArcNode. abstractOf(id) is the package's abstract for that talk. A Challenge
 * without a result sentence becomes a Reframe on the same subject (user 11/21 「Challenge 근거가 결과 문장이 아니면 …
 * Reframe으로」).
 */
export function toNode(n, edition, abstractOf) {
  let angle = ANGLE[n.angle], kind = angle === 'R' ? KIND[n.subtype] : undefined;
  if (angle === 'T' && !resultQuote(n, abstractOf(n.id))) { angle = 'R'; kind = 'subject'; }
  return {
    key: `${edition}:${n.id}`, angle, label: label(n),
    evidence: evidenceOf(abstractOf(n.id), n.why?.sentence), debut: Boolean(n.debut), ...(kind ? { kind } : {}),
  };
}

/** The "arc" screen's answer → Arc 0.2.0. Nodes of angles the person did not choose are left out. */
export function toArc(res, query, opts, { id, createdAt, edition, version, abstractOf }) {
  const tribe = tribeId(res.tribe?.name);
  if (!tribe) throw new Error(`ondevice: no tribe for "${query}"`); // never the keyword rule: one engine per Arc
  const nodes = res.nodes.map(n => toNode(n, edition, abstractOf)).filter(n => opts.angles.includes(n.angle));
  const tension = !opts.angles.includes('T') ? 'off' : nodes.some(n => n.angle === 'T') ? 'found' : 'none';
  return {
    schema_version: '0.2.0', id, edition, query, tribe, nodes, tension,
    filters: { days: opts.days ?? [], types: opts.types ?? [] }, source: 'mine', engine: `ondevice@${version}`, createdAt,
  };
}

/** The "angles" screen's chips → 08 topics per angle. The chip id goes back to the engine as `chips`. */
export const toTopics = res => Object.fromEntries(['S', 'R', 'T'].map(a => [a, (res.angles.find(x => x.key === ANGLE_KEY[a])?.chips ?? []).map(c => ({ id: c.id, label: c.label }))]));

/** The "ask" screen's tribe → tribeOf. runnerUp: the second tribe, first in 11's Change list. */
export function toTribe(res) {
  const tribe = tribeId(res.tribe?.name);
  if (!tribe) throw new Error('ondevice: the engine gave no tribe');
  return { tribe, confidence: res.tribe.margin ?? 0, runnerUp: tribeId(res.tribe.runner_up) ?? undefined };
}

/** Talk ids from our keys of this edition. */
export const idsOf = (keys, edition) => keys.filter(k => k.startsWith(`${edition}:`)).map(k => Number(k.slice(edition.length + 1)));
