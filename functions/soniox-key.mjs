// POST → a Soniox temporary key for one caption session. The long-lived key never leaves the server.
// Web-standard handler (Request → Response) so it runs on any functions host; tests/serve.mjs mounts it at /api/soniox-key.
// Stateless and silent: no request content is logged or stored. The limits below live in memory only.
// env: { SONIOX_API_KEY }

export const KEY_TTL_S = 60; // the phone must open the stream within a minute
export const SESSION_MAX_S = 2 * 60 * 60; // one stream at most 2 hours (a long session block)
export const PER_DEVICE_PER_HOUR = 6; // reconnects after screen-off or app switch included
export const PER_DAY = 2000; // whole server, each key worth SESSION_MAX_S at most

// shortcut: counters are per process and reset on restart, so a host with many instances multiplies them;
// the hard daily cap is the Soniox console's spending limit. Move to the host's rate limiting when V8 (#9) picks a host.
const hits = new Map(); // device -> timestamps in the last hour
let day = { date: '', count: 0 };

export default async function sonioxKey(request, env, now = Date.now()) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  if (!env.SONIOX_API_KEY) return json(500, { error: 'server has no SONIOX_API_KEY' });

  // the device is whatever the host says the client address is; it is only counted, never written anywhere
  const device = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
  if (hits.size > 10_000) for (const [d, ts] of hits) if (now - ts.at(-1) >= 3600_000) hits.delete(d);
  const recent = (hits.get(device) || []).filter(t => now - t < 3600_000);
  if (recent.length >= PER_DEVICE_PER_HOUR) return json(429, { error: 'too many caption sessions from this device, try again later' });
  const date = new Date(now).toISOString().slice(0, 10);
  if (day.date !== date) day = { date, count: 0 };
  if (day.count >= PER_DAY) return json(429, { error: 'captions are used up for today' });

  const res = await fetch('https://api.soniox.com/v1/auth/temporary-api-key', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.SONIOX_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ usage_type: 'transcribe_websocket', expires_in_seconds: KEY_TTL_S, single_use: true, max_session_duration_seconds: SESSION_MAX_S }),
  });
  if (!res.ok) {
    // Soniox's own reason (e.g. the key lacks the temporary-key permission); it never contains the key
    const reason = await res.json().then(e => e.message || e.error_type, () => '');
    return json(502, { error: `soniox ${res.status}${reason ? `: ${reason}` : ''}` });
  }
  const { api_key, expires_at } = await res.json();
  hits.set(device, [...recent, now]);
  day.count++;
  return json(200, { apiKey: api_key, expiresAt: expires_at, sessionMaxSeconds: SESSION_MAX_S });
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function resetLimits() { hits.clear(); day = { date: '', count: 0 }; } // tests only
