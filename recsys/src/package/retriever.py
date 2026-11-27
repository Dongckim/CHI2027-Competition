#!/usr/bin/env python3
"""CHI 2026 paper retriever — offline, CPU-only inference.

Input  (JSON): {"research_topic": "privacy in wearable cameras", "top_k": 8}
Output (JSON): {"query": ..., "top_k": 8, "latency_ms": 41.2, "warnings": [],
                "results": [{"rank": 1, "id": 223109, "title": ..., "type": "Paper",
                             "score": 0.71, "similarity": 0.52, "authors": [...],
                             "track": ..., "session": ..., "room": ..., "floor": ...,
                             "start": ..., "end": ..., "doi": ...,
                             "also_at": [{"room", "session", "start", "end"}]}, ...]}
"also_at" lists other session slots of the same talk (a few are presented twice).
"warnings" is non-empty when the query is not English or shares no word with any
paper (results are then likely unrelated).
A malformed request prints {"error": "..."} and exits with code 2.

How it ranks: a small query encoder (encoder.json) embeds the query into the space
of a fine-tuned bge-m3 teacher, whose paper vectors are precomputed (program_vec.npy,
int8; papers are rows of the program).
The cosine similarity is blended with BM25 keyword scores:
    score = minmax(cosine) + hybrid_w * minmax(BM25)
"similarity" is the raw cosine; "score" is the blended value used for ranking.

Needs only: numpy, tokenizers (+ onnxruntime for a transformer encoder). No GPU, no internet.

  python retriever.py '{"research_topic": "haptic feedback", "top_k": 8}'
  echo '{"research_topic": "LLMs for accessibility"}' | python retriever.py
  python retriever.py                  # interactive: type topics, see the top 8
"""
import json
import math
import os
import re
import sys
import time
import unicodedata
from collections import Counter

import numpy as np
from tokenizers import Tokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
_TOKEN = re.compile(r"\w+")


class InputError(ValueError):
    """Bad request; the CLI turns it into {"error": ...} with exit code 2."""


def parse_request(request):
    """Validate {"research_topic": str, "top_k": int} -> (topic, top_k)."""
    if not isinstance(request, dict):
        raise InputError("request must be a JSON object, e.g. "
                         '{"research_topic": "haptic feedback", "top_k": 8}')
    topic = request.get("research_topic")
    if topic is None:
        raise InputError("research_topic is required")
    topic = str(topic).strip()
    if not topic:
        raise InputError("research_topic must not be empty")
    k = request.get("top_k")
    if k is None:
        return topic, 8
    if isinstance(k, str) and k.strip().isdigit():
        k = int(k)
    elif isinstance(k, float) and k.is_integer():
        k = int(k)
    if isinstance(k, bool) or not isinstance(k, int):
        raise InputError(f"top_k must be a whole number, got {json.dumps(k)}")
    if k < 1:
        raise InputError(f"top_k must be at least 1, got {k}")
    return topic, k


def _non_latin(text):
    """True if the text has letters outside the Latin script (e.g. Korean)."""
    return any(ch.isalpha() and not unicodedata.name(ch, "").startswith("LATIN")
               for ch in text)


class BM25:
    """Okapi BM25 (k1=1.5, b=0.75, idf floor eps=0.25), same as rank_bm25."""

    def __init__(self, texts, k1=1.5, b=0.75, eps=0.25):
        docs = [_TOKEN.findall(t.lower()) for t in texts]
        self.k1, self.b = k1, b
        self.tf = [Counter(d) for d in docs]
        self.len = np.array([len(d) for d in docs], dtype=np.float32)
        self.avgdl = float(self.len.mean())
        df = Counter(w for t in self.tf for w in t)
        n = len(docs)
        idf = {w: math.log(n - c + 0.5) - math.log(c + 0.5) for w, c in df.items()}
        floor = eps * sum(idf.values()) / len(idf)
        self.idf = {w: (v if v >= 0 else floor) for w, v in idf.items()}
        # postings: word -> (documents that have it, how often), so a query word
        # touches only those documents instead of all 2,509
        post = {}
        for i, t in enumerate(self.tf):
            for w, c in t.items():
                post.setdefault(w, ([], []))
                post[w][0].append(i)
                post[w][1].append(c)
        self.post = {w: (np.array(d, dtype=np.int32), np.array(c, dtype=np.float32))
                     for w, (d, c) in post.items()}
        self.norm = self.k1 * (1 - self.b + self.b * self.len / self.avgdl)

    def scores(self, query):
        s = np.zeros(len(self.tf), dtype=np.float32)
        for w in _TOKEN.findall(query.lower()):
            if w not in self.post:
                continue
            d, f = self.post[w]
            s[d] += self.idf[w] * f * (self.k1 + 1) / (f + self.norm[d])
        return s


def _osa(a, b, cap):
    """Edit distance with swaps of two neighbouring letters ("hapitc" -> "haptic" is 1);
    anything above cap comes back as cap + 1."""
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev2, prev = None, list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        if min(cur) > cap:
            return cap + 1
        prev2, prev = prev, cur
    return prev[-1]


# endings stripped to find a word's stem in the encoder's word list ("caching" -> cache)
_ENDINGS = ("ings", "ing", "ed", "es", "s", "ers", "er", "ly", "ness", "ments", "ment", "ations", "ation", "ity")


def word_list(root):
    """The whole words of the query encoder's WordPiece vocabulary (tokenizer.json): an
    English word list that ships anyway (20,365 of 4+ letters)."""
    path = os.path.join(root, "tokenizer.json")
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8") as f:
        vocab = json.load(f)["model"]["vocab"]
    return {w for w in vocab if w.isalpha() and not w.startswith("##") and len(w) >= 3}


def known_word(w, words):
    """An English word, if not a CHI one: in the word list as it is, or its stem is
    ("caching": cache, "passwords": password, "embedding": embed)."""
    if w in words:
        return True
    for e in _ENDINGS:
        if w.endswith(e) and len(w) - len(e) >= 3:
            b = w[:-len(e)]
            if b in words or b + "e" in words or (len(b) >= 4 and b[-1] == b[-2] and b[:-1] in words):
                return True
    return False


class Speller:
    """Typos in the query, fixed against the words the program itself uses: a word no
    paper contains (4+ letters, not a stop word) becomes the closest program word that
    starts with the same letter and is in at least 2 papers (1 edit for 4-5 letters,
    2 for longer; ties go to the more common word). No model, just the keyword index.
    An English word no talk uses is left alone (11/27: "KV caching" became "KV coaching"),
    by the encoder's own word list (`words`, word_list)."""

    def __init__(self, bm25, words=None):
        self.words = words or set()
        self.vocab = bm25.idf
        self.by_first = {}
        for w, (d, _) in bm25.post.items():
            if len(d) >= 2 and w.isalpha() and len(w) >= 3:
                self.by_first.setdefault(w[0], []).append((w, len(d)))
        self.cache = {}

    def word(self, w):
        if w not in self.cache:
            cap = 1 if len(w) <= 5 else 2
            best = None
            for c, df in self.by_first.get(w[0], []):
                d = _osa(w, c, cap)
                if d <= cap and (best is None or (d, -df, c) < best):
                    best = (d, -df, c)
            self.cache[w] = best[2] if best else w
        return self.cache[w]

    def __call__(self, text):
        def fix(m):
            w = m.group(0)
            lw = w.lower()
            if len(lw) < 4 or not lw.isalpha() or lw in self.vocab or lw in STOP or known_word(lw, self.words):
                return w
            # a word with no closer program word keeps its own spelling ("ChatGPT", "VR에서")
            c = self.word(lw)
            return w if c == lw else c
        return _TOKEN.sub(fix, text)


def _minmax(x):
    return (x - x.min()) / (x.max() - x.min() + 1e-9)


# words that never make a keyword on their own ("I study ... for ...")
STOP = set("""a an the and or but nor of to in on at by for with from into onto about
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
topics people human""".split())
_WORD = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:[-'+][A-Za-z0-9]+)*")


def _norm(s):
    return " ".join(re.sub(r"[^\w]+", " ", s.lower().replace("&", " and ")).split())


def keyword_spans(text, df, n_docs):
    """Keywords of a sentence as the papers use them: split at stop words, then take
    the longest phrase (up to 4 words) that at least two papers contain, or a single
    word that is neither absent nor in more than 15% of papers.
    -> [{"keyword", "start", "end", "talks"}] with character offsets into text."""
    runs, cur = [], []
    for m in _WORD.finditer(text):
        if m.group(0).lower() in STOP:
            if cur:
                runs.append(cur)
            cur = []
        else:
            cur.append((m.group(0), m.start(), m.end()))
    if cur:
        runs.append(cur)
    found = []
    for run in runs:
        i = 0
        while i < len(run):
            for j in range(min(len(run), i + 4), i, -1):
                ph = _norm(" ".join(w for w, _, _ in run[i:j]))
                n = df(ph)
                if (j - i > 1 and n >= 2) or (j - i == 1 and 1 <= n <= 0.15 * n_docs):
                    found.append({"keyword": text[run[i][1]:run[j - 1][2]],
                                  "start": run[i][1], "end": run[j - 1][2], "talks": n})
                    i = j
                    break
            else:
                i += 1
    return found


def load_expansions(root, items):
    """expansions.json (doc2query search phrases per paper id) -> one list per item,
    or None when the file is not there."""
    path = os.path.join(root, "expansions.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        by_id = json.load(f)
    return [by_id.get(str(it["id"]), []) for it in items]


class Ranker:
    """A second pass over the hybrid score that adds no model and no server, only the
    vectors already on the device:

    - aspects: a query with several topics ("kids and screen time") gets each topic
      scored on its own, and papers covering all of them move up
      (score + aspect_w * the weakest aspect score). aspect_mode "keyword" scores
      each aspect with BM25 only, no extra model call;
    - diversity: among the top `pool`, maximal marginal relevance keeps near-copies
      of one paper from filling the list (mmr_lambda 1.0 = off);
    - relevance: when even the best paper is far from the query in meaning
      (raw cosine under relevance_floor), CHI may not cover the topic.
    """

    def __init__(self, emb, texts, embed, cfg, expansions=None, words=None):
        self.emb, self.embed, self.cfg = emb, embed, cfg
        self.bm25 = BM25(texts)
        # expansion_mode "separate": the papers' search phrases (doc2query) as their
        # own keyword index weighted by expansion_w ("combined", the default, folds
        # them into texts before this point)
        self.bm25x = BM25([" ; ".join(e) for e in expansions]) if expansions else None
        self.normed = [" " + _norm(t) + " " for t in texts]
        self._df = {}
        self.speller = Speller(self.bm25, words)

    def df(self, phrase):
        if phrase not in self._df:
            pat = f" {phrase} "
            self._df[phrase] = sum(pat in t for t in self.normed)
        return self._df[phrase]

    def aspects(self, query, cap=4):
        """Distinct keywords of the query; at most `cap`, the rarest (most specific)."""
        spans, seen = keyword_spans(query, self.df, len(self.normed)), []
        for sp in spans:
            k = sp["keyword"]
            if _norm(k) not in [_norm(x) for x, _ in seen]:
                seen.append((k, sp["talks"]))
        if len(seen) < 2:
            return []
        keep = {k for k, _ in sorted(seen, key=lambda x: x[1])[:cap]}
        return [k for k, _ in seen if k in keep]

    def _hybrid(self, vec, text):
        return _minmax(self.emb @ vec) + self.cfg["hybrid_w"] * _minmax(self.bm25.scores(text))

    def parts(self, query, with_aspects=True, mode=None):
        """Everything a ranking needs, computed once: raw cosine, hybrid score,
        and one score row per aspect (None when the query has < 2 aspects).
        mode "keyword" scores aspects with BM25 only (no extra model call);
        "hybrid" also embeds each aspect (more accurate, ~4x slower)."""
        mode = mode or self.cfg.get("aspect_mode", "keyword")
        asp = self.aspects(query) if with_aspects else []
        # the query is always embedded on its own: the int8 model scales activations
        # per batch, so batching it with the aspects shifts its vector (R@8 -0.005)
        sim = self.emb @ self.embed(query)
        base = _minmax(sim) + self.cfg["hybrid_w"] * _minmax(self.bm25.scores(query))
        if self.bm25x is not None and self.cfg.get("expansion_w"):
            base = base + self.cfg["expansion_w"] * _minmax(self.bm25x.scores(query))
        per = None
        if asp and mode == "hybrid":
            vecs = self.embed.many(asp)
            per = np.stack([self._hybrid(v, a) for v, a in zip(vecs, asp)])
        elif asp:
            per = np.stack([_minmax(self.bm25.scores(a)) for a in asp])
        return sim, base, asp, per

    def order(self, base, per, aspect_w, mmr_lambda, pool=50):
        score = base + aspect_w * per.min(0) if (per is not None and aspect_w) else base
        order = np.argsort(-score, kind="stable")
        if mmr_lambda < 1.0:
            top = order[:pool]
            rel = _minmax(score[top])
            pair = self.emb[top] @ self.emb[top].T
            picked, left = [], list(range(len(top)))
            while left:
                if picked:
                    red = pair[np.ix_(left, picked)].max(1)
                    j = left[int(np.argmax(mmr_lambda * rel[left] - (1 - mmr_lambda) * red))]
                else:
                    j = left[int(np.argmax(rel[left]))]
                picked.append(j)
                left.remove(j)
            order = np.concatenate([top[picked], order[pool:]])
        return order, score

    def rank(self, query, aspect_w=None, mmr_lambda=None, pool=50):
        """-> (order of all paper indices, final score, raw cosine, info)."""
        aw = self.cfg.get("aspect_w", 0.0) if aspect_w is None else aspect_w
        ml = self.cfg.get("mmr_lambda", 1.0) if mmr_lambda is None else mmr_lambda
        fixed = self.speller(query)
        sim, base, asp, per = self.parts(fixed, with_aspects=bool(aw))
        order, score = self.order(base, per, aw, ml, pool)
        low, p = relevance(self.cfg, sim, self.bm25, fixed)
        info = {"aspects": asp, "top_similarity": round(float(sim.max()), 4),
                "low_relevance": low, "on_topic": p, "corrected": fixed if fixed != query else None}
        return order, score, sim, info


def relevance(cfg, sim, bm25, query):
    """Does CHI cover this topic at all? -> (low, on_topic probability or None).

    With cfg["relevance"] (the light encoder) a logistic regression over five signals the
    ranking already has (scripts/train_relevance.py): the best cosine, how far it stands
    above the 20th, the best BM25 score, the share of the query's content words found in
    the program and how specific they are. Without it: best cosine < relevance_floor."""
    r = cfg.get("relevance")
    if not r:
        floor = cfg.get("relevance_floor")
        return bool(floor is not None and float(sim.max()) < floor), None
    t = np.sort(sim)[::-1]
    words = [w for w in _TOKEN.findall(query.lower()) if w not in STOP]
    known = [w for w in words if w in bm25.idf]
    f = [float(t[0]), float(t[0] - t[min(19, len(t) - 1)]), math.log1p(float(bm25.scores(query).max())),
         len(known) / len(words) if words else 0.0,
         sum(bm25.idf[w] for w in known) / len(known) / math.log(len(bm25.tf)) if known else 0.0]
    p = 1 / (1 + math.exp(-(sum(w * x for w, x in zip(r["w"], f)) + r["b"])))
    return p < r["threshold"], round(p, 4)


def load_matrix(root, name):
    """Vectors as float32: int8 rows with one scale each (name_vec.npy + name_scale.npy),
    or plain float32 (name_emb.npy)."""
    q = os.path.join(root, f"{name}_vec.npy")
    if os.path.exists(q):
        return np.load(q).astype(np.float32) * np.load(os.path.join(root, f"{name}_scale.npy"))[:, None]
    return np.load(os.path.join(root, f"{name}_emb.npy"))


def load_program(root, ids):
    """The program vectors lined up with program.json's items by id (program_ids.json: the
    item id of each row, written when the vectors were made). A live programme feed adds,
    drops and reorders items; matching rows by position would hand every later talk the
    vector of another (11/26). An item with no vector gets zeros: keywords still find it.
    Without program_ids.json the row count must equal the item count."""
    m = load_matrix(root, "program")
    path = os.path.join(root, "program_ids.json")
    if not os.path.exists(path):
        if m.shape[0] != len(ids):
            raise ValueError(f"program vectors have {m.shape[0]} rows for {len(ids)} items in program.json; "
                             "repackage (scripts/package_model.py)")
        return m
    with open(path, encoding="utf-8") as f:
        row = {int(x): r for r, x in enumerate(json.load(f))}
    out = np.zeros((len(ids), m.shape[1]), dtype=m.dtype)
    for i, x in enumerate(ids):
        r = row.get(int(x))
        if r is not None:
            out[i] = m[r]
    return out


class QueryEncoder:
    """A query string -> a vector in the paper-vector space.

    encoder.json "static": no transformer, one int8 vector per WordPiece token,
    averaged, then a small head matrix (needs only numpy + tokenizers). Otherwise the
    transformer student, model_int8.onnx (onnxruntime)."""

    def __init__(self, root=HERE, threads=4):
        with open(os.path.join(root, "config.json"), encoding="utf-8") as f:
            self.cfg = json.load(f)
        self.tok = Tokenizer.from_file(os.path.join(root, "tokenizer.json"))
        path = os.path.join(root, "encoder.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self.enc = json.load(f)
        else:
            self.enc = {"kind": "onnx", "file": "model_int8.onnx",
                        "query_prefix": self.cfg["query_prefix"], "max_len": self.cfg["max_len"]}
        if self.enc["kind"] == "static":
            self.E = (np.load(os.path.join(root, self.enc["tokens"])).astype(np.float32)
                      * np.load(os.path.join(root, self.enc["scales"]))[:, None])
            self.H = np.load(os.path.join(root, self.enc["head"])).astype(np.float32)
            return
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(os.path.join(root, self.enc["file"]), so,
                                         providers=["CPUExecutionProvider"])

    def _ids(self, text):
        ids = self.tok.encode(self.enc["query_prefix"] + text).ids
        if len(ids) > self.enc["max_len"]:  # keep the closing [SEP]
            ids = ids[: self.enc["max_len"] - 1] + ids[-1:]
        return ids

    def _static(self, text):
        ids = self.tok.encode(text, add_special_tokens=False).ids[: self.enc["max_len"]]
        if not ids:
            return np.zeros(self.H.shape[1], dtype=np.float32)
        v = self.E[ids].mean(0) @ self.H
        return v / np.linalg.norm(v)

    def __call__(self, text):
        return self.many([text])[0]

    def many(self, texts):
        """Several queries -> (n, dim). The int8 transformer quantizes per batch, so its
        vectors differ slightly from one-by-one calls; the static encoder does not."""
        if self.enc["kind"] == "static":
            return np.stack([self._static(t) for t in texts])
        rows = [self._ids(t) for t in texts]
        n = max(len(r) for r in rows)
        ids = np.zeros((len(rows), n), dtype=np.int64)
        mask = np.zeros((len(rows), n), dtype=np.int64)
        for i, r in enumerate(rows):
            ids[i, :len(r)], mask[i, :len(r)] = r, 1
        return self.sess.run(None, {"input_ids": ids, "attention_mask": mask})[0]


class Retriever:
    def __init__(self, root=HERE, threads=4):
        self.embed = QueryEncoder(root, threads)
        self.cfg = self.embed.cfg
        with open(os.path.join(root, "papers.json"), encoding="utf-8") as f:
            self.papers = json.load(f)
        program = []
        path = os.path.join(root, "program.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                program = json.load(f)
        # papers are program items: a slim papers.json takes the abstract and the
        # vector of the same item in program.json (one copy of each on the phone)
        pos = {it["id"]: i for i, it in enumerate(program)}
        # a paper the live programme no longer lists is dropped (its abstract and vector are gone)
        if program:
            self.papers = [p for p in self.papers if p["id"] in pos]
        for p in self.papers:
            if "abstract" not in p:
                p["abstract"] = program[pos[p["id"]]]["abstract"]
        if os.path.exists(os.path.join(root, "paper_emb.npy")):
            self.emb = np.load(os.path.join(root, "paper_emb.npy"))
        else:
            self.emb = load_program(root, [it["id"] for it in program])[[pos[p["id"]] for p in self.papers]]
        texts = [f"{p['title']}. {p['abstract']}" for p in self.papers]
        expansions = load_expansions(root, self.papers)
        if expansions and self.cfg.get("expansion_mode", "combined") == "combined":
            # the papers' search phrases join their title + abstract in one keyword index
            texts = [f"{t} ; {' ; '.join(e)}" for t, e in zip(texts, expansions)]
            expansions = None
        self.ranker = Ranker(self.emb, texts, self.embed, self.cfg, expansions, word_list(root))
        self.bm25 = self.ranker.bm25
        # a few talks appear twice (same title, another session slot); group them
        # so one talk takes one top-k slot and its other slots are listed
        self.same_talk = {}
        for i, p in enumerate(self.papers):
            self.same_talk.setdefault(p["title"].strip().lower(), []).append(i)
        # institutions and countries of each paper's authors, so the app can filter the
        # results itself (the request carries only the research question)
        self.affil = {}
        for it in program:
            afs = [af for a in it["authors"] for af in a["affiliations"]]
            self.affil[it["id"]] = (
                list(dict.fromkeys(af["institution"] for af in afs if af["institution"])),
                list(dict.fromkeys(af["country"] for af in afs if af["country"])))

    def predict(self, request):
        """request: {"research_topic": str, "top_k": int (default 8)} -> dict.

        Raises InputError for a malformed request. top_k above the number of
        distinct talks is capped; the output's top_k is the count returned.
        """
        topic, k = parse_request(request)
        k = min(k, len(self.same_talk))
        warnings = []
        if _non_latin(topic):
            warnings.append("The model understands English only; non-English words "
                            "are ignored and results may be unrelated.")
        elif not any(w in self.bm25.idf for w in _TOKEN.findall(self.ranker.speller(topic).lower())):
            warnings.append("None of the query words appear in any paper; results "
                            "rest on meaning alone and may be unrelated.")
        t0 = time.perf_counter()
        order, score, sim, info = self.ranker.rank(topic)
        if info["low_relevance"] and not warnings:
            warnings.append("No paper is close to this topic in meaning; CHI 2026 may not "
                            "cover it, so these are only the nearest papers.")
        results, seen = [], set()
        for i in order:
            p = self.papers[i]
            key = p["title"].strip().lower()
            if key in seen:
                continue
            seen.add(key)
            also = [{f: self.papers[j][f] for f in ("room", "session", "start", "end")}
                    for j in self.same_talk[key] if j != i]
            results.append({"rank": len(results) + 1, "id": p["id"], "title": p["title"],
                            "type": p["type"], "score": round(float(score[i]), 4),
                            "similarity": round(float(sim[i]), 4),
                            **{f: p[f] for f in ("authors", "track", "session", "room",
                                                 "floor", "start", "end", "doi")},
                            "institutions": self.affil.get(p["id"], ([], []))[0],
                            "countries": self.affil.get(p["id"], ([], []))[1],
                            "also_at": also})
            if len(results) == k:
                break
        return {"query": topic, "corrected": info["corrected"], "top_k": len(results),
                "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                "warnings": warnings, "aspects": info["aspects"],
                "relevance": {"top_similarity": info["top_similarity"],
                              "floor": self.cfg.get("relevance_floor"),
                              "on_topic": info["on_topic"], "low": info["low_relevance"]},
                "results": results}


def _when(p):
    if not p.get("start"):
        return "time TBA"
    # "2026-04-16T13:15:00+02:00" -> "04-16 13:15" (Barcelona local time)
    return p["start"][5:10] + " " + p["start"][11:16]


def print_top(out):
    print(f"\nTop {out['top_k']} for \"{out['query']}\"  ({out['latency_ms']} ms)\n")
    for w in out["warnings"]:
        print(f"  ! {w}\n")
    for r in out["results"]:
        authors = ", ".join(r["authors"][:2]) + (" et al." if len(r["authors"]) > 2 else "")
        print(f"{r['rank']:>2}. {r['title']}")
        print(f"    {r['type']} · {authors}")
        print(f"    {r['room'] or 'room TBA'} · {_when(r)} · score {r['score']:.2f}")
        for a in r["also_at"]:
            print(f"    also: {a['room'] or 'room TBA'} · {_when(a)}")
        print()


def interactive(retriever):
    print("CHI 2026 paper recommender (offline). Type a research topic, or 'q' to quit.")
    while True:
        try:
            topic = input("\nresearch topic> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if topic.lower() in ("q", "quit", "exit"):
            return
        if topic:
            print_top(retriever.predict({"research_topic": topic, "top_k": 8}))


def main():
    # no input at a terminal -> interactive prompt; otherwise JSON in, JSON out
    if len(sys.argv) == 1 and sys.stdin.isatty():
        return interactive(Retriever())
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    try:
        try:
            req = json.loads(raw)
        except json.JSONDecodeError as e:
            raise InputError(f"input is not valid JSON ({e.msg} at position {e.pos})")
        parse_request(req)  # fail fast, before loading the model
        out = Retriever().predict(req)
    except InputError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(2)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
