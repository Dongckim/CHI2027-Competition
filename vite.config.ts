import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('.', import.meta.url)));
// URL prefix → repo folder, for what the app and the bench pages read in dev. The production build copies the same (app/scripts/copy-static.mjs).
const STATIC: [string, string][] = [['/app-data/', 'data/build/app-data/'], ['/data/build/', 'data/build/'], ['/data/venue/', 'data/venue/'], ['/tests/', 'tests/'], ['/app/src/', 'app/src/'], ['/model/', 'dist/model/'], ['/model.json', 'dist/model.json']];
const TYPES: Record<string, string> = { '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.npy': 'application/octet-stream' };

// functions/ under /api/ in dev and preview (the real host runs api/*.mjs), so the app and the headless checks can call
// share and qa locally. Same Request → Response handlers; env from .env.local when there is one.
const API: Record<string, () => Promise<{ default: (r: Request, env: Record<string, string | undefined>) => Promise<Response> }>> = {
  '/api/share': () => import('./functions/share.mjs'), '/api/qa': () => import('./functions/qa.mjs'), '/api/og': () => import('./functions/og.mjs'),
};
const apiMiddleware = (server: { middlewares: { use: (f: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => void) => void } }) => {
  try { process.loadEnvFile(resolve(repo, '.env.local')); } catch { /* optional */ }
  server.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/s/')) { req.url = `/api/share?d=${url.pathname.slice(3)}`; url.pathname = '/api/share'; url.search = req.url.split('?')[1] ? `?${req.url.split('?')[1]}` : ''; }
    const load = API[url.pathname];
    if (!load) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
    const handler = (await load()).default;
    const r = await handler(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers as HeadersInit, body }), process.env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
};

const repoFiles = (): Plugin => ({
  name: 'arc-repo-files',
  configurePreviewServer(server) { apiMiddleware(server); },
  configureServer(server) {
    apiMiddleware(server);
    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url ?? '').split('?')[0]);
      const hit = STATIC.find(([url]) => path.startsWith(url));
      if (!hit) return next();
      const file = resolve(repo, hit[1] + path.slice(hit[0].length));
      if (!file.startsWith(repo + sep) || !existsSync(file) || !statSync(file).isFile() || !TYPES[extname(file)]) return next();
      res.setHeader('content-type', TYPES[extname(file)]);
      createReadStream(file).pipe(res);
    });
  },
});

// recsys/src/web/load.mjs (Wonjune's) also runs in Node and can use an ONNX encoder: those imports never run in the
// browser worker (the package's encoder is "static"), and the ONNX runtime is not in the repo, so they become empty modules.
const recsysStubs = (): Plugin => ({
  name: 'arc-recsys-stubs',
  resolveId(id, importer) {
    if (importer?.includes('/recsys/src/web/') && (id.startsWith('node:') || id.endsWith('ort.wasm.min.mjs'))) return '\0arc-empty';
    return null;
  },
  load(id) { return id === '\0arc-empty' ? 'export default {};' : null; },
});

export default defineConfig({
  worker: { format: 'es', plugins: () => [recsysStubs()] },
  root: 'app',
  publicDir: false,
  plugins: [react(), tailwindcss(), repoFiles(), recsysStubs()],
  server: { host: true, fs: { allow: [repo] } },
  // Final UI pictures (app/src/assets/arc) stay files, not data URLs inside the JS: the first screen's bundle must not grow,
  // and each screen's pictures load with that screen (the service worker precaches them for offline).
  build: { outDir: '../dist', emptyOutDir: true, assetsInlineLimit: file => (file.includes('/assets/arc/') ? false : undefined) },
});
