/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';
import { useLandscapeStore, SPEEDS } from '../landscapeStore';

// Real-asset Landscape: drives the vendored little-landscapes pipeline (socket WFC
// + sculpted Tiles.glb + atlas toon materials + instanced props), with the full
// effect stack (terrain skirt, drifting cloud shadows, in-world godray beams, GI
// probe) and the same controls as the procedural bench (seed, build speed,
// feature toggles). Tile models + atlas are the original author's assets, vendored
// under public/ for local use only.
import { installSeededRandom, originalRandom, withOriginalRandom, setSeed } from '../landscape/vendor/SeededRng.js';
import { WFC } from '../landscape/vendor/WfcSolver.js';
import { loadTileModels, tileModelCache, sharedLiquidMaterial, waveQuadModel } from '../landscape/vendor/TileLoader.js';
import { createTileRenderer } from '../landscape/vendor/TileRenderer.js';
import { collectedInstances, createInstancedMeshes, clearInstancedMeshes } from '../landscape/vendor/Instancing.js';
import {
  applyLandscapeMaterial,
  convertToToonMaterial,
  isBillboardObject,
  initCloudCookie,
  updateCloudCookie,
  setCloudCookieVisible,
} from '../landscape/vendor/ToonMaterials.js';
import { updateWind } from '../landscape/vendor/WindSway.js';
import { setAllGradientsEnabled } from '../landscape/vendor/VerticalGradient.js';
import { shadowTintUniforms } from '../landscape/vendor/ShadowTint.js';
import { createWaveQuadMaterial, buildWaveQuadInstances } from '../landscape/vendor/WaterSystem.js';
import { createWaveQuadController } from '../landscape/vendor/WaveQuadController.js';
import GodraySystem from '../landscape/vendor/GodraySystem.js';
import { createGodrayController } from '../landscape/vendor/GodrayController.js';
import { createCloudShadowLayer } from '../landscape/vendor/CloudShadowLayer.js';
import { createGIProbeController } from '../landscape/vendor/GIProbeController.js';
import { createPostPipeline } from '../landscape/vendor/PostPipeline.js';

const GRID_W = 12;
const GRID_H = 10;
const CELL = 2;
const CENTER: [number, number, number] = [((GRID_W - 1) * CELL) / 2, 0, ((GRID_H - 1) * CELL) / 2];
const ASSET_BASE = '/external-showcases/little-landscapes/sites/little-landscapes.vercel.app/';
const noop = () => {};

installSeededRandom();

// Load the GLB + atlas + cloud-noise texture exactly once, shared across mounts.
let cloudTexture: THREE.Texture | null = null;
let assetsPromise: Promise<void> | null = null;
function ensureAssets(): Promise<void> {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      cloudTexture = await new Promise<THREE.Texture>((res, rej) =>
        new THREE.TextureLoader().load(ASSET_BASE + 'Textures/Noise-Clouds.png', res, undefined, rej)
      );
      cloudTexture.colorSpace = THREE.NoColorSpace;
      initCloudCookie(cloudTexture);
      await loadTileModels({ applyLandscapeMaterial, shouldLogCellInfo: () => false });
    })();
  }
  return assetsPromise;
}

// ---- terrain skirt (diorama slab edges that fade to sky) — from CellVisuals ----
function skirtMaterial() {
  const topY = -0.015;
  const bottomY = topY - 4 / 3;
  return new THREE.ShaderMaterial({
    uniforms: {
      uGrass: { value: new THREE.Color(0x4f8d20) },
      uTop: { value: new THREE.Color(0x58514a) },
      uBottom: { value: new THREE.Color(0x554942) },
      uSky: { value: new THREE.Color(0x8ec9e6) },
      uTopY: { value: topY },
      uBottomY: { value: bottomY },
      uSkyStart: { value: THREE.MathUtils.lerp(bottomY, topY, 0.72) },
      uGrassStart: { value: THREE.MathUtils.lerp(bottomY, topY, 0.95) },
      uSun: { value: new THREE.Vector3(19, 25, -15).normalize() },
    },
    toneMapped: false,
    vertexShader: `varying float vY; varying float vShade; uniform vec3 uSun;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vY = wp.y;
        vec3 wn = normalize(mat3(modelMatrix)*normal);
        vShade = 1.0 - smoothstep(-0.1, 0.55, dot(wn, uSun));
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `varying float vY; varying float vShade;
      uniform vec3 uGrass, uTop, uBottom, uSky; uniform float uTopY, uBottomY, uSkyStart, uGrassStart;
      void main(){
        float wall = smoothstep(uBottomY, uTopY, vY);
        vec3 c = mix(uBottom, uTop, wall);
        vec3 sh = vec3(0.48,0.56,0.38);
        c = mix(c, c*sh, vShade*0.36);
        float sky = 1.0 - smoothstep(uBottomY, uSkyStart, vY);
        float grass = smoothstep(uGrassStart, uTopY, vY);
        vec3 col = mix(c, uSky, sky);
        vec3 g = mix(uGrass, uGrass*sh, vShade*0.28);
        gl_FragColor = vec4(mix(col, g, grass), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function buildSkirt(): THREE.Group {
  const g = new THREE.Group();
  const worldW = GRID_W * CELL;
  const worldD = GRID_H * CELL;
  const half = CELL / 2;
  const minX = -half;
  const maxX = worldW - half - CELL + CELL; // = worldW - half
  const minZ = -half;
  const maxZ = worldD - half - CELL + CELL;
  const cx = (minX + (worldW - half)) / 2;
  const cz = (minZ + (worldD - half)) / 2;
  const t = 0.128;
  const h = 4 / 3;
  const top = -0.015;
  const off = 0.001;
  const bottom = top - h;
  const mat = skirtMaterial();
  const strips = [
    { w: worldW, d: t, x: cx, z: minZ + t / 2 - off },
    { w: worldW, d: t, x: cx, z: maxZ - t / 2 + off },
    { w: t, d: worldD, x: minX + t / 2 - off, z: cz },
    { w: t, d: worldD, x: maxX - t / 2 + off, z: cz },
  ];
  for (const s of strips) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), mat);
    m.position.set(s.x, top - h / 2, s.z);
    g.add(m);
  }
  const bt = 0.08;
  const bottomMesh = new THREE.Mesh(new THREE.BoxGeometry(worldW, bt, worldD), mat);
  bottomMesh.position.set(cx, bottom - bt / 2, cz);
  g.add(bottomMesh);
  return g;
}

// GodrayController exposes only toggleEnabled()/getEnabled(); nudge it to match.
function syncGodray(s: any, on: boolean) {
  const g = s?.godray;
  if (!g?.getEnabled) return;
  let guard = 0;
  while (g.getEnabled() !== on && guard++ < 3) g.toggleEnabled();
}

// GIProbeController only exposes toggleEnabled() (no getter) — track state on the
// session. Enabling bakes a LightProbeGrid from the built scene (one-shot).
function syncGi(s: any, on: boolean) {
  if (!s?.gi || s.giEnabled === on) return;
  s.gi.toggleEnabled();
  s.giEnabled = on;
}

type Session = {
  root: THREE.Group;
  sun: THREE.DirectionalLight;
  wfc: any;
  tileRenderer: any;
  placed: boolean[];
  wave: any;
  godray: any;
  cloud: any;
  gi: any;
  giEnabled: boolean;
  finalized: boolean;
  stepAcc: number;
};

function LandscapeGlbScene({ onStats }: BenchProps) {
  useFps(onStats);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const seed = useLandscapeStore((s) => s.seed);
  const speed = useLandscapeStore((s) => s.speed);
  const gtao = useLandscapeStore((s) => s.gtao);
  const shadows = useLandscapeStore((s) => s.shadows);
  const gradient = useLandscapeStore((s) => s.gradient);
  const clouds = useLandscapeStore((s) => s.clouds);
  const shadowTint = useLandscapeStore((s) => s.shadowTint);
  const giOn = useLandscapeStore((s) => s.gi);
  const godraysOn = useLandscapeStore((s) => s.godrays);
  const setProgress = useLandscapeStore((s) => s.setProgress);

  const size = useThree((s) => s.size);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const progRef = useRef(-1);

  // GTAO via the reference's manual AO-multiply pass (PostPipeline): the scene is
  // rendered normally (keeping our Linear tone-mapping), an AO map is computed and
  // multiplied over the frame — no EffectComposer re-render, so no grey wash-out.
  const postRef = useRef<any>(null);
  useEffect(() => {
    postRef.current = createPostPipeline({
      renderer: gl,
      scene,
      getCamera: () => camera,
      getVignetteVisible: () => false,
    });
    postRef.current.resize();
    return () => {
      postRef.current = null;
    };
  }, [gl, scene, camera]);
  useEffect(() => {
    postRef.current?.resize();
  }, [size]);

  // renderer setup: atlas materials want ~3x exposure, and a static shadow map.
  // Capture originals once and restore on unmount.
  useEffect(() => {
    const prev = { tm: gl.toneMapping, exp: gl.toneMappingExposure, auto: gl.shadowMap.autoUpdate };
    gl.toneMappingExposure = 3.0;
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.toneMapping = prev.tm;
      gl.toneMappingExposure = prev.exp;
      gl.shadowMap.autoUpdate = prev.auto;
      gl.shadowMap.needsUpdate = true;
    };
  }, [gl]);

  useEffect(() => {
    gl.toneMapping = THREE.LinearToneMapping;
  }, [gl]);

  useEffect(() => {
    camera.position.set(CENTER[0], 16, (GRID_H - 1) * CELL + 17);
    camera.lookAt(CENTER[0], 0, CENTER[2]);
  }, [camera]);

  // (re)build a generation session whenever the seed changes
  useEffect(() => {
    let cancelled = false;
    ensureAssets()
      .then(() => {
        if (cancelled) return;
        // tear down any previous session
        const prev = sessionRef.current;
        if (prev) scene.remove(prev.root);
        clearInstancedMeshes({ scene: new THREE.Scene() });

        const root = new THREE.Group();
        scene.add(root);

        const ambient = new THREE.AmbientLight(0xffffff, 0.65);
        root.add(ambient);
        const sun = new THREE.DirectionalLight(0xffffff, 2.0);
        sun.position.set(CENTER[0] + 19, 25, CENTER[2] - 15);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.bias = -0.0001;
        sun.shadow.normalBias = 0.02;
        sun.shadow.camera.near = 0.1;
        sun.shadow.camera.far = 150;
        const sc = sun.shadow.camera as THREE.OrthographicCamera;
        sc.left = -22;
        sc.right = 22;
        sc.top = 22;
        sc.bottom = -22;
        sc.updateProjectionMatrix();
        sun.target.position.set(CENTER[0], 0, CENTER[2]);
        root.add(sun);
        root.add(sun.target);
        root.add(buildSkirt());

        setSeed(seed >>> 0);
        const wfc = new WFC(GRID_W, GRID_H, { shouldLogCellInfo: () => false });
        wfc.preseed();

        const tileRenderer = createTileRenderer({
          cellSize: CELL,
          tileModelCache,
          originalRandom,
          getUsePrimitiveShapes: () => false,
          convertToToonMaterial: (mesh: any, opts: object = {}) =>
            convertToToonMaterial(mesh, { ...opts, sharedLiquidMaterial, shadowsEnabled: true }),
          collectedInstances,
        });

        const wave = createWaveQuadController({
          scene: root,
          gridWidth: GRID_W,
          cellSize: CELL,
          getWaveQuadModel: () => waveQuadModel,
          createWaveQuadMaterial,
          buildWaveQuadInstances,
        });

        // godrays + cloud shadows + GI (best-effort; degrade gracefully)
        let godray: any = null;
        try {
          godray = createGodrayController({
            godraySystem: GodraySystem,
            withOriginalRandom,
            getSun: () => sun,
            shouldLogCellInfo: () => false,
            updateHint: noop,
          });
          godray.init(root);
        } catch (e) {
          console.warn('godrays unavailable', e);
        }
        let cloud: any = null;
        try {
          if (cloudTexture) cloud = createCloudShadowLayer(root, { cloudTexture, cloudHeight: 16 });
        } catch (e) {
          console.warn('cloud shadows unavailable', e);
        }
        // GI probe bakes a LightProbeGrid into the scene (needs three >= 0.185).
        let gi: any = null;
        try {
          gi = createGIProbeController({
            scene: root,
            renderer: gl,
            gridWidth: GRID_W,
            gridHeight: GRID_H,
            cellSize: CELL,
            updateHint: noop,
          });
          if (cloudTexture) gi.setCloudTexture(cloudTexture);
        } catch (e) {
          console.warn('GI probe unavailable', e);
        }

        sessionRef.current = {
          root,
          sun,
          wfc,
          tileRenderer,
          placed: new Array(GRID_W * GRID_H).fill(false),
          wave,
          godray,
          cloud,
          gi,
          giEnabled: false,
          finalized: false,
          stepAcc: 0,
        };
        progRef.current = -1;
        setProgress(0);
        setReady(true);
      })
      .catch((e) => console.error('Landscape (GLB) failed to load', e));
    return () => {
      cancelled = true;
    };
  }, [seed, scene, gl, setProgress]);

  // We add the diorama to the shared R3F scene imperatively (scene.add), so React
  // won't auto-remove it when the bench unmounts — strip it on unmount or it lingers
  // over other benches.
  useEffect(() => {
    return () => {
      const root = sessionRef.current?.root;
      if (root) scene.remove(root);
      sessionRef.current = null;
    };
  }, [scene]);

  // apply feature toggles live
  useEffect(() => {
    const s = sessionRef.current;
    if (s) {
      s.sun.castShadow = shadows;
      gl.shadowMap.needsUpdate = true;
    }
  }, [shadows, gl, ready]);
  useEffect(() => {
    setAllGradientsEnabled(gradient);
  }, [gradient, ready]);
  useEffect(() => {
    setCloudCookieVisible(clouds);
    sessionRef.current?.cloud?.setVisible?.(clouds);
  }, [clouds, ready]);
  useEffect(() => {
    shadowTintUniforms.uShadowTintEnabled.value = shadowTint ? 1 : 0;
  }, [shadowTint, ready]);

  const dummyTarget = useRef<any>(null);

  useFrame((state, delta) => {
    const s = sessionRef.current;
    if (!s) return;

    // incremental generation by build speed
    if (!s.finalized) {
      const perSec = SPEEDS.find((x) => x.key === speed)!.tilesPerSec;
      let steps: number;
      if (speed === 'instant') {
        steps = GRID_W * GRID_H;
      } else {
        // fractional accumulator so the rate is wall-clock based, not per-frame
        s.stepAcc += perSec * Math.min(delta, 0.1);
        steps = Math.floor(s.stepAcc);
        s.stepAcc -= steps;
      }
      for (let k = 0; k < steps && !s.wfc.isDone; k++) s.wfc.step();
      let collapsed = 0;
      s.wfc.grid.forEach((cell: any, i: number) => {
        if (cell.collapsed && cell.tile) {
          collapsed++;
          if (!s.placed[i]) {
            s.placed[i] = true;
            const gx = i % GRID_W;
            const gz = Math.floor(i / GRID_W);
            s.root.add(s.tileRenderer.createTileMesh(cell.tile, gx * CELL, gz * CELL, true));
          }
        }
      });
      if (collapsed !== progRef.current) {
        progRef.current = collapsed;
        setProgress(collapsed);
      }
      if (s.wfc.isDone) {
        try {
          createInstancedMeshes({ scene: s.root, shadowsEnabled: s.sun.castShadow, isBillboardObject });
          s.wave.rebuild(s.wfc);
          s.godray?.generateFromSun?.();
          syncGodray(s, godraysOn);
          syncGi(s, giOn);
        } catch (e) {
          console.warn('finalize step failed', e);
        }
        gl.shadowMap.needsUpdate = true;
        s.finalized = true;
      }
    }

    // per-frame animation
    updateWind(delta);
    updateCloudCookie(delta);
    s.wave?.updateTime?.(state.clock.elapsedTime);
    s.cloud?.update?.(delta);
    try {
      s.godray?.update?.(delta, camera);
    } catch {
      /* ignore */
    }
    void dummyTarget;
  });

  // Render-priority frame (priority > 0 hands rendering to us, so R3F stops its own
  // auto-render). Drive the manual GTAO pipeline; falls back to a plain render.
  useFrame(() => {
    const post = postRef.current;
    if (post) {
      post.setGTAOVisible(gtao);
      post.render(camera);
    } else {
      gl.render(scene, camera);
    }
  }, 1);

  useEffect(() => {
    const s = sessionRef.current;
    if (s?.finalized) syncGodray(s, godraysOn);
  }, [godraysOn, ready]);
  useEffect(() => {
    const s = sessionRef.current;
    if (s?.finalized) syncGi(s, giOn);
  }, [giOn, ready]);

  return (
    <>
      <color attach="background" args={['#8ec9e6']} />
      <fog attach="fog" args={['#8ec9e6', 60, 220]} />
      <OrbitControls
        target={CENTER}
        enablePan={false}
        minDistance={6}
        maxDistance={80}
        maxPolarAngle={Math.PI * 0.49}
      />
    </>
  );
}

export function LandscapeGlbBench(props: BenchProps) {
  return <LandscapeGlbScene {...props} />;
}
