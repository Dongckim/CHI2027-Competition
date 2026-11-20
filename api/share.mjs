// Vercel entry for functions/share.mjs (/s/<payload> is rewritten here in vercel.json).
import share from '../functions/share.mjs';

export default { fetch: request => share(request) };
