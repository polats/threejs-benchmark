import type { BenchDef } from './types';
import { InstancingBench } from './benches/InstancingBench';
import { ParticlesBench } from './benches/ParticlesBench';
import { GpgpuBench } from './benches/GpgpuBench';
import { VisualBench } from './benches/VisualBench';
import { RaymarchBench } from './benches/RaymarchBench';
import { PhysicsBench } from './benches/PhysicsBench';
import { RapierBench } from './benches/RapierBench';
import { GltfCrowdBench } from './benches/GltfCrowdBench';
import { SplatBench } from './benches/SplatBench';
import { WebGPUParticlesBench } from './benches/WebGPUParticlesBench';
import { WebGPUSeaBench } from './benches/WebGPUSeaBench';

// The bench bar reads this list. Add a bench: implement it (extend the harness via
// useRamp) and register it here.
export const BENCHES: BenchDef[] = [
  {
    id: 'instancing',
    label: 'Instancing',
    unit: 'cubes',
    group: 'render',
    blurb: 'InstancedMesh — one draw call, ramp the instance count',
    Component: InstancingBench,
  },
  {
    id: 'particles',
    label: 'Particles',
    unit: 'points',
    group: 'render',
    blurb: 'GPU Points — raw point throughput, vertex-animated',
    Component: ParticlesBench,
  },
  {
    id: 'gpgpu',
    label: 'GPGPU Flow',
    unit: 'particles',
    group: 'render',
    blurb: 'GPUComputationRenderer — particles advected by a flow field (WebGL2)',
    Component: GpgpuBench,
  },
  {
    id: 'webgpu-particles',
    label: 'WebGPU Particles',
    unit: 'particles',
    group: 'render',
    blurb: '160k particles in a TSL compute shader — WebGPU only (falls back to a message)',
    showcase: true,
    webgpu: true,
    Component: WebGPUParticlesBench,
  },
  {
    id: 'postfx',
    label: 'Post FX Bloom',
    unit: 'emitters',
    group: 'visual',
    blurb: 'Emissive shapes under a Bloom + Vignette stack — ramp the count',
    Component: VisualBench,
  },
  {
    id: 'raymarch',
    label: 'Raymarch Bulb',
    unit: 'steps',
    group: 'visual',
    blurb: 'Fullscreen Mandelbulb sphere-tracer — ramp the march steps',
    Component: RaymarchBench,
  },
  {
    id: 'tsl-sea',
    label: 'TSL Sea',
    unit: '',
    group: 'visual',
    blurb: 'Procedural ocean via a TSL node material — runs on WebGPU + WebGL2; toggle to compare',
    showcase: true,
    webgpu: true,
    Component: WebGPUSeaBench,
  },
  {
    id: 'physics-cannon',
    label: 'Physics (cannon)',
    unit: 'bodies',
    group: 'physics',
    blurb: 'cannon-es (pure JS) rigid bodies raining into a bin',
    Component: PhysicsBench,
  },
  {
    id: 'physics-rapier',
    label: 'Physics (Rapier)',
    unit: 'bodies',
    group: 'physics',
    blurb: 'Rapier (Rust/WASM) rigid bodies — far higher body counts',
    Component: RapierBench,
  },
  {
    id: 'crowd',
    label: 'glTF Crowd',
    unit: 'characters',
    group: 'showcase',
    blurb: 'Animated skinned RobotExpressive crowd — ramp the character count',
    Component: GltfCrowdBench,
  },
  {
    id: 'splat',
    label: 'Gaussian Splat',
    unit: 'splats',
    group: 'showcase',
    blurb: '3D Gaussian splatting (drei <Splat>) — a photoreal capture',
    showcase: true,
    Component: SplatBench,
  },
];
