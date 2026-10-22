// Static server for the no-design bench pages (ES modules and fetch() do not work from file://).
// Usage: npm run bench  → http://localhost:5173/tests/venue/bench.html
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const port = Number(process.env.PORT) || 5173;

createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!path.startsWith(root.replace(/[\\/]$/, '') + sep) || !types[extname(path)]) { res.writeHead(404).end(); return; }
  try {
    res.writeHead(200, { 'content-type': types[extname(path)], 'cache-control': 'no-store' }).end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/tests/venue/bench.html`));
