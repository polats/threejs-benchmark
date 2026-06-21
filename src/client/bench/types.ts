import type { ComponentType } from 'react';

// Live state of a ramping bench, pushed to the HUD ~once/second.
export type RampState = {
  fps: number;
  count: number;
  done: boolean;
  capacity: number;
};

export type BenchProps = {
  onStats: (s: RampState) => void;
  // Bumped to restart the ramp (the bench is also remounted via React key).
  runId: number;
};

export type BenchGroup = 'render' | 'visual' | 'physics' | 'showcase';

export type BenchDef = {
  id: string;
  label: string;
  /** Unit of the ramped count, e.g. 'cubes', 'points'. */
  unit: string;
  group: BenchGroup;
  blurb: string;
  /** A fixed "wow" scene that reports FPS but doesn't ramp a count. */
  showcase?: boolean;
  Component: ComponentType<BenchProps>;
};
