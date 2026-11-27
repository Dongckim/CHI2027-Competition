#!/usr/bin/env python3
"""What attendees will type, and what the talks behind each say (input for gen_narrow.py).

A word or a session name ("sleep", "older adults", "Music & Haptics") is turned into three
sharper questions on the ask screen. On the phone that is put together from card phrases,
and for one word it often reads oddly ("Does laboratory-comparable sleep staging improve
dream engineering system?"). The inputs are mostly predictable, so an LLM writes the
questions once, offline, from the talks that match (11/27).

Terms: CHI 2026 session names and topic / sub-topic names, and the words and two-word
phrases that at least DF talks use and that are part of at least CARD_MIN card factors,
outcomes or groups of people (so "sleep", "VR" and "older adults" are in, "participants" and
"this paper" are not).
For each term, the engine's own first TOP talks (the pool the ask screen reads), each with
its title and the questions its results answer (angles.json "cq").

Output: data/processed/narrow_todo.json  [{"term", "key", "talks": [{"id", "title", "qs", "finds"}]}]

  python scripts/build_narrow_todo.py
"""
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "src", "package"))
os.environ.setdefault("CHI_ANGLES_DIR", os.path.join(ROOT, "data", "processed"))
import angles as A  # noqa: E402

PKG = os.path.join(ROOT, "dist", "chi2026-retriever")
OUT = os.path.join(ROOT, "data", "processed", "narrow_todo.json")
DF = 5            # talks that use the term
CARD_MIN = 3      # card factors, outcomes or groups of people the term is part of
TOP = 12          # talks shown to the LLM per term
MAX_TERMS = 5000
# words of method and reporting, not of a research subject
METHOD = set("""study studies participant participants finding findings result results interview interviews
survey surveys paper papers work works approach approaches method methods analysis data user users people
researcher researchers designer designers experiment experiments evaluation evaluations system systems tool
tools technique techniques framework frameworks task tasks condition conditions effect effects impact impacts
outcome outcomes factor factors level levels performance use usage practice practices experience experiences
process processes need needs way ways implication implications insight insights challenge challenges
opportunity opportunities feature features context contexts setting settings model models prototype
prototypes interface interfaces application applications technology technologies""".split())


def key_of(text):
    """The lookup key: content words, stemmed ("LLMs" and "LLM", "robots" and "robot" alike)."""
    return " ".join(A.stem(w) for w in A.content(text.lower())[0])


def terms(eng):
    prog = eng.arc.items
    acro = set(A.ACRONYMS.split())
    # card phrases (factor, outcome, who) that contain a stemmed word or two-word phrase
    inside, heads = Counter(), Counter()
    for info in eng.info.values():
        for c in info["cards"]:
            for p in {c["f"], c["o"]} | ({c["p"]} if c["p"] >= 0 else set()):
                # the same raw words, stemmed, as the counts below (not the parser's content words)
                t = [A.stem(w) for w in A._W.findall(eng.phrases[p].lower()) if w not in A.STOPW]
                inside.update(set(t) | {a + " " + b for a, b in zip(t, t[1:])})
                if t:
                    heads[t[-1]] += 1

    def word(w):
        return (len(w) >= 3 or w in acro) and not w.isdigit() and w not in A.STOPW

    def ok(w):
        return word(w) and w not in METHOD and w not in A.GENERIC and w not in A.PLAIN
    df = Counter()
    surface = {}
    for it in prog:
        toks = A._W.findall((it["title"] + ". " + (it["abstract"] or "")).lower())
        seen = set()
        for i, w in enumerate(toks):
            if not word(w):
                continue
            if ok(w):
                seen.add((A.stem(w), w))
            # two words, one of them a subject word ("remote work", "user experience")
            if i + 1 < len(toks) and word(toks[i + 1]) and (ok(w) or ok(toks[i + 1])):
                seen.add((A.stem(w) + " " + A.stem(toks[i + 1]), w + " " + toks[i + 1]))
        for k, s in seen:
            df[k] += 1
            surface.setdefault(k, Counter())[s] += 1
    # one word must also end a phrase twice, where the noun goes ("sleep", not "difficult" or "often")
    words = [(k, n) for k, n in df.items() if n >= DF and inside[k] >= CARD_MIN
             and (" " in k or heads[k] >= 2 or inside[k] >= 6 or k in acro)]
    words.sort(key=lambda kv: (-kv[1], kv[0]))
    out = {}
    for k, _ in words[:MAX_TERMS]:
        term = surface[k].most_common(1)[0][0]
        if key_of(term):
            out.setdefault(key_of(term), term)
    # session and topic names, as the programme writes them
    names = {s["session"] for it in prog for s in it.get("sessions", []) if s.get("session")
             and not re.search(r"meet-?up|workshop|keynote|panel|award|break|lunch|reception", s["session"], re.I)}
    clusters = json.load(open(os.path.join(PKG, "clusters.json"), encoding="utf-8"))["clusters"]
    for c in clusters:
        names.add(c["label"])
        for s in c.get("subclusters") or []:
            names.add(s["label"])
    for n in sorted(names):
        k = key_of(n)
        if k and k not in out:
            out[k] = n
    return out


def main():
    eng = A.Angles(PKG)
    types = eng._types(eng._formats({}))
    todo = []
    for k, term in sorted(terms(eng).items(), key=lambda kv: kv[1].lower()):
        q = eng.question(term)
        if q["kind"] == "relation" or eng._warning(q, types):
            continue
        _, pool, _ = eng._judged(q, types)
        talks = []
        for i in pool[:TOP]:
            info = eng.info.get(i) or {}
            qs = list(dict.fromkeys(A.show(eng.phrases[qp]) for _, qp, _, _, g in info.get("cq", []) if g != A.AFFECTS))[:4]
            # a talk without written questions shows its results in one plain sentence each instead
            finds = [] if qs else [v for v in list((info.get("sum") or {}).values())[:2] if v]
            talks.append({"id": eng.items[i]["id"], "title": eng.items[i]["title"], "qs": qs, "finds": finds})
        todo.append({"term": term, "key": k, "talks": talks})
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(todo, f, ensure_ascii=False)
    print(f"{len(todo)} terms -> {OUT}")


if __name__ == "__main__":
    main()
