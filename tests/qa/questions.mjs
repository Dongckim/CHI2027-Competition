// Questions for the share link round trip (QA 6): & # ? " ', Korean, emoji, exactly 200 characters.
export const QUESTIONS = [
  `Does "VR" & AR #presence? It's 'real'`,
  'VR 충실도가 존재감을 높일까? virtual reality presence',
  'Can robots 🤖 help older adults 👵 at home?',
  ('How do haptic feedback and virtual reality change presence, embodiment and learning for students over long sessions ').repeat(3).slice(0, 199).trimEnd().padEnd(199, 's') + '?', // 200, no trailing space (a screen trims it)
];
