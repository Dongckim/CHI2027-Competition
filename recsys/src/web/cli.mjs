#!/usr/bin/env node
// The JavaScript runtime from the command line, like the Python scripts:
//
//   node web/cli.mjs arc '{"screen": "route", "day": "tue", "profile": {"research": "haptics"}}'
//   node web/cli.mjs retriever '{"research_topic": "privacy in wearable cameras"}'
//   node web/cli.mjs explorer '{"institution": "postech"}'
//   node web/cli.mjs angles '{"screen": "arc", "question": "Does VR fidelity raise presence?", "days": "tue"}'
//   node web/cli.mjs bench           # load time and time per screen on this machine
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackage, Retriever, Explorer, ARC, Angles } from "./load.mjs";
import { InputError } from "./py.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CHI_PKG || path.dirname(HERE);
const [what = "arc", raw] = process.argv.slice(2);

const BENCH = [
  { screen: "meta" },
  { screen: "keywords", research: "I study haptic feedback for virtual reality to help older adults exercise at home" },
  { screen: "nearby", research: "accessible indoor navigation for blind people" },
  { screen: "days", profile: { research: "privacy in wearable cameras" } },
  { screen: "route", day: "tue", profile: { research: "haptic feedback for virtual reality" } },
  { screen: "more", day: "wed", profile: { research: "LLM coding assistants for novice programmers" } },
  { screen: "search", q: "mental health chatbots" },
  { screen: "paper", id: 222748, profile: { research: "haptic feedback for virtual reality" } },
  { screen: "author", name: "Geehyuk Lee" },
  { screen: "wrapup", day: "tue", profile: { research: "haptics" }, state: { saved: [222748] } },
  { screen: "clusters", research: "privacy in wearable cameras" },
];

const Q = "Does VR fidelity raise presence?";
const BENCH_ANGLES = [
  { screen: "ask", text: "VR presence" },
  { screen: "angles", question: Q },
  { screen: "arc", question: Q, days: "tue" },
  { screen: "edit", question: Q, days: "tue", nodes: [222304, 222323], node: 222304 },
  { screen: "node", question: Q, id: 222304 },
  { screen: "shared", question: Q, ids: [222304, 222323], now: "2026-04-14T09:00:00+02:00" },
  { screen: "home", arcs: [{ question: Q, ids: [222304], heard: [] }] },
];

async function main() {
  let t0 = performance.now();
  const pkg = await loadPackage(ROOT);
  const load = performance.now() - t0;
  if (what === "bench") {
    t0 = performance.now();
    const arc = new ARC(pkg);
    console.log(`load files ${load.toFixed(0)} ms, build ARC ${(performance.now() - t0).toFixed(0)} ms`);
    for (const req of BENCH) {
      const a = performance.now();
      await arc.handle(req);
      const first = performance.now() - a;
      const b = performance.now();
      await arc.handle(req);
      console.log(`  ${req.screen.padEnd(9)} first ${first.toFixed(0).padStart(4)} ms, again ${(performance.now() - b).toFixed(0).padStart(4)} ms`);
    }
    if (pkg.angles) {
      t0 = performance.now();
      const eng = new Angles(pkg);
      console.log(`build Arc engine ${(performance.now() - t0).toFixed(0)} ms`);
      for (const req of BENCH_ANGLES) {
        const a = performance.now();
        await eng.handle(req);
        console.log(`  ${req.screen.padEnd(9)} ${(performance.now() - a).toFixed(0).padStart(4)} ms`);
      }
    }
    return;
  }
  const model = { arc: () => new ARC(pkg), angles: () => new Angles(pkg), retriever: () => new Retriever(pkg),
                  explorer: () => new Explorer(pkg) }[what];
  if (!model) throw new Error("first argument: arc, angles, retriever, explorer or bench");
  const m = model();
  let text = raw;
  if (text === undefined) {
    text = "";
    for await (const chunk of process.stdin) text += chunk;
  }
  try {
    let req;
    try {
      req = JSON.parse(text);
    } catch (e) {
      throw new InputError(`input is not valid JSON (${e.message})`);
    }
    const out = what === "arc" || what === "angles" ? await m.handle(req) : await m.predict(req);
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    console.log(JSON.stringify({ error: e.message }));
    process.exit(2);
  }
}

await main();
