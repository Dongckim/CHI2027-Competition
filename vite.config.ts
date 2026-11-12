import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('.', import.meta.url)));
// Paths the app and the bench pages read straight from the repo. The production build copies them (app/scripts/copy-static.mjs).
const STATIC = ['/data/build/', '/data/venue/', '/tests/', '/app/src/'];
const TYPES: Record<string, string> = { '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };

const repoFiles = (): Plugin => ({
  name: 'arc-repo-files',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url ?? '').split('?')[0]);
      if (!STATIC.some(p => path.startsWith(p))) return next();
      const file = resolve(repo, '.' + path);
      if (!file.startsWith(repo + sep) || !existsSync(file) || !statSync(file).isFile() || !TYPES[extname(file)]) return next();
      res.setHeader('content-type', TYPES[extname(file)]);
      createReadStream(file).pipe(res);
    });
  },
});

export default defineConfig({
  root: 'app',
  publicDir: false,
  plugins: [react(), tailwindcss(), repoFiles()],
  server: { host: true, fs: { allow: [repo] } },
  build: { outDir: '../dist', emptyOutDir: true },
});
