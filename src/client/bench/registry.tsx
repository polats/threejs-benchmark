import type { BenchDef } from './types';
import { InstancingBench } from './benches/InstancingBench';
import { ParticlesBench } from './benches/ParticlesBench';
import { GpgpuBench } from './benches/GpgpuBench';
import { VisualBench } from './benches/VisualBench';
import { RaymarchBench } from './benches/RaymarchBench';
import { PhysicsBench } from './benches/PhysicsBench';
import { RapierBench } from './benches/RapierBench';

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
    blurb: 'GPUComputationRenderer — particles advected by a flow field',
    Component: GpgpuBench,
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
];
