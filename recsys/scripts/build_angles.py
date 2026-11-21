#!/usr/bin/env python3
"""Turn the LLM's finding cards into the files the Arc engine reads on the phone.

  data/processed/findings_raw/shard_*.json   (scripts/gen_findings.py, GPU)
     data/processed/concepts_raw/shard_*.json  (scripts/gen_concepts.py, GPU; optional)
  -> data/processed/angles.json              cards with character offsets, labels, tribes,
                                             debut authors, the tribe table
     data/processed/phrase_vec.npy           one int8 vector per phrase (the on-device
     data/processed/phrase_scale.npy         encoder, so the phone compares like with like)

Checks made here, so a wrong LLM answer never reaches a screen:
  - every factor / outcome / population / construct must be found in the abstract
    word for word (case, quotes, dashes and spaces aside); otherwise it is dropped,
    and a card without both factor and outcome is dropped;
  - the label is 1-4 words, else the title's first words are used;
  - an item the LLM gave no tribe gets one from keyword rules (field words first, AI last).

Debut authors: names of 2026 paper authors not among the paper authors of CHI 2023-2025
(programme data in data/raw/chi20xx.json, or CHI_PAST_DIR). Name match only.

  python scripts/build_angles.py
"""
import glob
import json
import os
import re
import sys
from collections import Counter

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "package"))
import config  # noqa: E402
from gen_findings import TRIBES, EFFECTS, STATUS, split_sentences  # noqa: E402
from angles import NO_FINDINGS, content, lemma, stem  # noqa: E402

PROC = os.path.join(config.ROOT, "data", "processed")
PKG = os.path.join(config.ROOT, "dist", "chi2026-retriever")
PAST_DIR = os.environ.get("CHI_PAST_DIR", os.path.join(config.ROOT, "data", "raw"))
VERSION = os.environ.get("CHI_ANGLES_VERSION", "2026-11-17")
# directions the third pass may correct: a card stored without one ("associated")
EFFECT_FIX = set(os.environ.get("CHI_EFFECT_FIX", "associated").split(","))

# team PDF section 3: name, shape, colour, CHI subcommittees
TRIBE_TABLE = [
    {"name": "AI & agents", "shape": "triangle", "symbol": "▲", "color": "#9B6BFF",
     "subcommittees": ["Computational Interaction (part)"]},
    {"name": "XR & immersive", "shape": "diamond", "symbol": "◆", "color": "#4C7DFF", "subcommittees": []},
    {"name": "Accessibility & aging", "shape": "circle", "symbol": "●", "color": "#2FBF71",
     "subcommittees": ["Accessibility and Aging"]},
    {"name": "Health & wellbeing", "shape": "plus", "symbol": "✚", "color": "#FF6B6B",
     "subcommittees": ["Health"]},
    {"name": "Learning & families", "shape": "square", "symbol": "■", "color": "#FFC234",
     "subcommittees": ["Learning, Education, and Families"]},
    {"name": "Society & communities", "shape": "star", "symbol": "★", "color": "#FF7AC6",
     "subcommittees": ["Critical Computing", "Privacy and Security", "Interaction Beyond the Individual"]},
    {"name": "Devices & interaction", "shape": "hexagon", "symbol": "⬢", "color": "#19C3D6",
     "subcommittees": ["Novel Devices", "Interacting with Devices", "Blending Interaction"]},
    {"name": "Design & creativity", "shape": "pentagon", "symbol": "⬟", "color": "#E6E6E6",
     "subcommittees": ["Design", "Games and Play"]},
]
TRIBE_IDX = {t["name"]: k for k, t in enumerate(TRIBE_TABLE)}
assert set(TRIBE_IDX) == set(TRIBES)
# keyword fallback, field words first and AI last (team PDF: otherwise AI takes half)
RULES = [
    ("Accessibility & aging", r"\b(accessib\w*|blind|low[- ]vision|deaf|hard of hearing|disabilit\w*|"
                              r"screen reader\w*|older adults?|aging|ageing|dementia|autis\w*|adhd|"
                              r"wheelchair|neurodiver\w*|assistive)\b"),
    ("XR & immersive", r"\b(virtual reality|vr|augmented reality|ar|mixed reality|xr|immersive|"
                       r"head-mounted|hmd|avatar\w*|metaverse|presence)\b"),
    ("Health & wellbeing", r"\b(health\w*|mental|wellbeing|well-being|clinic\w*|patient\w*|therap\w*|"
                           r"medical|stress|anxiety|depress\w*|sleep|fitness|physical activity|care)\b"),
    ("Learning & families", r"\b(learn\w*|educat\w*|student\w*|teacher\w*|classroom\w*|children|child|"
                            r"kids?|parent\w*|famil\w*|tutor\w*|school\w*)\b"),
    ("Devices & interaction", r"\b(haptic\w*|wearable\w*|sensor\w*|input|gesture\w*|touch\w*|"
                              r"fabricat\w*|smartwatch\w*|eye[- ]tracking|gaze|textile\w*|keyboard\w*|"
                              r"robot\w*|drone\w*)\b"),
    ("Design & creativity", r"\b(design\w*|creativ\w*|art\w*|music\w*|game\w*|play\w*|visuali[sz]\w*|"
                            r"sketch\w*|craft\w*)\b"),
    ("Society & communities", r"\b(social media|communit\w*|privacy|security|ethic\w*|politic\w*|"
                              r"labou?r|worker\w*|misinformation|sustainab\w*|culture\w*|online)\b"),
    ("AI & agents", r"\b(ai|llms?|large language models?|agents?|chatbots?|machine learning|"
                    r"generative|gpt\w*)\b"),
]


def _norm_map(text):
    """Lower-cased text with quotes, dashes and runs of space unified, plus a map from
    each normalized character back to its offset in the original."""
    trans = {"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "‐": "-", "‑": "-",
             " ": " ", "\r": " ", "\n": " ", "\t": " "}
    out, idx = [], []
    prev_space = False
    for k, ch in enumerate(text):
        ch = trans.get(ch, ch).lower()
        if ch == " ":
            if prev_space:
                continue
            prev_space = True
        else:
            prev_space = False
        out.append(ch)
        idx.append(k)
    return "".join(out), idx


def locate(abstract, nab, idx, phrase, sent=None):
    """Offsets of the phrase in the abstract, inside sentence `sent` first; None if absent."""
    p, _ = _norm_map(phrase.strip().strip(".,;:\"'"))
    p = p.strip()
    if len(p) < 2:
        return None
    pat = re.compile(r"(?<![a-z0-9])" + re.escape(p) + r"(?![a-z0-9])")
    spans = [(m.start(), m.end()) for m in pat.finditer(nab)]
    if not spans:
        return fuzzy(abstract, phrase, sent)
    if sent:
        inside = [s for s in spans if sent[0] <= idx[s[0]] < sent[1]]
        spans = inside or spans
    a, b = spans[0]
    return idx[a], idx[b - 1] + 1


def split_list(phrase):
    """"core metrics like trust, perceived safety, or mental load" -> ["trust",
    "perceived safety", "mental load"]: the LLM sometimes returns a list as one phrase.
    Each part stays a substring of the original, so it is still verbatim."""
    p = phrase.strip()
    m = re.search(r"\b(?:such as|like|including|e\.g\.,?)\s+", p)
    if m and len(p[m.end():].split()) >= 1:
        p = p[m.end():]
    parts = [x.strip(" ,;") for x in re.split(r",\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+", p)]
    parts = [x for x in parts if x]
    if len(parts) <= 1 or any(len(x.split()) > 4 for x in parts):
        return [p] if len(p.split()) <= 8 else []
    return parts[:3]


def fuzzy(abstract, phrase, sent):
    """The LLM changed a word form ("sense of ownership" for "senses of ownership"):
    the shortest span of the sentence that holds the phrase's content words in order
    (same stems), at most 2 words longer. The span is copied from the abstract."""
    if not sent:
        return None
    want = [stem(w) for w in content(phrase)[0]]
    if not want:
        return None
    words = [(m.start() + sent[0], m.end() + sent[0], stem(lemma(m.group(0).lower())))
             for m in re.finditer(r"[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*", abstract[sent[0]:sent[1]])]
    n = len(phrase.split())
    best = None
    for a in range(len(words)):
        if words[a][2] != want[0]:
            continue
        k, b = 1, a
        while k < len(want) and b + 1 < len(words) and b + 1 - a < n + 2:
            b += 1
            if words[b][2] == want[k]:
                k += 1
        if k == len(want) and (best is None or b - a < best[1] - best[0]):
            best = (a, b)
    if best is None:
        return None
    return words[best[0]][0], words[best[1]][1]


_DIR_WORDS = r"(?:increase[sd]?|decrease[sd]?|reduce[sd]?|reduction|improve[sd]?|improvement|higher|lower|" \
             r"greater|enhanced|enhancement|associated|no[ _]effect|mixed|more|less)"


def clean_claim(p):
    """The LLM sometimes writes the direction into a claim ("spatial awareness, increase",
    "reduced stress"): keep only the thing itself."""
    p = re.sub(r",.*$", "", p.strip())
    p = re.sub(rf"^{_DIR_WORDS}\s+(?:in\s+|of\s+)?", "", p)
    p = re.sub(rf"\s+{_DIR_WORDS}$", "", p)
    return " ".join(p.split())


def tribe_rule(it):
    text = (it["title"] + " " + it["abstract"]).lower()
    best, hits = None, 0
    for name, pat in RULES:
        n = len(re.findall(pat, text))
        if n >= 2 and n > hits:
            best, hits = name, n
            break                    # first field that is clearly there wins
    return best or "Design & creativity"


def short_label(label, title):
    words = label.split()
    if 1 <= len(words) <= 4 and len(label) <= 32:
        return label[0].upper() + label[1:]
    head = re.split(r"[:?—–-]\s", title)[0].split()
    return " ".join(head[:3])


def past_authors():
    names, years = set(), []
    for f in sorted(glob.glob(os.path.join(PAST_DIR, "chi20*.json"))):
        m = re.search(r"chi(20\d\d)\.json$", f)
        if not m or m.group(1) == "2026":
            continue
        with open(f, encoding="utf-8") as fh:
            d = json.load(fh)
        types = {t["id"]: t["name"] for t in d.get("contentTypes", [])}
        pm = {p["id"]: " ".join(f"{p.get('firstName', '')} {p.get('lastName', '')}".split()).lower()
              for p in d.get("people", [])}
        for c in d.get("contents", []):
            if types.get(c.get("typeId")) in ("Paper", "Journals"):
                for a in c.get("authors", []):
                    if pm.get(a.get("personId")):
                        names.add(pm[a["personId"]])
        years.append(m.group(1))
    return names, years


def main():
    with open(os.path.join(PROC, "program.json"), encoding="utf-8") as f:
        program = json.load(f)
    raw = {}
    for f in sorted(glob.glob(os.path.join(PROC, "findings_raw", "shard_*.json"))):
        with open(f, encoding="utf-8") as fh:
            raw.update(json.load(fh))
    by_title = {}
    for it in program:
        by_title.setdefault((it["type"], it["title"].strip().lower()), it["id"])
    concepts, claims = {}, {}
    for f in sorted(glob.glob(os.path.join(PROC, "concepts_raw", "shard_*.json"))):
        with open(f, encoding="utf-8") as fh:
            concepts.update(json.load(fh))
    for f in sorted(glob.glob(os.path.join(PROC, "concepts_raw", "claims_shard_*.json"))):
        with open(f, encoding="utf-8") as fh:
            claims.update(json.load(fh))
    results = {}
    for f in sorted(glob.glob(os.path.join(PROC, "results_raw", "shard_*.json"))):
        with open(f, encoding="utf-8") as fh:
            results.update(json.load(fh))
    past, years = past_authors()
    print(f"findings for {len(raw)} items; past paper authors {len(past)} ({', '.join(years)})")

    phrases, pidx = [], {}

    def pid(text):
        key = " ".join(text.lower().split())
        if key not in pidx:
            pidx[key] = len(phrases)
            phrases.append(key)
        return pidx[key]

    stats = Counter()
    items = {}
    for it in program:
        src = raw.get(str(it["id"])) or raw.get(str(by_title.get((it["type"], it["title"].strip().lower()))))
        if src is None:
            stats["no_findings"] += 1
            continue
        ab = it["abstract"][:3000]
        nab, idx = _norm_map(ab)
        sents = split_sentences(ab)
        cards = []
        pairs = []
        for c in src.get("findings", []):
            stats["cards_in"] += 1
            s = sents[c["s"] - 1] if 1 <= c["s"] <= len(sents) else None
            fl, ol = split_list(c["factor"]), split_list(c["outcome"])
            if len(fl) * len(ol) > 1:
                stats["cards_split"] += 1
            if not fl or not ol:
                stats["cards_dropped_too_long"] += 1
            for f_ in fl:
                for o_ in ol:
                    pairs.append((c, s, f_, o_))
        for c, s, f_, o_ in pairs[:8]:
            fs = locate(ab, nab, idx, f_, s)
            os_ = locate(ab, nab, idx, o_, s)
            if not fs or not os_:
                stats["cards_dropped_not_verbatim"] += 1
                continue
            # the sentence the card came from: the one holding the outcome
            sent = next(((a, b) for a, b in sents if a <= os_[0] < b), s or (0, len(ab)))
            ps = locate(ab, nab, idx, c["population"], sent) if c.get("population") else None
            cards.append([pid(ab[fs[0]:fs[1]]), pid(ab[os_[0]:os_[1]]),
                          pid(ab[ps[0]:ps[1]]) if ps else -1,
                          EFFECTS.index(c["effect"]), STATUS.index(c["status"]),
                          sent[0], sent[1], fs[0], fs[1], os_[0], os_[1]])
            stats["cards_kept"] += 1
        # the third pass (scripts/gen_results.py): directions read again, results the
        # first pass missed, and broader names for every card phrase
        # (a workshop or panel states aims, not results: its directions and "more" stay out)
        res = results.get(str(it["id"])) or {}
        if it["type"] in NO_FINDINGS:
            res = {"cards": [dict(r, effect="") for r in res.get("cards", [])], "more": []}
        ups = {}

        def add_up(p_, names):
            l1, l2 = ups.setdefault(p_, ([], []))
            for lvl, t in zip((l1, l2), names):
                t = pid(t)
                if t != p_ and t not in lvl:
                    lvl.append(t)
        for r in res.get("cards", []):
            k = r["card"] - 1
            if k >= len(cards):
                continue
            c = cards[k]
            e = r.get("effect")
            if e in ("increase", "decrease") and EFFECTS[c[3]] in EFFECT_FIX:
                c[3] = EFFECTS.index(e)
                stats["effects_fixed"] += 1
            add_up(c[0], r.get("factor_up", []))
            add_up(c[1], r.get("outcome_up", []))
        have = {(c[0], c[1]) for c in cards}
        for m in res.get("more", []):
            s = sents[m["s"] - 1] if 1 <= m["s"] <= len(sents) else None
            fs = locate(ab, nab, idx, m["factor"], s)
            os_ = locate(ab, nab, idx, m["outcome"], s)
            if not fs or not os_ or len(m["factor"].split()) > 6 or len(m["outcome"].split()) > 5:
                stats["more_dropped"] += 1
                continue
            sent = next(((a, b) for a, b in sents if a <= os_[0] < b), s or (0, len(ab)))
            f_, o_ = pid(ab[fs[0]:fs[1]]), pid(ab[os_[0]:os_[1]])
            if (f_, o_) in have:
                continue
            have.add((f_, o_))
            cards.append([f_, o_, -1, EFFECTS.index(m["effect"]), STATUS.index("result"),
                          sent[0], sent[1], fs[0], fs[1], os_[0], os_[1]])
            add_up(f_, m.get("factor_up", []))
            add_up(o_, m.get("outcome_up", []))
            stats["more_kept"] += 1
        meas = []
        for m in src.get("measures", []):
            s = sents[m["s"] - 1] if 1 <= m["s"] <= len(sents) else None
            cs = locate(ab, nab, idx, m["construct"], s)
            if cs:
                sent = next(((a, b) for a, b in sents if a <= cs[0] < b), (0, len(ab)))
                meas.append([pid(ab[cs[0]:cs[1]]), sent[0], sent[1], cs[0], cs[1]])
        tribe = src.get("tribe")
        if tribe not in TRIBE_IDX:
            tribe = tribe_rule(it)
            stats["tribe_by_rule"] += 1
        # general names for matching only (scripts/gen_concepts.py), never quoted
        con = concepts.get(str(it["id"]))
        gen, about = [], [[], [], []]
        if con:
            used = sorted({c[0] for c in cards} | {c[1] for c in cards} | {m[0] for m in meas})
            for p_ in used:
                ts = [pid(t) for t in con["terms"].get(phrases[p_], []) if t != phrases[p_]]
                if ts:
                    gen.append([p_, ts])
            about = [[pid(t) for t in con["about"].get(k, [])] for k in ("factors", "outcomes", "people")]
            stats["items_with_concepts"] += 1
        # each card restated in question words (gen_concepts.py --task claims)
        cl = []
        for k, f_, o_ in (claims.get(str(it["id"])) or {}).get("claims", []):
            f_, o_ = clean_claim(f_), clean_claim(o_)
            if k < len(cards) and f_ and o_:
                cl.append([k, pid(f_), pid(o_)])
        rec = {"label": short_label(src.get("label", ""), it["title"]),
               "contribution": src.get("contribution", ""), "tribe": TRIBE_IDX[tribe],
               "cards": cards, "measures": meas, "gen": gen, "about": about, "claims": cl,
               "up": [[p_, l1, l2] for p_, (l1, l2) in ups.items()]}
        if it["type"] in ("Paper", "Journals"):
            deb = [k for k, a in enumerate(it["authors"])
                   if " ".join(a["name"].split()).lower() not in past]
            rec["debut"] = deb
            rec["first_debut"] = int(0 in deb)
        items[str(it["id"])] = rec
    # vectors from the on-device encoder
    sys.path.insert(0, PKG)
    from retriever import QueryEncoder
    enc = QueryEncoder(PKG)
    vec = np.stack([enc(p) for p in phrases]).astype(np.float32)
    vec /= np.maximum(np.linalg.norm(vec, axis=1, keepdims=True), 1e-9)
    scale = np.abs(vec).max(1) / 127.0
    q = np.round(vec / scale[:, None]).astype(np.int8)
    np.save(os.path.join(PROC, "phrase_vec.npy"), q)
    np.save(os.path.join(PROC, "phrase_scale.npy"), scale.astype(np.float32))
    out = {"version": VERSION, "tribes": TRIBE_TABLE, "phrases": phrases, "items": items,
           "debut_years": years,
           "note": "Finding cards from scripts/gen_findings.py (LLM, offline) and "
                   "scripts/build_angles.py. Phrases are copied from the abstracts; offsets "
                   "index into program.json abstracts."}
    with open(os.path.join(PROC, "angles.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    tc = Counter(TRIBE_TABLE[r["tribe"]]["name"] for r in items.values())
    rule_agree = sum(TRIBE_TABLE[r["tribe"]]["name"] == tribe_rule(it) for it in program
                     if str(it["id"]) in items for r in [items[str(it["id"])]])
    print(json.dumps({**stats, "items": len(items), "phrases": len(phrases),
                      "tribes": tc.most_common(), "tribe_rule_agreement": round(rule_agree / max(1, len(items)), 3),
                      "first_debut_papers": sum(r.get("first_debut", 0) for r in items.values()),
                      "effects": Counter(EFFECTS[c[3]] for r in items.values() for c in r["cards"]).most_common(),
                      "status": Counter(STATUS[c[4]] for r in items.values() for c in r["cards"]).most_common()},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
