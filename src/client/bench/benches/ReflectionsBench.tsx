import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, MeshReflectorMaterial } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Showcase: a glossy reflective floor (drei MeshReflectorMaterial) mirroring a
// cloud of glowing shapes, finished with bloom. The reflector re-renders the scene
// to a reflection buffer each frame.
const COUNT = 90;

function Floaters() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        radius: 2 + Math.random() * 6,
        speed: 0.1 + Math.random() * 0.5,
        phase: Math.random() * 6.28,
        y: 0.5 + Math.random() * 6,
        scale: 0.25 + Math.random() * 0.5,
        color: new THREE.Color().setHSL(Math.random(), 0.7, 0.6),
      })),
    []
  );
  const ready = useRef(false);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    if (!ready.current) {
      for (let i = 0; i < COUNT; i++) m.setColorAt(i, seeds[i]!.color);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      ready.current = true;
    }
    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i]!;
      const a = s.phase + t * s.speed;
      dummy.position.set(Math.cos(a) * s.radius, s.y + Math.sin(t + s.phase) * 0.4, Math.sin(a) * s.radius);
      dummy.rotation.set(t * s.speed, a, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <dodecahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial emissiveIntensity={1} toneMapped={false} roughness={0.3} />
    </instancedMesh>
  );
}

export function ReflectionsBench({ onStats }: BenchProps) {
  useFps(onStats);
  return (
    <>
      <color attach="background" args={['#06070f']} />
      <ambientLight intensity={0.25} />
      <pointLight position={[6, 10, 6]} intensity={140} />
      <Floaters />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]}>
        <planeGeometry args={[80, 80]} />
        <MeshReflectorMaterial
          blur={[300, 90]}
          resolution={1024}
          mixBlur={1}
          mixStrength={1.4}
          roughness={0.5}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#0a0c14"
          metalness={0.7}
        />
      </mesh>
      <EffectComposer>
        <Bloom intensity={1.1} luminanceThreshold={0.25} luminanceSmoothing={0.3} mipmapBlur />
      </EffectComposer>
      <OrbitControls enablePan={false} maxPolarAngle={Math.PI * 0.49} target={[0, 1, 0]} />
    </>
  );
}
