import { Suspense } from 'react';
import { Splat, OrbitControls } from '@react-three/drei';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Showcase: 3D Gaussian splatting via drei's <Splat> (WebGL2, no SharedArrayBuffer).
// A photoreal captured scene rendered as millions of splats. Reports live FPS
// (fixed scene, no ramp). NOTE: drei's Splat loader uses a Web Worker — works on
// the Vercel/local playground; on the Devvit webview it's subject to the CSP's
// worker-src.
function SplatScene({ onStats }: BenchProps) {
  useFps(onStats);
  return (
    <>
      <color attach="background" args={['#0a0a12']} />
      <Splat src="splats/nike.splat" position={[0, -0.2, 0]} rotation={[Math.PI, 0, 0]} scale={1.8} />
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.6} />
    </>
  );
}

export function SplatBench(props: BenchProps) {
  return (
    <Suspense fallback={null}>
      <SplatScene {...props} />
    </Suspense>
  );
}
