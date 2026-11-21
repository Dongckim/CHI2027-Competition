#!/usr/bin/env python3
"""Case tests for the ARC screen API: one JSON request per wireframe screen.

Each case in tests/arc_cases.json is sent to dist/chi2026-retriever/arc.py on the
command line. Besides exit code and JSON shape, every screen is checked against
what its wireframe shows (Figma "ARC Mobile Wireframes", page "피드백 반영본"), e.g.
the route has at most the pace's number of stops, in time order, none overlapping
once walking time is counted, each with a reason, at most one wildcard; 04 turns
"CMU" into Carnegie Mellon; 06 lists three similar talks that are not the talk itself.

  python tests/run_arc_cases.py        # writes tests/arc_results.json
"""
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACE_STOPS = {1: 4, 2: 6, 3: 8, "light": 4, "balanced": 6, "full": 8}   # v3 O-5c
TRACK_TYPES = {"Papers": {"Paper", "Journals"}, "Posters": {"Posters", "Student Research Competition"},
               "Demos": {"Interactive Demos"}}


def need(out, keys):
    return [f"missing '{k}'" for k in keys if k not in out]


def check(screen, out, case):
    inp = case["input"]
    prof = inp.get("profile", inp)
    pr = []
    if screen == "meta":
        pr += need(out, ["conference", "days", "tracks", "pace", "languages", "sponsors"])
        if len(out.get("days", [])) != 5 or len(out.get("tracks", [])) != 6 or len(out.get("pace", [])) != 3:
            pr.append("expected 5 days, 6 tracks, 3 pace levels (v3)")
        if [n["id"] for n in out.get("needs", [])][:3] != ["step_free", "fewer_room_changes", "breaks"]:
            pr.append("O-4 needs missing")
        if not out.get("sponsors"):
            pr.append("no sponsors for the 03-1 carousel")
    elif screen == "keywords":
        pr += need(out, ["sentence", "keywords", "related", "warnings"])
        for k in out.get("keywords", []):
            if out["sentence"][k["start"]:k["end"]] != k["keyword"]:
                pr.append(f"span {k['start']}:{k['end']} is not '{k['keyword']}'")
        got = [k["keyword"] for k in out.get("keywords", [])]
        for k in case.get("expect_keywords", []):
            if k not in got:
                pr.append(f"keyword '{k}' not found in {got}")
        if len(out.get("related", [])) > 4:
            pr.append("more than 4 related topics")
    elif screen == "nearby":
        pr += need(out, ["adjacent", "sessions"])
        if not out.get("sessions"):
            pr.append("no session topics")
        for a in out.get("adjacent", []):
            if not a["why"].startswith("Shares ") or a["talks"] < 2:
                pr.append(f"weak adjacent field {a}")
    elif screen == "days":
        if len(out.get("days", [])) != 5:
            pr.append("one row per conference day expected")
        for d in out.get("days", []):
            if not isinstance(d.get("talks_for_you"), int):
                pr.append("talks_for_you missing")
    elif screen == "route" and out.get("state") in ("no_plan", "not_attending"):
        if not out.get("empty", {}).get("title"):
            pr.append("empty state without a title")
    elif screen == "route":
        pr += need(out, ["state", "title", "subtitle", "stops", "rows", "overlaps", "gaps",
                         "progress", "more_for_today", "matched_talks", "relevance"])
        stops = out.get("stops", [])
        rows = out.get("rows", [])
        n_max = PACE_STOPS[prof.get("pace", "balanced")] + len((inp.get("state") or {}).get("added", []))
        if not rows or len(rows) > n_max:
            pr.append(f"{len(rows)} rows for pace {prof.get('pace', 'balanced')}")
        # v3 wording: "Your Tuesday", "Your Tuesday · 1 of 6", "More for you"
        wd = out.get("title", "")
        if not wd.startswith("Your ") or not out["progress"]["label"].startswith(wd):
            pr.append(f"v3 header/progress wording: {wd} / {out['progress']['label']}")
        for r in rows:
            if r["badge"] == "PICK ONE" and (len(r["choice"]["options"]) != 2 or r["title"] != "Pick one of 2 talks"
                                             or not all(o["line"].endswith(("Only here now", "Can catch later"))
                                                        for o in r["choice"]["options"])):
                pr.append("a PICK ONE row without two options or v3 lines")
        if case.get("expect_card") and (out.get("now_card") or {}).get("state") != case["expect_card"]:
            pr.append(f"now card {(out.get('now_card') or {}).get('state')}, expected {case['expect_card']}")
        if out.get("state") == "day_done" and not out.get("day_done", {}).get("title"):
            pr.append("day done without its card")
        if case.get("expect_gap") and not out.get("gaps"):
            pr.append("removed a stop but no free slot")
        starts = [s["start"] for s in stops]
        if starts != sorted(starts):
            pr.append("stops not in time order")
        overlapping = {o["options"][1]["id"] for o in out.get("overlaps", [])}
        plain = [s for s in stops if s["id"] not in overlapping]
        for a, b in zip(plain, plain[1:]):
            if datetime.fromisoformat(a["end"]) > datetime.fromisoformat(b["start"]) and not (
                    a["id"] in overlapping or b["id"] in overlapping):
                pr.append(f"stops overlap: {a['time']} and {b['time']}")
        for s in stops:
            for k in ("time", "badge", "title", "room", "why", "kind"):
                if not s.get(k):
                    pr.append(f"stop {s.get('stop')} has no {k}")
                    break
            if s["day"] != out["day"]:
                pr.append(f"stop on {s['day']}, not {out['day']}")
        if sum(s["kind"] == "wildcard" for s in stops) > 1 or any(
                s["kind"] == "wildcard" and s["badge"] != "TRY NEW" for s in stops):
            pr.append("more than one wildcard")
        if any(s["walk_to_next"] is None for s in stops[:-1]):
            pr.append("a stop has no walk_to_next")
        allowed = set().union(*(TRACK_TYPES.get(t, set()) for t in prof.get("tracks", ["Papers", "Posters", "Demos"])))
        if any(s["type"] not in allowed for s in stops if s["kind"] != "added"):
            pr.append("a stop is outside the chosen tracks")
        for i in case.get("expect_absent", []):
            if any(s["id"] == i for s in stops):
                pr.append(f"removed talk {i} is back")
        if case.get("expect_overlap") and not out.get("overlaps"):
            pr.append("added an overlapping talk but no 'Keep one' choice")
        if case.get("expect_next") and not out.get("next"):
            pr.append("no departure banner for 'now'")
        # 10/24: the day's top 16 come with the route; the ones not in it hang under
        # the stop they clash with (sub-nodes), or fit the free time
        recs = out.get("recommendations") or []
        if not recs or len(recs) > int(inp.get("rec_k") or 16):
            pr.append(f"{len(recs)} recommendations")
        if [r["rank"] for r in recs] != list(range(1, len(recs) + 1)):
            pr.append("recommendation ranks are not 1..n")
        ids = {s["id"]: s for s in stops}
        for r in recs:
            if not isinstance(r.get("institutions"), list) or not isinstance(r.get("countries"), list):
                pr.append(f"rec {r['rank']} without institutions/countries")
            if r["status"] == "in_route" and r["id"] not in ids:
                pr.append(f"rec {r['rank']} in_route but not a stop")
            if r["status"] == "alternative":
                host = stops[r["stop"] - 1] if 0 < r["stop"] <= len(stops) else {}
                if r["id"] in ids or r["id"] not in [a["id"] for a in host.get("alternatives", [])]:
                    pr.append(f"rec {r['rank']} is not under stop {r['stop']}")
        for s in stops:
            if "alternatives" not in s:
                pr.append(f"stop {s.get('stop')} has no alternatives list")
                break
            for a in s["alternatives"]:
                if a["id"] in ids or not a.get("reason") or a.get("swap", {}).get("replaces") != s["id"]:
                    pr.append(f"bad alternative {a['id']} under stop {s['stop']}")
        if case.get("expect_alternatives") and not any(s["alternatives"] for s in stops):
            pr.append("no alternatives under any stop")
        # 11/7: every stop graded, choice 1 is the stop, choices 2-3 compete for its time
        for s in stops:
            if s.get("grade", {}).get("letter") not in ("A", "B", "C", "D"):
                pr.append(f"stop {s['stop']} without a grade")
                break
            opts = s.get("options", [])
            if not opts or opts[0]["id"] != s["id"] or [o["choice"] for o in opts] != list(range(1, len(opts) + 1)):
                pr.append(f"stop {s['stop']}: options do not start with the stop as choice 1")
                break
            if len(opts) > 3 or any(o["id"] in ids or o["swap"]["replaces"] != s["id"] for o in opts[1:]):
                pr.append(f"stop {s['stop']}: bad choices 2-3")
                break
        if case.get("expect_options") and not any(len(s.get("options", [])) > 1 for s in stops):
            pr.append("no choice 2 under any stop")
        if out.get("planner") != (inp.get("planner") or "greedy"):
            pr.append(f"planner {out.get('planner')}")
    elif screen == "more" and out.get("state") == "nothing_fits":
        if not out.get("empty", {}).get("title"):
            pr.append("nothing-fits state without a title")
    elif screen == "more":
        pr += need(out, ["title", "picks", "people", "total_picks"])
        if any(p.get("overlaps_route") for p in out.get("picks", [])):
            pr.append("a pick overlaps the route (v2 shows only talks that fit)")
        if case.get("expect_fit"):
            a, b = case["expect_fit"]
            bad = [p["time"] for p in out["picks"] if not (a <= p["time"].lstrip("~") <= b)]
            if bad or not out["picks"]:
                pr.append(f"picks outside {a}-{b}: {bad}")
        for p in out.get("people", []):
            if not p.get("shared_topics") or not p.get("next", {}).get("text"):
                pr.append(f"person {p.get('name')} without shared topics or next session")
        vias = [p["via"]["id"] for p in out.get("people", [])]
        if len(vias) != len(set(vias)):
            pr.append("two people from the same talk")
    elif screen == "filters":
        rows = out.get("institutions", [])
        if case.get("expect_institution"):
            if not rows or not rows[0].get("selected") or \
                    case["expect_institution"] not in rows[0].get("spellings", [rows[0]["name"]]):
                pr.append(f"first institution row is {rows[:1]}")
        if "filters" in inp and "counts" not in out:
            pr.append("no counts for the two buttons")
    elif screen == "session_live":
        pr += need(out, ["session", "room", "progress", "note", "talks"])
        if out.get("state") == "live" and (not out.get("line", "").startswith("Talk ")
                                           or out["progress"].count("current") != 1):
            pr.append("live session without 'Talk k of n' or one current talk")
    elif screen == "search" and out.get("state") == "no_results":
        if not out.get("empty", {}).get("title"):
            pr.append("no-results state without a title")
    elif screen == "search":
        pr += need(out, ["tabs", "talks", "people", "sessions", "header"])
        for tab in ("talks", "people", "sessions"):
            if out["tabs"][tab] < len(out[tab]):
                pr.append(f"tab count {tab} smaller than its list")
        if case.get("expect_people") and not any(p["name"] == case["expect_people"] for p in out["people"]):
            pr.append(f"{case['expect_people']} not in people")
        if "expect_papers" in case and out["tabs"]["talks"] != case["expect_papers"]:
            pr.append(f"talks={out['tabs']['talks']}, expected {case['expect_papers']}")
    elif screen == "paper":
        pr += need(out, ["title", "authors", "institutions", "similar", "abstract", "doi"])
        if len(out.get("similar", [])) != 3 or any(s["id"] == out["id"] for s in out["similar"]):
            pr.append("similar talks should be 3 other talks")
        if "profile" in inp and not out.get("why"):
            pr.append("no 'why recommended' with a profile")
        if "from_room" in inp and not out.get("directions"):
            pr.append("no directions")
    elif screen == "author":
        pr += need(out, ["name", "initials", "institution", "where", "papers", "similar", "overlaps"])
        st = [w["start"] for w in out.get("where", [])]
        if st != sorted(st):
            pr.append("where-to-find not in time order")
        if not out.get("where"):
            pr.append("no place to find them")
    elif screen == "wrapup":
        pr += need(out, ["counts", "mostly_about", "clusters", "papers", "authors", "for_tomorrow"])
        st = inp.get("state", {})
        c = out.get("counts", {})
        if (c.get("papers_saved"), c.get("talks_attended"), c.get("authors_opened")) != (
                len(st.get("saved", [])), len(st.get("attended", [])), len(st.get("opened_authors", []))):
            pr.append(f"counts {c} do not match the state")
        ft = out.get("for_tomorrow")
        if ft and ft["day"] <= out["day"]:
            pr.append("tomorrow's bridge is not on a later day")
    elif screen == "clusters" and "cluster" in out:
        pr += need(out, ["keywords", "talks", "total", "order"])
        if len(out.get("talks", [])) > int(inp.get("top_k") or 20):
            pr.append("more talks than top_k")
        if not all(k["talks"] == len(k["ids"]) > 0 for k in out.get("keywords", [])):
            pr.append("a keyword without its talks")
        if not out.get("subtopics") or len(out.get("path", [])) != (2 if "." in str(inp["cluster"]) else 1):
            pr.append("no sub-topics, or the path does not match the level")
    elif screen == "clusters":
        pr += need(out, ["clusters", "total", "order"])
        cl = out.get("clusters", [])
        if len(cl) != out.get("total") or not cl:
            pr.append("cluster list does not match total")
        for c in cl:
            if not (c.get("id") and c.get("label") and c.get("size") and c.get("keywords") and c.get("map")):
                pr.append(f"cluster {c.get('id')} incomplete")
                break
        if prof.get("research") and len(out.get("for_you", [])) != 3:
            pr.append("no for_you clusters for a profile")
        if case.get("expect_yours") and not any(c["yours"] for c in cl):
            pr.append("saved talks not counted in any cluster")
        if prof.get("research") and not all(len(w["path"]) == 2 for w in out.get("where", [])[:5]):
            pr.append("recommended talks without topic / sub-topic")
    elif screen == "start":
        pr += need(out, ["modes", "shelves", "cart"])
        if [m["id"] for m in out.get("modes", [])] != ["pick", "recommend"]:
            pr.append("the two ways in (pick / recommend) missing")
        sh = {x["id"]: x for x in out.get("shelves", [])}
        if not sh.get("topics", {}).get("topics") or "search" not in sh:
            pr.append("no topic shelf or no people/school search")
        cart = set((inp.get("state") or {}).get("cart", []))
        if cart:
            if "similar" not in sh or any(t["id"] in cart for t in sh["similar"]["talks"]):
                pr.append("no 'like your picks' shelf, or it repeats a pick")
            if out["cart"]["count"] != len(cart):
                pr.append("cart count wrong")
    elif screen == "browse":
        pr += need(out, ["shelf", "title", "talks", "total"])
        if len(out.get("talks", [])) > int(inp.get("top_k") or 20):
            pr.append("more talks than top_k")
        if out.get("personalized_by") and not all(t.get("grade") for t in out.get("talks", [])):
            pr.append("personalized shelf without grades")
        if str(inp.get("shelf", "")).startswith("topic:") and "." not in inp["shelf"] and not out.get("subtopics"):
            pr.append("topic shelf without its sub-topics")
    elif screen == "plan":
        pr += need(out, ["days", "similar", "grading"])
        cart = set((inp.get("state") or {}).get("cart", []))
        seen = set()
        for d in out.get("days", []):
            starts = [s["start"] for s in d["stops"]]
            if starts != sorted(starts):
                pr.append(f"{d['date']}: stops out of time order")
            for s in d["stops"]:
                seen |= {o["id"] for o in s["options"]}
        seen |= {x["id"] for x in out.get("unscheduled", []) + out.get("on_other_days", [])}
        if seen != cart:
            pr.append(f"picks lost or added: {sorted(seen ^ cart)}")
        if case.get("expect_clash") and not any(len(s["options"]) > 1 for d in out["days"] for s in d["stops"]):
            pr.append("clashing picks not offered as a choice")
        if any(t["id"] in cart for t in out.get("similar", {}).get("talks", [])):
            pr.append("'like your picks' repeats a pick")
    elif screen == "places":
        pl = out.get("places", [])
        if not pl or not any(x["name"] == "Registration" for x in pl):
            pr.append("no Registration among the starting places")
        if inp.get("last_room") and pl[0]["line"] != "Your last stop":
            pr.append("last stop not first")
    elif screen == "questions":
        if len(out.get("suggested", [])) != 2 or not out.get("for", "").startswith("For · "):
            pr.append("two English questions expected")
    elif screen == "getting_there":
        pr += need(out, ["from", "to", "minutes", "floor_plans", "pins", "step_free"])
        if not all(f["map"] for f in out.get("floor_plans", [])):
            pr.append("floor plan image missing")
    return pr


def run_case(pkg, case):
    raw = case["raw"] if "raw" in case else json.dumps(case["input"], ensure_ascii=False)
    t0 = time.perf_counter()
    p = subprocess.run([sys.executable, os.path.join(pkg, "arc.py"), raw],
                       capture_output=True, text=True, cwd=pkg)
    rec = {"id": case["id"], "screen": case["screen"], "desc": case["desc"], "input": raw,
           "exit": p.returncode, "wall_ms": round((time.perf_counter() - t0) * 1000)}
    try:
        out = json.loads(p.stdout) if p.stdout.strip() else None
    except json.JSONDecodeError:
        out = None
    rec["output"] = out
    if case.get("expect") == "error":
        ok = p.returncode == 2 and isinstance(out, dict) and "error" in out
        rec["problems"] = [] if ok else [f"expected a JSON error with exit 2, got exit {p.returncode}"
                                         + (" (traceback)" if "Traceback" in p.stderr else "")]
    elif p.returncode != 0 or not isinstance(out, dict):
        tail = p.stderr.strip().splitlines()[-1] if p.stderr.strip() else ""
        rec["problems"] = [f"failed: exit {p.returncode}: {tail}"]
    else:
        rec["problems"] = check(case["screen"], out, case)
        if case.get("expect_state") and out.get("state") != case["expect_state"]:
            rec["problems"].append(f"state {out.get('state')}, expected {case['expect_state']}")
        warned = bool(out.get("warnings"))
        if case.get("expect") == "warning" and not warned:
            rec["problems"].append("expected a warning")
        if case.get("expect", "ok") == "ok" and warned:
            rec["problems"].append(f"unexpected warning: {out['warnings']}")
    rec["pass"] = not rec["problems"]
    return rec


def summary(out):
    s = out.get("screen")
    if "error" in out:
        return [f"error: {out['error']}"]
    if s == "keywords":
        return [f"keywords: {[k['keyword'] for k in out['keywords']]}",
                f"related: {[r['topic'] for r in out['related']]}"]
    if s == "nearby":
        return [f"adjacent: {[a['field'] + ' (' + a['why'] + ')' for a in out['adjacent']]}",
                f"sessions: {[x['topic'] for x in out['sessions']]}"]
    if s == "days":
        return [", ".join(f"{d['label']}: {d['talks_for_you']}" for d in out["days"])]
    if s == "route" and out.get("empty"):
        return [f"{out['state']}: {out['empty']['title']} · {out['empty'].get('body', '')}"]
    if s == "route":
        card = out.get("now_card") or {}
        rows = [f"[{out['state']}] {out['progress']['label']} · {out['more_for_today']['label']}"]
        if card:
            rows.append(f"now card: {card['badge']} · {card['label']} | {card['title'][:50]} | {card['line']}")
        if out.get("day_done"):
            rows.append(f"day done: {out['day_done']['title']} · {(out['day_done'].get('next_day') or {}).get('text')}")
        rows += [f"row {r['time']} {r['badge']:<7} {r['title'][:60]}" for r in out["rows"]]
        rows += [f"gap: {g['label']}" for g in out.get("gaps", [])]
        return rows
    if s == "route_old":
        rows = [out["subtitle"]] + [f"{x['time']} {x['badge']:<6} {x['kind']:<8} {x['title'][:58]} | {x['room']}"
                                    for x in out["stops"]]
        rows += [f"overlap: {o['text'][:90]}" for o in out["overlaps"]]
        if out.get("next"):
            rows.append(f"next: {out['next']['text']}")
        return rows
    if s == "more" and out.get("empty"):
        return [f"{out['state']}: {out['empty']['title']} · {out['empty']['buttons']}"]
    if s == "session_live":
        return [f"{out['session']} · {out['room']} · {out.get('line')} · {out.get('badge')}",
                f"progress {out['progress']} · up next: {(out.get('up_next') or {}).get('title', '')[:50]}"]
    if s == "search" and out.get("empty"):
        return [f"{out['state']}: {out['empty']['title']} · {out['empty']['buttons']}"]
    if s == "more":
        return [out["title"]] + [f"{x['badge']} {x['title'][:55]} | {x['line']} | {x.get('fits')}" for x in out["picks"][:3]] + \
               [f"person: {p['name']} · {p['institution']} · {p['shared_label']} · {p['next']['text']}"
                for p in out["people"][:3]]
    if s == "filters":
        return [f"institution: {r['name']} ({r.get('line', '')}) selected={r.get('selected')}"
                for r in out.get("institutions", [])[:3]] + [f"counts: {out.get('counts')}"]
    if s == "search":
        return [f"tabs: {out['tabs']}"] + [f"{x['label']} {x['title'][:60]} | {x['line']}" for x in out["talks"][:3]]
    if s == "places":
        return [f"{x['name']} · {x['line']}" for x in out["places"]]
    if s == "questions":
        return [out["for"][:70]] + [x["text"] for x in out["suggested"]]
    if s == "paper":
        return [f"{out['when']} | {out['where']}", f"why: {(out.get('why') or {}).get('text')}"] + \
               [f"similar: {x['title'][:60]} | {x['line']}" for x in out["similar"]]
    if s == "author":
        return [f"{out['name']} · {out['institution']} · {out['papers_label']}"] + \
               [f"{w['day_label']} {w['time']} {w['kind']} | {w['room']}" for w in out["where"][:4]]
    if s == "wrapup":
        ft = out.get("for_tomorrow") or {}
        return [f"counts: {out['counts']}", f"mostly: {out['mostly_about']}", f"tomorrow: {ft.get('text')}"]
    if s == "getting_there":
        return [f"{out['title']} · {out['minutes']} · {out['via']}"]
    if s == "start":
        return [f"modes: {[m['id'] for m in out['modes']]} · cart {out['cart']['label']}"] + \
               [f"shelf {x['id']}: {[t['title'][:28] for t in x.get('talks', [])[:2]] or [t['label'] for t in x.get('topics', [])[:3]]}"
                for x in out["shelves"]]
    if s == "browse":
        return [f"{out['title']} · {out['total']} talks · by {out['personalized_by']}"] + \
               [f"sub-topic: {x['label']} ({x['size']})" for x in out.get("subtopics", [])[:4]] + \
               [f"{t.get('grade', {}).get('letter', '-')} {t['title'][:60]}" for t in out["talks"][:3]]
    if s == "plan":
        rows = []
        for d in out["days"]:
            rows.append(f"{d['title']}: {d['summary']}")
            rows += [f"  {r['time']} {r['badge']:<8} {r['title'][:55]}" for r in d["rows"]]
        return rows + [f"like your picks: {[t['title'][:30] for t in out['similar']['talks'][:3]]}"]
    if s == "meta":
        return [f"days: {[d['short'] for d in out['days']]}", f"sponsors: {[x['name'] for x in out['sponsors']][:3]}"]
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pkg", default=os.path.join(ROOT, "dist", "chi2026-retriever"))
    ap.add_argument("--out", default=os.path.join(ROOT, "tests", "arc_results.json"))
    a = ap.parse_args()
    with open(os.path.join(ROOT, "tests", "arc_cases.json"), encoding="utf-8") as f:
        cases = json.load(f)
    results = [run_case(a.pkg, c) for c in cases]
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    for r in results:
        out = r["output"] if isinstance(r["output"], dict) else {}
        print(f"{r['id']:<5} {'PASS' if r['pass'] else 'FAIL'}  {r['screen']:<13} {r['desc']:<42} "
              f"exit={r['exit']} {out.get('latency_ms', '-')}ms")
        for pr in r["problems"]:
            print(f"        ! {pr}")
        for w in out.get("warnings", []) or []:
            print(f"        warning: {w}")
        for line in summary(out):
            print(f"        {line}")
    n = sum(r["pass"] for r in results)
    print(f"\n{n}/{len(results)} passed")


if __name__ == "__main__":
    main()
