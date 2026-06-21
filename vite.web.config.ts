import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Production STATIC build of the standalone browser playground (the benchmarks
// with a mock API), for hosting on Vercel — NOT the Devvit/Reddit app (that uses
// vite.config.ts + the Devvit plugin). Only game.html is built; splash.html is
// Reddit-only (it imports @devvit/web/client). The /api/* mock lives in /api as
// Vercel serverless functions.
//
//   npm run build:web   ->   dist-web/   (served by Vercel)
function gitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'web';
  }
}

export default defineConfig({
  root: 'src/client',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  define: {
    __APP_VERSION__: JSON.stringify(gitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: fileURLToPath(new URL('./dist-web', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3500,
    rollupOptions: {
      input: { game: fileURLToPath(new URL('./src/client/game.html', import.meta.url)) },
    },
  },
});
