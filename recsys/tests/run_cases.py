#!/usr/bin/env python3
"""Case tests for the packaged retriever: JSON input -> JSON output.

Each case in tests/cases.json is sent to dist/chi2026-retriever/retriever.py as a
JSON string on the command line, exactly as a user or another program would.
For every case we record the exit code, stdout/stderr and wall time, and check
the output contract automatically:

  expect "ok"      -> exit 0, JSON object with query/top_k/latency_ms/warnings/results,
                      len(results) == top_k, ranks 1..n, scores non-increasing,
                      every result has all fields, no talk listed twice, no warnings
  expect "warning" -> the same, but warnings must be non-empty
  expect "error"   -> exit code 2 and {"error": ...} on stdout (no traceback)

Relevance of the returned titles is judged by a person from the report.

  python tests/run_cases.py                       # writes tests/results.json
  python tests/run_cases.py --tool explorer       # writes tests/explorer_results.json
  python tests/run_cases.py --pkg path/to/chi2026-retriever
"""
import argparse
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULT_FIELDS = ["rank", "id", "title", "type", "score", "similarity", "authors", "track",
                 "session", "room", "floor", "start", "end", "doi", "also_at"]


def check_valid(out, case):
    problems = []
    for key in ("query", "top_k", "latency_ms", "warnings", "results"):
        if key not in out:
            problems.append(f"missing top-level '{key}'")
    res = out.get("results", [])
    if len(res) != out.get("top_k"):
        problems.append(f"len(results)={len(res)} != top_k={out.get('top_k')}")
    if [r.get("rank") for r in res] != list(range(1, len(res) + 1)):
        problems.append("ranks are not 1..n")
    scores = [r.get("score") for r in res]
    if any(a < b for a, b in zip(scores, scores[1:])):
        problems.append("scores not in descending order")
    for r in res:
        missing = [f for f in RESULT_FIELDS if f not in r]
        if missing:
            problems.append(f"rank {r.get('rank')} missing {missing}")
            break
    titles = [r.get("title", "").strip().lower() for r in res]
    if len(titles) != len(set(titles)):
        problems.append("same talk listed twice")
    if "expect_top_k" in case and out.get("top_k") != case["expect_top_k"]:
        problems.append(f"top_k={out.get('top_k')}, expected {case['expect_top_k']}")
    warned = bool(out.get("warnings"))
    if case.get("expect", "ok") == "warning" and not warned:
        problems.append("expected a warning, got none")
    if case.get("expect", "ok") == "ok" and warned:
        problems.append(f"unexpected warning: {out['warnings']}")
    return problems


EXPLORER_FIELDS = ["rank", "id", "type", "title", "authors", "matched_authors", "sessions",
                   "doi", "score"]


def check_explorer(out, case):
    problems = []
    if "list" in case["input"]:
        rows = out.get("items", [])
        if len(rows) != out.get("returned") or not rows:
            problems.append(f"returned={out.get('returned')} items={len(rows)}")
        if [r["count"] for r in rows] != sorted((r["count"] for r in rows), reverse=True):
            problems.append("counts not in descending order")
        if "top_k" in case["input"] and len(rows) > case["input"]["top_k"]:
            problems.append("more rows than top_k")
        return problems
    for key in ("filters", "matched", "total", "returned", "sort", "warnings", "summary",
                "results", "latency_ms"):
        if key not in out:
            problems.append(f"missing top-level '{key}'")
    res = out.get("results", [])
    if len(res) != out.get("returned") or out.get("returned") != min(
            out.get("total", 0), int(case["input"].get("top_k", 20))):
        problems.append(f"returned={out.get('returned')} results={len(res)} total={out.get('total')}")
    if [r.get("rank") for r in res] != list(range(1, len(res) + 1)):
        problems.append("ranks are not 1..n")
    for r in res:
        missing = [f for f in EXPLORER_FIELDS if f not in r]
        if missing:
            problems.append(f"rank {r.get('rank')} missing {missing}")
            break
    if out.get("sort") == "relevance":
        sc = [r["score"] for r in res]
        if any(a < b for a, b in zip(sc, sc[1:])):
            problems.append("scores not in descending order")
    else:
        st = [r["sessions"][0]["start"] if r["sessions"] and r["sessions"][0]["start"] else "9999"
              for r in res]
        if st != sorted(st):
            problems.append("not in time order")
    if "institution" in case["input"] or "country" in case["input"] or "author" in case["input"]:
        if any(not r["matched_authors"] for r in res):
            problems.append("a result has no matched author")
    if "day" in case["input"] and res:
        day = case["input"]["day"].lower()
        firsts = [r["sessions"][0]["start"] for r in res]
        if day.startswith(("mon", "tue", "wed", "thu", "fri", "sat", "sun")):
            import datetime
            wd = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].index(day[:3])
            bad = [d for d in firsts if datetime.date.fromisoformat(d[:10]).weekday() != wd]
        else:
            bad = [d for d in firsts if d[5:10] != day[-5:]]
        if bad:
            problems.append(f"first slot not on the requested day: {bad[:2]}")
    if "expect_total" in case and out.get("total") != case["expect_total"]:
        problems.append(f"total={out.get('total')}, expected {case['expect_total']}")
    if "expect_min_total" in case and out.get("total", 0) < case["expect_min_total"]:
        problems.append(f"total={out.get('total')}, expected at least {case['expect_min_total']}")
    warned = bool(out.get("warnings"))
    if case.get("expect", "ok") == "warning" and not warned:
        problems.append("expected a warning, got none")
    if case.get("expect", "ok") == "ok" and warned:
        problems.append(f"unexpected warning: {out['warnings']}")
    return problems


def run_case(pkg, case, tool="retriever"):
    raw = case["raw"] if "raw" in case else json.dumps(case["input"], ensure_ascii=False)
    t0 = time.perf_counter()
    p = subprocess.run([sys.executable, os.path.join(pkg, tool + ".py"), raw],
                       capture_output=True, text=True, cwd=pkg)
    wall = round((time.perf_counter() - t0) * 1000)
    rec = {"id": case["id"], "group": case["group"], "desc": case["desc"], "input": raw,
           "exit": p.returncode, "wall_ms": wall,
           "stderr_tail": p.stderr.strip().splitlines()[-1] if p.stderr.strip() else ""}
    try:
        out = json.loads(p.stdout) if p.stdout.strip() else None
    except json.JSONDecodeError:
        out = None
    rec["output"] = out

    if case.get("expect") == "error":
        ok = p.returncode == 2 and isinstance(out, dict) and "error" in out
        rec["problems"] = [] if ok else [
            f"expected a JSON error with exit 2, got exit {p.returncode}, "
            + ("traceback" if "Traceback" in p.stderr else "no JSON error")]
    elif p.returncode != 0 or not isinstance(out, dict):
        rec["problems"] = [f"failed: exit {p.returncode}: {rec['stderr_tail']}"]
    else:
        rec["problems"] = (check_explorer if tool == "explorer" else check_valid)(out, case)
    rec["pass"] = not rec["problems"]
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pkg", default=os.path.join(ROOT, "dist", "chi2026-retriever"))
    ap.add_argument("--tool", choices=["retriever", "explorer"], default="retriever")
    ap.add_argument("--out")
    a = ap.parse_args()
    name = "cases.json" if a.tool == "retriever" else "explorer_cases.json"
    a.out = a.out or os.path.join(ROOT, "tests", "results.json" if a.tool == "retriever"
                                  else "explorer_results.json")
    with open(os.path.join(ROOT, "tests", name), encoding="utf-8") as f:
        cases = json.load(f)
    results = [run_case(a.pkg, c, a.tool) for c in cases]
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    for r in results:
        out = r["output"] if isinstance(r["output"], dict) else {}
        size = (f"total={out.get('total', '-')}" if a.tool == "explorer"
                else f"top_k={out.get('top_k', '-')}")
        head = (f"{r['id']:<4} {'PASS' if r['pass'] else 'FAIL'}  {r['desc']:<32} "
                f"exit={r['exit']} {size} n={len(out.get('results', []))} "
                f"{out.get('latency_ms', '-')}ms")
        print(head)
        for p in r["problems"]:
            print(f"       ! {p}")
        if "error" in out:
            print(f"       error: {out['error']}")
        for w in out.get("warnings", []):
            print(f"       warning: {w}")
        for x in out.get("items", [])[:3]:
            print(f"       {x['count']:>4}  {x['name'][:80]}")
        for x in out.get("results", [])[:3]:
            if a.tool == "explorer":
                who = ", ".join(h["name"] for h in x["matched_authors"][:2])
                sc = f"{x['score']:.2f} " if x["score"] is not None else ""
                print(f"       {x['rank']}. {sc}[{x['type']}] {x['title'][:70]}" + (f"  <- {who}" if who else ""))
            else:
                print(f"       {x['rank']}. [{x['score']:.2f}/{x['similarity']:.2f}] {x['title'][:80]}")
    n = sum(r["pass"] for r in results)
    print(f"\n{n}/{len(results)} passed")


if __name__ == "__main__":
    main()
