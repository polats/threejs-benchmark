// Ambient declarations for the vendored little-landscapes pipeline. The actual
// JS lives under src/client/bench/landscape/vendor/ which is gitignored
// (third-party, local-only), so on a clean checkout (CI: Vercel + Devvit) those
// files are absent. LandscapeGlbBench.tsx is committed and imports them, so
// these `declare module` stubs keep `tsc` resolving the imports (as `any`)
// whether or not the vendor dir is present. Kept here (committed) rather than in
// vendor/vendor.d.ts (gitignored) so type-check passes in CI.
declare module '*/vendor/SeededRng.js';
declare module '*/vendor/WfcSolver.js';
declare module '*/vendor/TileLoader.js';
declare module '*/vendor/TileRenderer.js';
declare module '*/vendor/Instancing.js';
declare module '*/vendor/ToonMaterials.js';
declare module '*/vendor/WindSway.js';
declare module '*/vendor/VerticalGradient.js';
declare module '*/vendor/ShadowTint.js';
declare module '*/vendor/WaterSystem.js';
declare module '*/vendor/WaveQuadController.js';
declare module '*/vendor/GodraySystem.js';
declare module '*/vendor/GodrayController.js';
declare module '*/vendor/CloudShadowLayer.js';
declare module '*/vendor/GIProbeController.js';
declare module '*/vendor/PostPipeline.js';

// Virtual module backing the "Landscape (real tiles)" bench. Resolves to the
// real LandscapeGlbBench when the vendor pipeline is present, otherwise to an
// inert stub (so the public build links cleanly).
declare module 'virtual:landscape-glb-bench' {
  import type { ComponentType } from 'react';
  import type { BenchProps } from '../bench/types';
  const Component: ComponentType<BenchProps>;
  export default Component;
}
