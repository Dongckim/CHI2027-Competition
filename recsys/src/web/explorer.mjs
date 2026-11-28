// CHI 2026 program explorer: filter the whole program by who and where. A port of
// explorer.py with the same request and response.
import {
  InputError, Counter, DT, getCloseMatches, isDigits, minmax, matvec, f32, pyDumps, pyRepr,
  pyRound, pyStr, sortedBy, SequenceMatcher, truthy, W,
} from "./py.mjs";
import { BM25, Speller, expansionLists, nonLatin, norm } from "./retriever.mjs";

export { norm };
export const FILTERS = ["institution", "department", "country", "author", "type", "session", "day"];
const LISTS = ["sessions", "countries", "types", "institutions"];
const COUNTRY_ALIASES = {
  "korea": "korea republic of", "south korea": "korea republic of",
  "republic of korea": "korea republic of",
  "usa": "united states", "us": "united states", "america": "united states",
  "united states of america": "united states",
  "uk": "united kingdom", "britain": "united kingdom", "great britain": "united kingdom",
  "england": "united kingdom",
};
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function hasWords(text, words) {
  return ` ${text} `.includes(` ${words} `);
}

export function hasPrefixes(text, words) {
  const tw = text.split(" ").filter(Boolean);
  return words.every((w) => tw.some((t) => t.startsWith(w)));
}

function initialsFit(acro, full) {
  acro = acro.replaceAll(" ", "");
  full = full.replaceAll(" ", "");
  if (acro.length < 2 || !full || acro[0] !== full[0]) return false;
  let k = 0;
  for (const ch of acro) {
    k = full.indexOf(ch, k);
    if (k < 0) return false;
    k += 1;
  }
  return true;
}

const ISTOP = new Set(["of", "and", "the", "for", "at", "de", "da", "di", "du", "la", "le", "der", "und", "in"]);

function initials(name) {
  return name.split(" ").filter((w) => w && !ISTOP.has(w)).map((w) => w[0]).join("");
}

const PAREN = /^(.*?)\s*\(([^()]+)\)\s*$/u;
const UNIT = new RegExp(`(?<![${W}])(?:department|school|faculty|college of|lab)(?![${W}])`, "u");

export class InstitutionIndex {
  constructor(names) {
    this.names = [...new Set([...names].filter(Boolean))].sort();
    this.normed = new Map(this.names.map((n) => [n, norm(n)]));
    const parent = new Map();
    const find = (x) => {
      if (!parent.has(x)) parent.set(x, x);
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)));
        x = parent.get(x);
      }
      return x;
    };
    for (const n of this.names) {
      find(norm(n));
      const m = PAREN.exec(n);
      if (!m) continue;
      const a = norm(m[1]), b = norm(m[2]);
      const [short, full] = [a, b].sort((x, y) => x.length - y.length);
      if (short && full && initialsFit(short, full)) {
        parent.set(find(short), find(full));
        if (!parent.has(a)) parent.set(a, a);
        if (!parent.has(b)) parent.set(b, b);
      }
    }
    this.groups = new Map();
    for (const key of [...parent.keys()]) {
      const r = find(key);
      if (!this.groups.has(r)) this.groups.set(r, new Set());
      this.groups.get(r).add(key);
    }
    this.find = find;
  }

  /** -> [raw names that count as query, the subset found only by initials] */
  match(query) {
    const q = norm(query);
    const qn = q.split(" ").filter(Boolean).length;
    let terms = new Set([q]);
    for (const members of this.groups.values()) {
      if ([...members].some((m) => m.split(" ").filter(Boolean).length <= qn + 1 && hasWords(m, q))) {
        for (const m of members) terms.add(m);
      }
    }
    const hit = (n, ts) => [...ts].some((t) => hasWords(this.normed.get(n), t));
    let direct = new Set(this.names.filter((n) => hit(n, terms)));
    let byInitials = new Set();
    if (/^[a-z]{2,6}$/.test(q)) {
      const extra = new Set();
      for (const nn of new Set(this.normed.values())) {
        for (const part of nn.split(UNIT)) {
          if (initials(part) === q && part.trim()) extra.add(part.trim());
        }
      }
      byInitials = new Set(this.names.filter((n) => hit(n, extra) && !direct.has(n)));
      byInitials = new Set([...byInitials].filter((n) => ![...direct].some((d) =>
        new SequenceMatcher(this.normed.get(n), this.normed.get(d)).ratio() > 0.9)));
      for (const n of this.names) if (hit(n, extra) && !byInitials.has(n)) direct.add(n);
    }
    for (const n of byInitials) direct.add(n);
    return [direct, byInitials];
  }

  suggest(query, n = 5) {
    const pool = new Map();
    for (const [name, nn] of this.normed) if (!pool.has(nn)) pool.set(nn, name);
    return getCloseMatches(norm(query), [...pool.keys()], n, 0.7).map((c) => pool.get(c));
  }
}

function topK(k, def) {
  if (k === null || k === undefined) return def;
  if (typeof k === "string" && isDigits(k.trim())) k = parseInt(k.trim(), 10);
  if (typeof k === "boolean" || typeof k !== "number" || !Number.isInteger(k) || k < 1) {
    throw new InputError(`top_k must be a whole number of at least 1, got ${pyDumps(k)}`);
  }
  return k;
}

/** pkg: {config, program, expansions, programEmb: {data, n, d}, embed} */
export class Explorer {
  constructor(pkg) {
    this.items = pkg.program;
    this.emb = pkg.programEmb;
    this.embed = pkg.embed;
    this.cfg = pkg.config;
    const exp = expansionLists(pkg.expansions, this.items) || this.items.map(() => []);
    this.bm25 = new BM25(this.items.map((it, i) => `${it.title}. ${it.abstract}`
      + (exp[i].length ? ` ; ${exp[i].join(" ; ")}` : "")));
    this.speller = new Speller(this.bm25, pkg.words);
    this.inst = new InstitutionIndex(this.items.flatMap((it) => it.authors.flatMap((a) =>
      a.affiliations.map((af) => af.institution))));
    this.types = [...new Set(this.items.map((it) => it.type).filter(Boolean))].sort();
    this.slotsOf = new Map();
    const first = new Map();
    const key = (it) => it.type + "\u0000" + it.title.trim().toLowerCase();
    this.items.forEach((it, i) => {
      if (!first.has(key(it))) first.set(key(it), i);
      const f = first.get(key(it));
      if (!this.slotsOf.has(f)) this.slotsOf.set(f, []);
      this.slotsOf.get(f).push(...it.sessions);
    });
    this.dup = this.items.map((it, i) => first.get(key(it)) !== i);
  }

  sims(vec) {
    return matvec(this.emb.data, this.emb.n, this.emb.d, vec);
  }

  _parse(req) {
    if (!req || typeof req !== "object" || Array.isArray(req)) {
      throw new InputError('request must be a JSON object, e.g. {"institution": "postech", "topic": "haptics"}');
    }
    const allowed = [...FILTERS, "topic", "top_k", "sort", "list"];
    const unknown = Object.keys(req).filter((k) => !allowed.includes(k)).sort();
    if (unknown.length) {
      throw new InputError(`unknown field(s) ${pyStr(unknown)}; use any of ${pyStr(allowed)}`);
    }
    const f = {};
    for (const k of [...FILTERS, "topic"]) {
      const v = req[k];
      if (v !== null && v !== undefined && pyStr(v).trim()) f[k] = pyStr(v).trim();
    }
    if (!Object.keys(f).length) throw new InputError(`give at least one of ${pyStr([...FILTERS, "topic"])}`);
    const k = topK(req.top_k, 20);
    const sort = truthy(req.sort) ? req.sort : ("topic" in f ? "relevance" : "time");
    if (sort !== "relevance" && sort !== "time") throw new InputError('sort must be "relevance" or "time"');
    if (sort === "relevance" && !("topic" in f)) throw new InputError('sort "relevance" needs a topic');
    return [f, k, sort];
  }

  _dayMatch(day) {
    const d = day.toLowerCase();
    const short = WEEKDAYS.map((w) => w.slice(0, 3));
    if (WEEKDAYS.includes(d) || short.includes(d.slice(0, 3))) {
      const idx = short.indexOf(d.slice(0, 3));
      return (start) => DT.parse(start.slice(0, 10)).weekday() === idx;
    }
    const m = /^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/.exec(d);
    if (!m) throw new InputError(`day must look like "2026-04-14", "04-14" or "tuesday", got "${day}"`);
    const md = `${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
    return (start) => start.slice(5, 10) === md;
  }

  /** All slots of a talk by time; with a day/session filter, matching slots first. */
  _slots(i, slotOk = null) {
    const slots = this.slotsOf.has(i) ? this.slotsOf.get(i) : this.items[i].sessions;
    return sortedBy(slots, (s) => [!(slotOk && slotOk(s)), s.start || "9999"]);
  }

  listValues(what, k = null) {
    if (!LISTS.includes(what)) throw new InputError(`list must be one of ${pyStr(LISTS)}, got ${pyDumps(what)}`);
    const c = new Counter();
    this.items.forEach((it, i) => {
      if (this.dup[i]) return;
      if (what === "sessions") c.update(new Set(this._slots(i).map((s) => s.session).filter(Boolean)));
      else if (what === "types") c.add(it.type);
      else {
        const key = what === "countries" ? "country" : "institution";
        c.update(new Set(it.authors.flatMap((a) => a.affiliations.map((af) => af[key])).filter(Boolean)));
      }
    });
    const rows = c.mostCommon(k).map(([name, count]) => ({ name, count }));
    return { list: what, total: c.size, returned: rows.length, items: rows };
  }

  async predict(req) {
    if (req && typeof req === "object" && !Array.isArray(req) && "list" in req) {
      return this.listValues(pyStr(req.list).trim().toLowerCase(), topK(req.top_k, null));
    }
    const [f, k, sort] = this._parse(req);
    const t0 = performance.now();
    const matched = {}, warnings = [];
    const keep = this.items.map(() => true);
    const why = this.items.map(() => []);

    let instNames = null, countryTerms = null;
    if ("institution" in f) {
      const [names, byInitials] = this.inst.match(f.institution);
      instNames = names;
      matched.institution = [...names].sort();
      if (byInitials.size) {
        const bi = [...byInitials].sort();
        warnings.push(`"${f.institution}" was also matched by initials to: ` + bi.slice(0, 6).join("; ")
          + (bi.length > 6 ? " ..." : "") + ". Use the full name to leave out other institutions.");
      }
    }
    if ("country" in f) {
      const c = norm(f.country);
      const terms = [COUNTRY_ALIASES[c] ?? c];
      const names = [...new Set(this.items.flatMap((it) => it.authors.flatMap((a) =>
        a.affiliations.filter((af) => terms.some((t) => hasWords(norm(af.country), t))).map((af) => af.country))))].sort();
      matched.country = names;
      countryTerms = new Set(names.map(norm));
    }
    const authorWords = "author" in f ? norm(f.author).split(" ").filter(Boolean) : null;
    const deptWords = "department" in f ? norm(f.department).split(" ").filter(Boolean) : null;
    const dayOk = "day" in f ? this._dayMatch(f.day) : null;
    const sessWords = "session" in f ? norm(f.session).split(" ").filter(Boolean) : null;
    let slotOk = null;
    if (dayOk || (sessWords && sessWords.length)) {
      slotOk = (s) => (!dayOk || Boolean(s.start && dayOk(s.start)))
        && (!(sessWords && sessWords.length) || hasPrefixes(norm(s.session), sessWords));
    }
    const needAff = instNames !== null || countryTerms !== null || Boolean(deptWords && deptWords.length);

    this.items.forEach((it, i) => {
      if (needAff || (authorWords && authorWords.length)) {
        const hits = [];
        for (const a of it.authors) {
          if (authorWords && authorWords.length && !authorWords.every((w) => hasWords(norm(a.name), w))) continue;
          const affs = a.affiliations.filter((af) => (instNames === null || instNames.has(af.institution))
            && (countryTerms === null || countryTerms.has(norm(af.country)))
            && (!(deptWords && deptWords.length) || hasPrefixes(norm(af.department + " " + af.institution), deptWords)));
          if (needAff && !affs.length) continue;
          const h = { name: a.name };
          if (affs.length) for (const k2 of ["institution", "department", "country"]) h[k2] = affs[0][k2];
          hits.push(h);
        }
        if (!hits.length) {
          keep[i] = false;
          return;
        }
        why[i] = hits;
      }
      if ("type" in f && !norm(it.type).includes(norm(f.type).replace(/s+$/, ""))) keep[i] = false;
      if (slotOk && !it.sessions.some(slotOk)) keep[i] = false;
    });

    // a listed-twice talk counts once: fold the copy into the first listing
    this.items.forEach((it, i) => {
      if (!(keep[i] && this.dup[i])) return;
      const j = this.items.findIndex((x, jj) => !this.dup[jj] && x.title.trim().toLowerCase()
        === it.title.trim().toLowerCase() && x.type === it.type);
      keep[j] = true;
      why[j] = why[j].length ? why[j] : why[i];
    });
    let idx = [];
    this.items.forEach((_, i) => { if (keep[i] && !this.dup[i]) idx.push(i); });
    if ("author" in f) matched.author = [...new Set(idx.flatMap((i) => why[i].map((h) => h.name)))].sort();
    if ("type" in f) matched.type = this.types.filter((t) => norm(t).includes(norm(f.type).replace(/s+$/, "")));
    if ("department" in f) {
      matched.department = [...new Set(idx.flatMap((i) => why[i].map((h) => h.department || h.institution || "")))].sort();
    }
    if (sessWords && sessWords.length) {
      matched.session = [...new Set(idx.flatMap((i) => this._slots(i).filter(slotOk).map((s) => s.session)))].sort();
    }

    let score = null;
    if ("topic" in f && idx.length) {
      if (nonLatin(f.topic)) {
        warnings.push("The model understands English only; non-English words in topic are ignored and the ranking may be unrelated.");
      }
      const topic = this.speller.fix(f.topic);
      const a = minmax(this.sims(await this.embed(topic))), b = minmax(this.bm25.scores(topic));
      const w = f32(this.cfg.hybrid_w);
      score = Float32Array.from(a, (x, i) => f32(x + f32(w * b[i])));
    }
    if (sort === "relevance") idx = sortedBy(idx, (i) => -score[i]);
    else {
      idx = sortedBy(idx, (i) => {
        const s = this._slots(i, slotOk);
        return [s.length && s[0].start ? s[0].start : "9999", this.items[i].title];
      });
    }

    const out = { filters: f, matched, total: idx.length, returned: Math.min(k, idx.length), sort, warnings };
    if (!idx.length) {
      if ("institution" in f && !instNames.size) {
        const sug = this.inst.suggest(f.institution);
        warnings.push(`No institution matches "${f.institution}".` + (sug.length ? ` Did you mean: ${sug.join(", ")}?` : ""));
      } else if (deptWords && deptWords.length && needAff && (instNames !== null || countryTerms !== null)) {
        const depts = new Counter();
        for (const it of this.items) for (const a of it.authors) for (const af of a.affiliations) {
          if (af.department && (instNames === null || instNames.has(af.institution))
              && (countryTerms === null || countryTerms.has(norm(af.country)))) depts.add(af.department);
        }
        warnings.push(`No department matching "${f.department}" here. Departments listed: `
          + depts.mostCommon(8).map(([d]) => d).join("; "));
      } else {
        warnings.push("Nothing matches all filters together; try fewer filters.");
      }
    }
    const days = new Counter();
    for (const i of idx) for (const s of this._slots(i, slotOk).slice(0, 1)) if (s.start) days.add(s.start.slice(0, 10));
    const byType = new Counter();
    for (const i of idx) byType.add(this.items[i].type);
    out.summary = {
      by_type: Object.fromEntries(byType.mostCommon()),
      by_day: Object.fromEntries([...days.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))),
      matching_authors: new Set(idx.flatMap((i) => why[i].map((h) => h.name))).size,
    };
    out.results = idx.slice(0, k).map((i, r) => ({
      rank: r + 1, id: this.items[i].id, type: this.items[i].type, title: this.items[i].title,
      authors: this.items[i].authors.map((a) => a.name),
      matched_authors: why[i],
      sessions: this._slots(i, slotOk),
      doi: this.items[i].doi,
      score: score !== null ? pyRound(score[i], 4) : null,
    }));
    out.latency_ms = pyRound(performance.now() - t0, 1);
    return out;
  }
}

export { pyRepr };
