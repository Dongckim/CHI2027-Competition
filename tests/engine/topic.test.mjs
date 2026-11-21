// 07b "Make it a question": the topic test, the question part of a title, and the picking over the real CHI 2026 titles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTopic, questionOf, brokenQuestion } from '../../app/src/arc/topic.js';
import { buildIndex, topicQuestions } from '../../app/src/engine/mock-core.js';
import { buildCorpus } from './corpus.mjs';

test('topic: no "?", no question word, 3 words or fewer', () => {
  for (const t of ['VR presence', 'presence', 'older adults', 'LLM writing assistants', '  haptics  ']) assert.equal(isTopic(t), true, t);
  for (const t of ['Does VR fidelity raise presence?', 'presence?', 'how VR works', 'is VR good', 'VR presence and trust today',
    'what', 'Who', '', '   ', '?!']) assert.equal(isTopic(t), false, t);
  assert.equal(isTopic('Doing VR'), true, 'question words match whole words only ("Doing" is not "do")');
});

test('title question: the part that ends in the first "?"', () => {
  assert.equal(questionOf('Close Enough? Reducing Personal Space Anxiety through Adjusted Teleportation in Social VR'), 'Close Enough?');
  assert.equal(questionOf('Rethinking External Communication of Autonomous Vehicles: Is the Field Converging, Diverging, or Stalling?'), 'Is the Field Converging, Diverging, or Stalling?');
  assert.equal(questionOf('"If we post, what will people think of us?”: Offline Norms, Online Engagement'), 'If we post, what will people think of us?');
  assert.equal(questionOf('``How would I know what I would want from or with them?\'\': Supporting A-Spec Approaches'), 'How would I know what I would want from or with them?');
  assert.equal(questionOf('"Fast, easy, simple"? SES-diverse transfer students\' sociotechnical experiences'), 'Fast, easy, simple?');
  assert.equal(questionOf('Manual Sketching: Why is it Still Relevant?—Revisited'), 'Why is it Still Relevant?');
  assert.equal(questionOf('Who---or What---Told You? Source Memory for AI- vs. Human-Authored Content'), 'Who---or What---Told You?');
  assert.equal(questionOf(' How Well do LLMs Assist Parents in Assessing Child Appropriateness of Videos?'), 'How Well do LLMs Assist Parents in Assessing Child Appropriateness of Videos?');
  assert.equal(questionOf('With, Not For: Rethinking the Body (and Brain?) in Augmented Interaction'), null, 'a "?" in brackets asks nothing');
  assert.equal(questionOf('Presence in VR: a study'), null);
});

const corpus = buildCorpus();
test('picks: real title questions that hold a topic word, best TF-IDF match first, count = every talk the search matches', { skip: !corpus && 'data/build/chi2026 not built' }, () => {
  const index = buildIndex(corpus);
  const { count, questions } = topicQuestions(index, 'VR presence');
  assert.ok(count > 100, `count ${count}`);
  assert.ok(questions.length >= 1);
  // the question sentence holds a word of the topic (VR expands to virtual reality), not just its paper
  for (const q of questions) assert.match(q.text, /\b(vr|virtual|reality|presence)/i, q.text);
  assert.ok(!questions.some(q => /Privacy Policies/.test(q.text)), 'no off-topic question from an on-topic paper');
  const titles = new Map(corpus.papers.map(p => [p.key, p.title]));
  for (const q of questions) assert.ok(titles.get(q.key).includes(q.text.replace(/["“”`]+\?$/, '?').slice(0, -1)), `"${q.text}" is in its title`);
  assert.equal(new Set(questions.map(q => q.text)).size, questions.length, 'each question once');
});

test('07b composed questions: drop the ones that read wrong', () => {
  for (const q of ['Do older adults improve participate in the gig economy?', 'Do digitalisation of public services improve exclusion of older adults?',
    'Does older adults improve trust?', 'Do haptic feedback improve immersion?']) assert.equal(brokenQuestion(q), true, q);
  for (const q of ['Do haptics improve VR experience?', 'Does session duration improve VR presence?', 'How do personalized avatars affect VR presence?',
    'How do older adults affect portal use?', 'Do LLM agents improve trust?', 'Does privacy reduce AI adoption?', 'How does privacy affect cognitive load?',
    'Do children improve use of tablets?', 'Does the use of robots improve wellbeing?']) assert.equal(brokenQuestion(q), false, q);
});
