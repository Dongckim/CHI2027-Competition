// Live captions from Soniox real-time tokens. Runs on the phone: pure, no I/O.
// Only what fits on screen is kept: the last few lines of the original and of the translation (CLAUDE.md: 3 lines, deleted on stop).

export const LINES = 3; // the page shows the last 3 lines; it wraps the text itself (any script, any width)
export const KEEP_CHARS = 1000; // per stream, enough for 3 lines on any screen; everything older is dropped

// Soniox context (glossary) for one session, from public programme data only: session name, talk titles, author names.
// data: { papers, sessions } from data/build/<edition>/. Returns the `context` object of the Soniox start request.
export const CONTEXT_MAX_CHARS = 9000; // Soniox refuses context over ~10,000 characters (8,000 tokens)
export function sessionContext({ papers, sessions }, sessionKey) {
  const session = sessions.find(s => s.key === sessionKey);
  if (!session) throw new Error(`unknown session ${sessionKey}`);
  const byKey = new Map(papers.map(p => [p.key, p]));
  const talks = session.contentKeys.map(k => byKey.get(k)).filter(Boolean);
  const names = [...new Set(talks.flatMap(p => p.authors.map(a => a.name)))];
  // acronyms and coined words (VR, LLMs, ChatGPT, eHealth) are the words a general model spells wrong
  const coined = [...new Set(talks.flatMap(p => p.title.match(/\b(?:[A-Z]{2,}s?|[a-z]+[A-Z]\w*|[A-Z][a-z]+[A-Z]\w*)\b/g) || []))];
  const context = {
    general: [
      { key: 'domain', value: 'Human-computer interaction research' },
      { key: 'setting', value: 'Talk session at the ACM CHI conference' },
      { key: 'topic', value: session.name },
    ],
    terms: [...coined, ...names],
    // names stay as they are in the translation
    translation_terms: names.map(n => ({ source: n, target: n })),
    text: talks.map(p => p.title).join('\n'),
  };
  // over the limit: drop background text first, then the names' translation pairs, then the tail of the terms
  const size = () => JSON.stringify(context).length;
  while (size() > CONTEXT_MAX_CHARS && context.text) context.text = context.text.split('\n').slice(0, -1).join('\n');
  while (size() > CONTEXT_MAX_CHARS && context.translation_terms.length) context.translation_terms.pop();
  while (size() > CONTEXT_MAX_CHARS && context.terms.length) context.terms.pop();
  return context;
}

// One caption stream (an original or a translation). Soniox sends <end> when someone stops talking (endpoint detection);
// the next utterance then starts a new paragraph, but only in the streams that got text since the last break.
const stream = () => ({ final: '', live: '', open: false });
const isControl = t => /^<\w+>$/.test(t.text);
const paragraphs = (s, n) => (s.final + s.live).split('\n').map(p => p.trim()).filter(Boolean).slice(-n);
function append(s, text, keep) { s.final = (s.final + text).slice(-keep); s.open = true; }
function endParagraph(s) { if (s.open) { s.final += '\n'; s.open = false; } }

export function createCaptions({ keep = KEEP_CHARS } = {}) {
  let original = stream(), translation = stream();
  let speaker = null; // last confirmed speaker, with diarization on
  return {
    // res: one Soniox response. Final tokens are appended; non-final ones replace the previous non-final text.
    // With speaker diarization, a change of speaker starts a new paragraph with a label ("S2: ").
    update(res) {
      const live = { original: '', translation: '' };
      let liveSpeaker = speaker;
      for (const t of res.tokens || []) {
        if (!t.text) continue;
        if (isControl(t)) { if (t.text === '<end>' && t.is_final) { endParagraph(original); endParagraph(translation); } continue; }
        const side = t.translation_status === 'translation' ? 'translation' : 'original';
        const target = side === 'translation' ? translation : original;
        let text = t.text;
        if (side === 'original' && t.speaker != null) {
          const current = t.is_final ? speaker : liveSpeaker;
          if (current !== t.speaker) {
            if (t.is_final) endParagraph(original);
            text = `${t.is_final ? '' : '\n'}S${t.speaker}: ${text.trimStart()}`;
          }
          if (t.is_final) speaker = t.speaker;
          liveSpeaker = t.speaker;
        }
        if (t.is_final) append(target, text, keep);
        else live[side] += text;
      }
      original.live = live.original;
      translation.live = live.translation;
    },
    // the last paragraphs of each stream; one paragraph can fill all 3 lines, so no more than 3 are needed
    view() { return { original: paragraphs(original, LINES), translation: paragraphs(translation, LINES) }; },
    clear() { original = stream(); translation = stream(); speaker = null; },
  };
}

// Face to face: two people across a table, each speaking their own language (Soniox two-way translation).
// Soniox marks every token with its language: originals carry the language spoken, translations the language translated into.
// So each person's half of the screen needs no speaker detection: `theirs` = translations into my language,
// `mine` = what I said, as heard (so I can tell I was understood).
export function createConversation(a, b, { keep = KEEP_CHARS } = {}) {
  if (!a || !b || a === b) throw new Error('two different languages');
  const fresh = () => ({ mine: stream(), theirs: stream() });
  let side = { [a]: fresh(), [b]: fresh() };
  const all = () => [a, b].flatMap(l => [side[l].mine, side[l].theirs]);
  return {
    update(res) {
      const live = { [a]: { mine: '', theirs: '' }, [b]: { mine: '', theirs: '' } };
      for (const t of res.tokens || []) {
        if (!t.text) continue;
        if (isControl(t)) { if (t.text === '<end>' && t.is_final) all().forEach(endParagraph); continue; }
        if (!side[t.language]) continue; // a third language is dropped
        const part = t.translation_status === 'translation' ? 'theirs' : 'mine';
        if (t.is_final) append(side[t.language][part], t.text, keep);
        else live[t.language][part] += t.text;
      }
      for (const l of [a, b]) for (const part of ['mine', 'theirs']) side[l][part].live = live[l][part];
    },
    // `language`'s half: the other person's last paragraphs (the page shows the last 3 lines) and my last one
    view(language) {
      return { theirs: paragraphs(side[language].theirs, LINES), mine: paragraphs(side[language].mine, 1) };
    },
    clear() { side = { [a]: fresh(), [b]: fresh() }; },
  };
}
