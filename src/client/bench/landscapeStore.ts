import { create } from 'zustand';

// Shared state for the Procedural Landscape bench — mirrors the Holo store pattern:
// the in-canvas bench reads it (reactively + per-frame), a real-DOM panel writes it.
// This is the analogue of little-landscapes' "Debug Toolkit": seed, build speed,
// and live render toggles (GTAO / soft shadows / vertical gradient / cloud shadows).

export type Speed = 'slow' | 'fast' | 'instant';
export const SPEEDS: { key: Speed; label: string; tilesPerSec: number }[] = [
  { key: 'slow', label: 'Slow', tilesPerSec: 16 },
  { key: 'fast', label: 'Fast', tilesPerSec: 70 },
  { key: 'instant', label: 'Instant', tilesPerSec: 100000 },
];

export type ToggleKey =
  | 'gtao'
  | 'shadows'
  | 'gradient'
  | 'clouds'
  | 'shadowTint'
  | 'gi'
  | 'godrays';
export const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: 'gtao', label: 'GTAO' },
  { key: 'shadows', label: 'Soft Shadows' },
  { key: 'gradient', label: 'Vertical Gradient' },
  { key: 'clouds', label: 'Cloud Shadows' },
  { key: 'shadowTint', label: 'Shadow Tint' },
  { key: 'gi', label: 'GI Bounce' },
  { key: 'godrays', label: 'Godrays' },
];

type LandscapeState = {
  seed: number;
  speed: Speed;
  gtao: boolean;
  shadows: boolean;
  gradient: boolean;
  clouds: boolean;
  shadowTint: boolean;
  gi: boolean;
  godrays: boolean;
  progress: number; // tiles revealed so far (pushed from the bench)
  setSpeed: (s: Speed) => void;
  setSeed: (n: number) => void;
  regenerate: () => void;
  toggle: (k: ToggleKey) => void;
  setProgress: (n: number) => void;
};

export const useLandscapeStore = create<LandscapeState>((set) => ({
  seed: 1337,
  speed: 'fast',
  gtao: false,
  shadows: true,
  gradient: true,
  clouds: true,
  shadowTint: true,
  gi: false, // off by default — enabling bakes a LightProbeGrid (a brief one-time freeze)
  godrays: false,
  progress: 0,
  setSpeed: (speed) => set({ speed }),
  setSeed: (seed) => set({ seed: seed >>> 0 }),
  regenerate: () => set((s) => ({ seed: (Math.imul(s.seed, 1664525) + 1013904223) >>> 0 })),
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Pick<LandscapeState, ToggleKey>),
  setProgress: (progress) => set({ progress }),
}));
