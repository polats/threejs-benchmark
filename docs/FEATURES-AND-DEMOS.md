# Three.js Feature Coverage & Demo Reference

What the benchmark suite currently exercises, what it doesn't, and a link-verified
list of impressive current-version Three.js demos to draw from. Companion to
[`PLAN.md`](./PLAN.md) and [`RESEARCH.md`](./RESEARCH.md).

_Latest Three.js as of this writing: **r184** (mid-2026). The strategic default is
`WebGPURenderer` + **TSL** (Three Shading Language), which auto-falls-back to
WebGL2. The suite is WebGL2 by default with an **isolated WebGPU path** (own
canvas + `WebGPURenderer`) for the two WebGPU/TSL benches._

---

## Current coverage — 20 benches across 4 groups

- **Rendering (9)**: Instancing (`InstancedMesh`) · Particles (GPU `Points` +
  custom vertex `ShaderMaterial`) · GPGPU Flow (`GPUComputationRenderer`) · WebGPU
  Particles (TSL compute, WebGPU-only) · BatchedMesh (multi-draw) · Shadows (many
  shadow-casting lights) · Fat Lines (`Line2`) · Morph Targets · 3D Text
  (`TextGeometry`).
- **Visual (6)**: Post FX Bloom · Raymarch Bulb (GLSL Mandelbulb) · TSL Sea
  (node material, WebGPU **+** WebGL2 A/B) · Glass (transmission) · Reflections
  (`MeshReflectorMaterial`) · SSAO + DoF (N8AO + depth of field + bloom).
- **Physics (2)**: cannon-es (pure JS) · Rapier (Rust/WASM).
- **Showcase (3)**: glTF Crowd (skinned animation) · Gaussian Splat (mkkellogg,
  graceful fallback where the worker is blocked) · Ocean (`Water` + `Sky`).

## Coverage — what the gap table tracked, now ✅

| Feature area | Status | Where |
|---|---|---|
| WebGPU compute shaders (`.compute()`, storage buffers) | ✅ | WebGPU Particles (160k TSL compute, gated) |
| TSL node materials (cross-compile WGSL/GLSL) | ✅ | TSL Sea (dual-backend A/B toggle) |
| BatchedMesh (multi-draw, mixed geometry) | ✅ | BatchedMesh |
| Shadows + many lights | ✅ | Shadows (ramp shadow-casting spot lights) |
| PBR transmission / glass | ✅ | Glass (`MeshPhysicalMaterial` transmission) |
| Reflections | ✅ | Reflections (`MeshReflectorMaterial`) |
| Water / ocean | ✅ | Ocean (`Water` + procedural `Sky`) + TSL Sea |
| Advanced post (SSAO/DOF/bloom) | ✅ | SSAO + DoF (N8AO + DepthOfField + Bloom) |
| Morph targets, fat lines, 3D text | ✅ | Morph Targets · Fat Lines · 3D Text |
| Volumetrics (clouds, volumetric light) | ✅ | Volumetric Clouds (raymarched 3D-fbm density + light-march scattering) |
| CSM / RectAreaLight / clustered, SSR/SSGI, decals, caustics | ❌ | not yet (lower priority) |

### WebGL2 vs WebGPU split (matters for the suite)
- **WebGPU-only**: compute shaders (`.compute()`/`computeNode`), storage buffers
  (`storage()`, `instancedArray()`), GPU sort/reduce, clustered/tiled lighting,
  render bundles. `webgpu_compute_*` examples will **not** run on WebGL2.
- **Runs on both (via TSL transpile)**: node materials (`MeshStandardNodeMaterial`,
  `colorNode`/`positionNode`/`outputNode`), most post nodes, instancing. TSL is
  what makes a single shader graph dual-target — ideal for WebGPU-vs-WebGL2 A/B.

---

## Impressive current-version demos (link-verified)

### WebGPU + TSL (latest flagship)
| Demo | URL | Feature(s) | Backend |
|---|---|---|---|
| Compute fluid (MLS-MPM) | https://threejs.org/examples/webgpu_compute_particles_fluid.html | compute + storage buffers | WebGPU-only |
| 500k compute particles | https://threejs.org/examples/webgpu_compute_particles.html | GPU compute particles | WebGPU-only |
| Compute boids | https://threejs.org/examples/webgpu_compute_birds.html | flocking in compute | WebGPU-only |
| TSL attractors particles | https://threejs.org/examples/webgpu_tsl_compute_attractors_particles.html | TSL compute | WebGPU-only |
| TSL Galaxy | https://threejs.org/examples/webgpu_tsl_galaxy.html | TSL node material | both (A/B) |
| TSL Raging Sea | https://threejs.org/examples/webgpu_tsl_raging_sea.html | procedural wave node material | both |
| TSL Procedural Terrain | https://threejs.org/examples/webgpu_tsl_procedural_terrain.html | TSL noise displacement | both |
| TSL Earth (B. Simon) | https://threejs.org/examples/webgpu_tsl_earth.html | atmosphere node material | both |
| Volumetric lighting | https://threejs.org/examples/webgpu_volume_lighting.html | volumetric raymarch + real lights | WebGPU |
| Volume cloud | https://threejs.org/examples/webgpu_volume_cloud.html | volumetric raymarching | WebGPU |
| Node bloom (selective) | https://threejs.org/examples/webgpu_postprocessing_bloom_selective.html | node post pipeline | WebGPU |
| Node AO | https://threejs.org/examples/webgpu_postprocessing_ao.html | GTAO node | WebGPU |
| BatchedMesh | https://threejs.org/examples/webgpu_mesh_batch.html | multi-draw, mixed geometry | both |

- Bruno Simon — **three.js-tsl-sandbox** (40+ TSL projects, source): https://github.com/brunosimon/three.js-tsl-sandbox
- Maxime Heckel — **Field Guide to TSL & WebGPU**: https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/
- WebGPU compute primitives: `webgpu_compute_sort_bitonic`, `webgpu_compute_reduce`, `webgpu_compute_cloth`, `webgpu_compute_water` (all on threejs.org/examples)
- Clustered/tiled lighting (many lights): `webgpu_lights_clustered` — lands in **r185** (currently dev-branch): https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_lights_clustered.html

### Custom shaders / volumetrics (WebGL2 "wow" fragment loads)
- Volumetric cloudscapes (Maxime Heckel): https://blog.maximeheckel.com/posts/real-time-cloudscapes-with-volumetric-raymarching/
- Raymarching / SDF study: https://blog.maximeheckel.com/posts/painting-with-math-a-gentle-study-of-raymarching/
- Volumetric lighting (light shafts, shadow beams): https://blog.maximeheckel.com/posts/shaping-light-volumetric-lighting-with-post-processing-and-raymarching/

### PBR glass / reflections / water
- Glass transmission (Codrops 2025): https://tympanus.net/codrops/2025/03/13/warping-3d-text-inside-a-glass-torus/
- drei MeshTransmissionMaterial: https://drei.docs.pmnd.rs/shaders/mesh-transmission-material
- drei MeshReflectorMaterial: https://drei.docs.pmnd.rs/shaders/mesh-reflector-material
- Real-time caustics: https://martinrenou.github.io/threejs-caustics/
- Ocean (canonical `Water`): https://threejs.org/examples/webgl_shaders_ocean.html

### Lights / shadows / advanced post
- Cascaded shadow maps: https://threejs.org/examples/webgl_shadowmap_csm.html
- RectAreaLight (LTC): https://threejs.org/examples/webgl_lights_rectarealight.html
- God rays: https://threejs.org/examples/webgl_postprocessing_godrays.html
- pmndrs postprocessing demo (toggle every effect): https://pmndrs.github.io/postprocessing/public/demo/
- N8AO: http://n8programs.com/n8ao/
- realism-effects (SSGI/SSR/TRAA, archived): https://github.com/0beqz/realism-effects

### Misc primitives
- Fat lines (`Line2`): https://threejs.org/examples/webgl_lines_fat.html
- Morph targets (face): https://threejs.org/examples/webgl_morphtargets_face.html
- SDF text (troika): https://protectwise.github.io/troika/troika-three-text/

---

## Next tier — advanced simulation demos (researched)

The original gap table is now fully implemented. The next "wow" tier is
simulation. Filtered for our no-CDN / no-worker / WebGL2-default constraints
(WASM physics is OK only where we already ship it — Rapier; avoid a second blob
like Ammo).

### Fracturing / destruction
- **`ConvexObjectBreaker` + Rapier** — official addon `three/addons/misc/ConvexObjectBreaker.js`;
  example https://threejs.org/examples/physics_ammo_break.html (port the breaker to
  our Rapier instead of Ammo). `subdivideByImpact()` cuts a convex mesh into shards;
  spawn a Rapier convex-hull collider per shard on impact. 🟢 WebGL2, reuses Rapier,
  no new WASM. **Highest wow.**

### Cloth
- WebGL2 path: a hand-rolled **GPGPU Verlet/PBD cloth** on our existing ping-pong-FBO
  plumbing (positions in a float texture, spring constraints in the fragment shader,
  pinned corners, breakable springs for tearing). 🟢 worker-free.
- WebGPU path: official `webgpu_compute_cloth` https://threejs.org/examples/webgpu_compute_cloth.html
  (TSL compute, WebGPU-only). Also `three-simplecloth` (capes on skinned meshes):
  https://github.com/bandinopla/three-simplecloth

### Soft bodies / jelly (WebGPU)
- **holtsetio/softbodies** — tetrahedral XPBD soft bodies in TSL compute, with
  collisions: https://github.com/holtsetio/softbodies · https://holtsetio.com/lab/softbodies/
  🔵 WebGPU-only, no worker/WASM. Genuinely novel for the WebGPU tier.

### Fluid (mostly WebGPU / heavy)
- **WebGPU-Ocean** (MLS-MPM, ~100–300k particles): https://webgpu-ocean.netlify.app/ ·
  https://github.com/matsuoka-601/webgpu-ocean — *raw WebGPU, not three; hard to port.*
  WebGL2 alt: classic GPU **2D stable-fluids smoke** (ping-pong FBO) — cheap + pretty.
- Codrops technique writeup: https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/

### Metaballs / marching cubes
- **`MarchingCubes`** addon `three/addons/objects/MarchingCubes.js`; example
  https://threejs.org/examples/webgl_marchingcubes.html — animate `addBall()` centers;
  render through our glass/transmission material for a mercury look. 🟢 WebGL2, zero
  deps/assets. **Lowest friction.**

### Rope / chains / trails
- **Rapier joint chains** (we already ship Rapier): `RopeJoint`/spherical-joint chains —
  https://github.com/pmndrs/react-three-rapier. 🟢 no new dep. Verlet rope alt:
  https://github.com/RobertoLovece/Rope-Grid

### Other sim showcases
- **GPGPU Boids** (`webgl_gpgpu_birds`) https://threejs.org/examples/webgl_gpgpu_birds.html —
  flocking on our GPGPU plumbing; scales to tens of thousands. 🟢 WebGL2.
- **Reaction–Diffusion** (Gray-Scott, ping-pong FBO): https://github.com/artemhlezin/reaction-diffusion ·
  https://pmneila.github.io/jsexp/grayscott/ — mesmerizing fill-rate stress. 🟢 WebGL2.
- **Protoplanet / n-body** (`webgl_gpgpu_protoplanet`): https://threejs.org/examples/webgl_gpgpu_protoplanet.html

### Shortlist to build next (impressiveness × feasibility)
1. **Voronoi/convex Fracture** (ConvexObjectBreaker + Rapier) — highest wow, WebGL2, reuses Rapier.
2. **Marching-Cubes Metaballs** — lowest cost, pure WebGL2, pairs with the glass material.
3. **GPGPU Boids** — flocking-at-scale, reuses our GPGPU code.
4. **WebGPU softbodies / cloth** — the novel WebGPU-tier add (holtsetio XPBD jelly and/or `webgpu_compute_cloth`).

(Lower priority / skipped: Ammo-based cloth/volume/rope/break — they force a second
vendored WASM + `wasm-unsafe-eval`; raw-WebGPU fluids — hard to port into three/R3F.)
