// Talk Q&A on the phone: calls /api/qa (functions/qa.mjs) with this phone's token. Text is shown as text only.
import { update, useDevice } from '../state/useDevice';
import { withQaToken, qaTokenOf } from './draft.js';

export type Question = { id: string; text: string; votes: number; createdAt: number; mine: boolean; voted: boolean };
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');

export function useQaToken(): string {
  const state = useDevice();
  const t = qaTokenOf(state);
  if (!t) queueMicrotask(() => update(s => withQaToken(s, newToken)));
  return t ?? '';
}

async function call(token: string, method: string, body?: object, query = '') {
  const r = await fetch(`/api/qa${query}`, { method, headers: { 'x-arc-device': token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
export const listQuestions = (token: string, paper: string) => call(token, 'GET', undefined, `?paper=${encodeURIComponent(paper)}`).then(j => j.questions as Question[]);
export const ask = (token: string, paper: string, text: string) => call(token, 'POST', { action: 'ask', paper, text }).then(j => j.question as Question);
export const vote = (token: string, id: string) => call(token, 'POST', { action: 'vote', id });
export const flag = (token: string, id: string) => call(token, 'POST', { action: 'flag', id });
export const remove = (token: string, id: string) => call(token, 'DELETE', { id });
