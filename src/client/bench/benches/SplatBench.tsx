import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { Splat, OrbitControls, Html } from '@react-three/drei';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Showcase: 3D Gaussian splatting via drei's <Splat> (WebGL2, no SharedArrayBuffer).
// drei's Splat loader spins up a sort Worker from a blob: URL. That worker is
// allowed on the standalone web playground (Vercel/local) but BLOCKED by the
// Devvit webview's CSP (worker-src) — so on Reddit the load fails. We contain that
// in an error boundary and show a message instead of crashing the whole app.

class SplatErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(err: unknown) {
    console.warn('Gaussian splat could not load (likely a blocked Web Worker):', err);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function SplatFallback() {
  return (
    <Html center>
      <div
        style={{
          width: 250,
          textAlign: 'center',
          color: '#cfd6e0',
          font: '13px system-ui, sans-serif',
          background: 'rgba(0,0,0,0.55)',
          padding: 14,
          borderRadius: 10,
          lineHeight: 1.5,
        }}
      >
        Gaussian splat couldn’t load in this environment.
        <br />
        <span style={{ opacity: 0.65, fontSize: 12 }}>
          The Reddit webview blocks the splat’s Web Worker — open the standalone web playground to
          view it.
        </span>
      </div>
    </Html>
  );
}

function SplatContent() {
  // Absolute URL (resolved against the page) so it loads regardless of base path.
  const url = useMemo(() => new URL('splats/nike.splat', document.baseURI).href, []);
  return <Splat src={url} position={[0, -0.2, 0]} rotation={[Math.PI, 0, 0]} scale={1.8} />;
}

export function SplatBench({ onStats }: BenchProps) {
  useFps(onStats);
  return (
    <>
      <color attach="background" args={['#0a0a12']} />
      <SplatErrorBoundary fallback={<SplatFallback />}>
        <Suspense fallback={null}>
          <SplatContent />
        </Suspense>
      </SplatErrorBoundary>
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.6} />
    </>
  );
}
