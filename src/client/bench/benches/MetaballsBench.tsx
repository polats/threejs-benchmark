import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Showcase: organic merging/splitting metaballs via CPU marching cubes, rendered
// as polished mercury (metal PBR under a procedural RoomEnvironment). The
// polygonization of the scalar field each frame is the cost.
const RES = 56;
const BALLS = 14;

export function MetaballsBench({ onStats }: BenchProps) {
  useFps(onStats);
  const { scene, gl } = useThree();

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0xdfe6ff, roughness: 0.08, metalness: 1 }),
    []
  );

  const mc = useMemo(() => {
    const m = new MarchingCubes(RES, material, true, false, 80_000);
    m.scale.setScalar(5);
    m.isolation = 60;
    return m;
  }, [material]);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);

  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.5;
    mc.reset();
    const strength = 1.2 / ((Math.sqrt(BALLS) + 1) * 0.45);
    for (let i = 0; i < BALLS; i++) {
      const k = i + 1;
      const x = 0.5 + 0.27 * Math.sin(t * 0.9 + k * 1.7) * Math.cos(t * 0.5 + k);
      const y = 0.5 + 0.27 * Math.cos(t * 1.1 + k * 2.1);
      const z = 0.5 + 0.27 * Math.sin(t * 0.7 + k * 0.9) * Math.sin(t * 0.6 + k);
      mc.addBall(x, y, z, strength, 12);
    }
    mc.update();
  });

  return (
    <>
      <color attach="background" args={['#0a0c16']} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} />
      <primitive object={mc} />
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.4} />
    </>
  );
}
