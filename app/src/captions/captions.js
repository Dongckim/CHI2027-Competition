// Live captions from Soniox real-time tokens. Runs on the phone: pure, no I/O.
// Only what fits on screen is kept: the last few lines of the original and of the translation (CLAUDE.md: 3 lines, deleted on stop).

export const LINES = 3;
export const WIDTH = 42; // characters per line at 16px on a 390px screen, roughly

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

// Break text into lines of at most `width` characters at spaces; a longer word is cut.
export function wrap(text, width = WIDTH) {
  const lines = [];
  let line = '';
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > width) { if (line) { lines.push(line); line = ''; } lines.push(word.slice(0, width)); word = word.slice(width); }
    if (!word) continue;
    if (line && line.length + 1 + word.length > width) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

export function createCaptions({ lines = LINES, width = WIDTH } = {}) {
  const keep = lines * width * 2; // enough tail to re-wrap the last lines; everything older is dropped
  const fresh = () => ({ final: '', live: '' });
  let original = fresh(), translation = fresh();
  let speaker = null; // last confirmed speaker, with diarization on
  return {
    // res: one Soniox response. Final tokens are appended; non-final ones replace the previous non-final text.
    // With speaker diarization, a change of speaker in the original starts with a label ("S2: ").
    update(res) {
      const live = { original: '', translation: '' };
      let liveSpeaker = speaker;
      for (const t of res.tokens || []) {
        if (!t.text || /^<\w+>$/.test(t.text)) continue; // control tokens such as <end>
        const side = t.translation_status === 'translation' ? 'translation' : 'original';
        const target = side === 'translation' ? translation : original;
        let text = t.text;
        if (side === 'original' && t.speaker != null) {
          const current = t.is_final ? speaker : liveSpeaker;
          if (current !== t.speaker) text = `${current == null ? '' : ' '}S${t.speaker}: ${text.trimStart()}`;
          if (t.is_final) speaker = t.speaker;
          liveSpeaker = t.speaker;
        }
        if (t.is_final) target.final = (target.final + text).slice(-keep);
        else live[side] += text;
      }
      original.live = live.original;
      translation.live = live.translation;
    },
    view() {
      const show = s => wrap(s.final + s.live, width).slice(-lines);
      return { original: show(original), translation: show(translation) };
    },
    clear() { original = fresh(); translation = fresh(); speaker = null; },
  };
}
