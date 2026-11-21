// The JavaScript runtime must answer like the Python package. Runs every retriever,
// explorer, ARC and Arc-engine case in Node and compares with tests/web_reference.json (made by
// tests/web_reference.py on the same model folder).
//
//   node tests/run_web_parity.mjs              # Python's query vectors: checks the logic
//   node tests/run_web_parity.mjs --encoder    # the JS encoder too: checks end to end
//
// Numbers may differ in the last digits (float32 sums in another order): a value
// counts as equal within 2e-4. latency_ms is ignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackage, Retriever, Explorer, ARC, Angles } from "../src/web/load.mjs";
import { InputError } from "../src/web/py.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PKG = process.env.CHI_PKG || path.join(ROOT, "dist", "chi2026-retriever");
const ref = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "web_reference.json"), "utf8"));
const useEncoder = process.argv.includes("--encoder");
const verbose = process.argv.includes("-v");

const qv = new Map(Object.entries(ref.qvecs));
let pkg;
if (useEncoder) {
  pkg = await loadPackage(PKG);
  // the encoder itself: cosine with Python's vector for every text
  let worst = 1, sum = 0;
  for (const [text, v] of qv) {
    const js = await pkg.embed(text);
    let c = 0;
    for (let k = 0; k < v.length; k++) c += js[k] * v[k];
    worst = Math.min(worst, c);
    sum += c;
  }
  console.log(`encoder: ${qv.size} texts, cosine with Python mean ${(sum / qv.size).toFixed(6)}, worst ${worst.toFixed(6)}`);
} else {
  pkg = await loadPackage(PKG, {
    embed: async (t) => {
      if (!qv.has(t)) throw new Error(`no Python vector for ${JSON.stringify(t)}`);
      return Float32Array.from(qv.get(t));
    },
  });
}

function diff(a, b, where, out) {
  if (out.length > 6) return;
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > 2e-4) out.push(`${where}: ${a} != ${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${where}: length ${a.length} != ${b.length}`);
    for (let k = 0; k < Math.min(a.length, b.length); k++) diff(a[k], b[k], `${where}[${k}]`, out);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (k === "latency_ms") continue;
      if (!(k in a)) out.push(`${where}.${k}: missing in JS`);
      else if (!(k in b)) out.push(`${where}.${k}: extra in JS`);
      else diff(a[k], b[k], `${where}.${k}`, out);
    }
    return;
  }
  if (a !== b) out.push(`${where}: ${JSON.stringify(a)?.slice(0, 80)} != ${JSON.stringify(b)?.slice(0, 80)}`);
}

async function answer(fn, c) {
  let req;
  if ("raw" in c) {
    try {
      req = JSON.parse(c.raw);
    } catch {
      return { error: "input is not valid JSON" };
    }
  } else req = c.input;
  try {
    return JSON.parse(JSON.stringify(await fn(req)));
  } catch (e) {
    if (e instanceof InputError) return { error: e.message };
    throw e;
  }
}

const sets = {
  retriever: ["cases.json", new Retriever(pkg), (m) => (r) => m.predict(r)],
  explorer: ["explorer_cases.json", new Explorer(pkg), (m) => (r) => m.predict(r)],
  arc: ["arc_cases.json", new ARC(pkg), (m) => (r) => m.handle(r)],
};
if (ref.angles) sets.angles = ["angle_cases.json", new Angles(pkg), (m) => (r) => m.handle(r)];
let fail = 0, total = 0;
for (const [name, [file, model, fn]] of Object.entries(sets)) {
  const cases = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", file), "utf8"));
  let ok = 0;
  const t0 = performance.now();
  for (const c of cases) {
    total++;
    let got;
    try {
      got = await answer(fn(model), c);
    } catch (e) {
      got = { crash: String(e.stack || e) };
    }
    const out = [];
    diff(got, ref[name][c.id], c.id, out);
    if (out.length) {
      fail++;
      console.log(`  FAIL ${name} ${c.id}: ${out.join("\n       ")}`);
    } else {
      ok++;
      if (verbose) console.log(`  ok   ${name} ${c.id}`);
    }
  }
  console.log(`${name}: ${ok}/${cases.length} match Python (${((performance.now() - t0) / cases.length).toFixed(0)} ms per case)`);
}
console.log(fail ? `${fail} of ${total} cases differ` : `all ${total} cases match`);
process.exit(fail ? 1 : 0);
