import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Morph-target stress: each mesh blends between a base icosphere and two morph
// targets (spiky + twisted) on the GPU, with its own influences. Skinning's
// cousin — per-mesh vertex blending. Ramp the morphing-mesh count.
const MAX = 2000;

type Seed = { ph: number; sp: number };

export function MorphBench({ onStats, runId }: BenchProps) {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<THREE.Mesh[]>([]);
  const seeds = useRef<Seed[]>([]);
  const filled = useRef(0);

  const geom = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.5, 3);
    g.deleteAttribute('uv');
    const pos = g.attributes.position!;
    const spiky = pos.clone();
    const twist = pos.clone();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // spiky: displace radially by a 3D sine field (stored as a delta)
      const f = 0.7 * Math.sin(v.x * 8) * Math.sin(v.y * 8) * Math.sin(v.z * 8);
      spiky.setXYZ(i, v.x * f, v.y * f, v.z * f);
      // twist around Y (stored as a delta)
      const ang = v.y * 3.5;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      twist.setXYZ(i, v.x * c - v.z * s - v.x, 0, v.x * s + v.z * c - v.z);
    }
    g.morphAttributes.position = [spiky, twist];
    g.morphTargetsRelative = true;
    return g;
  }, []);

  const materials = useMemo(
    () =>
      Array.from(
        { length: 8 },
        (_, i) =>
          new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(i / 8, 0.6, 0.55),
            roughness: 0.4,
            metalness: 0.1,
          })
      ),
    []
  );

  const grow = (count: number) => {
    const g = group.current;
    if (!g) return;
    for (let i = filled.current; i < count; i++) {
      const m = new THREE.Mesh(geom, materials[i % materials.length]);
      const r = 7 * Math.cbrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      m.position.set(
        r * Math.sin(ph) * Math.cos(th),
        r * Math.sin(ph) * Math.sin(th),
        r * Math.cos(ph)
      );
      m.scale.setScalar(0.45 + Math.random() * 0.4);
      m.morphTargetInfluences = [0, 0];
      meshes.current.push(m);
      seeds.current.push({ ph: Math.random() * 6.28, sp: 0.5 + Math.random() });
      g.add(m);
    }
    filled.current = Math.max(filled.current, count);
  };

  useRamp({ target: 50, step: 120, max: MAX, start: 120, grow, onStats, runId });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const arr = meshes.current;
    const sd = seeds.current;
    for (let i = 0; i < arr.length; i++) {
      const inf = arr[i]!.morphTargetInfluences!;
      const s = sd[i]!;
      inf[0] = Math.sin(t * s.sp + s.ph) * 0.5 + 0.5;
      inf[1] = Math.cos(t * s.sp * 0.7 + s.ph) * 0.5 + 0.5;
    }
    if (group.current) group.current.rotation.y += 0.0015;
  });

  return (
    <>
      <color attach="background" args={['#0a0d18']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} />
      <pointLight position={[-8, -4, -8]} intensity={70} color="#66ccff" />
      <group ref={group} />
      <OrbitControls enablePan={false} />
    </>
  );
}
