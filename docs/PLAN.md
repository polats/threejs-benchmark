# threejs-benchmark — Project Plan

A **Three.js benchmark + showcase suite that runs inside Reddit** via Devvit Web —
the Three.js counterpart to [`reddit-phaser`](https://github.com/polats/phaser-benchmark)
(a Phaser 4 benchmark). Each "bench" is either a stress test that **ramps a count
until FPS drops** and reports device capacity, or a fixed **showcase** scene that
demonstrates a SOTA technique.

See [`RESEARCH.md`](./RESEARCH.md) for the sourced SOTA survey behind the bench
list and the renderer/CSP decisions.

---

## 1. What we're mirroring (the `reddit-phaser` blueprint)

`reddit-phaser` established a working pattern we reuse wholesale, swapping the
engine:

- **Devvit Web app**: two iframe entrypoints in `devvit.json` — a tiny,
  dependency-free `splash.html` (inline feed view) and `game.html` (expanded
  view → React → engine).
- **React 19 shell** around the engine canvas; a typed **bench registry** drives
  a "bench bar" UI for switching scenes.
- **Server** (`@devvit/web/server`, Redis) under `src/server`; shared types in
  `src/shared`. Used to persist/report benchmark capacities and a leaderboard.
- **Bench harness**: implement `setup()` + `addObjects(n)`; the base **ramps the
  object count once/second while smoothed FPS ≥ target, then records capacity**.
- **Vite** builds client+server to `dist/`; a second config builds a standalone
  **Vercel** playground for non-Reddit demoing.
- **Deploy**: GitHub Actions — `deploy.yml` (type-check → lint → `devvit upload`
  → activate-on-subreddit **with a retry** for the "version still processing"
  race) and `vercel.yml`. Repo secrets: `DEVVIT_AUTH_TOKEN`, `VERCEL_TOKEN`,
  etc. (already present in this repo's `.env`).

## 2. Reference project: `goblin-gardens` (submodule)

`references/goblin-gardens` (the user's own project) is a **Three.js + Devvit Web
app** and the single most useful reference — it already solves the hard parts:

- **Stack**: `@react-three/fiber` + `@react-three/drei` +
  `@react-three/postprocessing` + **`@react-three/rapier`** (WASM physics) +
  `three`, plus `detect-gpu`, `r3f-perf`, `leva`, `seedrandom`. Server is
  Express; build is split `src/client` (vite) + `src/server` (vite) → `dist/`.
- **Proves WASM works under Devvit's CSP** — it ships Rapier (the compat build
  inlines the `.wasm` as base64). This retires our biggest unknown.
- **DRACO/glTF under CSP**: self-host the decoder at `/draco/` via
  `useGLTF.setDecoderPath('/draco/')` (no CDN).
- **Vendored assets**: `devvit.json` `media: { dir: "assets" }`.
- **Local dev**: a `devvit-shim.ts` aliased in for `@devvit/client` so
  `navigateTo` works outside Reddit.
- Rich physics reference under `reference-projects/rapier-js-demos` and example
  scenes (`car`, `cluster`, `attractors`, colliders…) we can mine for benches.

## 3. Key decision: render layer — **React-Three-Fiber (R3F)**

We adopt **R3F** (matching `goblin-gardens` and the pmndrs ecosystem) rather than
vanilla Three.js.

- **Why**: drei, `@react-three/postprocessing`, `@react-three/rapier`,
  `detect-gpu`, `r3f-perf`, and `leva` are exactly our bench/showcase toolkit and
  are all proven in Devvit by the reference. Massive head start.
- **Benchmark integrity**: the heavy stress benches (instancing 1M, GPGPU
  particles) do **imperative mutation inside a single `useFrame`** (mutate
  `InstancedMesh` matrices, step `GPUComputationRenderer`) — **no per-frame React
  re-renders** — so the reconciler is not in the hot path. This is standard R3F
  practice for high object counts.
- **Escape hatch**: any bench that needs raw control can mount a plain
  `WebGLRenderer` canvas instead. Not expected to be necessary for v1.

## 4. Renderer strategy (WebGL2 default, WebGPU optional)

Per research (see RESEARCH.md §1):

- **WebGL2 is the default and the floor for every bench.** It runs everywhere the
  Reddit webview runs.
- **WebGPU is usable in the Devvit iframe** (no Permissions-Policy gate; needs
  HTTPS + non-opaque origin, which Devvit satisfies) **but is not universal**
  (absent on Android System WebView) and **WebGPU compute has no WebGL2
  fallback**.
- Strategy: use `WebGPURenderer({ forceWebGL: !webgpuOk })` for a single code
  path; **default to WebGL2**; expose the one WebGPU-compute bench **only** when
  `renderer.backend.isWebGPUBackend` is true, with a WebGL2 GPGPU equivalent as
  the always-available fallback. Detect with
  `three/addons/capabilities/WebGPU.js` **and** an actual `requestAdapter()`.

## 5. Architecture / layout (target)

```
src/
  client/
    splash.html / splash.ts        # tiny inline feed view (no Three.js)
    game.html / game.tsx           # expanded view → React → R3F
    bench/
      Bench.tsx                    # harness: <Canvas>, FPS sampler, ramp controller
      useRamp.ts                   # ramp-until-FPS-drop hook (mirror of BenchScene)
      registry.ts                  # list of benches (drives the bench bar)
      renderer.ts                  # WebGL2/WebGPU detection + renderer factory
      benches/
        InstancingBench.tsx
        GpgpuBench.tsx
        ParticlesBench.tsx
        PostFxBench.tsx
        RaymarchBench.tsx
        PhysicsBench.tsx
        ... (showcase scenes)
    react/                         # bench bar, perf HUD, leaderboard UI
  server/                          # Hono or Express; capacity/leaderboard routes
  shared/                          # client/server types (capacity payloads)
public/
  draco/                           # self-hosted DRACO decoder (no CDN)
assets/                            # vendored glb / textures / splat (Devvit media dir)
references/goblin-gardens/         # submodule (reference only, not built)
docs/                              # this plan + research
.github/workflows/                 # deploy.yml (Devvit) + vercel.yml
```

## 6. Bench harness design

Mirror of `reddit-phaser`'s `BenchScene`, adapted to R3F:

- `<Bench>` owns the `<Canvas>`, a **smoothed FPS sampler** in `useFrame`, and a
  **ramp controller** (`useRamp`) that — once/second — adds `stepSize` more
  objects while `fps ≥ targetFps && count < maxCount`, else freezes and records
  capacity. Same "how many X until target FPS on this device" contract.
- Each bench provides: a scene builder, an `addObjects(n)` that mutates
  pre-allocated buffers/refs (no React churn), and metadata (name, unit, ramp
  axis) for the registry + HUD.
- Capacity + device info (`detect-gpu` tier, renderer backend) reported to the
  server for a cross-device leaderboard (reuse `reddit-phaser`'s reporting).

## 7. v1 bench suite (all four groups)

Tags: 🟢 zero-asset WebGL2 · 🟡 one small vendored asset · ⚡ WASM (proven OK via
goblin-gardens) · 🔵 WebGPU-only (gated).

**Rendering core**
- 🟢 **Instancing** — `InstancedMesh` ramp → 1M+ (+ a "1M grass blades" showcase
  variant, à la al-ro).
- 🟢 **BatchedMesh** — mixed-geometry count ramp (the modern instancing path).
- 🟢 **GPGPU particles** — `GPUComputationRenderer` boids; ramp count = WIDTH².

**Visual fidelity**
- 🟢 **Cinematic post stack** toggle — `@react-three/postprocessing` Bloom + N8AO
  + DoF + Vignette + CA; report effect-cost ΔFPS, ramp AO samples.
- 🟢 **Raymarch** — volumetric clouds (WebGL2-fallback-capable) and/or Mandelbulb;
  two-axis ramp (march steps × resolution scale).
- 🟡 **Ocean** — reflective animated water hero scene (one small normal map).

**Physics** (Rapier proven viable by goblin-gardens)
- ⚡ **Rapier** (`@react-three/rapier`) — "pile of boxes" body-count ramp (SOTA).
- 🟢 **cannon-es** — pure-JS body-count ramp (CSP-bulletproof comparison/baseline).

**Showcase (non-ramp "wow")**
- 🟡 **Gaussian splatting** — Spark or drei `<Splat>` (WebGL2-only, no
  SharedArrayBuffer); one vendored compressed splat asset. Candidate "home" scene.
- 🟡 **Animated glTF crowd** — instanced `RobotExpressive.glb` (0.44 MB, no DRACO).

**Optional, WebGPU-detected**
- 🔵 **WebGPU compute particles** (TSL, 500k+) with the WebGL2 GPGPU bench as the
  fallback shown when WebGPU is absent.

## 8. CSP / assets / WASM handling

- **No CDNs**: bundle everything via npm; vendor all assets into `assets/`
  (Devvit `media` dir) or `public/`.
- **DRACO**: self-host decoder at `public/draco/` + `setDecoderPath('/draco/')`
  (goblin-gardens pattern). **Prefer meshopt** (WASM inlined, main-thread) or
  uncompressed `.glb` to minimize decoder/worker CSP surface.
- **WASM** (Rapier): use `@dimforge/rapier3d-compat` (base64-inlined wasm).
  Proven to run in Devvit by goblin-gardens. Keep **cannon-es** as the guaranteed
  pure-JS fallback.
- **Gaussian splatting**: choose a library that does **not** require
  `SharedArrayBuffer` (Spark, or mkkellogg with `sharedMemoryForWorkers: false`)
  since the iframe is not cross-origin-isolated.
- **Local dev**: `devvit-shim.ts` for `@devvit/client` (goblin-gardens pattern).

## 9. Deploy (identical to reddit-phaser)

- `.github/workflows/deploy.yml`: type-check → lint → `devvit upload
  --just-do-it` → **activate on subreddit with the retry loop** (handles the
  "version isn't ready to be installed yet" processing race).
- `.github/workflows/vercel.yml`: build the standalone playground → Vercel.
- Secrets already in `.env`: `GITHUB_PAT`, `DEVVIT_AUTH_TOKEN`,
  `DEVVIT_DISABLE_METRICS`, `DEVVIT_SUBREDDIT`, `VERCEL_TOKEN`. Set the matching
  GitHub repo secrets. Devvit app name: `threejs-benchmark`; dev subreddit from
  `DEVVIT_SUBREDDIT`. First `devvit upload` registers the app.

## 10. Phased roadmap

0. **Plan + research + reference submodule** ← (this commit).
1. **Scaffold**: Devvit + Vite + React + R3F skeleton, splash/game/server, bench
   harness shell, both deploy workflows. Push; confirm CI deploys green.
2. **Validate in the live iframe**: WebGL2 baseline render; confirm Rapier WASM
   instantiates; probe `navigator.gpu`. (goblin-gardens implies all pass, but
   verify on the actual deployed page.)
3. **Rendering core** benches + bench bar + perf HUD + capacity reporting.
4. **Visual** (post stack, raymarch, ocean) + **Physics** (Rapier + cannon-es).
5. **Showcase** (Gaussian splat, glTF crowd); pick the default "home" scene;
   optional WebGPU compute bench.
6. Leaderboard + polish + README/AGENTS.

## 11. Open decisions (to confirm before/while scaffolding)

- **Server framework**: Hono (reddit-phaser) vs Express (goblin-gardens). Lean
  Hono for consistency with reddit-phaser; either works.
- **Default "home" scene**: Gaussian-splat showcase vs the 1M-grass/instancing
  "wow" vs a postprocessed hero. (reddit-phaser made its flagship game the home.)
- **Splat library**: Spark (`@sparkjsdev/spark`) vs drei `<Splat>` vs mkkellogg.
- **WebGPU bench**: include in v1 (gated) or defer to v2.
