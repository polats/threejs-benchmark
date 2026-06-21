import type { BenchDef } from './types';
import { InstancingBench } from './benches/InstancingBench';
import { ParticlesBench } from './benches/ParticlesBench';
import { GpgpuBench } from './benches/GpgpuBench';

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
];
