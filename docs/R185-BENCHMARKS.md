# New benchmarks from three.js r185 — tracker

A **living checklist** of benchmarks/showcases to add based on the features that
shipped in **three.js r185** (we run `three@0.185.0`). Update the **Status** and
**Our bench id** columns as we implement each one.

Sources: [r185 release](https://github.com/mrdoob/three.js/releases/tag/r185) ·
[three.js examples](https://threejs.org/examples/). The headline list below is the
r/threejs r185 announcement set; the addon names are verified against our installed
`node_modules/three@0.185.0`.

> Most of these are **WebGPU**. Our existing `webgpu-particles` and `tsl-sea` benches
> already prove WebGPU works in this app (own canvas, TSL), so reuse that scaffold.
> Anything WebGPU-only should fall back to a "needs WebGPU" message like those benches.

**Status legend:** ⬜ not started · 🟡 in progress · ✅ done
**Addon:** ✅ importable from `three/addons` · ⚠️ self-contained example TSL (port the example, no reusable addon)

---

## Headline examples (priority set)

| # | r185 example | Demonstrates (new) | Addon | Closest existing bench | Status | Our bench id |
|---|---|---|---|---|---|---|
| 1 | `webgpu_lights_clustered` | Forward+ **clustered lighting** — thousands of lights stay cheap; firefly HDR sprites | ✅ `lighting/ClusteredLighting.js`, `tsl/lighting/ClusteredLightsNode.js` | Light Storm (naive forward) | ⬜ | — |
| 2 | `webgpu_skinning_instancing_individual` | **Instanced skinning** with per-instance animation — whole crowd, one draw call | ✅ core (instanced skinning) | glTF Crowd (cloned meshes) | ⬜ | — |
| 3 | `webgpu_compute_rasterizer` | **GPU-driven compute rasterizer** (Nanite-style; rasterize tris in a compute shader) | ⚠️ example TSL | — | ⬜ | — |
| 4 | `webgpu_compute_rasterizer_ibl` | Compute rasterizer **+ IBL** | ⚠️ example TSL | — | ⬜ | — |
| 5 | `webgpu_postprocessing_ssr_denoise` | **Screen-space reflections + denoising** (reflects any geometry, not just a plane) | ✅ `tsl/display/SSRNode.js`, `DenoiseNode.js`, `RecurrentDenoiseNode.js` | Reflections (planar `MeshReflectorMaterial`) | ⬜ | — |
| 6 | `webgpu_volume_fire` | **Volumetric fire** (node-based volumetric lighting/scattering) | ⚠️ example TSL | Volumetric Clouds (frag raymarch) | ⬜ | — |
| 7 | `webgpu_generator_city` | **City generator** (roads, blocks, buildings) | ✅ `generators/CityGenerator.js` | Procedural Landscape (thematic) | ⬜ | — |
| 8 | `webgpu_generator_building` | **Building/skyscraper generator** | ✅ `generators/city/SkyscraperGenerator.js`, `SidewalkGenerator.js` | — | ⬜ | — |
| 9 | `webgpu_custom_fog` | **Custom TSL fog** over procedural terrain + forest | ✅ `generators/Terrain/Forest/Tree` + TSL fog | Procedural Landscape | ⬜ | — |
| 10 | `webgpu_custom_fog_scattering` | Custom fog **+ scattering** | ✅ same + scattering | — | ⬜ | — |
| 11 | `webgpu_geometry_loft` | **LoftGeometry** — sweep a profile along a path | ✅ `geometries/LoftGeometry.js` | — | ⬜ | — |

All 11 are **new to our suite** (none currently covered).

### Suggested implementation order
1. **Clustered Lights** (✅ addon, clean ramp bench, direct foil to Light Storm)
2. **Instanced-skinning crowd** (✅, ramp character count far past glTF Crowd)
3. **SSR + denoise** (✅, modern reflections vs our planar reflector)
4. **City / Building generator** (✅, showcase; can share scene scaffold)
5. **Loft geometry** (✅, small)
6. **Compute rasterizer** ×2 and **Volume fire** (⚠️ port example TSL — most novel, most work)

---

## Secondary r185 features (not in the headline post, but real and useful)

| r185 feature | Use | Addon | Note |
|---|---|---|---|
| `StorageTexture3DNode` / `storageTexture3D` | 3D GPGPU (voxel/fluid fields) | core webgpu/tsl | extends our GPGPU story into 3D |
| `tsl/display/GTAONode.js` | TSL-native GTAO on WebGPU | ✅ | vs our `N8AO` in SSAO bench |
| `lighting/DynamicLighting.js`, `tsl/lighting/DynamicLightsNode.js` | many-lights manager | ✅ | sibling of clustered |
| `tsl/display/ImportanceSampledEnvironment.js` | importance-sampled IBL + denoise | ✅ | sharper Glass/Reflections |
| `misc/TileCreasedNormalsPlugin.js` | creased normals for tiled geo | ✅ | could improve landscape tiles |
| `MaterialLoader.registerMaterial()` / `Material.fromJSON()` | custom material (de)serialization | core | tooling |
| `RapierPhysics.applyImpulse()` | click-to-impulse interactivity | ✅ | enhance Rapier bench |
| `textureGather` / `textureGatherCompare` | faster PCF shadows / AO | core TSL | optimize Shadows bench |
| `RTTNode.setResolutionScale()` | render-to-texture scaling | core | — |

### Removed/deprecated to be aware of
- `TiledLighting` addon **removed** → use `ClusteredLighting`.
- `LWOLoader`, `DRACOLoader.setDecoderConfig()` deprecated.
- `Matrix3.scale()/.rotate()/.translate()` deprecated.

---

## How to keep this doc current
When you add a bench:
1. Flip its **Status** to 🟡 then ✅.
2. Fill **Our bench id** with the `id` used in `src/client/bench/registry.tsx`.
3. Add a one-line note if the implementation diverges from the reference example
   (e.g. WebGL fallback, reduced light count, different denoiser).
