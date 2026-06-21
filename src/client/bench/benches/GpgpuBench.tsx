import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// GPGPU particle flow: positions live in a float texture advected each frame by a
// compute (fragment) pass, then drawn as additive points whose vertex shader reads
// the texture. Ramp the particle count (texture grows by side length). Stresses the
// GPGPU sim + point render together. WebGL2 baseline (GPUComputationRenderer).
const MAX = 1_048_576; // 1024²

const COMPUTE = /* glsl */ `
  uniform float uTime;
  uniform float uDelta;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 p = texture2D( texturePosition, uv );
    vec3 pos = p.xyz;
    float life = p.w;
    // analytic curl-ish flow field (no noise texture needed)
    vec3 v = vec3(
      sin(pos.y * 0.7 + uTime) + cos(pos.z * 0.5 + uTime * 0.3),
      sin(pos.z * 0.7 + uTime * 1.1) + cos(pos.x * 0.5),
      sin(pos.x * 0.7 + uTime * 0.9) + cos(pos.y * 0.5)
    );
    pos += v * uDelta * 1.2;
    life -= uDelta * 0.25;
    if (life <= 0.0) {
      float a = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
      float b = fract(sin(dot(uv, vec2(39.346, 11.135))) * 24634.633);
      float c = fract(sin(dot(uv, vec2(73.156, 52.235))) * 13734.123);
      pos = (vec3(a, b, c) - 0.5) * vec3(10.0, 5.0, 10.0);
      life = 0.6 + a * 0.8;
    }
    gl_FragColor = vec4(pos, life);
  }
`;

const RENDER_VERT = /* glsl */ `
  uniform sampler2D texturePosition;
  attribute vec2 reference;
  varying float vLife;
  void main() {
    vec4 p = texture2D(texturePosition, reference);
    vLife = p.w;
    vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
    gl_PointSize = clamp(55.0 / -mv.z, 1.0, 3.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const RENDER_FRAG = /* glsl */ `
  precision mediump float;
  varying float vLife;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d));
    vec3 col = mix(vec3(0.1, 0.4, 1.0), vec3(1.0, 0.5, 0.85), clamp(vLife, 0.0, 1.0));
    gl_FragColor = vec4(col, a * 0.5);
  }
`;

type Sim = {
  gpu: GPUComputationRenderer;
  posVar: ReturnType<GPUComputationRenderer['addVariable']>;
  width: number;
  uTime: THREE.IUniform;
  uDelta: THREE.IUniform;
};

export function GpgpuBench({ onStats, runId }: BenchProps) {
  const gl = useThree((s) => s.gl);
  const sim = useRef<Sim | null>(null);

  const points = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: { texturePosition: { value: null } },
      vertexShader: RENDER_VERT,
      fragmentShader: RENDER_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(new THREE.BufferGeometry(), material);
    p.frustumCulled = false;
    return p;
  }, []);

  const build = (width: number) => {
    sim.current?.gpu.dispose();

    const gpu = new GPUComputationRenderer(width, width, gl);
    const tex = gpu.createTexture();
    const data = tex.image.data as Float32Array;
    for (let i = 0; i < width * width; i++) {
      data[i * 4] = (Math.random() - 0.5) * 10;
      data[i * 4 + 1] = (Math.random() - 0.5) * 5;
      data[i * 4 + 2] = (Math.random() - 0.5) * 10;
      data[i * 4 + 3] = Math.random();
    }
    const posVar = gpu.addVariable('texturePosition', COMPUTE, tex);
    gpu.setVariableDependencies(posVar, [posVar]);
    posVar.material.uniforms.uTime = { value: 0 };
    posVar.material.uniforms.uDelta = { value: 0 };
    const err = gpu.init();
    if (err) console.error('GPGPU init error:', err);

    const n = width * width;
    const ref = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      ref[i * 2] = ((i % width) + 0.5) / width;
      ref[i * 2 + 1] = (Math.floor(i / width) + 0.5) / width;
    }
    const geo = points.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('reference', new THREE.BufferAttribute(ref, 2));

    sim.current = {
      gpu,
      posVar,
      width,
      uTime: posVar.material.uniforms.uTime!,
      uDelta: posVar.material.uniforms.uDelta!,
    };
  };

  const grow = (count: number) => {
    const width = Math.max(16, Math.ceil(Math.sqrt(count)));
    if (!sim.current || sim.current.width !== width) build(width);
    points.geometry.setDrawRange(0, Math.min(count, width * width));
  };

  useRamp({ target: 50, step: 16_384, max: MAX, start: 16_384, grow, onStats, runId });

  useFrame((state, delta) => {
    const s = sim.current;
    if (!s) return;
    s.uTime.value = state.clock.elapsedTime;
    s.uDelta.value = Math.min(delta, 0.033);
    s.gpu.compute();
    const mat = points.material as THREE.ShaderMaterial;
    mat.uniforms.texturePosition!.value = s.gpu.getCurrentRenderTarget(s.posVar).texture;
  });

  useEffect(() => {
    return () => {
      sim.current?.gpu.dispose();
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    };
  }, [points]);

  return (
    <>
      <color attach="background" args={['#04050b']} />
      <primitive object={points} />
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.3} />
    </>
  );
}
