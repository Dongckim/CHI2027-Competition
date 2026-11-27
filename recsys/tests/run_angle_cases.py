#!/usr/bin/env python3
"""Cases for the Arc engine (src/package/angles.py), run against the packaged model.

Each case is a request plus checks that hold whatever the data says: the question is
read as the right factor and outcome, an Arc never has two stops at once, a Challenge
always rests on a result sentence of a study (never a demo, panel or meet-up), every
quoted sentence is the abstract's own text and its underlines sit inside it, and
malformed requests fail with a clear error.

  python tests/run_angle_cases.py            # uses dist/chi2026-retriever
Writes tests/angle_results.json.
"""
import json
import re
import os
import sys
import time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PKG = os.environ.get("CHI_PKG", os.path.join(ROOT, "dist", "chi2026-retriever"))
sys.path.insert(0, PKG)
import angles as A  # noqa: E402
from retriever import InputError  # noqa: E402

TUE = "2026-04-14"
Q = "Does VR fidelity really raise presence?"

PARSE = [
    ("Does VR fidelity really raise presence?", "relation", "vr fidelity", "presence", "+", ""),
    ("Does AI assistance reduce critical thinking?", "relation", "ai assistance", "critical thinking", "-", ""),
    ("How does social VR use over time affect presence?", "relation", "social vr use", "presence", "?", "time"),
    ("Do older adults trust voice assistants?", "relation", "voice assistants", "trust", "+", "older adults"),
    ("Does haptic feedback improve typing on touchscreens?", "relation", "haptic feedback", "typing", "+", "touchscreens"),
    ("Does gaze input make target selection faster?", "relation", "gaze input", "target selection", "+", ""),
    ("Do AI image descriptions help blind screen reader users?", "relation", "ai image descriptions", "", "+",
     "blind screen reader users"),
    ("Does AI decision support improve clinicians' diagnoses?", "relation", "ai decision support", "diagnoses", "+",
     "clinicians"),
    ("effect of haptic feedback on presence in VR", "relation", "haptic feedback", "presence", "?", "vr"),
    ("Do smart glasses help with everyday tasks?", "relation", "smart glasses", "everyday tasks", "+", ""),
    ("VR presence", "topic", "vr presence", "", "?", ""),
    ("What is accessibility research asking now?", "open", None, "", "?", ""),
]


def check_sentence(eng, nd):
    w = nd["why"]
    s = w.get("sentence")
    if s is None:
        return []
    errs = []
    ab = eng.items[eng.pos[nd["id"]]]["abstract"]
    if ab[s["start"]:s["end"]] != s["text"]:
        errs.append(f"{nd['id']}: quoted sentence is not the abstract's text")
    for a, b in s["highlight"]:
        if not (0 <= a < b <= len(s["text"])):
            errs.append(f"{nd['id']}: underline {a}-{b} outside the sentence")
    return errs


def check_node(eng, nd):
    errs = check_sentence(eng, nd)
    i = eng.pos[nd["id"]]
    if nd["angle"] not in A.ANGLES:
        errs.append(f"{nd['id']}: unknown angle {nd['angle']}")
    if nd["symbol"] != A.SYMBOL[nd["angle"]]:
        errs.append(f"{nd['id']}: symbol does not match the angle")
    if nd["angle"] == "challenge":
        if eng.items[i]["type"] in A.NO_FINDINGS:
            errs.append(f"{nd['id']}: a {eng.items[i]['type']} item is a Challenge")
        if nd["why"].get("status") != "result":
            errs.append(f"{nd['id']}: Challenge without a result sentence")
    if not nd["label"] or len(nd["label"].split()) > 4:
        errs.append(f"{nd['id']}: label {nd['label']!r} is not 1-4 words")
    return errs


def check_arc(eng, out, size=A.SIZE):
    errs = []
    nodes = out["nodes"]
    if len(nodes) > size:
        errs.append(f"{len(nodes)} nodes, more than {size}")
    if len({nd["id"] for nd in nodes}) != len(nodes):
        errs.append("a talk is on the Arc twice")
    stops = [nd for nd in nodes if nd.get("stop")]
    if [nd["stop"] for nd in stops] != list(range(1, len(stops) + 1)):
        errs.append("stops are not numbered 1..n")
    for a, b in zip(stops, stops[1:]):
        if a["visit_end"] > b["visit_start"]:
            errs.append(f"stops {a['stop']} and {b['stop']} overlap")
        if a["visit_start"] > b["visit_start"]:
            errs.append("stops are not in time order")
    if sum(1 for nd in nodes if nd.get("read")) > A.MAX_READ:
        errs.append("too many read-only nodes")
    for nd in nodes:
        errs += check_node(eng, nd)
    if sum(out["counts"].values()) != len(nodes):
        errs.append("counts do not add up to the nodes")
    return errs


def main():
    eng = A.Angles(PKG)
    results, failed = [], 0

    def case(name, fn):
        nonlocal failed
        t0 = time.perf_counter()
        try:
            errs, note = fn()
        except Exception as e:  # noqa: BLE001
            errs, note = [f"raised {type(e).__name__}: {e}"], None
        ms = round((time.perf_counter() - t0) * 1000, 1)
        ok = not errs
        failed += not ok
        results.append({"case": name, "ok": ok, "ms": ms, "errors": errs, "note": note})
        print(("PASS " if ok else "FAIL ") + name + (f"  ({note})" if note else "") + f"  {ms} ms")
        for e in errs:
            print("     ", e)

    for text, kind, x, y, d, ctx in PARSE:
        def f(text=text, kind=kind, x=x, y=y, d=d, ctx=ctx):
            p = A.parse_question(text)
            got = (p["kind"], p["x"] if x is not None else None, p["y"], p["dir"], p["ctx"])
            want = (kind, x, y, d, ctx)
            return ([] if got == want else [f"got {got}, want {want}"]), None
        case(f"parse: {text}", f)

    def arc_tue():
        out = eng.handle({"screen": "arc", "question": Q, "days": ["tue"], "now": f"{TUE}T13:58:00+02:00"})
        errs = check_arc(eng, out)
        if out["tribe"]["name"] != "XR & immersive":
            errs.append(f"tribe {out['tribe']['name']}, want XR & immersive")
        ids = {nd["id"] for nd in out["nodes"]}
        if 222304 not in ids:
            errs.append("the VR system fidelity paper (222304) is not on the Arc")
        sup = [nd for nd in out["nodes"] if nd["id"] == 222304]
        if sup and sup[0]["angle"] != "support":
            errs.append(f"222304 is {sup[0]['angle']}, want support")
        if sup and "caveat" not in sup[0]["why"]:
            errs.append("222304 should carry the scenario-fidelity null result as a caveat")
        if out["next"] is None or not out["next"]["line"].startswith("Next · "):
            errs.append("no Next card at 13:58")
        states = [nd["state"] for nd in out["nodes"]]
        if states.count("next") > 1:
            errs.append("more than one Next node")
        for a in A.ANGLES:
            shown = [nd for nd in out["nodes"] if nd["angle"] == a and not nd["bundled"]]
            if len(shown) > A.MAP_CAP:
                errs.append(f"{len(shown)} {a} nodes on the map, cap is {A.MAP_CAP}")
            hidden = [nd["id"] for nd in out["nodes"] if nd["angle"] == a and nd["bundled"]]
            if hidden and out["bundles"].get(a, {}).get("ids") != hidden:
                errs.append(f"bundle for {a} does not list its folded nodes")
        if not out["loading"]["text"].startswith("Reading "):
            errs.append("no loading line")
        if not out["tribe"]["look_for"].startswith("Look for the blue diamond"):
            errs.append(f"tribe line {out['tribe']['look_for']!r}")
        return errs, out["summary_line"]
    case("arc: VR fidelity, Tuesday", arc_tue)

    def arc_week():
        out = eng.handle({"screen": "arc", "question": "Does AI assistance reduce critical thinking?",
                          "days": "week", "size": 9})
        return check_arc(eng, out, 9), out["summary_line"]
    case("arc: AI and critical thinking, whole week, 9 nodes", arc_week)

    def arc_formats():
        out = eng.handle({"screen": "arc", "question": "Does haptic feedback improve performance in virtual reality?",
                          "days": ["wed"], "formats": ["demos", "posters"]})
        errs = check_arc(eng, out)
        bad = [nd["id"] for nd in out["nodes"] if nd["badge"] not in ("DEMO", "POSTER")]
        if bad:
            errs.append(f"formats ignored: {bad}")
        return errs, out["summary_line"]
    case("arc: demos and posters only", arc_formats)

    def arc_topic():
        out = eng.handle({"screen": "arc", "question": "VR presence", "days": ["tue"]})
        errs = check_arc(eng, out)
        if out["asked"] != "VR presence":
            errs.append("a topic should be turned into its best question and say so")
        return errs, out["question"]
    case("arc: a topic becomes its sharpest question", arc_topic)

    def arc_state():
        base = eng.handle({"screen": "arc", "question": Q, "days": ["tue"]})
        first = base["nodes"][0]["id"]
        out = eng.handle({"screen": "arc", "question": Q, "days": ["tue"],
                          "state": {"removed": [first], "locked": [base["nodes"][-1]["id"]],
                                    "added": [{"id": 223104, "angle": "challenge"}]}})
        errs = check_arc(eng, out)
        ids = [nd["id"] for nd in out["nodes"]]
        if first in ids:
            errs.append("a removed talk came back")
        if base["nodes"][-1]["id"] not in ids:
            errs.append("a locked talk was dropped")
        added = [nd for nd in out["nodes"] if nd["id"] == 223104]
        if not added or added[0]["angle"] != "challenge":
            errs.append("an added talk did not keep the angle the user chose")
        return [e for e in errs if "Challenge without a result" not in e], None
    case("arc: remove, lock, add with the user's angle", arc_state)

    def ask_topic():
        out = eng.handle({"screen": "ask", "text": "VR presence"})
        errs = []
        if out["kind"] != "topic" or not out["suggestions"]:
            errs.append("a topic should get sharper questions")
        for s in out["suggestions"]:
            q = A.parse_question(s["question"])
            if q["kind"] != "relation":
                errs.append(f"suggestion is not a question with X and Y: {s['question']}")
        return errs, " | ".join(s["question"] for s in out["suggestions"])
    case("ask: topic -> sharper questions", ask_topic)

    def ask_open():
        out = eng.handle({"screen": "ask", "text": "What is accessibility research asking now?"})
        errs = [] if out["kind"] == "open" else ["want kind open"]
        if out["tribe"]["name"] != "Accessibility & aging":
            errs.append(f"tribe {out['tribe']['name']}")
        return errs, " | ".join(s["question"] for s in out["suggestions"])
    case("ask: open question", ask_open)

    def ask_relation():
        out = eng.handle({"screen": "ask", "text": Q})
        errs = [] if out["kind"] == "relation" and out["suggestions"] == [] else ["want a relation, no suggestions"]
        return errs, json.dumps(out["counts"])
    case("ask: a real question gets its counts", ask_relation)

    def ask_typo():
        out = eng.handle({"screen": "ask", "text": "Does hapitc feedbak improve typing?"})
        errs = [] if out["corrected"] == "Does haptic feedback improve typing?" else [f"corrected {out['corrected']}"]
        if out["kind"] != "relation" or out["warning"]:
            errs.append("a corrected question should read like the right one")
        return errs, out["corrected"]
    case("ask: typos fixed against the program's words", ask_typo)

    def ask_warnings():
        off = eng.handle({"screen": "ask", "text": "best pasta recipe for dinner"})
        ko = eng.handle({"screen": "ask", "text": "VR에서 몰입감을 높이려면?"})
        errs = []
        if off["on_topic"] or off["warning"] != A.OFF_TOPIC:
            errs.append("an off-topic question needs the off-topic note")
        if ko["warning"] != A.ENGLISH_ONLY:
            errs.append("a Korean question needs the English-only note (Q21)")
        return errs, off["warning"]["en"]
    case("ask: off-topic and non-English notes", ask_warnings)

    def topic_arc():
        # a topic Arc is built on its sharpest question; the other screens must agree with it
        base = eng.handle({"screen": "arc", "question": "older adults", "days": ["tue"]})
        ids = [nd["id"] for nd in base["nodes"]]
        errs = [] if base["asked"] == "older adults" else ["arc should say what was asked"]
        # a stop whose angle has others to swap in (a lone Support has none, 11/26)
        tap = next(nd["id"] for nd in base["nodes"] if base["available"][nd["angle"]] > 1)
        out = eng.handle({"screen": "edit", "question": "older adults", "days": ["tue"], "nodes": ids, "node": tap})
        if not out["cards"]:
            errs.append("edit on a topic Arc gave no cards")
        nd = eng.handle({"screen": "node", "question": "older adults", "id": ids[0]})
        if (nd["angle"], nd["subtype"]) != (base["nodes"][0]["angle"], base["nodes"][0]["subtype"]):
            errs.append("node detail disagrees with the map")
        return errs, base["question"]
    case("topic Arc: edit and detail use the same question", topic_arc)

    def one_word():
        # 11/26: a short real topic is not off-topic, junk still is; a topic with no sharper
        # question still gets an Arc; a one-talk question names the whole topic
        errs, seen = [], []
        for t in ("loneliness", "TikTok", "passwords", "dating"):
            if eng.handle({"screen": "ask", "text": t})["warning"]:
                errs.append(f"{t}: warned as off-topic")
        for t in ("pizza", "football", "car insurance"):
            if not eng.handle({"screen": "ask", "text": t})["warning"]:
                errs.append(f"{t}: not warned")
        a = eng.handle({"screen": "arc", "question": "TikTok", "when": "week"})
        if not a["nodes"]:
            errs.append("TikTok: an empty Arc")
        for t in ("sleep", "older adults"):
            s = eng.handle({"screen": "ask", "text": t})["suggestions"]
            top = s[0]["question"] if s else ""
            seen.append(top)
            if not all(any(A._same(w, u) for u in A.content(top)[0]) for w in A.content(t)[0]):
                errs.append(f"{t}: first suggestion without the topic: {top!r}")
        return errs, " | ".join(seen)
    case("one word: on topic when talks name it, narrowed with its own words", one_word)

    def off_topic_word():
        # 11/26: "quantization" (no talk names it) is not narrowed into a made-up question,
        # and its tribe is a guess (margin 0); "AI" names its own tribe
        errs = []
        ask = eng.handle({"screen": "ask", "text": "quantization"})
        if not ask["warning"] or ask["suggestions"] or ask["tribe"]["margin"] != 0:
            errs.append("quantization: warning, no suggestions and a margin-0 tribe expected")
        arc = eng.handle({"screen": "arc", "question": "quantization", "when": "week"})
        if arc["question"] != "quantization" or arc["tribe"]["margin"] != 0 or not arc["warning"]:
            errs.append(f"quantization Arc built on {arc['question']!r}, margin {arc['tribe']['margin']}")
        t = eng.handle({"screen": "ask", "text": "AI"})["tribe"]["name"]
        if t != "AI & agents":
            errs.append(f"AI: tribe {t}")
        return errs, f"{arc['question']} · {arc['tribe']['name']} (guess) · AI -> {t}"
    case("off-topic word: no made-up question, tribe a guess; AI names its tribe", off_topic_word)

    def acronyms():
        out = eng.handle({"screen": "angles", "question": Q})
        labels = [c["label"] for a in out["angles"] for c in a["chips"]]
        bad = [x for x in labels if re.search(r"\b(vr|ai|llm)\b", x)]
        return [f"lower-case acronym: {x}" for x in bad], " | ".join(labels)
    case("angles: acronyms upper case on chips", acronyms)

    def hand_angles():
        # a talk added by hand as a Support stays a Support on the list, the detail and the
        # receiver's phone (Figma 18-19): the link carries the hand-set angle
        base = eng.handle({"screen": "arc", "question": Q, "days": ["tue"]})
        ids = [nd["id"] for nd in base["nodes"]]
        card = eng.handle({"screen": "edit", "question": Q, "days": ["tue"], "nodes": ids,
                           "add": "support", "search": "cybersickness"})["cards"][0]
        own = card["angle"]
        mine = eng.handle({"screen": "arc", "question": Q, "days": ["tue"],
                           "state": {"added": [{"id": card["id"], "angle": "support"}]}})
        ids = [nd["id"] for nd in mine["nodes"]]
        ang = {str(card["id"]): "support"}
        errs = []
        on_map = {nd["id"]: nd["angle"] for nd in mine["nodes"]}
        if on_map.get(card["id"]) != "support":
            errs.append(f"map shows {on_map.get(card['id'])}")
        sh = eng.handle({"screen": "shared", "question": mine["question"], "ids": ids, "angles": ang})
        if {nd["id"]: nd["angle"] for nd in sh["nodes"]} != on_map:
            errs.append("the shared Arc differs from the sender's map")
        plain = eng.handle({"screen": "shared", "question": mine["question"], "ids": ids})
        if {nd["id"]: nd["angle"] for nd in plain["nodes"]}.get(card["id"]) == "support" and own != "support":
            errs.append("without angles the engine should fall back to its own angle")
        sm = eng.handle({"screen": "summary", "question": mine["question"], "ids": ids, "angles": ang})
        if card["id"] not in [it["id"] for g in sm["groups"] if g["key"] == "support" for it in g["items"]]:
            errs.append("the list does not show it under Supports")
        nd = eng.handle({"screen": "node", "question": mine["question"], "id": card["id"], "angle": "support"})
        if nd["angle"] != "support":
            errs.append(f"the detail shows {nd['angle']}")
        again = [eng.handle({"screen": "shared", "question": mine["question"], "ids": ids, "angles": ang})["nodes"]
                 for _ in range(3)]
        if any(x != sh["nodes"] for x in again):
            errs.append("the same link gave different Arcs")
        return errs, f"{card['id']}: engine says {own}, user says support; map, list, detail, link agree"
    case("shared: hand-set angles survive the link (18-19)", hand_angles)

    def tradeoff():
        # a Trade-off Challenge is the same X helping and costing in one talk (11/25 evening):
        # "uncertainty visualization improved drilling accuracy by 24% but increased task time"
        # stays; an agent study that only found a cost unrelated to the question does not
        errs, seen = [], []
        for qt, title, want in (("Do visualizations help people understand uncertainty?",
                                 "Visualization of Tracking Uncertainty", True),
                                ("Does self-tracking increase physical activity?", "What to Expect When", True),
                                ("Do conversational agents reduce loneliness?", "Quantifying Latencies", False),
                                ("Do conversational agents reduce loneliness?", "Metacognitive Demands", False)):
            q = eng.question(qt)
            i = next(j for j, it in enumerate(eng.items) if it["title"].startswith(title))
            v = eng.judge(i, q)
            got = bool(v) and v["angle"] == "challenge" and v["subtype"] == "cost"
            seen.append(f"{title[:20]}: {v['angle'] + '/' + v['subtype'] if v else None}")
            if got != want:
                errs.append(f"{qt} / {title}: {'no ' if want else ''}Trade-off expected, got {v}")
        return errs, " | ".join(seen)
    case("judge: a Trade-off needs the X to help as well", tradeoff)

    def doing():
        # what people do, said as the outcome a paper measures
        want = {"Do screen readers help blind users browse the web faster?": ("web browsing speed", "+", "blind users"),
                "Can chatbots help older adults feel less lonely?": ("loneliness", "-", "older adults"),
                "Does gamification make learners more motivated?": ("motivation", "+", "learners"),
                "Does gaze input make target selection faster?": ("target selection", "+", ""),
                "Does sleep tracking improve sleep quality?": ("sleep quality", "+", "")}
        errs = []
        for t, (y, d, ctx) in want.items():
            p = A.parse_question(t)
            if (p["y"], p["dir"], p["ctx"]) != (y, d, ctx):
                errs.append(f"{t} -> {p['y']!r} {p['dir']} {p['ctx']!r}")
        arc = eng.handle({"screen": "arc", "question": "Do screen readers help blind users browse the web faster?",
                          "days": ["tue"]})
        if len(arc["nodes"]) < 4:
            errs.append(f"only {len(arc['nodes'])} nodes for the screen reader question")
        return errs, "; ".join(f"{A.parse_question(t)['y']}" for t in want) + f"; {len(arc['nodes'])} nodes"
    case("ask: verb-phrase outcomes read as outcomes", doing)

    def topic_words():
        # a topic keeps its own words, and its Arc is full
        errs, seen = [], []
        for t in ("haptics", "conversational agents", "LLM agents"):
            s = eng.handle({"screen": "ask", "text": t})["suggestions"]
            top = s[0]["question"] if s else ""
            seen.append(top)
            # its own words, by stem ("haptics" -> "haptic systems", "conversational AI agents")
            if not all(any(A._same(w, u) for u in A.content(top)[0]) for w in A.content(t)[0]):
                errs.append(f"{t}: first suggestion without the topic: {top!r}")
        for t in ("mixed reality", "smartwatch interaction", "How do people track their sleep?"):
            n = len(eng.handle({"screen": "arc", "question": t, "days": ["tue"]})["nodes"])
            if n < A.SIZE:
                errs.append(f"{t}: {n} nodes")
        return errs, " | ".join(seen)
    case("topic: suggestions keep the topic, the Arc is full", topic_words)

    def edit():
        base = eng.handle({"screen": "arc", "question": Q, "days": ["tue"]})
        ids = [nd["id"] for nd in base["nodes"]]
        tap = next(nd for nd in base["nodes"] if nd.get("stop"))
        out = eng.handle({"screen": "edit", "question": Q, "days": ["tue"], "nodes": ids, "node": tap["id"]})
        errs = []
        if out["mode"] != "swap" or out["angle"] != tap["angle"]:
            errs.append("tapping a node should swap within its angle")
        for c in out["cards"]:
            if c["angle"] != tap["angle"]:
                errs.append(f"card {c['id']} has angle {c['angle']}, not {tap['angle']}")
            if c["id"] in ids:
                errs.append(f"card {c['id']} is already on the Arc")
            if c["clash"] and not c["clash"]["text"]:
                errs.append("a clash without text")
        on = [c["on_days"] for c in out["cards"]]
        if on != sorted(on, reverse=True):
            errs.append("cards on the chosen day should come first")
        s = eng.handle({"screen": "edit", "question": Q, "days": ["tue"], "nodes": ids, "search": "haptic gloves"})
        if not s["cards"] or s["filter"] != "search":
            errs.append("search found nothing")
        w = eng.handle({"screen": "edit", "question": Q, "days": ["tue"], "nodes": ids, "add": "reframe",
                        "filter": "wildcard"})
        if w["mode"] != "add" or any("reason" not in c for c in w["cards"]):
            errs.append("wildcard cards need a reason")
        d = eng.handle({"screen": "edit", "question": Q, "days": ["tue"], "nodes": ids, "filter": "debut"})
        if any(not c["debut"] for c in d["cards"]):
            errs.append("the First CHI paper filter let a non-debut talk through")
        clashes = sum(1 for c in out["cards"] if c["clash"])
        return errs, f"{len(out['cards'])} swaps ({clashes} clash), {len(w['cards'])} wildcards, {len(d['cards'])} debut"
    case("edit: swap keeps the angle, add, search, debut, wildcard", edit)

    def angles_chips():
        out = eng.handle({"screen": "angles", "question": Q})
        errs = []
        for a in out["angles"]:
            if len(a["chips"]) > A.CHIPS_K:
                errs.append(f"{a['key']}: {len(a['chips'])} chips")
            if sum(c["selected"] for c in a["chips"]) > A.CHIPS_ON[a["key"]]:
                errs.append(f"{a['key']}: too many chips selected")
            if a["key"] == "challenge" and not a["chips"] and not a["empty"]:
                errs.append("no challenge chips but no empty message")
        picked = [c["id"] for a in out["angles"] for c in a["chips"] if c["selected"]]
        arc = eng.handle({"screen": "arc", "question": Q, "days": "week", "chips": picked})
        on = {nd["id"] for nd in arc["nodes"]}
        want = {x for a in out["angles"] for c in a["chips"] if c["selected"] for x in c["ids"]}
        if want and not (on & want):
            errs.append("none of the picked chips' talks made it onto the Arc")
        return errs, " | ".join(f"{a['name']}: " + ", ".join(c["label"] for c in a["chips"]) for a in out["angles"])
    case("angles: chips per angle steer the Arc", angles_chips)

    def home():
        base = eng.handle({"screen": "arc", "question": Q, "days": ["tue"]})
        ids = [nd["id"] for nd in base["nodes"]]
        out = eng.handle({"screen": "home", "now": f"{TUE}T09:00:00+02:00",
                          "arcs": [{"question": Q, "ids": ids, "heard": []},
                                   {"question": Q, "ids": ids[:1], "heard": ids[:1]}]})
        errs = []
        if out["arcs"][0]["when"] != "Today":
            errs.append(f"when {out['arcs'][0]['when']!r}, want Today")
        if not out["arcs"][1]["when"].endswith("all heard"):
            errs.append("an Arc with everything heard should say so")
        empty = eng.handle({"screen": "home", "arcs": []})
        if not empty["empty"]:
            errs.append("an empty home should say Start with one question.")
        return errs, " | ".join(a["when"] for a in out["arcs"])
    case("home: My Arcs, today and all heard, empty", home)

    def node():
        out = eng.handle({"screen": "node", "question": Q, "id": 222304})
        errs = check_node(eng, out)
        if not out["authors"] or "debut" not in out["authors"][0]:
            errs.append("authors without debut flags")
        if not out["why"]["sentence"] or not out["why"]["sentence"]["highlight"]:
            errs.append("no underlined sentence for why")
        return errs, out["why"]["text"]
    case("node: why, session, authors", node)

    def shared():
        base = eng.handle({"screen": "arc", "question": Q, "days": ["tue"]})
        ids = [nd["id"] for nd in base["nodes"]]
        out = eng.handle({"screen": "shared", "question": Q, "ids": ids, "now": f"{TUE}T09:12:00+02:00"})
        errs = []
        if sorted(nd["id"] for nd in out["nodes"]) != sorted(ids):
            errs.append("the shared Arc lost or gained talks")
        late = eng.handle({"screen": "shared", "question": Q, "ids": ids, "now": f"{TUE}T17:30:00+02:00"})
        if any(nd["keep"] for nd in late["nodes"] if nd["state"] == "ended"):
            errs.append("an ended talk can be kept")
        if not late["pick"]["button"].startswith("Add "):
            errs.append("no Add N to my Arcs button")
        got = {nd["id"]: nd["angle"] for nd in out["nodes"]}
        want = {nd["id"]: nd["angle"] for nd in base["nodes"]}
        if got != want:
            errs.append("the receiver sees other angles than the sender")
        return errs, out["line"]
    case("shared: same angles on the receiver's phone", shared)

    def summary():
        base = eng.handle({"screen": "arc", "question": Q, "days": ["tue"]})
        ids = [nd["id"] for nd in base["nodes"]]
        out = eng.handle({"screen": "summary", "question": Q, "ids": ids, "heard": ids[:2]})
        errs = []
        if out["heard"] != min(2, len(ids)):
            errs.append(f"heard {out['heard']}")
        if "@inproceedings" not in out["reading_list"]["bibtex"]:
            errs.append("no BibTeX")
        if not out["counts"]["challenge"] and not out["open"]:
            errs.append("no challenge but no 'still open' note")
        return errs, json.dumps(out["counts"])
    case("summary: groups, reading list, still open", summary)

    def meta():
        out = eng.handle({"screen": "meta"})
        errs = [] if len(out["tribes"]) == 8 and len(out["angles"]) == 3 else ["want 8 tribes, 3 angles"]
        return errs, None
    case("meta: 8 tribes, 3 angles", meta)

    for name, req in [("error: empty question", {"screen": "arc", "question": ""}),
                      ("error: unknown screen", {"screen": "nope"}),
                      ("error: unknown format", {"screen": "arc", "question": Q, "formats": ["videos"]}),
                      ("error: unknown day", {"screen": "arc", "question": Q, "days": ["sat"]}),
                      ("error: unknown id", {"screen": "node", "question": Q, "id": 1}),
                      ("error: shared without ids", {"screen": "shared", "question": Q, "ids": []})]:
        def f(req=req):
            try:
                eng.handle(req)
            except InputError as e:
                return [], str(e)[:70]
            return ["no error"], None
        case(name, f)

    with open(os.path.join(ROOT, "tests", "angle_results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print(f"\n{len(results) - failed}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
