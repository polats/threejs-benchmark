import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Pure-GPU volumetric raymarching: a fullscreen triangle marches a 3D-fbm cloud
// slab, accumulating density front-to-back with a short secondary light-march
// toward the sun for self-shadowing (Beer's law). True volumetrics (the gap the
// Mandelbulb raymarch didn't cover). Ramp the march-step budget.
const HARD_STEPS = 160;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform int uMaxSteps;
  uniform vec2 uResolution;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + vec3(1.7, 2.3, 1.1);
      a *= 0.5;
    }
    return s;
  }
  float cloud(vec3 p) {
    float base = fbm(p * 0.5 + vec3(uTime * 0.15, 0.0, uTime * 0.05));
    float slab = 1.0 - abs(p.y) * 0.85;
    return clamp(base * slab - 0.42, 0.0, 1.0);
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;

    float a = uTime * 0.07;
    vec3 ro = vec3(cos(a) * 5.0, 1.2, sin(a) * 5.0);
    vec3 cw = normalize(vec3(0.0, 0.2, 0.0) - ro);
    vec3 cu = normalize(cross(cw, vec3(0.0, 1.0, 0.0)));
    vec3 cv = cross(cu, cw);
    vec3 rd = normalize(uv.x * cu + uv.y * cv + 1.5 * cw);

    vec3 sun = normalize(vec3(0.8, 0.7, -0.2));
    vec3 col = mix(vec3(0.10, 0.16, 0.30), vec3(0.55, 0.70, 0.95), clamp(rd.y * 0.5 + 0.5, 0.0, 1.0));
    float sundot = clamp(dot(rd, sun), 0.0, 1.0);
    col += vec3(1.0, 0.8, 0.5) * pow(sundot, 80.0) * 0.6;

    float trans = 1.0;
    vec3 acc = vec3(0.0);
    float t = 2.0;
    float stepSize = 0.16;
    for (int i = 0; i < ${HARD_STEPS}; i++) {
      if (i >= uMaxSteps) break;
      vec3 pos = ro + rd * t;
      if (t > 14.0) break;
      if (abs(pos.y) < 1.4) {
        float den = cloud(pos);
        if (den > 0.01) {
          float ld = 0.0;
          vec3 lp = pos;
          for (int j = 0; j < 5; j++) {
            lp += sun * 0.25;
            ld += cloud(lp);
          }
          float shadow = exp(-ld * 0.9);
          vec3 lit = mix(vec3(0.38, 0.43, 0.55), vec3(1.0, 0.95, 0.85), shadow);
          float dt = den * stepSize * 1.6;
          acc += trans * lit * dt;
          trans *= exp(-dt * 1.4);
          if (trans < 0.02) break;
        }
      }
      t += stepSize;
    }
    col = col * trans + acc;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function VolumeCloudsBench({ onStats, runId }: BenchProps) {
  const size = useThree((s) => s.size);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
    );
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMaxSteps: { value: 40 },
          uResolution: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    []
  );

  useEffect(() => {
    (material.uniforms.uResolution!.value as THREE.Vector2).set(size.width, size.height);
  }, [size, material]);

  const grow = (steps: number) => {
    material.uniforms.uMaxSteps!.value = steps;
  };

  useRamp({ target: 50, step: 8, max: HARD_STEPS, start: 40, grow, onStats, runId });

  useFrame((state) => {
    material.uniforms.uTime!.value = state.clock.elapsedTime;
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
