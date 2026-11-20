// The 8 tribes (neighbourhoods) a research question can belong to. Colour + shape + name always together (never colour
// alone). Keywords follow the CHI 2026 subcommittees and session names; the mock engine votes with them (tribeOf).
// Pure, so node (tests, tests/engine/try.mjs) and the phone share it.

/** @typedef {'ai'|'xr'|'access'|'health'|'learning'|'society'|'devices'|'design'} TribeId */

// Order matters: field keywords first, AI last; otherwise AI takes half of CHI (most sessions mention it somewhere).
export const TRIBES = [
  { id: 'access', name: 'Accessibility & aging', shape: '●', color: '#2FBF71',
    keywords: ['accessib', 'disabilit', 'blind', 'low vision', 'deaf', 'hard of hearing', 'sign language', 'caption', 'screen reader', 'older adult', 'aging', 'ageing', 'later life', 'neurodiver', 'autis', 'adhd', 'dyslexi', 'assistive', 'wheelchair', 'sensory access', 'inclusion', 'impair'] },
  { id: 'health', name: 'Health & wellbeing', shape: '✚', color: '#FF6B6B',
    keywords: ['health', 'wellbeing', 'well-being', 'mental', 'clinic', 'patient', 'care', 'therap', 'medical', 'stress', 'mindful', 'biofeedback', 'illness', 'diagnos', 'physical activity', 'behavior change', 'behaviour change', 'self-tracking', 'eating', 'food', 'sleep', 'reproductive'] },
  { id: 'learning', name: 'Learning & families', shape: '■', color: '#FFC234',
    keywords: ['learning', 'education', 'student', 'teach', 'tutor', 'classroom', 'school', 'child', 'youth', 'teen', 'famil', 'parent', 'literacy', 'training'] },
  { id: 'xr', name: 'XR & immersive', shape: '◆', color: '#4C7DFF',
    keywords: ['virtual reality', 'vr', 'augmented reality', 'ar', 'mixed reality', 'xr', 'immersive', 'spatial computing', 'metaverse', 'headset', '3dui', 'social vr', 'virtual world'] },
  { id: 'devices', name: 'Devices & interaction', shape: '⬢', color: '#19C3D6',
    keywords: ['haptic', 'wearable', 'tangible', 'fabrication', 'sensing', 'shape-chang', 'gesture', 'gaze', 'touch', 'input', 'device', 'robot', 'electrical stimulation', 'textile', 'thermal', 'mobile', 'driving', 'vehicle', 'pcb', 'hand pose'] },
  { id: 'society', name: 'Society & communities', shape: '★', color: '#FF7AC6',
    keywords: ['privacy', 'security', 'social media', 'communit', 'justice', 'ethic', 'governance', 'policy', 'labor', 'labour', 'gender', 'identity', 'marginal', 'moderation', 'online harm', 'misinformation', 'deepfake', 'scam', 'dark pattern', 'sustainab', 'religio', 'culture', 'critical', 'equity', 'surveillance', 'workplace', 'collaborat', 'group work', 'relationship', 'social impact'] },
  { id: 'design', name: 'Design & creativity', shape: '⬟', color: '#E6E6E6', // TODO(designer): confirm, near the white angle icons
    keywords: ['design', 'creativ', 'art', 'music', 'sound', 'dance', 'game', 'play', 'player', 'visualization', 'visualisation', 'craft', 'speculative', 'fashion', 'heritage', 'more-than-human', 'storytelling', 'writing'] },
  { id: 'ai', name: 'AI & agents', shape: '▲', color: '#9B6BFF',
    keywords: ['ai', 'artificial intelligence', 'llm', 'language model', 'genai', 'generative', 'agent', 'chatbot', 'conversational', 'machine learning', 'prompt', 'algorithm', 'model', 'automation'] },
];

export const TRIBE = Object.fromEntries(TRIBES.map(t => [t.id, t]));

const padded = text => ` ${(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, ' ')} `;
// A keyword matches at the start of a word ("accessib" → accessibility); 3 letters or fewer only as a whole word (ai, vr, art).
const pattern = k => new RegExp(`\\s${k.replace(/[-]/g, '\\-')}${k.length <= 3 ? '(?=\\s)' : ''}`);
const PATTERNS = new Map();
const hit = (text, k) => (PATTERNS.get(k) ?? PATTERNS.set(k, pattern(k)).get(k)).test(text);

/** The first tribe (in TRIBES order) whose keyword is in the text, or null. */
export function tribeOfText(text) {
  const t = padded(text);
  return TRIBES.find(tr => tr.keywords.some(k => hit(t, k)))?.id ?? null;
}

/** Keyword hits per tribe in a longer text (an abstract): the tribe with the most hits (ties: TRIBES order), or null. */
export function tribeByCount(text) {
  const t = padded(text);
  let best = null, most = 0;
  for (const tr of TRIBES) {
    const n = tr.keywords.filter(k => hit(t, k)).length;
    if (n > most) { best = tr.id; most = n; }
  }
  return best;
}

/** Majority of the votes (ties: TRIBES order); confidence = share of the winning votes among all votes. */
export function majority(votes) {
  const n = new Map();
  for (const v of votes) if (v) n.set(v, (n.get(v) ?? 0) + 1);
  const total = [...n.values()].reduce((a, b) => a + b, 0);
  if (!total) return null;
  const best = TRIBES.map(t => t.id).filter(id => n.has(id)).sort((a, b) => n.get(b) - n.get(a))[0];
  return { tribe: best, confidence: Math.round((n.get(best) / total) * 100) / 100 };
}
