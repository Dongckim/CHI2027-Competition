#!/usr/bin/env python3
"""Package the trained on-device retriever as a standalone model folder + zip.

  dist/chi2026-retriever/
    encoder.json       the query encoder (light: "static", see scripts/train_light.py)
    static_*.npy       its token vectors (int8), their scales and the head matrix
    tokenizer.json, tokenizer_config.json
    program_vec.npy    every program item's vector, int8 in the encoder's 128 dims
    program_ids.json   the item id of each of its rows (loaders line rows up by id)
    program_scale.npy  one scale per vector (papers are rows of the program)
    papers.json        paper metadata (results and BM25; abstracts come from program.json)
    summaries.json     one-line summary + 2 questions per item, written offline by an LLM
    web/               the same models in JavaScript for the phone's browser
    (CHI_LIGHT=0: model_int8.onnx + paper_emb.npy + program_emb.npy, 1,024-d float32)
    config.json        query prefix, max_len, hybrid weight, eval numbers
    retriever.py       JSON-in / JSON-out inference (numpy, onnxruntime, tokenizers)
    explorer.py        filter the whole program by institution, country, author, day
    arc.py             the ARC app's screen API (one JSON request per wireframe screen)
    angles.py          the Arc engine: Support / Reframe / Challenge around a question
    angles.json        finding cards per talk (offsets into program.json), tribes, labels,
                       debut authors; phrase_vec.npy + phrase_scale.npy: their phrase vectors
    venue.json         conference days, floors + map images, rooms, sponsors, sessions
    expansions.json    LLM-written search phrases per paper (doc2query), keyword index only
    clusters.json      20 topic clusters of the whole program (keywords, map x/y, names)
    program.json       all 2,782 program items with full affiliations and sessions
    arc_examples/      one request + response per ARC wireframe screen
    example_request.json, example_response.json, README.md
  dist/chi2026-retriever.zip

  CHI_RUN_TAG=_en python scripts/package_model.py     # English student (default)
"""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402

TAG = os.environ.get("CHI_RUN_TAG", "_en")
STUDENT = os.path.join(config.MODELS_DIR, "student" + TAG)
# the light encoder (scripts/train_light.py --deploy); CHI_LIGHT=0 packages the old one
LIGHT = os.path.join(config.MODELS_DIR, "student_light")
USE_LIGHT = os.environ.get("CHI_LIGHT", "1") != "0" and os.path.exists(os.path.join(LIGHT, "light_config.json"))
# files an earlier package may have left that this one may not write
STALE = ["model_int8.onnx", "paper_emb.npy", "program_emb.npy", "encoder.json", "static_tokens.npy",
         "static_scales.npy", "static_head.npy", "program_vec.npy", "program_scale.npy", "program_ids.json",
         "tokenizer_config.json", "summaries.json"]
NAME = "chi2026-retriever"
OUT = os.path.join(config.ROOT, "dist", NAME)

README = """# chi2026-retriever

Recommends CHI 2026 papers and posters for a research topic. Runs offline on CPU.

## Use

```bash
pip install numpy tokenizers        # + onnxruntime only for a transformer encoder
python retriever.py '{{"research_topic": "privacy in wearable cameras", "top_k": 8}}'
```

```python
from retriever import Retriever
r = Retriever()                      # loads once (~1 s)
r.predict({{"research_topic": "haptic feedback interfaces", "top_k": 8}})
```

**Input**: `{{"research_topic": str, "top_k": int = 8}}` (English)
**Output**: `{{"query", "top_k", "latency_ms", "results": [{{"rank", "id", "title", "type",
"score", "similarity", "authors", "track", "session", "room", "floor", "start", "end", "doi"}}]}}`
See `example_request.json` / `example_response.json`.

## Explorer: search the program by institution, country, author, day

```bash
python explorer.py '{{"institution": "postech"}}'
python explorer.py '{{"country": "korea", "day": "tuesday", "topic": "haptics", "top_k": 10}}'
python explorer.py                   # interactive: institution=postech topic=haptics
```

Covers all {n_program} program items (papers, posters, workshops, demos, panels).
Fields (all optional, at least one): `institution`, `country`, `author`, `type`, `day`,
`topic` (ranks matches by relevance), `top_k` (default 20), `sort` ("time" or "relevance").
Different spellings of an institution are grouped ("POSTECH" also finds
"Pohang University of Science and Technology"); the output lists which names were counted.

## ARC screen API: one request per app screen

```bash
python arc.py '{{"screen": "keywords", "research": "I study haptic feedback for VR"}}'
python arc.py '{{"screen": "route", "day": "tue", "profile": {{"research": "haptic feedback for VR", "pace": "balanced", "needs": ["step_free"]}}}}'
```

`screen` is one of `meta` (01-0, 02-x, 03-1), `keywords` (01-2), `nearby` (01-3), `days` (02-1),
`route` (03), `more` (03-2), `filters` (04), `search` (05), `paper` (06), `author` (07),
`wrapup` (08), `getting_there` (09), `clusters` (08 bubbles, map). The app keeps the user's answers (`profile`) and actions
(`state`: saved, attended, added, removed, opened authors) on the phone and sends them with
each request; the model keeps no state. `arc_examples/` has a request and response for each
screen. Bad input prints `{{"error": ...}}` and exits with code 2.

The route needs only the research question (`"profile": {{"research": "..."}}`). It also
returns the day's top 16 talks (`recommendations`, each with `institutions` and
`countries` so the app can filter them). A top-16 talk that is not in the route hangs
under the stop it clashes with, as a sub-node (`stops[n].alternatives`, with a `Swap`);
the rest fit the free time (03-2). `"planner": "best"` picks the set of talks with the
highest total score instead of the best talk first (default `greedy`).

## On the phone: the same models in JavaScript (`web/`)

The app is a web app, so everything above also runs in the phone's browser with no
server and no Python: `web/` is a port that reads these same files and answers the same
requests with the same responses (`tests/run_web_parity.mjs` checks every case).

```js
import {{ loadARC }} from "./web/load.mjs";
const arc = await loadARC("./");                       // the folder with these files
const out = await arc.handle({{screen: "route", day: "tue", profile: {{research: "haptics"}}}});
```

`loadRetriever` and `loadExplorer` work the same way (`predict(request)`). The query
encoder needs no model runtime (no onnxruntime, no WebAssembly), only the 36 KB tokenizer
in `web/vendor/`. Try it: `python -m http.server` in this folder, then open
`http://<this machine>:8000/web/` on a phone. From a terminal: `node web/cli.mjs arc '{{...}}'`,
`node web/cli.mjs bench`.

## Model

- Query encoder: {encoder_line}
- Paper vectors: fine-tuned bge-m3, {n} papers x {dim} dims, precomputed
- Ranking: `minmax(cosine) + {w} * minmax(BM25)`, then a second pass with no extra model:
  a query with several topics also gets each topic scored by keywords and papers that
  cover all of them move up (`aspect_w` in config.json), and a warning when even the best
  paper is far in meaning (`relevance_floor`). Output adds `aspects` and `relevance`.
- Keyword index: each paper's title + abstract plus ~8 search phrases an LLM wrote for it
  ahead of time (`expansions.json`, doc2query), so other wordings still match.
- Training labels: {n_queries} synthetic English research-topic queries (Qwen2.5-7B-Instruct)

## Held-out accuracy (English queries for 20% of papers unseen in training)

| | R@1 | R@8 |
|---|---|---|
| bge-m3 off the shelf (2.2 GB, server) | {base_r1} | {base_r8} |
| this model (hybrid) | {hyb_r1} | {hyb_r8} |

R@8 = the right paper is in the top 8. Evaluation queries are also LLM-generated, so
accuracy on real user queries may be lower.

## Licenses

| Files | License |
|---|---|
| Code (`*.py`, `web/*.mjs`), `encoder.json`, `static_*.npy`, `config.json` | MIT. The encoder is our own, distilled from a fine-tuned `BAAI/bge-m3` (MIT) |
| `tokenizer.json`, `tokenizer_config.json` | MIT, unchanged from `BAAI/bge-small-en-v1.5` (© BAAI) |
| `web/vendor/tokenizers.min.mjs` | Apache 2.0, the npm package `@huggingface/tokenizers`, bundled unchanged |
| `program.json`, `papers.json`, `venue.json`, `program_*.npy`, `program_ids.json` | CC BY-NC-SA 4.0: ACM CHI 2026 programme data, and vectors of its abstracts |
| `angles.json`, `phrase_*.npy`, `summaries.json`, `expansions.json`, `clusters.json` | CC BY-NC-SA 4.0, as derived from the programme data: finding cards and phrases quoted from the abstracts, and text written offline by `Qwen/Qwen3-14B` and `Qwen/Qwen2.5-7B-Instruct` (Apache 2.0, no claim on their outputs) |
"""


# test case -> example file name (wireframe number + screen)
ARC_EXAMPLES = {"A01": "01-0_meta", "A02": "01-2_keywords", "A06": "01-3_nearby",
                "A07": "02-1_days", "A08": "03_route", "A11": "03_route_overlap",
                "A13": "03_route_next", "A15": "03-2_more", "A16": "04_filters",
                "A18": "05_search", "A23": "06_paper", "A25": "07_author",
                "A27": "08_wrapup", "A28": "09_getting_there",
                # Figma v2 (10/23): states of the day screen and the new screens
                "A30": "v2_03_no_plan", "A31": "v2_03_not_attending", "A32": "v2_03_up_first",
                "A33": "v2_03_leave_now", "A34": "v2_03_now", "A35": "v2_03_other_day",
                "A36": "v2_03_day_done", "A37": "v2_03_removed", "A38": "v2_03-2_free_slot",
                "A39": "v2_03-2_nothing_fits", "A40": "v2_10_session_live",
                "A41": "v2_05_explore_filters", "A42": "v2_05_no_results",
                "A43": "v2_11_directions_from_desk",
                # 10/24 meeting: alternatives as sub-nodes, research question only, clusters
                "A44": "1024_route_alternatives", "A45": "1024_route_research_only",
                "A46": "1024_route_planner_best", "A47": "1024_clusters_for_you",
                "A49": "1024_cluster_detail",
                # 11/7 meeting and Figma v3 (11/09)
                "A50": "1107_route_choices_grades", "A51": "1107_start", "A56": "1107_plan_from_picks",
                "A58": "1107_subtopic", "A60": "v3_route_needs", "A61": "v3_now_card",
                "A62": "v3_09-1_places", "A63": "v3_11_questions"}


def rerank_cfg():
    """Second-pass settings chosen by scripts/eval_rerank.py (off if not run)."""
    p = os.path.join(config.ROOT, "docs", "rerank_report.json")
    if not os.path.exists(p):
        return {"aspect_w": 0.0, "aspect_mode": "keyword", "mmr_lambda": 1.0,
                "relevance_floor": None}
    r = json.load(open(p))
    out = {"aspect_w": r["chosen"]["aspect_w"], "aspect_mode": r["chosen"]["aspect_mode"],
           "mmr_lambda": r["chosen"]["mmr_lambda"], "relevance_floor": r["relevance"]["floor"]}
    # document expansion (scripts/eval_expansion.py) was chosen after the aspect pass
    # and decides aspect_w again, with the phrases in the index
    p2 = os.path.join(config.ROOT, "docs", "expansion_report.json")
    if os.path.exists(p2):
        mode, wx, aw = json.load(open(p2))["chosen"].split()
        out.update({"expansion_mode": mode, "expansion_w": float(wx[3:]),
                    "aspect_w": float(aw[9:])})
    return out


def write_light(np):
    """The light encoder and int8 paper vectors in its d dims: the PCA projection the
    encoder was trained with is applied to every program item's teacher vector."""
    lc = json.load(open(os.path.join(LIGHT, "light_config.json")))
    P = np.load(os.path.join(LIGHT, "projection.npy"))
    rep = json.load(open(os.path.join(config.ROOT, "docs", "light_report.json")))["chosen"]
    enc = {"kind": "static" if lc["variant"].startswith("static") else "onnx", "variant": lc["variant"],
           "dim": lc["dim"], "query_prefix": lc["query_prefix"], "max_len": lc["max_len"]}
    if enc["kind"] == "static":
        z = np.load(os.path.join(LIGHT, "static.npz"))
        for k in ("tokens", "scales", "head"):
            np.save(os.path.join(OUT, f"static_{k}.npy"), np.ascontiguousarray(z[k]))
            enc[k] = f"static_{k}.npy"
        files = [enc["tokens"], enc["scales"], enc["head"]]
    else:
        shutil.copy(os.path.join(LIGHT, "model_int8.onnx"), OUT)
        enc["file"] = "model_int8.onnx"
        files = [enc["file"]]
    for f in ("tokenizer.json", "tokenizer_config.json"):
        shutil.copy(os.path.join(LIGHT, f), OUT)
    with open(os.path.join(OUT, "encoder.json"), "w") as f:
        json.dump(enc, f, indent=1)

    def project(X):
        Y = X @ P.T
        return Y / np.linalg.norm(Y, axis=1, keepdims=True)
    G = np.load(os.path.join(config.MODELS_DIR, "program_emb.npy")).astype("float32")
    # the item id of each row (scripts/embed_program.py), so the phone lines rows up by id
    idp = os.path.join(config.MODELS_DIR, "program_ids.json")
    if os.path.exists(idp):
        ids = json.load(open(idp))
    else:
        # vectors made before 11/26: their rows follow program.json as it was then
        ids = [it["id"] for it in json.load(open(os.path.join(config.ROOT, "data", "processed", "program.json"),
                                                  encoding="utf-8"))]
        print("no models/program_ids.json: taking program.json's order for the vector rows")
    assert len(ids) == len(G), f"{len(ids)} program ids for {len(G)} vector rows: run scripts/embed_program.py"
    with open(os.path.join(OUT, "program_ids.json"), "w") as f:
        json.dump(ids, f)
    Gp = project(G)
    scale = np.abs(Gp).max(1) / 127.0
    np.save(os.path.join(OUT, "program_vec.npy"), np.round(Gp / scale[:, None]).astype(np.int8))
    np.save(os.path.join(OUT, "program_scale.npy"), scale.astype("float32"))
    # "same topic as a saved paper" was 0.75 in the 1,024-d teacher space; the cut
    # space puts talks closer together, so keep the same share of pairs above it
    iu = np.triu_indices(len(G), 1)
    share = float(((G @ G.T)[iu] > 0.75).mean())
    same = round(float(np.quantile((Gp @ Gp.T)[iu], 1 - share)), 4)
    prog = json.load(open(os.path.join(config.ROOT, "data", "processed", "program.json"), encoding="utf-8"))
    pos = {it["id"]: i for i, it in enumerate(prog)}
    paper_rows = [pos[r["id"]] for r in json.load(open(config.CORPUS, encoding="utf-8"))]
    corpus_n = len(paper_rows)
    model_mb = round(sum(os.path.getsize(os.path.join(OUT, f)) for f in files) / 1e6, 1)
    # the "does CHI cover this?" check for this encoder (scripts/train_relevance.py)
    rr = json.load(open(os.path.join(config.ROOT, "docs", "relevance_report.json")))
    relevance = {k: rr[k] for k in ("features", "w", "b", "threshold")}
    return {"papers": Gp[paper_rows], "model_mb": model_mb,
            "cfg": {"encoder": lc["variant"], "dim": lc["dim"], "n": corpus_n, "query_prefix": lc["query_prefix"],
                    "relevance_floor": rep["relevance_floor"], "same_topic_sim": same, "hybrid_w": rep["hybrid_w"], "relevance": relevance,
                    "eval": {"heldout_R@1": rep["eval"]["hybrid"]["R@1"], "heldout_R@8": rep["eval"]["hybrid"]["R@8"],
                             "before_R@1": rep["before"]["hybrid"]["R@1"], "before_R@8": rep["before"]["hybrid"]["R@8"],
                             "split": "test half of the held-out queries"}}}


def main():
    import numpy as np

    os.makedirs(OUT, exist_ok=True)
    with open(config.CORPUS, encoding="utf-8") as f:
        corpus = json.load(f)
    with open(os.path.join(STUDENT, "student_config.json"), encoding="utf-8") as f:
        scfg = json.load(f)
    hyb = json.load(open(os.path.join(config.ROOT, "docs", f"hybrid_report{TAG}.json")))
    main_rep = json.load(open(os.path.join(config.ROOT, "docs", "training_report.json")))
    with open(os.path.join(config.ROOT, "data", "processed", "synth_queries.json")) as f:
        n_queries = sum(q["lang"] in scfg["langs"] for q in json.load(f))

    for f in STALE:
        if os.path.exists(os.path.join(OUT, f)):
            os.remove(os.path.join(OUT, f))
    if USE_LIGHT:
        light = write_light(np)
        emb = light["papers"]
    else:
        shutil.copy(os.path.join(STUDENT, "model_int8.onnx"), OUT)
        shutil.copy(os.path.join(STUDENT, "tokenizer.json"), OUT)
        emb = np.load(os.path.join(STUDENT, "doc_embeddings.npy")).astype("float32")
        np.save(os.path.join(OUT, "paper_emb.npy"), emb)
    # the light package keeps one copy of each abstract (program.json)
    papers = [{
        "id": r["id"], "type": r["type"], "title": r["title"],
        **({} if USE_LIGHT else {"abstract": r["abstract"]}),
        "authors": [a["name"] for a in r["authors"]], "track": r["track"],
        "session": r["session_name"], "room": r["room"], "floor": r["floor"],
        "start": r["start"], "end": r["end"], "doi": r["doi"],
    } for r in corpus]
    with open(os.path.join(OUT, "papers.json"), "w", encoding="utf-8") as f:
        json.dump(papers, f, ensure_ascii=False)

    lang = scfg["langs"][0] if len(scfg["langs"]) == 1 else "all"
    base = main_rep["bge_m3_base"][lang]
    h = hyb["test_hybrid"]["all"]
    model_mb = round(os.path.getsize(os.path.join(OUT, "model_int8.onnx")) / 1e6) if not USE_LIGHT \
        else light["model_mb"]
    cfg = {"student_base": scfg["base"], "teacher": "BAAI/bge-m3 (fine-tuned)",
           "query_prefix": scfg["query_prefix"], "max_len": scfg["max_len"],
           "hybrid_w": hyb["best_w"], "n": int(emb.shape[0]), "dim": int(emb.shape[1]),
           "languages": scfg["langs"],
           **rerank_cfg(),
           "eval": {"heldout_R@1": h["R@1"], "heldout_R@8": h["R@8"],
                    "bge_m3_base_R@1": base["R@1"], "bge_m3_base_R@8": base["R@8"]}}
    if USE_LIGHT:
        cfg.update(light["cfg"])
        h = {"R@1": cfg["eval"]["heldout_R@1"], "R@8": cfg["eval"]["heldout_R@8"]}
    with open(os.path.join(OUT, "config.json"), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    shutil.copy(os.path.join(config.ROOT, "src", "package", "retriever.py"), OUT)
    # explorer: whole-program filter search (institution / country / author / day)
    shutil.copy(os.path.join(config.ROOT, "src", "package", "explorer.py"), OUT)
    shutil.copy(os.path.join(config.ROOT, "data", "processed", "program.json"), OUT)
    if not USE_LIGHT:
        shutil.copy(os.path.join(config.MODELS_DIR, "program_emb.npy"), OUT)
    # ARC screen API: one request per wireframe screen (route, more, filters, ...)
    shutil.copy(os.path.join(config.ROOT, "src", "package", "arc.py"), OUT)
    shutil.copy(os.path.join(config.ROOT, "data", "processed", "venue.json"), OUT)
    # doc2query search phrases per paper, folded into the keyword index at load time
    exp_src = os.path.join(config.ROOT, "data", "processed", "doc_expansions.json")
    if os.path.exists(exp_src):
        shutil.copy(exp_src, os.path.join(OUT, "expansions.json"))
    # topic clusters (scripts/build_clusters.py + name_clusters.py): 08 bubbles, map
    cl_src = os.path.join(config.ROOT, "data", "processed", "clusters.json")
    if os.path.exists(cl_src):
        shutil.copy(cl_src, OUT)
    # one-line summaries + questions per item, written offline (scripts/gen_summaries.py)
    sm_src = os.path.join(config.ROOT, "data", "processed", "summaries.json")
    if os.path.exists(sm_src):
        shutil.copy(sm_src, OUT)
    # the Arc engine (team flow 11/16): finding cards, tribes, phrase vectors
    # (scripts/gen_findings.py + scripts/build_angles.py)
    if os.path.exists(os.path.join(config.ROOT, "data", "processed", "angles.json")):
        shutil.copy(os.path.join(config.ROOT, "src", "package", "angles.py"), OUT)
        for f in ("angles.json", "phrase_vec.npy", "phrase_scale.npy"):
            shutil.copy(os.path.join(config.ROOT, "data", "processed", f), OUT)
    # the same models in JavaScript, for the phone's browser (src/web)
    web = os.path.join(OUT, "web")
    shutil.rmtree(web, ignore_errors=True)
    shutil.copytree(os.path.join(config.ROOT, "src", "web"), web)

    if USE_LIGHT:
        encoder_line = (f"no transformer: one int8 vector per WordPiece token, averaged, then a small "
                        f"matrix into the paper space, distilled from a fine-tuned `BAAI/bge-m3` "
                        f"({model_mb} MB, `encoder.json`)")
    else:
        encoder_line = (f"`{scfg['base']}` distilled from a fine-tuned `BAAI/bge-m3`, int8 ONNX "
                        f"({model_mb} MB)")
    with open(os.path.join(OUT, "README.md"), "w", encoding="utf-8") as f:
        f.write(README.format(encoder_line=encoder_line, n_program=len(json.load(open(os.path.join(OUT, "program.json")))),
                              base=scfg["base"], model_mb=model_mb, n=cfg["n"], dim=cfg["dim"],
                              w=cfg["hybrid_w"], n_queries=n_queries,
                              base_r1=base["R@1"], base_r8=base["R@8"],
                              hyb_r1=h["R@1"], hyb_r8=h["R@8"]))

    # example I/O produced by the packaged code itself
    sys.path.insert(0, OUT)
    sys.dont_write_bytecode = True
    from retriever import Retriever
    req = {"research_topic": "privacy in wearable cameras", "top_k": 8}
    resp = Retriever(OUT).predict(req)
    json.dump(req, open(os.path.join(OUT, "example_request.json"), "w"), indent=2)
    with open(os.path.join(OUT, "example_response.json"), "w", encoding="utf-8") as f:
        json.dump(resp, f, ensure_ascii=False, indent=2)

    # ARC: one example request/response per wireframe screen, made by the packaged code
    from arc import ARC
    arc = ARC(OUT)
    ex_dir = os.path.join(OUT, "arc_examples")
    shutil.rmtree(ex_dir, ignore_errors=True)
    os.makedirs(ex_dir)
    with open(os.path.join(config.ROOT, "tests", "arc_cases.json"), encoding="utf-8") as f:
        cases = [c for c in json.load(f) if c["id"] in ARC_EXAMPLES]
    for c in cases:
        name = ARC_EXAMPLES[c["id"]]
        with open(os.path.join(ex_dir, name + ".request.json"), "w", encoding="utf-8") as f:
            json.dump(c["input"], f, ensure_ascii=False, indent=2)
        with open(os.path.join(ex_dir, name + ".response.json"), "w", encoding="utf-8") as f:
            json.dump(arc.handle(c["input"]), f, ensure_ascii=False, indent=2)

    shutil.rmtree(os.path.join(OUT, "__pycache__"), ignore_errors=True)
    zpath = shutil.make_archive(OUT, "zip", os.path.dirname(OUT), NAME)
    size = sum(os.path.getsize(os.path.join(OUT, x)) for x in os.listdir(OUT))
    print(f"{OUT} ({size / 1e6:.1f} MB) -> {zpath} ({os.path.getsize(zpath) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
