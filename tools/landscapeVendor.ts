import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// The "Landscape (real tiles)" bench is driven by the vendored little-landscapes
// pipeline (third-party, local-only — gitignored under
// src/client/bench/landscape/vendor/). On a clean checkout (e.g. the Vercel
// build) that directory is absent, so its imports cannot be resolved and the
// bundler would fail. To keep the public build green we expose the bench through
// a virtual module that resolves to the real implementation only when the vendor
// pipeline is present, and to an inert stub otherwise. A build-time flag
// (__HAS_LANDSCAPE_VENDOR__) lets the registry hide the bench when it is absent.

const VENDOR_ENTRY = fileURLToPath(
  new URL('../src/client/bench/landscape/vendor/TileLoader.js', import.meta.url)
);
const REAL_BENCH = fileURLToPath(
  new URL('../src/client/bench/benches/LandscapeGlbBench.tsx', import.meta.url)
);

const VIRTUAL_ID = 'virtual:landscape-glb-bench';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

export function hasLandscapeVendor(): boolean {
  return existsSync(VENDOR_ENTRY);
}

export function landscapeVendorPlugin(): Plugin {
  const present = hasLandscapeVendor();
  return {
    name: 'landscape-vendor',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      if (present) {
        return `export { LandscapeGlbBench as default } from ${JSON.stringify(REAL_BENCH)};`;
      }
      return `export default function LandscapeGlbBenchUnavailable() { return null; }`;
    },
  };
}
