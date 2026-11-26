// Load the model folder (the same files the Python package reads) in the browser or
// in Node, and build the retriever, the explorer or the ARC screen API on top of it.
//
//   Browser:  const arc = await loadARC("./model/");        // fetch() relative URLs
//   Node:     const arc = await loadARC("/path/to/chi2026-retriever");
import { readNpy } from "./py.mjs";
import { staticEncoder, onnxEncoder } from "./encoder.mjs";
import { Retriever } from "./retriever.mjs";
import { Explorer } from "./explorer.mjs";
import { ARC } from "./arc.mjs";
import { Angles } from "./angles.mjs";

const isNode = typeof process !== "undefined" && process.versions?.node && typeof window === "undefined";

async function reader(base) {
  if (isNode) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    return {
      bytes: async (f) => { const b = await fs.readFile(path.join(base, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
      exists: async (f) => fs.access(path.join(base, f)).then(() => true, () => false),
    };
  }
  const url = (f) => new URL(f, new URL(base, location.href)).href;
  return {
    bytes: async (f) => {
      const r = await fetch(url(f));
      if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
      return r.arrayBuffer();
    },
    exists: async (f) => fetch(url(f), { method: "HEAD" }).then((r) => r.ok, () => false),
  };
}

const json = async (rd, f) => JSON.parse(new TextDecoder().decode(await rd.bytes(f)));

async function matrix(rd, name, raw = false) {
  // int8 rows with one scale each (name_vec.npy + name_scale.npy), or float32 (name_emb.npy);
  // raw: the int8 codes and scales as they are, decoded row by row by the caller (11/26: the
  // phrase matrix decoded whole took 67 MB as float32 and 134 MB more as float64 on the phone)
  if (await rd.exists(`${name}_vec.npy`)) {
    const q = readNpy(await rd.bytes(`${name}_vec.npy`));
    const s = readNpy(await rd.bytes(`${name}_scale.npy`)).data;
    const [n, d] = q.shape;
    if (raw) return { codes: q.data, scale: s, n, d };
    const data = new Float32Array(n * d);
    for (let i = 0; i < n; i++) for (let k = 0; k < d; k++) data[i * d + k] = Math.fround(q.data[i * d + k] * s[i]);
    return { data, n, d };
  }
  const m = readNpy(await rd.bytes(`${name}_emb.npy`));
  return { data: m.data, n: m.shape[0], d: m.shape[1] };
}

/** opts.embed: your own query encoder (text -> Float32Array); opts.ort: the
 * onnxruntime-web module, needed only for an "onnx" encoder; opts.Tokenizer: the
 * @huggingface/tokenizers class (imported from ./vendor by default). */
export async function loadPackage(base, opts = {}) {
  const rd = await reader(base);
  const [config, program, venue] = await Promise.all([json(rd, "config.json"), json(rd, "program.json"), json(rd, "venue.json")]);
  const pkg = { config, program, venue };
  pkg.expansions = (await rd.exists("expansions.json")) ? await json(rd, "expansions.json") : null;
  pkg.clusters = (await rd.exists("clusters.json")) ? await json(rd, "clusters.json") : null;
  pkg.summaries = (await rd.exists("summaries.json")) ? await json(rd, "summaries.json") : null;
  // the Arc engine's finding cards and phrase vectors (angles.json, phrase_vec.npy)
  if (await rd.exists("angles.json")) {
    pkg.angles = await json(rd, "angles.json");
    pkg.phraseEmb = await matrix(rd, "phrase", true);
  }
  pkg.programEmb = await matrix(rd, "program");
  pkg.papers = await json(rd, "papers.json");
  const pos = new Map(program.map((it, i) => [it.id, i]));
  for (const p of pkg.papers) if (p.abstract === undefined) p.abstract = program[pos.get(p.id)].abstract;
  if (await rd.exists("paper_emb.npy")) pkg.paperEmb = await matrix(rd, "paper");
  else {
    // the papers are program items: take their rows of the program matrix
    const { d } = pkg.programEmb, n = pkg.papers.length;
    const data = new Float32Array(n * d);
    pkg.papers.forEach((p, i) => data.set(pkg.programEmb.data.subarray(pos.get(p.id) * d, (pos.get(p.id) + 1) * d), i * d));
    pkg.paperEmb = { data, n, d };
  }
  pkg.embed = opts.embed || await encoder(rd, config, opts);
  return pkg;
}

async function encoder(rd, config, opts) {
  const ecfg = (await rd.exists("encoder.json")) ? await json(rd, "encoder.json")
    : { kind: "onnx", file: "model_int8.onnx", query_prefix: config.query_prefix, max_len: config.max_len };
  const Tokenizer = opts.Tokenizer || (await import("./vendor/tokenizers.min.mjs")).Tokenizer;
  const tc = (await rd.exists("tokenizer_config.json")) ? await json(rd, "tokenizer_config.json") : {};
  const tok = new Tokenizer(await json(rd, "tokenizer.json"), tc);
  if (ecfg.kind === "static") {
    const tokens = readNpy(await rd.bytes(ecfg.tokens));
    const scales = readNpy(await rd.bytes(ecfg.scales)).data;
    const head = readNpy(await rd.bytes(ecfg.head));
    return staticEncoder(ecfg, tok, tokens, scales, head);
  }
  const ort = opts.ort || (await import("./vendor/ort.wasm.min.mjs"));
  return onnxEncoder(ecfg, tok, ort, new Uint8Array(await rd.bytes(ecfg.file)));
}

export async function loadRetriever(base, opts) {
  return new Retriever(await loadPackage(base, opts));
}

export async function loadExplorer(base, opts) {
  return new Explorer(await loadPackage(base, opts));
}

export async function loadARC(base, opts) {
  return new ARC(await loadPackage(base, opts));
}

export async function loadAngles(base, opts) {
  return new Angles(await loadPackage(base, opts));
}

export { Retriever, Explorer, ARC, Angles };
