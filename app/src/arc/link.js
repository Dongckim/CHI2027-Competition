// Share links (A3, decision 006): /s/<payload>, payload = base64url(JSON { v, e, q, t, n }).
//   v 1 · e edition · q the question (200 characters at most) · t tribe · n [[talk id, angle, start?, end?], ...]
// No name, place, device or time of sharing: only what the receiver needs to see the same Arc. start/end are the
// evidence sentence's place in the abstract; the receiver checks them against its own abstract (quotes.js) and drops
// the quote when it does not match, so a link cannot put words into a paper.
// Pure: the app (16, 18), functions/share.mjs and the tests share it.
import { verifiedReasons } from '../explore/quotes.js';

export const LINK_VERSION = 1;
export const MAX_NODES = 60;
const TRIBES = ['ai', 'xr', 'access', 'health', 'learning', 'society', 'devices', 'design'];
const QUERY_MAX = 200;

const toB64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

/** @param {{ edition: string, query: string, tribe: string, nodes: { key: string, angle: string, evidence: { start: number, end: number } | null }[] }} arc */
export function encodeLink(arc) {
  const n = arc.nodes.slice(0, MAX_NODES).map(x => {
    const id = x.key.split(':')[1];
    return x.evidence ? [id, x.angle, x.evidence.start, x.evidence.end] : [id, x.angle];
  });
  const body = { v: LINK_VERSION, e: arc.edition, q: arc.query.slice(0, QUERY_MAX), t: arc.tribe, n };
  return toB64url(new TextEncoder().encode(JSON.stringify(body)));
}

/**
 * The link's content, checked field by field (it comes from anyone). Returns { ok: true, link } or { ok: false, why }.
 * @returns {{ ok: true, link: { v: number, e: string, q: string, t: string, n: [string, string, number?, number?][] } } | { ok: false, why: string }}
 */
export function decodeLink(payload) {
  if (typeof payload !== 'string' || !/^[A-Za-z0-9_-]{1,4000}$/.test(payload)) return { ok: false, why: 'not a share link' };
  let j;
  try { j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromB64url(payload))); } catch { return { ok: false, why: 'not a share link' }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, why: 'not a share link' };
  if (j.v !== LINK_VERSION) return { ok: false, why: 'made by another version of ARC' };
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
