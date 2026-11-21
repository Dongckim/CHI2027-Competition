#!/usr/bin/env python3
"""CHI 2026 program explorer — filter the whole program by who and where, offline.

A companion to retriever.py. Where the retriever answers "which papers match my
topic", the explorer answers "what is POSTECH presenting", "talks from Korea on
Tuesday", "Geehyuk Lee's work on haptics". It covers all 2,782 program items
(papers, posters, workshops, demos, panels ...), not just papers and posters.

Input (JSON, every field optional but at least one filter or topic):
  {"institution": "postech",          # school / company, acronym or full name
   "department": "computer science",  # department (with institution: same affiliation)
   "country": "korea",                # country of an author's affiliation
   "author": "geehyuk lee",           # author name (all words must match)
   "type": "paper",                   # Paper, Posters, Workshop, Interactive Demos ...
   "session": "haptic",               # the conference's own session names (373 topics)
   "day": "2026-04-14",               # or "04-14" or "tuesday"
   "topic": "haptic feedback",        # rank the matches by relevance (same model)
   "top_k": 20}                       # default 20

Output (JSON):
  {"filters": {...}, "matched": {"institution": [names counted as that school], ...},
   "total": 26, "returned": 20, "sort": "time" | "relevance", "warnings": [],
   "summary": {"by_type": {...}, "by_day": {...}, "matching_authors": 31},
   "results": [{"rank", "id", "type", "title", "authors", "matched_authors",
                "sessions": [{"session", "room", "floor", "start", "end"}],  # with "day",
                                                         # that day's slots come first
                "doi", "score"}]}

{"list": "sessions"} (or "countries", "types", "institutions") returns the values that
exist, with how many program items each has, so you can see what to filter on.

Institution names are written many ways (POSTECH, Pohang University of Science and
Technology, both with parentheses). Names that the data itself writes together as
"Full Name (ACRONYM)" are grouped, so any one spelling finds all of them.

  python explorer.py '{"institution": "postech"}'
  python explorer.py                         # interactive: institution=postech topic=haptics
"""
import difflib
import json
import os
import re
import shlex
import sys
import time
from collections import Counter

import numpy as np

from retriever import BM25, InputError, QueryEncoder, Speller, _minmax, _non_latin, load_expansions, load_matrix

HERE = os.path.dirname(os.path.abspath(__file__))
FILTERS = ("institution", "department", "country", "author", "type", "session", "day")
LISTS = ("sessions", "countries", "types", "institutions")
COUNTRY_ALIASES = {
    "korea": "korea republic of", "south korea": "korea republic of",
    "republic of korea": "korea republic of",
    "usa": "united states", "us": "united states", "america": "united states",
    "united states of america": "united states",
    "uk": "united kingdom", "britain": "united kingdom", "great britain": "united kingdom",
    "england": "united kingdom",
}
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def norm(s):
    s = s.lower().replace("&", " and ")
    return " ".join(re.sub(r"[^\w]+", " ", s).split())


def has_words(text, words):
    """Whole-word containment of a normalized phrase in a normalized text."""
    return f" {words} " in f" {text} "


def has_prefixes(text, words):
    """Every query word starts some word of the text ("haptic" ~ "Haptics + XR")."""
    tw = text.split()
    return all(any(t.startswith(w) for t in tw) for w in words)


def _initials_fit(acro, full):
    """POSTECH ~ Pohang University of Science and Technology: same first letter and
    the acronym's letters appear in order in the full name."""
    acro, full = acro.replace(" ", ""), full.replace(" ", "")
    if len(acro) < 2 or not full or acro[0] != full[0]:
        return False
    it = iter(full)
    return all(ch in it for ch in acro)


_STOP = {"of", "and", "the", "for", "at", "de", "da", "di", "du", "la", "le", "der", "und", "in"}


def _initials(name):
    """'massachusetts institute of technology' -> 'mit'."""
    return "".join(w[0] for w in name.split() if w not in _STOP)


class InstitutionIndex:
    def __init__(self, names):
        self.names = sorted(set(n for n in names if n))
        self.normed = {n: norm(n) for n in self.names}
        # union-find over normalized names, joined when the data writes
        # "Full Name (ACRONYM)" or "ACRONYM (Full Name)"
        parent = {}

        def find(x):
            parent.setdefault(x, x)
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for n in self.names:
            find(norm(n))
            m = re.match(r"^(.*?)\s*\(([^()]+)\)\s*$", n)
            if not m:
                continue
            a, b = norm(m.group(1)), norm(m.group(2))
            short, full = sorted((a, b), key=len)
            if short and full and _initials_fit(short, full):
                parent[find(short)] = find(full)
                parent.setdefault(a, a), parent.setdefault(b, b)
        self.groups = {}
        for key in list(parent):
            self.groups.setdefault(find(key), set()).add(key)
        self.find = find

    def match(self, query):
        """-> (raw names that count as `query`, the subset found only by initials)."""
        q = norm(query)
        terms = {q}
        for key, members in self.groups.items():
            if any(has_words(m, q) for m in members if len(m.split()) <= len(q.split()) + 1):
                terms |= members
        direct = {n for n in self.names if any(has_words(self.normed[n], t) for t in terms)}
        by_initials = set()
        if re.fullmatch(r"[a-z]{2,6}", q):
            # an acronym the data never spells out next to its full name (MIT vs
            # "Massachusetts Institute of Technology"): match on word initials.
            # Acronyms collide (MIT is also Munster Institute of Technology), so
            # these extra names are reported separately.
            extra = set()
            for nn in set(self.normed.values()):
                for part in re.split(r"\b(?:department|school|faculty|college of|lab)\b", nn):
                    if _initials(part) == q and part.strip():
                        extra.add(part.strip())
            by_initials = {n for n in self.names
                           if any(has_words(self.normed[n], t) for t in extra)} - direct
            # a misspelling of a name already found is not another institution
            by_initials = {n for n in by_initials if not any(
                difflib.SequenceMatcher(None, self.normed[n], self.normed[d]).ratio() > 0.9
                for d in direct)}
            direct |= {n for n in self.names if any(has_words(self.normed[n], t) for t in extra)} - by_initials
        return direct | by_initials, by_initials

    def suggest(self, query, n=5):
        pool = {}
        for name, nn in self.normed.items():
            pool.setdefault(nn, name)
        close = difflib.get_close_matches(norm(query), list(pool), n=n, cutoff=0.7)
        return [pool[c] for c in close]


class Explorer:
    def __init__(self, root=HERE, threads=4):
        with open(os.path.join(root, "program.json"), encoding="utf-8") as f:
            self.items = json.load(f)
        self.emb = load_matrix(root, "program")
        self.embed = QueryEncoder(root, threads)
        self.cfg = self.embed.cfg
        # papers and posters also carry their doc2query search phrases (expansions.json)
        exp = load_expansions(root, self.items) or [[] for _ in self.items]
        self.bm25 = BM25([f"{it['title']}. {it['abstract']}" + (f" ; {' ; '.join(e)}" if e else "")
                          for it, e in zip(self.items, exp)])
        self.speller = Speller(self.bm25)
        self.inst = InstitutionIndex(af["institution"] for it in self.items
                                     for a in it["authors"] for af in a["affiliations"])
        self.types = sorted({it["type"] for it in self.items if it["type"]})
        # a few talks are listed twice (same title, another slot): count and show
        # them once, with all their slots
        self.slots_of, first = {}, {}
        for i, it in enumerate(self.items):
            key = (it["type"], it["title"].strip().lower())
            first.setdefault(key, i)
            self.slots_of.setdefault(first[key], []).extend(it["sessions"])
        self.dup = np.array([first[(it["type"], it["title"].strip().lower())] != i
                             for i, it in enumerate(self.items)])

    # -- request ----------------------------------------------------------
    def _parse(self, req):
        if not isinstance(req, dict):
            raise InputError("request must be a JSON object, e.g. "
                             '{"institution": "postech", "topic": "haptics"}')
        unknown = set(req) - set(FILTERS) - {"topic", "top_k", "sort", "list"}
        if unknown:
            raise InputError(f"unknown field(s) {sorted(unknown)}; use any of "
                             f"{list(FILTERS) + ['topic', 'top_k', 'sort', 'list']}")
        f = {k: str(req[k]).strip() for k in FILTERS + ("topic",)
             if req.get(k) is not None and str(req[k]).strip()}
        if not f:
            raise InputError(f"give at least one of {list(FILTERS) + ['topic']}")
        k = self._top_k(req.get("top_k"), 20)
        sort = req.get("sort") or ("relevance" if "topic" in f else "time")
        if sort not in ("relevance", "time"):
            raise InputError('sort must be "relevance" or "time"')
        if sort == "relevance" and "topic" not in f:
            raise InputError('sort "relevance" needs a topic')
        return f, k, sort

    @staticmethod
    def _top_k(k, default):
        if k is None:
            return default
        if isinstance(k, str) and k.strip().isdigit():
            k = int(k)
        elif isinstance(k, float) and k.is_integer():
            k = int(k)
        if isinstance(k, bool) or not isinstance(k, int) or k < 1:
            raise InputError(f"top_k must be a whole number of at least 1, got {json.dumps(k)}")
        return k

    def _day_match(self, day):
        d = day.lower()
        if d in WEEKDAYS or d[:3] in [w[:3] for w in WEEKDAYS]:
            idx = [w[:3] for w in WEEKDAYS].index(d[:3])
            import datetime as _dt
            return lambda start: _dt.date.fromisoformat(start[:10]).weekday() == idx
        m = re.fullmatch(r"(?:\d{4}-)?(\d{1,2})-(\d{1,2})", d)
        if not m:
            raise InputError(f'day must look like "2026-04-14", "04-14" or "tuesday", got "{day}"')
        md = f"{int(m.group(1)):02d}-{int(m.group(2)):02d}"
        return lambda start: start[5:10] == md

    def _slots(self, i, slot_ok=None):
        """All slots of a talk by time; with a day/session filter, matching slots first."""
        return sorted(self.slots_of.get(i, self.items[i]["sessions"]),
                      key=lambda s: (not (slot_ok and slot_ok(s)), s["start"] or "9999"))

    def list_values(self, what, k=None):
        """{"list": "sessions"} -> names with how many program items each has."""
        if what not in LISTS:
            raise InputError(f"list must be one of {list(LISTS)}, got {json.dumps(what)}")
        c = Counter()
        for i, it in enumerate(self.items):
            if self.dup[i]:
                continue
            if what == "sessions":
                c.update(list(dict.fromkeys(s["session"] for s in self._slots(i) if s["session"])))
            elif what == "types":
                c[it["type"]] += 1
            else:
                key = "country" if what == "countries" else "institution"
                c.update(list(dict.fromkeys(af[key] for a in it["authors"] for af in a["affiliations"] if af[key])))
        rows = [{"name": n, "count": v} for n, v in c.most_common(k)]
        return {"list": what, "total": len(c), "returned": len(rows), "items": rows}

    # -- search -----------------------------------------------------------
    def predict(self, req):
        if isinstance(req, dict) and "list" in req:
            return self.list_values(str(req["list"]).strip().lower(),
                                    self._top_k(req.get("top_k"), None))
        f, k, sort = self._parse(req)
        t0 = time.perf_counter()
        matched, warnings = {}, []
        keep = np.ones(len(self.items), dtype=bool)
        why = [[] for _ in self.items]  # authors that satisfied the who-filters

        inst_names = country_terms = None
        if "institution" in f:
            inst_names, by_initials = self.inst.match(f["institution"])
            matched["institution"] = sorted(inst_names)
            if by_initials:
                warnings.append(f"\"{f['institution']}\" was also matched by initials to: "
                                + "; ".join(sorted(by_initials)[:6])
                                + (" ..." if len(by_initials) > 6 else "")
                                + ". Use the full name to leave out other institutions.")
        if "country" in f:
            c = norm(f["country"])
            country_terms = {COUNTRY_ALIASES.get(c, c)}
            names = sorted({af["country"] for it in self.items for a in it["authors"]
                            for af in a["affiliations"]
                            if any(has_words(norm(af["country"]), t) for t in country_terms)})
            matched["country"] = names
            country_terms = {norm(n) for n in names}
        author_words = norm(f["author"]).split() if "author" in f else None
        dept_words = norm(f["department"]).split() if "department" in f else None
        day_ok = self._day_match(f["day"]) if "day" in f else None
        sess_words = norm(f["session"]).split() if "session" in f else None
        slot_ok = None
        if day_ok or sess_words:
            # day and session must hold for the same slot (a haptics session on Tuesday)
            def slot_ok(s):
                return ((not day_ok or bool(s["start"] and day_ok(s["start"])))
                        and (not sess_words or has_prefixes(norm(s["session"]), sess_words)))
        need_aff = inst_names is not None or country_terms is not None or bool(dept_words)

        for i, it in enumerate(self.items):
            if need_aff or author_words:
                hits = []
                for a in it["authors"]:
                    if author_words and not all(has_words(norm(a["name"]), w) for w in author_words):
                        continue
                    affs = [af for af in a["affiliations"]
                            if (inst_names is None or af["institution"] in inst_names)
                            and (country_terms is None or norm(af["country"]) in country_terms)
                            and (not dept_words or has_prefixes(
                                norm(af["department"] + " " + af["institution"]), dept_words))]
                    if need_aff and not affs:
                        continue
                    hits.append({"name": a["name"],
                                 **({k2: affs[0][k2] for k2 in ("institution", "department", "country")}
                                    if affs else {})})
                if not hits:
                    keep[i] = False
                    continue
                why[i] = hits
            if "type" in f and norm(f["type"]).rstrip("s") not in norm(it["type"]):
                keep[i] = False
            if slot_ok and not any(slot_ok(s) for s in it["sessions"]):
                keep[i] = False

        # a listed-twice talk counts once: fold the copy into the first listing
        for i in np.flatnonzero(keep & self.dup):
            j = next(j for j, it in enumerate(self.items)
                     if not self.dup[j] and it["title"].strip().lower()
                     == self.items[i]["title"].strip().lower()
                     and it["type"] == self.items[i]["type"])
            keep[j] = True
            why[j] = why[j] or why[i]
        keep &= ~self.dup
        idx = np.flatnonzero(keep)
        if "author" in f:
            matched["author"] = sorted({h["name"] for i in idx for h in why[i]})
        if "type" in f:
            matched["type"] = [t for t in self.types if norm(f["type"]).rstrip("s") in norm(t)]
        if "department" in f:
            matched["department"] = sorted({h.get("department") or h.get("institution", "")
                                            for i in idx for h in why[i]})
        if sess_words:
            matched["session"] = sorted({s["session"] for i in idx for s in self._slots(i)
                                         if slot_ok(s)})

        score = None
        if "topic" in f and len(idx):
            if _non_latin(f["topic"]):
                warnings.append("The model understands English only; non-English words in "
                                "topic are ignored and the ranking may be unrelated.")
            topic = self.speller(f["topic"])
            sim = self.emb @ self.embed(topic)
            score = _minmax(sim) + self.cfg["hybrid_w"] * _minmax(self.bm25.scores(topic))
        if sort == "relevance":
            idx = idx[np.argsort(-score[idx], kind="stable")]
        else:
            idx = sorted(idx, key=lambda i: (self._slots(i, slot_ok)[0]["start"]
                                            if self._slots(i, slot_ok) and
                                            self._slots(i, slot_ok)[0]["start"]
                                            else "9999", self.items[i]["title"]))

        out = {"filters": f, "matched": matched, "total": int(len(idx)),
               "returned": min(k, len(idx)), "sort": sort, "warnings": warnings}
        if not len(idx):
            if "institution" in f and not inst_names:
                sug = self.inst.suggest(f["institution"])
                warnings.append(f"No institution matches \"{f['institution']}\"."
                                + (f" Did you mean: {', '.join(sug)}?" if sug else ""))
            elif dept_words and need_aff and (inst_names is not None or country_terms is not None):
                # the department may be written differently (KAIST's CS is "School of
                # Computing"): show what this institution/country actually lists
                depts = Counter(af["department"] for it in self.items for a in it["authors"]
                                for af in a["affiliations"] if af["department"]
                                and (inst_names is None or af["institution"] in inst_names)
                                and (country_terms is None or norm(af["country"]) in country_terms))
                warnings.append(f"No department matching \"{f['department']}\" here. Departments "
                                "listed: " + "; ".join(d for d, _ in depts.most_common(8)))
            else:
                warnings.append("Nothing matches all filters together; try fewer filters.")
        days = Counter(s["start"][:10] for i in idx for s in self._slots(i, slot_ok)[:1] if s["start"])
        out["summary"] = {
            "by_type": dict(Counter(self.items[i]["type"] for i in idx).most_common()),
            "by_day": dict(sorted(days.items())),
            "matching_authors": len({h["name"] for i in idx for h in why[i]}),
        }
        out["results"] = [{
            "rank": r + 1, "id": self.items[i]["id"], "type": self.items[i]["type"],
            "title": self.items[i]["title"],
            "authors": [a["name"] for a in self.items[i]["authors"]],
            "matched_authors": why[i],
            "sessions": self._slots(i, slot_ok),
            "doi": self.items[i]["doi"],
            "score": round(float(score[i]), 4) if score is not None else None,
        } for r, i in enumerate(idx[:k])]
        out["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        return out


# -- CLI -------------------------------------------------------------------
def print_out(out):
    if "list" in out:
        print(f"\n{out['total']} {out['list']} (showing {out['returned']})")
        for r in out["items"]:
            print(f"  {r['count']:>4}  {r['name']}")
        return
    f = ", ".join(f"{k}={v}" for k, v in out["filters"].items())
    print(f"\n{out['total']} item(s) for {f}  (showing {out['returned']}, by {out['sort']}, "
          f"{out['latency_ms']} ms)")
    if "institution" in out["matched"]:
        print("  counted as this institution: " + "; ".join(out["matched"]["institution"][:8])
              + (" ..." if len(out["matched"]["institution"]) > 8 else ""))
    if out["summary"]["by_type"]:
        print("  by type: " + ", ".join(f"{t} {n}" for t, n in out["summary"]["by_type"].items()))
    for w in out["warnings"]:
        print(f"  ! {w}")
    print()
    for r in out["results"]:
        print(f"{r['rank']:>2}. [{r['type']}] {r['title']}")
        show_dept = "department" in out["filters"]
        who = "; ".join(
            h["name"] + (f" ({', '.join(x for x in (h.get('department') if show_dept else '', h.get('institution')) if x)})"
                         if h.get("institution") else "")
            for h in r["matched_authors"][:3])
        if who:
            print(f"    matched: {who}")
        if r["sessions"]:
            s = r["sessions"][0]
            when = f"{s['start'][5:10]} {s['start'][11:16]}" if s["start"] else "time TBA"
            more = f" (+{len(r['sessions']) - 1} more slot)" if len(r["sessions"]) > 1 else ""
            print(f"    {s['room'] or 'room TBA'} · {when}{more}")
        print()


def interactive(ex):
    print("CHI 2026 program explorer (offline). Type filters as key=value, e.g.\n"
          "  institution=postech    country=korea day=tuesday    "
          "author=\"geehyuk lee\" topic=haptics\n"
          "  institution=kaist department=computing    session=haptic    "
          "list=sessions top_k=30\n'q' to quit.")
    while True:
        try:
            line = input("\nexplorer> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if line.lower() in ("q", "quit", "exit"):
            return
        if not line:
            continue
        try:
            req = dict(tok.split("=", 1) for tok in shlex.split(line) if "=" in tok)
            print_out(ex.predict(req))
        except (InputError, ValueError) as e:
            print(f"  ! {e}")


def main():
    if len(sys.argv) == 1 and sys.stdin.isatty():
        return interactive(Explorer())
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    try:
        try:
            req = json.loads(raw)
        except json.JSONDecodeError as e:
            raise InputError(f"input is not valid JSON ({e.msg} at position {e.pos})")
        out = Explorer().predict(req)
    except InputError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(2)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
