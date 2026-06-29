import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, GodRays } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LightProbeGenerator } from 'three/addons/lights/LightProbeGenerator.js';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';
import { generate, FAM, OVER, mulberry32, type WfcResult } from '../landscape/wfc';
import { useLandscapeStore, SPEEDS } from '../landscapeStore';

// Showcase: a stylized low-poly procedural diorama, inspired by the "Little
// Landscapes" generator. A seeded Wave Function Collapse (see ./landscape/wfc)
// lays out terrain families (grass / water / forest / city) and carves a road +
// river network, then the tiles reveal one-by-one in collapse order with a
// depth-fade pop-in. The signature look stacks several techniques, folded into
// one toon material enhancer + a post stack:
//   - toon (cel) shading via a stepped gradient ramp
//   - an atmospheric "vertical gradient": world fades to sky-blue with distance +
//     height (the dreamy aerial-perspective falloff)            [toggle]
//   - drifting projected cloud shadows sampled in world-space   [toggle]
//   - GTAO (N8AO) ambient occlusion + subtle bloom              [GTAO toggle]
//   - soft sun shadows                                          [toggle]
//   - per-vertex wind sway (trees) + a rippling toon water plane
//   - per-instance reveal animation (the tile-by-tile build-up; Slow/Fast/Instant)
// A bird flock circles overhead. Controls live in the sidebar Debug Toolkit.

const GRID = 18;
const TILE = 1.3;
const SPAN = GRID * TILE;
const SKY = '#bfe3f2';
const REVEAL_DUR = 0.28;
// the sun sits low over the far horizon (good for visible godray shafts)
const SUN_POS = new THREE.Vector3(0.5, 0.3, 0.55).normalize().multiplyScalar(SPAN * 1.8);

function toonRamp(): THREE.DataTexture {
  const data = new Uint8Array([90, 120, 165, 235, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// Smooth tiling value-noise canvas → the cloud-shadow cookie.
function cloudTexture(size = 256): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rnd = mulberry32(0xc10d);
  const cells = 8;
  const lat = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const at = (x: number, y: number) => lat[(y % cells) * (cells + 1) + (x % cells)]!;
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const xi = Math.floor(fx);
      const yi = Math.floor(fy);
      const tx = sm(fx - xi);
      const ty = sm(fy - yi);
      const v =
        THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(at(xi, yi), at(xi + 1, yi), tx),
          THREE.MathUtils.lerp(at(xi, yi + 1), at(xi + 1, yi + 1), tx),
          ty
        ) * 255;
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

type Shared = {
  uTime: { value: number };
  uRevDur: { value: number };
  uSky: { value: THREE.Color };
  uFadeNear: { value: number };
  uFadeFar: { value: number };
  uGradOn: { value: number };
  uCloud: { value: THREE.Texture };
  uCloudOn: { value: number };
  uCloudScale: { value: number };
  uCloudOffset: { value: THREE.Vector2 };
  uShadowTint: { value: THREE.Color };
  uShadowTintAmt: { value: number };
};

type EnhanceOpts = {
  sway?: boolean;
  ripple?: boolean;
  reveal?: 'scale' | 'fade' | false;
  foam?: boolean;
  shadowTint?: boolean;
};

function enhanceToon(mat: THREE.Material, shared: Shared, opts: EnhanceOpts) {
  const reveal = opts.reveal ?? 'scale';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: shared.uTime,
      uRevDur: shared.uRevDur,
      uSky: shared.uSky,
      uFadeNear: shared.uFadeNear,
      uFadeFar: shared.uFadeFar,
      uGradOn: shared.uGradOn,
      uCloud: shared.uCloud,
      uCloudOn: shared.uCloudOn,
      uCloudScale: shared.uCloudScale,
      uCloudOffset: shared.uCloudOffset,
      uShadowTint: shared.uShadowTint,
      uShadowTintAmt: shared.uShadowTintAmt,
    });

    let head =
      'uniform float uTime;\nuniform float uRevDur;\nvarying vec3 vWorldPos;\nvarying float vRev;\n';
    if (reveal) head += 'attribute float aReveal;\n';
    if (opts.foam) head += 'attribute float aFoam;\nvarying float vFoam;\n';

    let body = '';
    if (opts.foam) body += '\n vFoam = aFoam;';
    if (opts.ripple) {
      body += `
        transformed.y += sin(transformed.x * 2.2 + uTime * 1.5) * 0.03
                       + cos(transformed.z * 2.6 + uTime * 1.1) * 0.025;`;
    }
    if (opts.sway) {
      body += `
        float sw = smoothstep(0.4, 2.6, position.y);
        vec3 swp = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
        float sph = swp.x * 0.5 + swp.z * 0.5;
        transformed.x += sw * sin(uTime * 1.6 + sph) * 0.16;
        transformed.z += sw * cos(uTime * 1.3 + sph) * 0.10;`;
    }
    if (reveal) {
      body += `
        float rev = uRevDur > 0.0 ? clamp((uTime - aReveal) / uRevDur, 0.0, 1.0) : 1.0;
        float ease = rev * rev * (3.0 - 2.0 * rev);
        vRev = ease;`;
      if (reveal === 'scale') {
        body += `
        transformed *= ease;
        transformed.y += (1.0 - ease) * -0.5;`;
      }
    } else {
      body += '\n vRev = 1.0;';
    }
    body += '\n vWorldPos = (modelMatrix * vec4(transformed,1.0)).xyz;';

    shader.vertexShader =
      head +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + body);

    const frag = `
      float cloud = texture2D(uCloud, vWorldPos.xz * uCloudScale + uCloudOffset).r;
      float cshadow = uCloudOn * 0.42 * smoothstep(0.45, 0.85, cloud);
      gl_FragColor.rgb *= (1.0 - cshadow);
      float distFade = smoothstep(uFadeNear, uFadeFar, length(vWorldPos - cameraPosition));
      float hiFade = smoothstep(2.0, 16.0, vWorldPos.y);
      float fade = uGradOn * clamp(distFade * 0.8 + hiFade * 0.22, 0.0, 0.85);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, fade);
      ${opts.foam ? 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86,0.93,0.96), smoothstep(0.35,1.0,vFoam) * 0.6);' : ''}
      ${reveal === 'fade' ? 'gl_FragColor.a *= vRev;' : ''}`;
    // colored shadow tint — push dark/shadowed regions toward a cool hue. Keyed on
    // the toon-shaded luminance (robust: no dependency on getShadowMask, which the
    // toon fragment doesn't define, and survives the Soft Shadows toggle).
    const shadowTintFrag = opts.shadowTint
      ? `
      float _lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
      float _sh = (1.0 - smoothstep(0.12, 0.55, _lum)) * uShadowTintAmt;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * uShadowTint, _sh);`
      : '';
    shader.fragmentShader =
      'varying vec3 vWorldPos;\nvarying float vRev;\nuniform vec3 uSky;\nuniform float uFadeNear;\nuniform float uFadeFar;\nuniform float uGradOn;\nuniform sampler2D uCloud;\nuniform float uCloudOn;\nuniform float uCloudScale;\nuniform vec2 uCloudOffset;\nuniform vec3 uShadowTint;\nuniform float uShadowTintAmt;\n' +
      (opts.foam ? 'varying float vFoam;\n' : '') +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n' + shadowTintFrag + '\n' + frag
      );
  };
}

// ---- prototype geometries (vertex-coloured, base at y=0, merged) --------------
function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position!.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function houseGeometry(): THREE.BufferGeometry {
  const walls = paint(new THREE.BoxGeometry(0.62, 0.46, 0.5), 0xeae3d0);
  walls.translate(0, 0.23, 0);
  const roof = paint(new THREE.ConeGeometry(0.56, 0.4, 4), 0xb14b35);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 0.66, 0);
  return mergeGeometries([walls, roof])!;
}

function treeGeometry(): THREE.BufferGeometry {
  const trunk = paint(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 6), 0x6b4a2b);
  trunk.translate(0, 0.2, 0);
  const c1 = paint(new THREE.ConeGeometry(0.38, 0.8, 7), 0x2f6b3a);
  c1.translate(0, 0.78, 0);
  const c2 = paint(new THREE.ConeGeometry(0.27, 0.62, 7), 0x368044);
  c2.translate(0, 1.22, 0);
  const c3 = paint(new THREE.ConeGeometry(0.16, 0.46, 7), 0x3d9450);
  c3.translate(0, 1.62, 0);
  return mergeGeometries([trunk, c1, c2, c3])!;
}

const FAM_COLOR: Record<number, number> = {
  [FAM.GRASS]: 0x6fa84e,
  [FAM.WATER]: 0x24506b,
  [FAM.FOREST]: 0x4f8a3f,
  [FAM.CITY]: 0xb6a36a,
};
const ROAD_COLOR = 0x6b6661;
const BRIDGE_DECK = 0x8a6a45;
const SAND_COLOR = 0xd9c79a;

// Props store their transform as components (not a baked Matrix4) so the reveal
// pop-in can be driven on the CPU each frame — that way the shadow pass tracks
// the animation too (a custom depth material for this hung the GPU).
type Item = { p: THREE.Vector3; q: THREE.Quaternion; s: number; r: number };
type Layout = {
  wfc: WfcResult;
  tileColors: number[];
  tileReveal: Float32Array;
  houses: Item[];
  trees: Item[];
  planks: Item[];
  waterCells: { x: number; z: number; gx: number; gz: number; r: number }[];
  maxReveal: number;
  cells: number;
};

function buildLayout(seed: number, tilesPerSec: number): Layout {
  const wfc = generate(GRID, seed);
  const rnd = mulberry32(seed ^ 0x55aa);
  const pos = new Map<number, number>();
  wfc.order.forEach((ci, i) => pos.set(ci, i));
  const revealOf = (ci: number) => (pos.get(ci) ?? 0) / tilesPerSec;

  const tileColors: number[] = [];
  const tileReveal = new Float32Array(GRID * GRID);
  const houses: Item[] = [];
  const trees: Item[] = [];
  const planks: Item[] = [];
  const waterCells: { x: number; z: number; gx: number; gz: number; r: number }[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  const isWaterCell = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return false;
    const j = y * GRID + x;
    return wfc.fam[j] === FAM.WATER || wfc.overlay[j] === OVER.RIVER || wfc.overlay[j] === OVER.BRIDGE;
  };

  const place = (arr: Item[], x: number, y: number, z: number, s: number, rotY: number, rev: number) => {
    arr.push({
      p: new THREE.Vector3(x, y, z),
      q: new THREE.Quaternion().setFromAxisAngle(up, rotY),
      s,
      r: rev,
    });
  };

  for (let gz = 0; gz < GRID; gz++) {
    for (let gx = 0; gx < GRID; gx++) {
      const ci = gz * GRID + gx;
      const fam = wfc.fam[ci]!;
      const over = wfc.overlay[ci]!;
      const wx = (gx - GRID / 2 + 0.5) * TILE;
      const wz = (gz - GRID / 2 + 0.5) * TILE;
      const rev = revealOf(ci);
      tileReveal[ci] = rev;

      const isWater = fam === FAM.WATER || over === OVER.RIVER;
      const isRoad = over === OVER.ROAD;
      const isBridge = over === OVER.BRIDGE;

      const landTile = !isWater && !isRoad && !isBridge;
      let color = FAM_COLOR[fam]!;
      if (isWater) color = FAM_COLOR[FAM.WATER]!;
      if (isRoad) color = ROAD_COLOR;
      if (isBridge) color = FAM_COLOR[FAM.WATER]!;
      // sandy beach: land tiles that border water blend toward sand
      if (
        landTile &&
        (isWaterCell(gx - 1, gz) || isWaterCell(gx + 1, gz) || isWaterCell(gx, gz - 1) || isWaterCell(gx, gz + 1))
      ) {
        color = new THREE.Color(color).lerp(new THREE.Color(SAND_COLOR), 0.5).getHex();
      }
      const cc = new THREE.Color(color).offsetHSL(0, 0, (rnd() - 0.5) * 0.05);
      tileColors.push(cc.getHex());

      if (isWater) {
        waterCells.push({ x: wx, z: wz, gx, gz, r: rev });
        continue;
      }
      if (isBridge) {
        waterCells.push({ x: wx, z: wz, gx, gz, r: rev });
        place(planks, wx, 0.34, wz, 1, 0, rev);
        continue;
      }
      if (isRoad) continue;

      if (fam === FAM.FOREST) {
        const cnt = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < cnt; k++) {
          place(trees, wx + (rnd() - 0.5) * TILE * 0.7, 0.15, wz + (rnd() - 0.5) * TILE * 0.7, 0.6 + rnd() * 0.5, rnd() * 6.28, rev + k * 0.04);
        }
      } else if (fam === FAM.CITY) {
        const cnt = 1 + (rnd() < 0.5 ? 1 : 0);
        for (let k = 0; k < cnt; k++) {
          place(houses, wx + (rnd() - 0.5) * TILE * 0.4, 0.15, wz + (rnd() - 0.5) * TILE * 0.4, 0.85 + rnd() * 0.25, Math.floor(rnd() * 4) * (Math.PI / 2), rev + k * 0.05);
        }
      } else {
        const roll = rnd();
        if (roll < 0.28) place(trees, wx + (rnd() - 0.5) * 0.5, 0.15, wz + (rnd() - 0.5) * 0.5, 0.6 + rnd() * 0.4, rnd() * 6.28, rev);
        else if (roll < 0.36) place(houses, wx, 0.15, wz, 0.8, Math.floor(rnd() * 4) * (Math.PI / 2), rev);
      }
    }
  }
  const maxReveal = wfc.order.length / tilesPerSec + REVEAL_DUR;
  return { wfc, tileColors, tileReveal, houses, trees, planks, waterCells, maxReveal, cells: GRID * GRID };
}

// Write each caster instance's matrix for the current reveal time, scaling it up
// from 0 as its tile is revealed. Driven on the CPU so the shadow pass matches.
const _revM = new THREE.Matrix4();
const _revS = new THREE.Vector3();
function applyReveal(mesh: THREE.InstancedMesh, items: Item[], t: number, dur: number) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const rev = dur > 0 ? Math.min(1, Math.max(0, (t - it.r) / dur)) : 1;
    const e = rev * rev * (3 - 2 * rev);
    _revS.setScalar(it.s * e);
    _revM.compose(it.p, it.q, _revS);
    mesh.setMatrixAt(i, _revM);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

// Soft global-illumination bounce: once a build settles, render the scene into a
// small cube map and fit a spherical-harmonic LightProbe to it, so ambient picks
// up colour from the terrain (green from grass, blue from water/sky). One-shot
// per build — the analogue of little-landscapes' GIProbeController.
function GIProbe({ enabled, settled }: { enabled: boolean; settled: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const probe = useMemo(() => {
    const p = new THREE.LightProbe();
    p.intensity = 0;
    return p;
  }, []);
  const cube = useMemo(() => new THREE.WebGLCubeRenderTarget(64), []);
  const capturedFor = useRef(false);

  useEffect(() => {
    capturedFor.current = false; // re-capture on each new build
  }, [settled]);
  useEffect(() => () => cube.dispose(), [cube]);

  useFrame(() => {
    if (!enabled) {
      probe.intensity = 0;
      return;
    }
    if (settled && !capturedFor.current) {
      capturedFor.current = true;
      try {
        const cam = new THREE.CubeCamera(0.5, 250, cube);
        cam.position.set(0, 3, 0);
        probe.intensity = 0; // don't let the probe feed its own capture
        cam.update(gl, scene);
        // fromCubeRenderTarget returns a Promise<LightProbe> in current three
        const res = LightProbeGenerator.fromCubeRenderTarget(gl, cube) as unknown;
        const applySH = (lp: THREE.LightProbe | undefined) => {
          if (lp?.sh?.coefficients) probe.sh.copy(lp.sh);
        };
        if (res && typeof (res as Promise<THREE.LightProbe>).then === 'function') {
          (res as Promise<THREE.LightProbe>).then(applySH).catch(() => {});
        } else {
          applySH(res as THREE.LightProbe);
        }
      } catch {
        /* GI capture unavailable on this device — skip silently */
      }
    }
    probe.intensity = 0.8;
  });

  return <primitive object={probe} />;
}

function LandscapeScene({ onStats }: BenchProps) {
  useFps(onStats);
  const camera = useThree((s) => s.camera);
  const ramp = useMemo(toonRamp, []);
  const cloud = useMemo(() => cloudTexture(), []);

  const seed = useLandscapeStore((s) => s.seed);
  const speed = useLandscapeStore((s) => s.speed);
  const gtao = useLandscapeStore((s) => s.gtao);
  const shadows = useLandscapeStore((s) => s.shadows);
  const gradient = useLandscapeStore((s) => s.gradient);
  const clouds = useLandscapeStore((s) => s.clouds);
  const shadowTint = useLandscapeStore((s) => s.shadowTint);
  const gi = useLandscapeStore((s) => s.gi);
  const godrays = useLandscapeStore((s) => s.godrays);
  const setProgress = useLandscapeStore((s) => s.setProgress);

  const shared = useMemo<Shared>(
    () => ({
      uTime: { value: 0 },
      uRevDur: { value: REVEAL_DUR },
      uSky: { value: new THREE.Color(SKY) },
      uFadeNear: { value: SPAN * 0.85 },
      uFadeFar: { value: SPAN * 1.9 },
      uGradOn: { value: 1 },
      uCloud: { value: cloud },
      uCloudOn: { value: 1 },
      uCloudScale: { value: 0.07 },
      uCloudOffset: { value: new THREE.Vector2() },
      uShadowTint: { value: new THREE.Color(0.45, 0.55, 0.85) },
      uShadowTintAmt: { value: 0.45 },
    }),
    [cloud]
  );

  // live-toggle uniforms
  useEffect(() => {
    shared.uGradOn.value = gradient ? 1 : 0;
    shared.uCloudOn.value = clouds ? 1 : 0;
    shared.uShadowTintAmt.value = shadowTint ? 0.45 : 0;
  }, [gradient, clouds, shadowTint, shared]);

  const tilesPerSec = SPEEDS.find((s) => s.key === speed)!.tilesPerSec;
  const layout = useMemo(() => buildLayout(seed, tilesPerSec), [seed, tilesPerSec]);

  const houseGeo = useMemo(houseGeometry, []);
  const treeGeo = useMemo(treeGeometry, []);

  const tileMat = useMemo(() => {
    const m = new THREE.MeshToonMaterial({ gradientMap: ramp });
    enhanceToon(m, shared, { reveal: 'scale', shadowTint: true });
    return m;
  }, [ramp, shared]);
  // Casters (houses/trees/planks) reveal via CPU instance scaling (see applyReveal),
  // so their shadows track the pop-in — hence reveal:false here.
  const houseMat = useMemo(() => {
    const m = new THREE.MeshToonMaterial({ gradientMap: ramp, vertexColors: true });
    enhanceToon(m, shared, { reveal: false, shadowTint: true });
    return m;
  }, [ramp, shared]);
  const treeMat = useMemo(() => {
    const m = new THREE.MeshToonMaterial({ gradientMap: ramp, vertexColors: true });
    enhanceToon(m, shared, { reveal: false, sway: true, shadowTint: true });
    return m;
  }, [ramp, shared]);
  const plankMat = useMemo(() => {
    const m = new THREE.MeshToonMaterial({ gradientMap: ramp, color: BRIDGE_DECK });
    enhanceToon(m, shared, { reveal: false, shadowTint: true });
    return m;
  }, [ramp, shared]);
  const baseMat = useMemo(() => {
    const m = new THREE.MeshToonMaterial({ gradientMap: ramp, color: 0x6b4a32 });
    enhanceToon(m, shared, { reveal: false, shadowTint: true });
    return m;
  }, [ramp, shared]);

  const water = useMemo(() => {
    if (layout.waterCells.length === 0) return null;
    const isWater = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) return false;
      const j = y * GRID + x;
      return (
        layout.wfc.fam[j] === FAM.WATER ||
        layout.wfc.overlay[j] === OVER.RIVER ||
        layout.wfc.overlay[j] === OVER.BRIDGE
      );
    };
    const eps = TILE * 0.25;
    const quads = layout.waterCells.map((c) => {
      const g = new THREE.PlaneGeometry(TILE, TILE, 2, 2);
      g.rotateX(-Math.PI / 2);
      // foam band on edges that border land (computed in local space, pre-translate)
      const posAttr = g.attributes.position!;
      const n = posAttr.count;
      const foam = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const ox = posAttr.getX(i);
        const oz = posAttr.getZ(i);
        let f = 0;
        if (ox > eps && !isWater(c.gx + 1, c.gz)) f = 1;
        if (ox < -eps && !isWater(c.gx - 1, c.gz)) f = 1;
        if (oz > eps && !isWater(c.gx, c.gz + 1)) f = 1;
        if (oz < -eps && !isWater(c.gx, c.gz - 1)) f = 1;
        foam[i] = f;
      }
      g.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
      g.translate(c.x, 0.17, c.z);
      g.setAttribute('aReveal', new THREE.BufferAttribute(new Float32Array(n).fill(c.r), 1));
      return g;
    });
    const geo = mergeGeometries(quads)!;
    const mat = new THREE.MeshToonMaterial({ gradientMap: ramp, color: 0x2f7fb8, transparent: true, opacity: 0.92 });
    enhanceToon(mat, shared, { reveal: 'fade', ripple: true, foam: true });
    return new THREE.Mesh(geo, mat);
  }, [layout, ramp, shared]);

  const tilesRef = useRef<THREE.InstancedMesh>(null);
  const housesRef = useRef<THREE.InstancedMesh>(null);
  const treesRef = useRef<THREE.InstancedMesh>(null);
  const planksRef = useRef<THREE.InstancedMesh>(null);
  const birdsRef = useRef<THREE.InstancedMesh>(null);
  const startRef = useRef<number | null>(null);
  const progRef = useRef(0);
  const revealActiveRef = useRef(true);
  // flips true once the build finishes — triggers a one-shot GI probe capture
  const [settled, setSettled] = useState(false);
  // godray source disc (set via ref callback so GodRays gets a resolved mesh)
  const [sun, setSun] = useState<THREE.Mesh | null>(null);

  const BIRDS = 16;
  const birdGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(-0.18, 0.06);
    s.lineTo(-0.16, 0.1);
    s.lineTo(0, 0.04);
    s.lineTo(0.16, 0.1);
    s.lineTo(0.18, 0.06);
    s.lineTo(0, 0);
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const birdSeeds = useMemo(
    () =>
      Array.from({ length: BIRDS }, (_, i) => ({
        r: 4 + (i % 5) * 1.5,
        h: 7 + (i % 4),
        sp: 0.35 + (i % 3) * 0.15,
        ph: (i / BIRDS) * Math.PI * 2,
      })),
    []
  );

  useEffect(() => {
    const initCaster = (mesh: THREE.InstancedMesh | null, items: Item[]) => {
      if (!mesh) return;
      mesh.count = items.length;
      applyReveal(mesh, items, 0, REVEAL_DUR); // ease 0 → hidden until revealed
    };

    const t = tilesRef.current;
    if (t) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const c = new THREE.Color();
      const s = new THREE.Vector3(TILE, 0.3, TILE);
      for (let i = 0; i < layout.cells; i++) {
        const gx = i % GRID;
        const gz = (i / GRID) | 0;
        m.compose(new THREE.Vector3((gx - GRID / 2 + 0.5) * TILE, 0, (gz - GRID / 2 + 0.5) * TILE), q, s);
        t.setMatrixAt(i, m);
        t.setColorAt(i, c.setHex(layout.tileColors[i]!));
      }
      t.geometry.setAttribute('aReveal', new THREE.InstancedBufferAttribute(layout.tileReveal, 1));
      t.instanceMatrix.needsUpdate = true;
      if (t.instanceColor) t.instanceColor.needsUpdate = true;
    }
    initCaster(housesRef.current, layout.houses);
    initCaster(treesRef.current, layout.trees);
    initCaster(planksRef.current, layout.planks);

    camera.position.set(SPAN * 0.62, SPAN * 0.52, SPAN * 0.72);
    camera.lookAt(0, 0, 0);
    startRef.current = null; // restart the reveal clock for the new layout
    revealActiveRef.current = true;
    setSettled(false);
    setProgress(0);
  }, [layout, camera, setProgress]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state, delta) => {
    const el = state.clock.elapsedTime;
    if (startRef.current === null) startRef.current = el;
    const t = el - startRef.current;
    shared.uTime.value = t;
    if (clouds) shared.uCloudOffset.value.set(el * 0.01, el * 0.006);

    // throttled progress report
    const done = Math.min(layout.cells, Math.round(t * tilesPerSec));
    if (done !== progRef.current) {
      progRef.current = done;
      setProgress(done);
    }

    // CPU-driven caster reveal (so shadows track the pop-in); stops once settled
    if (revealActiveRef.current) {
      const h = housesRef.current;
      const tr = treesRef.current;
      const pl = planksRef.current;
      if (h) applyReveal(h, layout.houses, t, REVEAL_DUR);
      if (tr) applyReveal(tr, layout.trees, t, REVEAL_DUR);
      if (pl) applyReveal(pl, layout.planks, t, REVEAL_DUR);
      if (t > layout.maxReveal + REVEAL_DUR) {
        revealActiveRef.current = false;
        setSettled(true); // scene is fully built — let GI capture it
      }
    }

    const b = birdsRef.current;
    if (b) {
      for (let i = 0; i < BIRDS; i++) {
        const sd = birdSeeds[i]!;
        const a = sd.ph + el * sd.sp;
        dummy.position.set(Math.cos(a) * sd.r, sd.h + Math.sin(el * 1.5 + sd.ph) * 0.3, Math.sin(a) * sd.r);
        dummy.rotation.set(0, -a + Math.PI / 2, 0);
        dummy.scale.setScalar(1 + Math.sin(el * 8 + sd.ph) * 0.18);
        dummy.updateMatrix();
        b.setMatrixAt(i, dummy.matrix);
      }
      b.instanceMatrix.needsUpdate = true;
    }
    void delta;
  });

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, SPAN * 1.5, SPAN * 3]} />
      <hemisphereLight args={['#ffffff', '#9bbf8a', shadows ? 0.7 : 0.95]} />
      <GIProbe enabled={gi} settled={settled} />
      <directionalLight
        position={[SPAN * 0.4, SPAN * 0.7, SPAN * 0.32]}
        intensity={2.1}
        color={'#fff3d6'}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-radius={4}
        shadow-bias={-0.0002}
        shadow-normalBias={0.06}
        shadow-camera-near={1}
        shadow-camera-far={SPAN * 2.5}
        shadow-camera-left={-SPAN}
        shadow-camera-right={SPAN}
        shadow-camera-top={SPAN}
        shadow-camera-bottom={-SPAN}
      />

      <mesh position={[0, -1.05, 0]} receiveShadow material={baseMat}>
        <boxGeometry args={[SPAN, 2.0, SPAN]} />
      </mesh>

      <instancedMesh ref={tilesRef} args={[undefined, tileMat, GRID * GRID]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      <instancedMesh ref={housesRef} args={[houseGeo, houseMat, Math.max(1, layout.houses.length)]} castShadow receiveShadow />
      <instancedMesh ref={treesRef} args={[treeGeo, treeMat, Math.max(1, layout.trees.length)]} castShadow receiveShadow />
      <instancedMesh ref={planksRef} args={[undefined, plankMat, Math.max(1, layout.planks.length)]} castShadow receiveShadow>
        <boxGeometry args={[TILE, 0.12, TILE * 0.5]} />
      </instancedMesh>

      {water ? <primitive object={water} /> : null}

      <instancedMesh ref={birdsRef} args={[birdGeo, undefined, BIRDS]} frustumCulled={false}>
        <meshBasicMaterial color={'#2b2b33'} side={THREE.DoubleSide} />
      </instancedMesh>

      {godrays ? (
        <mesh ref={setSun} position={SUN_POS}>
          <sphereGeometry args={[SPAN * 0.06, 24, 24]} />
          <meshBasicMaterial color={'#fff2c4'} toneMapped={false} fog={false} />
        </mesh>
      ) : null}

      {gtao || godrays ? (
        <EffectComposer>
          {gtao ? <N8AO aoRadius={1.2} intensity={2.2} halfRes /> : <></>}
          {godrays && sun ? (
            <GodRays
              sun={sun}
              blendFunction={BlendFunction.SCREEN}
              samples={60}
              density={0.95}
              decay={0.92}
              weight={0.5}
              exposure={0.5}
              clampMax={1}
              blur
            />
          ) : (
            <></>
          )}
          <Bloom intensity={0.12} luminanceThreshold={0.78} mipmapBlur />
        </EffectComposer>
      ) : null}

      <OrbitControls
        enablePan={false}
        target={[0, 0, 0]}
        minDistance={SPAN * 0.5}
        maxDistance={SPAN * 2}
        maxPolarAngle={Math.PI * 0.49}
      />
    </>
  );
}

export function LandscapeBench(props: BenchProps) {
  return <LandscapeScene {...props} />;
}
