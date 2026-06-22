/* eslint-disable */
// @ts-nocheck
// Dual-backend TSL bench: a procedural ocean built from a TSL node material
// (ported from the official r178 webgpu_tsl_raging_sea). TSL node materials run on
// WebGPURenderer in EITHER backend, so this same shader graph can render on WebGPU
// or on its WebGL2 fallback (forceWebGL) — a direct A/B of the same shader. Untyped
// boundary (three/webgpu + three/tsl), so @ts-nocheck like the compute bench.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three/webgpu';
import {
  float,
  mx_noise_float,
  Loop,
  color,
  positionLocal,
  sin,
  vec2,
  vec3,
  mul,
  time,
  uniform,
  Fn,
  transformNormalToView,
} from 'three/tsl';
import type { BenchProps } from '../types';

export function WebGPUSeaBench({ onStats }: BenchProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [webgpuAvailable, setWebgpuAvailable] = useState(false);
  const [backend, setBackend] = useState(null); // 'webgpu' | 'webgl' | null

  // Detect WebGPU once; default to it when present.
  useEffect(() => {
    let alive = true;
    (async () => {
      let ok = false;
      if (navigator.gpu) {
        try {
          ok = !!(await navigator.gpu.requestAdapter());
        } catch {
          ok = false;
        }
      }
      if (!alive) return;
      setWebgpuAvailable(ok);
      setBackend(ok ? 'webgpu' : 'webgl');
    })();
    return () => {
      alive = false;
    };
  }, []);

  // (Re)build the scene + renderer whenever the chosen backend changes.
  useEffect(() => {
    if (!backend) return;
    const host = hostRef.current;
    if (!host) return;

    let renderer = null;
    let disposed = false;
    let onResize = null;
    const acc = { t: 0, frames: 0, last: performance.now() };

    (async () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;

      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 20);
      camera.position.set(1.25, 1.0, 1.25);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05060d);

      const directionalLight = new THREE.DirectionalLight('#ffffff', 3);
      directionalLight.position.set(-4, 2, 0);
      scene.add(directionalLight);

      const material = new THREE.MeshStandardNodeMaterial({ color: '#271442', roughness: 0.15 });

      const emissiveColor = uniform(color('#ff0a81'));
      const emissiveLow = uniform(-0.25);
      const emissiveHigh = uniform(0.2);
      const emissivePower = uniform(7);
      const largeWavesFrequency = uniform(vec2(3, 1));
      const largeWavesSpeed = uniform(1.25);
      const largeWavesMultiplier = uniform(0.15);
      const smallWavesIterations = uniform(3);
      const smallWavesFrequency = uniform(2);
      const smallWavesSpeed = uniform(0.3);
      const smallWavesMultiplier = uniform(0.18);
      const normalComputeShift = uniform(0.01);

      const wavesElevation = Fn(([position]) => {
        const elevation = mul(
          sin(position.x.mul(largeWavesFrequency.x).add(time.mul(largeWavesSpeed))),
          sin(position.z.mul(largeWavesFrequency.y).add(time.mul(largeWavesSpeed))),
          largeWavesMultiplier
        ).toVar();

        Loop({ start: float(1), end: smallWavesIterations.add(1) }, ({ i }) => {
          const noiseInput = vec3(
            position.xz.add(2).mul(smallWavesFrequency).mul(i),
            time.mul(smallWavesSpeed)
          );
          const wave = mx_noise_float(noiseInput, 1, 0).mul(smallWavesMultiplier).div(i).abs();
          elevation.subAssign(wave);
        });

        return elevation;
      });

      const elevation = wavesElevation(positionLocal);
      const position = positionLocal.add(vec3(0, elevation, 0));
      material.positionNode = position;

      let positionA = positionLocal.add(vec3(normalComputeShift, 0, 0));
      let positionB = positionLocal.add(vec3(0, 0, normalComputeShift.negate()));
      positionA = positionA.add(vec3(0, wavesElevation(positionA), 0));
      positionB = positionB.add(vec3(0, wavesElevation(positionB), 0));
      const toA = positionA.sub(position).normalize();
      const toB = positionB.sub(position).normalize();
      const normal = toA.cross(toB);
      material.normalNode = transformNormalToView(normal);

      const emissive = elevation.remap(emissiveHigh, emissiveLow).pow(emissivePower);
      material.emissiveNode = emissiveColor.mul(emissive);

      const geometry = new THREE.PlaneGeometry(2, 2, 256, 256);
      geometry.rotateX(-Math.PI * 0.5);
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: backend === 'webgl' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      try {
        await renderer.init();
      } catch {
        return;
      }
      if (disposed) {
        renderer.dispose();
        return;
      }
      host.appendChild(renderer.domElement);

      const animate = async () => {
        if (disposed || !renderer) return;
        const a = performance.now() * 0.0001;
        camera.position.set(Math.cos(a) * 1.7, 0.95, Math.sin(a) * 1.7);
        camera.lookAt(0, -0.22, 0);
        await renderer.renderAsync(scene, camera);

        const now = performance.now();
        const dt = (now - acc.last) / 1000;
        acc.last = now;
        acc.t += dt;
        acc.frames += 1;
        if (acc.t >= 0.5) {
          onStats({ fps: Math.round(acc.frames / acc.t), count: 0, done: false, capacity: 0 });
          acc.t = 0;
          acc.frames = 0;
        }
      };
      renderer.setAnimationLoop(animate);

      onResize = () => {
        if (!renderer) return;
        const nw = host.clientWidth || window.innerWidth;
        const nh = host.clientHeight || window.innerHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener('resize', onResize);
    })();

    return () => {
      disposed = true;
      if (onResize) window.removeEventListener('resize', onResize);
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.domElement?.remove();
        renderer.dispose();
      }
    };
  }, [backend, onStats]);

  return (
    <div ref={hostRef} className="webgpu-host">
      <div className="backend-badge">
        backend: <b>{backend === 'webgl' ? 'WebGL2' : backend === 'webgpu' ? 'WebGPU' : '…'}</b>
        {webgpuAvailable ? (
          <button
            type="button"
            className="backend-switch"
            onClick={() => setBackend((b) => (b === 'webgpu' ? 'webgl' : 'webgpu'))}
          >
            switch to {backend === 'webgpu' ? 'WebGL2' : 'WebGPU'}
          </button>
        ) : (
          <span className="backend-note"> · no WebGPU here (WebGL2 fallback)</span>
        )}
      </div>
    </div>
  );
}
