import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ConvexObjectBreaker } from 'three/addons/misc/ConvexObjectBreaker.js';
import RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Showcase: a cube pre-fractured into convex shards (three's ConvexObjectBreaker),
// each a Rapier convex-hull rigid body. The shards sit assembled (fixed) until a
// periodic "detonation" turns them dynamic and blasts them outward; after a beat
// they re-assemble. Loops. (Rapier is gated on its async WASM init.)
const SHARDS = 44;

type Shard = { mesh: THREE.Mesh; body: RigidBody; homePos: THREE.Vector3; homeQuat: THREE.Quaternion };

export function FractureBench(props: BenchProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void RAPIER.init().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  if (!ready) return null;
  return <FractureSim {...props} />;
}

function FractureSim({ onStats }: BenchProps) {
  useFps(onStats);
  const group = useRef<THREE.Group>(null);
  const phase = useRef({ t: 0, exploded: false });

  const sim = useMemo(() => {
    const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -3, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(24, 0.5, 24), ground);

    // Pre-fracture a cube into convex shards.
    const breaker = new ConvexObjectBreaker();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.55, metalness: 0.1 });
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 3.4), mat);
    breaker.prepareBreakableObject(boxMesh, 1, new THREE.Vector3(), new THREE.Vector3(), true);

    const pieces: THREE.Mesh[] = [boxMesh];
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    let guard = 0;
    while (pieces.length < SHARDS && guard++ < 200) {
      // split the largest-ish piece (just take the first) at a random interior point
      const target = pieces.shift()!;
      target.updateMatrixWorld(true);
      target.geometry.computeBoundingBox();
      const bb = target.geometry.boundingBox!;
      p.set(
        THREE.MathUtils.lerp(bb.min.x, bb.max.x, 0.3 + Math.random() * 0.4),
        THREE.MathUtils.lerp(bb.min.y, bb.max.y, 0.3 + Math.random() * 0.4),
        THREE.MathUtils.lerp(bb.min.z, bb.max.z, 0.3 + Math.random() * 0.4)
      ).applyMatrix4(target.matrixWorld);
      n.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      let frags: THREE.Mesh[];
      try {
        frags = breaker.subdivideByImpact(target, p, n, 1, 1) as THREE.Mesh[];
      } catch {
        frags = [];
      }
      if (frags.length >= 2) pieces.push(...frags);
      else pieces.push(target);
    }

    // Build a Rapier convex-hull body per shard (start FIXED = assembled).
    const shards: Shard[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < pieces.length; i++) {
      const mesh = pieces[i]!;
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
      const desc = RAPIER.ColliderDesc.convexHull(pos.array as Float32Array);
      if (!desc) continue;
      const homePos = mesh.position.clone();
      const homeQuat = mesh.quaternion.clone();
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(homePos.x, homePos.y, homePos.z).setRotation(homeQuat)
      );
      world.createCollider(desc.setRestitution(0.2).setDensity(1), body);
      const sm = mesh as THREE.Mesh;
      sm.material = new THREE.MeshStandardMaterial({
        color: c.setHSL(0.58 + Math.random() * 0.12, 0.5, 0.5 + Math.random() * 0.2).getHex(),
        roughness: 0.55,
        metalness: 0.1,
      });
      shards.push({ mesh: sm, body, homePos, homeQuat });
    }
    return { world, shards };
  }, []);

  // add shard meshes to the group once
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    for (const s of sim.shards) g.add(s.mesh);
    return () => {
      for (const s of sim.shards) {
        g.remove(s.mesh);
        s.mesh.geometry.dispose();
      }
    };
  }, [sim]);

  const detonate = () => {
    for (const s of sim.shards) {
      s.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      const dir = s.homePos.clone().normalize();
      const k = 6 + Math.random() * 6;
      s.body.setLinvel({ x: dir.x * k, y: dir.y * k + 4, z: dir.z * k }, true);
      s.body.setAngvel({ x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 }, true);
    }
  };

  const reassemble = () => {
    for (const s of sim.shards) {
      s.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      s.body.setTranslation({ x: s.homePos.x, y: s.homePos.y, z: s.homePos.z }, true);
      s.body.setRotation(s.homeQuat, true);
      s.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  };

  useFrame((_, delta) => {
    const ph = phase.current;
    ph.t += delta;
    if (!ph.exploded && ph.t > 1.5) {
      detonate();
      ph.exploded = true;
    } else if (ph.exploded && ph.t > 5) {
      reassemble();
      ph.exploded = false;
      ph.t = 0;
    }
    sim.world.step();
    for (const s of sim.shards) {
      const t = s.body.translation();
      const r = s.body.rotation();
      s.mesh.position.set(t.x, t.y, t.z);
      s.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  });

  return (
    <>
      <color attach="background" args={['#0a0d18']} />
      <fog attach="fog" args={['#0a0d18', 22, 50]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 14, 6]} intensity={1.7} />
      <pointLight position={[-8, 6, -8]} intensity={120} color="#ff9966" />
      <group ref={group} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]}>
        <planeGeometry args={[48, 48]} />
        <meshStandardMaterial color="#11141f" roughness={1} />
      </mesh>
      <OrbitControls enablePan={false} target={[0, 0, 0]} />
    </>
  );
}
