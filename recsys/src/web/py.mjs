// Small pieces of Python behaviour the ported models rely on, so the JavaScript
// runtime answers exactly like the Python package: word regexes, round(), sorting
// by key tuples, Counter.most_common, difflib, datetime with a UTC offset, numpy's
// float32 arithmetic and the .npy file format.

export class InputError extends Error {}

// ---------------------------------------------------------------- strings
// Python's \w on str patterns: any letter or number, or "_"
export const W = "\\p{L}\\p{N}_";
const TOKEN = new RegExp(`[${W}]+`, "gu");
const NONWORD = new RegExp(`[^${W}]+`, "gu");

export function findWords(s) {
  return s.match(TOKEN) || [];
}

export function subNonWord(s, rep = " ") {
  return s.replace(NONWORD, rep);
}

export function pySplit(s) {
  return s.split(/\s+/u).filter(Boolean);
}

export function isDigits(s) {
  return typeof s === "string" && /^\p{Nd}+$/u.test(s);
}

export function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
}

export function or(v, d) {
  return truthy(v) ? v : d;
}

export function pyStr(v) {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) && !Object.is(v, -0) ? String(v) : pyFloatRepr(v);
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  return "{" + Object.entries(v).map(([k, x]) => pyRepr(k) + ": " + pyRepr(x)).join(", ") + "}";
}

function pyFloatRepr(x) {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  let s = String(x);
  if (/e/.test(s)) {
    const [m, e] = s.split("e");
    const n = parseInt(e, 10);
    if (n >= -4 && n < 16) s = x.toFixed(Math.max(0, -n + (m.split(".")[1] || "").length));
    else return m + "e" + (n < 0 ? "-" : "+") + String(Math.abs(n)).padStart(2, "0");
  }
  return /[.]/.test(s) ? s : s + ".0";
}

export function pyRepr(v) {
  if (typeof v !== "string") return pyStr(v);
  const q = v.includes("'") && !v.includes('"') ? '"' : "'";
  let out = q;
  for (const ch of v) {
    const c = ch.codePointAt(0);
    if (ch === "\\" || ch === q) out += "\\" + ch;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += "\\x" + c.toString(16).padStart(2, "0");
    else out += ch;
  }
  return out + q;
}

// json.dumps(v) with Python's defaults: ", " and ": " separators, ensure_ascii
export function pyDumps(v) {
  if (v === null || v === undefined) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : pyFloatRepr(v);
  if (typeof v === "string") {
    return '"' + Array.from(JSON.stringify(v).slice(1, -1)).map((ch) => {
      const c = ch.codePointAt(0);
      if (c < 0x80) return ch;
      if (c > 0xffff) {
        const h = Math.floor((c - 0x10000) / 0x400) + 0xd800, l = ((c - 0x10000) % 0x400) + 0xdc00;
        return "\\u" + h.toString(16).padStart(4, "0") + "\\u" + l.toString(16).padStart(4, "0");
      }
      return "\\u" + c.toString(16).padStart(4, "0");
    }).join("") + '"';
  }
  if (Array.isArray(v)) return "[" + v.map(pyDumps).join(", ") + "]";
  return "{" + Object.entries(v).map(([k, x]) => pyDumps(k) + ": " + pyDumps(x)).join(", ") + "}";
}

// int(x) for the values a JSON request can carry; throws TypeError / RangeError
// where Python raises TypeError / ValueError
export class PyValueError extends Error {}
export function pyInt(x) {
  if (typeof x === "boolean") return x ? 1 : 0;
  if (typeof x === "number") {
    if (!Number.isFinite(x)) throw new PyValueError("cannot convert float");
    return Math.trunc(x);
  }
  if (typeof x === "string") {
    const s = x.trim();
    if (!/^[+-]?\d+(_\d+)*$/.test(s)) throw new PyValueError(`invalid literal for int(): ${pyRepr(x)}`);
    return parseInt(s.replace(/_/g, ""), 10);
  }
  throw new TypeError("int() argument must be a string or a number");
}

// ---------------------------------------------------------------- numbers
// round(x, n): the shortest decimal of the correctly rounded value, ties to even
export function pyRound(x, n = 0) {
  if (!Number.isFinite(x)) return x;
  const r = Number(x.toFixed(n));
  // toFixed breaks an exact tie upwards; Python goes to the even neighbour
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const hi = buf.getUint32(0), lo = buf.getUint32(4);
  const exp = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e = exp - 1075;
  if (exp === 0) e = -1074;
  else mant |= 1n << 52n;
  if (mant === 0n) return r;
  // 2 * 10^n * |x| = 2 * 10^n * mant * 2^e must be an odd integer for a tie
  let num = 2n * 10n ** BigInt(n) * mant;
  if (e >= 0) return r;
  const den = 1n << BigInt(-e);
  if (num % den !== 0n) return r;
  const twice = num / den;
  if (twice % 2n === 0n) return r;
  const k = (twice - 1n) / 2n;                    // |x| * 10^n = k + 0.5
  const even = k % 2n === 0n ? k : k + 1n;
  const v = Number(even) / 10 ** n;
  return x < 0 ? -v : v;
}

export const f32 = Math.fround;

export function minmax(x) {
  // numpy float32: (x - min) / (max - min + 1e-9)
  let lo = Infinity, hi = -Infinity;
  for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const den = f32(f32(hi - lo) + f32(1e-9));
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = f32(x[i] - lo) / den;
  return out;
}

// rows of a [n, d] float32 matrix times a vector -> float32 [n]
export function matvec(M, n, d, v) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * d;
    for (let k = 0; k < d; k++) s += M[o + k] * v[k];
    out[i] = s;
  }
  return out;
}

export function row(M, d, i) {
  return M.subarray(i * d, (i + 1) * d);
}

export function dot(a, b) {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return f32(s);
}

export function normalize(v) {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  const out = new Float32Array(v.length);
  for (let k = 0; k < v.length; k++) out[k] = v[k] / n;
  return out;
}

export function meanRows(M, d, idx) {
  const out = new Float64Array(d);
  for (const i of idx) for (let k = 0; k < d; k++) out[k] += M[i * d + k];
  const r = new Float32Array(d);
  for (let k = 0; k < d; k++) r[k] = out[k] / idx.length;
  return r;
}

// np.argsort(-x) as a stable sort (numpy's default is not stable; ties are rare)
export function argsortDesc(x, idx = null) {
  const a = idx ? Array.from(idx) : Array.from(x, (_, i) => i);
  return a.sort((i, j) => (x[j] - x[i]) || (i - j));
}

// ---------------------------------------------------------------- sorting
function cmp(a, b) {
  if (Array.isArray(a)) {
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      const c = cmp(a[k], b[k]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  if (typeof a === "boolean") a = +a;
  if (typeof b === "boolean") b = +b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedBy(arr, key = (x) => x, reverse = false) {
  const a = Array.from(arr).map((v, i) => [key(v), i, v]);
  a.sort((x, y) => (reverse ? cmp(y[0], x[0]) : cmp(x[0], y[0])) || x[1] - y[1]);
  return a.map((x) => x[2]);
}

export function maxBy(arr, key) {
  // Python max(): the first of the largest
  let best, bk, first = true;
  for (const v of arr) {
    const k = key(v);
    if (first || cmp(k, bk) > 0) { best = v; bk = k; first = false; }
  }
  if (first) throw new PyValueError("max() arg is an empty sequence");
  return best;
}

export function minBy(arr, key) {
  let best, bk, first = true;
  for (const v of arr) {
    const k = key(v);
    if (first || cmp(k, bk) < 0) { best = v; bk = k; first = false; }
  }
  if (first) throw new PyValueError("min() arg is an empty sequence");
  return best;
}

export class Counter extends Map {
  add(k, n = 1) { this.set(k, (this.get(k) || 0) + n); return this; }
  update(iter) { for (const k of iter) this.add(k); return this; }
  count(k) { return this.get(k) || 0; }
  mostCommon(n = null) {
    const a = sortedBy(this.entries(), (e) => e[1], true);
    return n === null ? a : a.slice(0, n);
  }
}

export function unique(arr) {
  return [...new Set(arr)];
}

// ---------------------------------------------------------------- difflib
export class SequenceMatcher {
  constructor(a = "", b = "") {
    this.a = Array.from(a);
    this.setSeq2(b);
  }

  setSeq2(b) {
    this.b = Array.from(b);
    this.fullbcount = null;
    const b2j = new Map();
    this.b.forEach((ch, i) => {
      if (!b2j.has(ch)) b2j.set(ch, []);
      b2j.get(ch).push(i);
    });
    const n = this.b.length;
    if (n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [ch, idx] of [...b2j]) if (idx.length > ntest) b2j.delete(ch);
    }
    this.b2j = b2j;
    this.matching = null;
  }

  setSeq1(a) {
    this.a = Array.from(a);
    this.matching = null;
  }

  findLongestMatch(alo, ahi, blo, bhi) {
    const { a, b, b2j } = this;
    let besti = alo, bestj = blo, bestsize = 0;
    let j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map();
      for (const j of b2j.get(a[i]) || []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) || 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
      }
      j2len = newj2len;
    }
    // nothing is junk, so a match grows over equal neighbours, popular ones included
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti--; bestj--; bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi
           && a[besti + bestsize] === b[bestj + bestsize]) bestsize++;
    return [besti, bestj, bestsize];
  }

  matchingBlocks() {
    if (this.matching) return this.matching;
    const la = this.a.length, lb = this.b.length;
    const queue = [[0, la, 0, lb]], blocks = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop();
      const [i, j, k] = this.findLongestMatch(alo, ahi, blo, bhi);
      if (k) {
        blocks.push([i, j, k]);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    blocks.sort((x, y) => cmp(x, y));
    let i1 = 0, j1 = 0, k1 = 0;
    const out = [];
    for (const [i2, j2, k2] of blocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) k1 += k2;
      else {
        if (k1) out.push([i1, j1, k1]);
        [i1, j1, k1] = [i2, j2, k2];
      }
    }
    if (k1) out.push([i1, j1, k1]);
    out.push([la, lb, 0]);
    this.matching = out;
    return out;
  }

  ratio() {
    const m = this.matchingBlocks().reduce((s, x) => s + x[2], 0);
    const t = this.a.length + this.b.length;
    return t ? 2 * m / t : 1;
  }

  quickRatio() {
    if (!this.fullbcount) {
      this.fullbcount = new Map();
      for (const ch of this.b) this.fullbcount.set(ch, (this.fullbcount.get(ch) || 0) + 1);
    }
    const avail = new Map();
    let m = 0;
    for (const ch of this.a) {
      const n = avail.has(ch) ? avail.get(ch) : (this.fullbcount.get(ch) || 0);
      avail.set(ch, n - 1);
      if (n > 0) m++;
    }
    const t = this.a.length + this.b.length;
    return t ? 2 * m / t : 1;
  }

  realQuickRatio() {
    const la = this.a.length, lb = this.b.length;
    return la + lb ? 2 * Math.min(la, lb) / (la + lb) : 1;
  }
}

export function getCloseMatches(word, possibilities, n = 3, cutoff = 0.6) {
  const s = new SequenceMatcher();
  s.setSeq2(word);
  const res = [];
  for (const x of possibilities) {
    s.setSeq1(x);
    if (s.realQuickRatio() >= cutoff && s.quickRatio() >= cutoff && s.ratio() >= cutoff) {
      res.push([s.ratio(), x]);
    }
  }
  // heapq.nlargest on (score, x): the highest score first, ties by the larger string
  res.sort((p, q) => cmp(q, p));
  return res.slice(0, n).map((r) => r[1]);
}

// ---------------------------------------------------------------- datetime
// A moment with the UTC offset it was written in, like an aware datetime
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{3})(\d{3})?)?)?)?(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?)?$/;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export class DT {
  constructor(ms, off) {
    this.ms = ms;       // UTC milliseconds
    this.off = off;     // minutes east of UTC, null when naive
  }

  static parse(s) {
    const m = ISO.exec(String(s));
    if (!m) throw new PyValueError(`Invalid isoformat string: ${pyRepr(String(s))}`);
    const [, y, mo, d, h = "0", mi = "0", se = "0", ms = "0"] = m;
    const local = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se, +ms);
    const dt = new Date(local);
    if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d
        || +h > 23 || +mi > 59 || +se > 59) throw new PyValueError(`Invalid isoformat string: ${pyRepr(String(s))}`);
    const off = m[9] ? (m[9] === "-" ? -1 : 1) * (+m[10] * 60 + +m[11]) : null;
    return new DT(local - (off || 0) * 60000, off);
  }

  withOffset(off) {
    // replace(tzinfo=...): same wall time, now with an offset
    return new DT(this.ms - (off - (this.off || 0)) * 60000, off);
  }

  _local() {
    return new Date(this.ms + (this.off || 0) * 60000);
  }

  plus(minutes) {
    return new DT(this.ms + minutes * 60000, this.off);
  }

  minus(other) {
    return (this.ms - other.ms) / 60000;      // minutes
  }

  date() {
    return this._local().toISOString().slice(0, 10);
  }

  weekday() {
    return (this._local().getUTCDay() + 6) % 7;
  }

  hhmm() {
    return this._local().toISOString().slice(11, 16);
  }

  iso() {
    const l = this._local().toISOString();
    let s = l.slice(0, 19);
    const msec = this._local().getUTCMilliseconds();
    if (msec) s += "." + String(msec).padStart(3, "0") + "000";
    if (this.off === null) return s;
    const a = Math.abs(this.off);
    return s + (this.off < 0 ? "-" : "+") + String(Math.floor(a / 60)).padStart(2, "0") + ":"
      + String(a % 60).padStart(2, "0");
  }
}

export function dayLabel(date, short = true) {
  const d = DT.parse(date);
  const name = DAYS[d.weekday()];
  return `${short ? name.slice(0, 3) : name} ${+date.slice(8, 10)}`;
}

export function weekdayName(date) {
  return DAYS[DT.parse(date).weekday()].toLowerCase();
}

// ---------------------------------------------------------------- .npy
export function readNpy(buf) {
  const u8 = new Uint8Array(buf);
  const major = u8[6];
  const hlen = major === 1 ? u8[8] | (u8[9] << 8) : new DataView(u8.buffer, u8.byteOffset).getUint32(8, true);
  const start = major === 1 ? 10 : 12;
  const header = new TextDecoder().decode(u8.subarray(start, start + hlen));
  const descr = /'descr':\s*'([^']+)'/.exec(header)[1];
  const shape = /'shape':\s*\(([^)]*)\)/.exec(header)[1].split(",").map((x) => x.trim()).filter(Boolean).map(Number);
  if (/'fortran_order':\s*True/.test(header)) throw new Error("fortran order .npy is not supported");
  const off = u8.byteOffset + start + hlen;
  const n = shape.reduce((a, b) => a * b, 1);
  const data = u8.buffer.slice(off, off + n * ({ "<f4": 4, "|i1": 1, "<f2": 2, "<i4": 4 }[descr]));
  let arr;
  if (descr === "<f4") arr = new Float32Array(data);
  else if (descr === "|i1") arr = new Int8Array(data);
  else if (descr === "<i4") arr = new Int32Array(data);
  else if (descr === "<f2") {
    const h = new Uint16Array(data);
    arr = new Float32Array(h.length);
    for (let i = 0; i < h.length; i++) arr[i] = half(h[i]);
  } else throw new Error(`unsupported .npy dtype ${descr}`);
  return { data: arr, shape };
}

function half(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}
