import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Showcase: the canonical reflective ocean (three/addons Water + procedural Sky).
// Water re-renders the scene to a reflection target each frame — a real fill +
// double-render load. Bobbing boxes float on (and reflect in) the surface.
const COUNT = 70;

type Seed = { x: number; z: number; ph: number; s: number };

function OceanScene({ onStats }: BenchProps) {
  useFps(onStats);
  const waterNormals = useTexture('textures/waternormals.jpg');
  waterNormals.wrapS = THREE.RepeatWrapping;
  waterNormals.wrapT = THREE.RepeatWrapping;

  const water = useMemo(() => {
    const w = new Water(new THREE.PlaneGeometry(10000, 10000), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: 0x001e2f,
      distortionScale: 3.7,
      fog: false,
    });
    w.rotation.x = -Math.PI / 2;
    return w;
  }, [waterNormals]);

  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(10000);
    const u = s.material.uniforms;
    u['turbidity']!.value = 10;
    u['rayleigh']!.value = 2;
    u['mieCoefficient']!.value = 0.005;
    u['mieDirectionalG']!.value = 0.8;
    return s;
  }, []);

  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo<Seed[]>(
    () =>
      Array.from({ length: COUNT }, () => ({
        x: (Math.random() - 0.5) * 70,
        z: (Math.random() - 0.5) * 70,
        ph: Math.random() * 6.28,
        s: 0.6 + Math.random() * 1.2,
      })),
    []
  );

  useEffect(() => {
    const sun = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(89); // elevation ~1°
    const theta = THREE.MathUtils.degToRad(180);
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition']!.value.copy(sun);
    water.material.uniforms['sunDirection']!.value.copy(sun).normalize();

    const m = mesh.current;
    if (m) {
      const c = new THREE.Color();
      for (let i = 0; i < COUNT; i++) m.setColorAt(i, c.setHSL(Math.random(), 0.6, 0.55));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [sky, water]);

  useFrame((state, delta) => {
    water.material.uniforms['time']!.value += delta;
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i]!;
      dummy.position.set(s.x, Math.sin(t + s.ph) * 0.7, s.z);
      dummy.rotation.set(Math.sin(t * 0.5 + s.ph) * 0.2, t * 0.2 + s.ph, 0);
      dummy.scale.setScalar(s.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={sky} />
      <primitive object={water} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[-5, 4, 2]} intensity={1.4} />
      <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <boxGeometry args={[2.4, 2.4, 2.4]} />
        <meshStandardMaterial roughness={0.35} metalness={0.25} />
      </instancedMesh>
      <OrbitControls
        enablePan={false}
        maxPolarAngle={Math.PI * 0.495}
        minDistance={12}
        maxDistance={220}
        target={[0, 0, 0]}
      />
    </>
  );
}

export function OceanBench(props: BenchProps) {
  return (
    <Suspense fallback={null}>
      <OceanScene {...props} />
    </Suspense>
  );
}
