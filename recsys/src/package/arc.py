#!/usr/bin/env python3
"""ARC screen API — one JSON request per screen of the ARC mobile wireframes, offline.

The wireframes (Figma "ARC Mobile Wireframes", page "피드백 반영본") are the source of
truth for what each screen shows; this file returns exactly the data each screen
needs. It sits on top of retriever.py / explorer.py (same model, same vectors) and
adds what the screens ask for: keywords from a sentence, related topics, a timed
route for a day, a wildcard paper, overlaps, people to meet, similar talks, author
pages, a day wrap-up and walking estimates.

Every request is {"screen": <name>, ...}. The app keeps the user's answers and
actions on the phone and sends them along; the model keeps no state.

  profile  {"research": "I study haptic feedback for VR",   # 01-1 (English)
            "keywords": ["haptic feedback", "VR"],          # 01-2 topics left on
            "topics": ["Accessibility in Everyday Life"],   # 01-2 related / 01-3 picks
            "days": ["tue", "wed", "thu"],                  # 02-1
            "tracks": ["Papers", "Posters", "Demos"],       # 02-2
            "language": "en",                                # 02-3 (summaries: app side)
            "step_free": true,                               # 02-4
            "pace": "balanced",                              # O-5c light / balanced / full
            "needs": ["step_free", "breaks"]}                # O-4 (also: fewer_room_changes,
                                                             # larger_text, summaries: app side)
  state    {"saved": [ids], "attended": [ids], "removed": [ids],
            "added": [id or {"id": id, "from": "Author Name"}], "opened_authors": [names]}

Screens (wireframe number -> "screen"):
  01-0, 02-x, 03-1  meta          days, tracks, pace levels, languages, sponsors
  01-2              keywords      keywords in the sentence (with character spans) + related
  01-3              nearby        adjacent fields ("Shares X · n talks") + session topics
  02-1              days          talks for you per day
  03 / 03-1         route         the day's timed route, wildcard, overlaps, next stop
  03-2              more          more picks for the day + people to meet
  04                filters       institution matches (CMU -> Carnegie Mellon), countries,
                                  topics, tracks, and the counts for both buttons
  05                search        papers / people / sessions for a query
  06                paper         talk detail, why recommended, similar talks
  07                author        author page, where to find them, similar researchers
  08                wrapup        the day in numbers, topic clusters, tomorrow's bridge
  09                getting_there rooms, levels, minutes, step-free, floor plan image
  08 / map          clusters      topic clusters of the whole program, each split into
                                  sub-topics ({"cluster": "c03"} or "c03.2"), with where
                                  your recommended talks sit
  start             start         pick talks yourself or get recommendations (11/7): shelves
                                  of talks to pick from (topics, keynotes, demos, people)
  browse            browse        one shelf, paged; personalized by research or by your picks
  plan              plan          your picked talks (state.cart) as a plan per day: times,
                                  walking, picks that clash as choice 1 / 2 / 3, free time to fill

  python arc.py '{"screen": "keywords", "research": "I study haptic feedback for VR"}'
  python arc.py                       # interactive: screen=route research="..." day=tue
"""
import difflib
import json
import os
import re
import shlex
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta

import numpy as np

from explorer import Explorer, has_prefixes, has_words, norm
from retriever import STOP, InputError, _minmax, _non_latin, keyword_spans, relevance

HERE = os.path.dirname(os.path.abspath(__file__))

# 02-2 track names -> program content types
TRACKS = {
    "Papers": ["Paper", "Journals"],
    "Posters": ["Posters", "Student Research Competition"],
    "Demos": ["Interactive Demos"],
    "Workshops": ["Workshop"],
    "Panels": ["Panels"],
    "Keynotes": ["Plenary and Keynote"],
}
DEFAULT_TRACKS = ["Papers", "Posters", "Demos"]
BADGE = {"Paper": "PAPER", "Journals": "PAPER", "Posters": "POSTER",
         "Student Research Competition": "POSTER", "Interactive Demos": "DEMO",
         "Workshop": "WORKSHOP", "Panels": "PANEL", "Plenary and Keynote": "KEYNOTE",
         "Meet-Ups": "MEETUP", "Student Mentoring Program": "MENTORING",
         "SIGCHI Awards": "AWARD", "Course": "COURSE"}
# 02-5: stops a day and the extra minutes kept free between stops
# v3 O-5c: stops a day and the extra minutes kept free between stops
PACE = {1: ("Light", 4, 20), 2: ("Balanced", 6, 10), 3: ("Full", 8, 5)}
PACE_NAMES = {"light": 1, "balanced": 2, "full": 3}
# v3 O-4 "What would make CHI easier?"
NEEDS = {"step_free": "Step-free routes", "fewer_room_changes": "Fewer room changes",
         "breaks": "Breaks between talks", "larger_text": "Larger text",
         "summaries": "Summaries in your language"}
BREAK_EXTRA = 10        # "breaks": minutes added to the pace's break
SAME_ROOM_BONUS = 0.92  # "fewer_room_changes": a talk on another level counts 8% less
REGISTRATION = {"Workshops"}   # O-5a: tracks that need their own registration
VISIT_MIN = 20          # time planned at a poster / demo inside its open window
POOL = 120              # "talks for you": the best-matching items of the chosen tracks
REC_K = 16              # recommendations sent with a route (alternatives hang under its stops)
PLAN_M = 40             # planner "best": the top talks of the day it chooses from
PLAN_STEP = 15          # planner "best": a poster / demo visit can start every 15 min
PLANNERS = ("greedy", "best")
# 11/7: a grade per talk (against the best match), and 2nd / 3rd choices per stop
GRADES = (("A", 0.9), ("B", 0.8), ("C", 0.7))
GRADING = {"A": "90% or more of the best match", "B": "80-90% of it", "C": "70-80%", "D": "under 70%"}
OPTIONS_K = 2           # choices 2 and 3 under each stop
SHELF_K = 6             # talks per shelf on the start screen
SHELF_TYPES = {"keynotes": ["Plenary and Keynote"], "demos": ["Interactive Demos"],
               "posters": ["Posters", "Student Research Competition"], "workshops": ["Workshop"],
               "panels": ["Panels"]}
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
# research-method words: real phrases, but not topics ("systematic review", "user study")
METHOD = set("""review reviews systematic scoping survey surveys interview interviews study
studies analysis evaluation evaluating experience experiences approach approaches framework
frameworks effect effects impact impacts role roles case cases perspective perspectives
insight insights lesson lessons toward towards exploring investigating understanding
examining comparing design designing designs implications challenges opportunities
participants user users results findings method methods feel feeling generated
generating generation exploration driven based enabled supported aware""".split())


def _day_label(date, short=True):
    d = datetime.fromisoformat(date)
    return f"{d.strftime('%a' if short else '%A')} {d.day}"


def _hhmm(iso):
    return iso[11:16] if iso else None


def _level(floor):
    """'3. Convention Centre - P1' -> 'P1'; '0. Auditorium - Lower Level' -> 'Auditorium Lower Level'."""
    if not floor:
        return ""
    name = re.sub(r"^\d+\.\s*", "", floor)
    place, _, lvl = name.rpartition(" - ")
    if place.startswith("Auditorium"):
        return f"Auditorium {lvl.replace('Lever', 'Level')}"
    return lvl or name


def _level_line(floor):
    """'Level P1', or 'Auditorium Lower Level' as it is."""
    lvl = _level(floor)
    return lvl if lvl.startswith("Auditorium") or not lvl else f"Level {lvl}"


def _t(iso):
    return datetime.fromisoformat(iso)


class ARC:
    def __init__(self, root=HERE, threads=4):
        self.ex = Explorer(root, threads)
        self.items, self.emb = self.ex.items, self.ex.emb
        with open(os.path.join(root, "venue.json"), encoding="utf-8") as f:
            self.venue = json.load(f)
        self.days = self.venue["days"]
        self.room_floor = {r["name"]: r["floor"] for r in self.venue["rooms"]}
        self.floor_map = {f["name"]: f["map"] for f in self.venue["floors"]}
        self.alive = np.flatnonzero(~self.ex.dup)
        self.texts = [" " + norm(f"{it['title']} {it['abstract']}") + " " for it in self.items]
        self.ntitle = [norm(it["title"]) for it in self.items]
        self.slots = {i: self.ex._slots(i) for i in self.alive}
        self.type_of = np.array([it["type"] for it in self.items])
        # topic sessions: sessions where papers are presented (not "Posters (Tuesday)")
        topic_items = defaultdict(set)
        for i in self.alive:
            if self.items[i]["type"] in TRACKS["Papers"]:
                for s in self.slots[i]:
                    topic_items[s["session"]].add(i)
        for i in self.alive:
            for s in self.slots[i]:
                if s["session"] in topic_items:
                    topic_items[s["session"]].add(i)
        self.topics = sorted(topic_items)
        self.topic_items = {t: sorted(v) for t, v in topic_items.items()}
        cent = np.stack([self.emb[self.topic_items[t]].mean(0) for t in self.topics])
        self.topic_emb = cent / np.linalg.norm(cent, axis=1, keepdims=True)
        self.topic_of = {}
        for t, ids in self.topic_items.items():
            for i in ids:
                self.topic_of.setdefault(i, t)
        # posters, demos and workshops sit in "Posters (Tuesday)"-like sessions: give
        # them the paper topic whose talks are closest in meaning
        rest = [i for i in self.alive if i not in self.topic_of]
        near = np.argmax(self.emb[rest] @ self.topic_emb.T, axis=1)
        for i, j in zip(rest, near):
            self.topic_of[i] = self.topics[j]
        # people
        self.by_author = defaultdict(list)
        for i in self.alive:
            for a in self.items[i]["authors"]:
                self.by_author[a["name"]].append(i)
        self.chairing = defaultdict(list)
        for s in self.venue["sessions"]:
            for c in s["chairs"]:
                self.chairing[c].append(s)
        self._author_emb = None
        self.df_cache = {}
        # one-line summaries and questions to ask, written offline by an LLM for every
        # item (scripts/gen_summaries.py); optional
        self.summaries = {}
        path = os.path.join(root, "summaries.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self.summaries = {int(k): v for k, v in json.load(f).items()}
        # topic clusters of the whole program (scripts/build_clusters.py); optional
        self.clusters, self.cluster_of, self.sub_of = [], {}, {}
        path = os.path.join(root, "clusters.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                cl = json.load(f)
            pos = {it["id"]: i for i, it in enumerate(self.items)}
            for c in cl["clusters"]:
                idx = [pos[x] for x in c["items"] if x in pos]
                cent = self.emb[idx].mean(0)
                self.clusters.append(dict(c, idx=idx, emb=cent / np.linalg.norm(cent)))
                for i in idx:
                    self.cluster_of[i] = len(self.clusters) - 1
                for s_n, sc in enumerate(c.get("subclusters", [])):
                    for x in sc["items"]:
                        if x in pos:
                            self.sub_of[pos[x]] = (len(self.clusters) - 1, s_n)
            # a duplicate listing belongs to the cluster of its first listing
            for i in range(len(self.items)):
                if i not in self.cluster_of and self.ex.dup[i]:
                    j = self._canon(i)
                    if j in self.cluster_of:
                        self.cluster_of[i] = self.cluster_of[j]
                    if j in self.sub_of:
                        self.sub_of[i] = self.sub_of[j]

    # -- helpers ------------------------------------------------------------
    def _profile(self, req, need_research=True):
        p = req.get("profile", req)
        if not isinstance(p, dict):
            raise InputError("profile must be a JSON object")
        research = str(p.get("research") or "").strip()
        keywords = self._str_list(p.get("keywords"), "keywords")
        topics = self._str_list(p.get("topics"), "topics")
        if need_research and not (research or keywords or topics):
            raise InputError('give the research sentence: "research": "I study ..." '
                             '(or "keywords": [...])')
        tracks = self._str_list(p.get("tracks"), "tracks") or DEFAULT_TRACKS
        bad = [t for t in tracks if t not in TRACKS]
        if bad:
            raise InputError(f"unknown track(s) {bad}; use any of {list(TRACKS)}")
        pace = p.get("pace", 2)
        if isinstance(pace, str) and pace.strip().lower() in PACE_NAMES:
            pace = PACE_NAMES[pace.strip().lower()]
        elif isinstance(pace, str) and pace.strip().isdigit():
            pace = int(pace)
        if isinstance(pace, bool) or pace not in PACE:
            raise InputError(f"pace must be light, balanced or full (1-3), got {json.dumps(pace)}")
        needs = self._str_list(p.get("needs"), "needs")
        bad = [x for x in needs if x not in NEEDS]
        if bad:
            raise InputError(f"unknown need(s) {bad}; use any of {list(NEEDS)}")
        given = [self._day(d) for d in self._str_list(p.get("days"), "days")]
        days = sorted(set(given)) or list(self.days)
        step_free = p.get("step_free", False)
        if isinstance(step_free, str):
            step_free = step_free.lower() in ("1", "true", "yes", "y")
        step_free = bool(step_free) or "step_free" in needs
        auto = keywords or (self._extract(research) if research else [])
        return {"research": research, "keywords": keywords, "topics": topics, "auto_keywords": auto,
                "days_given": bool(given),
                "tracks": tracks, "pace": pace, "days": days, "step_free": bool(step_free), "needs": needs,
                "language": str(p.get("language") or "en")}

    @staticmethod
    def _str_list(v, name):
        if v is None:
            return []
        if isinstance(v, str):
            v = [x for x in re.split(r"\s*[,;]\s*", v) if x]
        if not isinstance(v, list) or not all(isinstance(x, (str, int)) for x in v):
            raise InputError(f"{name} must be a list of strings")
        return [str(x).strip() for x in v if str(x).strip()]

    def _day(self, d):
        s = str(d).strip().lower()
        for day in self.days:
            wd = WEEKDAYS[datetime.fromisoformat(day).weekday()]
            if s in (day, day[5:]) or (len(s) >= 3 and wd.startswith(s)):
                return day
        raise InputError(f'unknown day "{d}"; the conference days are '
                         + ", ".join(f"{x} ({_day_label(x)})" for x in self.days))

    def _state(self, req):
        st = req.get("state") or {}
        if not isinstance(st, dict):
            raise InputError("state must be a JSON object")
        ids = {it["id"]: i for i, it in enumerate(self.items)}

        def idx_list(key):
            out = []
            for x in st.get(key) or []:
                xid = x.get("id") if isinstance(x, dict) else x
                try:
                    out.append(self._canon(ids[int(xid)]))
                except (KeyError, ValueError, TypeError):
                    raise InputError(f"state.{key}: unknown item id {json.dumps(xid)}")
            return out
        added_from = {}
        for x in st.get("added") or []:
            if isinstance(x, dict) and x.get("from"):
                added_from[x.get("id")] = str(x["from"])
        return {"saved": idx_list("saved"), "attended": idx_list("attended"),
                "cart": list(dict.fromkeys(idx_list("cart"))),
                "removed": set(idx_list("removed")), "added": idx_list("added"),
                "declined": set(idx_list("declined")),
                "added_from": {self._canon(ids[int(k)]): v for k, v in added_from.items()
                               if str(k).isdigit() and int(k) in ids},
                "opened_authors": self._str_list(st.get("opened_authors"), "opened_authors")}

    def _inst_key(self, name):
        """One key per institution: "Full Name (ACRONYM)" joins "Full Name" and "ACRONYM"."""
        m = re.match(r"^(.*?)\s*\(([^()]+)\)\s*$", name)
        return self.ex.inst.find(norm(m.group(1) if m else name))

    def _canon(self, i):
        """A talk listed twice -> its first listing."""
        if not self.ex.dup[i]:
            return i
        key = (self.items[i]["type"], self.items[i]["title"].strip().lower())
        return next(j for j in self.alive if (self.items[j]["type"],
                                              self.items[j]["title"].strip().lower()) == key)

    def _item_by_id(self, xid):
        try:
            xid = int(xid)
        except (TypeError, ValueError):
            raise InputError(f"id must be a program item id, got {json.dumps(xid)}")
        for i, it in enumerate(self.items):
            if it["id"] == xid:
                return self._canon(i)
        raise InputError(f"no program item with id {xid}")

    def _query(self, p):
        """The text the model ranks by, typos fixed against the program's own words."""
        return self.ex.speller("; ".join(p["keywords"] + p["topics"]) if p["keywords"] else
                               "; ".join([p["research"]] + p["topics"]))

    def _score(self, p):
        q = self._query(p)
        sim = self.emb @ self.ex.embed(q)
        return _minmax(sim) + self.ex.cfg["hybrid_w"] * _minmax(self.ex.bm25.scores(q))

    def _warnings(self, p):
        w = []
        if _non_latin(" ".join([p["research"]] + p["keywords"] + p["topics"])):
            w.append("The model reads English only; translate the research sentence to "
                     "English first, or the picks may be unrelated.")
        return w

    def _allowed(self, tracks):
        types = {t for tr in tracks for t in TRACKS[tr]}
        return np.isin(self.type_of, list(types))

    def _pool(self, p, score):
        ok = np.zeros(len(self.items), dtype=bool)
        ok[self.alive] = True
        ok &= self._allowed(p["tracks"])
        idx = np.flatnonzero(ok)
        return idx[np.argsort(-score[idx], kind="stable")][:POOL]

    def _df(self, phrase):
        if phrase not in self.df_cache:
            pat = f" {phrase} "
            self.df_cache[phrase] = sum(pat in self.texts[i] for i in self.alive)
        return self.df_cache[phrase]

    def _shared(self, i, p, fallback=True):
        """User keywords/topics that occur in this talk's title or abstract."""
        out = []
        for k in (p["keywords"] or p.get("auto_keywords", [])) + p["topics"]:
            nk = norm(k)
            if nk and (has_words(self.texts[i], nk) or (nk.endswith("s") and has_words(
                    self.texts[i], nk[:-1])) or has_words(self.texts[i], nk + "s")):
                out.append(k)
        if not out and fallback:
            # no whole keyword: fall back to single words of the keywords, then the sentence
            words = [w for w in norm(" ".join(p["keywords"] + p["topics"]) + " " + p["research"]).split()
                     if w not in STOP and len(w) > 2]
            words = list(dict.fromkeys(words))
            out = [w for w in words if has_words(self.texts[i], w)][:2]
        return out

    def _why(self, i, p, state=None):
        if state and state["saved"]:
            sims = [(float(self.emb[i] @ self.emb[j]), j) for j in state["saved"] if j != i]
            if sims and max(sims)[0] > self.ex.cfg.get("same_topic_sim", 0.75):
                j = max(sims)[1]
                return {"kind": "saved", "keywords": [], "saved_id": self.items[j]["id"],
                        "text": f"Same topic as {self.items[j]['title']}."}
        sh = self._shared(i, p)
        if sh:
            return {"kind": "keywords", "keywords": sh,
                    "text": "Shares " + " and ".join(sh[:2]) + " with your research."}
        return {"kind": "meaning", "keywords": [],
                "text": "Close in meaning to your research."}

    def _slot_on(self, i, day):
        return [s for s in self.slots.get(i, []) if s["start"] and s["start"][:10] == day]

    def _authors_short(self, i):
        out = []
        for a in self.items[i]["authors"]:
            af = a["affiliations"][0] if a["affiliations"] else {}
            out.append({"name": a["name"], "institution": af.get("institution", ""),
                        "country": af.get("country", "")})
        return out

    def _card(self, i, slot=None, p=None, state=None):
        it = self.items[i]
        slot = slot or (self.slots.get(i) or [None])[0]
        a = self._authors_short(i)
        card = {"id": it["id"], "type": it["type"], "badge": BADGE.get(it["type"], it["type"].upper()),
                "title": it["title"],
                "first_author": a[0] if a else None,
                "institutions": list(dict.fromkeys(x["institution"] for x in a if x["institution"])),
                "countries": list(dict.fromkeys(x["country"] for x in a if x["country"])),
                "video": it["video"], "remote": it["remote"], "doi": it["doi"]}
        if slot:
            # a talk with its own time inside the session (papers); others are open all session
            seq = slot["est_end"] != slot["end"]
            card.update({
                "day": slot["start"][:10] if slot["start"] else None,
                "day_label": _day_label(slot["start"][:10]) if slot["start"] else None,
                "time": f"~{_hhmm(slot['est_start'])}" if slot["est_start"] else None,
                "start": slot["est_start"], "end": slot["est_end"],
                "session_start": slot["start"], "session_end": slot["end"],
                "estimated": bool(seq),
                "open_minutes": None if seq or not slot["start"] else
                int((_t(slot["end"]) - _t(slot["start"])).seconds / 60),
                "room": slot["room"], "floor": slot["floor"], "level": _level(slot["floor"]),
                "session": slot["session"],
                "talk_order": f"Talk {slot['order']} of {slot['of']}" if seq and slot["order"] else None,
            })
        else:
            card.update({"day": None, "time": None, "room": "", "session": "",
                         "note": "remote presentation (video only)" if it["remote"] else "time TBA"})
        if p is not None:
            card["why"] = self._why(i, p, state)
        return card

    @staticmethod
    def _grade(s, best):
        """A-D against the best match (s / best), with the percentage as points."""
        s, best = float(s), float(best)
        letter = next((g for g, t in GRADES if best > 0 and s >= t * best), "D")
        return {"letter": letter, "points": int(round(100 * s / best)) if best > 0 else 0}

    def _walk(self, room_a, room_b, step_free):
        if not room_a or not room_b:
            return None
        if room_a == room_b:
            return {"to_room": room_b, "minutes": "same room", "min": 0, "max": 0,
                    "step_free": True, "via": None}
        fa, fb = self.room_floor.get(room_a, ""), self.room_floor.get(room_b, "")
        same = fa == fb and fa
        lo, hi = (2, 4) if same else (4, 6)
        if same:
            via = "same level"
        elif step_free:
            via = f"elevator to Level {_level(fb)}"
        else:
            via = f"stairs or elevator to Level {_level(fb)}"
        return {"to_room": room_b, "minutes": f"about {lo}–{hi} min", "min": lo, "max": hi,
                "from_level": _level(fa), "to_level": _level(fb), "step_free": step_free,
                "via": via}

    # -- 01-0 / 02-x / 03-1 ---------------------------------------------------
    def meta(self, req):
        n = Counter(self.type_of[self.alive])
        return {
            "conference": {k: self.venue[k] for k in ("name", "full_name", "location", "url",
                                                      "timezone")},
            "days": [{"date": d, "label": _day_label(d, False), "short": _day_label(d)}
                     for d in self.days],
            "tracks": [{"name": t, "count": int(sum(n[x] for x in types)),
                        "default": t in DEFAULT_TRACKS, "registration_needed": t in REGISTRATION}
                       for t, types in TRACKS.items()],
            "pace": [{"level": k, "id": v[0].lower(), "name": v[0], "talks_per_day": v[1],
                      "line": f"About {v[1]} stops a day", "break_min": v[2], "default": k == 2}
                     for k, v in PACE.items()],
            "needs": [{"id": k, "label": v, "model": k in ("step_free", "fewer_room_changes", "breaks")}
                      for k, v in NEEDS.items()],
            "languages": {"model": ["en"], "note": "The research sentence must be English. "
                          "Summaries, captions and question help in other languages are "
                          "app-side (not this model)."},
            "sponsors": self.venue["sponsors"],
        }

    # -- 01-2 ---------------------------------------------------------------
    def _extract(self, text):
        return [f["keyword"] for f in self._spans(text)]

    def _spans(self, text):
        return keyword_spans(text, self._df, len(self.alive))

    def keywords(self, req):
        p = self._profile(req)
        text = p["research"]
        if not text:
            raise InputError('keywords needs "research": the user\'s sentence')
        found = self._spans(text)
        p_kw = dict(p, keywords=[f["keyword"] for f in found])
        score = self._score(p_kw if found else p)
        related = self._related_terms(score, {norm(f["keyword"]) for f in found})
        warnings = self._warnings(p)
        if not found:
            warnings.append("No keyword from the sentence appears in the CHI program; "
                            "add topics by hand or use the related suggestions.")
        return {"sentence": text, "keywords": found, "related": related, "warnings": warnings}

    def _related_terms(self, score, exclude, k=4):
        top = np.argsort(-score, kind="stable")[:30]
        cnt, docs = Counter(), defaultdict(set)
        for i in top:
            title_words = [w for w in norm(self.items[i]["title"]).split()]
            run = []
            for w in title_words + [None]:
                if w is None or w in STOP or w in METHOD or len(w) < 3:
                    for n in (2, 1):
                        for a in range(len(run) - n + 1):
                            ph = " ".join(run[a:a + n])
                            docs[ph].add(i)
                    run = []
                else:
                    run.append(w)
        n_docs = len(self.alive)
        out = []
        for ph, ds in docs.items():
            if len(ds) < 3 or ph in exclude or any(ph in e or e in ph for e in exclude):
                continue
            df = self._df(ph)
            if df < 5 or df > 0.08 * n_docs:
                continue
            cnt[ph] = len(ds) * (1.5 if " " in ph else 1.0)
        for ph, _ in cnt.most_common():
            if any(ph in o or o in ph for o in out):
                continue
            out.append(ph)
            if len(out) == k:
                break
        return [{"topic": ph, "talks": self._df(ph)} for ph in out]

    # -- 01-3 ---------------------------------------------------------------
    def _topic_rank(self, p):
        q = self.ex.embed(self._query(p))
        sims = self.topic_emb @ q
        return [self.topics[j] for j in np.argsort(-sims, kind="stable")], sims

    def nearby(self, req):
        p = self._profile(req)
        ranked, _ = self._topic_rank(p)
        k = int(req.get("top_k") or 5)
        sessions = [{"topic": t, "talks": len(self.topic_items[t])} for t in ranked[:k]]
        adjacent = []
        kws = p["auto_keywords"]
        for t in ranked[k:k + 40]:
            ids = self.topic_items[t]
            best = max(((kw, [i for i in ids if has_words(self.texts[i], norm(kw))]) for kw in kws),
                       key=lambda x: len(x[1]), default=(None, []))
            if len(best[1]) >= 2:
                n = len(best[1])
                adjacent.append({"field": t, "shares": best[0], "talks": n,
                                 "why": f"Shares {best[0]} · {n} talks",
                                 "suggested": not adjacent})
            if len(adjacent) == 3:
                break
        return {"adjacent": adjacent, "sessions": sessions, "more_topics": len(self.topics) - k,
                "warnings": self._warnings(p)}

    # -- 02-1 ---------------------------------------------------------------
    def days_screen(self, req):
        p = self._profile(req)
        pool = self._pool(p, self._score(p))
        out = []
        for d in self.days:
            ids = [i for i in pool if self._slot_on(i, d)]
            top = Counter(self.topic_of[i] for i in ids if i in self.topic_of).most_common(1)
            out.append({"date": d, "label": _day_label(d, False), "talks_for_you": len(ids),
                        "theme": None, "top_topic": top[0][0] if top else None,
                        "selected": d in p["days"]})
        return {"days": out, "pool": POOL, "warnings": self._warnings(p),
                "note": "The program data has no day themes (theme is null; hide the line). "
                        "top_topic is the most common session topic among your talks that day."}

    # -- 03 -----------------------------------------------------------------
    def _interval(self, i, slot):
        s, e = _t(slot["est_start"]), _t(slot["est_end"])
        if self.items[i]["type"] in TRACKS["Papers"]:
            return s, e, False
        if self.items[i]["type"] in TRACKS["Posters"] + TRACKS["Demos"]:
            return s, e, True        # open window: plan VISIT_MIN inside it
        return s, e, False

    def _fit(self, placed, i, slot, gap_min, step_free):
        """Earliest visit inside the item's time that keeps gap + walking to every stop."""
        s, e, flexible = self._interval(i, slot)
        dur = timedelta(minutes=VISIT_MIN) if flexible else e - s
        t = s
        while t + dur <= e:
            clash = None
            for q in placed:
                w = self._walk(q["slot"]["room"], slot["room"], step_free)
                need = timedelta(minutes=gap_min + (w["max"] if w else 5))
                if t < q["end"] + need and q["start"] < t + dur + need:
                    clash = q
                    break
            if not clash:
                return t, t + dur
            if not flexible:
                return None
            t = clash["end"] + timedelta(minutes=gap_min + 6)
        return None

    def _apart(self, a, b, gap, step_free):
        """Two visits {start, end, slot} far enough apart for the break and the walk."""
        w = self._walk(a["slot"]["room"], b["slot"]["room"], step_free)
        need = timedelta(minutes=gap + (w["max"] if w else 5))
        return b["start"] >= a["end"] + need or a["start"] >= b["end"] + need

    def _plan_same_level(self, cands, placed, n, added, score, place):
        """Greedy, but a talk on another level than the stop next to it in time counts
        SAME_ROOM_BONUS less (v3 O-4 "Fewer room changes")."""
        tried = set()
        while sum(q["kind"] == "pick" for q in placed) < n:
            ranked = []
            for k, (i, slot) in enumerate(cands):
                if i in added or k in tried or any(q["i"] == i for q in placed):
                    continue
                v = float(score[i])
                if placed:
                    t = _t(slot["est_start"])
                    near = min(placed, key=lambda q: abs((q["start"] - t).total_seconds()))
                    if self.room_floor.get(near["slot"]["room"]) != self.room_floor.get(slot["room"]):
                        v *= SAME_ROOM_BONUS
                ranked.append((-v, k))
            if not ranked:
                return
            ranked.sort()
            for _, k in ranked:
                tried.add(k)
                if place(cands[k][0], cands[k][1], "pick"):
                    break
            else:
                return

    def _plan_best(self, cands, fixed, n, gap, step_free, added, score):
        """Planner "best": the set of talks with the highest total score that fits the
        day (break and walking included), instead of the best talk first. Exact over the
        day's top PLAN_M talks; a poster / demo visit is tried every PLAN_STEP minutes."""
        taken = {q["i"] for q in fixed}
        order = []
        for i, _ in cands:
            if i not in added and i not in taken and i not in order:
                order.append(i)
        order = order[:PLAN_M]
        bit = {i: 1 << k for k, i in enumerate(order)}
        opts = []
        for i, slot in cands:
            if i not in bit:
                continue
            s, e, flexible = self._interval(i, slot)
            starts = [s]
            if flexible:
                starts, t = [], s
                while t + timedelta(minutes=VISIT_MIN) <= e:
                    starts.append(t)
                    t += timedelta(minutes=PLAN_STEP)
            for t in starts:
                o = {"i": i, "slot": slot, "start": t,
                     "end": t + timedelta(minutes=VISIT_MIN) if flexible else e, "kind": "pick"}
                if all(self._apart(q, o, gap, step_free) for q in fixed):
                    opts.append(o)
        opts.sort(key=lambda o: o["start"])
        before = [[y for y in range(x) if opts[y]["end"] <= opts[x]["start"]
                   and self._apart(opts[y], opts[x], gap, step_free)] for x in range(len(opts))]
        # best[x] = (total, previous option, items used) for a plan ending at option x
        best = [(float(score[o["i"]]), None, bit[o["i"]]) for o in opts]
        top = max(range(len(opts)), key=lambda x: best[x][0], default=None)
        layers = [best]
        for _ in range(n - 1):
            prev, cur = layers[-1], []
            for x, o in enumerate(opts):
                b = None
                for y in before[x]:
                    if prev[y] and not prev[y][2] & bit[o["i"]] and (b is None or prev[y][0] > b[0]):
                        b = (prev[y][0], y, prev[y][2])
                cur.append((b[0] + float(score[o["i"]]), b[1], b[2] | bit[o["i"]]) if b else None)
            layers.append(cur)
        best_val, end = -1.0, None
        for c, layer in enumerate(layers):
            for x, v in enumerate(layer):
                if v and v[0] > best_val:
                    best_val, end = v[0], (c, x)
        if end is None:
            return []
        plan, (c, x) = [], end
        while x is not None:
            plan.append(dict(opts[x]))
            x = layers[c][x][1]
            c -= 1
        return plan[::-1] if top is not None else []

    def _options(self, stops, placed, cands, excluded, score, p, st, gap, best):
        """11/7: choices 2 and 3 for each stop, best first: talks that compete for its time
        (overlap it, or leave no time for the break and walk) and would fit if it were
        swapped out. The stop itself is choice 1. The app shows them at the side."""
        taken = {q["i"] for q in placed} | set(excluded)
        for n, q in enumerate(placed):
            others = placed[:n] + placed[n + 1:]
            opts, seen = [], set()
            for i, slot in cands:
                if i in taken or i in seen:
                    continue
                s, e, _ = self._interval(i, slot)
                if self._apart(q, {"slot": slot, "start": s, "end": e}, gap, p["step_free"]):
                    continue
                fit = self._fit(others, i, slot, gap, p["step_free"])
                if not fit:
                    continue
                seen.add(i)
                c = self._card(i, slot, p, st)
                opts.append({"choice": len(opts) + 2, "id": c["id"], "title": c["title"], "badge": c["badge"],
                             "time": f"~{fit[0].strftime('%H:%M')}", "start": fit[0].isoformat(),
                             "end": fit[1].isoformat(), "room": c["room"], "score": round(float(score[i]), 4),
                             "grade": self._grade(score[i], best), "why": c["why"],
                             "swap": {"replaces": stops[n]["id"], "button": "Swap"}})
                if len(opts) == OPTIONS_K:
                    break
            x = stops[n]
            stops[n]["options"] = [{"choice": 1, "id": x["id"], "title": x["title"], "badge": x["badge"],
                                    "time": x["time"], "start": x["start"], "end": x["end"], "room": x["room"],
                                    "score": x["score"], "grade": x["grade"], "why": x.get("why"),
                                    "current": True}] + opts

    def _recommend(self, cands, placed, stops, excluded, score, p, st, k):
        """The day's top-k talks (REC_K = 16). Each one not in the route hangs under the
        stop it overlaps most as an alternative (a sub-node of that stop), or is marked
        as fitting the free time (03-2 More for you)."""
        stop_of = {q["i"]: n for n, q in enumerate(placed)}
        best = max((float(score[i]) for i, _ in cands), default=0.0)
        recs, seen = [], set()
        for i, slot in cands:
            if i in seen or i in excluded:
                continue
            seen.add(i)
            rank = len(recs) + 1
            c = self._card(i, slot, p, st)
            node = {"rank": rank, "id": c["id"], "title": c["title"], "badge": c["badge"],
                    "score": round(float(score[i]), 4), "time": c["time"], "start": c["start"],
                    "end": c["end"], "room": c["room"], "institutions": c["institutions"],
                    "countries": c["countries"], "grade": self._grade(score[i], best)}
            if i in stop_of:
                node.update(status="in_route", stop=stop_of[i] + 1)
            else:
                s, e, flexible = self._interval(i, slot)
                if self._fit(placed, i, slot, 0, p["step_free"]):
                    node.update(status="fits_free_time", stop=None)
                else:
                    def overlap(q):
                        return (min(e, q["end"]) - max(s, q["start"])).total_seconds() / 60
                    n = max(range(len(placed)), key=lambda n: (overlap(placed[n]),
                            -abs((placed[n]["start"] - s).total_seconds())), default=None)
                    if n is None:
                        node.update(status="fits_free_time", stop=None)
                    else:
                        ov = max(0, int(overlap(placed[n])))
                        node.update(status="alternative", stop=n + 1, overlap_min=ov)
                        if ov:
                            reason = f"same time as stop {n + 1}"
                        elif s >= placed[n]["end"]:
                            reason = f"right after stop {n + 1}, no time for the break and walk"
                        else:
                            reason = f"right before stop {n + 1}, no time for the break and walk"
                        alt = dict(c, rank=rank, score=node["score"], grade=node["grade"], overlap_min=ov, reason=reason,
                                   swap={"replaces": stops[n]["id"], "button": "Swap"})
                        stops[n].setdefault("alternatives", []).append(alt)
            recs.append(node)
            if len(recs) == k:
                break
        for s in stops:
            s.setdefault("alternatives", [])
        return recs

    def route(self, req):
        p = self._profile(req, need_research=False)
        if not (p["research"] or p["keywords"] or p["topics"]):
            # v3 "03-J Today · No plan": came in through Just browse
            return {"state": "no_plan", "empty": {"title": "No plan yet", "buttons": ["Plan my days", "Explore"]}}
        st = self._state(req)
        day = self._day(req.get("day") or p["days"][0])
        if p["days_given"] and day not in p["days"]:
            # v3 "03-K Today · Not attending"
            return {"state": "not_attending", "day": day, "day_label": _day_label(day),
                    "empty": {"title": f"You're not at CHI on {_day_label(day)}", "buttons": ["Add this day"]}}
        filt = self._filters(req.get("filters"))
        score = self._score(p)
        # a removed stop is planned as usual and then taken out, so the rest of the
        # route stays put and its time shows as free (v2 03 · Removed); a declined
        # talk (the other one of a choice, or Skip) is left out before planning
        out_of_route = st["declined"]
        pool = [i for i in self._pool(p, score) if i not in out_of_route and self._ok(i, filt)]
        cands = [(i, s) for i in pool for s in self._slot_on(i, day)]
        name, n_stops, gap = PACE[p["pace"]]
        if "breaks" in p["needs"]:
            gap += BREAK_EXTRA
        placed = []

        def place(i, slot, kind):
            fit = self._fit(placed, i, slot, gap, p["step_free"])
            if fit:
                placed.append({"i": i, "slot": slot, "start": fit[0], "end": fit[1], "kind": kind})
            return fit
        # the user's own field: their closest topics and the topics of their best talks
        top_topics = set(self._topic_rank(p)[0][:5]) | {self.topic_of[i] for i in pool[:30]}
        wildcard = self._wildcard(p, score, day, top_topics, dict(st, removed=out_of_route), filt)
        regular = n_stops - (1 if wildcard else 0)
        added = set(st["added"])
        if wildcard and (wildcard[0] in added or not place(wildcard[0], wildcard[1], "wildcard")):
            wildcard = None
        planner = req.get("planner") or "greedy"
        if planner not in PLANNERS:
            raise InputError(f"planner must be one of {list(PLANNERS)}, got {json.dumps(planner)}")
        if planner == "best":
            placed += self._plan_best(cands, placed, regular, gap, p["step_free"], added, score)
        elif "fewer_room_changes" in p["needs"]:
            self._plan_same_level(cands, placed, regular, added, score, place)
        else:
            # greedy: the best-scoring talk first, then the best one that still fits, ...
            for i, slot in cands:
                if sum(q["kind"] == "pick" for q in placed) >= regular:
                    break
                if i in added or any(q["i"] == i for q in placed):
                    continue
                place(i, slot, "pick")
        # two strong talks at the same time: the model does not pick for the user, it
        # offers both as one "PICK ONE · Pick one of 2 talks" row (v3 03-H)
        conflicts = []
        for q in sorted([q for q in placed if q["kind"] == "pick"], key=lambda q: -score[q["i"]]):
            alt = None
            for i, slot in cands:
                if i in added or any(x["i"] == i for x in placed) or score[i] < 0.92 * score[q["i"]]:
                    continue
                s, e, flexible = self._interval(i, slot)
                if flexible or self._interval(q["i"], q["slot"])[2]:
                    continue        # posters and demos can be visited around a talk
                if s < q["end"] and q["start"] < e and not any(
                        x is not q and s < x["end"] and x["start"] < e for x in placed):
                    alt = {"i": i, "slot": slot, "start": s, "end": e, "kind": "alternative"}
                    break
            if alt:
                placed.append(alt)
                conflicts.append((q, alt, "model"))
                break               # one choice a day is enough
        # talks the user added go on top of the route; one that overlaps a stop is
        # kept too and shown as a choice ("Keep one"), the route is not reshuffled
        for i in st["added"]:
            if any(q["i"] == i for q in placed):
                continue
            for slot in self._slot_on(i, day)[:1]:
                if not place(i, slot, "added"):
                    s, e, _ = self._interval(i, slot)
                    # the stop it clashes with (overlapping, or too close to walk between)
                    other = min(placed, key=lambda q: abs((q["start"] - s).total_seconds()),
                                default=None)
                    placed.append({"i": i, "slot": slot, "start": s, "end": e, "kind": "added"})
                    conflicts.append((other, placed[-1], "added"))
        placed.sort(key=lambda q: q["start"])
        holes = [q for q in placed if q["i"] in st["removed"]]
        placed = [q for q in placed if q["i"] not in st["removed"]]
        conflicts = [c for c in conflicts if c[0] in placed and c[1] in placed]
        stops = []
        for n, q in enumerate(placed):
            i = q["i"]
            c = self._card(i, q["slot"], p, st)
            c.update({"stop": n + 1, "kind": q["kind"], "score": round(float(score[i]), 4),
                      "time": f"~{q['start'].strftime('%H:%M')}",
                      "start": q["start"].isoformat(), "end": q["end"].isoformat(),
                      "live_label": "See it live · no video" if c["badge"] == "PAPER"
                      and not self.items[i]["video"] else None,
                      "attended": i in st["attended"], "saved": i in st["saved"]})
            if q["kind"] == "added" and i in st["added_from"]:
                c["added_from"] = st["added_from"][i]
            if q["kind"] == "wildcard":
                c["badge"] = "TRY NEW"
                c["wildcard"] = {"label": "TRY NEW · one step from your field",
                                 "path": {"you": (p["keywords"] or p["auto_keywords"] or [p["research"]])[0],
                                          "bridge": self.items[i]["title"],
                                          "new_area": wildcard[2]},
                                 "why": f"shares {', '.join(self._shared(i, p)[:1]) or 'ideas'} with "
                                        f"you and leads into {wildcard[2]}"}
            nxt = placed[n + 1] if n + 1 < len(placed) else None
            c["walk_to_next"] = self._walk(q["slot"]["room"], nxt["slot"]["room"],
                                           p["step_free"]) if nxt else None
            stops.append(c)
        overlaps = []
        for a, b, origin in conflicts:
            if not a:
                continue
            later = self._same_topic_later(b["i"], day, b["end"], p)
            text = (f"You added {self.items[b['i']]['title']}. It overlaps "
                    f"{self.items[a['i']]['title']}. Keep one." if origin == "added"
                    else "Pick one. The other moves to More picks.")
            overlaps.append({
                "time": f"~{min(a['start'], b['start']).strftime('%H:%M')}", "origin": origin,
                "text": text,
                "options": [{"id": self.items[x["i"]]["id"], "title": self.items[x["i"]]["title"],
                             "room": x["slot"]["room"], "video": self.items[x["i"]]["video"],
                             "label": f"{x['slot']['room']} · "
                                      + ("Can catch later" if self._catch_later(x["i"], x["slot"]) else "Only here now")}
                            for x in (a, b)],
                "alternative": later})
        best = max((float(score[i]) for i, _ in cands), default=0.0)
        for s_, q in zip(stops, placed):
            s_["grade"] = self._grade(score[q["i"]], best)
        self._options(stops, placed, cands, out_of_route | st["removed"], score, p, st, gap, best)
        recs = self._recommend(cands, placed, stops, out_of_route | st["removed"], score, p, st,
                               int(req.get("rec_k") or REC_K))
        rows = self._rows(stops, overlaps)
        gaps = self._gaps(holes, stops)
        fits = self.more(dict(req, screen="more", day=day, _route=[q["i"] for q in placed],
                              _gaps=self._free(day, stops, p)))
        done = sum(r["done"] for r in rows)
        out = {
            "state": "today", "day": day, "day_label": _day_label(day),
            "pace": {"level": p["pace"], "id": name.lower(), "name": name},
            "title": f"Your {_day_label(day, False).split()[0]}",
            "subtitle": f"{len(stops)} stops picked for your research"
                        + (" · step-free on" if p["step_free"] else "") + " · times are estimates",
            "matched_talks": len(cands), "related_talks": len(pool), "planner": planner,
            "grading": GRADING,
            "recommendations": recs,
            "stops": stops, "rows": rows, "overlaps": overlaps, "gaps": gaps,
            "progress": {"done": done, "of": len(rows), "saved": len(st["saved"]),
                         "label": f"Your {_day_label(day, False).split()[0]} · {done} of {len(rows)}"},
            "more_for_today": {"talks": fits["total_picks"], "people": len(fits["people"]),
                               "label": "More for you",
                               "line": f"{fits['total_picks']} picks fit your free time"},
            "building": {"title": "Building your day",
                         "steps": ["Read your research", f"Found {len(pool)} talks for you",
                                   "Checking rooms and step-free paths"]},
            "relevance": self._relevance(p),
            "warnings": self._warnings(p),
        }
        if req.get("now"):
            now = self._now(req["now"], stops)
            if now.date().isoformat() < day:
                out.update({"state": "preview",
                            "progress": dict(out["progress"], done=0,
                                             label=f"Your {_day_label(day, False).split()[0]} · preview"),
                            "more_for_today": dict(out["more_for_today"],
                                                   label="More for you", line=f"{fits['total_picks']} picks fit "
                                                         f"{_day_label(day).split()[0]}")})
                return out
            if now.date().isoformat() > day or (rows and now >= _t(rows[-1]["end"])):
                out["state"] = "day_done"
            out["next"] = self._next(stops, now, p)
            # time-based progress: a stop that has ended counts as done
            for r in rows:
                r["done"] = r["done"] or now >= _t(r["end"])
            done = sum(r["done"] for r in rows)
            out["progress"].update(done=done, label=f"Your {_day_label(day, False).split()[0]} · "
                                                    f"{done} of {len(rows)}")
            out["now_card"] = self._now_card(rows, stops, now, p)
        else:
            out["now_card"] = self._now_card(rows, stops, None, p)
        if out["state"] == "day_done" or (rows and all(r["done"] for r in rows)):
            out["state"] = "day_done"
            out["now_card"] = None
            out["day_done"] = self._day_done(req, p, day, rows, st)
        return out

    def _rows(self, stops, overlaps):
        """v2 day list: one row per stop, the two talks of a choice folded into one row."""
        in_choice = {o["options"][1]["id"]: o for o in overlaps}
        in_choice.update({o["options"][0]["id"]: o for o in overlaps})
        rows, seen = [], set()
        for s in stops:
            if s["id"] in seen:
                continue
            o = in_choice.get(s["id"])
            if o:
                ids = [x["id"] for x in o["options"]]
                seen.update(ids)
                members = [x for x in stops if x["id"] in ids]
                rows.append({"time": o["time"], "badge": "PICK ONE", "title": "Pick one of 2 talks",
                             "stop_ids": ids, "start": min(m["start"] for m in members),
                             "end": max(m["end"] for m in members),
                             "done": any(m["attended"] for m in members),
                             "choice": {"text": "Pick one. The other moves to More picks.",
                                        "options": [{"id": x["id"], "title": x["title"],
                                                     "line": x["label"], "button": "Choose"}
                                                    for x in o["options"]]}})
            else:
                seen.add(s["id"])
                rows.append({"time": s["time"], "badge": s["badge"], "title": s["title"],
                             "stop_ids": [s["id"]], "start": s["start"], "end": s["end"],
                             "alternative_ids": [a["id"] for a in s.get("alternatives", [])],
                             "option_ids": [o["id"] for o in s.get("options", [])[1:]],
                             "done": s["attended"], "actions": ["Remove", "Swap"]})
        return rows

    def _now(self, now, stops=None):
        try:
            t = datetime.fromisoformat(str(now))
        except ValueError:
            raise InputError('now must be an ISO time like "2026-04-14T09:20:00+02:00"')
        if t.tzinfo is None:
            from datetime import timezone
            t = t.replace(tzinfo=timezone(timedelta(minutes=self.venue["utc_offset_min"])))
        return t

    def _now_card(self, rows, stops, now, p):
        """v3 now card: FIRST STOP, NEXT, LEAVE NOW or NOW (03-A to 03-D)."""
        by_id = {s["id"]: s for s in stops}
        todo = [r for r in rows if not r["done"]]
        if not todo:
            return None
        cur = None
        if now is not None:
            cur = next((r for r in rows if _t(r["start"]) <= now < _t(r["end"])), None)
            todo = [r for r in rows if _t(r["end"]) > now] or todo
        r = cur or todo[0]
        s = by_id[r["stop_ids"][0]]
        idx = rows.index(r)
        title = r["title"] if r["badge"] != "PICK ONE" else "Pick one of 2 talks"
        if cur:
            # which talk of the session is on, and how many of it the user missed
            i = self._item_by_id(s["id"])
            slot = next((x for x in self.slots.get(i, []) if x["est_start"] == s["start"]), None)
            line, missed = f"Open until ~{_hhmm(r['end'])}", None
            if slot and slot["order"] and slot["est_end"] != slot["end"]:
                talks = [x for j in self.alive for x in self.slots.get(j, []) if x["session_id"] == slot["session_id"]]
                on = next((x for x in talks if _t(x["est_start"]) <= now < _t(x["est_end"])), slot)
                mins = int((now - _t(on["est_start"])).total_seconds() // 60)
                line = f"Talk {on['order']} of {len(talks)} · ~{mins} min in"
                n = sum(_t(x["est_end"]) <= now for x in talks)
                missed = f"You missed {n} earlier talk{'s' if n != 1 else ''}" if n else None
            return {"state": "NOW", "badge": "NOW", "label": line, "title": title, "line": missed,
                    "stop_ids": r["stop_ids"], "buttons": ["Catch up", "Question"]}
        first = not any(x["done"] for x in rows) and idx == 0
        prev_room = "Entrance Hall" if first else by_id[rows[idx - 1]["stop_ids"][0]]["room"]
        walk = self._walk(prev_room, s["room"], p["step_free"])
        parts = []
        state = "FIRST STOP" if first else "NEXT"
        if now is not None:
            mins = int((_t(r["start"]) - now).total_seconds() // 60)
            if 0 <= mins <= (walk["max"] if walk else 4) + 6:
                state = "LEAVE NOW"
                parts.append(f"Starts in ~{mins} min")
        if walk and walk["max"]:
            parts.append(f"{walk['min']}–{walk['max']} min " + ("from Registration" if first else "walk"))
        elif walk:
            parts.append("Same room")
        return {"state": state, "badge": state, "label": f"{r['time']} · {s['room']}", "title": title,
                "line": " · ".join(parts), "stop_ids": r["stop_ids"], "walk": walk,
                "buttons": ["Directions", "Skip"]}

    def _free(self, day, stops, p):
        """Free stretches of the day between stops (walking time left out)."""
        times = sorted((_t(s["start"]), _t(s["end"]), s["room"]) for s in stops)
        bounds = [(_t(x["start"]), _t(x["end"])) for i in self.alive for x in self._slot_on(i, day)]
        if not bounds:
            return []
        lo, hi = min(b[0] for b in bounds), max(b[1] for b in bounds)
        free, cur = [], lo
        for s, e, _ in times:
            if s - cur >= timedelta(minutes=VISIT_MIN + 6):
                free.append((cur, s))
            cur = max(cur, e + timedelta(minutes=5))
        if hi - cur >= timedelta(minutes=VISIT_MIN + 6):
            free.append((cur, hi))
        return free

    def _gaps(self, holes, stops):
        """v3 03-I · Removed: the time a removed stop had, offered as "Free 15:30–16:10 · Fill"."""
        out = []
        for q in holes:
            s, e = q["start"], q["end"]
            before = [_t(x["end"]) for x in stops if _t(x["end"]) <= e]
            after = [_t(x["start"]) for x in stops if _t(x["start"]) >= s]
            lo = max(before) + timedelta(minutes=5) if before else s - timedelta(minutes=30)
            hi = min(after) - timedelta(minutes=5) if after else e + timedelta(minutes=30)
            a, b = max(s, lo), min(e, hi)
            if b - a < timedelta(minutes=30):          # at least 30 min where there is room
                pad = (timedelta(minutes=30) - (b - a)) / 2
                a, b = max(lo, a - pad), min(hi, b + pad)
            lab = f"{a.strftime('%H:%M')}–{b.strftime('%H:%M')}"
            out.append({"kind": "free", "start": a.isoformat(), "end": b.isoformat(),
                        "label": f"Free {lab}", "action": "Fill",
                        "gap": {"start": a.strftime("%H:%M"), "end": b.strftime("%H:%M")},
                        "removed_id": self.items[q["i"]]["id"],
                        "toast": f"Removed {self.items[q['i']]['title']}", "undo": "Undo"})
        return out

    def _day_done(self, req, p, day, rows, st):
        later = [d for d in p["days"] if d > day]
        nxt = None
        if later:
            r = self.route(dict(req, day=later[0], now=None, state={}))
            if r.get("rows"):
                nxt = {"day": later[0], "stops": len(r["rows"]), "first": r["rows"][0]["time"],
                       "text": f"Your {_day_label(later[0], False).split()[0]} is ready"}
        wd = _day_label(day, False).split()[0]
        return {"badge": "DONE", "day_label": _day_label(day), "title": f"Your {wd} is done",
                "line": f"{sum(r['done'] for r in rows)} of {len(rows)} stops · "
                        f"{len(st['saved'])} talk{'s' if len(st['saved']) != 1 else ''} saved",
                "buttons": ["See your day"], "next_day": nxt}

    def _summary(self, i):
        return (self.summaries.get(self.items[i]["id"]) or {}).get("summary")

    def _catch_later(self, i, slot):
        """It has a video, or it is shown again later (v3 "Can catch later" / "Only here now")."""
        return bool(self.items[i]["video"]) or any(
            x["start"] and x["start"] > (slot["start"] or "") for x in self.slots.get(i, []))

    def _relevance(self, p):
        q = self._query(p)
        sim = self.emb @ self.ex.embed(q)
        low, on_topic = relevance(self.ex.cfg, sim, self.ex.bm25, q)
        return {"top_similarity": round(float(sim.max()), 4), "floor": self.ex.cfg.get("relevance_floor"),
                "on_topic": on_topic, "low": low, "few_matches": low}

    def _next(self, stops, now, p):
        now = now if isinstance(now, datetime) else self._now(now)
        cur = next((s for s in stops if _t(s["start"]) <= now < _t(s["end"])), None)
        nxt = next((s for s in stops if _t(s["start"]) > now), None)
        if not nxt:
            return None
        walk = self._walk(cur["room"] if cur else None, nxt["room"], p["step_free"])
        leave = _t(nxt["start"]) - timedelta(minutes=(walk or {}).get("max", 5))
        return {"room": nxt["room"], "title": nxt["title"], "starts": nxt["time"],
                "leave_now": now >= leave, "leave_at": leave.strftime("%H:%M"),
                "current_ending": bool(cur and _t(cur["end"]) - now <= timedelta(minutes=10)),
                "walk": walk,
                "text": (f"This talk is ending · next starts {nxt['time']} (est.)"
                         + (f" · {walk['minutes']}" if walk else "")
                         + (", step-free" if p["step_free"] else ""))}

    def _wildcard(self, p, score, day, top_topics, st, filt):
        """One talk a step outside the user's field: it shares a keyword, but its
        session topic is not one of the user's top topics."""
        allowed = self._allowed(p["tracks"])
        order = [i for i in np.argsort(-score, kind="stable")[POOL // 4:POOL * 4] if allowed[i] and not self.ex.dup[i]]
        for i in order:
            t = self.topic_of.get(i)
            if (not t or t in top_topics or i in st["removed"] or not self._ok(i, filt)
                    or not self._shared(i, p)):
                continue
            slots = self._slot_on(i, day)
            if slots:
                return i, slots[0], t
        return None

    def _same_topic_later(self, i, day, after, p):
        sims = self.emb @ self.emb[i]
        for j in np.argsort(-sims, kind="stable")[1:200]:
            if self.ex.dup[j] or j == i:
                continue
            for s in self._slot_on(j, day):
                if _t(s["est_start"]) >= after:
                    return {"id": self.items[j]["id"], "title": self.items[j]["title"],
                            "time": f"~{_hhmm(s['est_start'])}", "room": s["room"],
                            "text": f"Or the same topic at ~{_hhmm(s['est_start'])} in {s['room']}"}
        return None

    # -- 03-2 ---------------------------------------------------------------
    def more(self, req):
        """v2 03-2 More for you: only talks that fit the free time of the day's route
        (or one gap, {"gap": {"start": "15:30", "end": "16:10"}}). Talks that overlap
        the route stay in Explore."""
        p = self._profile(req)
        st = self._state(req)
        day = self._day(req.get("day") or p["days"][0])
        filt = self._filters(req.get("filters"))
        score = self._score(p)
        route = req.get("_route")
        free = req.get("_gaps")
        if route is None or free is None:
            r = self.route(dict(req, screen="route", now=None))
            stops = r.get("stops", [])
            route = [self._item_by_id(s["id"]) for s in stops]
            free = self._free(day, stops, p)
        gap = req.get("gap")
        if gap:
            if not (isinstance(gap, dict) and gap.get("start") and gap.get("end")):
                raise InputError('gap must look like {"start": "15:30", "end": "16:10"}')
            try:
                free = [(self._now(f"{day}T{gap['start']}:00"), self._now(f"{day}T{gap['end']}:00"))]
            except InputError:
                raise InputError('gap times must be "HH:MM"')
        picks = []
        for i in self._pool(p, score):
            if i in route or i in st["removed"] or not self._ok(i, filt):
                continue
            for s in self._slot_on(i, day)[:1]:
                a, b, flexible = self._interval(i, s)
                need = timedelta(minutes=VISIT_MIN) if flexible else b - a
                fit = None
                for x, y in free:
                    lo, hi = max(a, x), min(b, y)
                    if hi - lo >= need and (flexible or (a >= x and b <= y)):
                        fit = (x, y, lo)
                        break
                if not fit:
                    continue
                c = self._card(i, s, p, st)
                if flexible:
                    c["time"] = f"~{fit[2].strftime('%H:%M')}"
                c["only_today"] = all(x["start"][:10] == day for x in self.slots[i] if x["start"])
                c["fits"] = f"Fits {fit[0].strftime('%H:%M')}–{fit[1].strftime('%H:%M')}"
                c["fits_gap"] = {"start": fit[0].strftime("%H:%M"), "end": fit[1].strftime("%H:%M")}
                flags = []
                if c["only_today"] and c["badge"] != "PAPER":
                    flags.append("only today")
                if c["video"]:
                    flags.append("has video")
                c["line"] = " · ".join([c["time"] or "", c["room"]] + flags)
                c["label"] = f"{c['badge']} · {c['time']}"
                c["button"] = "+ Add"
                c["toast"] = f"Added {c['title']} at {(c['time'] or '').lstrip('~')}"
                c["overlaps_route"] = False
                picks.append(c)
        k = int(req.get("top_k") or 10)
        title = (f"Fits {gap['start']}–{gap['end']}" if gap else f"Fits your free time on {_day_label(day).split()[0]}")
        out = {"day": day, "day_label": _day_label(day), "title": title,
               "subtitle": "Fits your free time",
               "note": "Only talks that fit this gap. + Add fills it." if gap
               else "Only talks that fit your free time. + Add puts one in the route.",
               "total_picks": len(picks), "picks": picks[:k],
               "people": self._people(p, score, day, k=int(req.get("people_k") or 5)),
               "people_source": "From the public programme · name, institution and shared topics",
               "warnings": self._warnings(p)}
        if not picks:
            later = [d for d in p["days"] if d > day]
            out["state"] = "nothing_fits"
            out["empty"] = {"title": f"Nothing else fits {_day_label(day).split()[0]}",
                            "buttons": [f"See {_day_label(later[0]).split()[0]}"] if later else []}
        return out

    def _people(self, p, score, day, k=5):
        pool = [i for i in self._pool(p, score) if self._slot_on(i, day)][:40]
        agg = defaultdict(float)
        for i in pool:
            for a in self.items[i]["authors"]:
                agg[a["name"]] += float(score[i])
        out, used = [], set()
        for name, _ in sorted(agg.items(), key=lambda x: -x[1]):
            best = max((i for i in self.by_author[name] if i in pool), key=lambda i: score[i])
            if best in used:
                continue        # one person per talk: co-authors of the same talk add little
            prof = self._person(name)
            shared = sorted({kw for i in self.by_author[name] for kw in self._shared(i, p, False)})
            if not shared:
                continue
            nxt = self._next_appearance(name, day)
            out.append({**prof, "shared_topics": len(shared), "shared": shared,
                        "shared_label": f"{len(shared)} shared topic" + ("s" if len(shared) > 1 else ""),
                        "next": nxt, "via": {"id": self.items[best]["id"], "title": self.items[best]["title"]}})
            used.add(best)
            if len(out) == k:
                break
        return out

    def _person(self, name):
        affs = Counter((af["institution"], af["country"]) for i in self.by_author.get(name, [])
                       for a in self.items[i]["authors"] if a["name"] == name
                       for af in a["affiliations"][:1])
        inst, country = affs.most_common(1)[0][0] if affs else ("", "")
        parts = [w for w in re.split(r"[\s\-]+", name) if w]
        initials = (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper() if parts else ""
        return {"name": name, "initials": initials, "institution": inst, "country": country,
                "n_items": len(self.by_author.get(name, []))}

    def _appearances(self, name):
        out = []
        for i in self.by_author.get(name, []):
            kind = {"Paper": "Paper talk", "Journals": "Paper talk", "Posters": "Poster",
                    "Interactive Demos": "Demo"}.get(self.items[i]["type"], self.items[i]["type"])
            for s in self.slots.get(i, []):
                if s["start"]:
                    out.append({"kind": kind, "id": self.items[i]["id"], "title": self.items[i]["title"],
                                "start": s["est_start"], "end": s["est_end"], "room": s["room"],
                                "session": s["session"], "floor": s["floor"]})
        for s in self.chairing.get(name, []):
            if s["start"]:
                out.append({"kind": "Session chair", "id": None, "title": s["name"],
                            "start": s["start"], "end": s["end"], "room": s["room"],
                            "session": s["name"], "floor": s["floor"]})
        out.sort(key=lambda x: x["start"])
        for x in out:
            x.update({"day": x["start"][:10], "day_label": _day_label(x["start"][:10]).split()[0],
                      "time": _hhmm(x["start"])})
            if x["kind"] == "Poster":
                x["detail"] = f"Poster area · {int((_t(x['end']) - _t(x['start'])).seconds / 60)} min"
        return out

    def _next_appearance(self, name, day, after=None):
        for x in self._appearances(name):
            if x["day"] > day or (x["day"] == day and (after is None or x["start"] >= after)):
                where = (f"{x['kind'].lower()} in {x['room']}" if x["kind"] != "Poster"
                         else "poster session")
                return {**x, "text": f"Next · {x['day_label']} ~{x['time']} {where}"}
        return {"text": "No more sessions this week"}

    # -- 04 -----------------------------------------------------------------
    def _filters(self, f):
        if not f:
            return None
        if not isinstance(f, dict):
            raise InputError("filters must be a JSON object")
        out = {}
        if f.get("institutions"):
            names = set()
            for q in self._str_list(f["institutions"], "filters.institutions"):
                names |= self.ex.inst.match(q)[0] if q not in self.ex.inst.names else {q}
            out["inst"] = names
        if f.get("countries"):
            out["countries"] = {norm(c) for c in self._str_list(f["countries"], "filters.countries")}
        if f.get("topics"):
            out["topics"] = set(self._str_list(f["topics"], "filters.topics"))
        if f.get("days"):
            out["days"] = {self._day(d) for d in self._str_list(f["days"], "filters.days")}
        if f.get("tracks"):
            tr = self._str_list(f["tracks"], "filters.tracks")
            bad = [t for t in tr if t not in TRACKS]
            if bad:
                raise InputError(f"unknown track(s) {bad}; use any of {list(TRACKS)}")
            out["types"] = {t for x in tr for t in TRACKS[x]}
        return out

    def _ok(self, i, filt):
        if not filt:
            return True
        it = self.items[i]
        affs = [af for a in it["authors"] for af in a["affiliations"]]
        if "inst" in filt and not any(af["institution"] in filt["inst"] for af in affs):
            return False
        if "countries" in filt and not any(
                any(has_words(norm(af["country"]), c) or (c in ("korea", "south korea") and
                    "korea" in norm(af["country"])) for c in filt["countries"]) for af in affs):
            return False
        if "topics" in filt and not any(s["session"] in filt["topics"] for s in self.slots.get(i, [])):
            return False
        if "types" in filt and it["type"] not in filt["types"]:
            return False
        if "days" in filt and not any((x["start"] or "")[:10] in filt["days"]
                                      for x in self.slots.get(i, [])):
            return False
        return True

    def filters(self, req):
        p = self._profile(req)
        day = self._day(req.get("day") or p["days"][0])
        score = self._score(p)
        pool = [i for i in self._pool(p, score) if self._slot_on(i, day)]
        out = {"day": day}
        q = str(req.get("institution_query") or "").strip()
        if q:
            names, by_init = self.ex.inst.match(q)
            counts = Counter(af["institution"] for i in self.alive for a in self.items[i]["authors"]
                             for af in a["affiliations"] if af["institution"] in names)
            groups = defaultdict(list)
            for n in sorted(names):
                groups[self._inst_key(n)].append(n)
            rows = []
            for members in groups.values():
                label = max(members, key=lambda n: (counts[n], -len(n)))
                ids = {i for i in self.alive for a in self.items[i]["authors"]
                       for af in a["affiliations"] if af["institution"] in members}
                rows.append({"name": label, "spellings": sorted(members), "ids": ids,
                             "matches": q if norm(q) not in norm(label) else None,
                             "by_initials": any(m in by_init for m in members)})
            for r in rows:
                r["items"] = len(r["ids"])
            rows.sort(key=lambda r: -r["items"])
            if rows:
                head, rest = rows[0], []
                for r in rows[1:]:
                    if norm(r["name"]) == norm(q) or difflib.SequenceMatcher(
                            None, norm(r["name"]), norm(head["name"])).ratio() > 0.9:
                        head["spellings"] = sorted(set(head["spellings"]) | set(r["spellings"]))
                        head["ids"] |= r["ids"]
                        head["items"] = len(head["ids"])
                    else:
                        rest.append(r)
                rows = [head] + rest
                for r in rows:
                    r.pop("ids", None)
                    r["selected"] = r is head
                    r["line"] = f'matches "{q}"' if r is head and r["matches"] else f'{r["items"]} paper' + ('s' if r['items'] != 1 else '')
            out["institutions"] = rows or [{"name": s, "suggested": True}
                                           for s in self.ex.inst.suggest(q)]
        ranked, _ = self._topic_rank(p)
        out["topics"] = ranked[:4]
        out["countries"] = [c for c, _ in Counter(
            c for i in pool for c in dict.fromkeys(af["country"] for a in self.items[i]["authors"]
                                                  for af in a["affiliations"] if af["country"])).most_common(3)]
        out["tracks"] = list(TRACKS)
        filt = self._filters(req.get("filters"))
        if filt is not None:
            n = sum(self._ok(i, filt) for i in pool)
            out["counts"] = {"replan_route": n, "filter_picks": n,
                             "buttons": ["Filter picks only", f"Re-plan route · {n}"]}
        out["warnings"] = self._warnings(p)
        return out

    # -- 05 -----------------------------------------------------------------
    def search(self, req):
        q = str(req.get("q") or req.get("query") or "").strip()
        filt = self._filters(req.get("filters"))
        if not q and not filt:
            raise InputError('search needs "q" (a name, title, topic or institution) or "filters"')
        by = req.get("by")
        if by not in (None, "institution", "day", "field"):
            raise InputError('by must be "institution", "day" or "field"')
        k = int(req.get("top_k") or 10)
        nq = norm(q)
        words = nq.split()
        papers, who = [], {}
        # v2 05 Explore: "Search everything at CHI. Not ranked for you." The profile
        # is not used here; order is match type, then time.
        day = None
        if not q:
            papers = sorted(self.alive, key=lambda i: (self.slots[i][0]["start"] or "9999")
                            if self.slots.get(i) else "9999")
        elif by in ("institution", "field"):
            res = self.ex.predict({"institution" if by == "institution" else "department": q,
                                   "top_k": 1000})
            for r in res["results"]:
                i = self._item_by_id(r["id"])
                papers.append(i)
                who[i] = r["matched_authors"][0] if r["matched_authors"] else None
        elif by == "day":
            day = self._day(q)
            papers = [i for i in self.alive if self._slot_on(i, day)]
        else:
            people_hit = [n for n in self.by_author if has_prefixes(norm(n), words)]
            by_people = [i for n in people_hit for i in self.by_author[n]]
            for n in people_hit:
                for i in self.by_author[n]:
                    who.setdefault(i, {"name": n})
            title_hits = [i for i in self.alive if has_prefixes(self.ntitle[i], words)]
            names, _ = self.ex.inst.match(q) if len(words) <= 6 else (set(), set())
            inst_hits = [i for i in self.alive if any(
                af["institution"] in names for a in self.items[i]["authors"]
                for af in a["affiliations"])] if names else []
            papers = list(dict.fromkeys(by_people + inst_hits + title_hits))
            if not (by_people or inst_hits):
                # a title or topic: title matches first, then the rest by topic, unless
                # CHI does not cover the topic (then the nearest talks are not matches)
                sim = self.emb @ self.ex.embed(q)
                score = _minmax(sim) + self.ex.cfg["hybrid_w"] * _minmax(self.ex.bm25.scores(q))
                papers.sort(key=lambda i: -score[i])
                if not relevance(self.ex.cfg, sim, self.ex.bm25, q)[0]:
                    papers = list(dict.fromkeys(papers + [i for i in np.argsort(-score, kind="stable")[:200]
                                                          if not self.ex.dup[i]]))
        if by == "day":
            papers.sort(key=lambda i: (BADGE.get(self.items[i]["type"]) != "PAPER",
                                       (self._slot_on(i, day) or [{"start": ""}])[0]["start"]))
        papers = [i for i in papers if self._ok(i, filt)]
        people = sorted((n for n in self.by_author if words and has_prefixes(norm(n), words)
                         and (not filt or any(self._ok(i, filt) for i in self.by_author[n]))),
                        key=lambda n: (-len(self.by_author[n]), n))
        sessions = [s for s in self.venue["sessions"] if words and has_prefixes(norm(s["name"]), words)
                    and (not filt or "days" not in filt or (s["start"] or "")[:10] in filt["days"])]

        def row(i):
            c = self._card(i)
            fa = c["first_author"] or {}
            if who.get(i):          # show the author that matched the search
                fa = next((a for a in self._authors_short(i) if a["name"] == who[i]["name"]), fa)
            day = (c.get("day_label") or "").split(" ")[0]
            return {"id": c["id"], "badge": c["badge"], "title": c["title"],
                    "label": " · ".join(x for x in (c["badge"], day) if x), "button": "+ Add",
                    "line": " · ".join(x for x in (fa.get("name"), fa.get("institution"), day) if x)}
        # v3 05 Explore: tabs Talks / People / Sessions; 04 Filters: "Show [n] results"
        out = {"q": q, "by": by, "header": "Search talks, people, topics",
                "filters": {"count": len(req.get("filters") or {}),
                            "label": f"Filters · {len(req.get('filters') or {})}",
                            "button": f"Show {len(papers)} result{'s' if len(papers) != 1 else ''}"} if filt else None,
                "tabs": {"talks": len(papers), "people": len(people), "sessions": len(sessions)},
                "talks": [row(i) for i in papers[:k]],
                "people": [self._person(n) for n in people[:k]],
                "sessions": [{"name": s["name"], "room": s["room"], "start": s["start"],
                              "time": _hhmm(s["start"]),
                              "day_label": _day_label(s["start"][:10]) if s["start"] else None,
                              "items": s["n_items"]} for s in sessions[:k]],
                "note": "Recent searches are kept by the app on the phone, not by the model."}
        if not (papers or people or sessions):
            out["state"] = "no_results"
            out["empty"] = {"title": "No matches", "buttons": ["Clear filters"] if filt else []}
        return out

    # -- 06 -----------------------------------------------------------------
    def paper(self, req):
        i = self._item_by_id(req.get("id"))
        p = self._profile(req, need_research=False)
        st = self._state(req)
        has_profile = bool(p["research"] or p["keywords"] or p["topics"])
        c = self._card(i, None, p if has_profile else None, st)
        it = self.items[i]
        authors = self._authors_short(i)
        insts, groups = [], set()
        for a in authors:
            g = self._inst_key(a["institution"]) if a["institution"] else None
            x = ", ".join(v for v in (a["institution"], a["country"]) if v)
            acro = re.search(r"\(([^()]+)\)\s*$", a["institution"])
            if acro:            # "Korea Advanced ... (KAIST)" after "KAIST": same school
                g2 = self.ex.inst.find(norm(acro.group(1)))
                if g2 in groups:
                    continue
                groups.add(g2)
            if x and g not in groups:
                groups.add(g)
                insts.append(x)
        sims = self.emb @ self.emb[i]
        similar = []
        my_sessions = {s["session_id"] for s in self.slots.get(i, [])}
        for j in np.argsort(-sims, kind="stable"):
            if j == i or self.ex.dup[j]:
                continue
            cj = self._card(j)
            same = bool(my_sessions & {s["session_id"] for s in self.slots.get(j, [])})
            where = cj.get("room") or ""
            if cj["remote"]:
                where = "video only (remote)"
            elif cj["badge"] == "POSTER":
                where = "Poster area"
            similar.append({"id": cj["id"], "title": cj["title"], "badge": cj["badge"],
                            "similarity": round(float(sims[j]), 3), "same_session": same,
                            "line": " · ".join(x for x in ((cj.get("day_label") or "").split(" ")[0],
                                                           where, "same session" if same else "") if x)})
            if len(similar) == int(req.get("similar_k") or 3):
                break
        when = None
        if c.get("start"):
            # v3 06: "Tue 11 · ~11:36 · [Room B]"
            when = f"{c['day_label']} · ~{_hhmm(c['start'])} · {c['room']}"
        names = [a["name"] for a in authors]
        slot = (self.slots.get(i) or [None])[0]
        later = [x for x in self.slots.get(i, []) if slot and x["start"] and x["start"] > (slot["start"] or "")]
        if later:
            avail = f"Can catch later · also {_day_label(later[0]['start'][:10]).split()[0]} ~{_hhmm(later[0]['est_start'])}"
        elif it["video"]:
            avail = "Can catch later · has video"
        else:
            avail = "Only here now · no video"
        out = {**c, "authors": authors, "institutions": insts, "when": when,
               "authors_line": ", ".join(names[:2]) + (f" +{len(names) - 2}" if len(names) > 2 else ""),
               "availability": avail,
               "where": f"{c['room']} · {c['talk_order']} in “{c['session']}”"
               if c.get("talk_order") else (c.get("room") or None),
               "all_slots": self.slots.get(i, []),
               "abstract": it["abstract"],
               "summary": {"label": "Summary · AI, from the abstract", "text": self._summary(i), "language": "en",
                           "note": "One English sentence written offline from the abstract by a "
                                   "local LLM. Other languages are app-side."},
               "questions": (self.summaries.get(it["id"]) or {}).get("questions", []),
               "buttons": ["Question", "Add to my day"],
               "similar": similar}
        if req.get("from_room") and c.get("room"):
            out["directions"] = self._walk(req["from_room"], c["room"], p["step_free"])
        return out

    # -- 07 -----------------------------------------------------------------
    def author(self, req):
        name = str(req.get("name") or "").strip()
        if not name:
            raise InputError('author needs "name"')
        if name not in self.by_author:
            cands = [n for n in self.by_author if norm(n) == norm(name)] or \
                    [n for n in self.by_author if has_prefixes(norm(n), norm(name).split())]
            if len(cands) == 1:
                name = cands[0]
            else:
                sug = cands[:8] or difflib.get_close_matches(name, list(self.by_author), n=5)
                raise InputError(f'no single author named "{name}"'
                                 + (f"; did you mean: {', '.join(sug)}" if sug else ""))
        p = self._profile(req, need_research=False)
        prof = self._person(name)
        mine = self.by_author[name]
        shared = sorted({kw for i in mine for kw in self._shared(i, p, False)}) if (
            p["research"] or p["keywords"]) else []
        theirs = [t for t, _ in Counter(self.topic_of[i] for i in mine if i in self.topic_of)
                  .most_common() if t not in shared][:2]
        where = self._appearances(name)
        sim = self._similar_authors(name, k=int(req.get("similar_k") or 3))
        return {**prof, "header": "Public programme data only",
                "papers_label": f"{prof['n_items']} papers at {self.venue['name']}",
                "overlaps": {"shared": shared, "theirs": theirs},
                "where": where,
                "papers": [{"id": self.items[i]["id"], "title": self.items[i]["title"],
                            "badge": BADGE.get(self.items[i]["type"], "")} for i in mine],
                # v3 07: "[Institution] · [Country]", "Their talks" with day · time · place
                "line": " · ".join(x for x in (prof["institution"], prof["country"]) if x),
                "their_talks": [{"id": x["id"], "title": x["title"], "kind": x["kind"],
                                 "label": f"{x['day_label']} · ~{x['time']} · "
                                          + ("Poster area" if x["kind"] == "Poster" else x["room"]),
                                 "button": "+ Add"} for x in where if x["id"] is not None],
                "note": "They may not be at every session.",
                "buttons": ["Prepare a question"],
                "similar": sim}

    def _similar_authors(self, name, k=3):
        if self._author_emb is None:
            names = sorted(self.by_author)
            m = np.stack([self.emb[self.by_author[n]].mean(0) for n in names])
            self._author_emb = (names, m / np.linalg.norm(m, axis=1, keepdims=True))
        names, m = self._author_emb
        me = names.index(name)
        coauthors = {a["name"] for i in self.by_author[name] for a in self.items[i]["authors"]}
        out, seen = [], set()
        for j in np.argsort(-(m @ m[me]), kind="stable"):
            talks = frozenset(self.by_author[names[j]])
            if names[j] in coauthors or talks in seen:
                continue        # skip co-authors, and people with the very same talks
            seen.add(talks)
            pr = self._person(names[j])
            out.append({"name": pr["name"], "institution": pr["institution"]})
            if len(out) == k:
                break
        return out

    # -- 08 -----------------------------------------------------------------
    def wrapup(self, req):
        p = self._profile(req)
        st = self._state(req)
        day = self._day(req.get("day") or p["days"][0])
        seen = list(dict.fromkeys(st["saved"] + st["attended"]))
        topics = Counter(self.topic_of[i] for i in seen if i in self.topic_of)
        mostly = [{"topic": t, "count": n} for t, n in topics.most_common(3)]
        score = self._score(p)
        later = [d for d in p["days"] if d > day] or [d for d in self.days if d > day]
        tomorrow = None
        if mostly and later:
            a = mostly[0]["topic"]
            # a bridge toward a topic not seen today, one keyword away from the user
            w = self._wildcard(p, score, later[0], set(topics) | set(self._topic_rank(p)[0][:3]),
                               dict(st, removed=st["removed"] | set(seen)), None)
            if w:
                bridge, b = w[0], w[2]
                # v3 08: "For tomorrow · Try one talk in [new field] on Wed?"
                field = self.clusters[self.cluster_of[bridge]]["label"] if bridge in self.cluster_of else b
                wd = _day_label(later[0]).split()[0]
                tomorrow = {"day": later[0], "from_topic": a, "to_topic": b, "field": field,
                            "label": "For tomorrow", "text": f"Try one talk in {field} on {wd}?",
                            "bridge": self._card(bridge, w[1], p),
                            "buttons": ["No thanks", f"Add to {wd}"],
                            "note": f"Updates {_day_label(later[0], False).split()[0]}'s route. "
                                    "You can undo it there."}
        if self.clusters:
            # bubbles = topic clusters of the whole program, sized by saved + attended
            cnt = Counter(self.cluster_of[i] for i in seen if i in self.cluster_of)
            clusters = [{"id": self.clusters[c]["id"], "label": self.clusters[c]["label"],
                         "count": n, "new": False} for c, n in cnt.most_common(3)]
            if tomorrow:
                c = self.cluster_of.get(self._item_by_id(tomorrow["bridge"]["id"]))
                if c is not None and all(x["id"] != self.clusters[c]["id"] for x in clusters):
                    clusters.append({"id": self.clusters[c]["id"], "label": self.clusters[c]["label"],
                                     "count": 0, "new": True, "suggested": True})
        else:
            clusters = [{"label": t["topic"], "count": t["count"], "new": False} for t in mostly]
            if tomorrow:
                clusters.append({"label": tomorrow["to_topic"], "count": 0, "new": True,
                                 "suggested": True})
        saved_rows = []
        for i in seen:
            status = "Attended" if i in st["attended"] else "Saved, not attended"
            if i not in st["attended"] and self.items[i]["video"]:
                status += " · has video"
            saved_rows.append({"id": self.items[i]["id"], "title": self.items[i]["title"],
                               "status": status, "saved": i in st["saved"]})
        authors = []
        for n in st["opened_authors"]:
            pr = self._person(n) if n in self.by_author else {"name": n, "institution": ""}
            authors.append({"name": n, "institution": pr["institution"],
                            "next": self._next_appearance(n, day, after=f"{day}T23:59")
                            if n in self.by_author else {"text": "No more sessions this week"}})
        # v3 08 "People to find tomorrow": opened authors who present on the next day
        people = []
        if later:
            for n in st["opened_authors"]:
                for x in self._appearances(n) if n in self.by_author else []:
                    if x["day"] == later[0]:
                        people.append({"name": n, "id": x["id"], "start": x["start"],
                                       "label": f"{x['day_label']} · ~{x['time']} · "
                                                + ("Poster area" if x["kind"] == "Poster" else x["room"])})
                        break
            people.sort(key=lambda x: x["start"])
        return {"day": day, "header": f"{_day_label(day)} · end of day",
                "people_to_find": {"label": "People to find tomorrow", "people": people},
                "title": f"Your {_day_label(day, False).split()[0]} at {self.venue['name'].split()[0]}",
                "counts": {"papers_saved": len(st["saved"]), "talks_attended": len(st["attended"]),
                           "authors_opened": len(st["opened_authors"])},
                "mostly_about": mostly, "clusters": clusters,
                "papers": saved_rows, "authors": authors, "for_tomorrow": tomorrow,
                "note": "Built from what you saved and marked as attended. Stored on this phone only."}

    # -- clusters (08 bubbles, conference map on hold) ------------------------
    def _cluster_ref(self, cid):
        """"c03" -> (its index, None); a sub-topic "c03.2" -> (index, sub-topic index)."""
        base, _, sub = str(cid).partition(".")
        n = next((k for k, c in enumerate(self.clusters) if c["id"] == base), None)
        subs = self.clusters[n].get("subclusters", []) if n is not None else []
        k = next((k for k, x in enumerate(subs) if x["id"] == cid), None)
        if n is None or (sub and k is None):
            raise InputError(f"unknown cluster {json.dumps(cid)}; ids are c00..c{len(self.clusters) - 1:02d}, "
                             f"sub-topics like c00.1")
        return n, (k if sub else None)

    def _cluster_brief(self, n, rel=None, mine=0, rec=None):
        c = self.clusters[n]
        out = {"id": c["id"], "label": c["label"], "description": c.get("description"),
               "size": c["size"], "keywords": [k["keyword"] for k in c["keywords"][:5]],
               "map": c["map"], "relevance": None if rel is None else round(float(rel), 4),
               "yours": mine, "subtopics": len(c.get("subclusters", []))}
        if rec is not None:
            out["recommended"] = rec
        return out

    def _sub_brief(self, n, k, rec=None, mine=0):
        x = self.clusters[n]["subclusters"][k]
        out = {"id": x["id"], "label": x["label"], "description": x.get("description"), "size": x["size"],
               "keywords": [y["keyword"] for y in x["keywords"][:4]], "map": x["map"], "yours": mine}
        if rec is not None:
            out["recommended"] = rec
        return out

    def _path(self, i):
        """Where a talk sits: [topic, sub-topic]."""
        out = []
        if i in self.cluster_of:
            c = self.clusters[self.cluster_of[i]]
            out.append({"id": c["id"], "label": c["label"]})
        if i in self.sub_of:
            n, k = self.sub_of[i]
            x = self.clusters[n]["subclusters"][k]
            out.append({"id": x["id"], "label": x["label"]})
        return out

    def clusters_screen(self, req):
        """All topic clusters of the program, each split into sub-topics ({"cluster": "c03"}
        for one, "c03.2" for a sub-topic). With a profile they are ordered by closeness to
        the research, "recommended" counts the user's 30 best-matching talks in each, and
        "where" shows the topic and sub-topic of the best ones, so the app can start broad
        and narrow down (11/7). With state, "yours" counts saved and attended talks."""
        if not self.clusters:
            raise InputError("this package has no clusters.json")
        pp = req.get("profile", req)
        has_p = isinstance(pp, dict) and any(pp.get(f) for f in ("research", "keywords", "topics"))
        p = self._profile(req) if has_p else None
        st = self._state(req)
        seen = set(st["saved"]) | set(st["attended"])
        mine = Counter(self.cluster_of[i] for i in seen if i in self.cluster_of)
        mine_s = Counter(self.sub_of[i] for i in seen if i in self.sub_of)
        rel = (np.stack([c["emb"] for c in self.clusters]) @ self.ex.embed(self._query(p))) if p else None
        score = self._score(p) if p else None
        recs = self._pool(p, score)[:30] if p else []
        rec_c = Counter(self.cluster_of[i] for i in recs if i in self.cluster_of)
        rec_s = Counter(self.sub_of[i] for i in recs if i in self.sub_of)
        cid = req.get("cluster")
        if cid:
            n, sub = self._cluster_ref(cid)
            c = self.clusters[n]
            head = dict(self._cluster_brief(n, None if rel is None else rel[n], mine[n], rec_c[n] if p else None),
                        top_sessions=c["top_sessions"], types=c["types"])
            if sub is None:
                idx, kws = list(c["idx"]), c["keywords"]
                path = [{"id": c["id"], "label": c["label"]}]
            else:
                pos = {it["id"]: i for i, it in enumerate(self.items)}
                x = c["subclusters"][sub]
                idx, kws = [pos[y] for y in x["items"] if y in pos], x["keywords"]
                path = [{"id": c["id"], "label": c["label"]}, {"id": x["id"], "label": x["label"]}]
            if p:
                idx.sort(key=lambda i: -score[i])
            k = int(req.get("top_k") or 20)
            out = {"cluster": head, "path": path,
                   "subtopics": [self._sub_brief(n, j, rec_s[(n, j)] if p else None, mine_s[(n, j)])
                                 for j in range(len(c.get("subclusters", [])))]}
            if sub is not None:
                out["subtopic"] = self._sub_brief(n, sub, rec_s[(n, sub)] if p else None, mine_s[(n, sub)])
            out.update({"keywords": [{"keyword": x["keyword"], "talks": len(x["items"]), "ids": x["items"]}
                                     for x in kws],
                        "order": "closest to your research" if p else "closest to the cluster centre",
                        "total": len(idx), "talks": [self._card(i, p=p, state=st) for i in idx[:k]],
                        "warnings": self._warnings(p) if p else []})
            return out
        order = list(np.argsort(-rel, kind="stable")) if p else sorted(range(len(self.clusters)),
                                                                       key=lambda k: -self.clusters[k]["size"])
        return {"total": len(self.clusters),
                "order": "closest to your research" if p else "largest first",
                "clusters": [self._cluster_brief(k, None if rel is None else rel[k], mine[k], rec_c[k] if p else None)
                             for k in order],
                "for_you": [self.clusters[k]["id"] for k in order[:3]] if p else [],
                "where": [{"id": self.items[i]["id"], "title": self.items[i]["title"], "path": self._path(i)}
                          for i in recs[:5]],
                "note": "Clusters are built from what the talks are about (title, abstract), not "
                        "from the session names. map x/y place close clusters near each other; "
                        "each cluster's sub-topics have their own map.",
                "warnings": self._warnings(p) if p else []}

    # -- start / browse / plan: pick talks yourself, or get recommendations (11/7) ----
    def _lite(self, i, score=None, best=None):
        """A talk as one line of a shelf."""
        c = self._card(i)
        fa = c["first_author"] or {}
        out = {"id": c["id"], "badge": c["badge"], "title": c["title"],
               "line": " · ".join(x for x in (fa.get("name"), fa.get("institution"),
                                              (c.get("day_label") or "").split(" ")[0], c.get("time")) if x),
               "summary": self._summary(i)}
        if score is not None:
            out["grade"] = self._grade(score[i], best)
        return out

    def _cart_score(self, cart):
        """Closeness to the talks the user picked (their average vector)."""
        v = self.emb[cart].mean(0)
        return _minmax(self.emb @ (v / np.linalg.norm(v)))

    def _taste(self, req, st):
        """What to rank by: the research question if there is one, else the picked talks.
        -> (profile or None, score or None, "research" | "picks" | None)"""
        pp = req.get("profile", req)
        if isinstance(pp, dict) and any(pp.get(f) for f in ("research", "keywords", "topics")):
            p = self._profile(req)
            return p, self._score(p), "research"
        if st["cart"]:
            return None, self._cart_score(st["cart"]), "picks"
        return None, None, None

    def _by_time(self, idx):
        return sorted(idx, key=lambda i: ((self.slots.get(i) or [{"start": None}])[0]["start"] or "9999",
                                          self.items[i]["title"]))

    def _topic_order(self, score):
        """Clusters by how many of the best-matching talks they hold, else by size."""
        if score is None:
            return sorted(range(len(self.clusters)), key=lambda k: -self.clusters[k]["size"])
        top = np.argsort(-score, kind="stable")[:POOL]
        cnt = Counter(self.cluster_of[i] for i in top if i in self.cluster_of)
        return sorted(range(len(self.clusters)), key=lambda k: (-cnt[k], -self.clusters[k]["size"]))

    def start(self, req):
        """11/7: the first screen offers two ways in, picking talks yourself or getting
        recommendations, and the shelves to pick from (never an empty page)."""
        st = self._state(req)
        p, score, source = self._taste(req, st)
        best = float(score[self.alive].max()) if score is not None else None
        cart = set(st["cart"])
        shelves = []
        if source:
            allowed = self._allowed(p["tracks"] if p else DEFAULT_TRACKS)
            ids = [i for i in np.argsort(-score, kind="stable") if allowed[i] and not self.ex.dup[i]
                   and i not in cart][:SHELF_K]
            shelves.append({"id": "for_you" if source == "research" else "similar",
                            "title": "For your research" if source == "research" else "Like the talks you picked",
                            "kind": "talks", "talks": [self._lite(i, score, best) for i in ids]})
        if self.clusters:
            shelves.append({"id": "topics", "title": "Topics at CHI", "kind": "topics",
                            "topics": [{"id": self.clusters[k]["id"], "label": self.clusters[k]["label"],
                                        "description": self.clusters[k].get("description"),
                                        "size": self.clusters[k]["size"],
                                        "subtopics": len(self.clusters[k].get("subclusters", [])),
                                        "examples": self.clusters[k]["examples"][:2]}
                                       for k in self._topic_order(score)]})
        for sid, title in (("keynotes", "Keynotes"), ("demos", "Demos to try")):
            idx = [i for i in self.alive if self.type_of[i] in SHELF_TYPES[sid] and i not in cart]
            idx = sorted(idx, key=lambda i: -score[i]) if score is not None else self._by_time(idx)
            shelves.append({"id": sid, "title": title, "kind": "talks", "total": len(idx),
                            "talks": [self._lite(i, score, best) for i in idx[:SHELF_K]]})
        shelves.append({"id": "search", "title": "Find people and schools", "kind": "search",
                        "hint": 'A name or a school, e.g. "Geehyuk Lee" or "KAIST"',
                        "next": {"screen": "search"}})
        n = len(st["cart"])
        return {"title": "How do you want to start?",
                "modes": [{"id": "pick", "title": "Pick talks myself",
                           "body": "Browse topics, people and schools and add talks to your list. "
                                   "ARC turns the list into a plan for each day.",
                           "next": {"screen": "browse"}},
                          {"id": "recommend", "title": "Get recommendations",
                           "body": "Tell ARC what you research. It picks the talks and plans each day.",
                           "next": {"screen": "keywords"}}],
                "suggested_mode": "recommend" if source == "research" else "pick" if n else None,
                "cart": {"count": n, "label": f"{n} talk{'s' if n != 1 else ''} picked",
                         "next": {"screen": "plan"} if n else None},
                "personalized_by": source, "shelves": shelves,
                "note": "Shelves follow the research question if there is one, else the picked talks; "
                        "with neither they are not personalized."}

    def _shelf(self, shelf, score, p):
        """-> (title, item indices in order, extra fields) for one shelf."""
        if shelf in ("for_you", "similar"):
            if score is None:
                raise InputError(f'shelf "{shelf}" needs the research question or picked talks (state.cart)')
            allowed = self._allowed(p["tracks"] if p else DEFAULT_TRACKS)
            idx = [i for i in np.argsort(-score, kind="stable") if allowed[i] and not self.ex.dup[i]][:POOL]
            return ("For your research" if shelf == "for_you" else "Like the talks you picked"), idx, {}
        if shelf == "topics":
            return "Topics at CHI", [], {"topics": [self._cluster_brief(k) for k in self._topic_order(score)]}
        if shelf.startswith("topic:"):
            n, sub = self._cluster_ref(shelf[6:])
            c = self.clusters[n]
            if sub is None:
                idx = list(c["idx"])
                extra = {"subtopics": [self._sub_brief(n, k) for k in range(len(c.get("subclusters", [])))]}
                title = c["label"]
            else:
                pos = {it["id"]: i for i, it in enumerate(self.items)}
                idx = [pos[x] for x in c["subclusters"][sub]["items"] if x in pos]
                extra = {"parent": {"id": c["id"], "label": c["label"]}}
                title = c["subclusters"][sub]["label"]
            if score is not None:
                idx.sort(key=lambda i: -score[i])
            return title, idx, extra
        if shelf in SHELF_TYPES:
            idx = [i for i in self.alive if self.type_of[i] in SHELF_TYPES[shelf]]
            idx = sorted(idx, key=lambda i: -score[i]) if score is not None else self._by_time(idx)
            return shelf.capitalize(), idx, {}
        if shelf.startswith("day:"):
            day = self._day(shelf[4:])
            idx = [i for i in self.alive if self._slot_on(i, day)]
            idx = sorted(idx, key=lambda i: -score[i]) if score is not None else sorted(
                idx, key=lambda i: (self._slot_on(i, day)[0]["start"], self.items[i]["title"]))
            return _day_label(day, False), idx, {}
        raise InputError(f'unknown shelf {json.dumps(shelf)}; use for_you, similar, topics, topic:<id>, '
                         f'day:<day> or one of {list(SHELF_TYPES)}')

    def browse(self, req):
        """One shelf of talks to pick from, paged (top_k, offset). Without research or
        picks it is not personalized; with them each talk has a grade."""
        st = self._state(req)
        p, score, source = self._taste(req, st)
        shelf = str(req.get("shelf") or ("for_you" if source == "research" else "similar" if source else "topics"))
        k, off = int(req.get("top_k") or 20), int(req.get("offset") or 0)
        title, idx, extra = self._shelf(shelf, score, p)
        best = float(score[self.alive].max()) if score is not None else None
        cart = set(st["cart"])
        return {"shelf": shelf, "title": title, **extra, "total": len(idx), "offset": off,
                "talks": [dict(self._lite(i, score, best), in_cart=i in cart) for i in idx[off:off + k]],
                "personalized_by": source, "cart": {"count": len(cart)},
                "warnings": self._warnings(p) if p else []}

    def _fill(self, day, free, score, exclude, tracks, k=5):
        """Talks not picked yet that fit the free stretches of the day, best first."""
        allowed = self._allowed(tracks)
        out = []
        for i in np.argsort(-score, kind="stable")[:POOL * 2]:
            if i in exclude or not allowed[i] or self.ex.dup[i]:
                continue
            for s in self._slot_on(i, day)[:1]:
                a, b, flexible = self._interval(i, s)
                need = timedelta(minutes=VISIT_MIN) if flexible else b - a
                for x, y in free:
                    lo, hi = max(a, x), min(b, y)
                    if hi - lo >= need and (flexible or (a >= x and b <= y)):
                        out.append({**self._lite(i), "time": f"~{lo.strftime('%H:%M')}", "room": s["room"],
                                    "fits": f"Fits {x.strftime('%H:%M')}–{y.strftime('%H:%M')}"})
                        break
            if len(out) == k:
                break
        return out

    def plan(self, req):
        """11/7: the talks the user picked (state.cart) turned into a plan for each day:
        estimated times, walking between rooms, picks that clash shown as choice 1 / 2 / 3
        (the better match first), free time with talks that fit it, and talks like the
        picks. Only walking is kept between picks (no extra break: the user chose them)."""
        st = self._state(req)
        if not st["cart"]:
            raise InputError('plan needs the picked talks: "state": {"cart": [ids]}')
        p0 = self._profile(req, need_research=False)
        p, score, source = self._taste(req, st)
        picks = self._cart_score(st["cart"])
        best = float(score[self.alive].max())
        want = self._day(req["day"]) if req.get("day") else None
        by_day, unscheduled, elsewhere = defaultdict(list), [], []
        # a talk shown on several days goes to the day with the most other picks
        busy = Counter(d for i in st["cart"] for d in dict.fromkeys(x["start"][:10] for x in self.slots.get(i, [])
                                                                     if x["start"]))
        for i in st["cart"]:
            slots = [x for x in self.slots.get(i, []) if x["start"]]
            if slots and not want:
                slots = sorted(slots, key=lambda x: -busy[x["start"][:10]])
            if want:
                on = [x for x in slots if x["start"][:10] == want]
                if on:
                    by_day[want].append((i, on[0]))
                else:
                    (elsewhere if slots else unscheduled).append(i)
            elif slots:
                by_day[slots[0]["start"][:10]].append((i, slots[0]))
            else:
                unscheduled.append(i)
        days = []
        for day in sorted(by_day):
            placed, clashes = [], []
            for i, slot in sorted(by_day[day], key=lambda x: -score[x[0]]):
                fit = self._fit(placed, i, slot, 0, p0["step_free"])
                if fit:
                    placed.append({"i": i, "slot": slot, "start": fit[0], "end": fit[1], "kind": "picked"})
                else:
                    clashes.append((i, slot))
            placed.sort(key=lambda q: q["start"])
            stops = []
            for n, q in enumerate(placed):
                c = self._card(q["i"], q["slot"], p, st)
                nxt = placed[n + 1] if n + 1 < len(placed) else None
                c.update({"stop": n + 1, "kind": "picked", "score": round(float(score[q["i"]]), 4),
                          "grade": self._grade(score[q["i"]], best),
                          "time": f"~{q['start'].strftime('%H:%M')}", "start": q["start"].isoformat(),
                          "end": q["end"].isoformat(),
                          "walk_to_next": self._walk(q["slot"]["room"], nxt["slot"]["room"], p0["step_free"])
                          if nxt else None})
                c["options"] = [{"choice": 1, "id": c["id"], "title": c["title"], "grade": c["grade"],
                                 "time": c["time"], "room": c["room"], "current": True}]
                stops.append(c)
            for i, slot in clashes:
                if not stops:
                    unscheduled.append(i)
                    continue
                s, e, _ = self._interval(i, slot)
                n = max(range(len(placed)), key=lambda n: (
                    (min(e, placed[n]["end"]) - max(s, placed[n]["start"])).total_seconds(),
                    -abs((placed[n]["start"] - s).total_seconds())))
                stops[n]["options"].append({"choice": len(stops[n]["options"]) + 1, "id": self.items[i]["id"],
                                            "title": self.items[i]["title"], "grade": self._grade(score[i], best),
                                            "time": f"~{_hhmm(slot['est_start'])}", "room": slot["room"],
                                            "reason": f"clashes with stop {n + 1}",
                                            "swap": {"replaces": stops[n]["id"], "button": "Swap"}})
            rows = []
            for c in stops:
                two = len(c["options"]) > 1
                rows.append({"time": c["time"], "badge": f"{len(c['options'])} PICKS" if two else c["badge"],
                             "title": "Clash · choose one" if two else c["title"], "stop_ids": [c["id"]],
                             "option_ids": [o["id"] for o in c["options"][1:]], "start": c["start"], "end": c["end"]})
            free = self._free(day, stops, p0)
            n_clash = sum(len(c["options"]) > 1 for c in stops)
            fill = self._fill(day, free, score, set(st["cart"]), p0["tracks"])
            days.append({"date": day, "day_label": _day_label(day), "title": f"{_day_label(day)} · your picks",
                         "summary": f"{len(by_day[day])} picks · {len(stops)} stops"
                                    + (f" · {n_clash} clash{'es' if n_clash > 1 else ''} to choose" if n_clash else "")
                                    + (f" · {len(free)} free slot{'s' if len(free) > 1 else ''}" if free else ""),
                         "stops": stops, "rows": rows,
                         "free": [{"start": x.isoformat(), "end": y.isoformat(),
                                   "label": f"Free {x.strftime('%H:%M')}–{y.strftime('%H:%M')}"} for x, y in free],
                         "fill": fill})
        cart = set(st["cart"])
        similar = [self._lite(i, picks, float(picks[self.alive].max())) for i in np.argsort(-picks, kind="stable")
                   if not self.ex.dup[i] and i not in cart][:SHELF_K]
        return {"cart": len(st["cart"]), "ranked_by": source, "grading": GRADING, "days": days,
                "unscheduled": [self._lite(i) for i in unscheduled],
                "on_other_days": [self._lite(i) for i in elsewhere],
                "similar": {"title": "Like the talks you picked", "talks": similar},
                "note": "Picks are placed best match first; a pick that clashes becomes choice 2 or 3 "
                        "of the stop it clashes with. Times are estimates."}

    # -- 10 -----------------------------------------------------------------
    def session_live(self, req):
        """v2 10 Session live: which talk of the session is on now (estimated from
        session start + talk lengths), opened when the user arrives late."""
        if not req.get("now"):
            raise InputError('session_live needs "now" (ISO time)')
        now = self._now(req["now"])
        sid = req.get("session_id")
        if sid is None and req.get("id") is not None:
            i = self._item_by_id(req["id"])
            day_slots = [x for x in self.slots.get(i, []) if (x["start"] or "")[:10] == now.date().isoformat()]
            sid = (day_slots or self.slots.get(i) or [{}])[0].get("session_id")
        if sid is None and req.get("room"):
            for i in self.alive:
                for x in self.slots.get(i, []):
                    if x["room"] == req["room"] and x["start"] and _t(x["start"]) <= now < _t(x["end"]):
                        sid = x["session_id"]
        if sid is None:
            raise InputError('give "session_id", a talk "id" or a "room" with a session at "now"')
        talks = sorted(((x, i) for i in self.alive for x in self.slots.get(i, [])
                        if x["session_id"] == sid), key=lambda t: (t[0]["order"] or 0, t[0]["est_start"]))
        if not talks:
            raise InputError(f"no session with id {sid}")
        s0 = talks[0][0]
        n = len(talks)
        cur = next((k for k, (x, i) in enumerate(talks) if _t(x["est_start"]) <= now < _t(x["est_end"])), None)
        started = now >= _t(s0["start"])
        progress = ["done" if _t(x["est_end"]) <= now else
                    "current" if k == cur else "upcoming" for k, (x, i) in enumerate(talks)]
        out = {"session_id": sid, "session": s0["session"], "room": s0["room"],
               "level": _level(s0["floor"]), "header": "Catch up", "title": f"{s0['session']} · {s0['room']}",
               "badge": "Opened for you · you arrived after the talk started"
               if cur is not None and now > _t(talks[cur][0]["est_start"]) else None,
               "progress": progress,
               "note": "Session start + 12 min per talk. Speakers can run late.",
               "talks": [{"n": k + 1, "id": self.items[i]["id"], "title": self.items[i]["title"],
                          "start": x["est_start"], "end": x["est_end"],
                          "summary": self._summary(i)} for k, (x, i) in enumerate(talks)],
               "buttons": ["Prepare a question"]}
        if cur is None:
            out["state"] = "not_started" if not started else "ended"
            out["line"] = (f"Starts ~{_hhmm(s0['start'])}" if not started
                           else f"Ended ~{_hhmm(talks[-1][0]['est_end'])}")
            return out
        x, i = talks[cur]
        mins = int((now - _t(x["est_start"])).total_seconds() // 60)
        authors = self._authors_short(i)
        out.update({
            "state": "live",
            "line": f"Talk {cur + 1} of {n} · ~{mins} min in",
            "now": {"label": f"Now · you missed ~{mins} min", "tag": "AI summary from abstract",
                    "id": self.items[i]["id"], "title": self.items[i]["title"],
                    "summary": self._summary(i),
                    "summary_note": "Written offline from the abstract (English). Other languages are app-side.",
                    "questions": (self.summaries.get(self.items[i]["id"]) or {}).get("questions", []),
                    "author": authors[0]["name"] if authors else None,
                    "ends": f"~{_hhmm(x['est_end'])}"},
            "earlier": [{"n": k + 1, "title": self.items[j]["title"], "summary": self._summary(j)}
                        for k, (y, j) in enumerate(talks[:cur])],
            "up_next": ({"n": cur + 2, "title": self.items[talks[cur + 1][1]]["title"],
                         "time": f"~{_hhmm(talks[cur + 1][0]['est_start'])}",
                         "line": f"Up next · {self.items[talks[cur + 1][1]]['title']} · "
                                 f"~{_hhmm(talks[cur + 1][0]['est_start'])}"}
                        if cur + 1 < n else None)})
        return out

    # -- 09 -----------------------------------------------------------------
    def getting_there(self, req):
        a, b = str(req.get("from_room") or "").strip(), str(req.get("to_room") or "").strip()
        # v2 11 Ask ARC: "I can see the registration desk" -> from the entrance hall
        alias = {"entrance": "Entrance Hall", "registration": "Entrance Hall",
                 "registration desk": "Entrance Hall", "registration desks": "Entrance Hall"}
        a, b = alias.get(a.lower(), a), alias.get(b.lower(), b)
        rooms = list(self.room_floor)
        for r in (a, b):
            if r not in self.room_floor:
                sug = difflib.get_close_matches(r, rooms, n=3)
                raise InputError(f'unknown room "{r}"' + (f"; did you mean: {', '.join(sug)}" if sug else ""))
        step_free = bool(req.get("step_free", True))
        w = self._walk(a, b, step_free)
        fa, fb = self.room_floor[a], self.room_floor[b]
        # v3 09: "From [Room A] · Change", "2–4 min", "to [Room B] · Level 4 · step-free", "I'm here"
        out = {"from": a, "to": b, "title": f"{a} → {b}", **w,
               "header": "Getting there", "from_label": f"From {a}",
               "headline": "Same room" if a == b else f"{w['min']}–{w['max']} min",
               "to_line": f"to {b} · {_level_line(fb)}" + (" · step-free" if step_free else ""),
               "button": "I'm here",
               "floor_plans": [{"floor": f, "level": _level(f), "map": self.floor_map.get(f, "")}
                               for f in dict.fromkeys([fa, fb]) if f],
               "pins": [{"label": "A", "room": a}, {"label": "B", "room": b}]
               + ([{"label": "Elevator"}] if fa != fb else []),
               "map_caption": "Floor plan from programme data · pins only",
               "steps": None,
               "note": "Step-by-step directions are on hold (보류) until the landmark graph exists; "
                       "minutes are a same-level / other-level estimate."}
        if req.get("next_start"):
            out["next_talk"] = f"Next talk starts ~{_hhmm(str(req['next_start']))} (est.) · " \
                               f"Level {_level(fa)} → Level {_level(fb)}"
        return out

    # -- 09-1 / 11 (v3) -------------------------------------------------------
    def places(self, req):
        """v3 09-1 Where are you now: the app does not know where the user is, so they pick
        a starting place: their last stop, Registration, then rooms ({"q": "room 1"})."""
        q = norm(str(req.get("q") or ""))
        last = str(req.get("last_room") or "").strip()
        out = []
        if last and last in self.room_floor:
            out.append({"name": last, "room": last, "line": "Your last stop", "selected": True})
        out.append({"name": "Registration", "room": "Entrance Hall",
                    "line": f"Entrance Hall · {_level_line(self.room_floor.get('Entrance Hall', ''))}",
                    "selected": not out})
        rooms = sorted((r for r in self.room_floor if r not in (last, "Entrance Hall")),
                       key=lambda r: (self.room_floor[r], r))
        out += [{"name": r, "room": r, "line": _level_line(self.room_floor[r]), "selected": False}
                for r in rooms]
        if q:
            out = [x for x in out if has_prefixes(norm(x["name"] + " " + x["line"]), q.split())]
        k = int(req.get("top_k") or 20)
        return {"header": "Where are you now?", "search": "Room or place", "total": len(out),
                "places": out[:k], "button": "I'm here"}

    def questions(self, req):
        """v3 11 Questions: short English questions for a talk, written offline from its
        abstract. Turning the user's own question into English needs an LLM (app side)."""
        i = self._item_by_id(req.get("id"))
        qs = (self.summaries.get(self.items[i]["id"]) or {}).get("questions", [])
        return {"header": "Ask in English", "for": f"For · {self.items[i]['title']}", "id": self.items[i]["id"],
                "suggested": [{"text": q, "show_large": f"“{q}”"} for q in qs],
                "translate": {"text": None, "note": "A question typed in another language is put into "
                                                    "English app-side (LLM); the model only suggests."},
                "buttons": ["Show large", "Read aloud"]}

    # -- dispatch -----------------------------------------------------------
    SCREENS = {"meta": "meta", "keywords": "keywords", "nearby": "nearby", "days": "days_screen",
               "route": "route", "more": "more", "filters": "filters", "search": "search",
               "paper": "paper", "author": "author", "wrapup": "wrapup",
               "session_live": "session_live", "clusters": "clusters_screen",
               "start": "start", "browse": "browse", "plan": "plan",
               "places": "places", "questions": "questions",
               "getting_there": "getting_there"}

    def handle(self, req):
        if not isinstance(req, dict):
            raise InputError('request must be a JSON object with "screen"')
        screen = req.get("screen")
        if screen not in self.SCREENS:
            raise InputError(f"screen must be one of {list(self.SCREENS)}, got {json.dumps(screen)}")
        t0 = time.perf_counter()
        out = getattr(self, self.SCREENS[screen])(req)
        return {"screen": screen, **out, "latency_ms": round((time.perf_counter() - t0) * 1000, 1)}


def _coerce(v):
    if v.lower() in ("true", "false"):
        return v.lower() == "true"
    if v.startswith(("[", "{")):
        return json.loads(v)
    return v


def print_route(out):
    """Interactive view of the route screen, laid out like the v2 03 Your day."""
    if out.get("empty"):
        e = out["empty"]
        print(f"\n[{out['state']}] {e['title']}\n{e.get('body', '')}  {' / '.join(e.get('buttons', []))}")
        return
    print(f"\n{out['title']}  ({out['latency_ms']} ms)  [{out['state']}]")
    for w in out["warnings"]:
        print(f"  ! {w}")
    c = out.get("now_card")
    if c:
        # the tag is Korean in the data (as in Figma); the terminal view says it in English
        print(f"\n  ┌ {c['badge']} · {c['label']}")
        print(f"  │ {c['title'][:84]}")
        if c.get("line"):
            print(f"  │ {c['line']}")
        print(f"  └ [{'] ['.join(c['buttons'])}]")
    if out.get("day_done"):
        d = out["day_done"]
        print(f"\n  ■ {d['title']} · {d['line']}")
        if d.get("next_day"):
            print(f"  ■ {d['next_day']['text']}")
    recs = out.get("recommendations", [])
    if recs:
        n = Counter(r["status"] for r in recs)
        print(f"\nTop {len(recs)} for today · {n['in_route']} in the route · {n['alternative']} as "
              f"alternatives · {n['fits_free_time']} fit free time  (planner: {out.get('planner')})")
    print(f"\n{out['progress']['label']}")
    by_id = {s["id"]: s for s in out["stops"]}
    gaps = {g["start"]: g for g in out.get("gaps", [])}
    items = [("row", r["start"], r) for r in out["rows"]] + [("gap", g["start"], g) for g in out.get("gaps", [])]
    for kind, _, r in sorted(items, key=lambda x: x[1]):
        if kind == "gap":
            print(f"   - - {r['label']} · {r['action']} - -")
            continue
        mark = "✓" if r["done"] else " "
        grade = by_id.get(r["stop_ids"][0], {}).get("grade", {}).get("letter", " ")
        print(f" {mark} {r['time']:>6}  {grade} {r['badge']:<7} {r['title'][:68]}")
        opts = by_id.get(r["stop_ids"][0], {}).get("options", [])[1:]
        if opts and r["badge"] != "PICK ONE":
            print("              " + "   ".join(f"{('2nd', '3rd')[k]} {o['grade']['letter']} {o['time']} {o['title'][:30]}"
                                                for k, o in enumerate(opts)))
        for sid in r["stop_ids"]:
            for a in by_id.get(sid, {}).get("alternatives", []):
                print(f"            └ or #{a['rank']:<2} {a['time']} {a['title'][:52]} ({a['reason'].split(',')[0]})")
        if r.get("choice"):
            print(f"            {r['choice']['text']}")
            for o in r["choice"]["options"]:
                print(f"            ( ) {o['title'][:52]} · {o['line']}  [{o['button']}]")
    print(f"\nMore picks for you · {out['more_for_today']['label']}")


def print_start(out):
    """Interactive view of the start screen (11/7)."""
    print(f"\n{out['title']}   [{' / '.join(m['title'] for m in out['modes'])}]   {out['cart']['label']}"
          f"  ({out['latency_ms']} ms)")
    for sh in out["shelves"]:
        if sh["kind"] == "topics":
            print(f"\n  {sh['title']}: " + ", ".join(f"{t['label']} ({t['subtopics']})" for t in sh["topics"][:6]) + " ...")
        elif sh["kind"] == "search":
            print(f"\n  {sh['title']}: {sh['hint']}")
        else:
            print(f"\n  {sh['title']}")
            for t in sh["talks"][:3]:
                g = t.get("grade", {}).get("letter", " ")
                print(f"    {g} {t['badge']:<8} {t['title'][:80]}")


def print_plan(out):
    """Interactive view of the plan screen: picked talks as a day plan (11/7)."""
    print(f"\nYour picks as a plan · {out['cart']} picked · ranked by {out['ranked_by']}  ({out['latency_ms']} ms)")
    for d in out["days"]:
        print(f"\n{d['title']} · {d['summary']}")
        for s in d["stops"]:
            walk = s.get("walk_to_next") or {}
            print(f"  {s['time']:>6}  {s['grade']['letter']} {s['badge']:<7} {s['title'][:66]}"
                  + (f"  · {walk['minutes']} to next" if walk else ""))
            for o in s["options"][1:]:
                print(f"           or choice {o['choice']} {o['grade']['letter']} {o['time']} {o['title'][:60]}")
        for f in d["free"][:2]:
            print(f"   - - {f['label']} - -")
        for f in d["fill"][:2]:
            print(f"           fits: {f['time']} {f['title'][:58]} ({f['fits']})")
    print("\nLike the talks you picked: " + " | ".join(t["title"][:34] for t in out["similar"]["talks"][:3]))


def print_clusters(out):
    """Interactive view of the clusters screen."""
    if "cluster" in out:
        c = out["cluster"]
        print(f"\n{c['label']} · {c['size']} talks · {c['description']}")
        print("keywords: " + ", ".join(f"{k['keyword']} ({k['talks']})" for k in out["keywords"][:6]))
        print(f"\n{out['order']}:")
        for t in out["talks"]:
            print(f"  {t['badge']:<7} {t['title'][:74]}")
        return
    print(f"\n{out['total']} topic clusters · {out['order']}  ({out['latency_ms']} ms)\n")
    for c in out["clusters"]:
        rel = f"{c['relevance']:>5.2f}" if c["relevance"] is not None else "     "
        mine = f"· {c['yours']} yours" if c["yours"] else ""
        print(f"  {c['id']}  {rel}  {c['label'][:30]:<30} {c['size']:>4} talks  "
              f"{', '.join(c['keywords'][:3])[:34]:<34} {mine}")


def interactive(arc):
    print("ARC screen API (offline). Type key=value, e.g.\n"
          '  screen=keywords research="I study haptic feedback for VR"\n'
          '  screen=route research="haptic feedback for VR" day=tue pace=balanced\n'
          "route is shown as a timeline (add json=true for the raw JSON). 'q' to quit.")
    while True:
        try:
            line = input("\narc> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if line.lower() in ("q", "quit", "exit"):
            return
        if not line:
            continue
        try:
            req = {k: _coerce(v) for k, v in (t.split("=", 1) for t in shlex.split(line) if "=" in t)}
            out = arc.handle(req)
            if out["screen"] == "route" and not req.get("json") and "error" not in out:
                print_route(out)            # json=true prints the raw JSON instead
            elif out["screen"] == "clusters" and not req.get("json"):
                print_clusters(out)
            elif out["screen"] == "start" and not req.get("json"):
                print_start(out)
            elif out["screen"] == "plan" and not req.get("json"):
                print_plan(out)
            else:
                print(json.dumps(out, ensure_ascii=False, indent=2))
        except (InputError, ValueError) as e:
            print(f"  ! {e}")


def main():
    if len(sys.argv) == 1 and sys.stdin.isatty():
        return interactive(ARC())
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    try:
        try:
            req = json.loads(raw)
        except json.JSONDecodeError as e:
            raise InputError(f"input is not valid JSON ({e.msg} at position {e.pos})")
        out = ARC().handle(req)
    except InputError as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(2)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
