#!/usr/bin/env python3
"""Arc engine: the user's question in the middle, CHI talks around it as Support,
Reframe or Challenge (team flow of 2026-11-16, Figma "final flow"). Offline, on device.

How a talk gets its angle
  1. The question is read as factor X -> outcome Y, with a direction when the verb has
     one ("Does VR fidelity really raise presence?" -> fidelity, presence, +).
  2. Every abstract was turned into finding cards offline by an LLM
     (scripts/gen_findings.py, scripts/build_angles.py): factor, outcome, effect,
     population, and whether the sentence is the work's own result. Every phrase is
     copied from the abstract, with its character offsets.
  3. Here the cards of the best-matching talks are compared with X and Y (shared head
     words, plus the on-device encoder's phrase vectors), and a few rules decide:
       Support   ↑  same X and Y, the talk's own result goes the question's way
       Challenge ⊣  same X and Y, its own result goes the other way or finds no effect
       Reframe   ↻  another factor behind Y, another outcome or measure, another group
     A Challenge needs an explicit result sentence; demos, panels and meet-ups never
     get one. No model call beyond the 8 MB encoder, so it runs in about 0.1 s.

Requests are {"screen": <name>, ...}; the app keeps the user's Arcs and sends them along.
Screen numbers are Figma "ARC Mobile Wireframes" page "final" (11/17).

  ask       07          what kind of input, X / Y, tribe preview, sharper questions
  angles    08          Choose your angles: up to 3 topic chips per angle, some selected
  arc       09-12, 24   the Arc: today / tomorrow / week x Talks · Posters · Demos · Panels ·
                        SIGs, picked chips first; loading line, tribe ("Look for the blue
                        diamond."), nodes with state (next / upcoming / heard / ended / read),
                        "14:00 · Rm 119" lines, the Next card, "+N" bundles past 3 per angle
  edit      15          tap a node to swap it (same angle), a + slot to add; filters: angle,
                        First CHI paper, Wildcard, or search; clashes stay, marked
                        "Same time as ..." / "Right after ..."
  node      14          why this angle (the deciding sentence, underlined), when, authors
                        with First CHI paper badges, starter questions for the Q&A
  shared    18 / 19     a shared Arc from the receiver's time; ended talks are locked
  summary   13          list view grouped by angle (Heard / Next lines), reading list
  home      20 / 21     My Arcs with their tribe and "Today" / "Wed" / "Mon · all heard"
  meta                  tribes, angles with their help text (22), formats, days

  python angles.py '{"screen": "arc", "question": "Does VR fidelity really raise presence?", "days": ["tue"]}'
  python angles.py --pretty '{"screen": "arc", ...}'     # the same, laid out like the screen
"""
import json
import math
import os
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timedelta

import numpy as np

from arc import ARC, BADGE, VISIT_MIN, _day_label, _hhmm, _t
from retriever import InputError, _minmax, _non_latin, load_matrix

HERE = os.path.dirname(os.path.abspath(__file__))

# Figma "final" 09 What: Talks · Posters · Demos · Panels · SIGs (default the first three)
FORMATS = {"talks": ["Paper", "Journals"], "posters": ["Posters", "Student Research Competition"],
           "demos": ["Interactive Demos"], "panels": ["Panels"], "sigs": ["Meet-Ups"],
           "workshops": ["Workshop"], "keynotes": ["Plenary and Keynote"]}
FORMAT_ALIAS = {"papers": "talks", "paper": "talks", "talk": "talks", "poster": "posters",
                "demo": "demos", "panel": "panels", "sig": "sigs", "meet-ups": "sigs",
                "meetups": "sigs", "meet-up": "sigs", "meetup": "sigs", "workshop": "workshops",
                "keynote": "keynotes"}
DEFAULT_FORMATS = ["talks", "posters", "demos"]
# formats that report no study of their own: never a Challenge
NO_FINDINGS = {"Interactive Demos", "Panels", "Meet-Ups", "Workshop", "Plenary and Keynote",
               "Student Mentoring Program", "SIGCHI Awards"}
ANGLES = ("support", "reframe", "challenge")
SYMBOL = {"support": "↑", "reframe": "↻", "challenge": "⊣"}
# Figma "final" Q1: Supports · Reframes · Challenges
ANGLE_NAME = {"support": "Supports", "reframe": "Reframes", "challenge": "Challenges"}
# the ? sheet (Figma "final" 22)
HELP = {
    "support": {"en": "Same question, same finding.",
                "ko": "같은 질문을 연구했고, 같은 쪽 결과를 냈어요."},
    "reframe": {"en": "Same question through a different factor, measure, or group.",
                "ko": "같은 질문을 다른 요인, 다른 측정, 다른 사람으로 본 연구예요."},
    "challenge": {"en": "Same question, a different finding. Not a verdict on the paper.",
                  "ko": "같은 질문인데 결과가 달라요. 논문이 틀렸다는 뜻은 아니에요."},
}
HELP_NOTE = {"en": "Read from each paper’s abstract.", "ko": "각 논문의 초록에서 읽었어요."}
SUBTYPE = {"evidence": "Evidence", "try": "Try it", "null": "Null result", "opposite": "Opposite",
           "only_when": "Only when", "factor": "Other factor", "measure": "Other measure",
           "people": "Other people", "related": "Same subject", "cost": "Trade-off"}
# Figma "final" 23
NO_CHALLENGE = {"en": "No clear clash at CHI this year.",
                "ko": "이번 CHI에서 뚜렷한 엇갈림을 찾지 못했어요."}
# 07: a question CHI may not cover, or one not in English (team PDF Q21)
OFF_TOPIC = {"en": "CHI may not cover this. Try a question about people and technology.",
             "ko": "CHI에서 다루지 않는 주제일 수 있어요. 사람과 기술에 관한 질문으로 바꿔 보세요."}
ENGLISH_ONLY = {"en": "ARC reads English questions for now.", "ko": "지금은 영어 질문만 읽을 수 있어요."}
# acronyms the phrase table keeps in lower case ("wayfinding in vr"), upper case on screen
ACRONYMS = "vr ar xr mr ai llm ui ux hci bci eeg ecg emg gpt vlm nlp iot adhd asd lgbtq hmd gui cscw ml 2d 3d"
_ACRONYM = re.compile(r"\b(" + "|".join(ACRONYMS.split()) + r")(s?)\b")


def show(s):
    """A phrase as it goes on screen: "explanations in ai systems" -> "explanations in AI systems"."""
    return _ACRONYM.sub(lambda m: m.group(1).upper() + m.group(2), s)
COLOR_NAME = {"#9B6BFF": "purple", "#4C7DFF": "blue", "#2FBF71": "green", "#FF6B6B": "coral",
              "#FFC234": "yellow", "#FF7AC6": "pink", "#19C3D6": "teal", "#E6E6E6": "white"}
CHIPS_K = 3           # 08: topic chips per angle
CHIPS_ON = {"support": 2, "reframe": 2, "challenge": 1}   # chips selected to start with
MAP_CAP = 3           # 24: nodes per angle on the map before the rest fold into "+N"
EDIT_K = 6            # 15: cards in the swap / add sheet
FORMAT_LABEL = {"PAPER": "Paper talk", "POSTER": "Poster", "DEMO": "Demo", "PANEL": "Panel",
                "MEETUP": "SIG & meetup", "KEYNOTE": "Keynote", "WORKSHOP": "Workshop"}

EFFECTS = ["increase", "decrease", "no_effect", "mixed", "associated"]
STATUS = ["result", "claim", "prior", "aim"]
WORSE = 1             # angles.json "val": [card, 0 better / 1 worse / 2 neither, factor tested]
JUDGE_N = 40          # talks whose cards are read for every question (the rest is ranking only)
POOL = 200            # ranked talks the tray, search and shuffle draw from
SIZE = 7              # default nodes on an Arc (team: 5-9)
MAX_READ = 2          # nodes outside the chosen days, shown as "read"
GAP_MIN = 5           # minutes kept free between two stops
CALM_GAP = 10         # 09 "Calm route": no rushing, at least this many minutes between two stops
WALK = ("calm", "step_free")   # 09 "How you walk"
HOLD_K = 3            # 12b: alternatives shown when a stop is held
HOLD_WIN = 90         # 12b: ... starting within this many minutes of the held stop
HOLD_MORE = 30        # 12b: ranked talks read beyond the judged ones, to find alternatives
THEME_COS = 0.45      # 14d: a question joins a theme at or above this cosine to its centre
# 14d: words too plain to name a theme ("Would the same strategies work ...")
PLAIN = set("""over same work more less much many way thing things get got let make made do does did use used
change happen hold still also really kind lot part case need want try think know see say before after""".split())
# 07: words that say how one asks, not what about ("What is X research asking now?")
VAGUE = set("research study studies ask asking now today current recent new chi conference talk talks paper papers".split())
CLOSE_COS = 0.50      # 14b: "N people asked something close" at or above this cosine
# phrase match: head word shared -> base, + modifiers found; else the encoder's cosine,
# mapped from [COS_LO, COS_HI] to [0, 1] (tuned on data/eval, docs/angle_eval.md)
MATCH = 0.70          # X or Y counts as the same thing at or above this
STRICT = 0.80         # a Challenge needs both X and Y at or above this
COS_LO, COS_HI = 0.45, 0.80
COST = True           # a result where the asked X made another outcome worse is a Challenge
COST_TOP = 15         # ... from the search's first talks only
# what X going wrong is called: such a factor is X failing, not X ("subtitle errors")
FAULT = set("""error errors latency delay failure breakdown absence lack disruption disrupted dark deceptive
manipulative misinformation harassment bug bugs glitch""".split())
CLAIM_W = 0.95        # a card restated in question words (LLM, offline) counts this much
GEN_W = 0.95          # a card phrase's general name (LLM, offline) counts this much
ABOUT_W = 0.9         # what the talk is about overall counts this much
UP_W1 = 0.8           # a card phrase one step broader (LLM, offline: "mindfulness app") counts this much
UP_W2 = 0.75          # two steps broader ("mental health app"); neither ever makes a Challenge
# the search's own word: a talk no card places but the search ranks this close stays on
# the map as a Reframe on the same subject (tuned on the dev half of data/eval)
NEAR_SCORE = 1.5      # search score (cosine + keyword, each 0..1) at or above this
NEAR_TOP = 5          # or among the search's first talks of the chosen formats
NEAR_CONF = 0.2       # below every card-based angle, so it fills an Arc only when needed
TOPIC_CONF = 0.1      # a topic's own first talks, after everything its sharpest question found
BALANCE = True        # a topic's Arc is built on the sharper question filling the most angles
SUGGEST_K = 3         # ... of this many
# the questions each result answers (LLM, offline, gen_card_questions.py): a talk the cards
# leave without a Support is one when the asked question is close to one of them, the same
# way up, with its Y the asked Y and its X near the asked X (tuned on data/eval)
CARDQ_COS = 0.75      # cosine of the two questions at or above which
CARDQ_X = 0.40        # ... and X at or above this (Y at MATCH)
# a topic narrowed to the claim most of its talks' results answer "yes" to (team 11/25):
# those questions, written by the LLM, read the way attendees ask
CQ_SUGGEST = True
CQ_SAME = 0.85        # two such questions closer than this are the same suggestion
CQ_ONLY = 1           # ... used alone when there are at least this many
CQ_TOPIC = 0.40       # ... each at or above this cosine to what was typed
CQ_WORDS = 12         # ... and at most this many words
AFFECTS = 2           # angles.json "cq" lean of a "How does X affect Y?" question
# the why line: what the angle means for the asker, then the card's finding (LLM, offline)
WHY_LEAD = {"support": {"evidence": "Goes the way your question expects.", "try": "Something you can try."},
            "challenge": {"opposite": "Found the other way.", "null": "Found no clear effect.",
                          "only_when": "Holds only under some conditions.", "cost": "A cost of the same thing."},
            "reframe": {"factor": "A different factor behind your outcome.",
                        "measure": "Your factor, seen through another outcome.",
                        "people": "Same question, other people or setting.",
                        "related": "Same subject, no result for your exact question."}}
MINE_K = 8            # "Did you submit a paper?": authors listed for a typed name
MINE_Q = 3            # ... and questions offered from one of their papers

_W = re.compile(r"[a-z0-9]+(?:[-'][a-z0-9]+)*")
STOPW = set("""a an the and or but of to in on at by for with from into onto about as is are was
were be been being do does did can could would should may might will shall it its this that these
those their them they we our us you your i my me his her he she one ones how what when where why
which who whom whose than then so such very really actually truly even always also just only own
via per vs versus""".split())
# words that do not name the variable itself ("sense of presence" = presence)
GENERIC = set("""sense level levels degree degrees feeling feelings perceived perception perceptions
extent amount amounts overall rate rates score scores user users' people's participants' self-reported
reported subjective objective general""".split())
# direction words inside a phrase: "more", "longer" are dropped; these also flip the sign
DEGREE_UP = set("more higher greater increased increasing longer high better larger stronger".split())
DEGREE_DOWN = set("less lower fewer decreased decreasing reduced reducing shorter low worse lack "
                  "without absence no smaller weaker".split())
# outcomes where "more" is bad: "help" questions count a decrease here as agreeing
NEG_OUTCOME = set("""stress anxiety workload load fatigue error errors sickness cybersickness discomfort
burden frustration loneliness isolation harm harms risk risks bias biases pain distraction confusion
abandonment dropout overreliance over-reliance dependence misinformation harassment toxicity""".split())
PEOPLE = set("""people users user adults adult children child kids students student teachers workers
designers developers programmers clinicians patients parents families older blind deaf communities
community individuals participants learners players members viewers readers writers
bystanders pedestrians drivers passengers caregivers educators artists musicians researchers employees customers residents visitors teenagers teens adolescents refugees novices experts""".split())

_POS = ["raise", "increase", "improve", "enhance", "boost", "strengthen", "foster", "promote",
        "facilitate", "encourage", "empower", "support", "help", "benefit", "lead to", "cause",
        "speed up", "deepen", "make"]
_NEG = ["reduce", "decrease", "lower", "hurt", "harm", "undermine", "impair", "hinder", "diminish",
        "worsen", "weaken", "erode", "limit", "slow down", "lessen", "damage", "threaten"]
_NEU = ["affect", "influence", "change", "shape", "impact", "relate to", "predict", "matter for",
        "alter", "modulate", "determine", "drive"]
# verbs whose subject is the people and whose object is the factor
_PSYCH = {"trust": "trust", "use": "use", "adopt": "adoption", "prefer": "preference",
          "accept": "acceptance", "like": "liking", "enjoy": "enjoyment", "value": "value",
          "rely on": "reliance", "benefit from": "benefit", "gain from": "benefit",
          "learn from": "learning", "engage with": "engagement"}
POS_ADJ = {"faster", "easier", "better", "safer", "quicker", "clearer", "stronger", "more"}
NEG_ADJ = {"slower", "harder", "worse", "riskier", "weaker", "less"}
# "help blind users browse the web faster" -> outcome "web browsing speed": what people do,
# said as the outcome a paper would measure (verbs that are never nouns, so "sleep quality" stays)
DOING = {"browse": "browsing", "write": "writing", "navigate": "navigation", "perform": "performance",
         "learn": "learning", "read": "reading", "collaborate": "collaboration",
         "communicate": "communication", "understand": "understanding", "remember": "memory",
         "explore": "exploration", "create": "creation", "express": "expression", "decide": "decision making",
         "draw": "drawing", "speak": "speaking", "listen": "listening", "cope": "coping",
         "engage": "engagement", "participate": "participation", "interact": "interaction",
         "teach": "teaching", "reflect": "reflection", "ideate": "ideation", "walk": "walking",
         "connect": "connection", "focus on": "focus"}
STATE = {"lonely": "loneliness", "motivated": "motivation", "engaged": "engagement", "confident": "confidence",
         "anxious": "anxiety", "productive": "productivity", "efficient": "efficiency", "efficiently": "efficiency",
         "creative": "creativity", "satisfied": "satisfaction", "aware": "awareness", "safe": "safety",
         "safer": "safety", "stressed": "stress", "connected": "connectedness", "happy": "happiness",
         "happier": "happiness", "healthy": "health", "healthier": "health", "accurate": "accuracy",
         "accurately": "accuracy", "faster": "speed", "quicker": "speed", "quickly": "speed", "slower": "speed",
         "independent": "independence", "immersed": "immersion", "isolated": "isolation",
         "comfortable": "comfort", "included": "inclusion"}
LINK = {"feel", "become", "be", "get", "stay", "are", "is"}
DET = {"the", "a", "an", "their", "his", "her", "its", "our", "my", "your", "better", "more", "well"}
SPLIT_PREP = (" in ", " on ", " for ", " among ", " during ", " within ", " across ", " at ", " over time")
IDIOM = (" in control ", " in charge ", " in person ", " at ease ", " at home ")
WH = ("what", "which", "who", "where", "when", "why", "how", "is there", "are there")
# verbs that are also nouns ("emotional support from ...", "creativity support tools make ...")
NOUN_VERBS = {"support", "supports", "help", "helps", "impact", "impacts", "influence", "influences",
              "change", "changes", "shape", "shapes"}
NOUN_PREP = {"from", "for", "of", "by", "with", "in", "on", "during"}


def _forms(v):
    head, _, rest = v.partition(" ")
    tail = (" " + rest) if rest else ""
    out = {head, head + "s", head + "es", head + "d", head + "ed"}
    if head.endswith("y"):
        out.add(head[:-1] + "ies")
        out.add(head[:-1] + "ied")
    if head.endswith("e"):
        out.add(head + "s")
    return sorted((f + tail for f in out), key=lambda s: (-len(s), s))


def _alt(verbs):
    forms = sorted({f for v in verbs for f in _forms(v)}, key=lambda s: (-len(s), s))
    return "|".join(re.escape(f) for f in forms)


VERB_DIR = {}
for _v in _POS:
    for _f in _forms(_v):
        VERB_DIR[_f] = "+"
for _v in _NEG:
    for _f in _forms(_v):
        VERB_DIR[_f] = "-"
for _v in _NEU:
    for _f in _forms(_v):
        VERB_DIR[_f] = "?"
# the words parse_question reads itself, kept from the typo fixer
KNOWN = {w for k in (*VERB_DIR, *STATE, *POS_ADJ, *NEG_ADJ, *DOING) for w in k.split()}
PSYCH_FORM = {}
for _v, _n in _PSYCH.items():
    for _f in _forms(_v):
        PSYCH_FORM[_f] = _n
AUX = r"(?:does|do|did|can|could|will|would|might|may|is|are|was|were|should|has|have)"
ADV = r"(?:(?:really|actually|truly|even|always|necessarily|significantly|still|ever|in fact)\s+)*"
_VERBS = _alt(_POS + _NEG + _NEU)
RE_YESNO = re.compile(rf"^{AUX}\s+(?P<x>.+?)\s+{ADV}(?P<v>{_VERBS})\s+(?P<y>.+)$")
RE_HOW = re.compile(rf"^(?:how|in what ways?|to what extent|when|why|under what conditions)\s+"
                    rf"(?:much\s+)?{AUX}\s+(?P<x>.+?)\s+{ADV}(?P<v>{_VERBS})\s+(?P<y>.+)$")
RE_EFFECT = re.compile(r"^(?:what\s+(?:is|are)\s+)?(?:the\s+)?(?:effects?|impacts?|influence|role|"
                       r"consequences?)\s+of\s+(?P<x>.+?)\s+(?:on|in|for)\s+(?P<y>.+)$")
RE_PSYCH = re.compile(rf"^{AUX}\s+(?P<p>.+?)\s+{ADV}(?P<v>{_alt(list(_PSYCH))})\s+(?P<x>.+)$")


LEMMA = {"usage": "use", "utilization": "use", "utilisation": "use"}


def _surface(texts):
    """lemma -> the word as first written ("nophysic" -> "no-physics")."""
    out = {}
    for t in texts:
        for w in _W.findall(t.lower().replace("’", "'")):
            w = w[:-2] if w.endswith("'s") else w.rstrip("'")
            if w:
                out.setdefault(lemma(w), w)
    return out


def _weekday(date):
    """'2026-04-14' -> 'Tuesday'."""
    return _day_label(date, False).split()[0]


def lemma(w):
    w = w.replace("-", "") if "-" in w and len(w) > 4 else w      # well-being = wellbeing
    if w in LEMMA:
        return LEMMA[w]
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 3 and w.endswith("s") and not w.endswith(("ss", "us", "is", "'s")):
        return w[:-1]
    return w


def content(text):
    """Content words of a phrase (lemmas), and whether it is phrased the negative way
    ("lack of X", "lower X")."""
    toks = _W.findall(text.lower().replace("’", "'"))
    neg = any(t in DEGREE_DOWN for t in toks)
    out = []
    for t in toks:
        t = t[:-2] if t.endswith("'s") else t.rstrip("'")
        if t in STOPW or t in GENERIC or t in DEGREE_UP or t in DEGREE_DOWN or not t:
            continue
        out.append(lemma(t))
    return out, neg


_SUFFIX = ("ations", "ation", "itions", "ition", "ions", "ion", "ments", "ment", "ness", "ities",
           "ity", "ing", "ed", "ures", "ure", "ive", "iv", "at", "al", "is", "e")


def stem(w):
    """A rough stem so that disclose / disclosure and engage / engagement meet."""
    for _ in range(2):
        for suf in _SUFFIX:
            if len(w) - len(suf) >= 4 and w.endswith(suf):
                w = w[:-len(suf)]
                break
        else:
            break
    return w


# a word that ends another only by a prefix or a suffix, not as its head:
# emotion / motion, interaction / action, supervision / vision, explainability / ability
BOUND = ("inter", "intra", "super", "trans", "multi", "hyper", "micro", "macro", "tele", "auto",
         "semi", "anti", "counter", "over", "under", "omni", "post", "self")
NOT_HEAD = {"ability"}


def _ends(long, short):
    """cybersickness ends with sickness, a compound of two words."""
    pre = long[:-len(short)]
    return (len(short) >= 5 and long.endswith(short) and len(pre) >= 4 and pre not in BOUND
            and short not in NOT_HEAD)


def _same(a, b):
    """Two content words name the same thing: equal, the same stem, or a compound and
    its head (cybersickness / sickness)."""
    return a == b or stem(a) == stem(b) or _ends(b, a) or _ends(a, b)


def _clean(s):
    s = s.strip().strip(" ?.!,;:")
    s = re.sub(r"^(?:the|a|an)\s+", "", s)
    return s.strip()


def _split_ctx(phrase):
    """"typing on touchscreens" -> ("typing", "touchscreens")."""
    low = f" {phrase} "
    # "feeling in control" is no place: the idiom is masked (same length) before the search
    masked = low
    for idiom in IDIOM:
        masked = masked.replace(idiom, idiom.replace(" ", "_"))
    cut = [masked.find(p) for p in SPLIT_PREP if masked.find(p) > 0]
    if not cut:
        return phrase, ""
    k = min(cut)
    rest = low[k:].strip()
    return low[:k].strip(), rest.split(" ", 1)[1] if " " in rest else ""


def _possessive(phrase):
    """"blind users' sense of control" -> ("sense of control", "blind users")."""
    m = re.match(r"^(.+?)(?:'s|s')\s+(.+)$", phrase.replace("’", "'"))
    if m and len(m.group(1).split()) <= 3 and " of " not in f" {m.group(1)} ":
        owner = m.group(1) + ("s" if phrase.replace("’", "'")[len(m.group(1)):].startswith("s'") else "")
        return m.group(2), owner
    return phrase, ""


def _doing(y):
    """A verb phrase outcome as a noun phrase: -> (outcome, people in front, flips direction)."""
    toks = y.split()
    if " ".join(toks[:3]) == "come up with":
        return "ideation", "", False
    people = ""
    # "learners more motivated", "surgeons perform better": the people, then what they do
    if len(toks) >= 2 and (toks[0] in PEOPLE or toks[0].endswith("s")) and \
            (toks[1] in DOING or toks[1] in LINK or toks[1] in ("more", "less")):
        people, toks = toks[0], toks[1:]
    if toks and toks[0] in LINK:
        toks = toks[1:]
    state, flip = None, False
    if toks and toks[-1] in STATE:
        w = toks.pop()
        state, flip = STATE[w], w == "slower"
        if toks and toks[-1] in ("more", "less", "fewer"):
            flip = flip != (toks.pop() != "more")
        # "people happier": who, then the state
        if toks and not people and all(w in PEOPLE for w in toks):
            people, toks = " ".join(toks), []
    elif toks and toks[-1] in ("better", "well", "more"):
        toks.pop()
    verb = next((v for v in DOING if " ".join(toks[:len(v.split())]) == v), None)
    if verb is None and state is None and not people:
        return y, "", False
    if verb:
        obj = [w for w in toks[len(verb.split()):] if w not in DET]
        if obj and len(obj[-1]) > 3 and obj[-1].endswith("s") and not obj[-1].endswith("ss"):
            obj[-1] = obj[-1][:-1]
        toks = obj + [DOING[verb]]
    else:
        toks = [w for w in toks if w not in DET]
    return " ".join(toks + ([state] if state else [])), people, flip


def parse_question(text):
    """-> {"kind": "relation" | "topic" | "open", "x", "y", "dir", "ctx", "verb"}.
    dir: "+" raise, "-" reduce, "?" no direction."""
    raw = " ".join(str(text).split())
    low = raw.lower().replace("’", "'").strip().rstrip("?.! ")
    low = re.sub(r"^(?:i wonder |i want to know |i'm curious |i am curious )(?:if |whether |how )?", "", low)
    low = re.sub(r"^(?:whether|if)\s+", "does ", low)
    out = {"kind": "", "x": "", "y": "", "dir": "?", "ctx": "", "verb": "", "text": raw}
    m = RE_PSYCH.match(low)
    if m and not RE_YESNO.match(low):
        x, people = _clean(m.group("x")), _clean(m.group("p"))
        x, ctx = _split_ctx(x)
        out.update(kind="relation", x=x, y=PSYCH_FORM[m.group("v")], dir="+", verb=m.group("v"),
                   ctx=" ".join(c for c in (people, ctx) if c))
        return out
    # one question at a time: "When does AI help people learn, and when does it ..."
    low = re.split(r",?\s+(?:and|or|but)\s+(?:when|how|why|does|do|is)\s", low)[0]
    m = RE_YESNO.match(low) or RE_HOW.match(low)
    if m:
        v = m.group("v")
        x, y = _clean(m.group("x")), _clean(m.group("y"))
        # "AI decision support improve ...": the first verb was part of the factor
        while True:
            first, _, rest = y.partition(" ")
            two = " ".join(y.split()[:2])
            nxt = two if two in VERB_DIR else (first if first in VERB_DIR else None)
            if not nxt or not rest:
                break
            x, v, y = f"{x} {v}", nxt, _clean(y[len(nxt):])
        # ... or a noun, with the real verb a few words on
        if v.split()[0] in NOUN_VERBS:
            ys = y.split()
            for j in range(1, min(len(ys), 6)):
                two = " ".join(ys[j:j + 2])
                nxt = two if two in VERB_DIR else (ys[j] if ys[j] in VERB_DIR else None)
                if nxt and j + len(nxt.split()) < len(ys) and (
                        ys[0] in NOUN_PREP or (j == 1 and v.startswith("support") and ys[0] not in PEOPLE)):
                    x, v, y = f"{x} {v} {' '.join(ys[:j])}", nxt, _clean(" ".join(ys[j + len(nxt.split()):]))
                    break
        if v.split()[0] in ("help", "helps", "helped", "support", "supports") :
            y = re.sub(r"^(?:with|to|in)\s+", "", y)
            hp = y.split()
            # "help (everyday) people understand uncertainty": the people, then what they do
            j = next((j for j in range(min(2, len(hp) - 1)) if hp[j] in PEOPLE), None)
            if (j is not None and hp[-1] not in PEOPLE
                    and (j == 0 or (hp[0] not in VERB_DIR and hp[0] not in DOING))):
                k = j + 1
                while k < len(hp) - 1 and hp[k] in PEOPLE:
                    k += 1
                out["ctx_people"] = " ".join(hp[:k])
                y = " ".join(hp[k:])
            # "help people reduce stress": the verb after the people gives the direction
            two, first = " ".join(y.split()[:2]), y.split()[0] if y.split() else ""
            nxt = two if two in VERB_DIR else (first if first in VERB_DIR else None)
            if nxt and y[len(nxt):].strip():
                v, y = nxt, _clean(y[len(nxt):])
        d = VERB_DIR.get(v, "?")
        # "make target selection faster" keeps its own reading below
        made = v.startswith("make") and y.split()[-1:] and (y.split()[-1] in POS_ADJ or y.split()[-1] in NEG_ADJ)
        y, people, flip = _doing(y) if not made else (y, "", False)
        if people:
            out["ctx_people"] = " ".join(c for c in (out.get("ctx_people", ""), people) if c)
        if flip and d in "+-":
            d = "-" if d == "+" else "+"
        if v.startswith("make"):
            ys = y.split()
            # "make people feel safer": the state is the outcome, the people its context
            if len(ys) >= 2 and ys[-1] in STATE and all(w in PEOPLE or w in LINK for w in ys[:-1]):
                who = " ".join(w for w in ys[:-1] if w not in LINK)
                out["ctx_people"] = " ".join(c for c in (out.get("ctx_people", ""), who) if c)
                d = "-" if ys[-1] in NEG_ADJ else "+"
                y = STATE[ys[-1]]
            last = y.split()[-1] if y.split() else ""
            if last in POS_ADJ or last in NEG_ADJ:
                d = "+" if last in POS_ADJ else "-"
                y = " ".join(y.split()[:-1])
            if y.split()[-1:] == ["more"] or y.split()[-1:] == ["less"]:
                y = " ".join(y.split()[:-1])
        if low.startswith(("how", "in what way", "to what extent", "when", "why", "under what")) \
                and d != "-":
            d = "?" if low.startswith(("how", "in what", "to what")) else d
        y, ctx_y = _split_ctx(y)
        y, owner = _possessive(y)
        x, ctx_x = _split_ctx(x)
        ctx = " ".join(c for c in (out.pop("ctx_people", ""), owner, ctx_y, ctx_x) if c)
        yc = _W.findall(y)
        # "help blind screen reader users": the object is the people, not an outcome
        if yc and (yc[-1] in PEOPLE or yc[-1] + "s" in PEOPLE):
            ctx, y = " ".join(c for c in (y, ctx) if c), ""
        # "people" or "users" alone says nothing about who
        if all(w in ("people", "users", "user", "humans", "individuals", "person", "persons")
               for w in _W.findall(ctx)):
            ctx = ""
        out.update(kind="relation", x=x, y=y, dir=d, ctx=ctx, verb=v)
        if low.startswith("when"):
            out["conditional"] = True
        return out
    m = RE_EFFECT.match(low)
    if m:
        y, ctx = _split_ctx(_clean(m.group("y")))
        out.update(kind="relation", x=_clean(m.group("x")), y=y, ctx=ctx, verb="effect of")
        return out
    out["kind"] = "open" if (raw.endswith("?") or low.startswith(WH)) else "topic"
    out["x"] = _clean(low)
    return out


class Angles:
    def __init__(self, root=HERE, threads=4, arc=None):
        self.arc = arc or ARC(root, threads)
        a = self.arc
        self.items, self.emb, self.ex = a.items, a.emb, a.ex
        self.pos = {it["id"]: i for i, it in enumerate(self.items)}
        self.alive_set = set(int(i) for i in a.alive)
        # the Arc data sits next to the model; CHI_ANGLES_DIR points elsewhere while building
        adir = os.environ.get("CHI_ANGLES_DIR", root)
        with open(os.path.join(adir, "angles.json"), encoding="utf-8") as f:
            d = json.load(f)
        self.version = d["version"]
        self.tribes = d["tribes"]
        self.phrases = d["phrases"]
        # float64 from here on, so the phone's JavaScript gets the very same cosines
        self.pvec = load_matrix(adir, "phrase").astype(np.float64)
        self.pvec = self.pvec / np.maximum(np.sqrt((self.pvec * self.pvec).sum(1, keepdims=True)), 1e-9)
        pc = [content(p) for p in self.phrases]
        self.ptoks = [c for c, _ in pc]
        self.pneg = [n for _, n in pc]
        self.info = {}
        for xid, rec in d["items"].items():
            i = self.pos.get(int(xid))
            if i is None:
                continue
            cards = [{"f": c[0], "o": c[1], "p": c[2], "e": EFFECTS[c[3]], "st": STATUS[c[4]],
                      "s": (c[5], c[6]), "fs": (c[7], c[8]), "os": (c[9], c[10])} for c in rec["cards"]]
            meas = [{"c": m[0], "s": (m[1], m[2]), "cs": (m[3], m[4])} for m in rec.get("measures", [])]
            about = rec.get("about") or [[], [], []]
            self.info[i] = {"label": rec["label"], "contribution": rec["contribution"],
                            "tribe": rec["tribe"], "cards": cards, "measures": meas,
                            "gen": {g[0]: g[1] for g in rec.get("gen", [])},
                            "claims": {c[0]: (c[1], c[2]) for c in rec.get("claims", [])},
                            "val": {v[0]: (v[1], v[2]) for v in rec.get("val", [])},
                            "cq": rec.get("cq", []),
                            "sum": {c[0]: c[1] for c in rec.get("sum", [])},
                            "up": {u[0]: (u[1], u[2]) for u in rec.get("up", [])},
                            "about": {"f": about[0], "o": about[1], "p": about[2]},
                            "debut": set(rec.get("debut", [])), "first_debut": bool(rec.get("first_debut"))}
        # a talk listed twice shares the cards of its first listing
        for i in range(len(self.items)):
            if i not in self.info and self.ex.dup[i]:
                j = a._canon(i)
                if j in self.info:
                    self.info[i] = self.info[j]
        self._abs = {}

    # -- text helpers ---------------------------------------------------------
    def _absset(self, i):
        if i not in self._abs:
            it = self.items[i]
            self._abs[i] = set(lemma(t) for t in _W.findall((it["title"] + " " + it["abstract"]).lower()))
        return self._abs[i]

    def _phrase(self, text):
        if not text:
            return None
        toks, neg = content(text)
        if not toks:
            return None
        v = np.asarray(self.ex.embed(text), dtype=np.float64)
        v = v / max(float(np.sqrt((v * v).sum())), 1e-9)
        return {"text": text, "toks": toks, "neg": neg, "vec": v}

    def _pm(self, q, pi, absset):
        """How much card phrase pi names the same thing as query phrase q, 0..1."""
        if q is None or pi < 0:
            return 0.0
        ct = self.ptoks[pi]
        if not ct:
            return 0.0
        qt = q["toks"]
        head = qt[-1]
        lex = 0.0
        where = [k for k, w in enumerate(ct) if _same(head, w)]
        if where:
            # who it is about ("programmer productivity") is context, not the concept
            mods = [w for w in qt[:-1] if not _same(head, w) and w not in PEOPLE and w + "s" not in PEOPLE]
            cov = 1.0
            if mods:
                cov = sum(1.0 if any(_same(w, c) for c in ct) else (0.75 if w in absset else 0.0)
                          for w in mods) / len(mods)
            base = 0.6 if where[-1] == len(ct) - 1 else 0.5
            lex = base + 0.4 * cov
        else:
            lex = 0.3 * sum(1 for w in qt if any(_same(w, c) for c in ct)) / len(qt)
        cos = sum(float(a) * float(b) for a, b in zip(q["vec"], self.pvec[pi]))
        sem = min(1.0, max(0.0, (cos - COS_LO) / (COS_HI - COS_LO)))
        return round(max(lex, sem), 3)

    def _pmg(self, q, pi, info, absset):
        """_pm over a card phrase and its general names (a general name counts 95%)."""
        best = self._pm(q, pi, absset)
        for t in info["gen"].get(pi, []):
            if best >= 1.0:
                break
            best = max(best, round(GEN_W * self._pm(q, t, absset), 3))
        return best

    def _up(self, q, pi, info, absset):
        """How well a broader name of card phrase pi matches q (gen_results.py)."""
        best = 0.0
        l1, l2 = info["up"].get(pi, ((), ()))
        for t in l1:
            best = max(best, round(UP_W1 * self._pm(q, t, absset), 3))
        for t in l2:
            best = max(best, round(UP_W2 * self._pm(q, t, absset), 3))
        return best

    def _close(self, q):
        """The search's first COST_TOP talks for the question, any format (kept on q)."""
        if "close" not in q:
            score = self._rank(q["text"])
            order = [int(i) for i in np.argsort(-score, kind="stable")]
            q["close"] = set(list(dict.fromkeys(self.arc._canon(i) for i in order if i in self.alive_set))[:COST_TOP])
        return q["close"]

    def _about(self, q, ids, absset):
        """How well what the talk is about overall (general names) matches q."""
        best = 0.0
        for t in ids:
            best = max(best, round(ABOUT_W * self._pm(q, t, absset), 3))
        return best

    def _in_abs(self, q, absset):
        return q is not None and any(_same(q["toks"][-1], w) for w in absset)

    # -- the question -----------------------------------------------------------
    def question(self, text):
        text = str(text or "").strip()
        if not text:
            raise InputError("question must not be empty")
        # typos against the program's own words ("hapitc" -> "haptic"), as the retriever does
        # ... but not the words the question reader knows ("happier" is no "happen")
        fixed = re.sub(r"\w+", lambda m: m.group(0) if m.group(0).lower() in KNOWN
                       else self.arc.ex.speller(m.group(0)), text)
        q = parse_question(fixed)
        q["corrected"] = fixed if fixed != text else None
        q["X"] = self._phrase(q["x"]) if q["kind"] == "relation" else None
        q["Y"] = self._phrase(q["y"]) if q["kind"] == "relation" else None
        q["C"] = self._phrase(q["ctx"]) if q["ctx"] else None
        v = np.asarray(self.ex.embed(fixed), dtype=np.float64)
        q["V"] = v / max(float(np.sqrt((v * v).sum())), 1e-9)
        if q["kind"] == "relation" and q["X"] is None:
            q["kind"] = "topic"
        return q

    def _rank(self, text):
        p = {"research": text, "keywords": [], "topics": []}
        return self.arc._score(p)

    # -- one talk's angle -------------------------------------------------------
    def judge(self, i, q):
        """-> {"angle", "subtype", "conf", "card": index or None, "caveat": index or None}
        or None when the talk is not about X or Y."""
        v = self._judge_cards(i, q)
        if (v is not None and v["angle"] in ("support", "challenge")) or q["Y"] is None or not self.info.get(i):
            return v
        return self._judge_questions(i, q) or v

    def _lean(self, q):
        """+1 the question wants its Y up, -1 down (a bad Y flips it), 0 no direction."""
        Y = q["Y"]
        bad = any(w in NEG_OUTCOME for w in Y["toks"]) != Y["neg"]
        return {"+": 1, "-": -1}.get(q["dir"], 0) * (-1 if bad else 1)

    def _judge_questions(self, i, q):
        """A Support from the questions the talk's results answer (angles.json "cq")."""
        info = self.info[i]
        absset = self._absset(i)
        lean = self._lean(q)
        for k, qp, xp, yp, g in info["cq"]:
            # g 2: "How does X affect Y?", a result with no direction, for undirected questions only
            if (g == AFFECTS and lean) or (g != AFFECTS and lean and g and lean != g):
                continue
            cos = sum(float(a) * float(b) for a, b in zip(q["V"], self.pvec[qp]))
            if cos < CARDQ_COS:
                continue
            my = self._pm(q["Y"], yp, absset)
            if my >= MATCH and self._pm(q["X"], xp, absset) >= CARDQ_X:
                sub = "try" if self.items[i]["type"] in NO_FINDINGS else "evidence"
                return {"angle": "support", "subtype": sub, "conf": round(0.7 * my, 3), "card": k,
                        "caveat": None, "asks": qp}
        return None

    def _judge_cards(self, i, q):
        info = self.info.get(i)
        typ = self.items[i]["type"]
        absset = self._absset(i)
        if not info:
            return None
        X, Y, C = q["X"], q["Y"], q["C"]
        rows, direct, xdirect = [], {}, {}
        for k, c in enumerate(info["cards"]):
            mx = self._pmg(X, c["f"], info, absset)
            my = self._pmg(Y, c["o"], info, absset) if Y is not None else 0.75
            # the same card in question words ("mental health app" -> "stress")
            cl = info["claims"].get(k)
            if cl:
                mx = max(mx, round(CLAIM_W * self._pm(X, cl[0], absset), 3))
                if Y is not None:
                    my = max(my, round(CLAIM_W * self._pm(Y, cl[1], absset), 3))
            # the LLM sometimes names the question's X as the outcome and Y as the factor
            swapped = False
            if Y is not None and mx < MATCH and my < MATCH:
                sx, sy = self._pmg(X, c["o"], info, absset), self._pmg(Y, c["f"], info, absset)
                if sx >= MATCH and sy >= MATCH:
                    mx, my, swapped = sx, sy, True
            # ... but then which way the effect runs is a guess: never a Challenge
            direct[k] = 0.0 if swapped else min(mx, my)
            xdirect[k] = 0.0 if swapped else mx
            # a broader name: the question is often a level above the card
            if mx < 1.0:
                mx = max(mx, self._up(X, c["f"], info, absset))
            if Y is not None and my < 1.0:
                my = max(my, self._up(Y, c["o"], info, absset))
            rows.append((k, c, mx, my))
        both = [r for r in rows if r[2] >= MATCH and r[3] >= MATCH]

        def polarity(c):
            e = c["e"]
            if e in ("increase", "decrease"):
                flip = self.pneg[c["f"]] != self.pneg[c["o"]]
                if X is not None and X["neg"]:
                    flip = not flip
                if Y is not None and Y["neg"]:
                    flip = not flip
                if flip:
                    e = "decrease" if e == "increase" else "increase"
            if Y is None and e in ("increase", "decrease"):
                bad = any(w in NEG_OUTCOME for w in self.ptoks[c["o"]])
                e = ("decrease" if e == "increase" else "increase") if bad else e
            # "associated" has no direction: the talk is on the question, not an answer to it
            if q["dir"] == "-":
                return {"decrease": "agree", "increase": "oppose", "no_effect": "null",
                        "mixed": "mixed", "associated": "related"}[e]
            if q["dir"] == "?":
                return {"increase": "agree", "decrease": "agree", "no_effect": "null",
                        "mixed": "agree_weak", "associated": "related"}[e]
            return {"increase": "agree", "decrease": "oppose", "no_effect": "null",
                    "mixed": "mixed", "associated": "related"}[e]

        def other_people(c):
            if C is None or c["p"] < 0:
                return False
            return self._pm(C, c["p"], absset) < 0.5 and not self._in_abs(C, absset)

        if both:
            told = [r for r in both if r[1]["st"] in ("result", "claim")]
            if not told:
                k, c, mx, my = both[0]
                return {"angle": "reframe", "subtype": "related", "conf": round(0.5 * min(mx, my), 3),
                        "card": k, "caveat": None}
            # the card closest to the question, not the first one ("Apple's scanner" over "QR
            # scanners" when both are asked about); the others may still add a caveat
            best = max(told, key=lambda r: (direct[r[0]], min(r[2], r[3]), -r[0]))
            k, c, mx, my = best
            pol = polarity(c)
            m = min(mx, my)
            w = 1.0 - 0.08 * k
            if pol in ("agree", "agree_weak"):
                if other_people(c):
                    return {"angle": "reframe", "subtype": "people", "conf": round(0.8 * m * w, 3),
                            "card": k, "caveat": None}
                cav = next((r[0] for r in told if r is not best and r[1]["st"] == "result"
                            and polarity(r[1]) in ("oppose", "null")), None)
                sub = "try" if (c["st"] == "claim" or typ in NO_FINDINGS) else "evidence"
                conf = m * w * (1.0 if c["st"] == "result" else 0.8) * (1.0 if pol == "agree" else 0.85)
                return {"angle": "support", "subtype": sub, "conf": round(conf, 3), "card": k,
                        "caveat": cav}
            if pol == "related":
                return {"angle": "reframe", "subtype": "related", "conf": round(0.6 * m * w, 3),
                        "card": k, "caveat": None}
            # the other way: a Challenge only on an explicit result, both phrases close
            can = (c["st"] == "result" and typ not in NO_FINDINGS and direct[k] >= STRICT)
            if can:
                sub = {"oppose": "opposite", "null": "null", "mixed": "only_when"}[pol]
                return {"angle": "challenge", "subtype": sub, "conf": round(m * w, 3), "card": k,
                        "caveat": None}
            return {"angle": "reframe", "subtype": "related", "conf": round(0.6 * m * w, 3),
                    "card": k, "caveat": None}
        # the question takes X to be good ("raise" a good Y, "reduce" a bad one); a result
        # where the very X, as tested, made something else worse is a cost the asker may
        # not have counted (better / worse read once per card by the LLM, gen_valence.py)
        # (not when X itself is a fault, "dark patterns", nor when the card's factor is X
        # failing, "subtitle errors", "latency"; and only from the talks closest to the
        # question, so the cost is one the asker would care about)
        if (COST and Y is not None and typ not in NO_FINDINGS and q["dir"] in "+-"
                and not FAULT & set(X["toks"]) and self.arc._canon(i) in self._close(q)):
            yneg = any(w in NEG_OUTCOME for w in Y["toks"]) != Y["neg"]
            if (q["dir"] == "+") != yneg:
                for k, c, mx, my in rows:
                    if (info["val"].get(k) == (WORSE, 1) and xdirect[k] >= STRICT and my < MATCH
                            and X["neg"] == self.pneg[c["f"]] and not FAULT & set(self.ptoks[c["f"]])):
                        return {"angle": "challenge", "subtype": "cost", "conf": round(0.7 * mx, 3),
                                "card": k, "caveat": None}
        y_only = [r for r in rows if r[3] >= MATCH and Y is not None and r[2] < MATCH]
        x_only = [r for r in rows if r[2] >= MATCH and (Y is None or r[3] < MATCH)]
        if y_only and Y is not None:
            k, c, mx, my = max(y_only, key=lambda r: (r[3], -r[0]))
            return {"angle": "reframe", "subtype": "factor", "conf": round(0.8 * my, 3), "card": k,
                    "caveat": None}
        if Y is not None:
            for mi, me in enumerate(info["measures"]):
                s = self._pm(Y, me["c"], absset)
                if s >= MATCH:
                    return {"angle": "reframe", "subtype": "measure", "conf": round(0.8 * s, 3),
                            "card": None, "measure": mi, "caveat": None}
        if x_only:
            k, c, mx, my = max(x_only, key=lambda r: (r[2], -r[0]))
            return {"angle": "reframe", "subtype": "measure", "conf": round(0.7 * mx, 3), "card": k,
                    "caveat": None}
        # no card says it: what the talk is about overall
        ix = self._about(X, info["about"]["f"], absset)
        iy = self._about(Y, info["about"]["o"], absset) if Y is not None else 0.0
        if iy >= MATCH:
            return {"angle": "reframe", "subtype": "factor", "conf": round(0.6 * iy, 3), "card": None,
                    "caveat": None}
        if ix >= MATCH:
            return {"angle": "reframe", "subtype": "measure", "conf": round(0.6 * ix, 3), "card": None,
                    "caveat": None}
        if self._in_abs(X, absset) and (Y is None or self._in_abs(Y, absset)):
            return {"angle": "reframe", "subtype": "related", "conf": 0.3, "card": None, "caveat": None}
        return None

    # -- what the screens show for a talk --------------------------------------------
    def _sentence(self, i, card, key="s", spans=("fs", "os")):
        ab = self.items[i]["abstract"]
        a, b = card[key]
        hl = []
        for sk in spans:
            if sk in card and card[sk][1] > card[sk][0]:
                x, y = card[sk]
                if a <= x and y <= b:
                    hl.append([x - a, y - a])
        hl.sort()
        return {"text": ab[a:b], "start": a, "end": b, "highlight": hl}

    def _why(self, i, v):
        info = self.info.get(i) or {}
        if v.get("card") is not None:
            c = info["cards"][v["card"]]
            out = {"sentence": self._sentence(i, c), "factor": self.phrases[c["f"]],
                   "outcome": self.phrases[c["o"]], "effect": c["e"], "status": c["st"]}
        elif v.get("measure") is not None:
            me = info["measures"][v["measure"]]
            out = {"sentence": self._sentence(i, me, spans=("cs",)), "factor": "",
                   "outcome": self.phrases[me["c"]], "effect": "", "status": "measure"}
        else:
            out = {"sentence": None, "factor": "", "outcome": "", "effect": "", "status": ""}
        if v.get("caveat") is not None:
            out["caveat"] = self._sentence(i, info["cards"][v["caveat"]])
        # the card's finding in one plain sentence (LLM, offline), and the question it answers
        out["finding"] = (info.get("sum") or {}).get(v["card"], "") if v.get("card") is not None else ""
        out["answers"] = show(self.phrases[v["asks"]][:1].upper() + self.phrases[v["asks"]][1:]) \
            if v.get("asks") is not None else ""
        out["text"] = show(self._why_text(v, out))
        return out

    @staticmethod
    def _why_text(v, w):
        a, s = v["angle"], v["subtype"]
        f, o = w.get("factor"), w.get("outcome")
        if w.get("answers"):
            return f"Answers yes to \u201c{w['answers']}\u201d {w.get('finding', '')}".strip()
        if w.get("finding"):
            return f"{WHY_LEAD[a][s]} {w['finding']}"
        if not o:
            return WHY_LEAD[a][s]
        if a == "support":
            return (f"Shows {f} going with {o}, as your question expects." if s == "evidence" else
                    f"Lets you try {f} for {o} yourself.")
        if a == "challenge":
            return {"null": f"Found no clear effect of {f} on {o}.",
                    "opposite": f"Found {f} going against {o}.",
                    "only_when": f"Found that {f} affects {o} only under some conditions.",
                    "cost": f"Found {f} making {o} worse."}[s]
        return {"factor": f"Looks at another factor behind {o}: {f}.",
                "measure": f"Looks at {o} from another side." if not f else f"Looks at what {f} does to {o}.",
                "people": f"Same question, with other people or another setting.",
                "related": "On the same subject, without a result for your exact question."}[s]

    def _where(self, slot, badge):
        """Where a node sits on the map line: "Rm 119", "Poster", "Demo"."""
        if badge == "POSTER":
            return "Poster"
        if badge == "DEMO":
            return "Demo"
        room = ((slot or {}).get("room") or "").split(" - ")[-1]
        return re.sub(r"^Room\b", "Rm", room)

    def _node(self, i, v, slot=None):
        slot = slot or (self.arc.slots.get(i) or [None])[0]
        c = self.arc._card(i, slot)
        info = self.info.get(i) or {}
        label = info.get("label") or " ".join(self.items[i]["title"].split()[:3])
        tribe = self.tribes[info["tribe"]] if info.get("tribe") is not None else None
        return {"id": c["id"], "angle": v["angle"], "angle_name": ANGLE_NAME[v["angle"]],
                "symbol": SYMBOL[v["angle"]], "subtype": v["subtype"], "subtype_label": SUBTYPE[v["subtype"]],
                "confidence": v["conf"], "by_user": bool(v.get("by_user")), "label": label,
                "title": c["title"], "type": c["type"], "badge": c["badge"],
                "day": c.get("day"), "day_label": c.get("day_label"), "time": c.get("time"),
                "start": c.get("start"), "end": c.get("end"), "room": c.get("room"),
                "where": self._where(slot, c["badge"]), "session": c.get("session"),
                "talk_order": c.get("talk_order"), "doi": c["doi"],
                "tribe": tribe["name"] if tribe else None,
                "debut": bool(info.get("first_debut")), "why": self._why(i, v)}

    # -- request helpers ------------------------------------------------------------
    def _formats(self, req):
        f = req.get("formats") or DEFAULT_FORMATS
        if not isinstance(f, list):
            raise InputError('formats must be a list, e.g. ["talks", "posters"]')
        out = []
        for x in f:
            k = str(x).strip().lower()
            k = FORMAT_ALIAS.get(k, k)
            if k not in FORMATS:
                raise InputError(f"unknown format {json.dumps(x)}; use {', '.join(FORMATS)}")
            out.append(k)
        return list(dict.fromkeys(out))

    def _types(self, formats):
        return {t for f in formats for t in FORMATS[f]}

    def _today(self, now):
        """The conference day of `now`; before CHI the first day, after it the last."""
        days = self.arc.days
        if now is None:
            return days[0]
        d = now.date().isoformat()
        if d in days:
            return d
        return days[0] if d < days[0] else days[-1]

    def _days(self, req, now=None):
        """09 When: "today" (default), "tomorrow", "week", or days like ["tue"]."""
        d = req.get("days", req.get("when"))
        if d in (None, "", "today"):
            d = ["today"]
        if isinstance(d, str):
            d = [d]
        if not isinstance(d, list):
            raise InputError('days must be "today", "tomorrow", "week" or a list like ["tue"]')
        today = self._today(now)
        out = []
        for x in d:
            s = str(x).strip().lower()
            if s == "today":
                out.append(today)
            elif s == "tomorrow":
                k = self.arc.days.index(today)
                out.append(self.arc.days[min(k + 1, len(self.arc.days) - 1)])
            elif s in ("week", "all", "all week"):
                out.extend(self.arc.days)
            else:
                out.append(self.arc._day(x))
        return list(dict.fromkeys(out))

    def _now_of(self, req):
        return self.arc._now(req["now"]) if req.get("now") else None

    def _ids(self, xs, name):
        out = []
        for x in xs or []:
            xid = x.get("id") if isinstance(x, dict) else x
            try:
                out.append(self.arc._canon(self.pos[int(xid)]))
            except (KeyError, ValueError, TypeError):
                raise InputError(f"{name}: unknown item id {json.dumps(xid)}")
        return list(dict.fromkeys(out))

    def _tribe(self, score, idx):
        w = Counter()
        for i in idx[:20]:
            t = (self.info.get(i) or {}).get("tribe")
            if t is not None:
                w[t] += float(score[i])
        if not w:
            return None
        (t1, w1), *rest = sorted(w.items(), key=lambda kv: (-kv[1], kv[0]))
        t2, w2 = rest[0] if rest else (None, 0.0)
        tr = dict(self.tribes[t1])
        tr["margin"] = round((w1 - w2) / w1, 3) if w1 else 0.0
        tr["runner_up"] = self.tribes[t2]["name"] if t2 is not None else None
        # 11: "YOU'RE IN XR & immersive · Look for the blue diamond."
        tr["look_for"] = f"Look for the {COLOR_NAME.get(tr['color'], 'white')} {tr['shape']}."
        return tr

    def _tribe_of(self, text, types=None):
        """The tribe of what the person typed. A topic is built on its sharpest question, but
        that question can drift ("accessible indoor navigation" -> "critical design
        considerations"), so the tribe never comes from it (team 11/22)."""
        score = self._rank(text)
        pool = [int(i) for i in np.argsort(-score, kind="stable") if int(i) in self.alive_set
                and (types is None or self.items[int(i)]["type"] in types)][:20]
        return self._tribe(score, pool)

    def _judged(self, q, types, score=None):
        """Talks of the chosen formats by match, with their angle (top JUDGE_N read)."""
        score = self._rank(q["text"]) if score is None else score
        order = [int(i) for i in np.argsort(-score, kind="stable")]
        pool = [i for i in order if i in self.alive_set and self.items[i]["type"] in types][:POOL]
        out = []
        for r, i in enumerate(pool[:JUDGE_N]):
            v = (self.judge(i, q) or self._near(r, float(score[i]))) if q["kind"] == "relation" else None
            if v is not None:
                out.append((i, v))
        return out, pool, score

    def _topic_fill(self, asked, types, judged):
        """A topic Arc ("mixed reality") is built on its sharpest question; the topic's own
        first talks fill what that question leaves empty, as Reframes on the same subject."""
        have = {i for i, _ in judged}
        sc = self._rank(asked)
        order = [int(i) for i in np.argsort(-sc, kind="stable")]
        pool = [i for i in order if i in self.alive_set and self.items[i]["type"] in types][:JUDGE_N]
        return [(i, {"angle": "reframe", "subtype": "related", "conf": TOPIC_CONF, "card": None, "caveat": None})
                for i in pool if i not in have]

    @staticmethod
    def _near(pos, s):
        """A talk the cards cannot place but the search puts near the top: Same subject."""
        if pos < NEAR_TOP or s >= NEAR_SCORE:
            return {"angle": "reframe", "subtype": "related", "conf": NEAR_CONF, "card": None, "caveat": None}
        return None

    def _counts(self, judged):
        c = Counter(v["angle"] for _, v in judged)
        return {a: c.get(a, 0) for a in ANGLES}

    def _as_relation(self, q, req):
        """A topic or a wide question becomes its sharpest question (and says so)."""
        if q["kind"] == "relation":
            return q, None
        types = self._types(self._formats(req))
        _, pool, score = self._judged(q, types)
        sug = self._suggest(q, pool, score, types, k=SUGGEST_K)
        if not sug:
            raise InputError('could not find a question in this topic; try a question like "Does X raise Y?"')
        return self.question(sug[0]["question"]), q["text"]

    def _arc_question(self, req, strict=False):
        """The question an Arc was built on: a topic becomes its sharpest question, as in
        arc_screen, so that edit, node, shared and summary agree with the map."""
        q = self.question(req.get("question"))
        try:
            return self._as_relation(q, req)[0]
        except InputError:
            if strict:
                raise
            return q

    # -- A-1 / A-2 ------------------------------------------------------------------
    def ask(self, req):
        text = req.get("text", req.get("question"))
        q = self.question(text)
        types = self._types(self._formats(req))
        judged, pool, score = self._judged(q, types)
        out = {"text": q["text"], "kind": q["kind"],
               "parsed": {"x": q["x"], "y": q["y"], "direction": q["dir"], "context": q["ctx"]},
               "tribe": self._tribe(score, pool),
               "matching": self._matching(q, pool), "corrected": q["corrected"]}
        rel = self.arc._relevance({"research": q["text"], "keywords": [], "topics": []})
        out["on_topic"] = not rel["low"]
        out["warning"] = ENGLISH_ONLY if _non_latin(q["text"]) else OFF_TOPIC if rel["low"] else None
        if q["kind"] == "relation":
            out["counts"] = self._counts(judged)
            out["suggestions"] = []
        elif req.get("now"):
            # 07b: "That's a topic. 31 Tuesday talks match it. Pick a sharper question:"
            days = self._days(req, self._now_of(req))
            out["matching_day"] = self._matching(q, [i for i in pool if self._on_days(i, days)])
            when = " or ".join(_weekday(d) for d in days) if len(days) <= 2 else "this week's"
            out["message"] = ("That's a topic." if q["kind"] == "topic" else "That's a wide question.") + \
                f" {out['matching_day']} {when} talks match it. Pick a sharper question:"
        else:
            out["message"] = ("That's a topic, not a question yet." if q["kind"] == "topic"
                              else "That's a wide question.") + \
                f" {out['matching']} talks match it. Pick a sharper one:"
        if q["kind"] != "relation":
            # nothing sharper to offer for a question CHI does not cover
            out["suggestions"] = [] if out["warning"] else \
                self._suggest(q, pool, score, types, k=int(req.get("k") or 3))
        out["help"] = HELP
        return out

    def _matching(self, q, pool):
        # "What is accessibility research asking now?" counts talks on accessibility
        words = (q["X"] or self._phrase(q["x"]) or {"toks": []})["toks"] if q["kind"] == "relation" \
            else [w for w in content(q["x"])[0] if w not in PLAIN and w not in VAGUE]
        if q["kind"] == "relation" and q["Y"] is not None:
            words = words[-1:] + q["Y"]["toks"][-1:]
        words = [w for w in words if w]
        if not words:
            return 0
        n = 0
        for i in pool:
            s = self._absset(i)
            if all(any(_same(w, x) for x in s) for w in words[-2:]):
                n += 1
        return n

    def _suggest(self, q, pool, score, types, k=3):
        """Sharper questions from the findings of the talks that match a topic: the most
        common factor -> outcome pairs, each with the Arc it would give."""
        groups = {}
        for rank, i in enumerate(pool[:60]):
            info = self.info.get(i)
            if not info:
                continue
            for k_, c in enumerate(info["cards"]):
                if c["st"] not in ("result", "claim"):
                    continue
                # the card in question words when there is one ("mental health app")
                fp, op = info["claims"].get(k_, (c["f"], c["o"]))
                ft, ot = self.ptoks[fp], self.ptoks[op]
                if not ft or not ot or len(ft) > 4 or len(ot) > 3:
                    continue
                key = (ft[-1], ot[-1])
                g = groups.setdefault(key, {"items": [], "f": Counter(), "o": Counter(), "e": Counter(),
                                            "w": 0.0})
                if i not in g["items"]:
                    g["items"].append(i)
                    g["w"] += float(score[i])
                g["f"][self.phrases[fp]] += 1
                g["o"][self.phrases[op]] += 1
                g["e"][c["e"]] += 1
        # pairs that use the words of the topic itself come first ("VR presence" -> presence)
        qt = content(q["x"])[0] if q["kind"] != "relation" else []

        def overlap(g):
            toks = [t for ph in list(g["f"]) + list(g["o"]) for t in content(ph)[0]]
            return sum(1 for w in qt if any(_same(w, t) for t in toks))
        ov = {key: overlap(g) for key, g in groups.items()}
        ranked = sorted(((round(g["w"] * (1 + ov[key]), 6), key) for key, g in groups.items()
                         if len(g["items"]) >= 2 or ov[key] > 0), key=lambda t: (-t[0], t[1]))
        out, used_f, used_o, used_i = [], set(), set(), set()
        if CQ_SUGGEST:
            # "chatbots and mental health": the asker's own two things, asked as they gave them
            a_, b_ = _pair(q["x"]) if q["kind"] != "relation" else ("", "")
            mine = []
            if a_ and b_:
                text = self._wording(a_, b_, Counter({"increase": 1}))
                if self.question(text)["kind"] == "relation":
                    mine = [self._suggestion(text, a_, b_, [], types)]
            out = mine + [o for o in self._claims(q, pool, score, types, k) if o["question"] != (mine or [{}])[0].get("question")]
            out = out[:k]
            if len(out) >= CQ_ONLY:
                return self._balanced(out, q)
        # a topic keeps its own words when its talks share an outcome or a cause
        if q["kind"] == "topic":
            for x, y, e, items in self._anchored(q, pool, score):
                text = self._wording(x, y, e)
                if all(o["question"] != text for o in out):
                    out.append(self._suggestion(text, x, y, items, types))
                if len(out) == k:
                    return self._balanced(out, q)
        for _, key in ranked:
            g = groups[key]
            # a new pair, from talks not already behind another suggestion
            if (key[0] in used_f and key[1] in used_o) or set(g["items"]) <= used_i:
                continue
            x = sorted(g["f"].items(), key=lambda kv: (-kv[1], len(kv[0]), kv[0]))[0][0]
            y = sorted(g["o"].items(), key=lambda kv: (-kv[1], len(kv[0]), kv[0]))[0][0]
            text = self._wording(x, y, g["e"])
            if any(o["question"] == text for o in out):
                continue
            out.append(self._suggestion(text, x, y, g["items"], types))
            used_f.add(key[0])
            used_o.add(key[1])
            used_i.update(g["items"])
            if len(out) == k:
                break
        return self._balanced(out, q)

    def _claims(self, q, pool, score, types, k):
        """Sharper questions from the questions the topic's talks answer (angles.json "cq"):
        the ones most talks back (cosine CARDQ_COS, same way up), those with the topic's
        words first, no two alike. Each needs two talks."""
        # questions with a direction only: the claim the Supports back and the Challenges push on
        cands = [(i, qp, g) for i in pool[:60] for _, qp, _, _, g in (self.info.get(i) or {}).get("cq", [])
                 if g != AFFECTS]
        if not cands:
            return []
        V = self.pvec[[qp for _, qp, _ in cands]]
        S = V @ V.T
        qt = content(q["x"])[0] if q["kind"] != "relation" else []
        A_, B_ = (self._phrase(t) for t in _pair(q["x"])) if q["kind"] != "relation" else (None, None)
        rows = []
        for a, (i, qp, g) in enumerate(cands):
            # talks, not listings: a talk listed twice backs a question once
            backers = list(dict.fromkeys(self.arc._canon(cands[b][0]) for b in range(len(cands))
                                         if S[a, b] >= CARDQ_COS and not (g and cands[b][2] and g != cands[b][2])))
            if len(backers) < 2:
                continue
            # on the typed topic, and short enough to read as a question
            if len(self.phrases[qp].split()) > CQ_WORDS or float(V[a] @ q["V"]) < CQ_TOPIC:
                continue
            keeps = any(_same(w, t) for w in qt for t in self.ptoks[qp])
            # "chatbots and mental health": the two named things as the question's X and Y
            pair = 1
            if A_ is not None and B_ is not None:
                _, _, xp, yp, _ = next(r for r in (self.info.get(i) or {}).get("cq", []) if r[1] == qp)
                pair = 0 if self._pm(A_, xp, set()) >= MATCH and self._pm(B_, yp, set()) >= MATCH else 1
            rows.append((pair, 0 if keeps else 1, -len(backers), -round(sum(float(score[j]) for j in backers), 6), a, backers))
        rows.sort()
        out, picked = [], []
        for _, _, _, _, a, backers in rows:
            if any(S[a, b] >= CQ_SAME for b in picked):
                continue
            i, qp, _ = cands[a]
            text = show(self.phrases[qp][:1].upper() + self.phrases[qp][1:])
            pq = self.question(text)
            if pq["kind"] != "relation":
                continue
            picked.append(a)
            out.append(self._suggestion(text, show(pq["x"]), show(pq["y"]), backers, types))
            if len(out) == k:
                break
        return out

    @staticmethod
    def _balanced(out, q):
        """The sharper question whose Arc holds the most of the three angles comes first
        (team 11/25: aim for "2 support · 2 reframe · 1 challenge"), among those that keep a
        word of the typed topic when any does; ties keep their order."""
        if not BALANCE:
            return out
        qt = content(q["x"])[0] if q["kind"] != "relation" else []

        def keeps(o):
            return any(_same(w, t) for w in qt for t in content(o["question"])[0])
        return sorted(out, key=lambda o: (0 if keeps(o) else 1, -sum(1 for a in ANGLES if o["counts"][a] > 0)))

    @staticmethod
    def _wording(x, y, e):
        """A question from a factor, an outcome and the directions the talks found."""
        ups, downs = e["increase"], e["decrease"]
        bad = any(w in NEG_OUTCOME for w in content(y)[0])
        do = "Do" if re.search(r"[^s]s$", x.split()[-1]) else "Does"
        if ups > downs and ups >= e["no_effect"]:
            text = f"{do} {x} {'increase' if bad else 'improve'} {y}?"
        elif downs > ups:
            text = f"{do} {x} reduce {y}?"
        else:
            text = f"How {do.lower()} {x} affect {y}?"
        return show(text)

    def _suggestion(self, text, x, y, items, types):
        jd, _, _ = self._judged(self.question(text), types)
        sessions = list(dict.fromkeys(s["session"] for i in items for s in self.arc.slots.get(i, [])
                                      if s["session"] and not s["session"].startswith("Posters")))[:3]
        return {"question": text, "x": x, "y": y, "counts": self._counts(jd),
                "talks": len(items), "from_sessions": sessions}

    def _anchored(self, q, pool, score):
        """The topic as the factor (what it does) or as the outcome (what drives it), in the
        topic's own words: "haptics" -> "Do haptics improve VR experience?". Each needs two talks."""
        T = self._phrase(q["x"])
        if T is None or len(T["toks"]) > 4:
            return []
        side = {"o": {}, "f": {}}
        for i in pool[:60]:
            info = self.info.get(i)
            if not info:
                continue
            absset = self._absset(i)
            for k_, c in enumerate(info["cards"]):
                if c["st"] not in ("result", "claim"):
                    continue
                fp, op = info["claims"].get(k_, (c["f"], c["o"]))
                mf = max(self._pmg(T, c["f"], info, absset), round(CLAIM_W * self._pm(T, fp, absset), 3))
                mo = max(self._pmg(T, c["o"], info, absset), round(CLAIM_W * self._pm(T, op, absset), 3))
                for role, m, other in (("o", mf, op), ("f", mo, fp)):
                    toks = self.ptoks[other]
                    if m < MATCH or not toks or len(toks) > 3 or \
                            any(_same(w, t) for w in T["toks"] for t in toks):
                        continue
                    g = side[role].setdefault(toks[-1], {"items": [], "w": 0.0, "ph": Counter(), "e": Counter()})
                    if i not in g["items"]:
                        g["items"].append(i)
                        g["w"] += float(score[i])
                    g["ph"][self.phrases[other]] += 1
                    g["e"][c["e"]] += 1
        cands = sorted(((round(g["w"], 6), role, head) for role in ("o", "f") for head, g in side[role].items()
                        if len(g["items"]) >= 2), key=lambda t: (-t[0], t[1], t[2]))
        out = []
        for _, role, head in cands:
            g = side[role][head]
            ph = sorted(g["ph"].items(), key=lambda kv: (-kv[1], len(kv[0]), kv[0]))[0][0]
            x, y = (q["x"], ph) if role == "o" else (ph, q["x"])
            out.append((x, y, g["e"], g["items"]))
        return out

    # -- 08 Choose your angles ----------------------------------------------------------
    def _chip_phrase(self, i, v):
        """What a talk is "about" on its angle's chip: the factor in question words, the
        other measure for an Other measure, the group for Other people."""
        info = self.info.get(i) or {}
        if v["angle"] == "challenge" and v["subtype"] == "null":
            return "null results"
        k = v.get("card")
        if k is None:
            if v.get("measure") is not None:
                return self.phrases[info["measures"][v["measure"]]["c"]]
            return (info.get("label") or "").lower()
        c = info["cards"][k]
        fp, op = info["claims"].get(k, (c["f"], c["o"]))
        if v["subtype"] == "measure":
            return self.phrases[op]
        if v["subtype"] == "people" and c["p"] >= 0:
            return self.phrases[c["p"]]
        return self.phrases[fp]

    def _chips(self, judged):
        """Up to CHIPS_K topic chips per angle: talks grouped by the head word of what
        they are about, strongest first; the first CHIPS_ON[angle] start selected."""
        groups = {a: {} for a in ANGLES}
        n = max(1, len(judged))
        for r, (i, v) in enumerate(judged):
            ph = self._chip_phrase(i, v)
            toks = content(ph)[0]
            if not toks:
                continue
            key = stem(toks[-1])
            g = groups[v["angle"]].setdefault(key, {"names": Counter(), "ids": [], "w": 0.0})
            g["names"][ph] += 1
            if self.items[i]["id"] not in g["ids"]:
                g["ids"].append(self.items[i]["id"])
                g["w"] += round(0.6 * v["conf"] + 0.4 * (1.0 - r / n), 4)
        out = {}
        for a in ANGLES:
            ranked = sorted(groups[a].items(), key=lambda kv: (-kv[1]["w"], kv[0]))[:CHIPS_K]
            chips = []
            for k, (key, g) in enumerate(ranked):
                name = sorted(g["names"].items(), key=lambda kv: (-kv[1], len(kv[0]), kv[0]))[0][0]
                chips.append({"id": f"{a}:{key}", "label": show(name[:1].upper() + name[1:]),
                              "talks": len(g["ids"]), "ids": g["ids"], "selected": k < CHIPS_ON[a]})
            out[a] = chips
        return out

    def angles_screen(self, req):
        q, asked = self._as_relation(self.question(req.get("question") or req.get("text")), req)
        judged, _, _ = self._judged(q, self._types(self._formats(req)))
        chips = self._chips(judged)
        return {"question": q["text"], "asked": asked, "headline": "Choose your angles.",
                "angles": [{"key": a, "name": ANGLE_NAME[a], "symbol": SYMBOL[a], "help": HELP[a],
                            "chips": chips[a],
                            "empty": NO_CHALLENGE if (a == "challenge" and not chips[a]) else None}
                           for a in ANGLES],
                "help_note": HELP_NOTE, "button": "Next"}

    # -- 10-12: the Arc -----------------------------------------------------------------
    def _how(self, req):
        """09 How you walk: "calm" keeps CALM_GAP minutes between stops, "step_free" walks
        by elevator between levels."""
        w = req.get("walk") or []
        if isinstance(w, str):
            w = [w]
        if not isinstance(w, list) or any(x not in WALK for x in w):
            raise InputError(f'walk must be a list of {", ".join(WALK)}')
        return {"gap": CALM_GAP if "calm" in w else GAP_MIN, "step_free": "step_free" in w,
                "walk": [x for x in WALK if x in w]}

    def _place(self, placed, i, days, after, how=None):
        """The first slot of talk i on the chosen days that fits the stops placed so far."""
        how = how or {"gap": GAP_MIN, "step_free": False}
        for s in self.arc.slots.get(i, []):
            if not s["start"] or (days and s["start"][:10] not in days):
                continue
            if after is not None and _t(s["est_end"] or s["end"]) <= after:
                continue
            got = self.arc._fit(placed, i, s, how["gap"], how["step_free"])
            if got:
                return {"i": i, "slot": s, "start": got[0], "end": got[1], "kind": "pick"}
        return None

    def _build(self, q, judged, req, days, keep=(), prefer=()):
        """Choose the nodes: angle quotas, time fit, then the rest as "read". Talks in the
        chips the user picked (08) go first within their angle."""
        n = max(3, min(12, int(req.get("size") or SIZE)))
        how = self._how(req)
        after = self.arc._now(req["after"]) if req.get("after") else None
        st = req.get("state") or {}
        removed = set(self._ids(st.get("removed"), "state.removed"))
        prefer = set(prefer)
        by = {a: [] for a in ANGLES}
        keep_ids = {i for i, _ in keep}
        for r, (i, v) in enumerate(judged):
            if i in removed or i in keep_ids:
                continue
            rel = 1.0 - r / max(1, len(judged))
            bonus = 1.0 if self.items[i]["id"] in prefer else 0.0
            by[v["angle"]].append((round(0.6 * v["conf"] + 0.4 * rel + bonus, 4), r, i, v))
        for a in ANGLES:
            by[a].sort(key=lambda t: (-t[0], t[1]))
        quota = {"challenge": min(len(by["challenge"]), 2 if n >= 6 else 1)}
        quota["support"] = min(len(by["support"]), max(1, round(n * 0.4)))
        quota["reframe"] = min(len(by["reframe"]), n - quota["support"] - quota["challenge"])
        spare = n - sum(quota.values())
        for a in ("support", "reframe"):
            add = min(spare, len(by[a]) - quota[a])
            quota[a] += add
            spare -= add
        placed, reads, chosen = [], [], {}
        for i, v in keep:
            got = self._place(placed, i, days, after, how)
            if got:
                placed.append(got)
            else:
                reads.append(i)
            chosen[i] = v
        taken = {a: sum(1 for i in chosen if chosen[i]["angle"] == a) for a in ANGLES}
        cursor = {a: 0 for a in ANGLES}
        progress = True
        while progress and len(chosen) < n:
            progress = False
            for a in ANGLES:
                if taken[a] >= quota[a] or len(chosen) >= n:
                    continue
                while cursor[a] < len(by[a]):
                    _, _, i, v = by[a][cursor[a]]
                    cursor[a] += 1
                    if i in chosen:
                        continue
                    got = self._place(placed, i, days, after, how)
                    if got:
                        placed.append(got)
                        chosen[i] = v
                        taken[a] += 1
                        progress = True
                        break
                    if len(reads) < MAX_READ and (a != "support" or v["conf"] >= 0.7) and \
                            not self._on_days(i, days):
                        reads.append(i)
                        chosen[i] = v
                        taken[a] += 1
                        progress = True
                        break
        return placed, reads, chosen

    def _on_days(self, i, days):
        return any(s["start"] and s["start"][:10] in days for s in self.arc.slots.get(i, []))

    def _route(self, placed, reads, chosen, now=None, heard=()):
        """Nodes in walking order, each with its map line and state: next (white pulse),
        upcoming, heard (fills with the tribe colour), ended (becomes a read), read."""
        placed = sorted(placed, key=lambda p: (p["start"], p["i"]))
        nodes = []
        for k, p in enumerate(placed):
            nd = self._node(p["i"], chosen[p["i"]], p["slot"])
            t = _hhmm(p["start"].isoformat())
            nd.update({"stop": k + 1, "read": False, "visit_start": p["start"].isoformat(),
                       "visit_end": p["end"].isoformat(), "time": t, "line": f"{t} · {nd['where']}"})
            nodes.append(nd)
        for i in reads:
            nd = self._node(i, chosen[i])
            day = (nd.get("day_label") or "").split(" ")[0]
            nd.update({"stop": None, "read": True, "visit_start": None, "visit_end": None,
                       "line": " · ".join(x for x in (day, nd["where"], "read") if x)})
            nodes.append(nd)
        heard = set(heard)
        found = False
        for nd in nodes:
            if nd["id"] in heard:
                nd["state"] = "heard"
            elif nd["read"]:
                nd["state"] = "read"
            elif now is not None and _t(nd["visit_end"]) <= now:
                nd["state"] = "ended"
            elif not found:
                nd["state"] = "next"
                found = True
            else:
                nd["state"] = "upcoming"
        # 24: at most MAP_CAP nodes per angle on the map, the rest fold into "+N"
        for a in ANGLES:
            mine = [(k, nd) for k, nd in enumerate(nodes) if nd["angle"] == a]
            show = sorted(mine, key=lambda kn: (kn[1]["state"] != "next", -kn[1]["confidence"], kn[0]))[:MAP_CAP]
            ids = {nd["id"] for _, nd in show}
            for _, nd in mine:
                nd["bundled"] = nd["id"] not in ids
        return nodes

    @staticmethod
    def _bundles(nodes):
        out = {}
        for a in ANGLES:
            ids = [nd["id"] for nd in nodes if nd["angle"] == a and nd["bundled"]]
            if ids:
                out[a] = {"count": len(ids), "label": f"+{len(ids)}", "text": f"{len(ids)} more", "ids": ids}
        return out

    def _next_card(self, nodes, step_free=False):
        """12: the Next card under the map; the only place that shows walking (Q6)."""
        k = next((k for k, nd in enumerate(nodes) if nd["state"] == "next"), None)
        if k is None:
            return None
        cur = nodes[k]
        walk = None
        prev = nodes[k - 1] if k > 0 and nodes[k - 1]["stop"] else None
        if prev:
            w = self.arc._walk(prev["room"], cur["room"], step_free)
            if w:
                walk = "Same room" if w["min"] == 0 else f"{w['min']}–{w['max']} min walk from {prev['where']}"
                if step_free and w["min"] and w["via"] != "same level":
                    walk += " · elevator"
        place = cur["where"] if cur["badge"] in ("POSTER", "DEMO") else (cur["room"] or "").split(" - ")[-1]
        return {"id": cur["id"], "label": cur["label"], "title": cur["title"], "angle": cur["angle"],
                "symbol": cur["symbol"], "line": f"Next · {cur['time']} · {place}", "walk": walk}

    def arc_screen(self, req):
        t0 = time.perf_counter()
        q, asked = self._as_relation(self.question(req.get("question") or req.get("text")), req)
        formats = self._formats(req)
        types = self._types(formats)
        now = self._now_of(req)
        days = self._days(req, now)
        judged, pool, score = self._judged(q, types)
        if asked:
            judged = judged + self._topic_fill(asked, types, judged)
        # an author's Arc from their own paper ("mine"): their own talks are not stops
        mine = set(self._ids(req.get("mine"), "mine"))
        if mine:
            judged = [(i, v) for i, v in judged if self.arc._canon(i) not in mine]
        picked = req.get("chips")
        prefer = []
        if picked:
            if not isinstance(picked, list):
                raise InputError('chips must be a list of chip ids from the "angles" screen')
            for a, chips in self._chips(judged).items():
                for c in chips:
                    if c["id"] in picked:
                        prefer += c["ids"]
        st = req.get("state") or {}
        overrides = {}
        for x in st.get("added") or []:
            if isinstance(x, dict) and x.get("angle"):
                overrides[self._ids([x], "state.added")[0]] = str(x["angle"])
        keep = [(i, self._angle(i, q, overrides.get(i)))
                for i in self._ids(st.get("locked"), "state.locked") + self._ids(st.get("added"), "state.added")]
        placed, reads, chosen = self._build(q, judged, req, days, keep, prefer)
        heard = [self.items[i]["id"] for i in self._ids(st.get("heard"), "state.heard")]
        nodes = self._route(placed, reads, chosen, now, heard)
        counts = Counter(nd["angle"] for nd in nodes)
        tribe = self._tribe_of(asked, types) if asked else self._tribe(score, pool)
        n_all = sum(1 for i in self.alive_set if self.items[i]["type"] in types)
        n_day = sum(1 for i in self.alive_set if self.items[i]["type"] in types and self._on_days(i, days))
        close = min(JUDGE_N, sum(1 for i in pool if self._on_days(i, days)))
        n_stops = sum(1 for nd in nodes if nd["stop"])
        steps = [
            {"key": "on_day", "n": n_day,
             "text": f"{n_day} on {', '.join(_day_label(d).split()[0] for d in days)}"},
            {"key": "close", "n": close, "text": f"{close} close to your question"},
            {"key": "angles", "n": len(judged), "text": f"{len(judged)} read for their angle"},
            {"key": "tribe", "n": None, "text": f"You're in {tribe['name']} {tribe['symbol']}" if tribe else ""},
            {"key": "fit", "n": n_stops, "text": f"{n_stops} stops that fit your day"},
        ]
        return {"question": q["text"], "asked": asked,
                "parsed": {"x": q["x"], "y": q["y"], "direction": q["dir"], "context": q["ctx"]},
                "tribe": tribe, "days": days, "formats": formats,
                "loading": {"text": f"Reading {n_all:,} talks for you", "n": n_all},
                "counts": {a: counts.get(a, 0) for a in ANGLES},
                "summary_line": f"{len(nodes)} stops · " + " · ".join(
                    f"{counts.get(a, 0)} {a}" for a in ANGLES),
                "nodes": nodes, "next": self._next_card(nodes, self._how(req)["step_free"]),
                "bundles": self._bundles(nodes), "walk": self._how(req)["walk"],
                "steps": steps, "help": HELP, "help_note": HELP_NOTE,
                "empty": {a: (NO_CHALLENGE if a == "challenge" else None) for a in ANGLES
                          if counts.get(a, 0) == 0},
                "available": self._counts(judged),
                "data_version": self.version,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 1)}

    # -- 15 Edit -----------------------------------------------------------------------------
    def edit(self, req):
        """Tap a node -> swap it (same angle by default); tap a + slot -> add one. Filters:
        the angle, First CHI paper, Wildcard; or search. A card that clashes in time stays
        in the list with "Same time as ..." (Figma 15)."""
        q = self._arc_question(req, strict=True)
        types = self._types(self._formats(req))
        judged, pool, score = self._judged(q, types)
        now = self._now_of(req)
        days = self._days(req, now)
        nodes = self._ids(req.get("nodes"), "nodes")
        tapped = self._ids([req["node"]], "node")[0] if req.get("node") is not None else None
        add = req.get("add")
        if add is not None and add not in ANGLES:
            raise InputError(f"add must be one of {', '.join(ANGLES)}")
        if tapped is not None:
            v0 = dict(judged).get(tapped) or self.judge(tapped, q)
            angle, mode = (v0 or {}).get("angle", "reframe"), "swap"
        else:
            angle, mode = add or "support", "add"
        flt = str(req.get("filter") or "angle").lower()
        if flt in ANGLES:
            angle, flt = flt, "angle"
        if flt not in ("angle", "debut", "wildcard"):
            raise InputError(f"filter must be one of angle, debut, wildcard, {', '.join(ANGLES)}")
        how = self._how(req)
        placed = []
        for i in nodes:
            if i == tapped:
                continue
            got = self._place(placed, i, days, None, how)
            if got:
                placed.append(got)
        k_ = int(req.get("k") or EDIT_K)
        if req.get("search"):
            sc = self._rank(str(req["search"]))
            cand = []
            for i in np.argsort(-sc, kind="stable"):
                i = int(i)
                if i in self.alive_set and self.items[i]["type"] in types and i not in nodes:
                    cand.append((i, self.judge(i, q)))
                    if len(cand) == k_:
                        break
        elif flt == "debut":
            cand = [(i, v) for i, v in judged if i not in nodes and (self.info.get(i) or {}).get("first_debut")][:k_]
        elif flt == "wildcard":
            cand = self._wildcards(q, pool, nodes, k_, self._tribe_of(self.question(req.get("question"))["text"], types))
        else:
            cand = [(i, v) for i, v in judged if v["angle"] == angle and i not in nodes][:k_]
        cards = [self._edit_card(i, v, placed, days) for i, v in cand]
        if flt == "wildcard" and not req.get("search"):
            for c, (i, _) in zip(cards, cand):
                c["reason"] = f"From {self.tribes[self.info[i]['tribe']]['name']}, outside your usual neighbourhood."
        cards.sort(key=lambda c: not c["on_days"])     # the chosen days first
        return {"question": q["text"], "mode": mode, "title": "Swap" if mode == "swap" else "Add",
                "node": self.items[tapped]["id"] if tapped is not None else None,
                "angle": angle, "filter": "search" if req.get("search") else flt,
                "filters": [{"key": angle, "label": ANGLE_NAME[angle], "symbol": SYMBOL[angle]},
                            {"key": "debut", "label": "First CHI paper", "symbol": "✦"},
                            {"key": "wildcard", "label": "Wildcard", "symbol": "⤨"}],
                "cards": cards,
                "available": self._counts([(i, v) for i, v in judged if i not in nodes])}

    def _edit_card(self, i, v, placed, days):
        slots = [s for s in self.arc.slots.get(i, []) if s["start"]]
        slot = next((s for s in slots if s["start"][:10] in days), None) or (slots[0] if slots else None)
        c = self._lite(i, v, slot)
        if v is None:
            c.update({"angle": None, "note": "Not about your question; choose where it sits."})
        clash = None
        on = bool(slot and slot["start"][:10] in days)
        if on and not self.arc._fit(placed, i, slot, GAP_MIN, False):
            a, b, _ = self.arc._interval(i, slot)
            name = lambda p: (self.info.get(p["i"]) or {}).get("label") or self.items[p["i"]]["title"]
            hit = next((p for p in placed if p["start"] < b and a < p["end"]), None)
            if hit:
                clash = {"id": self.items[hit["i"]]["id"], "text": f"Same time as {name(hit)}"}
            elif not placed:
                clash = {"id": None, "text": "Too short to visit"}
            else:
                # no overlap, but no time to walk between: the stop right next to it
                gap = lambda p: min(abs((a - p["end"]).total_seconds()), abs((p["start"] - b).total_seconds()))
                near = min(placed, key=lambda p: (gap(p), p["start"]))
                after = near["end"] <= a
                clash = {"id": self.items[near["i"]]["id"],
                         "text": f"{'Right after' if after else 'Right before'} {name(near)}"}
        head = " ".join(x for x in ((c.get("day_label") or "").split(" ")[0],
                                    _hhmm(slot["est_start"]) if slot and slot["est_start"] else "") if x)
        c.update({"line": " · ".join(x for x in (head, self._where(slot, c["badge"])) if x),
                  "on_days": on, "clash": clash})
        return c

    def _lite(self, i, v, slot=None):
        c = self.arc._card(i, slot)
        info = self.info.get(i) or {}
        out = {"id": c["id"], "title": c["title"], "badge": c["badge"],
               "label": info.get("label") or "", "day_label": c.get("day_label"),
               "time": c.get("time"), "room": c.get("room"), "debut": bool(info.get("first_debut"))}
        if v:
            out.update({"angle": v["angle"], "symbol": SYMBOL[v["angle"]], "subtype": v["subtype"],
                        "subtype_label": SUBTYPE[v["subtype"]], "confidence": v["conf"],
                        "why": self._why(i, v)["text"]})
        return out

    def _wildcards(self, q, pool, nodes, k, mine):
        """Wildcard (Smart Shuffle): talks from other tribes (than mine) that still touch X or Y."""
        mt = next((t for t, tr in enumerate(self.tribes) if mine and tr["name"] == mine["name"]), None)
        out = []
        for i in pool[JUDGE_N:]:
            info = self.info.get(i)
            if i in nodes or not info or info["tribe"] == mt:
                continue
            v = self.judge(i, q)
            if v and v["angle"] != "challenge":
                out.append((i, v))
                if len(out) == k:
                    break
        return out

    # -- 12b hold a stop -----------------------------------------------------------------------
    def hold(self, req):
        """Hold a stop on the map: up to three talks with the same angle that fit its place
        in the day, nearest in time first, each with the walk from the stop before it."""
        q = self._arc_question(req, strict=True)
        types = self._types(self._formats(req))
        judged, pool, score = self._judged(q, types)
        pool = [i for i in pool if self.items[i]["type"] in types]
        now = self._now_of(req)
        days = self._days(req, now)
        how = self._how(req)
        nodes = self._ids(req.get("nodes"), "nodes")
        if req.get("node") is None:
            raise InputError("hold needs the held node's id")
        held = self._ids([req["node"]], "node")[0]
        angle = req.get("angle") or (dict(judged).get(held) or self.judge(held, q) or {}).get("angle", "reframe")
        if angle not in ANGLES:
            raise InputError(f"angle must be one of {', '.join(ANGLES)}")
        placed = []
        for i in nodes:
            if i != held:
                got = self._place(placed, i, days, None, how)
                if got:
                    placed.append(got)
        mine = self._place([], held, days, None, how)
        seen = {i for i, _ in judged}
        more = [(i, self.judge(i, q)) for i in pool[JUDGE_N:JUDGE_N + HOLD_MORE] if i not in seen]
        cands = []
        for r, (i, v) in enumerate(judged + [(i, v) for i, v in more if v]):
            if v["angle"] != angle or i in nodes:
                continue
            # the talk's slot nearest the held stop that still fits the day
            best = None
            for sl in self.arc.slots.get(i, []):
                if not sl["start"] or (days and sl["start"][:10] not in days):
                    continue
                got = self.arc._fit(placed, i, sl, how["gap"], how["step_free"])
                if got:
                    gap = abs((got[0] - mine["start"]).total_seconds()) if mine else 0.0
                    if best is None or gap < best[0]:
                        best = (gap, {"i": i, "slot": sl, "start": got[0], "end": got[1], "kind": "pick"})
            if best and best[0] <= HOLD_WIN * 60:
                cands.append((best[0], r, i, v, best[1]))
        cands.sort(key=lambda t: (t[0], t[1]))
        cards = []
        for _, _, i, v, got in cands[:int(req.get("k") or HOLD_K)]:
            c = self._lite(i, v, got["slot"])
            before = [p for p in placed if p["end"] <= got["start"]]
            prev = max(before, key=lambda p: (p["end"], p["i"])) if before else None
            w = self.arc._walk(prev["slot"]["room"], got["slot"]["room"], how["step_free"]) if prev else None
            walk = None if not w else "stay" if w["min"] == 0 else f"{w['min']}–{w['max']} min walk"
            place = re.sub(r"^Rm ", "", self._where(got["slot"], c["badge"]))
            c.update({"time": _hhmm(got["start"].isoformat()), "place": place, "walk": walk,
                      "line": f"{place} · ~{_hhmm(got['start'].isoformat())}"})
            cards.append(c)
        n = len(cards)
        keep = {1: "It keeps", 2: "Both keep", 3: "All three keep"}.get(n, f"All {n} keep")
        return {"question": q["text"], "node": self.items[held]["id"], "angle": angle,
                "cards": cards,
                "text": f"Release on a talk to swap. {keep} this {ANGLE_NAME[angle][:-1]}." if n
                else "Nothing else with this angle fits here."}

    # -- 14b-14d questions to the authors ------------------------------------------------------
    def questions(self, req):
        """Questions people sent to a talk's authors (in English, after the phone translated
        them): themes for the author (14d), the ones close to a new question (14b), and the
        abstract's own words in it ("From the abstract: delegate")."""
        i = self.arc._item_by_id(req.get("id"))
        raw = req.get("questions") or []
        if not isinstance(raw, list):
            raise InputError("questions must be a list of strings")
        texts = [str(x.get("text") if isinstance(x, dict) else x).strip() for x in raw]
        # sums in order, as the phone does (numpy's pairwise sum differs in the last bit)
        unit = lambda v: v / max(math.sqrt(sum(float(x) * float(x) for x in v)), 1e-9)
        emb = lambda t: unit(np.asarray(self.ex.embed(t), dtype=np.float64))
        vecs = [emb(t) for t in texts]
        cos = lambda a, b: round(float(sum(float(x) * float(y) for x, y in zip(a, b))), 4)
        # themes: each question joins the closest theme centre at or above THEME_COS
        themes = []
        for k, v in enumerate(vecs):
            best, bc = None, THEME_COS
            for t in themes:
                c = cos(v, unit(t["sum"]))
                if c >= bc:
                    best, bc = t, c
            if best is None:
                themes.append({"members": [k], "sum": v.copy()})
            else:
                best["members"].append(k)
                best["sum"] = best["sum"] + v
        absset = self._absset(i)
        info = self.info.get(i) or {"cards": []}
        surface = _surface(texts)
        words = [[w for w in dict.fromkeys(content(t)[0]) if w not in PEOPLE and w + "s" not in PEOPLE
                  and w not in STOPW and w not in PLAIN] for t in texts]
        # a word in most questions is the talk itself ("robot"), not a theme
        common = Counter(w for ws in words for w in ws)
        subject = {w for w, n in common.items() if len(texts) >= 4 and n >= 0.6 * len(texts)}
        out_t = []
        for t in themes:
            cen = unit(t["sum"])
            rep = max(t["members"], key=lambda k: (cos(vecs[k], cen), -k))
            # label: the cluster's most shared words, the abstract's own words first
            first = {}
            for k in t["members"]:
                for w in words[k]:
                    first.setdefault(w, len(first))
            n_in = Counter(w for k in t["members"] for w in words[k])
            top = sorted((w for w in first if w not in subject),
                         key=lambda w: (-(n_in[w] + (0.5 if any(_same(w, x) for x in absset) else 0.0)), first[w]))
            label = show(" · ".join(surface.get(w, w) for w in top[:2])) if top else texts[rep]
            out_t.append({"label": label[:1].upper() + label[1:], "n": len(t["members"]),
                          "members": t["members"], "rep": rep})
        out_t.sort(key=lambda t: (-t["n"], t["members"][0]))
        out = {"id": self.items[i]["id"], "title": self.items[i]["title"], "n": len(texts), "themes": out_t,
               "line": f"{len(texts)} questions, {len(out_t)} theme{'s' if len(out_t) != 1 else ''}."}
        new = str(req.get("new") or "").strip()
        if new:
            v = emb(new)
            close = sorted(((cos(v, w), k) for k, w in enumerate(vecs)), key=lambda t: (-t[0], t[1]))
            out["close"] = [{"k": k, "sim": c} for c, k in close if c >= CLOSE_COS][:10]
            joins = [(cos(v, unit(t["sum"])), n) for n, t in enumerate(themes)]
            jc, jn = max(joins, key=lambda t: (t[0], -t[1])) if joins else (0.0, None)
            out["joins"] = out_t.index(next(t for t in out_t if t["members"] == themes[jn]["members"])) \
                if jn is not None and jc >= THEME_COS else None
            # the abstract's word for each word of the question it shares ("delegate" -> "delegation")
            # only the talk's key words: its title and its findings
            it = self.items[i]
            key = set(lemma(t) for t in _W.findall(it["title"].lower())) | \
                set(w for c in info["cards"] for p in (c["f"], c["o"]) if p >= 0 for w in self.ptoks[p])
            asurf = _surface([it["title"], it["abstract"]])
            mine = _surface([new])
            terms = []
            for w in content(new)[0]:
                if w in PEOPLE or w + "s" in PEOPLE or w in STOPW or w in PLAIN or w in subject:
                    continue
                x = next((x for x in sorted(absset) if x in key and x not in STOPW and _same(w, x)), None)
                if x and not any(t["key"] == x for t in terms):
                    terms.append({"key": x, "word": show(mine.get(w, w)), "abstract": show(asurf.get(x, x))})
            out["terms"] = terms[:2]
        return out

    # -- 14 talk detail ------------------------------------------------------------------------
    def node(self, req):
        q = self._arc_question(req)
        i = self.arc._item_by_id(req.get("id"))
        v = self._angle(i, q, req.get("angle"))
        out = self._node(i, v)
        it = self.items[i]
        info = self.info.get(i) or {}
        deb = info.get("debut", set())
        authors = []
        for k, a in enumerate(it["authors"]):
            af = a["affiliations"][0] if a["affiliations"] else {}
            others = [x for x in self.arc._appearances(a["name"]) if x["id"] != it["id"]]
            authors.append({"name": a["name"], "institution": af.get("institution", ""),
                            "country": af.get("country", ""), "debut": k in deb,
                            "badge": "First CHI paper" if k in deb else None,
                            "also_here": [{"id": x["id"], "kind": x["kind"], "title": x["title"],
                                           "line": f"{x['day_label']} · {x['time']} · {x['room']}"}
                                          for x in others[:3]]})
        slots = self.arc.slots.get(i, [])
        s = slots[0] if slots else None
        when = None
        if s and s["start"]:
            place = self._where(s, out["badge"]) if out["badge"] in ("POSTER", "DEMO") else s["room"].split(" - ")[-1]
            when = f"{_day_label(s['start'][:10]).split()[0]} {_hhmm(s['est_start'])} · {place}"
        seeds = (self.arc.summaries.get(it["id"]) or {}).get("questions", [])
        out.update({"why_label": f"WHY IT {ANGLE_NAME[v['angle']].upper()}",
                    "format_label": FORMAT_LABEL.get(out["badge"], out["type"]),
                    "when_line": when,
                    "first_author": authors[0] if authors else None,
                    "authors": authors, "abstract": it["abstract"],
                    "session": None if not s else {
                        "name": s["session"], "day_label": _day_label(s["start"][:10]) if s["start"] else None,
                        "time": (("~" if s["est_end"] != s["end"] else "") + _hhmm(s["est_start"]))
                        if s["est_start"] else None,
                        "room": s["room"], "order": s.get("order"), "of": s.get("of"),
                        "chairs": s.get("chairs", [])},
                    "questions": [{"text": x, "votes": 0, "seed": True} for x in seeds],
                    "questions_note": "Starter questions written offline from the abstract. Posting and "
                                      "votes are the app's Q&A service, not this model.",
                    "help": HELP[v["angle"]]})
        return out

    # -- 18 / 19 shared, 13 list ----------------------------------------------------------------
    def _angle(self, i, q, user=None):
        """A talk's angle, or the one the user gave it in 15 Edit, so that the map, the list,
        the detail and a shared link all show the same angle."""
        v = (self.judge(i, q) if q["kind"] == "relation" else None) or \
            {"angle": "reframe", "subtype": "related", "conf": 0.0, "card": None, "caveat": None}
        if user in ANGLES and user != v["angle"]:
            v = {"angle": user, "subtype": "related" if user == "reframe" else
                 ("evidence" if user == "support" else "opposite"),
                 "conf": v["conf"], "card": v.get("card"), "caveat": None, "by_user": True}
        return v

    def _user_angles(self, req):
        """{"<talk id>": angle} the user set by hand (sent with shared links, the list, the detail)."""
        m = req.get("angles") or {}
        if not isinstance(m, dict):
            raise InputError("angles must map talk ids to support, reframe or challenge")
        return {self._ids([k], "angles")[0]: str(a) for k, a in m.items()}

    def _plain_route(self, q, ids, now, heard=(), user=None):
        """A given set of talks at their own times (no fitting): shared links and the list."""
        chosen, placed, reads = {}, [], []
        user = user or {}
        for i in ids:
            chosen[i] = self._angle(i, q, user.get(i))
            s = (self.arc.slots.get(i) or [None])[0]
            if s and s["start"]:
                a, b, flexible = self.arc._interval(i, s)
                placed.append({"i": i, "slot": s, "start": a,
                               "end": a + timedelta(minutes=VISIT_MIN) if flexible else b, "kind": "pick"})
            else:
                reads.append(i)
        return self._route(placed, reads, chosen, now, heard)

    def shared(self, req):
        q = self._arc_question(req)
        ids = self._ids(req.get("ids"), "ids")
        if not ids:
            raise InputError("shared needs the Arc's talk ids")
        now = self._now_of(req)
        nodes = self._plain_route(q, ids, now, user=self._user_angles(req))
        for nd in nodes:
            nd["keep"] = nd["state"] != "ended"
            nd["locked"] = nd["state"] == "ended"
        ahead = [nd for nd in nodes if nd["state"] in ("next", "upcoming")]
        line = None
        if now is not None:
            first = ahead[0] if ahead else None
            line = (f"It's {now.strftime('%H:%M')} · {len(ahead)} of {len(nodes)} stops still ahead" +
                    (f" · first one {first['time']}, {first['where']}" if first else ""))
        counts = Counter(nd["angle"] for nd in nodes)
        n_keep = sum(1 for nd in nodes if nd["keep"])
        return {"question": q["text"], "shared": True, "label": "Shared Arc",
                "tribe": self._tribe_of(self.question(req.get("question"))["text"]),
                "nodes": nodes, "counts": {a: counts.get(a, 0) for a in ANGLES}, "line": line,
                "pick": {"headline": "Pick what to keep.", "legend": ["Keep", "Skip", "Ended"],
                         "button": f"Add {n_keep} to my Arcs", "keep": n_keep},
                "result": "A new Arc with the sender's question (Q12).",
                "data_version": self.version,
                "note": "Your question and talks only. Never your name."}

    def summary(self, req):
        """13 list view (= K2 Summary): the Arc grouped by angle, with Heard / Next lines,
        and the reading list."""
        q = self._arc_question(req)
        ids = self._ids(req.get("ids"), "ids")
        heard = [self.items[i]["id"] for i in
                 self._ids((req.get("state") or {}).get("heard") or req.get("heard"), "heard")]
        nodes = self._plain_route(q, ids, self._now_of(req), heard, self._user_angles(req))
        pre = {"heard": "Heard", "next": "Next", "ended": "Missed", "upcoming": "", "read": ""}
        groups = {a: [] for a in ANGLES}
        for nd in nodes:
            groups[nd["angle"]].append({"id": nd["id"], "title": nd["title"], "badge": nd["badge"],
                                        "label": nd["label"], "state": nd["state"],
                                        "line": " · ".join(x for x in (pre[nd["state"]], nd["line"]) if x),
                                        "doi": nd["doi"], "why": nd["why"]["text"]})
        md = [f"# {q['text']}", ""]
        bib = []
        for a in ANGLES:
            if groups[a]:
                md.append(f"## {ANGLE_NAME[a]} {SYMBOL[a]}")
                for g in groups[a]:
                    md.append(f"- {g['title']}. CHI 2026. {g['doi']}")
                    key = re.sub(r"[^a-z]", "", g["title"].lower().split()[0]) + str(g["id"])
                    bib.append(f"@inproceedings{{{key},\n  title = {{{g['title']}}},\n  booktitle = "
                               f"{{Proceedings of the CHI Conference on Human Factors in Computing Systems}},\n"
                               f"  year = {{2026}},\n  doi = {{{(g['doi'] or '').replace('https://doi.org/', '')}}}\n}}")
                md.append("")
        out = {"question": q["text"],
               "groups": [{"key": a, "name": ANGLE_NAME[a], "symbol": SYMBOL[a], "count": len(groups[a]),
                           "items": groups[a]} for a in ANGLES],
               "counts": {a: len(groups[a]) for a in ANGLES},
               "heard": sum(1 for nd in nodes if nd["state"] == "heard"),
               "reading_list": {"markdown": "\n".join(md).strip(), "bibtex": "\n\n".join(bib)},
               "open": None}
        if not groups["challenge"]:
            out["open"] = {"text": NO_CHALLENGE["en"],
                           "follow_up": f"When does {q['x']} not {'reduce' if q['dir'] == '-' else 'raise'} "
                                        f"{q['y'] or 'it'}?" if q["kind"] == "relation" else None}
        return out

    # -- 20 / 21 home ------------------------------------------------------------------------
    def home(self, req):
        """My Arcs: each saved Arc with its tribe and when it is ("Today", "Wed",
        "Mon · all heard"). The app keeps the Arcs; it sends them here to label them."""
        arcs = req.get("arcs") or []
        if not isinstance(arcs, list):
            raise InputError('arcs must be a list of {"question", "ids", "heard"}')
        now = self._now_of(req)
        today = self._today(now)
        out = []
        for k, a in enumerate(arcs):
            if not isinstance(a, dict) or not a.get("question"):
                raise InputError(f"arcs[{k}] needs a question")
            q = self.question(a["question"])
            ids = self._ids(a.get("ids"), f"arcs[{k}].ids")
            heard = set(self._ids(a.get("heard"), f"arcs[{k}].heard"))
            score = self._rank(q["text"])
            pool = [int(i) for i in np.argsort(-score, kind="stable") if int(i) in self.alive_set][:20]
            tr = self._tribe(score, pool)
            days = sorted({s["start"][:10] for i in ids for s in self.arc.slots.get(i, [])[:1] if s["start"]})
            label = lambda d: _day_label(d).split()[0]
            later = [d for d in days if d > today]
            if ids and all(i in heard for i in ids):
                when = f"{label(days[-1] if days else today)} · all heard"
            elif today in days:
                when = "Today"
            else:
                when = label(later[0]) if later else (label(days[-1]) if days else "")
            # 20: Today / This week / After CHI (all heard, or its days are over)
            tab = "today" if today in days and not (ids and all(i in heard for i in ids)) \
                else "week" if later or (today in days) else "after"
            out.append({"question": q["text"],
                        "tribe": {x: tr[x] for x in ("name", "symbol", "shape", "color")} if tr else None,
                        "when": when, "tab": tab, "talks": len(ids), "heard": len(heard & set(ids))})
        return {"title": "My Arcs", "arcs": out,
                "empty": None if out else {"text": "Start with one question.", "button": "New Arc"},
                "buttons": ["New Arc", "CHI 101"]}

    # -- meta --------------------------------------------------------------------------------
    def meta(self, req):
        return {"tribes": self.tribes, "angles": [{"key": a, "name": ANGLE_NAME[a], "symbol": SYMBOL[a],
                                                    "help": HELP[a]} for a in ANGLES],
                "help_note": HELP_NOTE, "subtypes": SUBTYPE,
                "formats": [{"key": k, "types": v, "default": k in DEFAULT_FORMATS} for k, v in FORMATS.items()],
                "when": ["today", "tomorrow", "week"],
                "days": [{"day": d, "label": _day_label(d)} for d in self.arc.days],
                "data_version": self.version}

    # -- "Did you submit a paper?" ----------------------------------------------------
    def _authors(self):
        """Everyone on a CHI 2026 talk, by name: [(key words, name, affiliation, items)]."""
        if not hasattr(self, "_author_ix"):
            by = {}
            for i in sorted(self.alive_set):
                for a in self.items[i].get("authors") or []:
                    name = " ".join(str(a.get("name") or "").split())
                    if not name:
                        continue
                    key = name.lower()
                    if key not in by:
                        af = next((f["institution"] for f in a.get("affiliations") or [] if f.get("institution")), "")
                        by[key] = (_fold(name).split(), name, af, [])
                    if self.arc._canon(i) not in by[key][3]:
                        by[key][3].append(self.arc._canon(i))
            self._author_ix = sorted(by.values(), key=lambda a: a[1].lower())
        return self._author_ix

    def _paper_questions(self, i):
        """What one paper found, asked the way an attendee would, each side named two steps
        broader where the cards know how ("StepQuest" -> "health technology"): first its
        results with a direction ("Does X increase Y?"), then its other results ("How does X
        affect Y?"), then what the talk is about overall, until MINE_Q."""
        info = self.info.get(i) or {"cards": [], "val": {}, "up": {}, "about": {"f": [], "o": []}}

        def broad(p):
            u = info["up"].get(p)
            for lv in (1, 0):
                if u and u[lv]:
                    return self.phrases[u[lv][0]]
            return self.phrases[p]
        cands = []
        for directed in (True, False):
            for k, c in enumerate(info["cards"]):
                v = info["val"].get(k)
                if c["st"] != "result" or (v is not None and v[1] != 1):
                    continue
                if directed != (c["e"] in ("increase", "decrease")):
                    continue
                f, o = broad(c["f"]), broad(c["o"])
                if f == o:
                    continue
                text = (f"Does {f} {'increase' if c['e'] == 'increase' else 'reduce'} {o}?" if directed
                        else f"How does {f} affect {o}?")
                cands.append((text, self._sentence(i, c)))
        ab = info["about"]
        if ab["f"] and ab["o"]:
            cands.append((f"How does {self.phrases[ab['f'][0]]} affect {self.phrases[ab['o'][0]]}?", None))
        out, seen = [], set()
        for text, sent in cands:
            if text.lower() in seen or self.question(text)["kind"] != "relation":
                continue
            seen.add(text.lower())
            out.append({"question": text, "sentence": sent})
            if len(out) == MINE_Q:
                break
        return out

    def mine(self, req):
        """{"name": "..."}: the CHI 2026 authors whose names start that way, with their
        talks. {"paper": id}: questions from that paper's results; its Arc is then the
        "arc" screen with one of them and "mine": [the author's talk ids]."""
        if req.get("paper") is not None:
            i = self._ids([req["paper"]], "paper")[0]
            it = self.items[i]
            return {"paper": {"id": it["id"], "title": it["title"], "type": it["type"]},
                    "questions": self._paper_questions(i)}
        typed = _fold(str(req.get("name") or "")).split()
        if not typed or sum(len(w) for w in typed) < 2:
            raise InputError("name must have at least 2 letters")
        hits = [a for a in self._authors() if all(any(w.startswith(t) for w in a[0]) for t in typed)]
        hits.sort(key=lambda a: (a[0] != typed, a[1].lower()))
        return {"authors": [{"name": n, "affiliation": af,
                             "talks": [{"id": self.items[i]["id"], "title": self.items[i]["title"],
                                        "type": self.items[i]["type"]} for i in items]}
                            for _, n, af, items in hits[:MINE_K]],
                "more": max(0, len(hits) - MINE_K)}

    def handle(self, req):
        if not isinstance(req, dict):
            raise InputError("request must be a JSON object")
        screens = {"ask": self.ask, "angles": self.angles_screen, "arc": self.arc_screen,
                   "edit": self.edit, "node": self.node, "shared": self.shared, "summary": self.summary,
                   "home": self.home, "meta": self.meta, "hold": self.hold, "questions": self.questions,
                   "mine": self.mine}
        s = req.get("screen")
        if s not in screens:
            raise InputError(f"screen must be one of {', '.join(screens)}")
        return screens[s](req)


def _pair(topic):
    """"chatbots and mental health", "AI for learning" -> ("chatbots", "mental health");
    ("", "") when the topic names one thing or the second is who ("for blind users")."""
    m = re.match(r"^(.+?)\s+(?:and|for|vs|versus|on|&)\s+(.+)$", topic)
    if not m:
        return "", ""
    a, b = m.group(1).strip(), m.group(2).strip()
    if not content(a)[0] or not content(b)[0] or _W.findall(b)[-1] in PEOPLE:
        return "", ""
    return a, b


def _fold(s):
    """A name as typed and as printed meet: lower case, accents off ("Müller" = "muller")."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(re.findall(r"[a-z0-9]+", s))


def _short(t, n):
    return t if len(t) <= n else t[:n - 1] + "…"


def pretty(out, screen):
    """A terminal view of one response, laid out like its Figma screen."""
    L = []
    if "error" in out:
        return f"error: {out['error']}"
    if screen == "ask":
        tr = out["tribe"] or {}
        L.append(f"{out['kind'].upper()}  x={out['parsed']['x']!r}  y={out['parsed']['y']!r}  "
                 f"direction={out['parsed']['direction']}  tribe={tr.get('symbol', '')} {tr.get('name', '')}")
        if out.get("message"):
            L.append(out["message"])
        for sg in out["suggestions"]:
            c = sg["counts"]
            L.append(f"  • {sg['question']}   ↑{c['support']} ↻{c['reframe']} ⊣{c['challenge']}")
        if out.get("counts"):
            c = out["counts"]
            L.append(f"  around it now: ↑{c['support']} ↻{c['reframe']} ⊣{c['challenge']}")
    elif screen == "angles":
        L.append(out["headline"] + ("" if not out["asked"] else f"   (from {out['asked']!r})"))
        for a in out["angles"]:
            chips = "  ".join(("[✓ " if c["selected"] else "[  ") + f"{c['label']} · {c['talks']}]" for c in a["chips"])
            L.append(f"  {a['symbol']} {a['name']:<10} {chips or (a['empty'] or {}).get('en', '')}")
    elif screen == "arc":
        tr = out["tribe"]
        L.append(out["loading"]["text"])
        L.append(f"YOU'RE IN {tr['name']} {tr['symbol']} · {tr['look_for']}")
        L.append(f"{out['question']}   {out['summary_line']}   {', '.join(out['days'])}")
        for nd in out["nodes"]:
            fold = " (in +N)" if nd["bundled"] else ""
            L.append(f"  {nd['symbol']} {nd['subtype_label']:<12} {_short(nd['label'], 28):<28} "
                     f"{nd['line']:<22} {nd['state']}{fold}")
        for a, b in out["bundles"].items():
            L.append(f"  {A_SYM(a)} {b['label']} · {b['text']}")
        if out["next"]:
            L.append(f"NEXT CARD  {out['next']['label']} · {out['next']['line']}"
                     + (f" · {out['next']['walk']}" if out["next"]["walk"] else ""))
        if out["empty"].get("challenge"):
            L.append(f"⊣ {out['empty']['challenge']['en']}")
    elif screen == "edit":
        L.append(f"{out['title']}  ({out['mode']}, filter {out['filter']})   filters: "
                 + " · ".join(f"{f['symbol']} {f['label']}" for f in out["filters"]))
        for c in out["cards"]:
            mark = (c.get("symbol") or " ") + (" ✦" if c["debut"] else "  ")
            clash = f"   ⚠ {c['clash']['text']}" if c["clash"] else ""
            L.append(f"  {mark} {_short(c['title'], 46):<46} {c['line']}{clash}")
            if c.get("reason"):
                L.append(f"       {c['reason']}")
    elif screen == "node":
        L.append(f"[{out['symbol']} {out['angle_name']}] [{out['format_label']}]  {out['title']}")
        L.append(out["why_label"])
        sen = out["why"]["sentence"]
        if sen:
            t = sen["text"]
            for a, b in reversed(sen["highlight"]):
                t = t[:a] + "_" + t[a:b] + "_" + t[b:]
            L.append(f"  “{t}”")
        if out["why"].get("caveat"):
            L.append(f"  but: “{out['why']['caveat']['text']}”")
        L.append(f"  {out['when_line']}")
        fa = out["first_author"]
        if fa:
            L.append(f"  {fa['name']} · {fa['institution']}" + (f"  ✦ {fa['badge']}" if fa["badge"] else ""))
        L.append(f"Questions ({len(out['questions'])} to start with)")
        for x in out["questions"]:
            L.append(f"  • {x['text']}")
    elif screen == "shared":
        L.append(f"{out['label']} · {out['question']}   {out['line'] or ''}")
        for nd in out["nodes"]:
            mark = "ended, locked" if nd["locked"] else "keep"
            L.append(f"  {nd['symbol']} {_short(nd['label'], 28):<28} {nd['line']:<22} {mark}")
        L.append(f"[ {out['pick']['button']} ]   {out['note']}")
    elif screen == "summary":
        L.append(out["question"])
        for g in out["groups"]:
            L.append(f"  {g['symbol']} {g['name']} · {g['count']}")
            for x in g["items"]:
                L.append(f"      {_short(x['title'], 50):<50} {x['line']}")
        if out["open"]:
            L.append(f"  Still open: {out['open']['text']}  → {out['open']['follow_up']}")
    elif screen == "home":
        L.append(out["title"])
        for a in out["arcs"]:
            tr = a["tribe"] or {}
            L.append(f"  {tr.get('symbol', ' ')} {tr.get('name', ''):<22} {_short(a['question'], 44):<44} {a['when']}")
        if out["empty"]:
            L.append(f"  {out['empty']['text']}   [ {out['empty']['button']} ]")
    else:
        return json.dumps(out, ensure_ascii=False, indent=1)
    return "\n".join(L)


def A_SYM(a):
    return SYMBOL[a]


def main():
    args = [a for a in sys.argv[1:] if a != "--pretty"]
    show = "--pretty" in sys.argv[1:]
    eng = Angles()
    if args:
        reqs = [json.loads(args[0])]
    elif not sys.stdin.isatty():
        reqs = [json.loads(sys.stdin.read())]
    else:
        reqs = None
    if reqs is None:
        while True:
            try:
                line = input("question> ").strip()
            except EOFError:
                return
            if not line:
                continue
            out = eng.handle({"screen": "arc", "question": line})
            for nd in out["nodes"]:
                print(f"  {nd['symbol']} {nd['subtype_label']:<13} {nd['label']:<28} {nd['line']}")
        return
    try:
        out = eng.handle(reqs[0])
        print(pretty(out, reqs[0].get("screen")) if show else json.dumps(out, ensure_ascii=False, indent=1))
    except InputError as e:
        print(f"error: {e}" if show else json.dumps({"error": str(e)}))
        sys.exit(2)


if __name__ == "__main__":
    main()
