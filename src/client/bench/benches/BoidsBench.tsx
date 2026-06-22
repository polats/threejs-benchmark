import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// GPGPU boids: position + velocity live in float textures; each frame a velocity
// pass applies separation / alignment / cohesion against K sampled flockmates
// (O(N·K), so it scales), then a position pass integrates. Rendered as additive
// points coloured by heading. Ramp the boid count (= texture side²).
const MAX = 90_000;

const VEL_FRAG = /* glsl */ `
  #define K 22
  uniform float uTime;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D( texturePosition, uv ).xyz;
    vec3 vel = texture2D( textureVelocity, uv ).xyz;
    float total = resolution.x * resolution.y;
    float selfIdx = floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x);

    vec3 sep = vec3(0.0);
    vec3 ali = vec3(0.0);
    vec3 coh = vec3(0.0);
    float n = 0.0;
    for (int k = 0; k < K; k++) {
      float j = mod(selfIdx + float(k + 1) * 131.0, total);
      vec2 nuv = (vec2(mod(j, resolution.x), floor(j / resolution.x)) + 0.5) / resolution.xy;
      vec3 np = texture2D(texturePosition, nuv).xyz;
      vec3 nv = texture2D(textureVelocity, nuv).xyz;
      vec3 d = pos - np;
      float dist = length(d);
      if (dist < 7.0 && dist > 0.0001) {
        sep += d / (dist * dist);
        ali += nv;
        coh += np;
        n += 1.0;
      }
    }
    if (n > 0.0) {
      ali /= n;
      coh = coh / n - pos;
      vel += sep * 0.025 + (ali - vel) * 0.012 + coh * 0.004;
    }

    float r = length(pos);
    if (r > 18.0) vel -= normalize(pos) * 0.08;

    float sp = length(vel);
    if (sp > 3.0) vel = vel / sp * 3.0;
    if (sp < 0.8) vel = vel / max(sp, 0.0001) * 0.8;

    gl_FragColor = vec4(vel, 1.0);
  }
`;

const POS_FRAG = /* glsl */ `
  uniform float uDelta;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D( texturePosition, uv ).xyz;
    vec3 vel = texture2D( textureVelocity, uv ).xyz;
    pos += vel * uDelta * 12.0;
    gl_FragColor = vec4(pos, 1.0);
  }
`;

const RENDER_VERT = /* glsl */ `
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  attribute vec2 reference;
  varying float vSpeed;
  void main() {
    vec3 p = texture2D(texturePosition, reference).xyz;
    vSpeed = length(texture2D(textureVelocity, reference).xyz);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(80.0 / -mv.z, 1.5, 4.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const RENDER_FRAG = /* glsl */ `
  precision mediump float;
  varying float vSpeed;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d));
    vec3 col = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.85, 0.4), clamp(vSpeed / 3.0, 0.0, 1.0));
    gl_FragColor = vec4(col, a * 0.9);
  }
`;

type Sim = {
  gpu: GPUComputationRenderer;
  posVar: ReturnType<GPUComputationRenderer['addVariable']>;
  velVar: ReturnType<GPUComputationRenderer['addVariable']>;
  width: number;
  uTime: THREE.IUniform;
  uDeltaP: THREE.IUniform;
};

export function BoidsBench({ onStats, runId }: BenchProps) {
  const gl = useThree((s) => s.gl);
  const sim = useRef<Sim | null>(null);

  const points = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: { texturePosition: { value: null }, textureVelocity: { value: null } },
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
    const dtPos = gpu.createTexture();
    const dtVel = gpu.createTexture();
    const pd = dtPos.image.data as Float32Array;
    const vd = dtVel.image.data as Float32Array;
    for (let i = 0; i < width * width; i++) {
      pd[i * 4] = (Math.random() - 0.5) * 20;
      pd[i * 4 + 1] = (Math.random() - 0.5) * 20;
      pd[i * 4 + 2] = (Math.random() - 0.5) * 20;
      pd[i * 4 + 3] = 1;
      vd[i * 4] = (Math.random() - 0.5) * 2;
      vd[i * 4 + 1] = (Math.random() - 0.5) * 2;
      vd[i * 4 + 2] = (Math.random() - 0.5) * 2;
      vd[i * 4 + 3] = 1;
    }
    const posVar = gpu.addVariable('texturePosition', POS_FRAG, dtPos);
    const velVar = gpu.addVariable('textureVelocity', VEL_FRAG, dtVel);
    gpu.setVariableDependencies(posVar, [posVar, velVar]);
    gpu.setVariableDependencies(velVar, [posVar, velVar]);
    posVar.material.uniforms.uDelta = { value: 0 };
    velVar.material.uniforms.uTime = { value: 0 };
    const err = gpu.init();
    if (err) console.error('Boids GPGPU init error:', err);

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
      velVar,
      width,
      uTime: velVar.material.uniforms.uTime!,
      uDeltaP: posVar.material.uniforms.uDelta!,
    };
  };

  const grow = (count: number) => {
    const width = Math.max(16, Math.ceil(Math.sqrt(count)));
    if (!sim.current || sim.current.width !== width) build(width);
    points.geometry.setDrawRange(0, Math.min(count, width * width));
  };

  useRamp({ target: 50, step: 4096, max: MAX, start: 4096, grow, onStats, runId });

  useFrame((state, delta) => {
    const s = sim.current;
    if (!s) return;
    s.uTime.value = state.clock.elapsedTime;
    s.uDeltaP.value = Math.min(delta, 0.033);
    s.gpu.compute();
    const mat = points.material as THREE.ShaderMaterial;
    mat.uniforms.texturePosition!.value = s.gpu.getCurrentRenderTarget(s.posVar).texture;
    mat.uniforms.textureVelocity!.value = s.gpu.getCurrentRenderTarget(s.velVar).texture;
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
      <color attach="background" args={['#05060d']} />
      <primitive object={points} />
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.25} />
    </>
  );
}
