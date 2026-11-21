// mock vs ondevice, the same questions and options, run in WebKit with the iPhone 14 profile (Playwright on this Mac, not
// a phone). Per question: angle counts, tension, the Challenge quotes, compute time. Every Arc is checked against
// Arc 0.1.0 and its rules (quotes against data/build abstracts). Needs dist/model/ (see tests/engine/ondevice.test.mjs).
//   node tests/engine/compare-webkit.mjs [out.json]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { webkit, devices } from 'playwright';
import Ajv2020 from 'ajv/dist/2020.js';
import { arcRuleErrors } from '../../contracts/check.mjs';

export const QUESTIONS = [
  'Does VR fidelity raise presence?', 'privacy of smart home devices', 'older adults and technology', 'LLM agents for programming',
  'children learning with robots', 'mental health apps', 'presence', 'What is accessibility research asking now?',
  'LLM writing assistants and student learning', 'haptic feedback for VR', 'accessible indoor navigation for blind people',
  'Which CHI work can I use in industry?', 'VR', 'Robotics could be helpful to the human daily life?',
];
const PORT = 4930, base = `http://localhost:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid); } catch {} };
let browser;
try {
  for (let i = 0; i < 80 && !(await fetch(base).then(r => r.ok, () => false)); i++) await sleep(250);
  browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 14'] });
  const page = await ctx.newPage();
  await page.goto(`${base}?at=2026-04-14T10:00#/start/1`);
  await page.waitForFunction(() => document.body.innerText.length > 0);
  const out = await page.evaluate(async questions => {
    const opts = { angles: ['S', 'R', 'T'], days: [], types: [] };
    const mock = await import('/src/engine/mock.ts');
    await mock.topicQuestions('warm'); // the mock index, loaded once, not counted per Arc
    const od = await import('/src/engine/ondevice.ts');
    let t = performance.now();
    await od.ondeviceEngine.init(() => {});
    const load = performance.now() - t;
    const rows = [];
    for (const q of questions) {
      t = performance.now(); const m = await mock.questionArc(q); const mMs = performance.now() - t; // no 1.2 s show delay
      t = performance.now(); const o = await od.ondeviceEngine.buildArc(q, opts); const oMs = performance.now() - t;
      rows.push({ q, mock: m, mockMs: mMs, ondevice: o, ondeviceMs: oMs });
    }
    return { load, rows };
  }, QUESTIONS);
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(new URL('../../contracts/Arc.schema.json', import.meta.url))));
  const papers = new Map(JSON.parse(readFileSync(new URL('../../data/build/chi2026/papers.json', import.meta.url))).map(p => [p.key, p]));
  const check = a => { const arc = { ...a, id: 'compare-arc-01' }; return validate(arc) ? arcRuleErrors(arc, papers) : validate.errors.map(e => `${e.instancePath} ${e.message}`); }; // the mock's 07b preview Arcs carry id "preview"
  const sum = arc => {
    const by = a => arc.nodes.filter(n => n.angle === a);
    return { tribe: arc.tribe, S: by('S').length, R: by('R').length, T: by('T').length, tension: arc.tension,
      evidence: `${arc.nodes.filter(n => n.evidence).length}/${arc.nodes.length}`,
      challenges: by('T').map(n => ({ key: n.key, title: papers.get(n.key)?.title, sentence: n.evidence?.sentence ?? null })), errors: check(arc) };
  };
  const result = { loadMs: Math.round(out.load), rows: out.rows.map(r => ({ q: r.q, mockMs: Math.round(r.mockMs), ondeviceMs: Math.round(r.ondeviceMs), mock: sum(r.mock), ondevice: sum(r.ondevice) })) };
  for (const r of result.rows) console.log(`${r.q}\n  mock     ${r.mock.tribe} ↑${r.mock.S} ↻${r.mock.R} ⊣${r.mock.T} ${r.mock.tension} ${r.mockMs} ms ${r.mock.errors.length ? 'FAIL ' + r.mock.errors[0] : ''}\n  ondevice ${r.ondevice.tribe} ↑${r.ondevice.S} ↻${r.ondevice.R} ⊣${r.ondevice.T} ${r.ondevice.tension} ${r.ondeviceMs} ms ${r.ondevice.errors.length ? 'FAIL ' + r.ondevice.errors[0] : ''}`);
  console.log(`ondevice first load ${result.loadMs} ms`);
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 1));
} finally {
  await browser?.close();
  stop();
}
