// Vercel entry for functions/og.mjs (the link preview picture). Its files (resvg wasm, Inter, tribe shapes) are
// listed in vercel.json includeFiles so the function carries them. Loaded on the first request, so a missing file
// answers 503 (the reason shown outside production) instead of failing the whole function.
let og = null;
export default {
  fetch: async request => {
    try { og ??= (await import('../functions/og.mjs')).default; }
    catch (e) { og = null; return new Response(process.env.VERCEL_ENV === 'production' ? 'no picture' : `no picture: ${e?.message ?? e}`, { status: 503, headers: { 'cache-control': 'no-store' } }); }
    return og(request);
  },
};
