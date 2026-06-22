/* eslint-disable */
// @ts-nocheck
// WebGPU compute-particle bench. `three/webgpu` + `three/tsl` ship no TS types and
// the fluent TSL node API resists typing, so this file is an untyped boundary
// (like the Phaser project's Box2D facade). Logic mirrors the official r178
// `webgpu_compute_particles` example.
//
// This bench is ISOLATED from the R3F/WebGL canvas: it owns its own <canvas> and
// WebGPURenderer, because `three/webgpu` has no WebGLRenderer and can't coexist
// with the GPGPU/postprocessing benches that depend on it. Gated by a WebGPU
// capability check — falls back to a message where WebGPU is unavailable.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three/webgpu';
import { Fn, If, uniform, float, uv, vec3, hash, shapeCircle, instancedArray, instanceIndex } from 'three/tsl';
import type { BenchProps } from '../types';

const PARTICLE_COUNT = 160_000;

export function WebGPUParticlesBench({ onStats }: BenchProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('init'); // 'init' | 'running' | 'unsupported'

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer = null;
    let disposed = false;
    let onResize = null;
    const acc = { t: 0, frames: 0, last: performance.now() };

    (async () => {
      // Capability check — compute has no WebGL2 fallback, so require WebGPU.
      const gpu = navigator.gpu;
      if (!gpu) {
        setStatus('unsupported');
        return;
      }
      try {
        const adapter = await gpu.requestAdapter();
        if (!adapter) {
          setStatus('unsupported');
          return;
        }
      } catch {
        setStatus('unsupported');
        return;
      }

      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;

      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
      camera.position.set(0, 6, 24);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05060d);

      const positions = instancedArray(PARTICLE_COUNT, 'vec3');
      const velocities = instancedArray(PARTICLE_COUNT, 'vec3');
      const colors = instancedArray(PARTICLE_COUNT, 'vec3');

      const gravity = uniform(-0.0016);
      const friction = uniform(0.99);
      const bounce = uniform(0.78);
      const size = uniform(0.11);

      const amount = Math.sqrt(PARTICLE_COUNT);
      const separation = 0.18;
      const offset = float(amount / 2);

      const computeInit = Fn(() => {
        const position = positions.element(instanceIndex);
        const color = colors.element(instanceIndex);
        const x = instanceIndex.mod(amount);
        const z = instanceIndex.div(amount);
        position.x = offset.sub(x).mul(separation);
        position.y = float(6).add(hash(instanceIndex).mul(10));
        position.z = offset.sub(z).mul(separation);
        color.x = hash(instanceIndex);
        color.y = hash(instanceIndex.add(2));
        color.z = float(1);
      })().compute(PARTICLE_COUNT);

      const computeUpdate = Fn(() => {
        const position = positions.element(instanceIndex);
        const velocity = velocities.element(instanceIndex);
        velocity.addAssign(vec3(0, gravity, 0));
        position.addAssign(velocity);
        velocity.mulAssign(friction);
        If(position.y.lessThan(0), () => {
          position.y = 0;
          velocity.y = velocity.y.negate().mul(bounce);
          velocity.x = velocity.x.mul(0.92);
          velocity.z = velocity.z.mul(0.92);
        });
      });
      const computeParticles = computeUpdate().compute(PARTICLE_COUNT);

      const material = new THREE.SpriteNodeMaterial();
      material.colorNode = uv().mul(colors.element(instanceIndex));
      material.positionNode = positions.toAttribute();
      material.scaleNode = size;
      material.opacityNode = shapeCircle();
      material.alphaToCoverage = true;
      material.transparent = true;

      const particles = new THREE.Sprite(material);
      particles.count = PARTICLE_COUNT;
      particles.frustumCulled = false;
      scene.add(particles);

      renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      try {
        await renderer.init();
      } catch {
        setStatus('unsupported');
        return;
      }
      if (disposed) {
        renderer.dispose();
        return;
      }
      if (!renderer.backend?.isWebGPUBackend) {
        // fell back to WebGL2 — compute won't run; show the message.
        setStatus('unsupported');
        renderer.dispose();
        return;
      }

      host.appendChild(renderer.domElement);
      setStatus('running');
      await renderer.computeAsync(computeInit);

      const animate = async () => {
        if (disposed || !renderer) return;
        const t = performance.now() * 0.00008;
        camera.position.set(Math.cos(t) * 24, 7, Math.sin(t) * 24);
        camera.lookAt(0, -3, 0);
        await renderer.computeAsync(computeParticles);
        await renderer.renderAsync(scene, camera);

        const now = performance.now();
        const dt = (now - acc.last) / 1000;
        acc.last = now;
        acc.t += dt;
        acc.frames += 1;
        if (acc.t >= 0.5) {
          onStats({ fps: Math.round(acc.frames / acc.t), count: PARTICLE_COUNT, done: false, capacity: 0 });
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
  }, [onStats]);

  return (
    <div ref={hostRef} className="webgpu-host">
      {status === 'unsupported' ? (
        <div className="webgpu-msg">
          WebGPU isn’t available here.
          <br />
          <span>
            This bench needs a WebGPU-capable browser (Chrome/Edge, or Safari 26+). The WebGL2 “GPGPU
            Flow” bench is the equivalent fallback.
          </span>
        </div>
      ) : null}
    </div>
  );
}
