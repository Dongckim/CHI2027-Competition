// Static server for the no-design bench pages (ES modules, fetch() and the microphone do not work from file://).
// Also mounts functions/ handlers under /api/ so the bench can call them like the real host would.
// Usage: npm run bench  (captions need SONIOX_API_KEY, push needs VAPID_JWK in .env.local, which git ignores)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sonioxKey from '../functions/soniox-key.mjs';
import push from '../functions/push.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try { process.loadEnvFile(`${root}.env.local`); } catch {} // optional: only the captions bench needs it
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const api = { '/api/soniox-key': sonioxKey, '/api/push': push };
const port = Number(process.env.PORT) || 5173;

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (api[pathname]) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await api[pathname](new Request(`http://localhost${pathname}`, { method: req.method, headers: req.headers, body }), process.env);
    res.writeHead(r.status, Object.fromEntries(r.headers)).end(await r.text());
    return;
  }
  const path = resolve(root, '.' + decodeURIComponent(pathname));
  if (!path.startsWith(root.replace(/[\\/]$/, '') + sep) || !types[extname(path)] || path.includes(`${sep}functions${sep}`)) { res.writeHead(404).end(); return; }
  try {
    res.writeHead(200, { 'content-type': types[extname(path)], 'cache-control': 'no-store' }).end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/tests/venue/bench.html\nhttp://localhost:${port}/tests/captions/bench.html\nhttp://localhost:${port}/tests/captions/conversation.html`));
