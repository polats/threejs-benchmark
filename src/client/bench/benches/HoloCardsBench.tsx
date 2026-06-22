import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { useRamp } from '../useRamp';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Holographic trading cards (inspired by Isaac Johnson's "Ziggy card"). Each card
// is a MeshPhysicalMaterial with iridescence + clearcoat, plus an onBeforeCompile
// patch that adds view-angle (tangent-space-ish) spectral shimmer, anisotropic
// brushed lines, and glitter — gated by a procedural foil MASK. Studio RectAreaLight
// lighting + bloom; the card(s) tilt toward the pointer so the shimmer tracks angle.
// Hero mode (1 big card + preset picker) toggles to a ramping grid (capacity = cards).
RectAreaLightUniformsLib.init();

type Preset = { name: string; hue: number; sparkle: number; aniso: number; metal: number };
const PRESETS: Preset[] = [
  { name: 'Rainbow Rare', hue: 0.0, sparkle: 1.0, aniso: 0.25, metal: 0.55 },
  { name: 'Cosmos', hue: 0.6, sparkle: 1.7, aniso: 0.1, metal: 0.7 },
  { name: 'Line Holo', hue: 0.32, sparkle: 0.4, aniso: 0.95, metal: 0.5 },
  { name: 'Reverse', hue: 0.85, sparkle: 0.8, aniso: 0.4, metal: 0.4 },
];

type Shared = {
  geo: THREE.PlaneGeometry;
  mats: THREE.MeshPhysicalMaterial[];
  textures: THREE.Texture[];
};

function makeTextures() {
  const W = 420;
  const H = 588;
  // albedo
  const ac = document.createElement('canvas');
  ac.width = W;
  ac.height = H;
  const a = ac.getContext('2d')!;
  a.fillStyle = '#e8c34a';
  a.fillRect(0, 0, W, H);
  a.fillStyle = '#1a1330';
  a.fillRect(12, 12, W - 24, H - 24);
  const g = a.createLinearGradient(0, 60, 0, 360);
  g.addColorStop(0, '#3a6ea5');
  g.addColorStop(1, '#16243f');
  a.fillStyle = g;
  a.fillRect(28, 60, W - 56, 300);
  a.font = '170px serif';
  a.textAlign = 'center';
  a.textBaseline = 'middle';
  a.fillText('🐶', W / 2, 215);
  a.fillStyle = '#0c0a1a';
  a.fillRect(28, 28, W - 56, 28);
  a.fillStyle = '#ffd86b';
  a.font = 'bold 22px sans-serif';
  a.textAlign = 'left';
  a.textBaseline = 'middle';
  a.fillText('Ziggy', 40, 43);
  a.fillStyle = '#ffffff';
  a.textAlign = 'right';
  a.fillText('HP 120', W - 40, 43);
  a.fillStyle = '#241a3a';
  a.fillRect(28, 380, W - 56, H - 410);
  a.fillStyle = '#cdd2e0';
  a.font = '15px sans-serif';
  a.textAlign = 'left';
  a.fillText('Holo Foil — view-angle shimmer', 40, 410);
  a.fillText('iridescent · clearcoat · glitter', 40, 434);
  const albedo = new THREE.CanvasTexture(ac);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = 4;

  // foil mask: white = holo region, black = matte (info box)
  const fc = document.createElement('canvas');
  fc.width = W;
  fc.height = H;
  const f = fc.getContext('2d')!;
  f.fillStyle = '#000';
  f.fillRect(0, 0, W, H);
  f.fillStyle = '#fff';
  f.fillRect(12, 12, W - 24, H - 24);
  f.fillStyle = '#000';
  f.fillRect(28, 380, W - 56, H - 410);
  const foil = new THREE.CanvasTexture(fc);
  foil.colorSpace = THREE.NoColorSpace;

  // sparkle noise
  const sc = document.createElement('canvas');
  sc.width = 256;
  sc.height = 256;
  const s = sc.getContext('2d')!;
  const img = s.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  s.putImageData(img, 0, 0);
  const sparkle = new THREE.CanvasTexture(sc);
  sparkle.wrapS = sparkle.wrapT = THREE.RepeatWrapping;
  sparkle.colorSpace = THREE.NoColorSpace;

  return { albedo, foil, sparkle };
}

const HOLO_COMMON = /* glsl */ `#include <common>
uniform sampler2D uFoil;
uniform sampler2D uSparkle;
uniform float uTime;
uniform float uHue;
uniform float uSparkleAmt;
uniform float uAniso;
vec3 holoHue(float h){ return 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }`;

const HOLO_EMISSIVE = /* glsl */ `#include <emissivemap_fragment>
{
  float foil = texture2D(uFoil, vMapUv).r;
  if (foil > 0.001) {
    vec3 V = normalize(vViewPosition);
    float fres = pow(1.0 - clamp(dot(normalize(normal), V), 0.0, 1.0), 2.0);
    float lines = sin(vMapUv.y * 240.0 + uTime * 0.6) * uAniso;
    float ang = fres * 3.0 + vMapUv.x * 1.4 + vMapUv.y * 0.5 + uHue + lines;
    vec3 rainbow = holoHue(ang);
    float spark = texture2D(uSparkle, vMapUv * 7.0 + fres * 0.4).r;
    spark = pow(spark, 6.0) * uSparkleAmt * (0.4 + fres);
    totalEmissiveRadiance += (rainbow * (0.3 + 0.7 * fres) + spark) * foil;
  }
}`;

function makeMaterials(tex: ReturnType<typeof makeTextures>) {
  return PRESETS.map((p) => {
    const m = new THREE.MeshPhysicalMaterial({
      map: tex.albedo,
      metalnessMap: tex.foil,
      metalness: p.metal,
      roughness: 0.28,
      iridescence: 0.7,
      iridescenceIOR: 1.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.2,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uFoil = { value: tex.foil };
      shader.uniforms.uSparkle = { value: tex.sparkle };
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uHue = { value: p.hue };
      shader.uniforms.uSparkleAmt = { value: p.sparkle };
      shader.uniforms.uAniso = { value: p.aniso };
      m.userData.shader = shader;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', HOLO_COMMON)
        .replace('#include <emissivemap_fragment>', HOLO_EMISSIVE);
    };
    return m;
  });
}

function Studio() {
  const { scene, gl } = useThree();
  const k1 = useRef<THREE.RectAreaLight>(null);
  const k2 = useRef<THREE.RectAreaLight>(null);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    k1.current?.lookAt(0, 0, 0);
    k2.current?.lookAt(0, 0, 0);
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);
  return (
    <>
      <ambientLight intensity={0.22} />
      <rectAreaLight ref={k1} args={[0xffffff, 9, 7, 9]} position={[5, 5, 6]} />
      <rectAreaLight ref={k2} args={[0x88bbff, 6, 7, 9]} position={[-6, 2, 5]} />
      <directionalLight position={[0, 4, 8]} intensity={0.5} />
    </>
  );
}

function Controls({ children }: { children: ReactNode }) {
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div className="holo-ui">{children}</div>
    </Html>
  );
}

function HeroMode({ onStats, shared, setMode }: BenchProps & { shared: Shared; setMode: (m: 'grid') => void }) {
  useFps(onStats);
  const [preset, setPreset] = useState(0);
  const grp = useRef<THREE.Group>(null);

  useFrame((state, dt) => {
    for (const m of shared.mats) {
      const sh = m.userData.shader as { uniforms: { uTime: THREE.IUniform } } | undefined;
      if (sh) sh.uniforms.uTime.value = state.clock.elapsedTime;
    }
    const g = grp.current;
    if (!g) return;
    const k = Math.min(1, dt * 4);
    const sway = Math.sin(state.clock.elapsedTime * 0.6) * 0.08;
    g.rotation.y += (state.pointer.x * 0.6 + sway - g.rotation.y) * k;
    g.rotation.x += (-state.pointer.y * 0.45 - g.rotation.x) * k;
  });

  return (
    <>
      <color attach="background" args={['#070810']} />
      <Studio />
      <group ref={grp} scale={2.2}>
        <mesh geometry={shared.geo} material={shared.mats[preset]!} />
      </group>
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.55} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.7} />
      </EffectComposer>
      <Controls>
        <button type="button" onClick={() => setMode('grid')}>
          ▦ grid bench
        </button>
        <div className="holo-presets">
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              type="button"
              className={i === preset ? 'on' : ''}
              onClick={() => setPreset(i)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Controls>
    </>
  );
}

function GridMode({
  onStats,
  runId,
  shared,
  setMode,
}: BenchProps & { shared: Shared; setMode: (m: 'hero') => void }) {
  const grp = useRef<THREE.Group>(null);
  const cards = useRef<THREE.Mesh[]>([]);
  const filled = useRef(0);

  const layout = () => {
    const n = cards.current.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    const sx = 2.9;
    const sy = 4.0;
    for (let i = 0; i < n; i++) {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      cards.current[i]!.position.set((cx - (cols - 1) / 2) * sx, ((rows - 1) / 2 - cy) * sy, 0);
    }
    const g = grp.current;
    if (g) {
      const scale = Math.min(1, 11 / (cols * sx));
      g.scale.setScalar(scale);
    }
  };

  const grow = (count: number) => {
    const g = grp.current;
    if (!g) return;
    for (let i = filled.current; i < count; i++) {
      const card = new THREE.Mesh(shared.geo, shared.mats[i % shared.mats.length]);
      card.frustumCulled = false;
      cards.current.push(card);
      g.add(card);
    }
    filled.current = Math.max(filled.current, count);
    layout();
  };

  useRamp({ target: 50, step: 6, max: 1000, start: 6, grow, onStats, runId });

  useFrame((state, dt) => {
    for (const m of shared.mats) {
      const sh = m.userData.shader as { uniforms: { uTime: THREE.IUniform } } | undefined;
      if (sh) sh.uniforms.uTime.value = state.clock.elapsedTime;
    }
    const g = grp.current;
    if (!g) return;
    const k = Math.min(1, dt * 3);
    g.rotation.y += (state.pointer.x * 0.4 - g.rotation.y) * k;
    g.rotation.x += (-state.pointer.y * 0.3 - g.rotation.x) * k;
  });

  return (
    <>
      <color attach="background" args={['#070810']} />
      <Studio />
      <group ref={grp} />
      <EffectComposer>
        <Bloom intensity={0.8} luminanceThreshold={0.6} mipmapBlur />
      </EffectComposer>
      <Controls>
        <button type="button" onClick={() => setMode('hero')}>
          ◆ hero card
        </button>
      </Controls>
    </>
  );
}

export function HoloCardsBench({ onStats, runId }: BenchProps) {
  const [mode, setMode] = useState<'hero' | 'grid'>('hero');
  const shared = useMemo<Shared>(() => {
    const tex = makeTextures();
    const mats = makeMaterials(tex);
    const geo = new THREE.PlaneGeometry(2.5, 3.5);
    return { geo, mats, textures: [tex.albedo, tex.foil, tex.sparkle] };
  }, []);

  useEffect(() => {
    return () => {
      shared.geo.dispose();
      shared.mats.forEach((m) => m.dispose());
      shared.textures.forEach((t) => t.dispose());
    };
  }, [shared]);

  return mode === 'hero' ? (
    <HeroMode onStats={onStats} runId={runId} shared={shared} setMode={setMode} />
  ) : (
    <GridMode onStats={onStats} runId={runId} shared={shared} setMode={setMode} />
  );
}
