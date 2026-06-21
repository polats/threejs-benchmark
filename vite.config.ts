import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import { devvit } from '@devvit/start/vite';

// ── Build identity ───────────────────────────────────────────────────────────
// Computed once at config load and threaded into the build:
//   1. `define` exposes them to client code (src/client/build-info.ts) so the
//      live build id can be shown in the HUD.
//   2. cacheBust() stamps `?v=<token>` onto emitted asset URLs so a new deploy is
//      never served from a stale webview cache (Devvit forces stable filenames).
function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const BUILD_SHA = gitSha();
const BUILD_TIME = new Date().toISOString();
const CACHE_TOKEN = `${BUILD_SHA}.${Date.now().toString(36)}`;

function cacheBust(token: string): Plugin {
  return {
    name: 'devvit-cache-bust',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(
        /(src|href)="(\/[^"?]+\.(?:js|css))"/g,
        (_match, attr: string, url: string) => `${attr}="${url}?v=${token}"`
      );
    },
  };
}

// The Devvit plugin discovers client entrypoints (splash.html, game.html) from
// devvit.json and wires the server build. React (the shell around Three.js in
// game.html) is compiled by Vite's built-in transform using the jsx settings in
// tools/tsconfig.client.json ("react-jsx" automatic runtime).
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_SHA),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    devvit({
      client: {
        build: {
          // three.js + React-Three-Fiber + drei push the bundle past the default warn limit.
          chunkSizeWarningLimit: 3500,
        },
      },
    }),
    cacheBust(CACHE_TOKEN),
  ],
});
