// Build identity injected at compile time by Vite `define` (see vite.config.ts).
// The `typeof` guards keep this safe if the constants are ever absent.
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
