// Seeded Wave Function Collapse over terrain families, the backbone of the
// Procedural Landscape bench. Inspired by little-landscapes' WfcSolver: each cell
// holds a superposition of families and is collapsed lowest-entropy-first, with
// adjacency constraints propagated outward. Roads/rivers are carved as a scripted
// overlay afterwards (mirrors the reference, where the WFC lays down terrain and
// a separate pass routes the network).

export const FAM = {
  GRASS: 0,
  WATER: 1,
  FOREST: 2,
  CITY: 3,
} as const;
export type Family = (typeof FAM)[keyof typeof FAM];
export const FAMILIES: Family[] = [FAM.GRASS, FAM.WATER, FAM.FOREST, FAM.CITY];
const N = FAMILIES.length;

// Overlay markers stored alongside the family grid.
export const OVER = { NONE: 0, ROAD: 1, RIVER: 2, BRIDGE: 3 } as const;
export type Overlay = (typeof OVER)[keyof typeof OVER];

// Symmetric adjacency: which families may sit edge-to-edge. Water never touches
// city directly (a grass/forest shore must separate them), which keeps the
// silhouette readable.
const ADJ: boolean[][] = (() => {
  const a = Array.from({ length: N }, () => Array<boolean>(N).fill(false));
  const allow = (x: Family, y: Family) => {
    a[x]![y] = true;
    a[y]![x] = true;
  };
  for (const f of FAMILIES) allow(f, f);
  allow(FAM.GRASS, FAM.WATER);
  allow(FAM.GRASS, FAM.FOREST);
  allow(FAM.GRASS, FAM.CITY);
  allow(FAM.WATER, FAM.FOREST);
  allow(FAM.FOREST, FAM.CITY);
  return a;
})();

// Spawn weights — high self-affinity grows coherent blobs rather than confetti.
const WEIGHT: Record<Family, number> = {
  [FAM.GRASS]: 3.0,
  [FAM.WATER]: 1.6,
  [FAM.FOREST]: 1.8,
  [FAM.CITY]: 1.1,
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type WfcResult = {
  size: number;
  fam: Int8Array; // family per cell, row-major
  overlay: Int8Array; // OVER marker per cell
  order: number[]; // cell indices in the order they were resolved
  seed: number;
};

const DIRS = [
  { dx: 0, dy: -1 }, // N
  { dx: 1, dy: 0 }, // E
  { dx: 0, dy: 1 }, // S
  { dx: -1, dy: 0 }, // W
];

// One collapse attempt; returns null on contradiction so the caller can retry.
function attempt(size: number, rng: () => number): { fam: Int8Array; order: number[] } | null {
  const cells = size * size;
  // superposition bitmask per cell (bit f set => family f still possible)
  const FULL = (1 << N) - 1;
  const mask = new Uint8Array(cells).fill(FULL);
  const fam = new Int8Array(cells).fill(-1);
  const order: number[] = [];

  const popcount = (m: number) => {
    let c = 0;
    while (m) {
      c += m & 1;
      m >>= 1;
    }
    return c;
  };

  const propagate = (start: number): boolean => {
    const stack = [start];
    while (stack.length) {
      const ci = stack.pop()!;
      const cx = ci % size;
      const cy = (ci / size) | 0;
      const m = mask[ci]!;
      for (const d of DIRS) {
        const nx = cx + d.dx;
        const ny = cy + d.dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const ni = ny * size + nx;
        const nm = mask[ni]!;
        if (nm === 0) continue;
        // a neighbour family is viable only if SOME family in `m` allows it
        let allowed = 0;
        for (const nf of FAMILIES) {
          if (!(nm & (1 << nf))) continue;
          let ok = false;
          for (const f of FAMILIES) {
            if (m & (1 << f) && ADJ[f]![nf]) {
              ok = true;
              break;
            }
          }
          if (ok) allowed |= 1 << nf;
        }
        if (allowed !== nm) {
          if (allowed === 0) return false; // contradiction
          mask[ni] = allowed;
          if (popcount(allowed) === 1 && fam[ni] === -1) {
            fam[ni] = Math.log2(allowed) | 0;
            order.push(ni);
          }
          stack.push(ni);
        }
      }
    }
    return true;
  };

  for (;;) {
    // find min-entropy undecided cell
    let best = -1;
    let bestCount = 99;
    let bestNoise = 0;
    for (let i = 0; i < cells; i++) {
      const c = popcount(mask[i]!);
      if (c <= 1) continue;
      const noise = rng() * 0.5;
      if (c < bestCount || (c === bestCount && noise > bestNoise)) {
        best = i;
        bestCount = c;
        bestNoise = noise;
      }
    }
    if (best === -1) break; // all decided

    // weighted choice among remaining families
    const m = mask[best]!;
    let total = 0;
    for (const f of FAMILIES) if (m & (1 << f)) total += WEIGHT[f];
    let r = rng() * total;
    let chosen: Family = FAM.GRASS;
    for (const f of FAMILIES) {
      if (!(m & (1 << f))) continue;
      r -= WEIGHT[f];
      if (r <= 0) {
        chosen = f;
        break;
      }
    }
    mask[best] = 1 << chosen;
    fam[best] = chosen;
    order.push(best);
    if (!propagate(best)) return null;
  }

  // fill any leftover (shouldn't happen) with grass
  for (let i = 0; i < cells; i++) if (fam[i] === -1) fam[i] = FAM.GRASS;
  return { fam, order };
}

// Carve a road network linking a few hubs across non-water cells, then a single
// river crossing the map; where they meet, mark a bridge. Returns the overlay.
function carveOverlay(size: number, fam: Int8Array, rng: () => number): Int8Array {
  const overlay = new Int8Array(size * size).fill(OVER.NONE);
  const idx = (x: number, y: number) => y * size + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size;

  // RIVER: a wandering vertical path biased toward existing water.
  let rx = 2 + Math.floor(rng() * (size - 4));
  for (let y = 0; y < size; y++) {
    overlay[idx(rx, y)] = OVER.RIVER;
    // step horizontally sometimes, preferring toward water cells
    if (rng() < 0.6) {
      const dir = rng() < 0.5 ? -1 : 1;
      const nx = rx + dir;
      if (inb(nx, y)) {
        rx = nx;
        overlay[idx(rx, y)] = OVER.RIVER;
      }
    }
  }

  // ROADS: random walks between random hubs over land, avoiding water.
  const passable = (x: number, y: number) => inb(x, y) && fam[idx(x, y)] !== FAM.WATER;
  const hubs: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    let hx = Math.floor(rng() * size);
    let hy = Math.floor(rng() * size);
    let tries = 0;
    while (!passable(hx, hy) && tries++ < 40) {
      hx = Math.floor(rng() * size);
      hy = Math.floor(rng() * size);
    }
    hubs.push([hx, hy]);
  }
  for (let k = 0; k < hubs.length - 1; k++) {
    let [x, y] = hubs[k]!;
    const [tx, ty] = hubs[k + 1]!;
    let guard = 0;
    while ((x !== tx || y !== ty) && guard++ < size * 4) {
      const stepX = Math.sign(tx - x);
      const stepY = Math.sign(ty - y);
      // bias toward the axis with the larger remaining distance, with jitter
      const goX = Math.abs(tx - x) > Math.abs(ty - y) ? rng() < 0.8 : rng() < 0.3;
      let nx = x,
        ny = y;
      if (goX && stepX !== 0) nx = x + stepX;
      else if (stepY !== 0) ny = y + stepY;
      else if (stepX !== 0) nx = x + stepX;
      if (!passable(nx, ny)) {
        // stepping onto water -> bridge over it, continue
        if (inb(nx, ny)) {
          overlay[idx(nx, ny)] = OVER.BRIDGE;
          x = nx;
          y = ny;
        }
        continue;
      }
      x = nx;
      y = ny;
      if (overlay[idx(x, y)] === OVER.RIVER) overlay[idx(x, y)] = OVER.BRIDGE;
      else if (overlay[idx(x, y)] === OVER.NONE) overlay[idx(x, y)] = OVER.ROAD;
    }
  }
  return overlay;
}

export function generate(size: number, seed: number): WfcResult {
  // retry on contradiction with a perturbed stream, but keep it deterministic
  let res: { fam: Int8Array; order: number[] } | null = null;
  let s = seed >>> 0;
  for (let i = 0; i < 30 && !res; i++) {
    res = attempt(size, mulberry32(s));
    if (!res) s = (s + 0x9e3779b9) | 0;
  }
  const rng = mulberry32((s ^ 0x5bd1e995) >>> 0);
  const final = res ?? { fam: new Int8Array(size * size).fill(FAM.GRASS), order: [] };
  const overlay = carveOverlay(size, final.fam, rng);
  // ensure every cell appears in reveal order (append any stragglers)
  const seen = new Set(final.order);
  const order = final.order.slice();
  for (let i = 0; i < size * size; i++) if (!seen.has(i)) order.push(i);
  return { size, fam: final.fam, overlay, order, seed: seed >>> 0 };
}
