// Vercel entry for functions/og.mjs (the link preview picture). Its files (resvg wasm, Inter, tribe shapes) are
// listed in vercel.json includeFiles so the function carries them.
import og from '../functions/og.mjs';

export default { fetch: request => og(request) };
