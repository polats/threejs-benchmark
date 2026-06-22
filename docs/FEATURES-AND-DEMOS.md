# Three.js Feature Coverage & Demo Reference

What the benchmark suite currently exercises, what it doesn't, and a link-verified
list of impressive current-version Three.js demos to draw from. Companion to
[`PLAN.md`](./PLAN.md) and [`RESEARCH.md`](./RESEARCH.md).

_Latest Three.js as of this writing: **r184** (mid-2026). The strategic default is
`WebGPURenderer` + **TSL** (Three Shading Language), which auto-falls-back to
WebGL2. Our suite is currently **WebGL2-only**._

---

## Current coverage (the 9 v1 benches)

- **Rendering**: Instancing (`InstancedMesh`), Particles (GPU `Points` + a custom
  vertex `ShaderMaterial`), GPGPU Flow (`GPUComputationRenderer`, fragment compute).
- **Visual**: Post FX Bloom (`@react-three/postprocessing`), Raymarch Bulb
  (hand-written GLSL Mandelbulb sphere-tracer).
- **Physics**: cannon-es (pure JS), Rapier (Rust/WASM).
- **Showcase**: glTF Crowd (skinned animation), Gaussian Splat (mkkellogg).

So we **do** test custom GLSL shaders (Particles, Raymarch, GPGPU) — the gaps are
in *newer / heavier* features, below.

## Coverage gaps (not tested yet)

| Feature area | Status | Notes |
|---|---|---|
| **WebGPU compute shaders** (`.compute()`, storage buffers) | ❌ | WebGPU-only; no WebGL2 path. The biggest gap. |
| **TSL node materials** (cross-compile WGSL/GLSL) | ❌ | Node-graph materials + node post-processing (`RenderPipeline`, r183) |
| **BatchedMesh** (multi-draw, mixed geometry) | ❌ | Modern instancing; we only have `InstancedMesh` |
| **Shadows + many lights** (CSM, RectAreaLight, clustered) | ❌ | We render with shadows off everywhere |
| **PBR transmission / glass / dispersion / caustics** | ❌ | `MeshPhysicalMaterial`, drei `MeshTransmissionMaterial` |
| **Reflections** (Reflector, MeshReflectorMaterial, SSR) | ❌ | Extra render passes per reflector |
| **Water / ocean** (Gerstner waves) | ❌ | Researched, never built |
| **Volumetrics** (clouds, volumetric light) | ⚠️ partial | Raymarch is a fractal, not volumetric |
| **Advanced post** (SSAO/N8AO, SSR, SSGI, DOF, god rays, TAA) | ❌ | We only do Bloom + Vignette |
| **Morph targets, fat lines, SDF text, decals** | ❌ | Whole categories untouched |

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

## Recommended additions (priority order)

1. **WebGPU + TSL group** (gated by `navigator.gpu`): a WebGPU **compute-particles**
   bench (WebGPU-only — our existing WebGL2 GPGPU Flow is the natural fallback) and
   a dual-backend **TSL** bench (Galaxy / Raging Sea) for a WebGPU-vs-WebGL2 number.
   *Integration note:* WebGPU uses `three/webgpu` + `three/tsl` and a different
   renderer; it must be isolated from the WebGL benches (which depend on
   `WebGLRenderer` — GPUComputationRenderer, drei postprocessing, mkkellogg splat).
2. **Ocean** (WebGL2, one small normal map) — fills the water gap, high wow.
3. **BatchedMesh** ramp — modern instancing counterpart to InstancedMesh, no assets.
4. **Shadows / many lights** ramp — the cost driver we completely skip.
5. **Transmission / glass** + **advanced post** (N8AO / DOF / god rays) for Visual.
