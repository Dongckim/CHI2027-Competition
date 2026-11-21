// Arc engine in the browser or Node: the same requests and responses as angles.py.
// The user's question in the middle, CHI talks around it as Support, Reframe or
// Challenge, decided from finding cards made offline (angles.json) and the 8 MB encoder.
//
//   const eng = await loadAngles(base);         // load.mjs
//   const out = await eng.handle({screen: "arc", question: "Does VR fidelity really raise presence?", days: ["tue"]});
import { InputError, Counter, DT, dayLabel, argsortDesc, sortedBy, maxBy, minBy, pyDumps, pyStr, pyInt, pyRound, truthy, unique } from "./py.mjs";
import { ARC } from "./arc.mjs";
import { nonLatin } from "./retriever.mjs";

// Figma "final" 09 What: Talks · Posters · Demos · Panels · SIGs (default the first three)
const FORMATS = {
  talks: ["Paper", "Journals"], posters: ["Posters", "Student Research Competition"],
  demos: ["Interactive Demos"], panels: ["Panels"], sigs: ["Meet-Ups"],
  workshops: ["Workshop"], keynotes: ["Plenary and Keynote"],
};
const FORMAT_ALIAS = { papers: "talks", paper: "talks", talk: "talks", poster: "posters", demo: "demos",
  panel: "panels", sig: "sigs", "meet-ups": "sigs", meetups: "sigs", "meet-up": "sigs", meetup: "sigs",
  workshop: "workshops", keynote: "keynotes" };
const DEFAULT_FORMATS = ["talks", "posters", "demos"];
const NO_FINDINGS = new Set(["Interactive Demos", "Panels", "Meet-Ups", "Workshop", "Plenary and Keynote",
  "Student Mentoring Program", "SIGCHI Awards"]);
export const ANGLES = ["support", "reframe", "challenge"];
export const SYMBOL = { support: "↑", reframe: "↻", challenge: "⊣" };
// Figma "final" Q1: Supports · Reframes · Challenges
const ANGLE_NAME = { support: "Supports", reframe: "Reframes", challenge: "Challenges" };
// the ? sheet (Figma "final" 22)
const HELP = {
  support: { en: "Same question, same finding.", ko: "같은 질문을 연구했고, 같은 쪽 결과를 냈어요." },
  reframe: { en: "Same question through a different factor, measure, or group.",
             ko: "같은 질문을 다른 요인, 다른 측정, 다른 사람으로 본 연구예요." },
  challenge: { en: "Same question, a different finding. Not a verdict on the paper.",
               ko: "같은 질문인데 결과가 달라요. 논문이 틀렸다는 뜻은 아니에요." },
};
const HELP_NOTE = { en: "Read from each paper’s abstract.", ko: "각 논문의 초록에서 읽었어요." };
const SUBTYPE = { evidence: "Evidence", try: "Try it", null: "Null result", opposite: "Opposite",
  only_when: "Only when", factor: "Other factor", measure: "Other measure",
  people: "Other people", related: "Same subject" };
// Figma "final" 23
const NO_CHALLENGE = { en: "No clear clash at CHI this year.", ko: "이번 CHI에서 뚜렷한 엇갈림을 찾지 못했어요." };
// 07: a question CHI may not cover, or one not in English (team PDF Q21)
const OFF_TOPIC = { en: "CHI may not cover this. Try a question about people and technology.",
  ko: "CHI에서 다루지 않는 주제일 수 있어요. 사람과 기술에 관한 질문으로 바꿔 보세요." };
const ENGLISH_ONLY = { en: "ARC reads English questions for now.", ko: "지금은 영어 질문만 읽을 수 있어요." };
// acronyms the phrase table keeps in lower case ("wayfinding in vr"), upper case on screen
const ACRONYMS = "vr ar xr mr ai llm ui ux hci bci eeg ecg emg gpt vlm nlp iot adhd asd lgbtq hmd gui cscw ml 2d 3d";
const ACRONYM_RE = new RegExp(`\\b(${ACRONYMS.split(" ").join("|")})(s?)\\b`, "g");
export const show = (s) => s.replace(ACRONYM_RE, (m, a, z) => a.toUpperCase() + z);
const COLOR_NAME = { "#9B6BFF": "purple", "#4C7DFF": "blue", "#2FBF71": "green", "#FF6B6B": "coral",
  "#FFC234": "yellow", "#FF7AC6": "pink", "#19C3D6": "teal", "#E6E6E6": "white" };
const CHIPS_K = 3;
const CHIPS_ON = { support: 2, reframe: 2, challenge: 1 };
const MAP_CAP = 3;
const EDIT_K = 6;
const VISIT_MIN = 20;
const FORMAT_LABEL = { PAPER: "Paper talk", POSTER: "Poster", DEMO: "Demo", PANEL: "Panel",
  MEETUP: "SIG & meetup", KEYNOTE: "Keynote", WORKSHOP: "Workshop" };
const EFFECTS = ["increase", "decrease", "no_effect", "mixed", "associated"];
const STATUS = ["result", "claim", "prior", "aim"];
export const P = { JUDGE_N: 40, POOL: 200, SIZE: 7, MAX_READ: 2, GAP_MIN: 5, CALM_GAP: 10, HOLD_K: 3, HOLD_WIN: 90, HOLD_MORE: 30,
                   THEME_COS: 0.45, CLOSE_COS: 0.50,
                   MATCH: 0.70, STRICT: 0.80, COS_LO: 0.45, COS_HI: 0.80, CLAIM_W: 0.95, GEN_W: 0.95, ABOUT_W: 0.9, UP_W1: 0.8, UP_W2: 0.75,
                   NEAR_SCORE: 1.5, NEAR_TOP: 5, NEAR_CONF: 0.2, TOPIC_CONF: 0.1 };

const set = (s) => new Set(s.split(/\s+/).filter(Boolean));
// 09 "How you walk"
const WALK = ["calm", "step_free"];
// 14d: words too plain to name a theme ("Would the same strategies work ...")
const PLAIN = set(`over same work more less much many way thing things get got let make made do does did use used
change happen hold still also really kind lot part case need want try think know see say before after`);
// 07: words that say how one asks, not what about ("What is X research asking now?")
const VAGUE = set("research study studies ask asking now today current recent new chi conference talk talks paper papers");
// lemma -> the word as first written ("nophysic" -> "no-physics")
function surfaceOf(texts) {
  const out = new Map();
  for (const t of texts) {
    for (let w of findW(t.toLowerCase().replace(/’/g, "'"))) {
      w = w.endsWith("'s") ? w.slice(0, -2) : w.replace(/'+$/, "");
      if (w && !out.has(lemma(w))) out.set(lemma(w), w);
    }
  }
  return out;
}
const weekday = (d) => dayLabel(d, false).split(" ")[0];
const W_RE = () => /[a-z0-9]+(?:[-'][a-z0-9]+)*/g;
const findW = (s) => s.match(W_RE()) || [];
const STOPW = set(`a an the and or but of to in on at by for with from into onto about as is are was
were be been being do does did can could would should may might will shall it its this that these
those their them they we our us you your i my me his her he she one ones how what when where why
which who whom whose than then so such very really actually truly even always also just only own
via per vs versus`);
const GENERIC = set(`sense level levels degree degrees feeling feelings perceived perception perceptions
extent amount amounts overall rate rates score scores user users' people's participants' self-reported
reported subjective objective general`);
const DEGREE_UP = set("more higher greater increased increasing longer high better larger stronger");
const DEGREE_DOWN = set(`less lower fewer decreased decreasing reduced reducing shorter low worse lack
without absence no smaller weaker`);
const NEG_OUTCOME = set(`stress anxiety workload load fatigue error errors sickness cybersickness discomfort
burden frustration loneliness isolation harm harms risk risks bias biases pain distraction confusion
abandonment dropout overreliance over-reliance dependence misinformation harassment toxicity`);
const PEOPLE = set(`people users user adults adult children child kids students student teachers workers
designers developers programmers clinicians patients parents families older blind deaf communities
community individuals participants learners players members viewers readers writers`);
const POSV = ["raise", "increase", "improve", "enhance", "boost", "strengthen", "foster", "promote",
  "facilitate", "encourage", "empower", "support", "help", "benefit", "lead to", "cause",
  "speed up", "deepen", "make"];
const NEGV = ["reduce", "decrease", "lower", "hurt", "harm", "undermine", "impair", "hinder", "diminish",
  "worsen", "weaken", "erode", "limit", "slow down", "lessen", "damage", "threaten"];
const NEUV = ["affect", "influence", "change", "shape", "impact", "relate to", "predict", "matter for",
  "alter", "modulate", "determine", "drive"];
const PSYCH = { trust: "trust", use: "use", adopt: "adoption", prefer: "preference", accept: "acceptance",
  like: "liking", enjoy: "enjoyment", value: "value", "rely on": "reliance", "benefit from": "benefit",
  "gain from": "benefit", "learn from": "learning", "engage with": "engagement" };
const POS_ADJ = set("faster easier better safer quicker clearer stronger more");
const NEG_ADJ = set("slower harder worse riskier weaker less");
const SPLIT_PREP = [" in ", " on ", " for ", " among ", " during ", " within ", " across ", " at ", " over time"];
const WH = ["what", "which", "who", "where", "when", "why", "how", "is there", "are there"];
// verbs that are also nouns ("emotional support from ...", "creativity support tools make ...")
const NOUN_VERBS = new Set(["support", "supports", "help", "helps", "impact", "impacts", "influence", "influences",
                            "change", "changes", "shape", "shapes"]);
const NOUN_PREP = new Set(["from", "for", "of", "by", "with", "in", "on", "during"]);

const byLenThenText = (a, b) => (b.length - a.length) || (a < b ? -1 : a > b ? 1 : 0);

function forms(v) {
  const sp = v.indexOf(" ");
  const head = sp < 0 ? v : v.slice(0, sp);
  const tail = sp < 0 ? "" : " " + v.slice(sp + 1);
  const out = new Set([head, head + "s", head + "es", head + "d", head + "ed"]);
  if (head.endsWith("y")) { out.add(head.slice(0, -1) + "ies"); out.add(head.slice(0, -1) + "ied"); }
  if (head.endsWith("e")) out.add(head + "s");
  return [...out].map((f) => f + tail).sort(byLenThenText);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function alt(verbs) {
  const fs = new Set();
  for (const v of verbs) for (const f of forms(v)) fs.add(f);
  return [...fs].sort(byLenThenText).map(esc).join("|");
}
const VERB_DIR = new Map();
for (const v of POSV) for (const f of forms(v)) VERB_DIR.set(f, "+");
for (const v of NEGV) for (const f of forms(v)) VERB_DIR.set(f, "-");
for (const v of NEUV) for (const f of forms(v)) VERB_DIR.set(f, "?");
const PSYCH_FORM = new Map();
for (const [v, n] of Object.entries(PSYCH)) for (const f of forms(v)) PSYCH_FORM.set(f, n);
const AUX = "(?:does|do|did|can|could|will|would|might|may|is|are|was|were|should|has|have)";
const ADV = "(?:(?:really|actually|truly|even|always|necessarily|significantly|still|ever|in fact)\\s+)*";
const VERBS = alt([...POSV, ...NEGV, ...NEUV]);
const RE_YESNO = new RegExp(`^${AUX}\\s+(?<x>.+?)\\s+${ADV}(?<v>${VERBS})\\s+(?<y>.+)$`);
const RE_HOW = new RegExp(`^(?:how|in what ways?|to what extent|when|why|under what conditions)\\s+`
  + `(?:much\\s+)?${AUX}\\s+(?<x>.+?)\\s+${ADV}(?<v>${VERBS})\\s+(?<y>.+)$`);
const RE_EFFECT = /^(?:what\s+(?:is|are)\s+)?(?:the\s+)?(?:effects?|impacts?|influence|role|consequences?)\s+of\s+(?<x>.+?)\s+(?:on|in|for)\s+(?<y>.+)$/;
const RE_PSYCH = new RegExp(`^${AUX}\\s+(?<p>.+?)\\s+${ADV}(?<v>${alt(Object.keys(PSYCH))})\\s+(?<x>.+)$`);

const LEMMA = { usage: "use", utilization: "use", utilisation: "use" };

export function lemma(w) {
  if (w.includes("-") && w.length > 4) w = w.replaceAll("-", "");
  if (Object.hasOwn(LEMMA, w)) return LEMMA[w];
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !["ss", "us", "is", "'s"].some((s) => w.endsWith(s))) return w.slice(0, -1);
  return w;
}

const pyStrip = (s, chars) => {
  let a = 0, b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
};

export function content(text) {
  const toks = findW(text.toLowerCase().replaceAll("’", "'"));
  const neg = toks.some((t) => DEGREE_DOWN.has(t));
  const out = [];
  for (let t of toks) {
    t = t.endsWith("'s") ? t.slice(0, -2) : pyStrip(t, "'");
    if (STOPW.has(t) || GENERIC.has(t) || DEGREE_UP.has(t) || DEGREE_DOWN.has(t) || !t) continue;
    out.push(lemma(t));
  }
  return [out, neg];
}

const SUFFIX = ["ations", "ation", "itions", "ition", "ions", "ion", "ments", "ment", "ness", "ities",
  "ity", "ing", "ed", "ures", "ure", "ive", "iv", "at", "al", "is", "e"];

export function stem(w) {
  for (let r = 0; r < 2; r++) {
    const suf = SUFFIX.find((s) => w.length - s.length >= 4 && w.endsWith(s));
    if (suf === undefined) break;
    w = w.slice(0, -suf.length);
  }
  return w;
}

export function same(a, b) {
  return a === b || stem(a) === stem(b) || (a.length >= 5 && b.endsWith(a)) || (b.length >= 5 && a.endsWith(b));
}

function clean(s) {
  s = pyStrip(s.trim(), " ?.!,;:");
  s = s.replace(/^(?:the|a|an)\s+/, "");
  return s.trim();
}

function splitCtx(phrase) {
  const low = ` ${phrase} `;
  const cut = SPLIT_PREP.map((p) => low.indexOf(p)).filter((k) => k > 0);
  if (!cut.length) return [phrase, ""];
  const k = Math.min(...cut);
  const rest = low.slice(k).trim();
  return [low.slice(0, k).trim(), rest.includes(" ") ? rest.slice(rest.indexOf(" ") + 1) : ""];
}

function possessive(phrase) {
  const p = phrase.replaceAll("’", "'");
  const m = /^(.+?)(?:'s|s')\s+(.+)$/s.exec(p);
  if (m && m[1].split(/\s+/).filter(Boolean).length <= 3 && !` ${m[1]} `.includes(" of ")) {
    const owner = m[1] + (p.slice(m[1].length).startsWith("s'") ? "s" : "");
    return [m[2], owner];
  }
  return [phrase, ""];
}

const PEOPLE_ONLY = new Set(["people", "users", "user", "humans", "individuals", "person", "persons"]);

// "help blind users browse the web faster" -> outcome "web browsing speed": what people do,
// said as the outcome a paper would measure (verbs that are never nouns, so "sleep quality" stays)
const DOING = new Map(Object.entries({ browse: "browsing", write: "writing", navigate: "navigation", perform: "performance",
  learn: "learning", read: "reading", collaborate: "collaboration", communicate: "communication",
  understand: "understanding", remember: "memory", explore: "exploration", create: "creation", express: "expression",
  decide: "decision making", draw: "drawing", speak: "speaking", listen: "listening", cope: "coping",
  engage: "engagement", participate: "participation", interact: "interaction", teach: "teaching",
  reflect: "reflection", ideate: "ideation", walk: "walking", connect: "connection", "focus on": "focus" }));
const STATE = new Map(Object.entries({ lonely: "loneliness", motivated: "motivation", engaged: "engagement",
  confident: "confidence", anxious: "anxiety", productive: "productivity", efficient: "efficiency",
  efficiently: "efficiency", creative: "creativity", satisfied: "satisfaction", aware: "awareness", safe: "safety",
  safer: "safety", stressed: "stress", connected: "connectedness", happy: "happiness", happier: "happiness",
  healthy: "health", healthier: "health", accurate: "accuracy", accurately: "accuracy", faster: "speed",
  quicker: "speed", quickly: "speed", slower: "speed", independent: "independence", immersed: "immersion",
  isolated: "isolation", comfortable: "comfort", included: "inclusion" }));
const LINK = set("feel become be get stay are is");
const DET = set("the a an their his her its our my your better more well");

// a verb phrase outcome as a noun phrase: -> [outcome, people in front, flips direction]
function doing(y) {
  let toks = y.split(/\s+/).filter(Boolean);
  if (toks.slice(0, 3).join(" ") === "come up with") return ["ideation", "", false];
  let people = "";
  // "learners more motivated", "surgeons perform better": the people, then what they do
  if (toks.length >= 2 && (PEOPLE.has(toks[0]) || toks[0].endsWith("s")) &&
      (DOING.has(toks[1]) || LINK.has(toks[1]) || toks[1] === "more" || toks[1] === "less")) {
    people = toks[0];
    toks = toks.slice(1);
  }
  if (toks.length && LINK.has(toks[0])) toks = toks.slice(1);
  let state = null, flip = false;
  if (toks.length && STATE.has(toks[toks.length - 1])) {
    const w = toks.pop();
    state = STATE.get(w);
    flip = w === "slower";
    if (toks.length && ["more", "less", "fewer"].includes(toks[toks.length - 1])) flip = flip !== (toks.pop() !== "more");
    // "people happier": who, then the state
    if (toks.length && !people && toks.every((w) => PEOPLE.has(w))) { people = toks.join(" "); toks = []; }
  } else if (toks.length && ["better", "well", "more"].includes(toks[toks.length - 1])) toks.pop();
  const verb = [...DOING.keys()].find((v) => toks.slice(0, v.split(" ").length).join(" ") === v) ?? null;
  if (verb === null && state === null && !people) return [y, "", false];
  if (verb !== null) {
    const obj = toks.slice(verb.split(" ").length).filter((w) => !DET.has(w));
    const l = obj.length ? obj[obj.length - 1] : "";
    if (l.length > 3 && l.endsWith("s") && !l.endsWith("ss")) obj[obj.length - 1] = l.slice(0, -1);
    toks = [...obj, DOING.get(verb)];
  } else toks = toks.filter((w) => !DET.has(w));
  return [[...toks, ...(state ? [state] : [])].join(" "), people, flip];
}

export function parseQuestion(text) {
  const raw = pyStr(text).split(/\s+/u).filter(Boolean).join(" ");
  let low = pyStrip(raw.toLowerCase().replaceAll("’", "'").trim(), "?.! ");
  low = low.replace(/^(?:i wonder |i want to know |i'm curious |i am curious )(?:if |whether |how )?/, "");
  low = low.replace(/^(?:whether|if)\s+/, "does ");
  const out = { kind: "", x: "", y: "", dir: "?", ctx: "", verb: "", text: raw };
  let m = RE_PSYCH.exec(low);
  if (m && !RE_YESNO.exec(low)) {
    let x = clean(m.groups.x), ctx;
    const people = clean(m.groups.p);
    [x, ctx] = splitCtx(x);
    Object.assign(out, { kind: "relation", x, y: PSYCH_FORM.get(m.groups.v), dir: "+", verb: m.groups.v,
                         ctx: [people, ctx].filter(Boolean).join(" ") });
    return out;
  }
  low = low.split(/,?\s+(?:and|or|but)\s+(?:when|how|why|does|do|is)\s/)[0];
  m = RE_YESNO.exec(low) || RE_HOW.exec(low);
  if (m) {
    let v = m.groups.v;
    let x = clean(m.groups.x), y = clean(m.groups.y);
    for (;;) {
      const ws = y.split(/\s+/).filter(Boolean);
      const firstW = ws[0] || "";
      const rest = y.includes(" ") ? y.slice(y.indexOf(" ") + 1) : "";
      const two = ws.slice(0, 2).join(" ");
      const nxt = VERB_DIR.has(two) ? two : (VERB_DIR.has(firstW) ? firstW : null);
      if (!nxt || !rest) break;
      x = `${x} ${v}`;
      v = nxt;
      y = clean(y.slice(nxt.length));
    }
    // ... or a noun, with the real verb a few words on
    if (NOUN_VERBS.has(v.split(" ")[0])) {
      const ys = y.split(/\s+/).filter(Boolean);
      for (let j = 1; j < Math.min(ys.length, 6); j++) {
        const two = ys.slice(j, j + 2).join(" ");
        const nxt = VERB_DIR.has(two) ? two : (VERB_DIR.has(ys[j]) ? ys[j] : null);
        if (nxt && j + nxt.split(" ").length < ys.length &&
            (NOUN_PREP.has(ys[0]) || (j === 1 && v.startsWith("support") && !PEOPLE.has(ys[0])))) {
          x = `${x} ${v} ${ys.slice(0, j).join(" ")}`;
          v = nxt;
          y = clean(ys.slice(j + nxt.split(" ").length).join(" "));
          break;
        }
      }
    }
    if (["help", "helps", "helped", "support", "supports"].includes(v.split(" ")[0])) {
      y = y.replace(/^(?:with|to|in)\s+/, "");
      const hp = y.split(/\s+/).filter(Boolean);
      if (hp.length >= 2 && PEOPLE.has(hp[0]) && !PEOPLE.has(hp[hp.length - 1])) {
        let k = 1;
        while (k < hp.length - 1 && PEOPLE.has(hp[k])) k++;
        out.ctx_people = hp.slice(0, k).join(" ");
        y = hp.slice(k).join(" ");
      }
      // "help people reduce stress": the verb after the people gives the direction
      const yh = y.split(/\s+/).filter(Boolean);
      const two = yh.slice(0, 2).join(" ");
      const nxt = VERB_DIR.has(two) ? two : (VERB_DIR.has(yh[0] || "") ? yh[0] : null);
      if (nxt && y.slice(nxt.length).trim()) {
        v = nxt;
        y = clean(y.slice(nxt.length));
      }
    }
    let d = VERB_DIR.get(v) ?? "?";
    // "make target selection faster" keeps its own reading below
    const yw = y.split(/\s+/).filter(Boolean);
    const made = v.startsWith("make") && yw.length > 0 && (POS_ADJ.has(yw[yw.length - 1]) || NEG_ADJ.has(yw[yw.length - 1]));
    let people = "", flip = false;
    if (!made) [y, people, flip] = doing(y);
    if (people) out.ctx_people = [out.ctx_people || "", people].filter(Boolean).join(" ");
    if (flip && (d === "+" || d === "-")) d = d === "+" ? "-" : "+";
    if (v.startsWith("make")) {
      const ym = y.split(/\s+/).filter(Boolean);
      // "make people feel safer": the state is the outcome, the people its context
      if (ym.length >= 2 && STATE.has(ym[ym.length - 1]) && ym.slice(0, -1).every((w) => PEOPLE.has(w) || LINK.has(w))) {
        const who = ym.slice(0, -1).filter((w) => !LINK.has(w)).join(" ");
        out.ctx_people = [out.ctx_people || "", who].filter(Boolean).join(" ");
        d = NEG_ADJ.has(ym[ym.length - 1]) ? "-" : "+";
        y = STATE.get(ym[ym.length - 1]);
      }
      const ys = y.split(/\s+/).filter(Boolean);
      const last = ys.length ? ys[ys.length - 1] : "";
      if (POS_ADJ.has(last) || NEG_ADJ.has(last)) {
        d = POS_ADJ.has(last) ? "+" : "-";
        y = ys.slice(0, -1).join(" ");
      }
      const ys2 = y.split(/\s+/).filter(Boolean);
      if (ys2.length && (ys2[ys2.length - 1] === "more" || ys2[ys2.length - 1] === "less")) y = ys2.slice(0, -1).join(" ");
    }
    const starts = (pre) => pre.some((p) => low.startsWith(p));
    if (starts(["how", "in what way", "to what extent", "when", "why", "under what"]) && d !== "-") {
      d = starts(["how", "in what", "to what"]) ? "?" : d;
    }
    let ctxY, owner, ctxX;
    [y, ctxY] = splitCtx(y);
    [y, owner] = possessive(y);
    [x, ctxX] = splitCtx(x);
    const cp = out.ctx_people || "";
    delete out.ctx_people;
    let ctx = [cp, owner, ctxY, ctxX].filter(Boolean).join(" ");
    const yc = findW(y);
    if (yc.length && (PEOPLE.has(yc[yc.length - 1]) || PEOPLE.has(yc[yc.length - 1] + "s"))) {
      ctx = [y, ctx].filter(Boolean).join(" ");
      y = "";
    }
    if (findW(ctx).every((w) => PEOPLE_ONLY.has(w))) ctx = "";
    Object.assign(out, { kind: "relation", x, y, dir: d, ctx, verb: v });
    if (low.startsWith("when")) out.conditional = true;
    return out;
  }
  m = RE_EFFECT.exec(low);
  if (m) {
    const [y, ctx] = splitCtx(clean(m.groups.y));
    Object.assign(out, { kind: "relation", x: clean(m.groups.x), y, ctx, verb: "effect of" });
    return out;
  }
  out.kind = (raw.endsWith("?") || WH.some((w) => low.startsWith(w))) ? "open" : "topic";
  out.x = clean(low);
  return out;
}

const hhmm = (iso) => (iso ? iso.slice(11, 16) : null);
const T = (iso) => DT.parse(iso);
const RELATED = () => ({ angle: "reframe", subtype: "related", conf: 0.0, card: null, caveat: null });

export class Angles {
  /** pkg: loadPackage(...) plus angles (angles.json) and phraseEmb ({data, n, d}) */
  constructor(pkg, arc = null) {
    this.arc = arc || new ARC(pkg);
    const a = this.arc;
    this.items = a.items;
    this.ex = a.ex;
    this.pos = new Map(this.items.map((it, i) => [it.id, i]));
    this.aliveSet = new Set(a.alive);
    const d = pkg.angles;
    this.version = d.version;
    this.tribes = d.tribes;
    this.phrases = d.phrases;
    const { data, n, d: D } = pkg.phraseEmb;
    this.D = D;
    this.pvec = new Float64Array(n * D);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < D; k++) s += data[i * D + k] * data[i * D + k];
      const nrm = Math.max(Math.sqrt(s), 1e-9);
      for (let k = 0; k < D; k++) this.pvec[i * D + k] = data[i * D + k] / nrm;
    }
    const pc = this.phrases.map((p) => content(p));
    this.ptoks = pc.map((c) => c[0]);
    this.pneg = pc.map((c) => c[1]);
    this.info = new Map();
    for (const [xid, rec] of Object.entries(d.items)) {
      const i = this.pos.get(+xid);
      if (i === undefined) continue;
      const cards = rec.cards.map((c) => ({ f: c[0], o: c[1], p: c[2], e: EFFECTS[c[3]], st: STATUS[c[4]],
                                            s: [c[5], c[6]], fs: [c[7], c[8]], os: [c[9], c[10]] }));
      const meas = (rec.measures || []).map((m) => ({ c: m[0], s: [m[1], m[2]], cs: [m[3], m[4]] }));
      const about = rec.about || [[], [], []];
      this.info.set(i, { label: rec.label, contribution: rec.contribution, tribe: rec.tribe, cards, measures: meas,
                         gen: new Map((rec.gen || []).map((g) => [g[0], g[1]])),
                         claims: new Map((rec.claims || []).map((c) => [c[0], [c[1], c[2]]])),
                         up: new Map((rec.up || []).map((u) => [u[0], [u[1], u[2]]])),
                         about: { f: about[0], o: about[1], p: about[2] },
                         debut: new Set(rec.debut || []), first_debut: Boolean(rec.first_debut) });
    }
    for (let i = 0; i < this.items.length; i++) {
      if (!this.info.has(i) && this.ex.dup[i]) {
        const j = a._canon(i);
        if (this.info.has(j)) this.info.set(i, this.info.get(j));
      }
    }
    this._abs = new Map();
  }

  // -- text helpers ---------------------------------------------------------
  _absset(i) {
    if (!this._abs.has(i)) {
      const it = this.items[i];
      this._abs.set(i, new Set(findW((it.title + " " + it.abstract).toLowerCase()).map(lemma)));
    }
    return this._abs.get(i);
  }

  async _phrase(text) {
    if (!text) return null;
    const [toks, neg] = content(text);
    if (!toks.length) return null;
    const e = await this.arc._embed(text);
    let s = 0;
    for (const x of e) s += x * x;
    const nrm = Math.max(Math.sqrt(s), 1e-9);
    const vec = Float64Array.from(e, (x) => x / nrm);
    return { text, toks, neg, vec };
  }

  _pm(q, pi, absset) {
    if (q === null || pi < 0) return 0.0;
    const ct = this.ptoks[pi];
    if (!ct.length) return 0.0;
    const qt = q.toks;
    const head = qt[qt.length - 1];
    let lex = 0.0;
    const where = [];
    ct.forEach((w, k) => { if (same(head, w)) where.push(k); });
    if (where.length) {
      const mods = qt.slice(0, -1).filter((w) => !same(head, w) && !PEOPLE.has(w) && !PEOPLE.has(w + "s"));
      let cov = 1.0;
      if (mods.length) {
        let sum = 0;
        for (const w of mods) sum += ct.some((c) => same(w, c)) ? 1.0 : (absset.has(w) ? 0.75 : 0.0);
        cov = sum / mods.length;
      }
      const base = where[where.length - 1] === ct.length - 1 ? 0.6 : 0.5;
      lex = base + 0.4 * cov;
    } else {
      let hit = 0;
      for (const w of qt) if (ct.some((c) => same(w, c))) hit += 1;
      lex = 0.3 * hit / qt.length;
    }
    let cos = 0;
    const o = pi * this.D;
    for (let k = 0; k < this.D; k++) cos += q.vec[k] * this.pvec[o + k];
    const sem = Math.min(1.0, Math.max(0.0, (cos - P.COS_LO) / (P.COS_HI - P.COS_LO)));
    return pyRound(Math.max(lex, sem), 3);
  }

  _pmg(q, pi, info, absset) {
    let best = this._pm(q, pi, absset);
    for (const t of info.gen.get(pi) || []) {
      if (best >= 1.0) break;
      best = Math.max(best, pyRound(P.GEN_W * this._pm(q, t, absset), 3));
    }
    return best;
  }

  _up(q, pi, info, absset) {
    let best = 0.0;
    const [l1, l2] = info.up.get(pi) || [[], []];
    for (const t of l1) best = Math.max(best, pyRound(P.UP_W1 * this._pm(q, t, absset), 3));
    for (const t of l2) best = Math.max(best, pyRound(P.UP_W2 * this._pm(q, t, absset), 3));
    return best;
  }

  _about(q, ids, absset) {
    let best = 0.0;
    for (const t of ids) best = Math.max(best, pyRound(P.ABOUT_W * this._pm(q, t, absset), 3));
    return best;
  }

  _inAbs(q, absset) {
    if (q === null) return false;
    const h = q.toks[q.toks.length - 1];
    for (const w of absset) if (same(h, w)) return true;
    return false;
  }

  // -- the question -----------------------------------------------------------
  async question(text) {
    text = truthy(text) ? pyStr(text).trim() : "";
    if (!text) throw new InputError("question must not be empty");
    // typos against the program's own words ("hapitc" -> "haptic"), as the retriever does
    const fixed = this.arc.ex.speller.fix(text);
    const q = parseQuestion(fixed);
    q.corrected = fixed !== text ? fixed : null;
    q.X = q.kind === "relation" ? await this._phrase(q.x) : null;
    q.Y = q.kind === "relation" ? await this._phrase(q.y) : null;
    q.C = q.ctx ? await this._phrase(q.ctx) : null;
    if (q.kind === "relation" && q.X === null) q.kind = "topic";
    return q;
  }

  async _rank(text) {
    return this.arc._score({ research: text, keywords: [], topics: [] });
  }

  // -- one talk's angle -------------------------------------------------------
  judge(i, q) {
    const info = this.info.get(i);
    const typ = this.items[i].type;
    const absset = this._absset(i);
    if (!info) return null;
    const { X, Y, C } = q;
    const rows = [], direct = new Map();
    info.cards.forEach((c, k) => {
      let mx = this._pmg(X, c.f, info, absset);
      let my = Y !== null ? this._pmg(Y, c.o, info, absset) : 0.75;
      const cl = info.claims.get(k);
      if (cl) {
        mx = Math.max(mx, pyRound(P.CLAIM_W * this._pm(X, cl[0], absset), 3));
        if (Y !== null) my = Math.max(my, pyRound(P.CLAIM_W * this._pm(Y, cl[1], absset), 3));
      }
      if (Y !== null && mx < P.MATCH && my < P.MATCH) {
        const sx = this._pmg(X, c.o, info, absset), sy = this._pmg(Y, c.f, info, absset);
        if (sx >= P.MATCH && sy >= P.MATCH) { mx = sx; my = sy; }
      }
      direct.set(k, Math.min(mx, my));
      if (mx < 1.0) mx = Math.max(mx, this._up(X, c.f, info, absset));
      if (Y !== null && my < 1.0) my = Math.max(my, this._up(Y, c.o, info, absset));
      rows.push([k, c, mx, my]);
    });
    const both = rows.filter((r) => r[2] >= P.MATCH && r[3] >= P.MATCH);
    const polarity = (c) => {
      let e = c.e;
      if (e === "increase" || e === "decrease") {
        let flip = this.pneg[c.f] !== this.pneg[c.o];
        if (X !== null && X.neg) flip = !flip;
        if (Y !== null && Y.neg) flip = !flip;
        if (flip) e = e === "increase" ? "decrease" : "increase";
      }
      if (Y === null && (e === "increase" || e === "decrease")) {
        const bad = this.ptoks[c.o].some((w) => NEG_OUTCOME.has(w));
        e = bad ? (e === "increase" ? "decrease" : "increase") : e;
      }
      if (q.dir === "-") return { decrease: "agree", increase: "oppose", no_effect: "null", mixed: "mixed", associated: "related" }[e];
      if (q.dir === "?") return { increase: "agree", decrease: "agree", no_effect: "null", mixed: "agree_weak", associated: "related" }[e];
      return { increase: "agree", decrease: "oppose", no_effect: "null", mixed: "mixed", associated: "related" }[e];
    };
    const otherPeople = (c) => {
      if (C === null || c.p < 0) return false;
      return this._pm(C, c.p, absset) < 0.5 && !this._inAbs(C, absset);
    };
    if (both.length) {
      const told = both.filter((r) => r[1].st === "result" || r[1].st === "claim");
      if (!told.length) {
        const [k, , mx, my] = both[0];
        return { angle: "reframe", subtype: "related", conf: pyRound(0.5 * Math.min(mx, my), 3), card: k, caveat: null };
      }
      const [k, c, mx, my] = told[0];
      const pol = polarity(c);
      const m = Math.min(mx, my);
      const w = 1.0 - 0.08 * k;
      if (pol === "agree" || pol === "agree_weak") {
        if (otherPeople(c)) return { angle: "reframe", subtype: "people", conf: pyRound(0.8 * m * w, 3), card: k, caveat: null };
        const cv = told.slice(1).find((r) => r[1].st === "result" && ["oppose", "null"].includes(polarity(r[1])));
        const cav = cv ? cv[0] : null;
        const sub = (c.st === "claim" || NO_FINDINGS.has(typ)) ? "try" : "evidence";
        const conf = m * w * (c.st === "result" ? 1.0 : 0.8) * (pol === "agree" ? 1.0 : 0.85);
        return { angle: "support", subtype: sub, conf: pyRound(conf, 3), card: k, caveat: cav };
      }
      if (pol === "related") return { angle: "reframe", subtype: "related", conf: pyRound(0.6 * m * w, 3), card: k, caveat: null };
      const can = c.st === "result" && !NO_FINDINGS.has(typ) && direct.get(k) >= P.STRICT;
      if (can) {
        const sub = { oppose: "opposite", null: "null", mixed: "only_when" }[pol];
        return { angle: "challenge", subtype: sub, conf: pyRound(m * w, 3), card: k, caveat: null };
      }
      return { angle: "reframe", subtype: "related", conf: pyRound(0.6 * m * w, 3), card: k, caveat: null };
    }
    const yOnly = rows.filter((r) => r[3] >= P.MATCH && Y !== null && r[2] < P.MATCH);
    const xOnly = rows.filter((r) => r[2] >= P.MATCH && (Y === null || r[3] < P.MATCH));
    if (yOnly.length && Y !== null) {
      const [k, , , my] = maxBy(yOnly, (r) => [r[3], -r[0]]);
      return { angle: "reframe", subtype: "factor", conf: pyRound(0.8 * my, 3), card: k, caveat: null };
    }
    if (Y !== null) {
      for (let mi = 0; mi < info.measures.length; mi++) {
        const s = this._pm(Y, info.measures[mi].c, absset);
        if (s >= P.MATCH) return { angle: "reframe", subtype: "measure", conf: pyRound(0.8 * s, 3), card: null, measure: mi, caveat: null };
      }
    }
    if (xOnly.length) {
      const [k, , mx] = maxBy(xOnly, (r) => [r[2], -r[0]]);
      return { angle: "reframe", subtype: "measure", conf: pyRound(0.7 * mx, 3), card: k, caveat: null };
    }
    const ix = this._about(X, info.about.f, absset);
    const iy = Y !== null ? this._about(Y, info.about.o, absset) : 0.0;
    if (iy >= P.MATCH) return { angle: "reframe", subtype: "factor", conf: pyRound(0.6 * iy, 3), card: null, caveat: null };
    if (ix >= P.MATCH) return { angle: "reframe", subtype: "measure", conf: pyRound(0.6 * ix, 3), card: null, caveat: null };
    if (this._inAbs(X, absset) && (Y === null || this._inAbs(Y, absset))) {
      return { angle: "reframe", subtype: "related", conf: 0.3, card: null, caveat: null };
    }
    return null;
  }

  // -- what the screens show for a talk --------------------------------------------
  _sentence(i, card, key = "s", spans = ["fs", "os"]) {
    const ab = this.items[i].abstract;
    const [a, b] = card[key];
    let hl = [];
    for (const sk of spans) {
      if (card[sk] && card[sk][1] > card[sk][0]) {
        const [x, y] = card[sk];
        if (a <= x && y <= b) hl.push([x - a, y - a]);
      }
    }
    hl = sortedBy(hl, (h) => h);
    return { text: ab.slice(a, b), start: a, end: b, highlight: hl };
  }

  _why(i, v) {
    const info = this.info.get(i) || {};
    let out;
    if (v.card !== null && v.card !== undefined) {
      const c = info.cards[v.card];
      out = { sentence: this._sentence(i, c), factor: this.phrases[c.f], outcome: this.phrases[c.o],
              effect: c.e, status: c.st };
    } else if (v.measure !== null && v.measure !== undefined) {
      const me = info.measures[v.measure];
      out = { sentence: this._sentence(i, me, "s", ["cs"]), factor: "", outcome: this.phrases[me.c], effect: "", status: "measure" };
    } else {
      out = { sentence: null, factor: "", outcome: "", effect: "", status: "" };
    }
    if (v.caveat !== null && v.caveat !== undefined) out.caveat = this._sentence(i, info.cards[v.caveat]);
    out.text = show(Angles._whyText(v, out));
    return out;
  }

  static _whyText(v, w) {
    const a = v.angle, s = v.subtype, f = w.factor, o = w.outcome;
    if (a === "support") {
      return s === "evidence" ? `Shows ${f} going with ${o}, as your question expects.` : `Lets you try ${f} for ${o} yourself.`;
    }
    if (a === "challenge") {
      return { null: `Found no clear effect of ${f} on ${o}.`, opposite: `Found ${f} going against ${o}.`,
               only_when: `Found that ${f} affects ${o} only under some conditions.` }[s];
    }
    return { factor: `Looks at another factor behind ${o}: ${f}.`,
             measure: !f ? `Looks at ${o} from another side.` : `Looks at what ${f} does to ${o}.`,
             people: "Same question, with other people or another setting.",
             related: "On the same subject, without a result for your exact question." }[s];
  }

  _where(slot, badge) {
    if (badge === "POSTER") return "Poster";
    if (badge === "DEMO") return "Demo";
    const room = ((slot || {}).room || "").split(" - ").pop();
    return room.replace(/^Room\b/, "Rm");
  }

  _node(i, v, slot = null) {
    slot = slot || (this.arc.slots.get(i) || [null])[0] || null;
    const c = this.arc._card(i, slot);
    const info = this.info.get(i) || {};
    const label = info.label || this.items[i].title.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
    const tribe = info.tribe !== undefined && info.tribe !== null ? this.tribes[info.tribe] : null;
    return { id: c.id, angle: v.angle, angle_name: ANGLE_NAME[v.angle], symbol: SYMBOL[v.angle], subtype: v.subtype,
             subtype_label: SUBTYPE[v.subtype], confidence: v.conf, by_user: Boolean(v.by_user), label,
             title: c.title, type: c.type, badge: c.badge,
             day: c.day ?? null, day_label: c.day_label ?? null, time: c.time ?? null, start: c.start ?? null,
             end: c.end ?? null, room: c.room ?? null, where: this._where(slot, c.badge), session: c.session ?? null,
             talk_order: c.talk_order ?? null, doi: c.doi, tribe: tribe ? tribe.name : null,
             debut: Boolean(info.first_debut), why: this._why(i, v) };
  }

  // -- request helpers ------------------------------------------------------------
  _formats(req) {
    const f = truthy(req.formats) ? req.formats : DEFAULT_FORMATS;
    if (!Array.isArray(f)) throw new InputError('formats must be a list, e.g. ["talks", "posters"]');
    const out = [];
    for (const x of f) {
      let k = pyStr(x).trim().toLowerCase();
      if (Object.hasOwn(FORMAT_ALIAS, k)) k = FORMAT_ALIAS[k];
      if (!Object.hasOwn(FORMATS, k)) throw new InputError(`unknown format ${pyDumps(x)}; use ${Object.keys(FORMATS).join(", ")}`);
      out.push(k);
    }
    return [...new Set(out)];
  }

  _types(formats) {
    return new Set(formats.flatMap((f) => FORMATS[f]));
  }

  _today(now) {
    const days = this.arc.days;
    if (now === null) return days[0];
    const d = now.date();
    if (days.includes(d)) return d;
    return d < days[0] ? days[0] : days[days.length - 1];
  }

  _days(req, now = null) {
    let d = "days" in req ? req.days : req.when;
    if (d === undefined || d === null || d === "" || d === "today") d = ["today"];
    if (typeof d === "string") d = [d];
    if (!Array.isArray(d)) throw new InputError('days must be "today", "tomorrow", "week" or a list like ["tue"]');
    const today = this._today(now);
    const out = [];
    for (const x of d) {
      const s = pyStr(x).trim().toLowerCase();
      if (s === "today") out.push(today);
      else if (s === "tomorrow") {
        const k = this.arc.days.indexOf(today);
        out.push(this.arc.days[Math.min(k + 1, this.arc.days.length - 1)]);
      } else if (s === "week" || s === "all" || s === "all week") out.push(...this.arc.days);
      else out.push(this.arc._day(x));
    }
    return [...new Set(out)];
  }

  _nowOf(req) {
    return truthy(req.now) ? this.arc._now(req.now) : null;
  }

  _ids(xs, name) {
    const out = [];
    for (const x of xs || []) {
      const xid = x !== null && typeof x === "object" && !Array.isArray(x) ? (x.id ?? null) : x;
      let n;
      try {
        n = pyInt(xid);
      } catch (e) {
        throw new InputError(`${name}: unknown item id ${pyDumps(xid)}`);
      }
      if (!this.pos.has(n)) throw new InputError(`${name}: unknown item id ${pyDumps(xid)}`);
      out.push(this.arc._canon(this.pos.get(n)));
    }
    return [...new Set(out)];
  }

  _tribe(score, idx) {
    const w = new Map();
    for (const i of idx.slice(0, 20)) {
      const t = (this.info.get(i) || {}).tribe;
      if (t !== undefined && t !== null) w.set(t, (w.get(t) || 0) + score[i]);
    }
    if (!w.size) return null;
    const s = sortedBy([...w.entries()], (kv) => [-kv[1], kv[0]]);
    const [t1, w1] = s[0];
    const [t2, w2] = s.length > 1 ? s[1] : [null, 0.0];
    const tr = { ...this.tribes[t1] };
    tr.margin = w1 ? pyRound((w1 - w2) / w1, 3) : 0.0;
    tr.runner_up = t2 !== null ? this.tribes[t2].name : null;
    tr.look_for = `Look for the ${COLOR_NAME[tr.color] ?? "white"} ${tr.shape}.`;
    return tr;
  }

  async _judged(q, types, score = null) {
    score = score === null ? await this._rank(q.text) : score;
    const order = argsortDesc(score);
    const pool = order.filter((i) => this.aliveSet.has(i) && types.has(this.items[i].type)).slice(0, P.POOL);
    const out = [];
    pool.slice(0, P.JUDGE_N).forEach((i, r) => {
      const v = q.kind === "relation" ? (this.judge(i, q) || this._near(r, score[i])) : null;
      if (v !== null) out.push([i, v]);
    });
    return [out, pool, score];
  }

  // a topic Arc ("mixed reality") is built on its sharpest question; the topic's own
  // first talks fill what that question leaves empty, as Reframes on the same subject
  async _topicFill(asked, types, judged) {
    const have = new Set(judged.map(([i]) => i));
    const sc = await this._rank(asked);
    const pool = argsortDesc(sc).filter((i) => this.aliveSet.has(i) && types.has(this.items[i].type)).slice(0, P.JUDGE_N);
    return pool.filter((i) => !have.has(i))
      .map((i) => [i, { angle: "reframe", subtype: "related", conf: P.TOPIC_CONF, card: null, caveat: null }]);
  }

  // a talk the cards cannot place but the search puts near the top: Same subject
  _near(pos, s) {
    if (pos < P.NEAR_TOP || s >= P.NEAR_SCORE) return { angle: "reframe", subtype: "related", conf: P.NEAR_CONF, card: null, caveat: null };
    return null;
  }

  _counts(judged) {
    const c = new Counter();
    for (const [, v] of judged) c.add(v.angle);
    return Object.fromEntries(ANGLES.map((a) => [a, c.count(a)]));
  }

  async _asRelation(q, req) {
    if (q.kind === "relation") return [q, null];
    const types = this._types(this._formats(req));
    const [, pool, score] = await this._judged(q, types);
    const sug = await this._suggest(q, pool, score, types, 1);
    if (!sug.length) throw new InputError('could not find a question in this topic; try a question like "Does X raise Y?"');
    return [await this.question(sug[0].question), q.text];
  }

  // the question an Arc was built on: a topic becomes its sharpest question, as in the
  // arc screen, so that edit, node, shared and summary agree with the map
  async _arcQuestion(req, strict = false) {
    const q = await this.question(req.question);
    try {
      return (await this._asRelation(q, req))[0];
    } catch (e) {
      if (strict || !(e instanceof InputError)) throw e;
      return q;
    }
  }

  // -- A-1 / A-2 ------------------------------------------------------------------
  async ask(req) {
    const text = "text" in req ? req.text : req.question;
    const q = await this.question(text);
    const types = this._types(this._formats(req));
    const [judged, pool, score] = await this._judged(q, types);
    const out = { text: q.text, kind: q.kind, parsed: { x: q.x, y: q.y, direction: q.dir, context: q.ctx },
                  tribe: this._tribe(score, pool), matching: await this._matching(q, pool), corrected: q.corrected };
    const rel = await this.arc._relevance({ research: q.text, keywords: [], topics: [] });
    out.on_topic = !rel.low;
    out.warning = nonLatin(q.text) ? ENGLISH_ONLY : rel.low ? OFF_TOPIC : null;
    if (q.kind === "relation") {
      out.counts = this._counts(judged);
      out.suggestions = [];
    } else if (truthy(req.now)) {
      // 07b: "That's a topic. 31 Tuesday talks match it. Pick a sharper question:"
      const days = this._days(req, this._nowOf(req));
      out.matching_day = await this._matching(q, pool.filter((i) => this._onDays(i, days)));
      const when = days.length <= 2 ? days.map(weekday).join(" or ") : "this week's";
      out.message = (q.kind === "topic" ? "That's a topic." : "That's a wide question.")
        + ` ${out.matching_day} ${when} talks match it. Pick a sharper question:`;
    } else {
      out.message = (q.kind === "topic" ? "That's a topic, not a question yet." : "That's a wide question.")
        + ` ${out.matching} talks match it. Pick a sharper one:`;
    }
    if (q.kind !== "relation") {
      // nothing sharper to offer for a question CHI does not cover
      out.suggestions = out.warning ? [] : await this._suggest(q, pool, score, types, truthy(req.k) ? pyInt(req.k) : 3);
    }
    out.help = HELP;
    return out;
  }

  async _matching(q, pool) {
    let words;
    if (q.kind === "relation") {
      words = (q.X || (await this._phrase(q.x)) || { toks: [] }).toks;
      if (q.Y !== null) words = [...words.slice(-1), ...q.Y.toks.slice(-1)];
    } else words = content(q.x)[0].filter((w) => !PLAIN.has(w) && !VAGUE.has(w));
    words = words.filter(Boolean);
    if (!words.length) return 0;
    let n = 0;
    for (const i of pool) {
      const s = this._absset(i);
      if (words.slice(-2).every((w) => { for (const x of s) if (same(w, x)) return true; return false; })) n += 1;
    }
    return n;
  }

  async _suggest(q, pool, score, types, k = 3) {
    const groups = new Map();
    for (const i of pool.slice(0, 60)) {
      const info = this.info.get(i);
      if (!info) continue;
      for (const [k, c] of info.cards.entries()) {
        if (c.st !== "result" && c.st !== "claim") continue;
        const [fp, op] = info.claims.get(k) || [c.f, c.o];
        const ft = this.ptoks[fp], ot = this.ptoks[op];
        if (!ft.length || !ot.length || ft.length > 4 || ot.length > 3) continue;
        const key = JSON.stringify([ft[ft.length - 1], ot[ot.length - 1]]);
        if (!groups.has(key)) groups.set(key, { items: [], f: new Counter(), o: new Counter(), e: new Counter(), w: 0.0 });
        const g = groups.get(key);
        if (!g.items.includes(i)) { g.items.push(i); g.w += score[i]; }
        g.f.add(this.phrases[fp]);
        g.o.add(this.phrases[op]);
        g.e.add(c.e);
      }
    }
    const qt = q.kind !== "relation" ? content(q.x)[0] : [];
    const overlap = (g) => {
      const toks = [...g.f.keys(), ...g.o.keys()].flatMap((ph) => content(ph)[0]);
      return qt.filter((w) => toks.some((t) => same(w, t))).length;
    };
    const ov = new Map([...groups.entries()].map(([key, g]) => [key, overlap(g)]));
    const ranked = sortedBy([...groups.entries()].filter(([key, g]) => g.items.length >= 2 || ov.get(key) > 0)
      .map(([key, g]) => [pyRound(g.w * (1 + ov.get(key)), 6), JSON.parse(key)]), (t) => [-t[0], t[1]]);
    const out = [], usedF = new Set(), usedO = new Set(), usedI = new Set();
    // a topic keeps its own words when its talks share an outcome or a cause
    if (q.kind === "topic") {
      for (const [x, y, e, items] of await this._anchored(q, pool, score)) {
        const text = this._wording(x, y, e);
        if (out.every((o) => o.question !== text)) out.push(await this._suggestion(text, x, y, items, types));
        if (out.length === k) return out;
      }
    }
    for (const [, key] of ranked) {
      const g = groups.get(JSON.stringify(key));
      if ((usedF.has(key[0]) && usedO.has(key[1])) || g.items.every((i) => usedI.has(i))) continue;
      const x = sortedBy([...g.f.entries()], (kv) => [-kv[1], kv[0].length, kv[0]])[0][0];
      const y = sortedBy([...g.o.entries()], (kv) => [-kv[1], kv[0].length, kv[0]])[0][0];
      const text = this._wording(x, y, g.e);
      if (out.some((o) => o.question === text)) continue;
      out.push(await this._suggestion(text, x, y, g.items, types));
      usedF.add(key[0]);
      usedO.add(key[1]);
      for (const i of g.items) usedI.add(i);
      if (out.length === k) break;
    }
    return out;
  }

  // a question from a factor, an outcome and the directions the talks found
  _wording(x, y, e) {
    const ups = e.count("increase"), downs = e.count("decrease");
    const bad = content(y)[0].some((w) => NEG_OUTCOME.has(w));
    const xw = x.split(/\s+/).filter(Boolean);
    const dz = /[^s]s$/.test(xw[xw.length - 1]) ? "Do" : "Does";
    let text;
    if (ups > downs && ups >= e.count("no_effect")) text = `${dz} ${x} ${bad ? "increase" : "improve"} ${y}?`;
    else if (downs > ups) text = `${dz} ${x} reduce ${y}?`;
    else text = `How ${dz.toLowerCase()} ${x} affect ${y}?`;
    return show(text);
  }

  async _suggestion(text, x, y, items, types) {
    const [jd] = await this._judged(await this.question(text), types);
    const sessions = [...new Set(items.flatMap((i) => (this.arc.slots.get(i) || [])
      .filter((s) => s.session && !s.session.startsWith("Posters")).map((s) => s.session)))].slice(0, 3);
    return { question: text, x, y, counts: this._counts(jd), talks: items.length, from_sessions: sessions };
  }

  // the topic as the factor (what it does) or as the outcome (what drives it), in the
  // topic's own words: "haptics" -> "Do haptics improve VR experience?"; each needs two talks
  async _anchored(q, pool, score) {
    const T = await this._phrase(q.x);
    if (T === null || T.toks.length > 4) return [];
    const side = { o: new Map(), f: new Map() };
    for (const i of pool.slice(0, 60)) {
      const info = this.info.get(i);
      if (!info) continue;
      const absset = this._absset(i);
      for (const [k, c] of info.cards.entries()) {
        if (c.st !== "result" && c.st !== "claim") continue;
        const [fp, op] = info.claims.get(k) || [c.f, c.o];
        const mf = Math.max(this._pmg(T, c.f, info, absset), pyRound(P.CLAIM_W * this._pm(T, fp, absset), 3));
        const mo = Math.max(this._pmg(T, c.o, info, absset), pyRound(P.CLAIM_W * this._pm(T, op, absset), 3));
        for (const [role, m, other] of [["o", mf, op], ["f", mo, fp]]) {
          const toks = this.ptoks[other];
          if (m < P.MATCH || !toks.length || toks.length > 3 || T.toks.some((w) => toks.some((t) => same(w, t)))) continue;
          const head = toks[toks.length - 1];
          if (!side[role].has(head)) side[role].set(head, { items: [], w: 0.0, ph: new Counter(), e: new Counter() });
          const g = side[role].get(head);
          if (!g.items.includes(i)) { g.items.push(i); g.w += score[i]; }
          g.ph.add(this.phrases[other]);
          g.e.add(c.e);
        }
      }
    }
    const cands = sortedBy(["o", "f"].flatMap((role) => [...side[role].entries()].filter(([, g]) => g.items.length >= 2)
      .map(([head, g]) => [pyRound(g.w, 6), role, head])), (t) => [-t[0], t[1], t[2]]);
    return cands.map(([, role, head]) => {
      const g = side[role].get(head);
      const ph = sortedBy([...g.ph.entries()], (kv) => [-kv[1], kv[0].length, kv[0]])[0][0];
      return role === "o" ? [q.x, ph, g.e, g.items] : [ph, q.x, g.e, g.items];
    });
  }

  // -- 08 Choose your angles ----------------------------------------------------------
  _chipPhrase(i, v) {
    const info = this.info.get(i) || {};
    if (v.angle === "challenge" && v.subtype === "null") return "null results";
    const k = v.card ?? null;
    if (k === null) {
      if (v.measure !== undefined && v.measure !== null) return this.phrases[info.measures[v.measure].c];
      return (info.label || "").toLowerCase();
    }
    const c = info.cards[k];
    const [fp, op] = info.claims.get(k) || [c.f, c.o];
    if (v.subtype === "measure") return this.phrases[op];
    if (v.subtype === "people" && c.p >= 0) return this.phrases[c.p];
    return this.phrases[fp];
  }

  _chips(judged) {
    const groups = { support: new Map(), reframe: new Map(), challenge: new Map() };
    const n = Math.max(1, judged.length);
    judged.forEach(([i, v], r) => {
      const ph = this._chipPhrase(i, v);
      const toks = content(ph)[0];
      if (!toks.length) return;
      const key = stem(toks[toks.length - 1]);
      const gm = groups[v.angle];
      if (!gm.has(key)) gm.set(key, { names: new Counter(), ids: [], w: 0.0 });
      const g = gm.get(key);
      g.names.add(ph);
      const id = this.items[i].id;
      if (!g.ids.includes(id)) { g.ids.push(id); g.w += pyRound(0.6 * v.conf + 0.4 * (1.0 - r / n), 4); }
    });
    const out = {};
    for (const a of ANGLES) {
      const ranked = sortedBy([...groups[a].entries()], (kv) => [-kv[1].w, kv[0]]).slice(0, CHIPS_K);
      out[a] = ranked.map(([key, g], k) => {
        const name = sortedBy([...g.names.entries()], (kv) => [-kv[1], kv[0].length, kv[0]])[0][0];
        return { id: `${a}:${key}`, label: show(name.slice(0, 1).toUpperCase() + name.slice(1)), talks: g.ids.length,
                 ids: g.ids, selected: k < CHIPS_ON[a] };
      });
    }
    return out;
  }

  async anglesScreen(req) {
    const [q, asked] = await this._asRelation(await this.question(req.question || req.text), req);
    const [judged] = await this._judged(q, this._types(this._formats(req)));
    const chips = this._chips(judged);
    return { question: q.text, asked, headline: "Choose your angles.",
             angles: ANGLES.map((a) => ({ key: a, name: ANGLE_NAME[a], symbol: SYMBOL[a], help: HELP[a], chips: chips[a],
                                          empty: a === "challenge" && !chips[a].length ? NO_CHALLENGE : null })),
             help_note: HELP_NOTE, button: "Next" };
  }

  // -- 10-12: the Arc -----------------------------------------------------------------
  _how(req) {
    let w = req.walk || [];
    if (typeof w === "string") w = [w];
    if (!Array.isArray(w) || w.some((x) => !WALK.includes(x))) throw new InputError(`walk must be a list of ${WALK.join(", ")}`);
    return { gap: w.includes("calm") ? P.CALM_GAP : P.GAP_MIN, step_free: w.includes("step_free"),
             walk: WALK.filter((x) => w.includes(x)) };
  }

  _place(placed, i, days, after, how = null) {
    how = how || { gap: P.GAP_MIN, step_free: false };
    for (const s of this.arc.slots.get(i) || []) {
      if (!s.start || (days && !days.includes(s.start.slice(0, 10)))) continue;
      if (after !== null && T(s.est_end || s.end).ms <= after.ms) continue;
      const got = this.arc._fit(placed, i, s, how.gap, how.step_free);
      if (got) return { i, slot: s, start: got[0], end: got[1], kind: "pick" };
    }
    return null;
  }

  _onDays(i, days) {
    return (this.arc.slots.get(i) || []).some((s) => s.start && days.includes(s.start.slice(0, 10)));
  }

  _build(q, judged, req, days, keep = [], prefer = []) {
    const n = Math.max(3, Math.min(12, truthy(req.size) ? pyInt(req.size) : P.SIZE));
    const how = this._how(req);
    const after = truthy(req.after) ? this.arc._now(req.after) : null;
    const st = req.state || {};
    const removed = new Set(this._ids(st.removed, "state.removed"));
    const pref = new Set(prefer);
    const keepIds = new Set(keep.map((kv) => kv[0]));
    const by = { support: [], reframe: [], challenge: [] };
    judged.forEach(([i, v], r) => {
      if (removed.has(i) || keepIds.has(i)) return;
      const rel = 1.0 - r / Math.max(1, judged.length);
      const bonus = pref.has(this.items[i].id) ? 1.0 : 0.0;
      by[v.angle].push([pyRound(0.6 * v.conf + 0.4 * rel + bonus, 4), r, i, v]);
    });
    for (const a of ANGLES) by[a] = sortedBy(by[a], (t) => [-t[0], t[1]]);
    const quota = { challenge: Math.min(by.challenge.length, n >= 6 ? 2 : 1) };
    quota.support = Math.min(by.support.length, Math.max(1, pyRound(n * 0.4)));
    quota.reframe = Math.min(by.reframe.length, n - quota.support - quota.challenge);
    let spare = n - quota.support - quota.challenge - quota.reframe;
    for (const a of ["support", "reframe"]) {
      const add = Math.min(spare, by[a].length - quota[a]);
      quota[a] += add;
      spare -= add;
    }
    const placed = [], reads = [], chosen = new Map();
    for (const [i, v] of keep) {
      const got = this._place(placed, i, days, after, how);
      if (got) placed.push(got);
      else reads.push(i);
      chosen.set(i, v);
    }
    const taken = {};
    for (const a of ANGLES) taken[a] = [...chosen.values()].filter((v) => v.angle === a).length;
    const cursor = { support: 0, reframe: 0, challenge: 0 };
    let progress = true;
    while (progress && chosen.size < n) {
      progress = false;
      for (const a of ANGLES) {
        if (taken[a] >= quota[a] || chosen.size >= n) continue;
        while (cursor[a] < by[a].length) {
          const [, , i, v] = by[a][cursor[a]];
          cursor[a] += 1;
          if (chosen.has(i)) continue;
          const got = this._place(placed, i, days, after, how);
          if (got) {
            placed.push(got); chosen.set(i, v); taken[a] += 1; progress = true;
            break;
          }
          if (reads.length < P.MAX_READ && (a !== "support" || v.conf >= 0.7) && !this._onDays(i, days)) {
            reads.push(i); chosen.set(i, v); taken[a] += 1; progress = true;
            break;
          }
        }
      }
    }
    return [placed, reads, chosen];
  }

  _route(placed, reads, chosen, now = null, heard = []) {
    placed = sortedBy(placed, (p) => [p.start.ms, p.i]);
    const nodes = [];
    for (const [k, p] of placed.entries()) {
      const nd = this._node(p.i, chosen.get(p.i), p.slot);
      const t = hhmm(p.start.iso());
      Object.assign(nd, { stop: k + 1, read: false, visit_start: p.start.iso(), visit_end: p.end.iso(), time: t,
                          line: `${t} · ${nd.where}` });
      nodes.push(nd);
    }
    for (const i of reads) {
      const nd = this._node(i, chosen.get(i));
      const day = (nd.day_label || "").split(" ")[0];
      Object.assign(nd, { stop: null, read: true, visit_start: null, visit_end: null,
                          line: [day, nd.where, "read"].filter(Boolean).join(" · ") });
      nodes.push(nd);
    }
    const hs = new Set(heard);
    let found = false;
    for (const nd of nodes) {
      if (hs.has(nd.id)) nd.state = "heard";
      else if (nd.read) nd.state = "read";
      else if (now !== null && T(nd.visit_end).ms <= now.ms) nd.state = "ended";
      else if (!found) { nd.state = "next"; found = true; }
      else nd.state = "upcoming";
    }
    for (const a of ANGLES) {
      const mine = [...nodes.entries()].filter(([, nd]) => nd.angle === a);
      const show = sortedBy(mine, ([k, nd]) => [nd.state !== "next", -nd.confidence, k]).slice(0, MAP_CAP);
      const ids = new Set(show.map(([, nd]) => nd.id));
      for (const [, nd] of mine) nd.bundled = !ids.has(nd.id);
    }
    return nodes;
  }

  static _bundles(nodes) {
    const out = {};
    for (const a of ANGLES) {
      const ids = nodes.filter((nd) => nd.angle === a && nd.bundled).map((nd) => nd.id);
      if (ids.length) out[a] = { count: ids.length, label: `+${ids.length}`, text: `${ids.length} more`, ids };
    }
    return out;
  }

  _nextCard(nodes, stepFree = false) {
    const k = nodes.findIndex((nd) => nd.state === "next");
    if (k < 0) return null;
    const cur = nodes[k];
    let walk = null;
    const prev = k > 0 && nodes[k - 1].stop ? nodes[k - 1] : null;
    if (prev) {
      const w = this.arc._walk(prev.room, cur.room, stepFree);
      if (w) {
        walk = w.min === 0 ? "Same room" : `${w.min}–${w.max} min walk from ${prev.where}`;
        if (stepFree && w.min && w.via !== "same level") walk += " · elevator";
      }
    }
    const place = cur.badge === "POSTER" || cur.badge === "DEMO" ? cur.where : (cur.room || "").split(" - ").pop();
    return { id: cur.id, label: cur.label, title: cur.title, angle: cur.angle, symbol: cur.symbol,
             line: `Next · ${cur.time} · ${place}`, walk };
  }

  async arcScreen(req) {
    const t0 = performance.now();
    const [q, asked] = await this._asRelation(await this.question(req.question || req.text), req);
    const formats = this._formats(req);
    const types = this._types(formats);
    const now = this._nowOf(req);
    const days = this._days(req, now);
    let [judged, pool, score] = await this._judged(q, types);
    if (asked) judged = judged.concat(await this._topicFill(asked, types, judged));
    const picked = req.chips;
    let prefer = [];
    if (truthy(picked)) {
      if (!Array.isArray(picked)) throw new InputError('chips must be a list of chip ids from the "angles" screen');
      const chips = this._chips(judged);
      for (const a of ANGLES) for (const c of chips[a]) if (picked.includes(c.id)) prefer = prefer.concat(c.ids);
    }
    const st = req.state || {};
    const overrides = new Map();
    for (const x of st.added || []) {
      if (x !== null && typeof x === "object" && truthy(x.angle)) overrides.set(this._ids([x], "state.added")[0], pyStr(x.angle));
    }
    const keep = [...this._ids(st.locked, "state.locked"), ...this._ids(st.added, "state.added")]
      .map((i) => [i, this._angle(i, q, overrides.get(i))]);
    const [placed, reads, chosen] = this._build(q, judged, req, days, keep, prefer);
    const heard = this._ids(st.heard, "state.heard").map((i) => this.items[i].id);
    const nodes = this._route(placed, reads, chosen, now, heard);
    const counts = new Counter();
    for (const nd of nodes) counts.add(nd.angle);
    const tribe = this._tribe(score, pool);
    let nAll = 0, nDay = 0;
    for (const i of this.aliveSet) {
      if (!types.has(this.items[i].type)) continue;
      nAll += 1;
      if (this._onDays(i, days)) nDay += 1;
    }
    const close = Math.min(P.JUDGE_N, pool.filter((i) => this._onDays(i, days)).length);
    const nStops = nodes.filter((nd) => nd.stop).length;
    const steps = [
      { key: "on_day", n: nDay, text: `${nDay} on ${days.map((d) => dayLabel(d).split(" ")[0]).join(", ")}` },
      { key: "close", n: close, text: `${close} close to your question` },
      { key: "angles", n: judged.length, text: `${judged.length} read for their angle` },
      { key: "tribe", n: null, text: tribe ? `You're in ${tribe.name} ${tribe.symbol}` : "" },
      { key: "fit", n: nStops, text: `${nStops} stops that fit your day` },
    ];
    const empty = {};
    for (const a of ANGLES) if (!counts.count(a)) empty[a] = a === "challenge" ? NO_CHALLENGE : null;
    return {
      question: q.text, asked, parsed: { x: q.x, y: q.y, direction: q.dir, context: q.ctx },
      tribe, days, formats, loading: { text: `Reading ${nAll.toLocaleString("en-US")} talks for you`, n: nAll },
      counts: Object.fromEntries(ANGLES.map((a) => [a, counts.count(a)])),
      summary_line: `${nodes.length} stops · ` + ANGLES.map((a) => `${counts.count(a)} ${a}`).join(" · "),
      nodes, next: this._nextCard(nodes, this._how(req).step_free), bundles: Angles._bundles(nodes),
      walk: this._how(req).walk, steps, help: HELP, help_note: HELP_NOTE,
      empty, available: this._counts(judged), data_version: this.version,
      latency_ms: pyRound(performance.now() - t0, 1),
    };
  }

  // -- 15 Edit -----------------------------------------------------------------------------
  async edit(req) {
    const q = await this._arcQuestion(req, true);
    const types = this._types(this._formats(req));
    const [judged, pool, score] = await this._judged(q, types);
    const now = this._nowOf(req);
    const days = this._days(req, now);
    const nodes = this._ids(req.nodes, "nodes");
    const tapped = req.node !== undefined && req.node !== null ? this._ids([req.node], "node")[0] : null;
    const add = req.add ?? null;
    if (add !== null && !ANGLES.includes(add)) throw new InputError(`add must be one of ${ANGLES.join(", ")}`);
    let angle, mode;
    if (tapped !== null) {
      const v0 = new Map(judged).get(tapped) || this.judge(tapped, q);
      angle = (v0 || {}).angle || "reframe";
      mode = "swap";
    } else {
      angle = add || "support";
      mode = "add";
    }
    let flt = (truthy(req.filter) ? pyStr(req.filter) : "angle").toLowerCase();
    if (ANGLES.includes(flt)) { angle = flt; flt = "angle"; }
    if (!["angle", "debut", "wildcard"].includes(flt)) throw new InputError(`filter must be one of angle, debut, wildcard, ${ANGLES.join(", ")}`);
    const how = this._how(req);
    const placed = [];
    for (const i of nodes) {
      if (i === tapped) continue;
      const got = this._place(placed, i, days, null, how);
      if (got) placed.push(got);
    }
    const k = truthy(req.k) ? pyInt(req.k) : EDIT_K;
    let cand;
    if (truthy(req.search)) {
      const sc = await this._rank(pyStr(req.search));
      cand = [];
      for (const i of argsortDesc(sc)) {
        if (this.aliveSet.has(i) && types.has(this.items[i].type) && !nodes.includes(i)) {
          cand.push([i, this.judge(i, q)]);
          if (cand.length === k) break;
        }
      }
    } else if (flt === "debut") {
      cand = judged.filter(([i]) => !nodes.includes(i) && (this.info.get(i) || {}).first_debut).slice(0, k);
    } else if (flt === "wildcard") {
      cand = this._wildcards(q, pool, score, nodes, k);
    } else {
      cand = judged.filter(([i, v]) => v.angle === angle && !nodes.includes(i)).slice(0, k);
    }
    let cards = cand.map(([i, v]) => this._editCard(i, v, placed, days));
    if (flt === "wildcard" && !truthy(req.search)) {
      cand.forEach(([i], j) => { cards[j].reason = `From ${this.tribes[this.info.get(i).tribe].name}, outside your usual neighbourhood.`; });
    }
    cards = sortedBy(cards, (c) => !c.on_days);
    return { question: q.text, mode, title: mode === "swap" ? "Swap" : "Add",
             node: tapped !== null ? this.items[tapped].id : null, angle, filter: truthy(req.search) ? "search" : flt,
             filters: [{ key: angle, label: ANGLE_NAME[angle], symbol: SYMBOL[angle] },
                       { key: "debut", label: "First CHI paper", symbol: "✦" },
                       { key: "wildcard", label: "Wildcard", symbol: "⤨" }],
             cards, available: this._counts(judged.filter(([i]) => !nodes.includes(i))) };
  }

  _editCard(i, v, placed, days) {
    const slots = (this.arc.slots.get(i) || []).filter((s) => s.start);
    const slot = slots.find((s) => days.includes(s.start.slice(0, 10))) || (slots.length ? slots[0] : null);
    const c = this._lite(i, v, slot);
    if (v === null) Object.assign(c, { angle: null, note: "Not about your question; choose where it sits." });
    let clash = null;
    const on = Boolean(slot && days.includes(slot.start.slice(0, 10)));
    if (on && !this.arc._fit(placed, i, slot, P.GAP_MIN, false)) {
      const [a, b] = this.arc._interval(i, slot);
      const name = (p) => (this.info.get(p.i) || {}).label || this.items[p.i].title;
      const hit = placed.find((p) => p.start.ms < b.ms && a.ms < p.end.ms) || null;
      if (hit) clash = { id: this.items[hit.i].id, text: `Same time as ${name(hit)}` };
      else if (!placed.length) clash = { id: null, text: "Too short to visit" };
      else {
        const gap = (p) => Math.min(Math.abs(a.ms - p.end.ms), Math.abs(p.start.ms - b.ms)) / 1000;
        const near = minBy(placed, (p) => [gap(p), p.start.ms]);
        const after = near.end.ms <= a.ms;
        clash = { id: this.items[near.i].id, text: `${after ? "Right after" : "Right before"} ${name(near)}` };
      }
    }
    const head = [(c.day_label || "").split(" ")[0], slot && slot.est_start ? hhmm(slot.est_start) : ""].filter(Boolean).join(" ");
    Object.assign(c, { line: [head, this._where(slot, c.badge)].filter(Boolean).join(" · "), on_days: on, clash });
    return c;
  }

  _lite(i, v, slot = null) {
    const c = this.arc._card(i, slot);
    const info = this.info.get(i) || {};
    const out = { id: c.id, title: c.title, badge: c.badge, label: info.label || "", day_label: c.day_label ?? null,
                  time: c.time ?? null, room: c.room ?? null, debut: Boolean(info.first_debut) };
    if (v) {
      Object.assign(out, { angle: v.angle, symbol: SYMBOL[v.angle], subtype: v.subtype, subtype_label: SUBTYPE[v.subtype],
                           confidence: v.conf, why: this._why(i, v).text });
    }
    return out;
  }

  _wildcards(q, pool, score, nodes, k) {
    const mine = this._tribe(score, pool);
    const mtk = this.tribes.findIndex((t) => mine && t.name === mine.name);
    const mt = mtk < 0 ? null : mtk;
    const out = [];
    for (const i of pool.slice(P.JUDGE_N)) {
      const info = this.info.get(i);
      if (nodes.includes(i) || !info || info.tribe === mt) continue;
      const v = this.judge(i, q);
      if (v && v.angle !== "challenge") {
        out.push([i, v]);
        if (out.length === k) break;
      }
    }
    return out;
  }

  // -- 14 talk detail ------------------------------------------------------------------------
  // -- 12b hold a stop -----------------------------------------------------------------------
  async hold(req) {
    const q = await this._arcQuestion(req, true);
    const types = this._types(this._formats(req));
    const [judged, pool0] = await this._judged(q, types);
    const pool = pool0.filter((i) => types.has(this.items[i].type));
    const now = this._nowOf(req);
    const days = this._days(req, now);
    const how = this._how(req);
    const nodes = this._ids(req.nodes, "nodes");
    if (req.node === undefined || req.node === null) throw new InputError("hold needs the held node's id");
    const held = this._ids([req.node], "node")[0];
    const angle = req.angle || ((new Map(judged).get(held) || this.judge(held, q) || {}).angle || "reframe");
    if (!ANGLES.includes(angle)) throw new InputError(`angle must be one of ${ANGLES.join(", ")}`);
    const placed = [];
    for (const i of nodes) {
      if (i !== held) {
        const got = this._place(placed, i, days, null, how);
        if (got) placed.push(got);
      }
    }
    const mine = this._place([], held, days, null, how);
    const seen = new Set(judged.map(([i]) => i));
    const more = pool.slice(P.JUDGE_N, P.JUDGE_N + P.HOLD_MORE).filter((i) => !seen.has(i)).map((i) => [i, this.judge(i, q)]);
    let cands = [];
    judged.concat(more.filter(([, v]) => v)).forEach(([i, v], r) => {
      if (v.angle !== angle || nodes.includes(i)) return;
      // the talk's slot nearest the held stop that still fits the day
      let best = null;
      for (const sl of this.arc.slots.get(i) || []) {
        if (!sl.start || (days && !days.includes(sl.start.slice(0, 10)))) continue;
        const got = this.arc._fit(placed, i, sl, how.gap, how.step_free);
        if (got) {
          const gap = mine ? Math.abs(got[0].ms - mine.start.ms) / 1000 : 0.0;
          if (best === null || gap < best[0]) best = [gap, { i, slot: sl, start: got[0], end: got[1], kind: "pick" }];
        }
      }
      if (best && best[0] <= P.HOLD_WIN * 60) cands.push([best[0], r, i, v, best[1]]);
    });
    cands = sortedBy(cands, (t) => [t[0], t[1]]);
    const cards = [];
    for (const [, , i, v, got] of cands.slice(0, truthy(req.k) ? pyInt(req.k) : P.HOLD_K)) {
      const c = this._lite(i, v, got.slot);
      const before = placed.filter((p) => p.end.ms <= got.start.ms);
      const prev = before.length ? maxBy(before, (p) => [p.end.ms, p.i]) : null;
      const w = prev ? this.arc._walk(prev.slot.room, got.slot.room, how.step_free) : null;
      const walk = !w ? null : w.min === 0 ? "stay" : `${w.min}–${w.max} min walk`;
      const place = this._where(got.slot, c.badge).replace(/^Rm /, "");
      const t = hhmm(got.start.iso());
      Object.assign(c, { time: t, place, walk, line: `${place} · ~${t}` });
      cards.push(c);
    }
    const n = cards.length;
    const keep = { 1: "It keeps", 2: "Both keep", 3: "All three keep" }[n] || `All ${n} keep`;
    return { question: q.text, node: this.items[held].id, angle, cards,
             text: n ? `Release on a talk to swap. ${keep} this ${ANGLE_NAME[angle].slice(0, -1)}.`
               : "Nothing else with this angle fits here." };
  }

  // -- 14b-14d questions to the authors ------------------------------------------------------
  async questions(req) {
    const i = this.arc._itemById(req.id);
    const raw = req.questions || [];
    if (!Array.isArray(raw)) throw new InputError("questions must be a list of strings");
    const texts = raw.map((x) => pyStr(x !== null && typeof x === "object" ? x.text : x).trim());
    // sums in order, as in Python
    const unit = (v) => {
      let s = 0;
      for (const x of v) s += x * x;
      const n = Math.max(Math.sqrt(s), 1e-9);
      return Float64Array.from(v, (x) => x / n);
    };
    const emb = async (t) => unit(Float64Array.from(await this.arc._embed(t)));
    const vecs = [];
    for (const t of texts) vecs.push(await emb(t));
    const cos = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; return pyRound(s, 4); };
    const themes = [];
    vecs.forEach((v, k) => {
      let best = null, bc = P.THEME_COS;
      for (const t of themes) {
        const c = cos(v, unit(t.sum));
        if (c >= bc) { best = t; bc = c; }
      }
      if (best === null) themes.push({ members: [k], sum: Float64Array.from(v) });
      else {
        best.members.push(k);
        best.sum = best.sum.map((x, j) => x + v[j]);
      }
    });
    const absset = this._absset(i);
    const absSorted = [...absset].sort();
    const info = this.info.get(i) || { cards: [] };
    const surface = surfaceOf(texts);
    const words = texts.map((t) => unique(content(t)[0]).filter((w) => !PEOPLE.has(w) && !PEOPLE.has(w + "s")
      && !STOPW.has(w) && !PLAIN.has(w)));
    // a word in most questions is the talk itself ("robot"), not a theme
    const common = new Counter();
    for (const ws of words) common.update(ws);
    const subject = new Set([...common].filter(([, n]) => texts.length >= 4 && n >= 0.6 * texts.length).map(([w]) => w));
    let outT = [];
    for (const t of themes) {
      const cen = unit(t.sum);
      const rep = maxBy(t.members, (k) => [cos(vecs[k], cen), -k]);
      const first = new Map();
      for (const k of t.members) for (const w of words[k]) if (!first.has(w)) first.set(w, first.size);
      const nIn = new Counter();
      for (const k of t.members) nIn.update(words[k]);
      const top = sortedBy([...first.keys()].filter((w) => !subject.has(w)),
        (w) => [-(nIn.count(w) + (absSorted.some((x) => same(w, x)) ? 0.5 : 0.0)), first.get(w)]);
      const label = top.length ? show(top.slice(0, 2).map((w) => surface.get(w) || w).join(" · ")) : texts[rep];
      outT.push({ label: label.slice(0, 1).toUpperCase() + label.slice(1), n: t.members.length, members: t.members, rep });
    }
    outT = sortedBy(outT, (t) => [-t.n, t.members[0]]);
    const out = { id: this.items[i].id, title: this.items[i].title, n: texts.length, themes: outT,
                  line: `${texts.length} questions, ${outT.length} theme${outT.length !== 1 ? "s" : ""}.` };
    const nw = pyStr(req.new || "").trim();
    if (nw) {
      const v = await emb(nw);
      const close = sortedBy(vecs.map((w, k) => [cos(v, w), k]), (t) => [-t[0], t[1]]);
      out.close = close.filter(([c]) => c >= P.CLOSE_COS).map(([c, k]) => ({ k, sim: c })).slice(0, 10);
      const joins = themes.map((t, n) => [cos(v, unit(t.sum)), n]);
      const [jc, jn] = joins.length ? maxBy(joins, (t) => [t[0], -t[1]]) : [0.0, null];
      out.joins = jn !== null && jc >= P.THEME_COS ? outT.findIndex((t) => t.members === themes[jn].members) : null;
      // the abstract's word for each word of the question it shares ("delegate" -> "delegation")
      // only the talk's key words: its title and its findings
      const it = this.items[i];
      const key = new Set(findW(it.title.toLowerCase()).map(lemma));
      for (const c of info.cards) for (const pp of [c.f, c.o]) if (pp >= 0) for (const w of this.ptoks[pp]) key.add(w);
      const asurf = surfaceOf([it.title, it.abstract]);
      const mineS = surfaceOf([nw]);
      const terms = [];
      for (const w of content(nw)[0]) {
        if (PEOPLE.has(w) || PEOPLE.has(w + "s") || STOPW.has(w) || PLAIN.has(w) || subject.has(w)) continue;
        const x = absSorted.find((x) => key.has(x) && !STOPW.has(x) && same(w, x));
        if (x && !terms.some((t) => t.key === x)) terms.push({ key: x, word: show(mineS.get(w) || w), abstract: show(asurf.get(x) || x) });
      }
      out.terms = terms.slice(0, 2);
    }
    return out;
  }

  async node(req) {
    const q = await this._arcQuestion(req);
    const i = this.arc._itemById(req.id);
    const v = this._angle(i, q, req.angle ?? null);
    const out = this._node(i, v);
    const it = this.items[i];
    const info = this.info.get(i) || {};
    const deb = info.debut || new Set();
    const authors = it.authors.map((a, k) => {
      const af = a.affiliations.length ? a.affiliations[0] : {};
      const others = this.arc._appearances(a.name).filter((x) => x.id !== it.id);
      return { name: a.name, institution: af.institution ?? "", country: af.country ?? "", debut: deb.has(k),
               badge: deb.has(k) ? "First CHI paper" : null,
               also_here: others.slice(0, 3).map((x) => ({ id: x.id, kind: x.kind, title: x.title,
                                                           line: `${x.day_label} · ${x.time} · ${x.room}` })) };
    });
    const slots = this.arc.slots.get(i) || [];
    const s = slots.length ? slots[0] : null;
    let when = null;
    if (s && s.start) {
      const place = out.badge === "POSTER" || out.badge === "DEMO" ? this._where(s, out.badge) : s.room.split(" - ").pop();
      when = `${dayLabel(s.start.slice(0, 10)).split(" ")[0]} ${hhmm(s.est_start)} · ${place}`;
    }
    const seeds = (this.arc.summaries.get(it.id) || {}).questions || [];
    Object.assign(out, {
      why_label: `WHY IT ${ANGLE_NAME[v.angle].toUpperCase()}`,
      format_label: FORMAT_LABEL[out.badge] ?? out.type,
      when_line: when, first_author: authors.length ? authors[0] : null,
      authors, abstract: it.abstract,
      session: !s ? null : {
        name: s.session, day_label: s.start ? dayLabel(s.start.slice(0, 10)) : null,
        time: s.est_start ? (s.est_end !== s.end ? "~" : "") + hhmm(s.est_start) : null,
        room: s.room, order: s.order ?? null, of: s.of ?? null, chairs: s.chairs || [],
      },
      questions: seeds.map((x) => ({ text: x, votes: 0, seed: true })),
      questions_note: "Starter questions written offline from the abstract. Posting and votes are the app's Q&A service, not this model.",
      help: HELP[v.angle],
    });
    return out;
  }

  // -- 18 / 19 shared, 13 list ----------------------------------------------------------------
  // a talk's angle, or the one the user gave it in 15 Edit, so that the map, the list,
  // the detail and a shared link all show the same angle
  _angle(i, q, user = null) {
    const v = (q.kind === "relation" ? this.judge(i, q) : null) || RELATED();
    if (!ANGLES.includes(user) || user === v.angle) return v;
    return { angle: user, subtype: user === "reframe" ? "related" : (user === "support" ? "evidence" : "opposite"),
             conf: v.conf, card: v.card ?? null, caveat: null, by_user: true };
  }

  // {"<talk id>": angle} the user set by hand (sent with shared links, the list, the detail)
  _userAngles(req) {
    const m = truthy(req.angles) ? req.angles : {};
    if (typeof m !== "object" || Array.isArray(m)) throw new InputError("angles must map talk ids to support, reframe or challenge");
    return new Map(Object.entries(m).map(([k, a]) => [this._ids([k], "angles")[0], pyStr(a)]));
  }

  _plainRoute(q, ids, now, heard = [], user = new Map()) {
    const chosen = new Map(), placed = [], reads = [];
    for (const i of ids) {
      chosen.set(i, this._angle(i, q, user.has(i) ? user.get(i) : null));
      const s = (this.arc.slots.get(i) || [null])[0] || null;
      if (s && s.start) {
        const [a, b, flexible] = this.arc._interval(i, s);
        placed.push({ i, slot: s, start: a, end: flexible ? a.plus(VISIT_MIN) : b, kind: "pick" });
      } else reads.push(i);
    }
    return this._route(placed, reads, chosen, now, heard);
  }

  async _pool20(text) {
    const score = await this._rank(text);
    return [score, argsortDesc(score).filter((i) => this.aliveSet.has(i)).slice(0, 20)];
  }

  async shared(req) {
    const q = await this._arcQuestion(req);
    const ids = this._ids(req.ids, "ids");
    if (!ids.length) throw new InputError("shared needs the Arc's talk ids");
    const now = this._nowOf(req);
    const nodes = this._plainRoute(q, ids, now, [], this._userAngles(req));
    for (const nd of nodes) { nd.keep = nd.state !== "ended"; nd.locked = nd.state === "ended"; }
    const ahead = nodes.filter((nd) => nd.state === "next" || nd.state === "upcoming");
    let line = null;
    if (now !== null) {
      const f = ahead.length ? ahead[0] : null;
      line = `It's ${now.hhmm()} · ${ahead.length} of ${nodes.length} stops still ahead` + (f ? ` · first one ${f.time}, ${f.where}` : "");
    }
    const counts = new Counter();
    for (const nd of nodes) counts.add(nd.angle);
    const nKeep = nodes.filter((nd) => nd.keep).length;
    const [score, pool] = await this._pool20(q.text);
    return { question: q.text, shared: true, label: "Shared Arc", tribe: this._tribe(score, pool), nodes,
             counts: Object.fromEntries(ANGLES.map((a) => [a, counts.count(a)])), line,
             pick: { headline: "Pick what to keep.", legend: ["Keep", "Skip", "Ended"], button: `Add ${nKeep} to my Arcs`, keep: nKeep },
             result: "A new Arc with the sender's question (Q12).", data_version: this.version,
             note: "Your question and talks only. Never your name." };
  }

  async summary(req) {
    const q = await this._arcQuestion(req);
    const ids = this._ids(req.ids, "ids");
    const hsrc = (req.state || {}).heard;
    const heard = this._ids(truthy(hsrc) ? hsrc : req.heard, "heard").map((i) => this.items[i].id);
    const nodes = this._plainRoute(q, ids, this._nowOf(req), heard, this._userAngles(req));
    const pre = { heard: "Heard", next: "Next", ended: "Missed", upcoming: "", read: "" };
    const groups = { support: [], reframe: [], challenge: [] };
    for (const nd of nodes) {
      groups[nd.angle].push({ id: nd.id, title: nd.title, badge: nd.badge, label: nd.label, state: nd.state,
                              line: [pre[nd.state], nd.line].filter(Boolean).join(" · "), doi: nd.doi, why: nd.why.text });
    }
    const md = [`# ${q.text}`, ""], bib = [];
    for (const a of ANGLES) {
      if (!groups[a].length) continue;
      md.push(`## ${ANGLE_NAME[a]} ${SYMBOL[a]}`);
      for (const g of groups[a]) {
        md.push(`- ${g.title}. CHI 2026. ${g.doi}`);
        const key = g.title.toLowerCase().split(/\s+/).filter(Boolean)[0].replace(/[^a-z]/g, "") + String(g.id);
        bib.push(`@inproceedings{${key},\n  title = {${g.title}},\n  booktitle = {Proceedings of the CHI Conference on Human Factors in Computing Systems},\n`
          + `  year = {2026},\n  doi = {${(g.doi || "").replace("https://doi.org/", "")}}\n}`);
      }
      md.push("");
    }
    const out = { question: q.text,
                  groups: ANGLES.map((a) => ({ key: a, name: ANGLE_NAME[a], symbol: SYMBOL[a], count: groups[a].length, items: groups[a] })),
                  counts: Object.fromEntries(ANGLES.map((a) => [a, groups[a].length])),
                  heard: nodes.filter((nd) => nd.state === "heard").length,
                  reading_list: { markdown: md.join("\n").trim(), bibtex: bib.join("\n\n") }, open: null };
    if (!groups.challenge.length) {
      out.open = { text: NO_CHALLENGE.en,
                   follow_up: q.kind === "relation" ? `When does ${q.x} not ${q.dir === "-" ? "reduce" : "raise"} ${q.y || "it"}?` : null };
    }
    return out;
  }

  // -- 20 / 21 home ------------------------------------------------------------------------
  async home(req) {
    const arcs = truthy(req.arcs) ? req.arcs : [];
    if (!Array.isArray(arcs)) throw new InputError('arcs must be a list of {"question", "ids", "heard"}');
    const now = this._nowOf(req);
    const today = this._today(now);
    const out = [];
    for (const [k, a] of arcs.entries()) {
      if (a === null || typeof a !== "object" || Array.isArray(a) || !truthy(a.question)) throw new InputError(`arcs[${k}] needs a question`);
      const q = await this.question(a.question);
      const ids = this._ids(a.ids, `arcs[${k}].ids`);
      const heard = new Set(this._ids(a.heard, `arcs[${k}].heard`));
      const [score, pool] = await this._pool20(q.text);
      const tr = this._tribe(score, pool);
      const days = [...new Set(ids.flatMap((i) => (this.arc.slots.get(i) || []).slice(0, 1).filter((s) => s.start).map((s) => s.start.slice(0, 10))))].sort();
      const label = (d) => dayLabel(d).split(" ")[0];
      let when;
      const later = days.filter((d) => d > today);
      const allHeard = ids.length && ids.every((i) => heard.has(i));
      if (allHeard) when = `${label(days.length ? days[days.length - 1] : today)} · all heard`;
      else if (days.includes(today)) when = "Today";
      else when = later.length ? label(later[0]) : (days.length ? label(days[days.length - 1]) : "");
      // 20: Today / This week / After CHI (all heard, or its days are over)
      const tab = days.includes(today) && !allHeard ? "today" : later.length || days.includes(today) ? "week" : "after";
      out.push({ question: q.text, tribe: tr ? { name: tr.name, symbol: tr.symbol, shape: tr.shape, color: tr.color } : null,
                 when, tab, talks: ids.length, heard: ids.filter((i) => heard.has(i)).length });
    }
    return { title: "My Arcs", arcs: out, empty: out.length ? null : { text: "Start with one question.", button: "New Arc" },
             buttons: ["New Arc", "CHI 101"] };
  }

  // -- meta --------------------------------------------------------------------------------
  async meta() {
    return { tribes: this.tribes, angles: ANGLES.map((a) => ({ key: a, name: ANGLE_NAME[a], symbol: SYMBOL[a], help: HELP[a] })),
             help_note: HELP_NOTE, subtypes: SUBTYPE,
             formats: Object.entries(FORMATS).map(([k, v]) => ({ key: k, types: v, default: DEFAULT_FORMATS.includes(k) })),
             when: ["today", "tomorrow", "week"],
             days: this.arc.days.map((d) => ({ day: d, label: dayLabel(d) })), data_version: this.version };
  }

  async handle(req) {
    if (req === null || typeof req !== "object" || Array.isArray(req)) throw new InputError("request must be a JSON object");
    const screens = { ask: (r) => this.ask(r), angles: (r) => this.anglesScreen(r), arc: (r) => this.arcScreen(r),
                      edit: (r) => this.edit(r), node: (r) => this.node(r), shared: (r) => this.shared(r),
                      summary: (r) => this.summary(r), home: (r) => this.home(r), meta: (r) => this.meta(r),
                      hold: (r) => this.hold(r), questions: (r) => this.questions(r) };
    const s = req.screen;
    if (!(typeof s === "string" && Object.hasOwn(screens, s))) throw new InputError(`screen must be one of ${Object.keys(screens).join(", ")}`);
    return screens[s](req);
  }
}
