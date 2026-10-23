// Vercel entry for functions/push.mjs (tests/serve.mjs mounts the same handler locally). maxDuration is in vercel.json.
import push from '../functions/push.mjs';

export default { fetch: request => push(request, process.env) };
