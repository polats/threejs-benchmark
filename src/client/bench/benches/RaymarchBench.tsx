import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Pure-GPU raymarching: a fullscreen triangle sphere-traces a Mandelbulb (no
// geometry, no assets). Ramp the max march-steps — capacity is the step count the
// device sustains at the target FPS. A heavy, resolution/ALU-bound shader bench.
const HARD_STEPS = 260;

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

  // Mandelbulb distance estimator (power 8).
  float deBulb(vec3 p, out float trap) {
    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;
    trap = 1e10;
    for (int i = 0; i < 8; i++) {
      r = length(z);
      if (r > 2.0) break;
      float theta = acos(z.z / r);
      float phi = atan(z.y, z.x);
      dr = pow(r, 7.0) * 8.0 * dr + 1.0;
      float zr = pow(r, 8.0);
      theta *= 8.0;
      phi *= 8.0;
      z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + p;
      trap = min(trap, r);
    }
    return 0.5 * log(r) * r / dr;
  }

  vec3 calcNormal(vec3 p) {
    float t;
    vec2 e = vec2(0.0007, 0.0);
    return normalize(vec3(
      deBulb(p + e.xyy, t) - deBulb(p - e.xyy, t),
      deBulb(p + e.yxy, t) - deBulb(p - e.yxy, t),
      deBulb(p + e.yyx, t) - deBulb(p - e.yyx, t)
    ));
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;

    float a = uTime * 0.15;
    vec3 ro = vec3(cos(a) * 2.6, sin(uTime * 0.1) * 1.3, sin(a) * 2.6);
    vec3 cw = normalize(-ro);
    vec3 cu = normalize(cross(cw, vec3(0.0, 1.0, 0.0)));
    vec3 cv = cross(cu, cw);
    vec3 rd = normalize(uv.x * cu + uv.y * cv + 1.6 * cw);

    float t = 0.0;
    float trap = 1.0;
    bool hit = false;
    int used = 0;
    for (int i = 0; i < ${HARD_STEPS}; i++) {
      if (i >= uMaxSteps) break;
      used = i;
      vec3 pos = ro + rd * t;
      float d = deBulb(pos, trap);
      if (d < 0.0006 * t) { hit = true; break; }
      if (t > 6.0) break;
      t += d;
    }

    vec3 col = vec3(0.02, 0.03, 0.07) + 0.04 * rd.y;
    if (hit) {
      vec3 pos = ro + rd * t;
      vec3 n = calcNormal(pos);
      vec3 lig = normalize(vec3(0.7, 0.9, 0.5));
      float dif = clamp(dot(n, lig), 0.0, 1.0);
      float occ = 1.0 - float(used) / float(uMaxSteps);
      vec3 base = mix(vec3(0.18, 0.4, 1.0), vec3(1.0, 0.5, 0.2), clamp(trap, 0.0, 1.0));
      col = base * (0.18 + 0.82 * dif) * (0.35 + 0.65 * occ);
      col += pow(occ, 3.0) * 0.2;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function RaymarchBench({ onStats, runId }: BenchProps) {
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
          uMaxSteps: { value: 16 },
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

  useRamp({ target: 50, step: 8, max: HARD_STEPS, start: 16, grow, onStats, runId });

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
