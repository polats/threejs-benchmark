import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Transmission/glass stress: refractive MeshPhysicalMaterial objects over a
// colorful field they refract, lit by a procedural RoomEnvironment (no asset).
// Three renders an opaque-scene transmission buffer that the glass samples — a
// real fill + PBR cost. Ramp the glass-object count.
const MAX = 3000;
const BG = 260;

export function GlassBench({ onStats, runId }: BenchProps) {
  const { scene, gl } = useThree();
  const glass = useRef<THREE.InstancedMesh>(null);
  const bg = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const filled = useRef(0);

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        transmission: 1,
        thickness: 0.5,
        roughness: 0.05,
        ior: 1.45,
        metalness: 0,
        color: 0xffffff,
        envMapIntensity: 1,
      }),
    []
  );

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;

    const m = bg.current;
    if (m) {
      const c = new THREE.Color();
      for (let i = 0; i < BG; i++) {
        const r = 6 * Math.cbrt(Math.random());
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        dummy.position.set(
          r * Math.sin(ph) * Math.cos(th),
          r * Math.sin(ph) * Math.sin(th),
          r * Math.cos(ph)
        );
        dummy.rotation.set(Math.random() * 6.28, Math.random() * 6.28, 0);
        dummy.scale.setScalar(0.25 + Math.random() * 0.35);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        m.setColorAt(i, c.setHSL(Math.random(), 0.75, 0.55));
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [scene, gl, dummy]);

  const grow = (count: number) => {
    const m = glass.current;
    if (!m) return;
    for (let i = filled.current; i < count; i++) {
      const r = 8 * Math.cbrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      dummy.position.set(
        r * Math.sin(ph) * Math.cos(th),
        r * Math.sin(ph) * Math.sin(th),
        r * Math.cos(ph)
      );
      dummy.rotation.set(Math.random() * 6.28, Math.random() * 6.28, 0);
      dummy.scale.setScalar(0.3 + Math.random() * 0.3);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    filled.current = Math.max(filled.current, count);
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
  };

  useRamp({ target: 50, step: 200, max: MAX, start: 200, grow, onStats, runId });

  useFrame((_, delta) => {
    if (glass.current) glass.current.rotation.y += delta * 0.1;
    if (bg.current) bg.current.rotation.y -= delta * 0.04;
  });

  return (
    <>
      <color attach="background" args={['#0b0e18']} />
      <instancedMesh ref={bg} args={[undefined, undefined, BG]} frustumCulled={false}>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial toneMapped={false} roughness={0.4} metalness={0.1} />
      </instancedMesh>
      <instancedMesh ref={glass} material={material} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <icosahedronGeometry args={[0.45, 0]} />
      </instancedMesh>
      <OrbitControls enablePan={false} />
    </>
  );
}
