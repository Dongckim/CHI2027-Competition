// Share links (A3, decision 006). v2 (user 11/26: messengers cut the ~600-character v1 at "/s", so no preview either):
//   2.<edition>.<tribe>.<S|R|T + talk id in base 36, …>.<base64url(question)>.<check>  e.g. 2.chi2026.ai.S4rh0R4tkw.RG8gQUk….1x9k2a
//   check: FNV-1a of the rest in base 36, so a link cut short in a chat is refused, not half-read
//   no evidence places: the receiver's engine finds each talk's sentence again (Received). v1 links still open:
//   v1: /s/<payload>, payload = base64url(JSON { v, e, q, t, n }).
//   v 1 · e edition · q the question (200 characters at most) · t tribe · n [[talk id, angle, start?, end?], ...]
// No name, place, device or time of sharing: only what the receiver needs to see the same Arc. start/end are the
// evidence sentence's place in the abstract; the receiver checks them against its own abstract (quotes.js) and drops
// the quote when it does not match, so a link cannot put words into a paper.
// Pure: the app (16, 18), functions/share.mjs and the tests share it.
import { verifiedReasons } from '../explore/quotes.js';

export const LINK_VERSION = 2;
export const MAX_NODES = 60;
const TRIBES = ['ai', 'xr', 'access', 'health', 'learning', 'society', 'devices', 'design'];
const QUERY_MAX = 200;

const toB64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

/** @param {{ edition: string, query: string, tribe: string, nodes: { key: string, angle: string, evidence: { start: number, end: number } | null }[] }} arc */
export function encodeLink(arc) {
  const n = arc.nodes.slice(0, MAX_NODES).map(x => x.angle + Number(x.key.split(':')[1]).toString(36)).join('');
  const body = ['2', arc.edition, arc.tribe, n, toB64url(new TextEncoder().encode(arc.query.slice(0, QUERY_MAX)))].join('.');
  return `${body}.${check(body)}`;
}
const check = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h.toString(36); };

function decodeV2(payload) {
  const parts = payload.split('.');
  const [, e, t, n, q64, sum, extra] = parts;
  if (extra != null || !e || !t || n == null || !q64 || sum !== check(parts.slice(0, 5).join('.'))) return { ok: false, why: 'not a share link' };
  let q;
  try { q = new TextDecoder('utf-8', { fatal: true }).decode(fromB64url(q64)); } catch { return { ok: false, why: 'not a share link' }; }
  const nodes = [];
  if (n && !/^([SRT][0-9a-z]{1,8})+$/.test(n)) return { ok: false, why: 'a talk in the link is broken' };
  for (const [, angle, id36] of n.matchAll(/([SRT])([0-9a-z]+)/g)) nodes.push([String(parseInt(id36, 36)), angle]);
  return { j: { v: 2, e, q, t, n: nodes } };
}

/**
 * The link's content, checked field by field (it comes from anyone). Returns { ok: true, link } or { ok: false, why }.
 * @returns {{ ok: true, link: { v: number, e: string, q: string, t: string, n: [string, string, number?, number?][] } } | { ok: false, why: string }}
 */
export function decodeLink(payload) {
  if (typeof payload !== 'string' || !/^[A-Za-z0-9_.-]{1,4000}$/.test(payload)) return { ok: false, why: 'not a share link' };
  let j;
  if (/^2\./.test(payload)) { const r = decodeV2(payload); if (!r.j) return r; j = r.j; }
  else {
    if (!/^[A-Za-z0-9_-]+$/.test(payload)) return { ok: false, why: 'not a share link' };
    try { j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromB64url(payload))); } catch { return { ok: false, why: 'not a share link' }; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, why: 'not a share link' };
    if (j.v !== 1) return { ok: false, why: 'made by another version of ARC' };
  }
  if (typeof j.e !== 'string' || !/^(chi\d{4}|sandbox)$/.test(j.e)) return { ok: false, why: 'no conference in the link' };
  if (typeof j.q !== 'string' || !j.q.trim() || j.q.length > QUERY_MAX) return { ok: false, why: 'no question in the link' };
  if (!TRIBES.includes(j.t)) return { ok: false, why: 'no neighbourhood in the link' };
  if (!Array.isArray(j.n) || j.n.length > MAX_NODES) return { ok: false, why: 'no talks in the link' };
  const seen = new Set();
  for (const x of j.n) {
    if (!Array.isArray(x) || (x.length !== 2 && x.length !== 4)) return { ok: false, why: 'a talk in the link is broken' };
    const [id, angle, start, end] = x;
    if (typeof id !== 'string' || !/^\d{1,12}$/.test(id) || !['S', 'R', 'T'].includes(angle) || seen.has(id)) return { ok: false, why: 'a talk in the link is broken' };
    if (x.length === 4 && !(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= 20000)) return { ok: false, why: 'a talk in the link is broken' };
    seen.add(id);
  }
  return { ok: true, link: { v: j.v, e: j.e, q: j.q, t: j.t, n: j.n } };
}

/**
 * The Arc the receiver keeps (a new one: received Arcs are never merged). Talks that are not in this programme are
 * left out and counted; evidence is kept only where it is really the abstract at that place.
 * @param {{ e: string, q: string, t: string, n: any[] }} link
 * @param {{ edition: string, title: (key: string) => string | undefined, abstract: (key: string) => string | undefined,
 *   label: (title: string) => string, firstAuthorNew: (key: string) => boolean, id: string, createdAt: number }} ctx
 */
export function receivedArc(link, ctx) {
  const nodes = [];
  let missing = 0;
  for (const [id, angle, start, end] of link.n) {
    const key = `${link.e}:${id}`;
    const title = ctx.title(key);
    if (link.e !== ctx.edition || title == null) { missing++; continue; }
    const abstract = ctx.abstract(key) ?? '';
    const sentence = start != null ? abstract.slice(start, end) : '';
    const evidence = start != null && verifiedReasons([{ quote: sentence, start, end }], abstract).length ? { sentence, start, end } : null;
    nodes.push({ key, angle, label: ctx.label(title), evidence, debut: ctx.firstAuthorNew(key) });
  }
  const arc = {
    schema_version: '0.2.0', id: ctx.id, edition: ctx.edition, query: link.q, tribe: link.t, nodes,
    tension: nodes.some(n => n.angle === 'T') ? 'found' : 'none', // the link does not carry it; no T reads as none (23)
    filters: { days: [], types: [] }, source: 'received', engine: 'shared@1', createdAt: ctx.createdAt,
  };
  return { arc, missing };
}

/** Counts per angle, for the link preview text (↑ n · ↻ n · ⊣ n). */
export const angleCounts = n => ({ S: n.filter(x => x[1] === 'S').length, R: n.filter(x => x[1] === 'R').length, T: n.filter(x => x[1] === 'T').length });
