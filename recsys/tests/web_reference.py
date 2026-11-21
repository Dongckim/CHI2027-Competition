#!/usr/bin/env python3
"""Python answers for every case, for the JavaScript port to match.

Runs the retriever, explorer and ARC cases (tests/cases.json, explorer_cases.json,
arc_cases.json, angle_cases.json) in-process on the packaged model and records each response, plus the
query vector the Python encoder gave for every text it embedded. tests/run_web_parity.mjs
then answers the same cases in Node and compares.

  python tests/web_reference.py            # writes tests/web_reference.json
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "dist", "chi2026-retriever")
sys.path.insert(0, PKG)
sys.dont_write_bytecode = True

import retriever  # noqa: E402
from arc import ARC  # noqa: E402
from explorer import Explorer  # noqa: E402

QVECS = {}
_call = retriever.QueryEncoder.__call__


def recording_call(self, text):
    v = _call(self, text)
    QVECS[text] = [float(x) for x in v]
    return v


retriever.QueryEncoder.__call__ = recording_call


def answer(fn, case):
    if "raw" in case:
        try:
            req = json.loads(case["raw"])
        except json.JSONDecodeError:
            return {"error": "input is not valid JSON"}
    else:
        req = case["input"]
    try:
        return fn(req)
    except retriever.InputError as e:
        return {"error": str(e)}


def main():
    out = {}
    r = retriever.Retriever(PKG)

    def predict(req):
        retriever.parse_request(req)
        return r.predict(req)
    out["retriever"] = {c["id"]: answer(predict, c)
                        for c in json.load(open(os.path.join(ROOT, "tests", "cases.json")))}
    ex = Explorer(PKG)
    out["explorer"] = {c["id"]: answer(ex.predict, c)
                       for c in json.load(open(os.path.join(ROOT, "tests", "explorer_cases.json")))}
    arc = ARC(PKG)
    out["arc"] = {c["id"]: answer(arc.handle, c)
                  for c in json.load(open(os.path.join(ROOT, "tests", "arc_cases.json")))}
    if os.path.exists(os.path.join(PKG, "angles.json")):
        from angles import Angles
        eng = Angles(PKG, arc=arc)
        out["angles"] = {c["id"]: answer(eng.handle, c)
                         for c in json.load(open(os.path.join(ROOT, "tests", "angle_cases.json")))}
    out["qvecs"] = QVECS
    path = os.path.join(ROOT, "tests", "web_reference.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"wrote {path}: {sum(len(v) for k, v in out.items() if k != 'qvecs')} answers, "
          f"{len(QVECS)} query vectors")


if __name__ == "__main__":
    main()
