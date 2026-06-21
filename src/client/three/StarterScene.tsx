import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Phase-1 starter scene: an animated field of instanced cubes (one draw call) —
// the seed of the future "instancing" benchmark. All per-instance work happens
// imperatively inside a single useFrame (no per-frame React renders), the pattern
// the heavy benches will use. Reports a smoothed FPS up to the HUD.
const COUNT = 4000;

type Seed = {
  radius: number;
  speed: number;
  phase: number;
  y: number;
  scale: number;
  color: THREE.Color;
};

export function StarterScene({ onStats }: { onStats: (fps: number, count: number) => void }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorSet = useRef(false);
  const acc = useRef({ t: 0, frames: 0 });

  const seeds = useMemo<Seed[]>(() => {
    const arr: Seed[] = [];
    for (let i = 0; i < COUNT; i++) {
      arr.push({
        radius: 1.5 + Math.random() * 4.5,
        speed: 0.2 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        y: (Math.random() - 0.5) * 5,
        scale: 0.15 + Math.random() * 0.22,
        color: new THREE.Color().setHSL(Math.random(), 0.6, 0.55),
      });
    }
    return arr;
  }, []);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;

    if (!colorSet.current) {
      for (let i = 0; i < COUNT; i++) m.setColorAt(i, seeds[i]!.color);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      colorSet.current = true;
    }

    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i]!;
      const a = s.phase + t * s.speed;
      dummy.position.set(
        Math.cos(a) * s.radius,
        s.y + Math.sin(t * s.speed + s.phase) * 0.6,
        Math.sin(a) * s.radius
      );
      dummy.rotation.set(t * s.speed, a, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;

    const ac = acc.current;
    ac.t += delta;
    ac.frames += 1;
    if (ac.t >= 0.5) {
      onStats(Math.round(ac.frames / ac.t), COUNT);
      ac.t = 0;
      ac.frames = 0;
    }
  });

  return (
    <>
      <color attach="background" args={['#0b1020']} />
      <fog attach="fog" args={['#0b1020', 9, 22]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 6]} intensity={1.4} />
      <pointLight position={[-6, -4, -6]} intensity={40} color="#4aa3ff" />
      <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.4} metalness={0.1} toneMapped={false} />
      </instancedMesh>
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.4} />
    </>
  );
}
