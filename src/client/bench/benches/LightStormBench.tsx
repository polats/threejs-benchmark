import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Many-dynamic-lights stress (Phaser-Lighting-inspired): a field of matte objects
// lit by many moving coloured point lights — NO shadow maps, so the cost is the
// forward per-fragment light loop (+ shader recompiles as the count changes),
// a different bottleneck than the shadow-pass Shadows bench. Ramp the light count.
const MAX_LIGHTS = 110;
const FIELD = 240;

export function LightStormBench({ onStats, runId }: BenchProps) {
  const field = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const lights = useMemo(() => {
    const arr: THREE.PointLight[] = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = new THREE.PointLight(new THREE.Color().setHSL(i / MAX_LIGHTS, 0.85, 0.55).getHex(), 9, 13, 2);
      l.visible = false;
      arr.push(l);
    }
    return arr;
  }, []);

  useEffect(() => {
    const m = field.current;
    if (!m) return;
    const cols = 20;
    for (let i = 0; i < FIELD; i++) {
      const gx = (i % cols) - cols / 2;
      const gz = Math.floor(i / cols) - FIELD / cols / 2;
      dummy.position.set(gx * 1.5, Math.random() * 0.6, gz * 1.5);
      dummy.rotation.set(0, Math.random() * 6.28, 0);
      const s = 0.5 + Math.random() * 0.5;
      dummy.scale.set(s, s + Math.random() * 1.2, s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  const grow = (count: number) => {
    for (let i = 0; i < MAX_LIGHTS; i++) lights[i]!.visible = i < count;
  };

  useRamp({ target: 50, step: 4, max: MAX_LIGHTS, start: 4, grow, onStats, runId });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = lights[i]!;
      if (!l.visible) continue;
      l.position.set(
        Math.sin(t * 0.6 + i * 1.7) * 13,
        2.4 + Math.sin(t * 1.3 + i) * 1.6,
        Math.cos(t * 0.5 + i * 2.3) * 13
      );
    }
  });

  return (
    <>
      <color attach="background" args={['#04050a']} />
      <ambientLight intensity={0.06} />
      {lights.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      <instancedMesh ref={field} args={[undefined, undefined, FIELD]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#cdd2dc" roughness={0.7} metalness={0} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#1a1e28" roughness={1} />
      </mesh>
      <OrbitControls enablePan={false} target={[0, 1, 0]} />
    </>
  );
}
