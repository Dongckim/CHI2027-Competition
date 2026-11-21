// ARC screen API in the browser or Node: one JSON request per wireframe screen, the
// same requests and responses as arc.py. The app keeps the user's answers and actions
// on the phone and sends them along; the model keeps no state.
//
//   const arc = await loadARC(base);            // load.mjs
//   const out = await arc.handle({screen: "route", day: "tue",
//                                 profile: {research: "haptic feedback for VR"}});
import {
  InputError, PyValueError, Counter, DT, dayLabel, weekdayName, getCloseMatches, SequenceMatcher,
  f32, minmax, matvec, row, dot, normalize, meanRows, argsortDesc, sortedBy, maxBy, minBy, pyDumps,
  pyStr, pyInt, pyRound, truthy, or, isDigits,
} from "./py.mjs";
import { Explorer, hasPrefixes, hasWords, norm } from "./explorer.mjs";
import { STOP, keywordSpans, nonLatin, relevance } from "./retriever.mjs";

const TRACKS = {
  Papers: ["Paper", "Journals"],
  Posters: ["Posters", "Student Research Competition"],
  Demos: ["Interactive Demos"],
  Workshops: ["Workshop"],
  Panels: ["Panels"],
  Keynotes: ["Plenary and Keynote"],
};
const DEFAULT_TRACKS = ["Papers", "Posters", "Demos"];
const BADGE = {
  "Paper": "PAPER", "Journals": "PAPER", "Posters": "POSTER",
  "Student Research Competition": "POSTER", "Interactive Demos": "DEMO",
  "Workshop": "WORKSHOP", "Panels": "PANEL", "Plenary and Keynote": "KEYNOTE",
  "Meet-Ups": "MEETUP", "Student Mentoring Program": "MENTORING",
  "SIGCHI Awards": "AWARD", "Course": "COURSE",
};
// v3 O-5c: stops a day and the extra minutes kept free between stops
const PACE = { 1: ["Light", 4, 20], 2: ["Balanced", 6, 10], 3: ["Full", 8, 5] };
const PACE_NAMES = { light: 1, balanced: 2, full: 3 };
// v3 O-4 "What would make CHI easier?"
const NEEDS = { step_free: "Step-free routes", fewer_room_changes: "Fewer room changes",
                breaks: "Breaks between talks", larger_text: "Larger text", summaries: "Summaries in your language" };
const BREAK_EXTRA = 10;
const SAME_ROOM_BONUS = 0.92;
const REGISTRATION = new Set(["Workshops"]);
const VISIT_MIN = 20;
const POOL = 120;
const REC_K = 16;
const PLAN_M = 40;
const PLAN_STEP = 15;
const PLANNERS = ["greedy", "best"];
// 11/7: a grade per talk (against the best match), and 2nd / 3rd choices per stop
const GRADES = [["A", 0.9], ["B", 0.8], ["C", 0.7]];
const GRADING = { A: "90% or more of the best match", B: "80-90% of it", C: "70-80%", D: "under 70%" };
const OPTIONS_K = 2;
const SHELF_K = 6;
const SHELF_TYPES = {
  keynotes: ["Plenary and Keynote"], demos: ["Interactive Demos"],
  posters: ["Posters", "Student Research Competition"], workshops: ["Workshop"], panels: ["Panels"],
};
const METHOD = new Set(`review reviews systematic scoping survey surveys interview interviews study
studies analysis evaluation evaluating experience experiences approach approaches framework
frameworks effect effects impact impacts role roles case cases perspective perspectives
insight insights lesson lessons toward towards exploring investigating understanding
examining comparing design designing designs implications challenges opportunities
participants user users results findings method methods feel feeling generated
generating generation exploration driven based enabled supported aware`.split(/\s+/));
const PAREN = /^(.*?)\s*\(([^()]+)\)\s*$/u;

const hhmm = (iso) => (iso ? iso.slice(11, 16) : null);
const T = (iso) => DT.parse(iso);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const first = (arr, pred) => { for (const x of arr) if (pred(x)) return x; return null; };
const maxT = (a, b) => (b.ms > a.ms ? b : a);      // Python max(): the first on a tie
const minT = (a, b) => (b.ms < a.ms ? b : a);

function levelLine(floor) {
  const lvl = level(floor);
  return lvl.startsWith("Auditorium") || !lvl ? lvl : `Level ${lvl}`;
}

function level(floor) {
  if (!floor) return "";
  const name = floor.replace(/^\d+\.\s*/, "");
  const k = name.lastIndexOf(" - ");
  const place = k >= 0 ? name.slice(0, k) : "", lvl = k >= 0 ? name.slice(k + 3) : "";
  if (place.startsWith("Auditorium")) return `Auditorium ${lvl.replace("Lever", "Level")}`;
  return lvl || name;
}

// timedelta.seconds of (b - a): the seconds part, 0..86399
const tdSeconds = (b, a) => ((((b.ms - a.ms) / 1000) % 86400) + 86400) % 86400;

export class ARC {
  /** pkg: {config, program, expansions, programEmb, venue, clusters, embed} */
  constructor(pkg) {
    this.ex = new Explorer(pkg);
    this.items = this.ex.items;
    this.emb = this.ex.emb;
    this.D = this.emb.d;
    this.venue = pkg.venue;
    this.days = this.venue.days;
    this.roomFloor = new Map(this.venue.rooms.map((r) => [r.name, r.floor]));
    this.floorMap = new Map(this.venue.floors.map((f) => [f.name, f.map]));
    this.alive = this.items.map((_, i) => i).filter((i) => !this.ex.dup[i]);
    this.aliveSet = new Set(this.alive);
    this.texts = this.items.map((it) => " " + norm(`${it.title} ${it.abstract}`) + " ");
    this.ntitle = this.items.map((it) => norm(it.title));
    this.slots = new Map(this.alive.map((i) => [i, this.ex._slots(i)]));
    this.typeOf = this.items.map((it) => it.type);
    this.idPos = new Map(this.items.map((it, i) => [it.id, i]));
    const topicItems = new Map();
    for (const i of this.alive) {
      if (TRACKS.Papers.includes(this.items[i].type)) {
        for (const s of this.slots.get(i)) {
          if (!topicItems.has(s.session)) topicItems.set(s.session, new Set());
          topicItems.get(s.session).add(i);
        }
      }
    }
    for (const i of this.alive) for (const s of this.slots.get(i)) if (topicItems.has(s.session)) topicItems.get(s.session).add(i);
    this.topics = [...topicItems.keys()].sort();
    this.topicItems = new Map([...topicItems].map(([t, v]) => [t, [...v].sort((a, b) => a - b)]));
    this.topicEmb = this.topics.map((t) => normalize(meanRows(this.emb.data, this.D, this.topicItems.get(t))));
    this.topicOf = new Map();
    for (const [t, ids] of this.topicItems) for (const i of ids) if (!this.topicOf.has(i)) this.topicOf.set(i, t);
    for (const i of this.alive) {
      if (this.topicOf.has(i)) continue;
      const v = row(this.emb.data, this.D, i);
      let best = 0, bv = -Infinity;
      this.topicEmb.forEach((te, j) => { const s = dot(v, te); if (s > bv) { bv = s; best = j; } });
      this.topicOf.set(i, this.topics[best]);
    }
    this.byAuthor = new Map();
    for (const i of this.alive) {
      for (const a of this.items[i].authors) {
        if (!this.byAuthor.has(a.name)) this.byAuthor.set(a.name, []);
        this.byAuthor.get(a.name).push(i);
      }
    }
    this.chairing = new Map();
    for (const s of this.venue.sessions) {
      for (const c of s.chairs) {
        if (!this.chairing.has(c)) this.chairing.set(c, []);
        this.chairing.get(c).push(s);
      }
    }
    this._authorEmb = null;
    this.dfCache = new Map();
    // one-line summaries and questions to ask, written offline by an LLM (optional)
    this.summaries = new Map(Object.entries(pkg.summaries || {}).map(([k, v]) => [+k, v]));
    this.qcache = new Map();
    this.clusters = [];
    this.clusterOf = new Map();
    this.subOf = new Map();
    if (pkg.clusters) {
      for (const c of pkg.clusters.clusters) {
        const idx = c.items.filter((x) => this.idPos.has(x)).map((x) => this.idPos.get(x));
        this.clusters.push({ ...c, idx, emb: normalize(meanRows(this.emb.data, this.D, idx)) });
        for (const i of idx) this.clusterOf.set(i, this.clusters.length - 1);
        (c.subclusters || []).forEach((sc, sn) => {
          for (const x of sc.items) if (this.idPos.has(x)) this.subOf.set(this.idPos.get(x), [this.clusters.length - 1, sn]);
        });
      }
      this.items.forEach((_, i) => {
        if (!this.clusterOf.has(i) && this.ex.dup[i]) {
          const j = this._canon(i);
          if (this.clusterOf.has(j)) this.clusterOf.set(i, this.clusterOf.get(j));
          if (this.subOf.has(j)) this.subOf.set(i, this.subOf.get(j));
        }
      });
    }
  }

  // -- helpers ------------------------------------------------------------
  async _embed(q) {
    if (!this.qcache.has(q)) this.qcache.set(q, await this.ex.embed(q));
    return this.qcache.get(q);
  }

  _profile(req, needResearch = true) {
    const p = "profile" in req ? req.profile : req;
    if (!isObj(p)) throw new InputError("profile must be a JSON object");
    const research = pyStr(or(p.research, "")).trim();
    const keywords = this._strList(p.keywords, "keywords");
    const topics = this._strList(p.topics, "topics");
    if (needResearch && !(research || keywords.length || topics.length)) {
      throw new InputError('give the research sentence: "research": "I study ..." (or "keywords": [...])');
    }
    const tl = this._strList(p.tracks, "tracks");
    const tracks = tl.length ? tl : DEFAULT_TRACKS;
    const bad = tracks.filter((t) => !(t in TRACKS));
    if (bad.length) throw new InputError(`unknown track(s) ${pyStr(bad)}; use any of ${pyStr(Object.keys(TRACKS))}`);
    let pace = "pace" in p ? p.pace : 2;
    if (typeof pace === "string" && Object.hasOwn(PACE_NAMES, pace.trim().toLowerCase())) pace = PACE_NAMES[pace.trim().toLowerCase()];
    else if (typeof pace === "string" && isDigits(pace.trim())) pace = parseInt(pace.trim(), 10);
    if (typeof pace === "boolean" || !(typeof pace === "number" && pace in PACE && Number.isInteger(pace))) {
      throw new InputError(`pace must be light, balanced or full (1-3), got ${pyDumps(pace ?? null)}`);
    }
    const needs = this._strList(p.needs, "needs");
    const badN = needs.filter((x) => !Object.hasOwn(NEEDS, x));
    if (badN.length) throw new InputError(`unknown need(s) ${pyStr(badN)}; use any of ${pyStr(Object.keys(NEEDS))}`);
    const given = this._strList(p.days, "days").map((d) => this._day(d));
    const days = given.length ? [...new Set(given)].sort() : [...this.days];
    let stepFree = "step_free" in p ? p.step_free : false;
    if (typeof stepFree === "string") stepFree = ["1", "true", "yes", "y"].includes(stepFree.toLowerCase());
    stepFree = truthy(stepFree) || needs.includes("step_free");
    const auto = keywords.length ? keywords : (research ? this._extract(research) : []);
    return { research, keywords, topics, auto_keywords: auto, days_given: given.length > 0, tracks, pace, days,
             step_free: truthy(stepFree), needs, language: pyStr(or(p.language, "en")) };
  }

  _strList(v, name) {
    if (v === null || v === undefined) return [];
    if (typeof v === "string") v = v.split(/\s*[,;]\s*/u).filter(Boolean);
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string" || typeof x === "boolean"
        || (typeof x === "number" && Number.isInteger(x)))) {
      throw new InputError(`${name} must be a list of strings`);
    }
    return v.map((x) => pyStr(x).trim()).filter(Boolean);
  }

  _day(d) {
    const s = pyStr(d).trim().toLowerCase();
    for (const day of this.days) {
      const wd = weekdayName(day);
      if (s === day || s === day.slice(5) || (s.length >= 3 && wd.startsWith(s))) return day;
    }
    throw new InputError(`unknown day "${pyStr(d)}"; the conference days are `
      + this.days.map((x) => `${x} (${dayLabel(x)})`).join(", "));
  }

  _state(req) {
    const st = or(req.state, {});
    if (!isObj(st)) throw new InputError("state must be a JSON object");
    const idxList = (key) => {
      const out = [];
      const v = or(st[key], []);
      for (const x of typeof v === "string" ? Array.from(v) : v) {
        const xid = isObj(x) ? (x.id ?? null) : x;
        let i;
        try {
          i = this.idPos.get(pyInt(xid));
        } catch (e) {
          i = undefined;
        }
        if (i === undefined) throw new InputError(`state.${key}: unknown item id ${pyDumps(xid ?? null)}`);
        out.push(this._canon(i));
      }
      return out;
    };
    const addedFrom = new Map();
    for (const x of or(st.added, [])) {
      if (isObj(x) && truthy(x.from)) addedFrom.set(x.id ?? null, pyStr(x.from));
    }
    const af = new Map();
    for (const [k, v] of addedFrom) {
      if (isDigits(pyStr(k)) && this.idPos.has(pyInt(k))) af.set(this._canon(this.idPos.get(pyInt(k))), v);
    }
    return {
      saved: idxList("saved"), attended: idxList("attended"), cart: [...new Set(idxList("cart"))],
      removed: new Set(idxList("removed")),
      added: idxList("added"), declined: new Set(idxList("declined")), added_from: af,
      opened_authors: this._strList(st.opened_authors, "opened_authors"),
    };
  }

  _instKey(name) {
    const m = PAREN.exec(name);
    return this.ex.inst.find(norm(m ? m[1] : name));
  }

  _canon(i) {
    if (!this.ex.dup[i]) return i;
    const t = this.items[i].type, ti = this.items[i].title.trim().toLowerCase();
    return first(this.alive, (j) => this.items[j].type === t && this.items[j].title.trim().toLowerCase() === ti);
  }

  _itemById(xid) {
    let id;
    try {
      id = pyInt(xid ?? null);
    } catch (e) {
      throw new InputError(`id must be a program item id, got ${pyDumps(xid ?? null)}`);
    }
    if (this.idPos.has(id)) return this._canon(this.idPos.get(id));
    throw new InputError(`no program item with id ${id}`);
  }

  _query(p) {
    return this.ex.speller.fix(p.keywords.length ? [...p.keywords, ...p.topics].join("; ") : [p.research, ...p.topics].join("; "));
  }

  async _score(p) {
    const q = this._query(p);
    const a = minmax(this.ex.sims(await this._embed(q))), b = minmax(this.ex.bm25.scores(q));
    const w = f32(this.ex.cfg.hybrid_w);
    return Float32Array.from(a, (x, i) => f32(x + f32(w * b[i])));
  }

  _warnings(p) {
    const w = [];
    if (nonLatin([p.research, ...p.keywords, ...p.topics].join(" "))) {
      w.push("The model reads English only; translate the research sentence to English first, or the picks may be unrelated.");
    }
    return w;
  }

  _allowed(tracks) {
    const types = new Set(tracks.flatMap((t) => TRACKS[t]));
    return this.typeOf.map((t) => types.has(t));
  }

  _pool(p, score) {
    const allowed = this._allowed(p.tracks);
    const idx = this.alive.filter((i) => allowed[i]);
    return sortedBy(idx, (i) => -score[i]).slice(0, POOL);
  }

  _df(phrase) {
    if (!this.dfCache.has(phrase)) {
      const pat = ` ${phrase} `;
      let n = 0;
      for (const i of this.alive) if (this.texts[i].includes(pat)) n++;
      this.dfCache.set(phrase, n);
    }
    return this.dfCache.get(phrase);
  }

  _shared(i, p, fallback = true) {
    const out = [];
    for (const k of [...(p.keywords.length ? p.keywords : (p.auto_keywords || [])), ...p.topics]) {
      const nk = norm(k);
      if (nk && (hasWords(this.texts[i], nk) || (nk.endsWith("s") && hasWords(this.texts[i], nk.slice(0, -1)))
          || hasWords(this.texts[i], nk + "s"))) out.push(k);
    }
    if (!out.length && fallback) {
      let words = norm([...p.keywords, ...p.topics].join(" ") + " " + p.research).split(" ")
        .filter((w) => w && !STOP.has(w) && Array.from(w).length > 2);
      words = [...new Set(words)];
      return words.filter((w) => hasWords(this.texts[i], w)).slice(0, 2);
    }
    return out;
  }

  _why(i, p, state = null) {
    if (state && state.saved.length) {
      const sims = state.saved.filter((j) => j !== i).map((j) => [dot(row(this.emb.data, this.D, i), row(this.emb.data, this.D, j)), j]);
      if (sims.length) {
        const [s, j] = maxBy(sims, (x) => x);
        if (s > (this.ex.cfg.same_topic_sim ?? 0.75)) {
          return { kind: "saved", keywords: [], saved_id: this.items[j].id, text: `Same topic as ${this.items[j].title}.` };
        }
      }
    }
    const sh = this._shared(i, p);
    if (sh.length) {
      return { kind: "keywords", keywords: sh, text: "Shares " + sh.slice(0, 2).join(" and ") + " with your research." };
    }
    return { kind: "meaning", keywords: [], text: "Close in meaning to your research." };
  }

  _slotOn(i, day) {
    return (this.slots.get(i) || []).filter((s) => s.start && s.start.slice(0, 10) === day);
  }

  _authorsShort(i) {
    return this.items[i].authors.map((a) => {
      const af = a.affiliations.length ? a.affiliations[0] : {};
      return { name: a.name, institution: af.institution ?? "", country: af.country ?? "" };
    });
  }

  _card(i, slot = null, p = null, state = null) {
    const it = this.items[i];
    slot = truthy(slot) ? slot : ((this.slots.get(i) || [])[0] || null);
    const a = this._authorsShort(i);
    const card = {
      id: it.id, type: it.type, badge: BADGE[it.type] ?? it.type.toUpperCase(), title: it.title,
      first_author: a.length ? a[0] : null,
      institutions: [...new Set(a.map((x) => x.institution).filter(Boolean))],
      countries: [...new Set(a.map((x) => x.country).filter(Boolean))],
      video: it.video, remote: it.remote, doi: it.doi,
    };
    if (slot) {
      const seq = slot.est_end !== slot.end;
      Object.assign(card, {
        day: slot.start ? slot.start.slice(0, 10) : null,
        day_label: slot.start ? dayLabel(slot.start.slice(0, 10)) : null,
        time: slot.est_start ? `~${hhmm(slot.est_start)}` : null,
        start: slot.est_start, end: slot.est_end,
        session_start: slot.start, session_end: slot.end,
        estimated: Boolean(seq),
        open_minutes: seq || !slot.start ? null : Math.trunc(tdSeconds(T(slot.end), T(slot.start)) / 60),
        room: slot.room, floor: slot.floor, level: level(slot.floor),
        session: slot.session,
        talk_order: seq && slot.order ? `Talk ${slot.order} of ${slot.of}` : null,
      });
    } else {
      Object.assign(card, { day: null, time: null, room: "", session: "",
                            note: it.remote ? "remote presentation (video only)" : "time TBA" });
    }
    if (p !== null) card.why = this._why(i, p, state);
    return card;
  }

  _grade(s, best) {
    const g = GRADES.find(([, t]) => best > 0 && s >= t * best);
    return { letter: g ? g[0] : "D", points: best > 0 ? pyRound(100 * s / best, 0) : 0 };
  }

  _walk(roomA, roomB, stepFree) {
    if (!roomA || !roomB) return null;
    if (roomA === roomB) return { to_room: roomB, minutes: "same room", min: 0, max: 0, step_free: true, via: null };
    const fa = this.roomFloor.get(roomA) ?? "", fb = this.roomFloor.get(roomB) ?? "";
    const same = fa === fb && fa;
    const [lo, hi] = same ? [2, 4] : [4, 6];
    let via;
    if (same) via = "same level";
    else if (stepFree) via = `elevator to Level ${level(fb)}`;
    else via = `stairs or elevator to Level ${level(fb)}`;
    return { to_room: roomB, minutes: `about ${lo}–${hi} min`, min: lo, max: hi,
             from_level: level(fa), to_level: level(fb), step_free: stepFree, via };
  }

  // -- 01-0 / 02-x / 03-1 ---------------------------------------------------
  async meta(req) {
    const n = new Counter();
    for (const i of this.alive) n.add(this.typeOf[i]);
    const v = this.venue;
    return {
      conference: { name: v.name, full_name: v.full_name, location: v.location, url: v.url, timezone: v.timezone },
      days: this.days.map((d) => ({ date: d, label: dayLabel(d, false), short: dayLabel(d) })),
      tracks: Object.entries(TRACKS).map(([t, types]) => ({ name: t, count: types.reduce((s, x) => s + n.count(x), 0),
                                                           default: DEFAULT_TRACKS.includes(t), registration_needed: REGISTRATION.has(t) })),
      pace: Object.entries(PACE).map(([k, x]) => ({ level: +k, id: x[0].toLowerCase(), name: x[0], talks_per_day: x[1],
                                                   line: `About ${x[1]} stops a day`, break_min: x[2], default: +k === 2 })),
      needs: Object.entries(NEEDS).map(([k, v]) => ({ id: k, label: v, model: ["step_free", "fewer_room_changes", "breaks"].includes(k) })),
      languages: { model: ["en"], note: "The research sentence must be English. Summaries, captions and question help in other languages are app-side (not this model)." },
      sponsors: v.sponsors,
    };
  }

  // -- 01-2 ---------------------------------------------------------------
  _extract(text) {
    return this._spans(text).map((f) => f.keyword);
  }

  _spans(text) {
    return keywordSpans(text, (ph) => this._df(ph), this.alive.length);
  }

  async keywords(req) {
    const p = this._profile(req);
    const text = p.research;
    if (!text) throw new InputError('keywords needs "research": the user\'s sentence');
    const found = this._spans(text);
    const pkw = { ...p, keywords: found.map((f) => f.keyword) };
    const score = await this._score(found.length ? pkw : p);
    const related = this._relatedTerms(score, new Set(found.map((f) => norm(f.keyword))));
    const warnings = this._warnings(p);
    if (!found.length) warnings.push("No keyword from the sentence appears in the CHI program; add topics by hand or use the related suggestions.");
    return { sentence: text, keywords: found, related, warnings };
  }

  _relatedTerms(score, exclude, k = 4) {
    const top = argsortDesc(score).slice(0, 30);
    const docs = new Map();
    for (const i of top) {
      const words = norm(this.items[i].title).split(" ").filter(Boolean);
      let run = [];
      for (const w of [...words, null]) {
        if (w === null || STOP.has(w) || METHOD.has(w) || Array.from(w).length < 3) {
          for (const n of [2, 1]) {
            for (let a = 0; a < run.length - n + 1; a++) {
              const ph = run.slice(a, a + n).join(" ");
              if (!docs.has(ph)) docs.set(ph, new Set());
              docs.get(ph).add(i);
            }
          }
          run = [];
        } else run.push(w);
      }
    }
    const nDocs = this.alive.length;
    const ex = [...exclude];
    const cnt = new Counter();
    for (const [ph, ds] of docs) {
      if (ds.size < 3 || exclude.has(ph) || ex.some((e) => e.includes(ph) || ph.includes(e))) continue;
      const df = this._df(ph);
      if (df < 5 || df > 0.08 * nDocs) continue;
      cnt.set(ph, ds.size * (ph.includes(" ") ? 1.5 : 1.0));
    }
    const out = [];
    for (const [ph] of cnt.mostCommon()) {
      if (out.some((o) => o.includes(ph) || ph.includes(o))) continue;
      out.push(ph);
      if (out.length === k) break;
    }
    return out.map((ph) => ({ topic: ph, talks: this._df(ph) }));
  }

  // -- 01-3 ---------------------------------------------------------------
  async _topicRank(p) {
    const q = await this._embed(this._query(p));
    const sims = this.topicEmb.map((t) => dot(t, q));
    return [argsortDesc(sims).map((j) => this.topics[j]), sims];
  }

  async nearby(req) {
    const p = this._profile(req);
    const [ranked] = await this._topicRank(p);
    const k = pyInt(or(req.top_k, 5));
    const sessions = ranked.slice(0, k).map((t) => ({ topic: t, talks: this.topicItems.get(t).length }));
    const adjacent = [];
    const kws = p.auto_keywords;
    for (const t of ranked.slice(k, k + 40)) {
      const ids = this.topicItems.get(t);
      let best = [null, []];
      if (kws.length) best = maxBy(kws.map((kw) => [kw, ids.filter((i) => hasWords(this.texts[i], norm(kw)))]), (x) => x[1].length);
      if (best[1].length >= 2) {
        const n = best[1].length;
        adjacent.push({ field: t, shares: best[0], talks: n, why: `Shares ${best[0]} · ${n} talks`, suggested: !adjacent.length });
      }
      if (adjacent.length === 3) break;
    }
    return { adjacent, sessions, more_topics: this.topics.length - k, warnings: this._warnings(p) };
  }

  // -- 02-1 ---------------------------------------------------------------
  async days_screen(req) {
    const p = this._profile(req);
    const pool = this._pool(p, await this._score(p));
    const out = this.days.map((d) => {
      const ids = pool.filter((i) => this._slotOn(i, d).length);
      const top = new Counter(); for (const i of ids) if (this.topicOf.has(i)) top.add(this.topicOf.get(i));
      const mc = top.mostCommon(1);
      return { date: d, label: dayLabel(d, false), talks_for_you: ids.length, theme: null,
               top_topic: mc.length ? mc[0][0] : null, selected: p.days.includes(d) };
    });
    return { days: out, pool: POOL, warnings: this._warnings(p),
             note: "The program data has no day themes (theme is null; hide the line). top_topic is the most common session topic among your talks that day." };
  }

  // -- 03 -----------------------------------------------------------------
  _interval(i, slot) {
    const s = T(slot.est_start), e = T(slot.est_end);
    const t = this.items[i].type;
    if (TRACKS.Papers.includes(t)) return [s, e, false];
    if ([...TRACKS.Posters, ...TRACKS.Demos].includes(t)) return [s, e, true];
    return [s, e, false];
  }

  _fit(placed, i, slot, gapMin, stepFree) {
    const [s, e, flexible] = this._interval(i, slot);
    const dur = flexible ? VISIT_MIN : e.minus(s);
    let t = s;
    while (t.plus(dur).ms <= e.ms) {
      let clash = null;
      for (const q of placed) {
        const w = this._walk(q.slot.room, slot.room, stepFree);
        const need = gapMin + (w ? w.max : 5);
        if (t.ms < q.end.plus(need).ms && q.start.ms < t.plus(dur + need).ms) { clash = q; break; }
      }
      if (!clash) return [t, t.plus(dur)];
      if (!flexible) return null;
      t = clash.end.plus(gapMin + 6);
    }
    return null;
  }

  _apart(a, b, gap, stepFree) {
    const w = this._walk(a.slot.room, b.slot.room, stepFree);
    const need = gap + (w ? w.max : 5);
    return b.start.ms >= a.end.plus(need).ms || a.start.ms >= b.end.plus(need).ms;
  }

  _planSameLevel(cands, placed, n, added, score, place) {
    const tried = new Set();
    while (placed.filter((q) => q.kind === "pick").length < n) {
      const ranked = [];
      cands.forEach(([i, slot], k) => {
        if (added.has(i) || tried.has(k) || placed.some((q) => q.i === i)) return;
        let v = score[i];
        if (placed.length) {
          const t = T(slot.est_start);
          const near = minBy(placed, (q) => Math.abs(q.start.ms - t.ms) / 1000);
          if (this.roomFloor.get(near.slot.room) !== this.roomFloor.get(slot.room)) v *= SAME_ROOM_BONUS;
        }
        ranked.push([-v, k]);
      });
      if (!ranked.length) return;
      ranked.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
      let ok = false;
      for (const [, k] of ranked) {
        tried.add(k);
        if (place(cands[k][0], cands[k][1], "pick")) { ok = true; break; }
      }
      if (!ok) return;
    }
  }

  _planBest(cands, fixed, n, gap, stepFree, added, score) {
    const taken = new Set(fixed.map((q) => q.i));
    let order = [];
    for (const [i] of cands) if (!added.has(i) && !taken.has(i) && !order.includes(i)) order.push(i);
    order = order.slice(0, PLAN_M);
    const bit = new Map(order.map((i, k) => [i, 1n << BigInt(k)]));
    const opts = [];
    for (const [i, slot] of cands) {
      if (!bit.has(i)) continue;
      const [s, e, flexible] = this._interval(i, slot);
      let starts = [s];
      if (flexible) {
        starts = [];
        for (let t = s; t.plus(VISIT_MIN).ms <= e.ms; t = t.plus(PLAN_STEP)) starts.push(t);
      }
      for (const t of starts) {
        const o = { i, slot, start: t, end: flexible ? t.plus(VISIT_MIN) : e, kind: "pick" };
        if (fixed.every((q) => this._apart(q, o, gap, stepFree))) opts.push(o);
      }
    }
    const so = sortedBy(opts, (o) => o.start.ms);
    const before = so.map((ox, x) => {
      const ys = [];
      for (let y = 0; y < x; y++) if (so[y].end.ms <= ox.start.ms && this._apart(so[y], ox, gap, stepFree)) ys.push(y);
      return ys;
    });
    const best = so.map((o) => [score[o.i], null, bit.get(o.i)]);
    const top = so.length ? 0 : null;
    const layers = [best];
    for (let r = 0; r < n - 1; r++) {
      const prev = layers[layers.length - 1], cur = [];
      so.forEach((o, x) => {
        let b = null;
        for (const y of before[x]) {
          if (prev[y] && !(prev[y][2] & bit.get(o.i)) && (b === null || prev[y][0] > b[0])) b = [prev[y][0], y, prev[y][2]];
        }
        cur.push(b ? [b[0] + score[o.i], b[1], b[2] | bit.get(o.i)] : null);
      });
      layers.push(cur);
    }
    let bestVal = -1.0, end = null;
    layers.forEach((layer, c) => layer.forEach((v, x) => { if (v && v[0] > bestVal) { bestVal = v[0]; end = [c, x]; } }));
    if (end === null) return [];
    const plan = [];
    let [c, x] = end;
    while (x !== null) {
      plan.push({ ...so[x] });
      x = layers[c][x][1];
      c -= 1;
    }
    return top !== null ? plan.reverse() : [];
  }

  _options(stops, placed, cands, excluded, score, p, st, gap, best) {
    const taken = new Set([...placed.map((q) => q.i), ...excluded]);
    placed.forEach((q, n) => {
      const others = [...placed.slice(0, n), ...placed.slice(n + 1)];
      const opts = [], seen = new Set();
      for (const [i, slot] of cands) {
        if (taken.has(i) || seen.has(i)) continue;
        const [s, e] = this._interval(i, slot);
        if (this._apart(q, { slot, start: s, end: e }, gap, p.step_free)) continue;
        const fit = this._fit(others, i, slot, gap, p.step_free);
        if (!fit) continue;
        seen.add(i);
        const c = this._card(i, slot, p, st);
        opts.push({ choice: opts.length + 2, id: c.id, title: c.title, badge: c.badge, time: `~${fit[0].hhmm()}`,
                    start: fit[0].iso(), end: fit[1].iso(), room: c.room, score: pyRound(score[i], 4),
                    grade: this._grade(score[i], best), why: c.why, swap: { replaces: stops[n].id, button: "Swap" } });
        if (opts.length === OPTIONS_K) break;
      }
      const x = stops[n];
      x.options = [{ choice: 1, id: x.id, title: x.title, badge: x.badge, time: x.time, start: x.start, end: x.end,
                     room: x.room, score: x.score, grade: x.grade, why: x.why ?? null, current: true }, ...opts];
    });
  }

  _recommend(cands, placed, stops, excluded, score, p, st, k) {
    const stopOf = new Map(placed.map((q, n) => [q.i, n]));
    const best = cands.reduce((m, [i]) => Math.max(m, score[i]), 0);
    const recs = [], seen = new Set();
    for (const [i, slot] of cands) {
      if (seen.has(i) || excluded.has(i)) continue;
      seen.add(i);
      const rank = recs.length + 1;
      const c = this._card(i, slot, p, st);
      const node = { rank, id: c.id, title: c.title, badge: c.badge, score: pyRound(score[i], 4), time: c.time,
                     start: c.start, end: c.end, room: c.room, institutions: c.institutions, countries: c.countries,
                     grade: this._grade(score[i], best) };
      if (stopOf.has(i)) Object.assign(node, { status: "in_route", stop: stopOf.get(i) + 1 });
      else {
        const [s, e] = this._interval(i, slot);
        if (this._fit(placed, i, slot, 0, p.step_free)) Object.assign(node, { status: "fits_free_time", stop: null });
        else {
          const overlap = (q) => (Math.min(e.ms, q.end.ms) - Math.max(s.ms, q.start.ms)) / 60000;
          const n = placed.length ? maxBy(placed.map((_, n) => n), (n) => [overlap(placed[n]), -Math.abs(placed[n].start.ms - s.ms) / 1000]) : null;
          if (n === null) Object.assign(node, { status: "fits_free_time", stop: null });
          else {
            const ov = Math.max(0, Math.trunc(overlap(placed[n])));
            Object.assign(node, { status: "alternative", stop: n + 1, overlap_min: ov });
            let reason;
            if (ov) reason = `same time as stop ${n + 1}`;
            else if (s.ms >= placed[n].end.ms) reason = `right after stop ${n + 1}, no time for the break and walk`;
            else reason = `right before stop ${n + 1}, no time for the break and walk`;
            const alt = { ...c, rank, score: node.score, grade: node.grade, overlap_min: ov, reason,
                          swap: { replaces: stops[n].id, button: "Swap" } };
            (stops[n].alternatives ??= []).push(alt);
          }
        }
      }
      recs.push(node);
      if (recs.length === k) break;
    }
    for (const s of stops) s.alternatives ??= [];
    return recs;
  }

  async route(req) {
    const p = this._profile(req, false);
    if (!(p.research || p.keywords.length || p.topics.length)) {
      return { state: "no_plan", empty: { title: "No plan yet", buttons: ["Plan my days", "Explore"] } };
    }
    const st = this._state(req);
    const day = this._day(or(req.day, p.days[0]));
    if (p.days_given && !p.days.includes(day)) {
      return { state: "not_attending", day, day_label: dayLabel(day),
               empty: { title: `You're not at CHI on ${dayLabel(day)}`, buttons: ["Add this day"] } };
    }
    const filt = this._filters(req.filters);
    const score = await this._score(p);
    const outOfRoute = st.declined;
    const pool = this._pool(p, score).filter((i) => !outOfRoute.has(i) && this._ok(i, filt));
    const cands = pool.flatMap((i) => this._slotOn(i, day).map((s) => [i, s]));
    const [name, nStops, gap0] = PACE[p.pace];
    const gap = gap0 + (p.needs.includes("breaks") ? BREAK_EXTRA : 0);
    let placed = [];
    const place = (i, slot, kind) => {
      const fit = this._fit(placed, i, slot, gap, p.step_free);
      if (fit) placed.push({ i, slot, start: fit[0], end: fit[1], kind });
      return fit;
    };
    const topTopics = new Set([...(await this._topicRank(p))[0].slice(0, 5), ...pool.slice(0, 30).map((i) => this.topicOf.get(i))]);
    let wildcard = this._wildcard(p, score, day, topTopics, { ...st, removed: outOfRoute }, filt);
    const regular = nStops - (wildcard ? 1 : 0);
    const added = new Set(st.added);
    if (wildcard && (added.has(wildcard[0]) || !place(wildcard[0], wildcard[1], "wildcard"))) wildcard = null;
    const planner = or(req.planner, "greedy");
    if (!PLANNERS.includes(planner)) throw new InputError(`planner must be one of ${pyStr(PLANNERS)}, got ${pyDumps(planner)}`);
    if (planner === "best") placed.push(...this._planBest(cands, placed, regular, gap, p.step_free, added, score));
    else if (p.needs.includes("fewer_room_changes")) this._planSameLevel(cands, placed, regular, added, score, place);
    else {
      for (const [i, slot] of cands) {
        if (placed.filter((q) => q.kind === "pick").length >= regular) break;
        if (added.has(i) || placed.some((q) => q.i === i)) continue;
        place(i, slot, "pick");
      }
    }
    let conflicts = [];
    for (const q of sortedBy(placed.filter((q) => q.kind === "pick"), (q) => -score[q.i])) {
      let alt = null;
      const lim = f32(f32(0.92) * score[q.i]);
      for (const [i, slot] of cands) {
        if (added.has(i) || placed.some((x) => x.i === i) || score[i] < lim) continue;
        const [s, e, flexible] = this._interval(i, slot);
        if (flexible || this._interval(q.i, q.slot)[2]) continue;
        if (s.ms < q.end.ms && q.start.ms < e.ms && !placed.some((x) => x !== q && s.ms < x.end.ms && x.start.ms < e.ms)) {
          alt = { i, slot, start: s, end: e, kind: "alternative" };
          break;
        }
      }
      if (alt) {
        placed.push(alt);
        conflicts.push([q, alt, "model"]);
        break;
      }
    }
    for (const i of st.added) {
      if (placed.some((q) => q.i === i)) continue;
      for (const slot of this._slotOn(i, day).slice(0, 1)) {
        if (!place(i, slot, "added")) {
          const [s, e] = this._interval(i, slot);
          const other = placed.length ? minBy(placed, (q) => Math.abs(q.start.ms - s.ms) / 1000) : null;
          placed.push({ i, slot, start: s, end: e, kind: "added" });
          conflicts.push([other, placed[placed.length - 1], "added"]);
        }
      }
    }
    placed = sortedBy(placed, (q) => q.start.ms);
    const holes = placed.filter((q) => st.removed.has(q.i));
    placed = placed.filter((q) => !st.removed.has(q.i));
    conflicts = conflicts.filter((c) => placed.includes(c[0]) && placed.includes(c[1]));
    const stops = [];
    for (const [n, q] of placed.entries()) {
      const i = q.i;
      const c = this._card(i, q.slot, p, st);
      Object.assign(c, {
        stop: n + 1, kind: q.kind, score: pyRound(score[i], 4), time: `~${q.start.hhmm()}`,
        start: q.start.iso(), end: q.end.iso(),
        live_label: c.badge === "PAPER" && !this.items[i].video ? "See it live · no video" : null,
        attended: st.attended.includes(i), saved: st.saved.includes(i),
      });
      if (q.kind === "added" && st.added_from.has(i)) c.added_from = st.added_from.get(i);
      if (q.kind === "wildcard") {
        c.badge = "TRY NEW";
        const you = (p.keywords.length ? p.keywords : p.auto_keywords.length ? p.auto_keywords : [p.research])[0];
        c.wildcard = { label: "TRY NEW · one step from your field",
                       path: { you, bridge: this.items[i].title, new_area: wildcard[2] },
                       why: `shares ${this._shared(i, p).slice(0, 1).join(", ") || "ideas"} with you and leads into ${wildcard[2]}` };
      }
      const nxt = n + 1 < placed.length ? placed[n + 1] : null;
      c.walk_to_next = nxt ? this._walk(q.slot.room, nxt.slot.room, p.step_free) : null;
      stops.push(c);
    }
    const overlaps = [];
    for (const [a, b, origin] of conflicts) {
      if (!a) continue;
      const later = this._sameTopicLater(b.i, day, b.end, p);
      const text = origin === "added"
        ? `You added ${this.items[b.i].title}. It overlaps ${this.items[a.i].title}. Keep one.`
        : "Pick one. The other moves to More picks.";
      overlaps.push({
        time: `~${minT(a.start, b.start).hhmm()}`, origin, text,
        options: [a, b].map((x) => ({ id: this.items[x.i].id, title: this.items[x.i].title, room: x.slot.room,
                                      video: this.items[x.i].video,
                                      label: `${x.slot.room} · ` + (this._catchLater(x.i, x.slot) ? "Can catch later" : "Only here now") })),
        alternative: later,
      });
    }
    const excluded = new Set([...outOfRoute, ...st.removed]);
    const best = cands.reduce((m, [i]) => Math.max(m, score[i]), 0);
    stops.forEach((s, n) => { s.grade = this._grade(score[placed[n].i], best); });
    this._options(stops, placed, cands, excluded, score, p, st, gap, best);
    const recs = this._recommend(cands, placed, stops, excluded, score, p, st, pyInt(or(req.rec_k, REC_K)));
    const rows = this._rows(stops, overlaps);
    const gaps = this._gaps(holes, stops);
    const fits = await this.more({ ...req, screen: "more", day, _route: placed.map((q) => q.i), _gaps: this._free(day, stops, p) });
    let done = rows.reduce((s, r) => s + (r.done ? 1 : 0), 0);
    const dl = dayLabel(day);
    const out = {
      state: "today", day, day_label: dl, pace: { level: p.pace, id: name.toLowerCase(), name },
      title: `Your ${dayLabel(day, false).split(" ")[0]}`,
      subtitle: `${stops.length} stops picked for your research` + (p.step_free ? " · step-free on" : "") + " · times are estimates",
      matched_talks: cands.length, related_talks: pool.length, planner,
      grading: GRADING,
      recommendations: recs,
      stops, rows, overlaps, gaps,
      progress: { done, of: rows.length, saved: st.saved.length, label: `Your ${dayLabel(day, false).split(" ")[0]} · ${done} of ${rows.length}` },
      more_for_today: { talks: fits.total_picks, people: fits.people.length, label: "More for you",
                        line: `${fits.total_picks} picks fit your free time` },
      building: { title: "Building your day",
                  steps: ["Read your research", `Found ${pool.length} talks for you`, "Checking rooms and step-free paths"] },
      relevance: await this._relevance(p),
      warnings: this._warnings(p),
    };
    if (truthy(req.now)) {
      const now = this._now(req.now);
      if (now.date() < day) {
        Object.assign(out, {
          state: "preview",
          progress: { ...out.progress, done: 0, label: `Your ${dayLabel(day, false).split(" ")[0]} · preview` },
          more_for_today: { ...out.more_for_today, label: "More for you", line: `${fits.total_picks} picks fit ${dl.split(" ")[0]}` },
        });
        return out;
      }
      if (now.date() > day || (rows.length && now.ms >= T(rows[rows.length - 1].end).ms)) out.state = "day_done";
      out.next = this._next(stops, now, p);
      for (const r of rows) r.done = r.done || now.ms >= T(r.end).ms;
      done = rows.reduce((s, r) => s + (r.done ? 1 : 0), 0);
      Object.assign(out.progress, { done, label: `Your ${dayLabel(day, false).split(" ")[0]} · ${done} of ${rows.length}` });
      out.now_card = this._nowCard(rows, stops, now, p);
    } else {
      out.now_card = this._nowCard(rows, stops, null, p);
    }
    if (out.state === "day_done" || (rows.length && rows.every((r) => r.done))) {
      out.state = "day_done";
      out.now_card = null;
      out.day_done = await this._dayDone(req, p, day, rows, st);
    }
    return out;
  }

  _rows(stops, overlaps) {
    const inChoice = new Map();
    for (const o of overlaps) inChoice.set(o.options[1].id, o);
    for (const o of overlaps) inChoice.set(o.options[0].id, o);
    const rows = [], seen = new Set();
    for (const s of stops) {
      if (seen.has(s.id)) continue;
      const o = inChoice.get(s.id);
      if (o) {
        const ids = o.options.map((x) => x.id);
        ids.forEach((x) => seen.add(x));
        const members = stops.filter((x) => ids.includes(x.id));
        rows.push({
          time: o.time, badge: "PICK ONE", title: "Pick one of 2 talks", stop_ids: ids,
          start: members.map((m) => m.start).reduce((a, b) => (b < a ? b : a)),
          end: members.map((m) => m.end).reduce((a, b) => (b > a ? b : a)),
          done: members.some((m) => m.attended),
          choice: { text: "Pick one. The other moves to More picks.",
                    options: o.options.map((x) => ({ id: x.id, title: x.title, line: x.label, button: "Choose" })) },
        });
      } else {
        seen.add(s.id);
        rows.push({ time: s.time, badge: s.badge, title: s.title, stop_ids: [s.id], start: s.start, end: s.end,
                    alternative_ids: (s.alternatives || []).map((a) => a.id),
                    option_ids: (s.options || []).slice(1).map((o) => o.id), done: s.attended, actions: ["Remove", "Swap"] });
      }
    }
    return rows;
  }

  _now(now) {
    let t;
    try {
      t = DT.parse(pyStr(now));
    } catch (e) {
      throw new InputError('now must be an ISO time like "2026-04-14T09:20:00+02:00"');
    }
    if (t.off === null) t = t.withOffset(this.venue.utc_offset_min);
    return t;
  }

  _nowCard(rows, stops, now, p) {
    const byId = new Map(stops.map((s) => [s.id, s]));
    let todo = rows.filter((r) => !r.done);
    if (!todo.length) return null;
    let cur = null;
    if (now !== null) {
      cur = first(rows, (r) => T(r.start).ms <= now.ms && now.ms < T(r.end).ms);
      const later = rows.filter((r) => T(r.end).ms > now.ms);
      todo = later.length ? later : todo;
    }
    const r = cur || todo[0];
    const s = byId.get(r.stop_ids[0]);
    const idx = rows.indexOf(r);
    const title = r.badge !== "PICK ONE" ? r.title : "Pick one of 2 talks";
    if (cur) {
      const i = this._itemById(s.id);
      const slot = first(this.slots.get(i) || [], (x) => x.est_start === s.start);
      let line = `Open until ~${hhmm(r.end)}`, missed = null;
      if (slot && slot.order && slot.est_end !== slot.end) {
        const talks = this.alive.flatMap((j) => (this.slots.get(j) || []).filter((x) => x.session_id === slot.session_id));
        const on = first(talks, (x) => T(x.est_start).ms <= now.ms && now.ms < T(x.est_end).ms) || slot;
        const mins = Math.floor((now.ms - T(on.est_start).ms) / 60000);
        line = `Talk ${on.order} of ${talks.length} · ~${mins} min in`;
        const n = talks.filter((x) => T(x.est_end).ms <= now.ms).length;
        missed = n ? `You missed ${n} earlier talk${n !== 1 ? "s" : ""}` : null;
      }
      return { state: "NOW", badge: "NOW", label: line, title, line: missed, stop_ids: r.stop_ids, buttons: ["Catch up", "Question"] };
    }
    const firstStop = !rows.some((x) => x.done) && idx === 0;
    const prevRoom = firstStop ? "Entrance Hall" : byId.get(rows[idx - 1].stop_ids[0]).room;
    const walk = this._walk(prevRoom, s.room, p.step_free);
    const parts = [];
    let state = firstStop ? "FIRST STOP" : "NEXT";
    if (now !== null) {
      const mins = Math.floor((T(r.start).ms - now.ms) / 60000);
      if (mins >= 0 && mins <= (walk ? walk.max : 4) + 6) {
        state = "LEAVE NOW";
        parts.push(`Starts in ~${mins} min`);
      }
    }
    if (walk && walk.max) parts.push(`${walk.min}–${walk.max} min ` + (firstStop ? "from Registration" : "walk"));
    else if (walk) parts.push("Same room");
    return { state, badge: state, label: `${r.time} · ${s.room}`, title, line: parts.join(" · "), stop_ids: r.stop_ids,
             walk, buttons: ["Directions", "Skip"] };
  }

  _free(day, stops, p) {
    const times = sortedBy(stops.map((s) => [T(s.start), T(s.end), s.room]), (x) => [x[0].ms, x[1].ms, x[2]]);
    const bounds = [];
    for (const i of this.alive) for (const x of this._slotOn(i, day)) bounds.push([T(x.start), T(x.end)]);
    if (!bounds.length) return [];
    const lo = bounds.map((b) => b[0]).reduce(minT), hi = bounds.map((b) => b[1]).reduce(maxT);
    const free = [];
    let cur = lo;
    for (const [s, e] of times) {
      if (s.minus(cur) >= VISIT_MIN + 6) free.push([cur, s]);
      cur = maxT(cur, e.plus(5));
    }
    if (hi.minus(cur) >= VISIT_MIN + 6) free.push([cur, hi]);
    return free;
  }

  _gaps(holes, stops) {
    const out = [];
    for (const q of holes) {
      const s = q.start, e = q.end;
      const before = stops.map((x) => T(x.end)).filter((t) => t.ms <= e.ms);
      const after = stops.map((x) => T(x.start)).filter((t) => t.ms >= s.ms);
      const lo = before.length ? before.reduce(maxT).plus(5) : s.plus(-30);
      const hi = after.length ? after.reduce(minT).plus(-5) : e.plus(30);
      let a = maxT(s, lo), b = minT(e, hi);
      if (b.minus(a) < 30) {
        const pad = (30 - b.minus(a)) / 2;
        a = maxT(lo, a.plus(-pad));
        b = minT(hi, b.plus(pad));
      }
      const lab = `${a.hhmm()}–${b.hhmm()}`;
      out.push({ kind: "free", start: a.iso(), end: b.iso(), label: `Free ${lab}`, action: "Fill",
                 gap: { start: a.hhmm(), end: b.hhmm() }, removed_id: this.items[q.i].id,
                 toast: `Removed ${this.items[q.i].title}`, undo: "Undo" });
    }
    return out;
  }

  async _dayDone(req, p, day, rows, st) {
    const later = p.days.filter((d) => d > day);
    let nxt = null;
    if (later.length) {
      const r = await this.route({ ...req, day: later[0], now: null, state: {} });
      if (truthy(r.rows)) {
        nxt = { day: later[0], stops: r.rows.length, first: r.rows[0].time,
                text: `Your ${dayLabel(later[0], false).split(" ")[0]} is ready` };
      }
    }
    const wd = dayLabel(day, false).split(" ")[0];
    const ns = st.saved.length;
    return { badge: "DONE", day_label: dayLabel(day), title: `Your ${wd} is done`,
             line: `${rows.reduce((s, r) => s + (r.done ? 1 : 0), 0)} of ${rows.length} stops · ${ns} talk${ns !== 1 ? "s" : ""} saved`,
             buttons: ["See your day"], next_day: nxt };
  }

  _summary(i) {
    return (this.summaries.get(this.items[i].id) || {}).summary ?? null;
  }

  _questions(i) {
    return (this.summaries.get(this.items[i].id) || {}).questions ?? [];
  }

  _catchLater(i, slot) {
    return Boolean(this.items[i].video) || (this.slots.get(i) || []).some((x) => x.start && x.start > (slot.start || ""));
  }

  async _relevance(p) {
    const q = this._query(p);
    const sims = this.ex.sims(await this._embed(q));
    let top = -Infinity;
    for (const v of sims) if (v > top) top = v;
    const [low, onTopic] = relevance(this.ex.cfg, sims, this.ex.bm25, q);
    return { top_similarity: pyRound(top, 4), floor: this.ex.cfg.relevance_floor ?? null, on_topic: onTopic, low, few_matches: low };
  }

  _next(stops, now, p) {
    const cur = first(stops, (s) => T(s.start).ms <= now.ms && now.ms < T(s.end).ms);
    const nxt = first(stops, (s) => T(s.start).ms > now.ms);
    if (!nxt) return null;
    const walk = this._walk(cur ? cur.room : null, nxt.room, p.step_free);
    const leave = T(nxt.start).plus(-(walk ? walk.max : 5));
    return {
      room: nxt.room, title: nxt.title, starts: nxt.time, leave_now: now.ms >= leave.ms, leave_at: leave.hhmm(),
      current_ending: Boolean(cur && T(cur.end).ms - now.ms <= 10 * 60000), walk,
      text: `This talk is ending · next starts ${nxt.time} (est.)` + (walk ? ` · ${walk.minutes}` : "") + (p.step_free ? ", step-free" : ""),
    };
  }

  _wildcard(p, score, day, topTopics, st, filt) {
    const allowed = this._allowed(p.tracks);
    const order = argsortDesc(score).slice(POOL / 4, POOL * 4).filter((i) => allowed[i] && !this.ex.dup[i]);
    for (const i of order) {
      const t = this.topicOf.get(i);
      if (!t || topTopics.has(t) || st.removed.has(i) || !this._ok(i, filt) || !this._shared(i, p).length) continue;
      const slots = this._slotOn(i, day);
      if (slots.length) return [i, slots[0], t];
    }
    return null;
  }

  _simsTo(i) {
    return this.ex.sims(row(this.emb.data, this.D, i));
  }

  _sameTopicLater(i, day, after, p) {
    const sims = this._simsTo(i);
    for (const j of argsortDesc(sims).slice(1, 200)) {
      if (this.ex.dup[j] || j === i) continue;
      for (const s of this._slotOn(j, day)) {
        if (T(s.est_start).ms >= after.ms) {
          return { id: this.items[j].id, title: this.items[j].title, time: `~${hhmm(s.est_start)}`, room: s.room,
                   text: `Or the same topic at ~${hhmm(s.est_start)} in ${s.room}` };
        }
      }
    }
    return null;
  }

  // -- 03-2 ---------------------------------------------------------------
  async more(req) {
    const p = this._profile(req);
    const st = this._state(req);
    const day = this._day(or(req.day, p.days[0]));
    const filt = this._filters(req.filters);
    const score = await this._score(p);
    let route = req._route ?? null, free = req._gaps ?? null;
    if (route === null || free === null) {
      const r = await this.route({ ...req, screen: "route", now: null });
      const stops = r.stops || [];
      route = stops.map((s) => this._itemById(s.id));
      free = this._free(day, stops, p);
    }
    const gap = req.gap;
    if (truthy(gap)) {
      if (!(isObj(gap) && truthy(gap.start) && truthy(gap.end))) throw new InputError('gap must look like {"start": "15:30", "end": "16:10"}');
      try {
        free = [[this._now(`${day}T${pyStr(gap.start)}:00`), this._now(`${day}T${pyStr(gap.end)}:00`)]];
      } catch (e) {
        if (e instanceof InputError) throw new InputError('gap times must be "HH:MM"');
        throw e;
      }
    }
    const picks = [];
    for (const i of this._pool(p, score)) {
      if (route.includes(i) || st.removed.has(i) || !this._ok(i, filt)) continue;
      for (const s of this._slotOn(i, day).slice(0, 1)) {
        const [a, b, flexible] = this._interval(i, s);
        const need = flexible ? VISIT_MIN : b.minus(a);
        let fit = null;
        for (const [x, y] of free) {
          const lo = maxT(a, x), hi = minT(b, y);
          if (hi.minus(lo) >= need && (flexible || (a.ms >= x.ms && b.ms <= y.ms))) { fit = [x, y, lo]; break; }
        }
        if (!fit) continue;
        const c = this._card(i, s, p, st);
        if (flexible) c.time = `~${fit[2].hhmm()}`;
        c.only_today = this.slots.get(i).filter((x) => x.start).every((x) => x.start.slice(0, 10) === day);
        c.fits = `Fits ${fit[0].hhmm()}–${fit[1].hhmm()}`;
        c.fits_gap = { start: fit[0].hhmm(), end: fit[1].hhmm() };
        const flags = [];
        if (c.only_today && c.badge !== "PAPER") flags.push("only today");
        if (c.video) flags.push("has video");
        c.line = [c.time || "", c.room, ...flags].join(" · ");
        c.label = `${c.badge} · ${c.time}`;
        c.button = "+ Add";
        c.toast = `Added ${c.title} at ${(c.time || "").replace(/^~+/, "")}`;
        c.overlaps_route = false;
        picks.push(c);
      }
    }
    const k = pyInt(or(req.top_k, 10));
    const title = truthy(gap) ? `Fits ${pyStr(gap.start)}–${pyStr(gap.end)}` : `Fits your free time on ${dayLabel(day).split(" ")[0]}`;
    const out = {
      day, day_label: dayLabel(day), title, subtitle: "Fits your free time",
      note: truthy(gap) ? "Only talks that fit this gap. + Add fills it." : "Only talks that fit your free time. + Add puts one in the route.",
      total_picks: picks.length, picks: picks.slice(0, k),
      people: this._people(p, score, day, pyInt(or(req.people_k, 5))),
      people_source: "From the public programme · name, institution and shared topics",
      warnings: this._warnings(p),
    };
    if (!picks.length) {
      const later = p.days.filter((d) => d > day);
      out.state = "nothing_fits";
      out.empty = { title: `Nothing else fits ${dayLabel(day).split(" ")[0]}`,
                    buttons: later.length ? [`See ${dayLabel(later[0]).split(" ")[0]}`] : [] };
    }
    return out;
  }

  _people(p, score, day, k = 5) {
    const pool = this._pool(p, score).filter((i) => this._slotOn(i, day).length).slice(0, 40);
    const inPool = new Set(pool);
    const agg = new Map();
    for (const i of pool) for (const a of this.items[i].authors) agg.set(a.name, (agg.get(a.name) || 0) + score[i]);
    const out = [], used = new Set();
    for (const [name] of sortedBy(agg.entries(), (x) => -x[1])) {
      const best = maxBy(this.byAuthor.get(name).filter((i) => inPool.has(i)), (i) => score[i]);
      if (used.has(best)) continue;
      const prof = this._person(name);
      const shared = [...new Set(this.byAuthor.get(name).flatMap((i) => this._shared(i, p, false)))].sort();
      if (!shared.length) continue;
      const nxt = this._nextAppearance(name, day);
      out.push({ ...prof, shared_topics: shared.length, shared,
                 shared_label: `${shared.length} shared topic` + (shared.length > 1 ? "s" : ""),
                 next: nxt, via: { id: this.items[best].id, title: this.items[best].title } });
      used.add(best);
      if (out.length === k) break;
    }
    return out;
  }

  _person(name) {
    const affs = new Counter();
    for (const i of this.byAuthor.get(name) || []) {
      for (const a of this.items[i].authors) {
        if (a.name !== name) continue;
        for (const af of a.affiliations.slice(0, 1)) affs.add(JSON.stringify([af.institution, af.country]));
      }
    }
    const [inst, country] = affs.size ? JSON.parse(affs.mostCommon(1)[0][0]) : ["", ""];
    const parts = name.split(/[\s-]+/u).filter(Boolean);
    const initials = parts.length ? (Array.from(parts[0])[0] + (parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : "")).toUpperCase() : "";
    return { name, initials, institution: inst, country, n_items: (this.byAuthor.get(name) || []).length };
  }

  _appearances(name) {
    let out = [];
    for (const i of this.byAuthor.get(name) || []) {
      const t = this.items[i].type;
      const kind = { "Paper": "Paper talk", "Journals": "Paper talk", "Posters": "Poster", "Interactive Demos": "Demo" }[t] ?? t;
      for (const s of this.slots.get(i) || []) {
        if (s.start) {
          out.push({ kind, id: this.items[i].id, title: this.items[i].title, start: s.est_start, end: s.est_end,
                     room: s.room, session: s.session, floor: s.floor });
        }
      }
    }
    for (const s of this.chairing.get(name) || []) {
      if (s.start) {
        out.push({ kind: "Session chair", id: null, title: s.name, start: s.start, end: s.end, room: s.room,
                   session: s.name, floor: s.floor });
      }
    }
    out = sortedBy(out, (x) => x.start);
    for (const x of out) {
      Object.assign(x, { day: x.start.slice(0, 10), day_label: dayLabel(x.start.slice(0, 10)).split(" ")[0], time: hhmm(x.start) });
      if (x.kind === "Poster") x.detail = `Poster area · ${Math.trunc(tdSeconds(T(x.end), T(x.start)) / 60)} min`;
    }
    return out;
  }

  _nextAppearance(name, day, after = null) {
    for (const x of this._appearances(name)) {
      if (x.day > day || (x.day === day && (after === null || x.start >= after))) {
        const where = x.kind !== "Poster" ? `${x.kind.toLowerCase()} in ${x.room}` : "poster session";
        return { ...x, text: `Next · ${x.day_label} ~${x.time} ${where}` };
      }
    }
    return { text: "No more sessions this week" };
  }

  // -- 04 -----------------------------------------------------------------
  _filters(f) {
    if (!truthy(f)) return null;
    if (!isObj(f)) throw new InputError("filters must be a JSON object");
    const out = {};
    if (truthy(f.institutions)) {
      const names = new Set();
      for (const q of this._strList(f.institutions, "filters.institutions")) {
        for (const n of this.ex.inst.names.includes(q) ? [q] : this.ex.inst.match(q)[0]) names.add(n);
      }
      out.inst = names;
    }
    if (truthy(f.countries)) out.countries = new Set(this._strList(f.countries, "filters.countries").map(norm));
    if (truthy(f.topics)) out.topics = new Set(this._strList(f.topics, "filters.topics"));
    if (truthy(f.days)) out.days = new Set(this._strList(f.days, "filters.days").map((d) => this._day(d)));
    if (truthy(f.tracks)) {
      const tr = this._strList(f.tracks, "filters.tracks");
      const bad = tr.filter((t) => !(t in TRACKS));
      if (bad.length) throw new InputError(`unknown track(s) ${pyStr(bad)}; use any of ${pyStr(Object.keys(TRACKS))}`);
      out.types = new Set(tr.flatMap((x) => TRACKS[x]));
    }
    return out;
  }

  _ok(i, filt) {
    if (!filt || !Object.keys(filt).length) return true;
    const it = this.items[i];
    const affs = it.authors.flatMap((a) => a.affiliations);
    if (filt.inst && !affs.some((af) => filt.inst.has(af.institution))) return false;
    if (filt.countries && !affs.some((af) => [...filt.countries].some((c) => hasWords(norm(af.country), c)
        || ((c === "korea" || c === "south korea") && norm(af.country).includes("korea"))))) return false;
    if (filt.topics && !(this.slots.get(i) || []).some((s) => filt.topics.has(s.session))) return false;
    if (filt.types && !filt.types.has(it.type)) return false;
    if (filt.days && !(this.slots.get(i) || []).some((x) => filt.days.has((x.start || "").slice(0, 10)))) return false;
    return true;
  }

  async filters(req) {
    const p = this._profile(req);
    const day = this._day(or(req.day, p.days[0]));
    const score = await this._score(p);
    const pool = this._pool(p, score).filter((i) => this._slotOn(i, day).length);
    const out = { day };
    const q = pyStr(or(req.institution_query, "")).trim();
    if (q) {
      const [names, byInit] = this.ex.inst.match(q);
      const counts = new Counter();
      for (const i of this.alive) for (const a of this.items[i].authors) for (const af of a.affiliations) if (names.has(af.institution)) counts.add(af.institution);
      const groups = new Map();
      for (const n of [...names].sort()) {
        const g = this._instKey(n);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(n);
      }
      let rows = [];
      for (const members of groups.values()) {
        const label = maxBy(members, (n) => [counts.count(n), -Array.from(n).length]);
        const ms = new Set(members);
        const ids = new Set();
        for (const i of this.alive) for (const a of this.items[i].authors) for (const af of a.affiliations) if (ms.has(af.institution)) ids.add(i);
        rows.push({ name: label, spellings: [...members].sort(), ids, matches: !norm(label).includes(norm(q)) ? q : null,
                    by_initials: members.some((m) => byInit.has(m)) });
      }
      for (const r of rows) r.items = r.ids.size;
      rows = sortedBy(rows, (r) => -r.items);
      if (rows.length) {
        const head = rows[0], rest = [];
        for (const r of rows.slice(1)) {
          if (norm(r.name) === norm(q) || new SequenceMatcher(norm(r.name), norm(head.name)).ratio() > 0.9) {
            head.spellings = [...new Set([...head.spellings, ...r.spellings])].sort();
            for (const x of r.ids) head.ids.add(x);
            head.items = head.ids.size;
          } else rest.push(r);
        }
        rows = [head, ...rest];
        for (const r of rows) {
          delete r.ids;
          r.selected = r === head;
          r.line = r === head && r.matches ? `matches "${q}"` : `${r.items} paper` + (r.items !== 1 ? "s" : "");
        }
      }
      out.institutions = rows.length ? rows : this.ex.inst.suggest(q).map((s) => ({ name: s, suggested: true }));
    }
    const [ranked] = await this._topicRank(p);
    out.topics = ranked.slice(0, 4);
    const cc = new Counter();
    for (const i of pool) cc.update(new Set(this.items[i].authors.flatMap((a) => a.affiliations.map((af) => af.country)).filter(Boolean)));
    out.countries = cc.mostCommon(3).map(([c]) => c);
    out.tracks = Object.keys(TRACKS);
    const filt = this._filters(req.filters);
    if (filt !== null) {
      const n = pool.reduce((s, i) => s + (this._ok(i, filt) ? 1 : 0), 0);
      out.counts = { replan_route: n, filter_picks: n, buttons: ["Filter picks only", `Re-plan route · ${n}`] };
    }
    out.warnings = this._warnings(p);
    return out;
  }

  // -- 05 -----------------------------------------------------------------
  async search(req) {
    const q = pyStr(or(req.q, or(req.query, ""))).trim();
    const filt = this._filters(req.filters);
    if (!q && !truthy(filt)) throw new InputError('search needs "q" (a name, title, topic or institution) or "filters"');
    const by = req.by ?? null;
    if (![null, "institution", "day", "field"].includes(by)) throw new InputError('by must be "institution", "day" or "field"');
    const k = pyInt(or(req.top_k, 10));
    const nq = norm(q);
    const words = nq.split(" ").filter(Boolean);
    let papers = [];
    const who = new Map();
    let day = null;
    if (!q) {
      papers = sortedBy(this.alive, (i) => (this.slots.get(i)?.length ? (this.slots.get(i)[0].start || "9999") : "9999"));
    } else if (by === "institution" || by === "field") {
      const res = await this.ex.predict({ [by === "institution" ? "institution" : "department"]: q, top_k: 1000 });
      for (const r of res.results) {
        const i = this._itemById(r.id);
        papers.push(i);
        who.set(i, r.matched_authors.length ? r.matched_authors[0] : null);
      }
    } else if (by === "day") {
      day = this._day(q);
      papers = this.alive.filter((i) => this._slotOn(i, day).length);
    } else {
      const peopleHit = [...this.byAuthor.keys()].filter((n) => hasPrefixes(norm(n), words));
      const byPeople = peopleHit.flatMap((n) => this.byAuthor.get(n));
      for (const n of peopleHit) for (const i of this.byAuthor.get(n)) if (!who.has(i)) who.set(i, { name: n });
      const titleHits = this.alive.filter((i) => hasPrefixes(this.ntitle[i], words));
      const names = words.length <= 6 ? this.ex.inst.match(q)[0] : new Set();
      const instHits = names.size ? this.alive.filter((i) => this.items[i].authors.some((a) => a.affiliations.some((af) => names.has(af.institution)))) : [];
      papers = [...new Set([...byPeople, ...instHits, ...titleHits])];
      if (!(byPeople.length || instHits.length)) {
        const sim = this.ex.sims(await this._embed(q));
        const a = minmax(sim), b = minmax(this.ex.bm25.scores(q));
        const w = f32(this.ex.cfg.hybrid_w);
        const score = Float32Array.from(a, (x, i) => f32(x + f32(w * b[i])));
        papers = sortedBy(papers, (i) => -score[i]);
        if (!relevance(this.ex.cfg, sim, this.ex.bm25, q)[0]) {
          papers = [...new Set([...papers, ...argsortDesc(score).slice(0, 200).filter((i) => !this.ex.dup[i])])];
        }
      }
    }
    if (by === "day") {
      papers = sortedBy(papers, (i) => [BADGE[this.items[i].type] !== "PAPER", (this._slotOn(i, day)[0] || { start: "" }).start]);
    }
    papers = papers.filter((i) => this._ok(i, filt));
    const people = sortedBy([...this.byAuthor.keys()].filter((n) => words.length && hasPrefixes(norm(n), words)
      && (!truthy(filt) || this.byAuthor.get(n).some((i) => this._ok(i, filt)))), (n) => [-this.byAuthor.get(n).length, n]);
    const sessions = this.venue.sessions.filter((s) => words.length && hasPrefixes(norm(s.name), words)
      && (!truthy(filt) || !filt.days || filt.days.has((s.start || "").slice(0, 10))));
    const rowOf = (i) => {
      const c = this._card(i);
      let fa = c.first_author || {};
      if (who.get(i)) fa = this._authorsShort(i).find((a) => a.name === who.get(i).name) || fa;
      return { id: c.id, badge: c.badge, title: c.title,
               label: [c.badge, (c.day_label || "").split(" ")[0]].filter(Boolean).join(" · "), button: "+ Add",
               line: [fa.name, fa.institution, (c.day_label || "").split(" ")[0]].filter(Boolean).join(" · ") };
    };
    const nf = isObj(req.filters) ? Object.keys(req.filters).length : (Array.isArray(req.filters) ? req.filters.length : 0);
    const out = {
      q, by, header: "Search talks, people, topics",
      filters: truthy(filt) ? { count: nf, label: `Filters · ${nf}`,
                                button: `Show ${papers.length} result${papers.length !== 1 ? "s" : ""}` } : null,
      tabs: { talks: papers.length, people: people.length, sessions: sessions.length },
      talks: papers.slice(0, k).map(rowOf),
      people: people.slice(0, k).map((n) => this._person(n)),
      sessions: sessions.slice(0, k).map((s) => ({ name: s.name, room: s.room, start: s.start, time: hhmm(s.start),
                                                 day_label: s.start ? dayLabel(s.start.slice(0, 10)) : null, items: s.n_items })),
      note: "Recent searches are kept by the app on the phone, not by the model.",
    };
    if (!(papers.length || people.length || sessions.length)) {
      out.state = "no_results";
      out.empty = { title: "No matches",
                    buttons: truthy(filt) ? ["Clear filters"] : [] };
    }
    return out;
  }

  // -- 06 -----------------------------------------------------------------
  async paper(req) {
    const i = this._itemById(req.id ?? null);
    const p = this._profile(req, false);
    const st = this._state(req);
    const hasProfile = Boolean(p.research || p.keywords.length || p.topics.length);
    const c = this._card(i, null, hasProfile ? p : null, st);
    const it = this.items[i];
    const authors = this._authorsShort(i);
    const insts = [], groups = new Set();
    for (const a of authors) {
      const g = a.institution ? this._instKey(a.institution) : null;
      const x = [a.institution, a.country].filter(Boolean).join(", ");
      const acro = /\(([^()]+)\)\s*$/u.exec(a.institution);
      if (acro) {
        const g2 = this.ex.inst.find(norm(acro[1]));
        if (groups.has(g2)) continue;
        groups.add(g2);
      }
      if (x && !groups.has(g)) {
        groups.add(g);
        insts.push(x);
      }
    }
    const sims = this._simsTo(i);
    const similar = [];
    const mySessions = new Set((this.slots.get(i) || []).map((s) => s.session_id));
    const simK = pyInt(or(req.similar_k, 3));
    for (const j of argsortDesc(sims)) {
      if (j === i || this.ex.dup[j]) continue;
      const cj = this._card(j);
      const same = (this.slots.get(j) || []).some((s) => mySessions.has(s.session_id));
      let where = cj.room || "";
      if (cj.remote) where = "video only (remote)";
      else if (cj.badge === "POSTER") where = "Poster area";
      similar.push({ id: cj.id, title: cj.title, badge: cj.badge, similarity: pyRound(sims[j], 3), same_session: same,
                     line: [(cj.day_label || "").split(" ")[0], where, same ? "same session" : ""].filter(Boolean).join(" · ") });
      if (similar.length === simK) break;
    }
    let when = null;
    if (c.start) when = `${c.day_label} · ~${hhmm(c.start)} · ${c.room}`;
    const names = authors.map((a) => a.name);
    const slot0 = (this.slots.get(i) || [])[0] || null;
    const laterSlots = (this.slots.get(i) || []).filter((x) => slot0 && x.start && x.start > (slot0.start || ""));
    let avail;
    if (laterSlots.length) avail = `Can catch later · also ${dayLabel(laterSlots[0].start.slice(0, 10)).split(" ")[0]} ~${hhmm(laterSlots[0].est_start)}`;
    else if (it.video) avail = "Can catch later · has video";
    else avail = "Only here now · no video";
    const out = {
      ...c, authors, institutions: insts, when,
      authors_line: names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : ""),
      availability: avail,
      where: c.talk_order ? `${c.room} · ${c.talk_order} in “${c.session}”` : (c.room || null),
      all_slots: this.slots.get(i) || [],
      abstract: it.abstract,
      summary: { label: "Summary · AI, from the abstract", text: this._summary(i), language: "en", note: "One English sentence written offline from the abstract by a local LLM. Other languages are app-side." },
      questions: this._questions(i),
      buttons: ["Question", "Add to my day"],
      similar,
    };
    if (truthy(req.from_room) && c.room) out.directions = this._walk(req.from_room, c.room, p.step_free);
    return out;
  }

  // -- 07 -----------------------------------------------------------------
  async author(req) {
    let name = pyStr(or(req.name, "")).trim();
    if (!name) throw new InputError('author needs "name"');
    if (!this.byAuthor.has(name)) {
      const all = [...this.byAuthor.keys()];
      let cands = all.filter((n) => norm(n) === norm(name));
      if (!cands.length) cands = all.filter((n) => hasPrefixes(norm(n), norm(name).split(" ").filter(Boolean)));
      if (cands.length === 1) name = cands[0];
      else {
        const sug = cands.length ? cands.slice(0, 8) : getCloseMatches(name, all, 5);
        throw new InputError(`no single author named "${name}"` + (sug.length ? `; did you mean: ${sug.join(", ")}` : ""));
      }
    }
    const p = this._profile(req, false);
    const prof = this._person(name);
    const mine = this.byAuthor.get(name);
    const shared = p.research || p.keywords.length ? [...new Set(mine.flatMap((i) => this._shared(i, p, false)))].sort() : [];
    const tc = new Counter();
    for (const i of mine) if (this.topicOf.has(i)) tc.add(this.topicOf.get(i));
    const theirs = tc.mostCommon().map(([t]) => t).filter((t) => !shared.includes(t)).slice(0, 2);
    const where = this._appearances(name);
    const sim = this._similarAuthors(name, pyInt(or(req.similar_k, 3)));
    return { ...prof, header: "Public programme data only", papers_label: `${prof.n_items} papers at ${this.venue.name}`,
             overlaps: { shared, theirs }, where,
             papers: mine.map((i) => ({ id: this.items[i].id, title: this.items[i].title, badge: BADGE[this.items[i].type] ?? "" })),
             line: [prof.institution, prof.country].filter(Boolean).join(" · "),
             their_talks: where.filter((x) => x.id !== null).map((x) => ({
               id: x.id, title: x.title, kind: x.kind,
               label: `${x.day_label} · ~${x.time} · ` + (x.kind === "Poster" ? "Poster area" : x.room), button: "+ Add" })),
             note: "They may not be at every session.", buttons: ["Prepare a question"],
             similar: sim };
  }

  _similarAuthors(name, k = 3) {
    if (this._authorEmb === null) {
      const names = [...this.byAuthor.keys()].sort();
      const m = names.map((n) => normalize(meanRows(this.emb.data, this.D, this.byAuthor.get(n))));
      this._authorEmb = [names, m];
    }
    const [names, m] = this._authorEmb;
    const me = names.indexOf(name);
    const coauthors = new Set(this.byAuthor.get(name).flatMap((i) => this.items[i].authors.map((a) => a.name)));
    const sims = m.map((v) => dot(v, m[me]));
    const out = [], seen = new Set();
    for (const j of argsortDesc(sims)) {
      const talks = [...this.byAuthor.get(names[j])].sort((a, b) => a - b).join(",");
      if (coauthors.has(names[j]) || seen.has(talks)) continue;
      seen.add(talks);
      const pr = this._person(names[j]);
      out.push({ name: pr.name, institution: pr.institution });
      if (out.length === k) break;
    }
    return out;
  }

  // -- 08 -----------------------------------------------------------------
  async wrapup(req) {
    const p = this._profile(req);
    const st = this._state(req);
    const day = this._day(or(req.day, p.days[0]));
    const seen = [...new Set([...st.saved, ...st.attended])];
    const topics = new Counter();
    for (const i of seen) if (this.topicOf.has(i)) topics.add(this.topicOf.get(i));
    const mostly = topics.mostCommon(3).map(([t, n]) => ({ topic: t, count: n }));
    const score = await this._score(p);
    let later = p.days.filter((d) => d > day);
    if (!later.length) later = this.days.filter((d) => d > day);
    let tomorrow = null;
    if (mostly.length && later.length) {
      const a = mostly[0].topic;
      const tt = new Set([...topics.keys(), ...(await this._topicRank(p))[0].slice(0, 3)]);
      const w = this._wildcard(p, score, later[0], tt, { ...st, removed: new Set([...st.removed, ...seen]) }, null);
      if (w) {
        const [bridge, , b] = w;
        const dl = dayLabel(later[0], false).split(" ")[0];
        const field = this.clusterOf.has(bridge) ? this.clusters[this.clusterOf.get(bridge)].label : b;
        const wd = dayLabel(later[0]).split(" ")[0];
        tomorrow = { day: later[0], from_topic: a, to_topic: b, field, label: "For tomorrow",
                     text: `Try one talk in ${field} on ${wd}?`,
                     bridge: this._card(bridge, w[1], p),
                     buttons: ["No thanks", `Add to ${wd}`],
                     note: `Updates ${dl}'s route. You can undo it there.` };
      }
    }
    let clusters;
    if (this.clusters.length) {
      const cnt = new Counter();
      for (const i of seen) if (this.clusterOf.has(i)) cnt.add(this.clusterOf.get(i));
      clusters = cnt.mostCommon(3).map(([c, n]) => ({ id: this.clusters[c].id, label: this.clusters[c].label, count: n, new: false }));
      if (tomorrow) {
        const c = this.clusterOf.get(this._itemById(tomorrow.bridge.id));
        if (c !== undefined && clusters.every((x) => x.id !== this.clusters[c].id)) {
          clusters.push({ id: this.clusters[c].id, label: this.clusters[c].label, count: 0, new: true, suggested: true });
        }
      }
    } else {
      clusters = mostly.map((t) => ({ label: t.topic, count: t.count, new: false }));
      if (tomorrow) clusters.push({ label: tomorrow.to_topic, count: 0, new: true, suggested: true });
    }
    const savedRows = seen.map((i) => {
      let status = st.attended.includes(i) ? "Attended" : "Saved, not attended";
      if (!st.attended.includes(i) && this.items[i].video) status += " · has video";
      return { id: this.items[i].id, title: this.items[i].title, status, saved: st.saved.includes(i) };
    });
    const authors = st.opened_authors.map((n) => {
      const pr = this.byAuthor.has(n) ? this._person(n) : { name: n, institution: "" };
      return { name: n, institution: pr.institution,
               next: this.byAuthor.has(n) ? this._nextAppearance(n, day, `${day}T23:59`) : { text: "No more sessions this week" } };
    });
    const people = [];
    if (later.length) {
      for (const n of st.opened_authors) {
        for (const x of this.byAuthor.has(n) ? this._appearances(n) : []) {
          if (x.day === later[0]) {
            people.push({ name: n, id: x.id, start: x.start,
                          label: `${x.day_label} · ~${x.time} · ` + (x.kind === "Poster" ? "Poster area" : x.room) });
            break;
          }
        }
      }
    }
    return {
      day, header: `${dayLabel(day)} · end of day`,
      people_to_find: { label: "People to find tomorrow", people: sortedBy(people, (x) => x.start) },
      title: `Your ${dayLabel(day, false).split(" ")[0]} at ${this.venue.name.split(" ")[0]}`,
      counts: { papers_saved: st.saved.length, talks_attended: st.attended.length, authors_opened: st.opened_authors.length },
      mostly_about: mostly, clusters, papers: savedRows, authors, for_tomorrow: tomorrow,
      note: "Built from what you saved and marked as attended. Stored on this phone only.",
    };
  }

  // -- clusters -------------------------------------------------------------
  _clusterRef(cid) {
    const str = pyStr(cid);
    const k0 = str.indexOf(".");
    const base = k0 < 0 ? str : str.slice(0, k0), sub = k0 < 0 ? "" : str.slice(k0 + 1);
    const n = this.clusters.findIndex((c) => c.id === base);
    const subs = n >= 0 ? (this.clusters[n].subclusters || []) : [];
    const k = subs.findIndex((x) => x.id === cid);
    if (n < 0 || (sub && k < 0)) {
      throw new InputError(`unknown cluster ${pyDumps(cid)}; ids are c00..c${String(this.clusters.length - 1).padStart(2, "0")}, sub-topics like c00.1`);
    }
    return [n, sub ? k : null];
  }

  _clusterBrief(n, rel = null, mine = 0, rec = null) {
    const c = this.clusters[n];
    const out = { id: c.id, label: c.label, description: c.description ?? null, size: c.size,
                  keywords: c.keywords.slice(0, 5).map((k) => k.keyword), map: c.map,
                  relevance: rel === null ? null : pyRound(rel, 4), yours: mine, subtopics: (c.subclusters || []).length };
    if (rec !== null) out.recommended = rec;
    return out;
  }

  _subBrief(n, k, rec = null, mine = 0) {
    const x = this.clusters[n].subclusters[k];
    const out = { id: x.id, label: x.label, description: x.description ?? null, size: x.size,
                  keywords: x.keywords.slice(0, 4).map((y) => y.keyword), map: x.map, yours: mine };
    if (rec !== null) out.recommended = rec;
    return out;
  }

  _path(i) {
    const out = [];
    if (this.clusterOf.has(i)) {
      const c = this.clusters[this.clusterOf.get(i)];
      out.push({ id: c.id, label: c.label });
    }
    if (this.subOf.has(i)) {
      const [n, k] = this.subOf.get(i);
      const x = this.clusters[n].subclusters[k];
      out.push({ id: x.id, label: x.label });
    }
    return out;
  }

  async clusters_screen(req) {
    if (!this.clusters.length) throw new InputError("this package has no clusters.json");
    const pp = "profile" in req ? req.profile : req;
    const hasP = isObj(pp) && ["research", "keywords", "topics"].some((f) => truthy(pp[f]));
    const p = hasP ? this._profile(req) : null;
    const st = this._state(req);
    const seen = new Set([...st.saved, ...st.attended]);
    const mine = new Counter(), mineS = new Counter();
    for (const i of seen) {
      if (this.clusterOf.has(i)) mine.add(this.clusterOf.get(i));
      if (this.subOf.has(i)) mineS.add(this.subOf.get(i).join("."));
    }
    let rel = null, score = null, recs = [];
    if (p) {
      const q = await this._embed(this._query(p));
      rel = this.clusters.map((c) => dot(c.emb, q));
      score = await this._score(p);
      recs = this._pool(p, score).slice(0, 30);
    }
    const recC = new Counter(), recS = new Counter();
    for (const i of recs) {
      if (this.clusterOf.has(i)) recC.add(this.clusterOf.get(i));
      if (this.subOf.has(i)) recS.add(this.subOf.get(i).join("."));
    }
    const cid = req.cluster;
    if (truthy(cid)) {
      const [n, sub] = this._clusterRef(cid);
      const c = this.clusters[n];
      const head = { ...this._clusterBrief(n, rel === null ? null : rel[n], mine.count(n), p ? recC.count(n) : null),
                     top_sessions: c.top_sessions, types: c.types };
      let idx, kws, path;
      if (sub === null) {
        idx = [...c.idx];
        kws = c.keywords;
        path = [{ id: c.id, label: c.label }];
      } else {
        const x = c.subclusters[sub];
        idx = x.items.filter((y) => this.idPos.has(y)).map((y) => this.idPos.get(y));
        kws = x.keywords;
        path = [{ id: c.id, label: c.label }, { id: x.id, label: x.label }];
      }
      if (p) idx = sortedBy(idx, (i) => -score[i]);
      const k = pyInt(or(req.top_k, 20));
      const out = { cluster: head, path,
                    subtopics: (c.subclusters || []).map((_, j) => this._subBrief(n, j, p ? recS.count(`${n}.${j}`) : null, mineS.count(`${n}.${j}`))) };
      if (sub !== null) out.subtopic = this._subBrief(n, sub, p ? recS.count(`${n}.${sub}`) : null, mineS.count(`${n}.${sub}`));
      Object.assign(out, {
        keywords: kws.map((x) => ({ keyword: x.keyword, talks: x.items.length, ids: x.items })),
        order: p ? "closest to your research" : "closest to the cluster centre",
        total: idx.length, talks: idx.slice(0, k).map((i) => this._card(i, null, p, st)),
        warnings: p ? this._warnings(p) : [],
      });
      return out;
    }
    const order = p ? argsortDesc(rel) : sortedBy(this.clusters.map((_, k) => k), (k) => -this.clusters[k].size);
    return {
      total: this.clusters.length, order: p ? "closest to your research" : "largest first",
      clusters: order.map((k) => this._clusterBrief(k, rel === null ? null : rel[k], mine.count(k), p ? recC.count(k) : null)),
      for_you: p ? order.slice(0, 3).map((k) => this.clusters[k].id) : [],
      where: recs.slice(0, 5).map((i) => ({ id: this.items[i].id, title: this.items[i].title, path: this._path(i) })),
      note: "Clusters are built from what the talks are about (title, abstract), not from the session names. map x/y place close clusters near each other; each cluster's sub-topics have their own map.",
      warnings: p ? this._warnings(p) : [],
    };
  }

  // -- start / browse / plan: pick talks yourself, or get recommendations (11/7) ----
  _lite(i, score = null, best = null) {
    const c = this._card(i);
    const fa = c.first_author || {};
    const out = { id: c.id, badge: c.badge, title: c.title,
                  line: [fa.name, fa.institution, (c.day_label || "").split(" ")[0], c.time].filter(Boolean).join(" · "),
                  summary: this._summary(i) };
    if (score !== null) out.grade = this._grade(score[i], best);
    return out;
  }

  _cartScore(cart) {
    return minmax(this.ex.sims(normalize(meanRows(this.emb.data, this.D, cart))));
  }

  async _taste(req, st) {
    const pp = "profile" in req ? req.profile : req;
    if (isObj(pp) && ["research", "keywords", "topics"].some((f) => truthy(pp[f]))) {
      const p = this._profile(req);
      return [p, await this._score(p), "research"];
    }
    if (st.cart.length) return [null, this._cartScore(st.cart), "picks"];
    return [null, null, null];
  }

  _byTime(idx) {
    return sortedBy(idx, (i) => [((this.slots.get(i) || [])[0] || { start: null }).start || "9999", this.items[i].title]);
  }

  _maxAlive(score) {
    let m = -Infinity;
    for (const i of this.alive) if (score[i] > m) m = score[i];
    return m;
  }

  _topicOrder(score) {
    const ks = this.clusters.map((_, k) => k);
    if (score === null) return sortedBy(ks, (k) => -this.clusters[k].size);
    const cnt = new Counter();
    for (const i of argsortDesc(score).slice(0, POOL)) if (this.clusterOf.has(i)) cnt.add(this.clusterOf.get(i));
    return sortedBy(ks, (k) => [-cnt.count(k), -this.clusters[k].size]);
  }

  async start(req) {
    const st = this._state(req);
    const [p, score, source] = await this._taste(req, st);
    const best = score !== null ? this._maxAlive(score) : null;
    const cart = new Set(st.cart);
    const shelves = [];
    if (source) {
      const allowed = this._allowed(p ? p.tracks : DEFAULT_TRACKS);
      const ids = argsortDesc(score).filter((i) => allowed[i] && !this.ex.dup[i] && !cart.has(i)).slice(0, SHELF_K);
      shelves.push({ id: source === "research" ? "for_you" : "similar",
                     title: source === "research" ? "For your research" : "Like the talks you picked",
                     kind: "talks", talks: ids.map((i) => this._lite(i, score, best)) });
    }
    if (this.clusters.length) {
      shelves.push({ id: "topics", title: "Topics at CHI", kind: "topics",
                     topics: this._topicOrder(score).map((k) => {
                       const c = this.clusters[k];
                       return { id: c.id, label: c.label, description: c.description ?? null, size: c.size,
                                subtopics: (c.subclusters || []).length, examples: c.examples.slice(0, 2) };
                     }) });
    }
    for (const [sid, title] of [["keynotes", "Keynotes"], ["demos", "Demos to try"]]) {
      let idx = this.alive.filter((i) => SHELF_TYPES[sid].includes(this.typeOf[i]) && !cart.has(i));
      idx = score !== null ? sortedBy(idx, (i) => -score[i]) : this._byTime(idx);
      shelves.push({ id: sid, title, kind: "talks", total: idx.length, talks: idx.slice(0, SHELF_K).map((i) => this._lite(i, score, best)) });
    }
    shelves.push({ id: "search", title: "Find people and schools", kind: "search",
                   hint: 'A name or a school, e.g. "Geehyuk Lee" or "KAIST"', next: { screen: "search" } });
    const n = st.cart.length;
    return {
      title: "How do you want to start?",
      modes: [{ id: "pick", title: "Pick talks myself",
                body: "Browse topics, people and schools and add talks to your list. ARC turns the list into a plan for each day.",
                next: { screen: "browse" } },
              { id: "recommend", title: "Get recommendations",
                body: "Tell ARC what you research. It picks the talks and plans each day.", next: { screen: "keywords" } }],
      suggested_mode: source === "research" ? "recommend" : n ? "pick" : null,
      cart: { count: n, label: `${n} talk${n !== 1 ? "s" : ""} picked`, next: n ? { screen: "plan" } : null },
      personalized_by: source, shelves,
      note: "Shelves follow the research question if there is one, else the picked talks; with neither they are not personalized.",
    };
  }

  _shelf(shelf, score, p) {
    if (shelf === "for_you" || shelf === "similar") {
      if (score === null) throw new InputError(`shelf "${shelf}" needs the research question or picked talks (state.cart)`);
      const allowed = this._allowed(p ? p.tracks : DEFAULT_TRACKS);
      const idx = argsortDesc(score).filter((i) => allowed[i] && !this.ex.dup[i]).slice(0, POOL);
      return [shelf === "for_you" ? "For your research" : "Like the talks you picked", idx, {}];
    }
    if (shelf === "topics") return ["Topics at CHI", [], { topics: this._topicOrder(score).map((k) => this._clusterBrief(k)) }];
    if (shelf.startsWith("topic:")) {
      const [n, sub] = this._clusterRef(shelf.slice(6));
      const c = this.clusters[n];
      let idx, extra, title;
      if (sub === null) {
        idx = [...c.idx];
        extra = { subtopics: (c.subclusters || []).map((_, k) => this._subBrief(n, k)) };
        title = c.label;
      } else {
        idx = c.subclusters[sub].items.filter((x) => this.idPos.has(x)).map((x) => this.idPos.get(x));
        extra = { parent: { id: c.id, label: c.label } };
        title = c.subclusters[sub].label;
      }
      if (score !== null) idx = sortedBy(idx, (i) => -score[i]);
      return [title, idx, extra];
    }
    if (Object.hasOwn(SHELF_TYPES, shelf)) {
      let idx = this.alive.filter((i) => SHELF_TYPES[shelf].includes(this.typeOf[i]));
      idx = score !== null ? sortedBy(idx, (i) => -score[i]) : this._byTime(idx);
      return [shelf[0].toUpperCase() + shelf.slice(1).toLowerCase(), idx, {}];
    }
    if (shelf.startsWith("day:")) {
      const day = this._day(shelf.slice(4));
      let idx = this.alive.filter((i) => this._slotOn(i, day).length);
      idx = score !== null ? sortedBy(idx, (i) => -score[i]) : sortedBy(idx, (i) => [this._slotOn(i, day)[0].start, this.items[i].title]);
      return [dayLabel(day, false), idx, {}];
    }
    throw new InputError(`unknown shelf ${pyDumps(shelf)}; use for_you, similar, topics, topic:<id>, day:<day> or one of ${pyStr(Object.keys(SHELF_TYPES))}`);
  }

  async browse(req) {
    const st = this._state(req);
    const [p, score, source] = await this._taste(req, st);
    const shelf = pyStr(or(req.shelf, source === "research" ? "for_you" : source ? "similar" : "topics"));
    const k = pyInt(or(req.top_k, 20)), off = pyInt(or(req.offset, 0));
    const [title, idx, extra] = this._shelf(shelf, score, p);
    const best = score !== null ? this._maxAlive(score) : null;
    const cart = new Set(st.cart);
    return { shelf, title, ...extra, total: idx.length, offset: off,
             talks: idx.slice(off, off + k).map((i) => ({ ...this._lite(i, score, best), in_cart: cart.has(i) })),
             personalized_by: source, cart: { count: cart.size }, warnings: p ? this._warnings(p) : [] };
  }

  _fill(day, free, score, exclude, tracks, k = 5) {
    const allowed = this._allowed(tracks);
    const out = [];
    for (const i of argsortDesc(score).slice(0, POOL * 2)) {
      if (exclude.has(i) || !allowed[i] || this.ex.dup[i]) continue;
      for (const s of this._slotOn(i, day).slice(0, 1)) {
        const [a, b, flexible] = this._interval(i, s);
        const need = flexible ? VISIT_MIN : b.minus(a);
        for (const [x, y] of free) {
          const lo = maxT(a, x), hi = minT(b, y);
          if (hi.minus(lo) >= need && (flexible || (a.ms >= x.ms && b.ms <= y.ms))) {
            out.push({ ...this._lite(i), time: `~${lo.hhmm()}`, room: s.room, fits: `Fits ${x.hhmm()}–${y.hhmm()}` });
            break;
          }
        }
      }
      if (out.length === k) break;
    }
    return out;
  }

  async plan(req) {
    const st = this._state(req);
    if (!st.cart.length) throw new InputError('plan needs the picked talks: "state": {"cart": [ids]}');
    const p0 = this._profile(req, false);
    const [p, score, source] = await this._taste(req, st);
    const picks = this._cartScore(st.cart);
    const best = this._maxAlive(score);
    const want = truthy(req.day) ? this._day(req.day) : null;
    const byDay = new Map(), unscheduled = [], elsewhere = [];
    const push = (d, x) => { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(x); };
    // a talk shown on several days goes to the day with the most other picks
    const busy = new Counter();
    for (const i of st.cart) busy.update(new Set((this.slots.get(i) || []).filter((x) => x.start).map((x) => x.start.slice(0, 10))));
    for (const i of st.cart) {
      let slots = (this.slots.get(i) || []).filter((x) => x.start);
      if (slots.length && !want) slots = sortedBy(slots, (x) => -busy.count(x.start.slice(0, 10)));
      if (want) {
        const on = slots.filter((x) => x.start.slice(0, 10) === want);
        if (on.length) push(want, [i, on[0]]);
        else (slots.length ? elsewhere : unscheduled).push(i);
      } else if (slots.length) push(slots[0].start.slice(0, 10), [i, slots[0]]);
      else unscheduled.push(i);
    }
    const days = [];
    for (const day of [...byDay.keys()].sort()) {
      let placed = [];
      const clashes = [];
      for (const [i, slot] of sortedBy(byDay.get(day), (x) => -score[x[0]])) {
        const fit = this._fit(placed, i, slot, 0, p0.step_free);
        if (fit) placed.push({ i, slot, start: fit[0], end: fit[1], kind: "picked" });
        else clashes.push([i, slot]);
      }
      placed = sortedBy(placed, (q) => q.start.ms);
      const stops = placed.map((q, n) => {
        const c = this._card(q.i, q.slot, p, st);
        const nxt = n + 1 < placed.length ? placed[n + 1] : null;
        Object.assign(c, { stop: n + 1, kind: "picked", score: pyRound(score[q.i], 4), grade: this._grade(score[q.i], best),
                           time: `~${q.start.hhmm()}`, start: q.start.iso(), end: q.end.iso(),
                           walk_to_next: nxt ? this._walk(q.slot.room, nxt.slot.room, p0.step_free) : null });
        c.options = [{ choice: 1, id: c.id, title: c.title, grade: c.grade, time: c.time, room: c.room, current: true }];
        return c;
      });
      for (const [i, slot] of clashes) {
        if (!stops.length) {
          unscheduled.push(i);
          continue;
        }
        const [s, e] = this._interval(i, slot);
        const n = maxBy(placed.map((_, n) => n), (n) => [(Math.min(e.ms, placed[n].end.ms) - Math.max(s.ms, placed[n].start.ms)) / 1000,
                                                         -Math.abs(placed[n].start.ms - s.ms) / 1000]);
        stops[n].options.push({ choice: stops[n].options.length + 1, id: this.items[i].id, title: this.items[i].title,
                                grade: this._grade(score[i], best), time: `~${hhmm(slot.est_start)}`, room: slot.room,
                                reason: `clashes with stop ${n + 1}`, swap: { replaces: stops[n].id, button: "Swap" } });
      }
      const rows = stops.map((c) => {
        const two = c.options.length > 1;
        return { time: c.time, badge: two ? `${c.options.length} PICKS` : c.badge, title: two ? "Clash · choose one" : c.title,
                 stop_ids: [c.id], option_ids: c.options.slice(1).map((o) => o.id), start: c.start, end: c.end };
      });
      const free = this._free(day, stops, p0);
      const nClash = stops.filter((c) => c.options.length > 1).length;
      const fill = this._fill(day, free, score, new Set(st.cart), p0.tracks);
      const dl = dayLabel(day);
      days.push({ date: day, day_label: dl, title: `${dl} · your picks`,
                  summary: `${byDay.get(day).length} picks · ${stops.length} stops`
                    + (nClash ? ` · ${nClash} clash${nClash > 1 ? "es" : ""} to choose` : "")
                    + (free.length ? ` · ${free.length} free slot${free.length > 1 ? "s" : ""}` : ""),
                  stops, rows,
                  free: free.map(([x, y]) => ({ start: x.iso(), end: y.iso(), label: `Free ${x.hhmm()}–${y.hhmm()}` })),
                  fill });
    }
    const cart = new Set(st.cart);
    const pbest = this._maxAlive(picks);
    const similar = argsortDesc(picks).filter((i) => !this.ex.dup[i] && !cart.has(i)).slice(0, SHELF_K).map((i) => this._lite(i, picks, pbest));
    return { cart: st.cart.length, ranked_by: source, grading: GRADING, days,
             unscheduled: unscheduled.map((i) => this._lite(i)), on_other_days: elsewhere.map((i) => this._lite(i)),
             similar: { title: "Like the talks you picked", talks: similar },
             note: "Picks are placed best match first; a pick that clashes becomes choice 2 or 3 of the stop it clashes with. Times are estimates." };
  }

  // -- 10 -----------------------------------------------------------------
  async session_live(req) {
    if (!truthy(req.now)) throw new InputError('session_live needs "now" (ISO time)');
    const now = this._now(req.now);
    let sid = req.session_id ?? null;
    if (sid === null && req.id !== undefined && req.id !== null) {
      const i = this._itemById(req.id);
      const daySlots = (this.slots.get(i) || []).filter((x) => (x.start || "").slice(0, 10) === now.date());
      const pick = daySlots.length ? daySlots : (this.slots.get(i)?.length ? this.slots.get(i) : [{}]);
      sid = pick[0].session_id ?? null;
    }
    if (sid === null && truthy(req.room)) {
      for (const i of this.alive) {
        for (const x of this.slots.get(i) || []) {
          if (x.room === req.room && x.start && T(x.start).ms <= now.ms && now.ms < T(x.end).ms) sid = x.session_id;
        }
      }
    }
    if (sid === null) throw new InputError('give "session_id", a talk "id" or a "room" with a session at "now"');
    const talks = sortedBy(this.alive.flatMap((i) => (this.slots.get(i) || []).filter((x) => x.session_id === sid).map((x) => [x, i])),
                           (t) => [t[0].order || 0, t[0].est_start]);
    if (!talks.length) throw new InputError(`no session with id ${pyStr(sid)}`);
    const s0 = talks[0][0];
    const n = talks.length;
    const curIdx = talks.findIndex(([x]) => T(x.est_start).ms <= now.ms && now.ms < T(x.est_end).ms);
    const cur = curIdx < 0 ? null : curIdx;
    const started = now.ms >= T(s0.start).ms;
    const progress = talks.map(([x], k) => (T(x.est_end).ms <= now.ms ? "done" : k === cur ? "current" : "upcoming"));
    const out = {
      session_id: sid, session: s0.session, room: s0.room, level: level(s0.floor), header: "Catch up", title: `${s0.session} · ${s0.room}`,
      badge: cur !== null && now.ms > T(talks[cur][0].est_start).ms ? "Opened for you · you arrived after the talk started" : null,
      progress, note: "Session start + 12 min per talk. Speakers can run late.",
      talks: talks.map(([x, i], k) => ({ n: k + 1, id: this.items[i].id, title: this.items[i].title, start: x.est_start, end: x.est_end, summary: this._summary(i) })),
      buttons: ["Prepare a question"],
    };
    if (cur === null) {
      out.state = !started ? "not_started" : "ended";
      out.line = !started ? `Starts ~${hhmm(s0.start)}` : `Ended ~${hhmm(talks[talks.length - 1][0].est_end)}`;
      return out;
    }
    const [x, i] = talks[cur];
    const mins = Math.floor((now.ms - T(x.est_start).ms) / 60000);
    const authors = this._authorsShort(i);
    Object.assign(out, {
      state: "live", line: `Talk ${cur + 1} of ${n} · ~${mins} min in`,
      now: { label: `Now · you missed ~${mins} min`, tag: "AI summary from abstract", id: this.items[i].id, title: this.items[i].title,
             summary: this._summary(i), summary_note: "Written offline from the abstract (English). Other languages are app-side.",
             questions: this._questions(i),
             author: authors.length ? authors[0].name : null, ends: `~${hhmm(x.est_end)}` },
      earlier: talks.slice(0, cur).map(([, j], k) => ({ n: k + 1, title: this.items[j].title, summary: this._summary(j) })),
      up_next: cur + 1 < n ? { n: cur + 2, title: this.items[talks[cur + 1][1]].title, time: `~${hhmm(talks[cur + 1][0].est_start)}`,
                               line: `Up next · ${this.items[talks[cur + 1][1]].title} · ~${hhmm(talks[cur + 1][0].est_start)}` } : null,
    });
    return out;
  }

  // -- 09 -----------------------------------------------------------------
  async getting_there(req) {
    let a = pyStr(or(req.from_room, "")).trim(), b = pyStr(or(req.to_room, "")).trim();
    const alias = { "entrance": "Entrance Hall", "registration": "Entrance Hall", "registration desk": "Entrance Hall",
                    "registration desks": "Entrance Hall" };
    a = alias[a.toLowerCase()] ?? a;
    b = alias[b.toLowerCase()] ?? b;
    const rooms = [...this.roomFloor.keys()];
    for (const r of [a, b]) {
      if (!this.roomFloor.has(r)) {
        const sug = getCloseMatches(r, rooms, 3);
        throw new InputError(`unknown room "${r}"` + (sug.length ? `; did you mean: ${sug.join(", ")}` : ""));
      }
    }
    const stepFree = "step_free" in req ? truthy(req.step_free) : true;
    const w = this._walk(a, b, stepFree);
    const fa = this.roomFloor.get(a), fb = this.roomFloor.get(b);
    const out = {
      from: a, to: b, title: `${a} → ${b}`, ...w,
      header: "Getting there", from_label: `From ${a}`, headline: a === b ? "Same room" : `${w.min}–${w.max} min`,
      to_line: `to ${b} · ${levelLine(fb)}` + (stepFree ? " · step-free" : ""), button: "I'm here",
      floor_plans: [...new Set([fa, fb])].filter(Boolean).map((f) => ({ floor: f, level: level(f), map: this.floorMap.get(f) ?? "" })),
      pins: [{ label: "A", room: a }, { label: "B", room: b }, ...(fa !== fb ? [{ label: "Elevator" }] : [])],
      map_caption: "Floor plan from programme data · pins only",
      steps: null,
      note: "Step-by-step directions are on hold (보류) until the landmark graph exists; minutes are a same-level / other-level estimate.",
    };
    if (truthy(req.next_start)) {
      out.next_talk = `Next talk starts ~${hhmm(pyStr(req.next_start))} (est.) · Level ${level(fa)} → Level ${level(fb)}`;
    }
    return out;
  }

  // -- 09-1 / 11 (v3) -------------------------------------------------------
  async places(req) {
    const q = norm(pyStr(or(req.q, "")));
    const last = pyStr(or(req.last_room, "")).trim();
    let out = [];
    if (last && this.roomFloor.has(last)) out.push({ name: last, room: last, line: "Your last stop", selected: true });
    out.push({ name: "Registration", room: "Entrance Hall", line: `Entrance Hall · ${levelLine(this.roomFloor.get("Entrance Hall") ?? "")}`,
               selected: !out.length });
    const rooms = sortedBy([...this.roomFloor.keys()].filter((r) => r !== last && r !== "Entrance Hall"),
                           (r) => [this.roomFloor.get(r), r]);
    out.push(...rooms.map((r) => ({ name: r, room: r, line: levelLine(this.roomFloor.get(r)), selected: false })));
    if (q) out = out.filter((x) => hasPrefixes(norm(x.name + " " + x.line), q.split(" ").filter(Boolean)));
    const k = pyInt(or(req.top_k, 20));
    return { header: "Where are you now?", search: "Room or place", total: out.length, places: out.slice(0, k), button: "I'm here" };
  }

  async questions(req) {
    const i = this._itemById(req.id ?? null);
    const qs = this._questions(i);
    return { header: "Ask in English", for: `For · ${this.items[i].title}`, id: this.items[i].id,
             suggested: qs.map((q) => ({ text: q, show_large: `“${q}”` })),
             translate: { text: null, note: "A question typed in another language is put into English app-side (LLM); the model only suggests." },
             buttons: ["Show large", "Read aloud"] };
  }

  // -- dispatch -----------------------------------------------------------
  static SCREENS = {
    meta: "meta", keywords: "keywords", nearby: "nearby", days: "days_screen", route: "route", more: "more",
    filters: "filters", search: "search", paper: "paper", author: "author", wrapup: "wrapup",
    session_live: "session_live", clusters: "clusters_screen", start: "start", browse: "browse", plan: "plan",
    places: "places", questions: "questions",
    getting_there: "getting_there",
  };

  async handle(req) {
    if (!isObj(req)) throw new InputError('request must be a JSON object with "screen"');
    const screen = req.screen;
    if (typeof screen !== "string" || !Object.hasOwn(ARC.SCREENS, screen)) {
      throw new InputError(`screen must be one of ${pyStr(Object.keys(ARC.SCREENS))}, got ${pyDumps(screen ?? null)}`);
    }
    const t0 = performance.now();
    const out = await this[ARC.SCREENS[screen]](req);
    return { screen, ...out, latency_ms: pyRound(performance.now() - t0, 1) };
  }
}

export { PyValueError };
