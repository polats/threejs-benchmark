// Build identity injected at compile time by Vite `define` (see vite.config.ts).
// The `typeof` guards keep this safe if the constants are ever absent.
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __HAS_LANDSCAPE_VENDOR__: boolean;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

// True only when the vendored little-landscapes pipeline is present at build time
// (absent on the public/Vercel build — see tools/landscapeVendor.ts).
export const HAS_LANDSCAPE_VENDOR: boolean =
  typeof __HAS_LANDSCAPE_VENDOR__ === 'boolean' ? __HAS_LANDSCAPE_VENDOR__ : false;
