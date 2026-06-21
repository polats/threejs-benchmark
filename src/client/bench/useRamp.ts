import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RampState } from './types';

export type RampConfig = {
  /** Target FPS the device must hold to keep ramping. */
  target: number;
  /** How many objects to add per ramp step. */
  step: number;
  /** Safety ceiling so a fast device doesn't ramp forever. */
  max: number;
  /** Initial object count. */
  start: number;
  /** Make the scene show `count` objects (called on each ramp step). */
  grow: (count: number) => void;
  /** Push live state to the HUD (~1/s). */
  onStats: (s: RampState) => void;
  /** Restart trigger (the bench is also remounted on change). */
  runId: number;
};

// Ramp-until-FPS-drops harness — the R3F analogue of reddit-phaser's BenchScene.
// Each ~second, while the smoothed FPS holds at/above target, add `step` more
// objects; once it drops (or the ceiling is hit), freeze and record capacity.
// Runs entirely inside the frame loop; reports to the DOM HUD via onStats.
export function useRamp(cfg: RampConfig) {
  const s = useRef({ count: cfg.start, done: false, capacity: 0, t: 0, frames: 0, ticks: 0 });

  useEffect(() => {
    const st = s.current;
    st.count = cfg.start;
    st.done = false;
    st.capacity = 0;
    st.t = 0;
    st.frames = 0;
    st.ticks = 0;
    cfg.grow(cfg.start);
  }, [cfg.runId]); // eslint reads the project config; react-hooks plugin isn't enabled.

  useFrame((_, delta) => {
    const st = s.current;
    st.t += delta;
    st.frames += 1;
    if (st.t < 1) return;

    const fps = st.frames / st.t;
    st.ticks += 1;
    // Skip the first tick (warm-up) before judging.
    if (!st.done && st.ticks >= 2) {
      if (fps >= cfg.target && st.count < cfg.max) {
        st.count += cfg.step;
        cfg.grow(st.count);
      } else {
        st.done = true;
        st.capacity = st.count;
      }
    }
    cfg.onStats({ fps: Math.round(fps), count: st.count, done: st.done, capacity: st.capacity });
    st.t = 0;
    st.frames = 0;
  });
}
