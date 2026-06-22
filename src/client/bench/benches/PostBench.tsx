import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, N8AO, DepthOfField, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Advanced post-processing stress: a cinematic stack — N8AO (ambient occlusion) +
// depth of field + bloom — over a ramping field of objects. Capacity reflects the
// combined cost of the geometry and the full-screen post passes.
const MAX = 12_000;

export function PostBench({ onStats, runId }: BenchProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const filled = useRef(0);

  const grow = (count: number) => {
    const m = mesh.current;
    if (!m) return;
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
      dummy.scale.setScalar(0.18 + Math.random() * 0.22);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.setHSL(Math.random(), 0.55, 0.55));
    }
    filled.current = Math.max(filled.current, count);
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };

  useRamp({ target: 50, step: 600, max: MAX, start: 600, grow, onStats, runId });

  useFrame((_, delta) => {
    if (mesh.current) mesh.current.rotation.y += delta * 0.08;
  });

  return (
    <>
      <color attach="background" args={['#0a0c14']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 10, 6]} intensity={1.5} />
      <pointLight position={[-6, -3, -6]} intensity={50} color="#88aaff" />
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial roughness={0.5} metalness={0.1} />
      </instancedMesh>
      <EffectComposer>
        <N8AO aoRadius={0.7} intensity={2.5} halfRes />
        <DepthOfField focusDistance={0.02} focalLength={0.06} bokehScale={3} />
        <Bloom intensity={0.55} luminanceThreshold={0.6} mipmapBlur />
      </EffectComposer>
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.2} />
    </>
  );
}
