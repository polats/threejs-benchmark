import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Raw GPU point throughput: a single THREE.Points, ramp the draw range. Each
// point is animated in the VERTEX shader (no per-frame CPU), with a fixed small
// point size so capacity reflects point count, not fill-rate.
const MAX = 2_000_000;

const VERT = /* glsl */ `
  uniform float uTime;
  attribute float seed;
  varying float vSeed;
  void main() {
    vSeed = seed;
    float a = seed * 6.2831853 + uTime * (0.15 + seed * 0.35);
    float wobble = sin(uTime * 0.6 + seed * 40.0) * 0.4;
    vec3 p = position;
    // swirl around Y plus a gentle radial breathe
    float c = cos(a), s = sin(a);
    vec3 q = vec3(p.x * c - p.z * s, p.y + wobble, p.x * s + p.z * c);
    vec4 mv = modelViewMatrix * vec4(q, 1.0);
    gl_PointSize = clamp(55.0 / -mv.z, 1.0, 3.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying float vSeed;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d));
    vec3 col = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.55, 0.9), fract(vSeed * 3.0));
    gl_FragColor = vec4(col, a * 0.5);
  }
`;

export function ParticlesBench({ onStats, runId }: BenchProps) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX * 3);
    const seed = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
      const r = 4 + Math.random() * 4;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.5;
      pos[i * 3 + 2] = r * Math.cos(ph);
      seed[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    g.setDrawRange(0, 0);
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  const grow = (count: number) => geometry.setDrawRange(0, count);

  useRamp({ target: 50, step: 40_000, max: MAX, start: 40_000, grow, onStats, runId });

  useFrame((state) => {
    material.uniforms.uTime!.value = state.clock.elapsedTime;
  });

  return (
    <>
      <color attach="background" args={['#05060d']} />
      <points geometry={geometry} material={material} frustumCulled={false} />
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.25} />
    </>
  );
}
