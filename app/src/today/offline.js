// The offline line (03-L). Pure. "saved at" is the phone's own clock time (the person reads it on the phone),
// not the venue time zone; `timeZone` is only passed by tests.
const formatters = new Map();
const phoneClock = (ms, timeZone) => {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }));
  return formatters.get(timeZone).format(ms);
};
export const offlineNote = (online, savedAt, timeZone = undefined) =>
  online ? null : savedAt ? `Offline · saved at ${phoneClock(savedAt, timeZone)}` : 'Offline · showing what is on this phone';
