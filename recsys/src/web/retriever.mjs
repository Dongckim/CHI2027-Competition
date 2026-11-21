// CHI 2026 paper retriever, in the browser or Node. A port of retriever.py: same
// request, same response, same ranking.
//
//   score = minmax(cosine) + hybrid_w * minmax(BM25)
//
// The query encoder is passed in (encoder.mjs); everything else is plain arrays.
import {
  W, InputError, isDigits, findWords, subNonWord, pySplit, pyDumps, pyRound, minmax, matvec, f32,
  argsortDesc, truthy,
} from "./py.mjs";

export { InputError };

export function parseRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new InputError('request must be a JSON object, e.g. {"research_topic": "haptic feedback", "top_k": 8}');
  }
  let topic = request.research_topic;
  if (topic === null || topic === undefined) throw new InputError("research_topic is required");
  topic = String(topic).trim();
  if (!topic) throw new InputError("research_topic must not be empty");
  let k = request.top_k;
  if (k === null || k === undefined) return [topic, 8];
  if (typeof k === "string" && isDigits(k.trim())) k = parseInt(k.trim(), 10);
  if (typeof k === "boolean" || typeof k !== "number" || !Number.isInteger(k)) {
    throw new InputError(`top_k must be a whole number, got ${pyDumps(k)}`);
  }
  if (k < 1) throw new InputError(`top_k must be at least 1, got ${k}`);
  return [topic, k];
}

// letters outside the Latin script (e.g. Korean)
export function nonLatin(text) {
  for (const ch of text) {
    if (/\p{L}/u.test(ch) && (!/\p{Script=Latin}/u.test(ch) || ch === "ª" || ch === "º")) return true;
  }
  return false;
}

// Okapi BM25 (k1=1.5, b=0.75, idf floor eps=0.25), numpy float32 arithmetic
export class BM25 {
  constructor(texts, k1 = 1.5, b = 0.75, eps = 0.25) {
    this.k1 = k1;
    this.b = b;
    const docs = texts.map((t) => findWords(t.toLowerCase()));
    this.n = docs.length;
    this.tf = docs.map((d) => {
      const c = new Map();
      for (const w of d) c.set(w, (c.get(w) || 0) + 1);
      return c;
    });
    this.len = Float32Array.from(docs, (d) => d.length);
    let total = 0;
    for (const l of this.len) total += l;
    this.avgdl = f32(total / docs.length);
    const df = new Map();
    for (const t of this.tf) for (const w of t.keys()) df.set(w, (df.get(w) || 0) + 1);
    const idf = new Map();
    let sum = 0;
    for (const [w, c] of df) {
      const v = Math.log(this.n - c + 0.5) - Math.log(c + 0.5);
      idf.set(w, v);
      sum += v;
    }
    const floor = eps * sum / idf.size;
    this.idf = new Map();
    for (const [w, v] of idf) this.idf.set(w, v >= 0 ? v : floor);
    const post = new Map();
    this.tf.forEach((t, i) => {
      for (const [w, c] of t) {
        if (!post.has(w)) post.set(w, [[], []]);
        post.get(w)[0].push(i);
        post.get(w)[1].push(c);
      }
    });
    this.post = post;
    // k1 * (1 - b + b * len / avgdl), each step in float32
    const bb = f32(b), one_b = f32(1 - b), k = f32(k1);
    this.norm = Float32Array.from(this.len, (l) => f32(k * f32(one_b + f32(f32(bb * l) / this.avgdl))));
  }

  has(w) {
    return this.idf.has(w);
  }

  scores(query) {
    const s = new Float32Array(this.n);
    const k1p = f32(this.k1 + 1);
    for (const w of findWords(query.toLowerCase())) {
      const p = this.post.get(w);
      if (!p) continue;
      const idf = f32(this.idf.get(w));
      const [d, f] = p;
      for (let x = 0; x < d.length; x++) {
        const i = d[x], fx = f[x];
        s[i] = f32(s[i] + f32(f32(f32(idf * fx) * k1p) / f32(fx + this.norm[i])));
      }
    }
    return s;
  }
}

// edit distance with swaps of two neighbouring letters; above cap -> cap + 1
function osa(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i, ...new Array(b.length).fill(0)];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
    }
    if (Math.min(...cur) > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[prev.length - 1];
}

/** Typos fixed against the words the program uses (retriever.py Speller). */
export class Speller {
  constructor(bm25) {
    this.vocab = bm25.idf;
    this.byFirst = new Map();
    for (const [w, [d]] of bm25.post) {
      const cs = Array.from(w);
      if (d.length >= 2 && /^\p{L}+$/u.test(w) && cs.length >= 3) {
        if (!this.byFirst.has(cs[0])) this.byFirst.set(cs[0], []);
        this.byFirst.get(cs[0]).push([w, cs, d.length]);
      }
    }
    this.cache = new Map();
  }

  word(w) {
    if (!this.cache.has(w)) {
      const cs = Array.from(w);
      const cap = cs.length <= 5 ? 1 : 2;
      let best = null;
      for (const [c, ccs, df] of this.byFirst.get(cs[0]) || []) {
        const d = osa(cs, ccs, cap);
        if (d <= cap && (best === null || d < best[0] || (d === best[0] && (df > best[1] || (df === best[1] && c < best[2]))))) {
          best = [d, df, c];
        }
      }
      this.cache.set(w, best ? best[2] : w);
    }
    return this.cache.get(w);
  }

  fix(text) {
    return text.replace(new RegExp(`[${W}]+`, "gu"), (w) => {
      const lw = w.toLowerCase();
      if (Array.from(lw).length < 4 || !/^\p{L}+$/u.test(lw) || this.vocab.has(lw) || STOP.has(lw)) return w;
      // a word with no closer program word keeps its own spelling ("ChatGPT", "VR에서")
      const c = this.word(lw);
      return c === lw ? w : c;
    });
  }
}

// words that never make a keyword on their own ("I study ... for ...")
export const STOP = new Set(`a an the and or but nor of to in on at by for with from into onto about
across among between through during over under within without via per as is are was
were be been being am do does did i we me my our us you your they their them it its
this that these those which who whom what when where why how not no yes so than then
very more most less least much many some any each every all both either neither such
can could would should may might must will shall also just only own same other another
study studies studying studied research researching researcher researchers work
works working explore exploring explores investigate investigating investigates
examine examining understand understanding interested interest focus focusing focused
look looking build building develop developing improve improving support supporting
help helping make making use using used new novel based towards toward e g eg etc
like want aim aims aiming paper papers thesis phd project projects area field topic
topics people human`.split(/\s+/));
const WORD = /[A-Za-z][A-Za-z0-9]*(?:[-'+][A-Za-z0-9]+)*/g;

export function norm(s) {
  return pySplit(subNonWord(s.toLowerCase().replaceAll("&", " and "))).join(" ");
}

// Python string offsets count code points, not UTF-16 units
function cp(text, i) {
  let n = 0;
  for (let k = 0; k < i; k++) {
    const c = text.charCodeAt(k);
    if (c < 0xdc00 || c > 0xdfff || k === 0 || text.charCodeAt(k - 1) < 0xd800 || text.charCodeAt(k - 1) > 0xdbff) n++;
  }
  return n;
}

/** Keywords of a sentence as the papers use them: split at stop words, then take the
 * longest phrase (up to 4 words) that at least two papers contain, or a single word
 * that is neither absent nor in more than 15% of papers.
 * -> [{keyword, start, end, talks}] with character offsets into text. */
export function keywordSpans(text, df, nDocs) {
  const runs = [];
  let cur = [];
  for (const m of text.matchAll(WORD)) {
    if (STOP.has(m[0].toLowerCase())) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push([m[0], m.index, m.index + m[0].length]);
  }
  if (cur.length) runs.push(cur);
  const found = [];
  for (const run of runs) {
    let i = 0;
    while (i < run.length) {
      let hit = false;
      for (let j = Math.min(run.length, i + 4); j > i; j--) {
        const ph = norm(run.slice(i, j).map((x) => x[0]).join(" "));
        const n = df(ph);
        if ((j - i > 1 && n >= 2) || (j - i === 1 && n >= 1 && n <= 0.15 * nDocs)) {
          const a = run[i][1], b = run[j - 1][2];
          found.push({ keyword: text.slice(a, b), start: cp(text, a), end: cp(text, b), talks: n });
          i = j;
          hit = true;
          break;
        }
      }
      if (!hit) i += 1;
    }
  }
  return found;
}

// expansions.json (doc2query search phrases per paper id) -> one list per item
export function expansionLists(byId, items) {
  if (!byId) return null;
  return items.map((it) => byId[String(it.id)] || []);
}

/** The hybrid score and the relevance check (retriever.py's Ranker with the settings
 * that ship: no aspect pass, no MMR). */
export class Ranker {
  constructor(emb, texts, embed, cfg, expansions = null) {
    this.emb = emb;            // {data: Float32Array, n, d}
    this.embed = embed;
    this.cfg = cfg;
    this.bm25 = new BM25(texts);
    this.bm25x = expansions ? new BM25(expansions.map((e) => e.join(" ; "))) : null;
    this.normed = texts.map((t) => " " + norm(t) + " ");
    this._df = new Map();
    this.speller = new Speller(this.bm25);
  }

  df(phrase) {
    if (!this._df.has(phrase)) {
      const pat = ` ${phrase} `;
      this._df.set(phrase, this.normed.reduce((s, t) => s + (t.includes(pat) ? 1 : 0), 0));
    }
    return this._df.get(phrase);
  }

  aspects(query, cap = 4) {
    const spans = keywordSpans(query, (p) => this.df(p), this.normed.length);
    const seen = [];
    for (const sp of spans) {
      if (!seen.some(([x]) => norm(x) === norm(sp.keyword))) seen.push([sp.keyword, sp.talks]);
    }
    if (seen.length < 2) return [];
    const keep = new Set([...seen].sort((a, b) => a[1] - b[1]).slice(0, cap).map((x) => x[0]));
    return seen.filter(([k]) => keep.has(k)).map(([k]) => k);
  }

  sims(vec) {
    return matvec(this.emb.data, this.emb.n, this.emb.d, vec);
  }

  async parts(query, withAspects = true) {
    const asp = withAspects ? this.aspects(query) : [];
    const sim = this.sims(await this.embed(query));
    const a = minmax(sim), b = minmax(this.bm25.scores(query));
    const w = f32(this.cfg.hybrid_w);
    const base = Float32Array.from(a, (x, i) => f32(x + f32(w * b[i])));
    if (this.bm25x && truthy(this.cfg.expansion_w)) {
      const x = minmax(this.bm25x.scores(query)), wx = f32(this.cfg.expansion_w);
      for (let i = 0; i < base.length; i++) base[i] = f32(base[i] + f32(wx * x[i]));
    }
    let per = null;
    if (asp.length) per = asp.map((q) => minmax(this.bm25.scores(q)));
    return { sim, base, asp, per };
  }

  async rank(query) {
    const aw = this.cfg.aspect_w ?? 0;
    const fixed = this.speller.fix(query);
    const { sim, base, asp, per } = await this.parts(fixed, truthy(aw));
    let score = base;
    if (per && aw) {
      score = Float32Array.from(base, (x, i) => f32(x + f32(f32(aw) * Math.min(...per.map((r) => r[i])))));
    }
    if ((this.cfg.mmr_lambda ?? 1) < 1) throw new Error("mmr_lambda < 1 is not ported (it ships off)");
    const order = argsortDesc(score);
    let top = -Infinity;
    for (const v of sim) if (v > top) top = v;
    const [low, p] = relevance(this.cfg, sim, this.bm25, fixed);
    const info = { aspects: asp, top_similarity: pyRound(top, 4), low_relevance: low, on_topic: p,
                   corrected: fixed !== query ? fixed : null };
    return { order, score, sim, info };
  }
}

/** Does CHI cover this topic at all? -> [low, on_topic probability or null]. With
 * cfg.relevance a logistic regression over five signals (scripts/train_relevance.py),
 * otherwise the best cosine against relevance_floor. */
export function relevance(cfg, sim, bm25, query) {
  const r = cfg.relevance;
  if (!r) {
    let top = -Infinity;
    for (const v of sim) if (v > top) top = v;
    const floor = cfg.relevance_floor;
    return [floor !== null && floor !== undefined && top < floor, null];
  }
  const t = Float32Array.from(sim).sort().reverse();
  const words = findWords(query.toLowerCase()).filter((w) => !STOP.has(w));
  const known = words.filter((w) => bm25.idf.has(w));
  let bmax = -Infinity;
  for (const v of bm25.scores(query)) if (v > bmax) bmax = v;
  const f = [t[0], f32(t[0] - t[Math.min(19, t.length - 1)]), Math.log1p(bmax),
             words.length ? known.length / words.length : 0,
             known.length ? known.reduce((s, w) => s + bm25.idf.get(w), 0) / known.length / Math.log(bm25.n) : 0];
  let z = 0;
  r.w.forEach((w, k) => { z += w * f[k]; });
  const p = 1 / (1 + Math.exp(-(z + r.b)));
  return [p < r.threshold, pyRound(p, 4)];
}

/** pkg: {config, papers, program, expansions, paperEmb: {data, n, d}, embed} */
export class Retriever {
  constructor(pkg) {
    this.embed = pkg.embed;
    this.cfg = pkg.config;
    this.papers = pkg.papers;
    this.emb = pkg.paperEmb;
    let texts = this.papers.map((p) => `${p.title}. ${p.abstract}`);
    let expansions = expansionLists(pkg.expansions, this.papers);
    if (expansions && (this.cfg.expansion_mode ?? "combined") === "combined") {
      texts = texts.map((t, i) => `${t} ; ${expansions[i].join(" ; ")}`);
      expansions = null;
    }
    this.ranker = new Ranker(this.emb, texts, this.embed, this.cfg, expansions);
    this.bm25 = this.ranker.bm25;
    this.sameTalk = new Map();
    this.papers.forEach((p, i) => {
      const key = p.title.trim().toLowerCase();
      if (!this.sameTalk.has(key)) this.sameTalk.set(key, []);
      this.sameTalk.get(key).push(i);
    });
    this.affil = new Map();
    for (const it of pkg.program || []) {
      const afs = it.authors.flatMap((a) => a.affiliations);
      this.affil.set(it.id, [[...new Set(afs.map((af) => af.institution).filter(Boolean))],
                             [...new Set(afs.map((af) => af.country).filter(Boolean))]]);
    }
  }

  async predict(request) {
    let [topic, k] = parseRequest(request);
    k = Math.min(k, this.sameTalk.size);
    const warnings = [];
    if (nonLatin(topic)) {
      warnings.push("The model understands English only; non-English words are ignored and results may be unrelated.");
    } else if (!findWords(this.ranker.speller.fix(topic).toLowerCase()).some((w) => this.bm25.has(w))) {
      warnings.push("None of the query words appear in any paper; results rest on meaning alone and may be unrelated.");
    }
    const t0 = performance.now();
    const { order, score, sim, info } = await this.ranker.rank(topic);
    if (info.low_relevance && !warnings.length) {
      warnings.push("No paper is close to this topic in meaning; CHI 2026 may not cover it, so these are only the nearest papers.");
    }
    const results = [], seen = new Set();
    for (const i of order) {
      const p = this.papers[i];
      const key = p.title.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const also = this.sameTalk.get(key).filter((j) => j !== i).map((j) => {
        const q = this.papers[j];
        return { room: q.room, session: q.session, start: q.start, end: q.end };
      });
      const af = this.affil.get(p.id) || [[], []];
      results.push({
        rank: results.length + 1, id: p.id, title: p.title, type: p.type,
        score: pyRound(score[i], 4), similarity: pyRound(sim[i], 4),
        authors: p.authors, track: p.track, session: p.session, room: p.room,
        floor: p.floor, start: p.start, end: p.end, doi: p.doi,
        institutions: af[0], countries: af[1], also_at: also,
      });
      if (results.length === k) break;
    }
    return {
      query: topic, corrected: info.corrected, top_k: results.length,
      latency_ms: pyRound(performance.now() - t0, 1),
      warnings, aspects: info.aspects,
      relevance: { top_similarity: info.top_similarity, floor: this.cfg.relevance_floor ?? null,
                   on_topic: info.on_topic, low: info.low_relevance },
      results,
    };
  }
}
