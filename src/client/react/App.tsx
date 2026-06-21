import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { BENCHES } from '../bench/registry';
import type { RampState } from '../bench/types';
import { BenchBar } from './BenchBar';
import { PerfHud } from './PerfHud';
import { bridge } from '../devvit-bridge';
import { APP_VERSION, BUILD_TIME } from '../build-info';

const ZERO: RampState = { fps: 0, count: 0, done: false, capacity: 0 };

// Top-level shell for the expanded `game` view: a React-Three-Fiber canvas hosting
// the active bench, with a bench bar (switch), a perf HUD (live FPS + ramping
// capacity), and a build badge. Capacity is reported to the server when a ramp ends.
export function App() {
  const [activeId, setActiveId] = useState(BENCHES[0]!.id);
  const [runId, setRunId] = useState(0);
  const [stats, setStats] = useState<RampState>(ZERO);
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
    <>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 2, 13], fov: 55 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Bench key={runId} onStats={setStats} runId={runId} />
      </Canvas>
      <div className="hud">
        <BenchBar benches={BENCHES} activeId={active.id} onSelect={select} />
        <PerfHud bench={active} stats={stats} onRestart={restart} />
        <span className="build-badge" title={BUILD_TIME ? `Built ${BUILD_TIME}` : undefined}>
          build {APP_VERSION}
        </span>
      </div>
    </>
  );
}
