import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { BENCHES } from '../bench/registry';
import type { RampState } from '../bench/types';
import { Sidebar } from './Sidebar';
import { BenchErrorBoundary } from './BenchErrorBoundary';
import { ControlsSidebar } from './ControlsSidebar';
import { HoloControlsPanel } from './HoloControlsPanel';
import { LandscapeControlsPanel } from './LandscapeControlsPanel';
import { useHoloStore } from '../bench/holoStore';
import { bridge } from '../devvit-bridge';
import { APP_VERSION, BUILD_TIME } from '../build-info';
import type { ExternalShowcase } from '../externalShowcases';

const ZERO: RampState = { fps: 0, count: 0, done: false, capacity: 0 };

// Top-level shell for the expanded `game` view: a full-screen React-Three-Fiber
// canvas hosting the active bench, with a dismissable sidebar (scene selection +
// live run status). Capacity is reported to the server when a ramp ends.
export function App() {
  const [activeId, setActiveId] = useState(BENCHES[0]!.id);
  const [runId, setRunId] = useState(0);
  const [stats, setStats] = useState<RampState>(ZERO);
  const [collapsed, setCollapsed] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [externalShowcases, setExternalShowcases] = useState<ExternalShowcase[]>([]);
  const reported = useRef(false);

  const active = BENCHES.find((b) => b.id === activeId) ?? BENCHES[0]!;
  const activeExternal = externalShowcases.find((item) => item.id === activeId);
  const Bench = active.Component;
  const isWebGPU = active.webgpu === true;
  const holoActive = !activeExternal && active.id === 'holo-cards';
  const landscapeActive =
    !activeExternal && (active.id === 'landscape' || active.id === 'landscape-glb');
  const holoView = useHoloStore((s) => s.view);
  const holoSlug = useHoloStore((s) => s.cardSlug);

  useEffect(() => {
    void fetch('external-showcases.config.json')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ExternalShowcase[]>;
      })
      .then(setExternalShowcases)
      .catch(() => setExternalShowcases([]));
  }, []);

  const select = useCallback((id: string) => {
    setActiveId(id);
    setRunId((r) => r + 1);
    setStats(ZERO);
    reported.current = false;
  }, []);

  const restart = useCallback(() => {
    setRunId((r) => r + 1);
    setStats(ZERO);
    reported.current = false;
  }, []);

  // Report capacity once, when the ramp finishes.
  useEffect(() => {
    if (stats.done && !reported.current && stats.capacity > 0) {
      reported.current = true;
      void bridge
        .reportBench({
          bench: active.id,
          capacity: stats.capacity,
          fps: stats.fps,
          device: {
            dpr: window.devicePixelRatio,
            width: window.innerWidth,
            height: window.innerHeight,
          },
        })
        .catch((e) => console.error('reportBench failed', e));
    }
  }, [stats.done, stats.capacity, stats.fps, active.id]);

  return (
    <div className={collapsed ? 'app sidebar-collapsed' : 'app'}>
      <BenchErrorBoundary
        resetKey={active.id}
        fallback={
          <div className="bench-error">
            <strong>“{active.label}” couldn’t load</strong>
            <p>
              This bench depends on the vendored little-landscapes pipeline, which is
              git-ignored (local-only). Restore <code>src/client/bench/landscape/vendor/</code>
              {' '}and <code>public/external-showcases/…</code> to use it.
            </p>
          </div>
        }
      >
        {activeExternal ? (
          <iframe
            key={runId}
            className="external-showcase-frame"
            src={activeExternal.localUrl}
            title={activeExternal.label}
          />
        ) : isWebGPU ? (
          // WebGPU benches own their own canvas + renderer (three/webgpu has no
          // WebGLRenderer, so it can't share the R3F canvas with the WebGL benches).
          <Bench key={runId} onStats={setStats} runId={runId} />
        ) : (
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [0, 2, 13], fov: 55 }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
          >
            <Suspense fallback={null}>
              <Bench key={runId} onStats={setStats} runId={runId} />
            </Suspense>
          </Canvas>
        )}
      </BenchErrorBoundary>

      <Sidebar
        benches={BENCHES}
        active={active}
        stats={stats}
        onSelect={select}
        onRestart={restart}
        onToggle={() => setCollapsed(true)}
        externalShowcases={externalShowcases}
        activeExternal={activeExternal}
      />

      {holoActive || landscapeActive ? (
        <ControlsSidebar
          collapsed={controlsCollapsed}
          onToggle={() => setControlsCollapsed((c) => !c)}
        >
          {holoActive ? <HoloControlsPanel /> : <LandscapeControlsPanel />}
        </ControlsSidebar>
      ) : null}

      {holoActive && holoView !== '3d' && holoSlug ? (
        <div className="holo-mapview">
          <img src={`cards/${holoSlug}/${holoView}.png`} alt={holoView} />
          <span>{holoView}</span>
        </div>
      ) : null}

      {collapsed ? (
        <button
          type="button"
          className="sidebar-open"
          onClick={() => setCollapsed(false)}
          title="Show sidebar"
        >
          ☰<span className="sidebar-open-fps">{stats.fps}</span>
        </button>
      ) : null}

      <span className="build-badge" title={BUILD_TIME ? `Built ${BUILD_TIME}` : undefined}>
        build {APP_VERSION}
      </span>
    </div>
  );
}
