import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// BatchedMesh stress: many objects of DIFFERENT geometries batched into a single
// multi-draw call (the modern instancing path). Ramp the instance count.
const MAX = 50_000;

export function BatchedMeshBench({ onStats, runId }: BenchProps) {
  const group = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const filled = useRef(0);

  const { batched, geomIds } = useMemo(() => {
    // All indexed (BatchedMesh requires consistent indexing — polyhedra like
    // Icosahedron/Tetrahedron are non-indexed, so avoid them here).
    const geoms = [
      new THREE.ConeGeometry(0.5, 1, 8),
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.SphereGeometry(0.5, 12, 8),
      new THREE.TorusGeometry(0.4, 0.18, 8, 12),
      new THREE.CylinderGeometry(0.4, 0.4, 1, 10),
    ];
    let verts = 0;
    let indices = 0;
    for (const g of geoms) {
      verts += g.attributes.position!.count;
      indices += g.index ? g.index.count : 0;
    }
    const material = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
    const m = new THREE.BatchedMesh(MAX, verts, indices, material);
    m.frustumCulled = false;
    const ids = geoms.map((g) => m.addGeometry(g));
    return { batched: m, geomIds: ids };
  }, []);

  const grow = (count: number) => {
    for (let i = filled.current; i < count; i++) {
      const gid = geomIds[i % geomIds.length]!;
      const id = batched.addInstance(gid);
      const r = 9 * Math.cbrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      dummy.position.set(
        r * Math.sin(ph) * Math.cos(th),
        r * Math.sin(ph) * Math.sin(th),
        r * Math.cos(ph)
      );
      dummy.rotation.set(Math.random() * 6.28, Math.random() * 6.28, 0);
      dummy.scale.setScalar(0.35 + Math.random() * 0.4);
      dummy.updateMatrix();
      batched.setMatrixAt(id, dummy.matrix);
      batched.setColorAt(id, col.setHSL(Math.random(), 0.6, 0.55));
    }
    filled.current = Math.max(filled.current, count);
  };

  useRamp({ target: 50, step: 2500, max: MAX, start: 2500, grow, onStats, runId });

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.1;
  });

  return (
    <>
      <color attach="background" args={['#0a0d18']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} />
      <pointLight position={[-8, -4, -8]} intensity={70} color="#ffaa66" />
      <group ref={group}>
        <primitive object={batched} />
      </group>
      <OrbitControls enablePan={false} />
    </>
  );
}
