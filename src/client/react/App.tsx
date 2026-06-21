import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { BENCHES } from '../bench/registry';
import type { RampState } from '../bench/types';
import { Sidebar } from './Sidebar';
import { bridge } from '../devvit-bridge';
import { APP_VERSION, BUILD_TIME } from '../build-info';

const ZERO: RampState = { fps: 0, count: 0, done: false, capacity: 0 };

// Top-level shell for the expanded `game` view: a full-screen React-Three-Fiber
// canvas hosting the active bench, with a dismissable sidebar (scene selection +
// live run status). Capacity is reported to the server when a ramp ends.
export function App() {
  const [activeId, setActiveId] = useState(BENCHES[0]!.id);
  const [runId, setRunId] = useState(0);
  const [stats, setStats] = useState<RampState>(ZERO);
  const [collapsed, setCollapsed] = useState(false);
  const reported = useRef(false);

  const active = BENCHES.find((b) => b.id === activeId) ?? BENCHES[0]!;
  const Bench = active.Component;

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
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 2, 13], fov: 55 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Bench key={runId} onStats={setStats} runId={runId} />
      </Canvas>

      <Sidebar
        benches={BENCHES}
        active={active}
        stats={stats}
        onSelect={select}
        onRestart={restart}
        onToggle={() => setCollapsed(true)}
      />

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
