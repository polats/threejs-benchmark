import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Physics stress (cannon-es, pure JS — the CSP-safe baseline engine): boxes rain
// into a walled bin. Ramp the rigid-body count until the simulation can't hold
// the target FPS. An InstancedMesh mirrors the bodies each frame.
const MAX = 5000;
const HALF = 0.4;

export function PhysicsBench({ onStats, runId }: BenchProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const sim = useMemo(() => {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;

    const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);

    const wall = new CANNON.Box(new CANNON.Vec3(6, 6, 0.3));
    const walls: [number, number, number, number][] = [
      [0, 6, -6, 0],
      [0, 6, 6, 0],
      [-6, 6, 0, Math.PI / 2],
      [6, 6, 0, Math.PI / 2],
    ];
    for (const [x, y, z, ry] of walls) {
      const w = new CANNON.Body({ type: CANNON.Body.STATIC, shape: wall });
      w.position.set(x, y, z);
      w.quaternion.setFromEuler(0, ry, 0);
      world.addBody(w);
    }

    const boxShape = new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF));
    const bodies: CANNON.Body[] = [];
    return { world, boxShape, bodies };
  }, []);

  const grow = (count: number) => {
    const { world, boxShape, bodies } = sim;
    if (count < bodies.length) {
      for (const b of bodies) world.removeBody(b);
      bodies.length = 0;
    }
    while (bodies.length < count) {
      const b = new CANNON.Body({
        mass: 1,
        shape: boxShape,
        position: new CANNON.Vec3((Math.random() - 0.5) * 9, 9 + Math.random() * 10, (Math.random() - 0.5) * 9),
      });
      b.angularVelocity.set(Math.random(), Math.random(), Math.random());
      world.addBody(b);
      bodies.push(b);
    }
    if (mesh.current) mesh.current.count = count;
  };

  useRamp({ target: 50, step: 100, max: MAX, start: 100, grow, onStats, runId });

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    sim.world.step(1 / 60, Math.min(delta, 1 / 30), 3);
    const { bodies } = sim;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]!;
      dummy.position.set(b.position.x, b.position.y, b.position.z);
      dummy.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <color attach="background" args={['#0a0d18']} />
      <fog attach="fog" args={['#0a0d18', 20, 44]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 16, 6]} intensity={1.7} />
      <pointLight position={[-8, 7, -8]} intensity={140} color="#ff8a4c" />
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <boxGeometry args={[HALF * 2, HALF * 2, HALF * 2]} />
        <meshStandardMaterial color="#8fd0ff" roughness={0.5} metalness={0.1} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[13, 13]} />
        <meshStandardMaterial color="#11141f" roughness={1} />
      </mesh>
      <OrbitControls enablePan={false} target={[0, 2, 0]} />
    </>
  );
}
