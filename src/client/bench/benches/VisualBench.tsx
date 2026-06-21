import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Visual / postprocessing stress: a cloud of bright emissive shapes under a
// Bloom + Vignette stack. Ramp the emissive object count — capacity reflects the
// combined cost of the geometry and the full-screen post passes.
const MAX = 80_000;

export function VisualBench({ onStats, runId }: BenchProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const filled = useRef(0);

  const grow = (count: number) => {
    const m = mesh.current;
    if (!m) return;
    if (count < filled.current) filled.current = 0;
    for (let i = filled.current; i < count; i++) {
      const r = 9 * Math.cbrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      dummy.position.set(
        r * Math.sin(ph) * Math.cos(th),
        r * Math.sin(ph) * Math.sin(th),
        r * Math.cos(ph)
      );
      dummy.scale.setScalar(0.04 + Math.random() * 0.1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.setHSL(Math.random(), 0.9, 0.6));
    }
    filled.current = Math.max(filled.current, count);
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };

  useRamp({ target: 50, step: 2500, max: MAX, start: 2500, grow, onStats, runId });

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.1;
  });

  return (
    <>
      <color attach="background" args={['#04040b']} />
      <group ref={group}>
        <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      </group>
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.3} />
      <EffectComposer>
        <Bloom intensity={1.3} luminanceThreshold={0.2} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.85} />
      </EffectComposer>
    </>
  );
}
