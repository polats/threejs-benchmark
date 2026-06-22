import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Showcase: a verlet-integrated cloth (CPU) blown by wind — pinned along its top
// edge, structural + shear distance constraints relaxed several times per frame.
// WebGL2, no deps. (A WebGPU TSL-compute cloth is the future gated-tier version.)
const NX = 56; // columns
const NY = 40; // rows
const REST_X = 0.18;
const REST_Y = 0.18;
const ITER = 4;

type P = { x: number; y: number; z: number; px: number; py: number; pz: number; pin: boolean };
type C = { a: number; b: number; rest: number };

export function ClothBench({ onStats }: BenchProps) {
  useFps(onStats);
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, particles, constraints } = useMemo(() => {
    const particles: P[] = [];
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        const px = (x - (NX - 1) / 2) * REST_X;
        const py = ((NY - 1) / 2 - y) * REST_Y + 3;
        particles.push({ x: px, y: py, z: 0, px, py, pz: 0, pin: y === 0 && x % 6 === 0 });
      }
    }
    const idx = (x: number, y: number) => y * NX + x;
    const constraints: C[] = [];
    const add = (a: number, b: number) => {
      const pa = particles[a]!;
      const pb = particles[b]!;
      const rest = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
      constraints.push({ a, b, rest });
    };
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        if (x < NX - 1) add(idx(x, y), idx(x + 1, y)); // structural
        if (y < NY - 1) add(idx(x, y), idx(x, y + 1));
        if (x < NX - 1 && y < NY - 1) {
          add(idx(x, y), idx(x + 1, y + 1)); // shear
          add(idx(x + 1, y), idx(x, y + 1));
        }
      }
    }
    const geometry = new THREE.PlaneGeometry(1, 1, NX - 1, NY - 1);
    return { geometry, particles, constraints };
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x4aa3ff,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide,
      }),
    []
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const t = state.clock.elapsedTime;
    const grav = -9 * dt * dt;
    const wind = (1.6 + Math.sin(t * 1.3) * 1.4) * dt * dt;
    const windZ = Math.sin(t * 0.7) * 0.6 * dt * dt;

    // integrate
    for (const p of particles) {
      if (p.pin) continue;
      const nx = p.x + (p.x - p.px) * 0.98 + wind * (0.6 + Math.sin(p.y * 3 + t) * 0.4);
      const ny = p.y + (p.y - p.py) * 0.98 + grav;
      const nz = p.z + (p.z - p.pz) * 0.98 + windZ + wind * 0.4;
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      p.x = nx;
      p.y = ny;
      p.z = nz;
    }
    // relax constraints
    for (let k = 0; k < ITER; k++) {
      for (const c of constraints) {
        const a = particles[c.a]!;
        const b = particles[c.b]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 1e-5;
        const diff = ((d - c.rest) / d) * 0.5;
        dx *= diff;
        dy *= diff;
        dz *= diff;
        if (!a.pin) {
          a.x += dx;
          a.y += dy;
          a.z += dz;
        }
        if (!b.pin) {
          b.x -= dx;
          b.y -= dy;
          b.z -= dz;
        }
      }
    }
    // write to geometry
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!;
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <>
      <color attach="background" args={['#0a0d18']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 6]} intensity={1.7} />
      <pointLight position={[-6, 2, 6]} intensity={60} color="#ff8866" />
      <mesh ref={meshRef} geometry={geometry} material={material} />
      <OrbitControls enablePan={false} target={[0, 1.5, 0]} />
    </>
  );
}
