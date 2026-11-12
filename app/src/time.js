// Time-zone helpers shared by the data build (node) and the app (browser). Pure, no I/O.

const formatters = new Map();
// Feed and demo times are venue wall-clock values written as if they were UTC (docs/decisions/001) → the real UTC instant.
export function wallToInstant(ms, timeZone) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }));
  const offset = t => {
    const p = Object.fromEntries(formatters.get(timeZone).formatToParts(t).map(x => [x.type, x.value]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  };
  return ms - offset(ms - offset(ms));
}

// "2026-04-14" + 625 minutes in Europe/Madrid → the instant it is 10:25 there that day.
export function venueInstant(day, minutes, timeZone) {
  const [y, m, d] = day.split('-').map(Number);
  return wallToInstant(Date.UTC(y, m - 1, d, 0, minutes), timeZone);
}

const clockFormatters = new Map();
export function venueClock(ms, timeZone) {
  if (!clockFormatters.has(timeZone)) clockFormatters.set(timeZone, new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }));
  return clockFormatters.get(timeZone).format(ms);
}
