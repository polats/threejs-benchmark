import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Physics stress (Rapier — the SOTA Rust/WASM engine; the -compat build inlines
// its .wasm as base64 so it bundles cleanly under Devvit's CSP). Boxes rain into a
// walled bin; ramp the rigid-body count. Far higher capacity than cannon-es.
const MAX = 15_000;
const HALF = 0.4;

// Rapier needs an async WASM init; gate the sim until it resolves.
export function RapierBench(props: BenchProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void RAPIER.init().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!ready) return null;
  return <RapierSim {...props} />;
}

function RapierSim({ onStats, runId }: BenchProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const sim = useMemo(() => {
    const world = new RAPIER.World({ x: 0, y: -16, z: 0 });

    const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.cuboid(6, 0.2, 6), floor);

    const walls: [number, number, number, number, number, number][] = [
      [0, 4, -6, 6, 4, 0.3],
      [0, 4, 6, 6, 4, 0.3],
      [-6, 4, 0, 0.3, 4, 6],
      [6, 4, 0, 0.3, 4, 6],
    ];
    for (const [px, py, pz, hx, hy, hz] of walls) {
      const wb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz));
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), wb);
    }

    const bodies: RigidBody[] = [];
    return { world, bodies };
  }, []);

  const grow = (count: number) => {
    const { world, bodies } = sim;
    if (count < bodies.length) {
      for (const b of bodies) world.removeRigidBody(b);
      bodies.length = 0;
    }
    while (bodies.length < count) {
      const x = (Math.random() - 0.5) * 9;
      const y = 8 + Math.random() * 14;
      const z = (Math.random() - 0.5) * 9;
      const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z));
      world.createCollider(RAPIER.ColliderDesc.cuboid(HALF, HALF, HALF).setRestitution(0.1), b);
      bodies.push(b);
    }
    if (mesh.current) mesh.current.count = count;
  };

  useRamp({ target: 50, step: 250, max: MAX, start: 250, grow, onStats, runId });

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    sim.world.step();
    const { bodies } = sim;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]!;
      const t = b.translation();
      const r = b.rotation();
      dummy.position.set(t.x, t.y, t.z);
      dummy.quaternion.set(r.x, r.y, r.z, r.w);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <color attach="background" args={['#0a0d18']} />
      <fog attach="fog" args={['#0a0d18', 20, 46]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 16, 6]} intensity={1.7} />
      <pointLight position={[-8, 7, -8]} intensity={140} color="#9c7bff" />
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <boxGeometry args={[HALF * 2, HALF * 2, HALF * 2]} />
        <meshStandardMaterial color="#a0e0ff" roughness={0.5} metalness={0.1} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#11141f" roughness={1} />
      </mesh>
      <OrbitControls enablePan={false} target={[0, 2, 0]} />
    </>
  );
}
