import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { terms, sentences, buildIndex, recommend, MODEL_VERSION, LIMIT } from '../../app/src/recommend/baseline.js';
import { responseRuleErrors } from '../../contracts/check.mjs';

test('sentences keep their exact positions; terms drop stop words and plural s', () => {
  const text = '  We study maps.   Maps help people! Last one';
  const s = sentences(text);
  assert.deepEqual(s.map(x => text.slice(x.start, x.end)), ['We study maps.', 'Maps help people!', 'Last one']);
  assert.deepEqual(terms('People use Maps and studies of Sensemaking'), ['map', 'sensemaking']);
});

test('tiny corpus: ranks by matched terms, quotes the matching sentence, bands by rank', () => {
  const author = k => [{ personKey: k, affiliations: [{ institutionKey: 'inst:b', country: 'Japan' }, { institutionKey: 'inst:a', country: 'Japan' }] }];
  const corpus = {
    meta: { edition: 'chi2026', revision: 1, publicationVersion: 86 },
    topics: [{ key: 'topic:maps', label: 'Maps', contentKeys: ['chi2026:1', 'chi2026:1'] }],
    papers: [
      { key: 'chi2026:1', title: 'Accessible maps', abstract: 'Intro text. Tactile maps help blind travellers.', type: 'Paper', authors: author('chi2026:9') },
      { key: 'chi2026:2', title: 'Something else', abstract: 'Nothing related here.', type: 'Posters', authors: author('chi2026:8') },
      { key: 'chi2026:3', title: 'Travel', abstract: 'Blind travellers in cities.', type: 'Posters', authors: author('chi2026:7') },
    ],
  };
  const r = recommend('tactile maps for blind travellers', buildIndex(corpus));
  assert.deepEqual(r.items.map(i => i.paperKey), ['chi2026:1', 'chi2026:3']);
  assert.equal(r.totalMatches, 2);
  assert.deepEqual(r.items[0].reasons[0], { conceptId: 'topic:maps', quote: 'Tactile maps help blind travellers.', start: 12, end: 47 });
  assert.deepEqual(r.items[0].concepts, ['topic:maps'], 'a paper listed twice in a topic counts once');
  assert.deepEqual(r.items[0].institutionKeys, ['inst:a', 'inst:b']);
  assert.equal(r.items[1].concepts[0].startsWith('term:'), true, 'no topic → its best matched term');
  assert.deepEqual(r.items.map(i => i.band), ['near', 'adjacent']);
  assert.equal(r.modelVersion, MODEL_VERSION);
});

const dir = new URL('../../data/build/chi2026/', import.meta.url);
test('chi2026: 200 items, valid RecommendResponse 0.1.0 and contract rules, same output every time', { skip: !existsSync(new URL('papers.json', dir)) && 'run npm run data:build chi2026' }, () => {
  const read = f => JSON.parse(readFileSync(new URL(`${f}.json`, dir)));
  const corpus = { meta: read('meta'), papers: read('papers'), topics: read('topics') };
  const index = buildIndex(corpus);
  const q = 'I study how people make sense of information and make decisions with AI help';
  const r = recommend(q, index);
  assert.equal(r.items.length, LIMIT);
  assert.equal(r.modelVersion, 'baseline-0');
  const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(new URL('../../contracts/RecommendResponse.schema.json', import.meta.url))));
  assert.ok(validate(r), JSON.stringify(validate.errors?.slice(0, 3)));
  assert.deepEqual(responseRuleErrors(r, new Map(corpus.papers.map(p => [p.key, p]))), []);
  assert.equal(JSON.stringify(recommend(q, index)), JSON.stringify(r));
  assert.ok(r.items.every(i => i.type !== 'other' || i.feedType !== 'Student Mentoring Program'));
});
