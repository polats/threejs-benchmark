import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Shadow-pass stress: a field of shadow-casting objects lit by many shadow-casting
// spot lights. Ramp the light count — each shadow-caster is an extra depth pass,
// the cost driver our other benches skip entirely.
const MAX_LIGHTS = 40;
const FIELD = 160;

export function ShadowsBench({ onStats, runId }: BenchProps) {
  const field = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  const lights = useMemo(() => {
    const arr: THREE.SpotLight[] = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const hue = i / MAX_LIGHTS;
      const l = new THREE.SpotLight(new THREE.Color().setHSL(hue, 0.7, 0.5).getHex(), 90, 34, Math.PI / 6, 0.5, 1.6);
      l.castShadow = true;
      l.shadow.mapSize.set(512, 512);
      l.shadow.camera.near = 1;
      l.shadow.camera.far = 36;
      l.shadow.bias = -0.0005;
      l.visible = false;
      const target = new THREE.Object3D();
      l.target = target;
      arr.push(l);
    }
    return arr;
  }, []);

  // Build the static field of boxes once.
  useEffect(() => {
    const m = field.current;
    if (!m) return;
    const cols = 16;
    for (let i = 0; i < FIELD; i++) {
      const gx = (i % cols) - cols / 2;
      const gz = Math.floor(i / cols) - FIELD / cols / 2;
      dummy.position.set(gx * 1.4, 0.5 + Math.random() * 0.6, gz * 1.4);
      dummy.rotation.set(0, Math.random() * 6.28, 0);
      const s = 0.6 + Math.random() * 0.5;
      dummy.scale.set(s, s + Math.random(), s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.setHSL(Math.random(), 0.25, 0.7));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [dummy, col]);

  const grow = (count: number) => {
    for (let i = 0; i < MAX_LIGHTS; i++) lights[i]!.visible = i < count;
  };

  useRamp({ target: 50, step: 2, max: MAX_LIGHTS, start: 2, grow, onStats, runId });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let active = 0;
    for (const l of lights) if (l.visible) active++;
    let n = 0;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = lights[i]!;
      if (!l.visible) continue;
      const a = t * 0.3 + (n / Math.max(active, 1)) * Math.PI * 2;
      l.position.set(Math.cos(a) * 9, 7 + Math.sin(t + i) * 1.5, Math.sin(a) * 9);
      n++;
    }
  });

  return (
    <>
      <color attach="background" args={['#070a12']} />
      <fog attach="fog" args={['#070a12', 22, 48]} />
      <ambientLight intensity={0.12} />
      {lights.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      {lights.map((l, i) => (
        <primitive key={`t${i}`} object={l.target} />
      ))}
      <instancedMesh ref={field} args={[undefined, undefined, FIELD]} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} metalness={0} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0d1018" roughness={1} />
      </mesh>
      <OrbitControls enablePan={false} target={[0, 1, 0]} />
    </>
  );
}
