#!/usr/bin/env python3
"""A live programme feed changes program.json after the package is built: a talk is withdrawn,
a new one appears, others move. Does the package still give every talk its own vector, find the
new talk, and run (Python and the phone's JavaScript)?

A copy of dist/chi2026-retriever goes to logs/feed_tmp (git-ignored) with program.json changed:
one paper removed, one new talk put first, 100 items reversed. Then, in both engines:
  1. every talk in both copies has the very same vector, looked up by id;
  2. the new talk has zeros (no vector yet) and keyword search still finds it;
  3. the Arc engine loads and answers ask and arc;
  4. without program_ids.json, a row count that no longer matches the items stops the load with
     an error instead of handing talks each other's vectors (a change that keeps the count can
     only be caught through the ids, which is why the package carries them).

  python tests/run_feed_cases.py        (after scripts/package_model.py)
"""
import json
import os
import shutil
import subprocess
import sys

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PKG = os.path.join(ROOT, "dist", "chi2026-retriever")
TMP = os.path.join(ROOT, "logs", "feed_tmp")
NEW_ID = 999999001
NEW_WORD = "quantumknit"


def make_copy():
    shutil.rmtree(TMP, ignore_errors=True)
    shutil.copytree(PKG, TMP)
    prog = json.load(open(os.path.join(TMP, "program.json"), encoding="utf-8"))
    papers = {p["id"] for p in json.load(open(os.path.join(TMP, "papers.json"), encoding="utf-8"))}
    gone = next(it["id"] for it in prog[5:] if it["id"] in papers)
    prog = [it for it in prog if it["id"] != gone]
    new = dict(prog[1], id=NEW_ID, title="Knitted haptic gloves for remote touch",
               abstract=f"We present {NEW_WORD}, a knitted glove that renders remote touch. "
                        "In a study with 24 participants, it increased the sense of social presence.")
    prog = [new] + prog
    prog[100:200] = prog[100:200][::-1]
    json.dump(prog, open(os.path.join(TMP, "program.json"), "w", encoding="utf-8"))
    return gone


def python_checks(gone):
    sys.path.insert(0, PKG)
    import explorer
    import retriever
    import angles
    errs = []
    a, b = explorer.Explorer(PKG), explorer.Explorer(TMP)
    ra = {it["id"]: r for r, it in enumerate(a.items)}
    same = sum(np.array_equal(b.emb[r], a.emb[ra[it["id"]]]) for r, it in enumerate(b.items) if it["id"] in ra)
    both = sum(it["id"] in ra for it in b.items)
    if same != both:
        errs.append(f"python: {both - same} of {both} talks got another vector")
    i_new = next(r for r, it in enumerate(b.items) if it["id"] == NEW_ID)
    if np.any(b.emb[i_new]):
        errs.append("python: the new talk should have no vector yet")
    if int(np.argmax(b.bm25.scores(NEW_WORD))) != i_new:
        errs.append("python: keyword search does not find the new talk")
    if any(p["id"] == gone for p in retriever.Retriever(TMP).papers):
        errs.append("python: the withdrawn paper is still listed")
    eng = angles.Angles(TMP)
    arc = eng.handle({"screen": "arc", "question": "Do haptic gloves improve social presence?", "when": "week"})
    eng.handle({"screen": "ask", "text": "haptics"})
    if not arc["nodes"]:
        errs.append("python: an empty Arc")
    # without the ids a change that keeps the count cannot be seen (hence program_ids.json);
    # one that changes it must stop the load
    os.rename(os.path.join(TMP, "program_ids.json"), os.path.join(TMP, "program_ids.off"))
    path = os.path.join(TMP, "program.json")
    prog = json.load(open(path, encoding="utf-8"))
    json.dump(prog[:-1], open(path, "w", encoding="utf-8"))
    try:
        explorer.Explorer(TMP)
        errs.append("python: rows that no longer match program.json loaded without an error")
    except ValueError:
        pass
    json.dump(prog, open(path, "w", encoding="utf-8"))
    os.rename(os.path.join(TMP, "program_ids.off"), os.path.join(TMP, "program_ids.json"))
    return errs, f"{same}/{both} vectors by id; Arc {len(arc['nodes'])} stops"


JS = r"""
import { loadPackage, alignRows } from "%(pkg)s/web/load.mjs";
import { Angles } from "%(pkg)s/web/angles.mjs";
const errs = [];
const a = await loadPackage("%(pkg)s"), b = await loadPackage("%(tmp)s");
const d = a.programEmb.d, ra = new Map(a.program.map((it, r) => [it.id, r]));
let same = 0, both = 0;
b.program.forEach((it, r) => {
  if (!ra.has(it.id)) return;
  both++;
  const x = b.programEmb.data.subarray(r * d, (r + 1) * d), y = a.programEmb.data.subarray(ra.get(it.id) * d, (ra.get(it.id) + 1) * d);
  if (x.every((v, k) => v === y[k])) same++;
});
if (same !== both) errs.push(`js: ${both - same} of ${both} talks got another vector`);
const iNew = b.program.findIndex((it) => it.id === %(new)d);
if (b.programEmb.data.subarray(iNew * d, (iNew + 1) * d).some((v) => v !== 0)) errs.push("js: the new talk should have no vector yet");
if (b.papers.some((p) => p.id === %(gone)d)) errs.push("js: the withdrawn paper is still listed");
const eng = new Angles(b);
const arc = await eng.handle({ screen: "arc", question: "Do haptic gloves improve social presence?", when: "week" });
await eng.handle({ screen: "ask", text: "haptics" });
if (!arc.nodes.length) errs.push("js: an empty Arc");
try { alignRows({ data: new Float32Array(4), n: 2, d: 2 }, [1, 2, 3], null); errs.push("js: a row count mismatch loaded"); } catch (e) { /* expected */ }
console.log(JSON.stringify({ errs, note: `${same}/${both} vectors by id; Arc ${arc.nodes.length} stops` }));
"""


def js_checks(gone):
    path = os.path.join(TMP, "feed_check.mjs")
    with open(path, "w") as f:
        f.write(JS % {"pkg": os.path.abspath(PKG), "tmp": os.path.abspath(TMP), "new": NEW_ID, "gone": gone})
    out = subprocess.run(["node", path], capture_output=True, text=True, cwd=ROOT)
    if out.returncode:
        return [f"js crashed: {out.stderr.strip()[-300:]}"], ""
    r = json.loads(out.stdout.strip().splitlines()[-1])
    return r["errs"], r["note"]


def main():
    gone = make_copy()
    ok = 0
    for name, fn in (("python", python_checks), ("javascript", js_checks)):
        errs, note = fn(gone)
        print(("PASS" if not errs else "FAIL"), name, f"({note})", "; ".join(errs))
        ok += not errs
    shutil.rmtree(TMP, ignore_errors=True)
    print(f"{ok}/2 passed")
    sys.exit(0 if ok == 2 else 1)


if __name__ == "__main__":
    main()
