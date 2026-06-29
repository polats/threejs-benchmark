// Virtual module backing the "Landscape (real tiles)" bench. Resolves to the
// real LandscapeGlbBench when the vendor pipeline is present, otherwise to an
// inert stub (so the public build links cleanly).
declare module 'virtual:landscape-glb-bench' {
  import type { ComponentType } from 'react';
  import type { BenchProps } from '../bench/types';
  const Component: ComponentType<BenchProps>;
  export default Component;
}
