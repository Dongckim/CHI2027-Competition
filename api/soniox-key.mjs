// Vercel entry for functions/soniox-key.mjs (same handler tests/serve.mjs mounts locally). Env comes from the Vercel project.
import sonioxKey from '../functions/soniox-key.mjs';

export default { fetch: request => sonioxKey(request, process.env) };
