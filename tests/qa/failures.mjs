// qa:auto (tests/qa/run.mjs): read the failure lines out of a check's output.
/** The failure lines a check printed, whatever its style. */
export function failuresOf(out, code) {
  const lines = out.split('\n'), f = [];
  for (const l of lines) {
    if (/^FAIL [\w-]+: \d+ of \d+$/.test(l) || /^FAIL: \d+ \(/.test(l)) continue; // summaries
    if (/^FAIL \d+: /.test(l)) { f.push(...l.replace(/^FAIL \d+: /, '').split(' | ')); continue; } // FAIL 2: a | b (tests/arc style)
    if (/^FAIL /.test(l)) { f.push(l.slice(5)); continue; } // reporter rows
    if (/^\s+\[\d\d\] /.test(l)) { f.push(l.trim()); continue; } // a11y-check details
    if (/^stopped: /.test(l)) f.push(l);
  }
  if (code !== 0 && !f.length) f.push(`exit ${code} with no failure line (see the output above)`);
  return f;
}
