# threejs-benchmark — SOTA Research

Sourced survey of state-of-the-art Three.js / WebGL work, scouted for adaptation
into the benchmark + showcase suite. All candidates are filtered for the Devvit
webview's constraints: **strict CSP, npm-bundled (no external CDNs/scripts),
assets vendored from our own origin, WebGL2 baseline, WebGPU optional**.

Companion to [`PLAN.md`](./PLAN.md).

---

## 1. Renderer & platform feasibility

- **WebGL2** is the universal baseline — every bench must run on it.
- **WebGPU in the Devvit iframe**: usable. There is **no Permissions-Policy gate**
  for WebGPU (the `allow="webgpu"` proposal, gpuweb#3483, was never shipped);
  `navigator.gpu` is exposed in cross-origin iframes given **HTTPS + a non-opaque
  origin** (avoid `srcdoc`/`sandbox` without `allow-same-origin`), which Devvit's
  hosted webview satisfies.
- **WebGPU availability (2025–26)**: Chrome/Edge desktop+Android, Safari 26
  desktop + iOS/iPadOS 26 (incl. iOS WKWebView → Reddit iOS app on iOS 26+).
  **Android System WebView is NOT default → assume WebGL2 there.** ~82% global
  (caniuse).
- **`WebGPURenderer`** (three r171+) ships a built-in WebGL2 backend and
  **auto-falls-back**; one renderer, `{ forceWebGL: true }` to pin WebGL2. **TSL**
  compiles to WGSL (WebGPU) or GLSL (WebGL2) automatically — **except compute
  shaders, which run only on the WebGPU backend** (no WebGL2 fallback).
- **Detection**: `WebGPU.isAvailable()` → `await navigator.gpu.requestAdapter()`
  → confirm `renderer.backend.isWebGPUBackend` after `await renderer.init()`.

## 2. CSP / WASM / assets

- **WASM needs `script-src 'wasm-unsafe-eval'`.** The `-compat` builds (Rapier,
  Jolt) inline the `.wasm` as base64 — this fixes the *fetch/CDN/origin* problem
  but not the *eval permission*. **`goblin-gardens` ships `@react-three/rapier`
  and runs in Devvit → WASM/Rapier is confirmed viable under Devvit's CSP.** Still
  keep **cannon-es** (pure JS) as a zero-risk fallback.
- **glTF compression decoders are all WASM**: meshopt (npm `meshoptimizer`, WASM
  **inlined ~28 KB, main-thread**, no blob worker → easiest), DRACO + KTX2 (need a
  self-hosted decoder + `worker-src blob:`). goblin-gardens self-hosts DRACO at
  `/draco/`. If WASM were ever blocked, ship **uncompressed `.glb`** (the only
  fully CSP-proof path).
- **SharedArrayBuffer** requires cross-origin isolation (COOP+COEP) on the
  top-level doc — **unavailable in the iframe**. Affects Gaussian-splat libs
  (choose SAB-free ones) and multithreaded physics (use single-thread builds).
- **Procedural GLSL/TSL shaders** bundle as JS strings → **zero CSP concern**.
- **Env lighting with no asset**: `RoomEnvironment` + `PMREMGenerator` gives IBL
  with no HDR to vendor — default for all transmission/reflection benches.

## 3. Benchmark candidate menu (by technique)

### Rendering / instancing (ramp count → FPS cliff)
- 🟢 **InstancedMesh performance** — canonical "1 draw call, N objects" → 1M+.
  [example](https://threejs.org/examples/webgl_instancing_performance.html). Zero
  assets. *Bulletproof core bench.*
- 🟢 **BatchedMesh** — mixed geometries, multi-draw; GUI `count` is the ramp axis.
  [example](https://threejs.org/examples/webgl_mesh_batch.html) ·
  [docs](https://threejs.org/docs/pages/BatchedMesh.html). The *modern* path.
- 🟢 **al-ro Grass — 1M wind-animated blades @ 60fps** —
  [live](https://al-ro.github.io/projects/grass/) ·
  [forum](https://discourse.threejs.org/t/real-time-grass-simulation-in-the-browser-over-1-million-blades-at-60-fps/82808).
  The "how is this in a browser" instancing showcase; ramp blade count. No assets.
- 🟢 **Points/sprites** & **galaxy generator** — raw point throughput → millions.
  [points example](https://threejs.org/examples/webgl_points_sprites.html) ·
  [galaxy](https://threejs-journey.com/lessons/galaxy-generator).

### GPGPU / compute particles (the #1 community "wow", cleanest ramp scalar)
- 🟢 **GPGPU birds (boids)** — `GPUComputationRenderer`, count = WIDTH², no assets.
  [example](https://threejs.org/examples/webgl_gpgpu_birds.html). Iconic.
- 🟢 **GPGPU protoplanet** — N-body particles forming a planet (compute-bound).
  [example](https://threejs.org/examples/webgl_gpgpu_protoplanet.html).
- 🟢 **klevron threejs-toys** — plug-and-play GPGPU boids/particles; `gpgpuSize`
  ramp knob; npm, no CDN. [src](https://github.com/klevron/threejs-toys).
- 🟢 **Codrops "dreamy" GPGPU particle morph** — ping-pong FBO sim, scalable.
  [article+repo](https://tympanus.net/codrops/2024/12/19/crafting-a-dreamy-particle-effect-with-three-js-and-gpgpu/).
- 🔵 **WebGPU compute particles (TSL, 500k)** — true compute path, WebGPU-only;
  gate behind detection. [example](https://threejs.org/examples/webgpu_compute_particles.html).

### Raymarching / fullscreen shaders (shader-bound; ramp steps × resolution)
- 🟢 **THREE.js PathTracing Renderer (erichlof)** — real-time progressive path
  tracer w/ GI/caustics on WebGL2; ramp samples/res. Heaviest, most impressive
  pure-shader load, no assets.
  [live](https://erichlof.github.io/THREE.js-PathTracing-Renderer/) ·
  [src](https://github.com/erichlof/THREE.js-PathTracing-Renderer).
- 🟢 **Procedural Clouds (CK42BB)** — volumetric raymarch **with a WebGL2 fallback
  already built in**; ramp march steps. No assets.
  [src](https://github.com/CK42BB/procedural-clouds-threejs).
- 🟢 **Mandelbulb / SDF** — analytic distance fields; two-axis ramp (iterations ×
  steps). [iq SDFs](https://iquilezles.org/articles/distfunctions/) ·
  [Mandelbulb](https://www.shadertoy.com/view/ltfSWn) ·
  [three.js port guide](https://medium.com/@nabilnymansour/ray-marching-in-three-js-66b03e3a6af2).
  Porting recipe: [threejs.org/manual shadertoy](https://threejs.org/manual/en/shadertoy.html).
- 🟢 **Metaballs raymarch (Codrops)** — zero-asset fragment raymarch; ramp ball
  count/steps. [article](https://tympanus.net/codrops/2025/06/09/) ·
  [src](https://github.com/koji014/interactive-droplets).

### Postprocessing / visual fidelity (effect-cost toggle + sample ramp)
- 🟢 **pmndrs `postprocessing`** (or `@react-three/postprocessing`) — single-pass
  merged Bloom/SSAO/DoF/CA/GodRays/SMAA; base64 LUTs, no fetch.
  [src](https://github.com/pmndrs/postprocessing). *Cinematic-stack toggle bench.*
- 🟢 **N8AO** — best real-time AO; ramp samples 8→64.
  [src](https://github.com/N8python/n8ao). (Pin version to your `three`.)
- 🟢 **UnrealBloomPass** (`three/addons`) — iconic multi-mip bloom; A/B vs
  single-pass.
- 🟡 **Ocean** — reflective animated water + procedural `Sky` (no HDR), one small
  `waternormals.jpg`. Hero visual.
  [example](https://threejs.org/examples/webgl_shaders_ocean.html).
- 🟢 **Transmission/Reflector** — `MeshPhysicalMaterial` transmission toggle or
  `Reflector` mirror ramp (each = an extra scene render); zero assets via
  `RoomEnvironment`. pmndrs `MeshTransmissionMaterial` (vanilla via
  `@pmndrs/vanilla`).
- ⚠️ **realism-effects (SSGI/SSR/TRAA)** — highest-fidelity but unmaintained /
  version-fragile. Stretch goal only.
  [src](https://github.com/0beqz/realism-effects).

### Lights & shadows (ramp shadow-casting lights)
- 🟢 **Spotlights / shadow-map performance** —
  [spotlights](https://threejs.org/examples/#webgl_lights_spotlights) ·
  [shadowmap perf](https://threejs.org/examples/#webgl_shadowmap_performance).
  Cost driver = shadow passes (point light = 6), then `mapSize`.
- 🔵 **WebGPU clustered lighting (~900 point lights)** — WebGPU-only flagship.
  [example](https://threejs.org/examples/#webgpu_lights_clustered).

### Physics (ramp body count)
- ⚡ **Rapier** (`@dimforge/rapier3d-compat` / `@react-three/rapier`) — SOTA,
  thousands of bodies; base64-inlined wasm; **proven in Devvit by goblin-gardens**.
  [rapier.rs](https://rapier.rs/) · [demos](https://rapier.rs/demos3d/index.html).
- 🟢 **cannon-es** — pure JS, ~hundreds of bodies; zero CSP risk; the baseline.
  [src](https://github.com/pmndrs/cannon-es).
- (Skip ammo.js — stagnant, separate-wasm fetch. Jolt `wasm-compat` is a viable
  2nd SOTA option if wanted.)
- Prior art for a multi-engine ramping harness: **lo-th/phy**
  [src](https://github.com/lo-th/phy) · [live](https://lo-th.github.io/phy/).

### Gaussian splatting (showcase; ramp splat count) — SAB-free libs only
- 🟡 **Spark** (`@sparkjsdev/spark`) — SOTA splat+mesh fusion, WebGL2-only, no SAB,
  MIT. [site](https://sparkjs.dev/) · [src](https://github.com/sparkjsdev/spark).
  *Top wow pick.*
- 🟡 **mkkellogg GaussianSplats3D** — mature standalone viewer; pass
  `sharedMemoryForWorkers: false`.
  [src](https://github.com/mkkellogg/GaussianSplats3D).
- 🟡 **drei `<Splat>`** — `.splat` only, no SAB; lowest R3F integration cost.
  [docs](https://drei.docs.pmnd.rs/abstractions/splat).
- Vendorable CC-BY assets: [khyron/Gaussian-Splatting](https://github.com/khyron/Gaussian-Splatting);
  convert/inspect with [SuperSplat](https://superspl.at/). Compress (.ksplat/.sog,
  ~5–20 MB) before bundling.

### glTF + animation (showcase)
- **meshopt** is the recommended compression path (npm `meshoptimizer`, WASM
  inlined, main-thread). [readme](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md).
- Small uncompressed vendorable models:
  [RobotExpressive.glb 0.44 MB](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf)
  (best small bench), Soldier 2.06 MB, Xbot 2.79 MB; morph: Horse 0.17 MB,
  Flamingo/Parrot 0.07–0.09 MB.
- Instanced skinned crowds (WebGL2): `@three.ez/instanced-mesh`
  [src](https://github.com/agargaro/instanced-mesh).

## 4. Community "hall of fame" (r/threejs + forum + carousel)

> Note: Reddit blocked direct scraping from the research environment; this was
> reconstructed via the three.js Discourse Showcase, the threejs.org featured
> carousel, Codrops, and pmndrs — where the same viral demos surface.

Genuinely-impressive, frequently-reposted projects worth studying:

1. **erichlof PathTracing Renderer** — real-time browser path tracing (GI). *bench*
2. **al-ro 1M-blade Grass** — instancing flex. *bench*
3. **klevron threejs-toys** — GPGPU boids toys. *bench*
4. **mkkellogg GaussianSplats3D / Spark** — 3D Gaussian splatting. *showcase*
5. **Wind Waker JS (Robin Payot)** — cel-shaded Zelda world + TSL port.
   [live](https://wind-waker-threejs.com/) ·
   [src](https://github.com/Robpayot/zelda-project-public). *showcase*
6. **Bruno Simon portfolio** — drive-a-car 3D portfolio; the genre-defining viral
   hit. [live](https://bruno-simon.com) · open-sourced 2019 version
   [folio-2019](https://github.com/brunosimon/folio-2019). *showcase / pattern*
7. **WebGPU-Ocean (SPH fluid)** —
   [Codrops](https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/). *bench (WebGPU)*
8. **Fractal Worlds v2** — fly-through raymarched fractals.
   [live](https://fractalworlds.io). *bench (WebGPU)*
9. **Volumetric lighting in WebGPU** —
   [forum](https://discourse.threejs.org/t/volumetric-lighting-in-webgpu/87959) ·
   [example](https://threejs.org/examples/webgpu_volume_lighting.html). *showcase*
10. **TSL procedural terrain** (official) —
    [example](https://threejs.org/examples/webgpu_tsl_procedural_terrain.html) ·
    [Bruno's TSL sandbox](https://github.com/brunosimon/three.js-tsl-sandbox). *bench*
11. **pmndrs r3f showcase** — caustics / monitors (SSR) / glass-flower
    (transmission). [examples](https://pmndrs.github.io/examples/). *showcase*
12. **Codrops dissolve effect** — shader+particle dissolve.
    [article](https://tympanus.net/codrops/2025/02/17/implementing-a-dissolve-effect-with-shaders-and-particles-in-three-js/). *showcase*
13. **three-doom (mrdoob)** — DOOM through Three.js.
    [live](https://mrdoob.github.io/three-doom/). *novelty*

### Recurring "wow" techniques (what to prioritize)
1. **GPGPU / compute particles** — most-reposted wow; cleanest ramp scalar.
2. **Massive GPU instancing** (1M grass/particles) — "how is this in a browser".
3. **Volumetric raymarching** (clouds, fractals, volumetric light) — rising fast.
4. **Gaussian splatting** — newest novelty wave; high impact, asset-dependent.
5. **WebGPU + TSL** (terrain, compute, volumetrics) — the frontier; gate + fallback.
6. **Postprocessing stacks** (bloom + DoF + SSR + transmission/caustics) — reliable
   polish multiplier; good fixed showcase material.

## 5. Recommended starter set (impressiveness × feasibility)

A 6–8 bench v1 that covers every "wow" technique with zero/minimal vendoring and a
WebGL2 floor:

| Bench | Technique | Ramp axis | Tag |
|---|---|---|---|
| Instancing (InstancedMesh / grass) | GPU instancing | instance count | 🟢 |
| GPGPU boids | compute particles | WIDTH² | 🟢 |
| Procedural clouds **or** path tracer | raymarching | march steps × res | 🟢 |
| Cinematic post stack | postprocessing | effect toggle / AO samples | 🟢 |
| Rapier pile | physics | body count | ⚡ (proven) |
| cannon-es pile | physics (pure JS) | body count | 🟢 |
| Gaussian splat scene | splatting | (fixed / splat count) | 🟡 |
| WebGPU compute particles | compute (gated) | particle count | 🔵 |

## Sources

- three.js examples & docs: https://threejs.org/examples/ ·
  https://threejs.org/manual/en/webgpurenderer.html ·
  https://threejs.org/docs/pages/BatchedMesh.html
- WebGPU support: https://web.dev/blog/webgpu-supported-major-browsers ·
  https://caniuse.com/webgpu · https://developer.apple.com/forums/thread/770862 ·
  gpuweb#3483 https://github.com/gpuweb/gpuweb/issues/3483
- Physics: https://rapier.rs/ · https://github.com/pmndrs/cannon-es ·
  https://github.com/jrouwe/JoltPhysics.js/ · https://github.com/lo-th/phy
- Postprocessing/visual: https://github.com/pmndrs/postprocessing ·
  https://github.com/N8python/n8ao · https://github.com/0beqz/realism-effects ·
  https://threejs.org/examples/webgl_shaders_ocean.html
- Splatting: https://github.com/sparkjsdev/spark ·
  https://github.com/mkkellogg/GaussianSplats3D ·
  https://drei.docs.pmnd.rs/abstractions/splat
- Hall of fame: https://discourse.threejs.org/c/showcase/7 ·
  https://erichlof.github.io/THREE.js-PathTracing-Renderer/ ·
  https://al-ro.github.io/projects/grass/ · https://github.com/klevron/threejs-toys ·
  https://bruno-simon.com · https://github.com/CK42BB/procedural-clouds-threejs ·
  https://tympanus.net/codrops/
- Compression: https://github.com/zeux/meshoptimizer ·
  https://github.com/mrdoob/three.js/issues/27263
- Reference: https://github.com/polats/goblin-gardens (this repo's submodule)
