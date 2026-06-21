import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { OrbitControls, Html } from '@react-three/drei';
import { DropInViewer } from '@mkkellogg/gaussian-splats-3d';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Showcase: 3D Gaussian splatting via @mkkellogg/gaussian-splats-3d (the mature,
// production-grade viewer). Configured WITHOUT SharedArrayBuffer (the iframe
// isn't cross-origin-isolated) and with CPU sort for maximum compatibility.
// Like all splat libraries it uses a sort Web Worker — if that worker is blocked
// (e.g. an extension or a strict webview CSP), we catch it and show a message
// instead of crashing the app.

class SplatErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(err: unknown) {
    console.warn('Gaussian splat error:', err);
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
          The splat sort runs in a Web Worker — a browser extension or a strict webview can block it.
          Try an extension-free window or the web playground.
        </span>
      </div>
    </Html>
  );
}

function SplatContent({ onFail }: { onFail: () => void }) {
  const viewer = useMemo(
    () => new DropInViewer({ gpuAcceleratedSort: false, sharedMemoryForWorkers: false }),
    []
  );
  const url = useMemo(() => new URL('splats/nike.splat', document.baseURI).href, []);

  useEffect(() => {
    let alive = true;
    void viewer
      .addSplatScene(url, {
        showLoadingUI: false,
        position: [0, -1.4, 0],
        rotation: [1, 0, 0, 0], // 180° about X — antimatter15 splats are y-down
        scale: [1.6, 1.6, 1.6],
      })
      .catch((e: unknown) => {
        console.warn('Gaussian splat load failed:', e);
        if (alive) onFail();
      });
    return () => {
      alive = false;
      void viewer.dispose().catch(() => {});
    };
  }, [viewer, url, onFail]);

  return <primitive object={viewer} />;
}

export function SplatBench({ onStats }: BenchProps) {
  useFps(onStats);
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);

  return (
    <>
      <color attach="background" args={['#0a0a12']} />
      {failed ? (
        <SplatFallback />
      ) : (
        <SplatErrorBoundary fallback={<SplatFallback />}>
          <SplatContent onFail={onFail} />
        </SplatErrorBoundary>
      )}
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.6} />
    </>
  );
}
