import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Animated skinned-mesh crowd: clones of RobotExpressive, each with its own
// skeleton + AnimationMixer. Skinning normally forces a draw per character, so
// the body count is a real stress axis. Ramp the crowd size until FPS drops.
const MODEL = 'models/RobotExpressive.glb';
const GOOD = ['Dance', 'Running', 'Walking', 'Idle', 'Wave', 'ThumbsUp', 'Punch'];
const MAX = 1500;
const COLS = 22;

function CrowdSim({ onStats, runId }: BenchProps) {
  const gltf = useGLTF(MODEL);
  const group = useRef<THREE.Group>(null);
  const clones = useRef<{ obj: THREE.Object3D; mixer: THREE.AnimationMixer }[]>([]);

  const grow = (count: number) => {
    const g = group.current;
    if (!g) return;
    const arr = clones.current;
    while (arr.length > count) {
      const c = arr.pop()!;
      c.mixer.stopAllAction();
      g.remove(c.obj);
    }
    const pool = gltf.animations.filter((a) => GOOD.includes(a.name));
    const clips = pool.length ? pool : gltf.animations;
    while (arr.length < count && clips.length > 0) {
      const i = arr.length;
      const obj = cloneSkinned(gltf.scene);
      obj.scale.setScalar(0.3);
      obj.position.set((i % COLS) * 1.25 - (COLS * 1.25) / 2, 0, Math.floor(i / COLS) * 1.25 - 7);
      obj.rotation.y = Math.PI;
      const mixer = new THREE.AnimationMixer(obj);
      const clip = clips[i % clips.length]!;
      const act = mixer.clipAction(clip);
      act.time = Math.random() * clip.duration;
      act.play();
      g.add(obj);
      arr.push({ obj, mixer });
    }
  };

  useRamp({ target: 50, step: 25, max: MAX, start: 25, grow, onStats, runId });

  useFrame((_, delta) => {
    for (const c of clones.current) c.mixer.update(delta);
  });

  return (
    <>
      <color attach="background" args={['#0c0f1a']} />
      <fog attach="fog" args={['#0c0f1a', 16, 44]} />
      <hemisphereLight args={['#bcd0ff', '#20242e', 1.1]} />
      <directionalLight position={[8, 14, 6]} intensity={1.6} />
      <group ref={group} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[70, 50]} />
        <meshStandardMaterial color="#12151f" roughness={1} />
      </mesh>
      <OrbitControls enablePan={false} target={[0, 1, 0]} />
    </>
  );
}

export function GltfCrowdBench(props: BenchProps) {
  return (
    <Suspense fallback={null}>
      <CrowdSim {...props} />
    </Suspense>
  );
}

useGLTF.preload(MODEL);
