import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// InstancedMesh stress: one draw call, ramp the instance count. Matrices/colors
// are filled once as instances are revealed; the whole field just rotates each
// frame, so the FPS reflects the GPU cost of drawing N instances (not CPU work).
const MAX = 300_000;

export function InstancingBench({ onStats, runId }: BenchProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const filled = useRef(0);

  const grow = (count: number) => {
    const m = mesh.current;
    if (!m) return;
    if (count < filled.current) filled.current = 0; // restart: refill from 0
    for (let i = filled.current; i < count; i++) {
      const r = 7 * Math.cbrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      dummy.position.set(
        r * Math.sin(ph) * Math.cos(th),
        r * Math.sin(ph) * Math.sin(th),
        r * Math.cos(ph)
      );
      dummy.rotation.set(Math.random() * 6.28, Math.random() * 6.28, 0);
      dummy.scale.setScalar(0.07 + Math.random() * 0.12);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.setHSL(Math.random(), 0.6, 0.55));
    }
    filled.current = Math.max(filled.current, count);
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };

  useRamp({ target: 50, step: 5000, max: MAX, start: 5000, grow, onStats, runId });

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.12;
  });

  return (
    <>
      <color attach="background" args={['#0a0d18']} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} />
      <pointLight position={[-8, -4, -8]} intensity={80} color="#4aa3ff" />
      <group ref={group}>
        <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial roughness={0.45} metalness={0.1} toneMapped={false} />
        </instancedMesh>
      </group>
      <OrbitControls enablePan={false} />
    </>
  );
}
