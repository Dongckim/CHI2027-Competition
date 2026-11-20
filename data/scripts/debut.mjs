// "✦ New to CHI": authors of this edition with no author of the same name in the earlier feeds we have (e.g. 2023–2025).
// Names only (the feeds have no ORCID), so the rule leans to "not new": an earlier author with the same full name, or
// the same first initial + last name, means not new. A namesake therefore hides the badge rather than inventing one.
import { normalizeName } from './edition.mjs';

const full = p => normalizeName([p.firstName, p.middleInitial, p.lastName].filter(Boolean).join(' '));
const initialLast = p => {
  const first = normalizeName(p.firstName ?? '')[0];
  const last = normalizeName(p.lastName ?? '');
  return first && last ? `${first} ${last}` : null;
};

/**
 * @param {string} edition e.g. "chi2026"
 * @param {{ id: number, firstName?: string, middleInitial?: string, lastName?: string }[]} people this edition's feed people
 * @param {{ firstName?: string, middleInitial?: string, lastName?: string }[][]} earlier the feed people of earlier editions
 * @returns {string[]} sorted person keys (edition:id) that are new
 */
export function debutKeys(edition, people, earlier) {
  const seen = new Set();
  for (const list of earlier) for (const p of list) { seen.add(full(p)); const il = initialLast(p); if (il) seen.add(`il:${il}`); }
  return people
    .filter(p => full(p) && !seen.has(full(p)) && !(initialLast(p) && seen.has(`il:${initialLast(p)}`)))
    .map(p => p.id).sort((a, b) => a - b).map(id => `${edition}:${id}`);
}

/** The editions to compare against: the three before, e.g. chi2026 → chi2023, chi2024, chi2025. None for sandbox. */
export const earlierEditions = edition => {
  const y = Number(edition.match(/^chi(\d{4})$/)?.[1]);
  return y ? [y - 3, y - 2, y - 1].map(n => `chi${n}`) : [];
};
