import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Ribbon trails: a swarm of movers orbiting a swirl field, each trailing a fading
// additive ribbon of its last K positions. Every frame all trail vertices/colours
// are rewritten on the CPU (the cost driver) into one LineSegments buffer. Ramp
// the trail count. (Phaser-Rope-inspired flowing strips, in 3D.)
const MAX = 5000;
const K = 16; // history length per trail
const SEG = K - 1;

type Mover = { pos: THREE.Vector3; vel: THREE.Vector3; hist: Float32Array; hue: number };

export function TrailsBench({ onStats, runId }: BenchProps) {
  const movers = useRef<Mover[]>([]);

  const lines = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * SEG * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * SEG * 2 * 3), 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ls = new THREE.LineSegments(geo, mat);
    ls.frustumCulled = false;
    return ls;
  }, []);

  const grow = (count: number) => {
    const arr = movers.current;
    for (let i = arr.length; i < count; i++) {
      const r = 4 + Math.random() * 8;
      const a = Math.random() * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 8, Math.sin(a) * r);
      const hist = new Float32Array(K * 3);
      for (let k = 0; k < K; k++) {
        hist[k * 3] = pos.x;
        hist[k * 3 + 1] = pos.y;
        hist[k * 3 + 2] = pos.z;
      }
      arr.push({ pos, vel: new THREE.Vector3(), hist, hue: Math.random() });
    }
    lines.geometry.setDrawRange(0, count * SEG * 2);
  };

  useRamp({ target: 50, step: 250, max: MAX, start: 250, grow, onStats, runId });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const arr = movers.current;
    const pos = lines.geometry.attributes.position as THREE.BufferAttribute;
    const col = lines.geometry.attributes.color as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    const tmp = new THREE.Color();
    let w = 0;

    for (let m = 0; m < arr.length; m++) {
      const mv = arr[m]!;
      // swirl field: tangential around Y + gentle pull to a torus radius + bob
      const p = mv.pos;
      const rad = Math.hypot(p.x, p.z) || 1e-3;
      const tx = -p.z / rad;
      const tz = p.x / rad;
      mv.vel.x += (tx * 6 + (6 - rad) * p.x * 0.12) * dt;
      mv.vel.z += (tz * 6 + (6 - rad) * p.z * 0.12) * dt;
      mv.vel.y += -p.y * 0.6 * dt + Math.sin(p.x * 0.5 + p.z * 0.5) * 0.4 * dt;
      mv.vel.multiplyScalar(0.96);
      p.addScaledVector(mv.vel, dt);

      // shift history down, push new head at index 0
      const h = mv.hist;
      h.copyWithin(3, 0, (K - 1) * 3);
      h[0] = p.x;
      h[1] = p.y;
      h[2] = p.z;

      tmp.setHSL(mv.hue, 0.8, 0.6);
      for (let s = 0; s < SEG; s++) {
        const a = s * 3;
        const b = (s + 1) * 3;
        // two endpoints of this segment
        pa[w * 3] = h[a]!;
        pa[w * 3 + 1] = h[a + 1]!;
        pa[w * 3 + 2] = h[a + 2]!;
        const f0 = 1 - s / SEG;
        ca[w * 3] = tmp.r * f0;
        ca[w * 3 + 1] = tmp.g * f0;
        ca[w * 3 + 2] = tmp.b * f0;
        w++;
        pa[w * 3] = h[b]!;
        pa[w * 3 + 1] = h[b + 1]!;
        pa[w * 3 + 2] = h[b + 2]!;
        const f1 = 1 - (s + 1) / SEG;
        ca[w * 3] = tmp.r * f1;
        ca[w * 3 + 1] = tmp.g * f1;
        ca[w * 3 + 2] = tmp.b * f1;
        w++;
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  useEffect(() => {
    return () => {
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
    };
  }, [lines]);

  return (
    <>
      <color attach="background" args={['#05060d']} />
      <primitive object={lines} />
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.3} />
    </>
  );
}
