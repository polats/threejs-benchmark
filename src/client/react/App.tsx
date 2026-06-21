import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { StarterScene } from '../three/StarterScene';
import { APP_VERSION, BUILD_TIME } from '../build-info';

// Top-level HUD shell for the expanded `game` view. Mounts the React-Three-Fiber
// canvas and renders a lightweight overlay (live FPS + build id). The bench bar,
// per-bench ramp controls, and leaderboard land in a later phase.
export function App() {
  const [fps, setFps] = useState(0);
  const [count, setCount] = useState(0);

  return (
    <>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 2.5, 8], fov: 55 }} gl={{ antialias: true }}>
        <StarterScene
          onStats={(f, c) => {
            setFps(f);
            setCount(c);
          }}
        />
      </Canvas>
      <div className="hud">
        <div className="perf">
          three.js · {fps} fps · {count.toLocaleString()} instances
        </div>
        <span className="build-badge" title={BUILD_TIME ? `Built ${BUILD_TIME}` : undefined}>
          build {APP_VERSION}
        </span>
      </div>
    </>
  );
}
