import { create } from 'zustand';

// Shared state for the Holo Cards bench: the in-canvas bench reads it (per-frame via
// getState + reactively via the hook), and a real-DOM sub-sidebar panel writes it.
// DOM controls live outside the R3F canvas, so there are no pointer-event conflicts
// with OrbitControls (the old drei-Html sliders were the source of the bugginess).

export type LayerKey = 'foil' | 'holo' | 'lines' | 'glitter';
export const LAYERS: { key: LayerKey; label: string }[] = [
  { key: 'foil', label: 'Foil' },
  { key: 'holo', label: 'Sheen' },
  { key: 'lines', label: 'Lines' },
  { key: 'glitter', label: 'Glitter' },
];

export type Tune = { normal: number; holoIntensity: number; spark: number; glint: number; foilMetal: number; foilRough: number };
export const TUNE_DEFAULTS: Tune = { normal: 3.0, holoIntensity: 0.6, spark: 0.6, glint: 0.4, foilMetal: 0.72, foilRough: 0.16 };
export const SLIDERS: { key: keyof Tune; label: string; min: number; max: number; step: number }[] = [
  { key: 'normal', label: 'Emboss', min: 0, max: 8, step: 0.05 },
  { key: 'holoIntensity', label: 'Foil', min: 0, max: 1.2, step: 0.02 },
  { key: 'spark', label: 'Sparkle', min: 0, max: 2, step: 0.02 },
  { key: 'glint', label: 'Lines', min: 0, max: 1.5, step: 0.02 },
  { key: 'foilMetal', label: 'Metal', min: 0, max: 1, step: 0.02 },
  { key: 'foilRough', label: 'Rough', min: 0.02, max: 0.7, step: 0.02 },
];

export type Preset = { name: string; hue: number; tshift: number; milk: number; sat: number; line: number; ang: number; glint: number; spark: number; sparkDensity: number };
export const PRESETS: Preset[] = [
  { name: 'Rainbow Rare', hue: 1.4, tshift: 1.8, milk: 0.4, sat: 0.85, line: 70, ang: 23, glint: 0.3, spark: 0.55, sparkDensity: 55 },
  { name: 'Cosmos', hue: 2.1, tshift: 2.4, milk: 0.22, sat: 1.0, line: 55, ang: 12, glint: 0.22, spark: 0.9, sparkDensity: 80 },
  { name: 'Line Holo', hue: 1.0, tshift: 1.3, milk: 0.35, sat: 0.8, line: 95, ang: 8, glint: 0.34, spark: 0.18, sparkDensity: 40 },
  { name: 'Reverse', hue: 1.5, tshift: 1.8, milk: 0.52, sat: 0.78, line: 55, ang: 60, glint: 0.28, spark: 0.6, sparkDensity: 65 },
];

export const CARD_VIEWS = ['3d', 'albedo', 'normal', 'depth', 'outline', 'holo'] as const;
export type CardView = (typeof CARD_VIEWS)[number];

export type CardEntry = { slug: string; name: string };
export const FALLBACK_CARDS: CardEntry[] = [{ slug: 'energy-surge', name: 'Energy Surge' }];

type HoloState = {
  tune: Tune;
  layers: Record<LayerKey, boolean>;
  preset: number;
  cardSlug: string | null;
  view: CardView;
  mode: 'hero' | 'grid';
  cards: CardEntry[];
  setTune: (patch: Partial<Tune>) => void;
  toggleLayer: (k: LayerKey) => void;
  setPreset: (n: number) => void;
  setCardSlug: (s: string | null) => void;
  setView: (v: CardView) => void;
  setMode: (m: 'hero' | 'grid') => void;
  setCards: (c: CardEntry[]) => void;
};

export const useHoloStore = create<HoloState>((set) => ({
  tune: { ...TUNE_DEFAULTS },
  layers: { foil: true, holo: true, lines: true, glitter: true },
  preset: 0,
  cardSlug: null,
  view: '3d',
  mode: 'hero',
  cards: FALLBACK_CARDS,
  setTune: (patch) => set((s) => ({ tune: { ...s.tune, ...patch } })),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setPreset: (preset) => set({ preset }),
  setCardSlug: (cardSlug) => set({ cardSlug, view: '3d' }),
  setView: (view) => set({ view }),
  setMode: (mode) => set({ mode }),
  setCards: (cards) => set({ cards }),
}));
