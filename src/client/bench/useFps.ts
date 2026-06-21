import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RampState } from './types';

// FPS reporter for fixed showcase scenes (no ramp): samples smoothed FPS and
// pushes it to the HUD ~twice/second.
export function useFps(onStats: (s: RampState) => void) {
  const acc = useRef({ t: 0, frames: 0 });
  useFrame((_, delta) => {
    const a = acc.current;
    a.t += delta;
    a.frames += 1;
    if (a.t >= 0.5) {
      onStats({ fps: Math.round(a.frames / a.t), count: 0, done: false, capacity: 0 });
      a.t = 0;
      a.frames = 0;
    }
  });
}
