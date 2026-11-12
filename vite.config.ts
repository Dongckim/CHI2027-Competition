import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('.', import.meta.url)));
// URL prefix → repo folder, for what the app and the bench pages read in dev. The production build copies the same (app/scripts/copy-static.mjs).
const STATIC: [string, string][] = [['/app-data/', 'data/build/app-data/'], ['/data/build/', 'data/build/'], ['/data/venue/', 'data/venue/'], ['/tests/', 'tests/'], ['/app/src/', 'app/src/']];
const TYPES: Record<string, string> = { '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };

const repoFiles = (): Plugin => ({
  name: 'arc-repo-files',
  configureServer(server) {
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

export default defineConfig({
  root: 'app',
  publicDir: false,
  plugins: [react(), tailwindcss(), repoFiles()],
  server: { host: true, fs: { allow: [repo] } },
  build: { outDir: '../dist', emptyOutDir: true },
});
