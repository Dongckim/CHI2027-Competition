// Vercel entry for functions/qa.mjs (talk Q&A, decision 007). Env: KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN, QA_SALT.
import qa from '../functions/qa.mjs';

export default { fetch: request => qa(request, process.env) };
