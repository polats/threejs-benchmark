import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { useRamp } from '../useRamp';
import { useFps } from '../useFps';
import type { BenchProps } from '../types';

// Holographic trading cards (inspired by Isaac Johnson's "Ziggy card"). A laminated
// rounded card (dark core + holo front) whose foil is a MeshPhysicalMaterial
// (iridescence + clearcoat + a procedural normal map for micro-relief) plus an
// onBeforeCompile patch that layers reflection-driven iridescence, fine diffraction
// streaks, brushed lines, twinkling glitter and a glare sweep — all gated by a foil
// MASK. Studio RectAreaLights + bloom; cards tilt to the pointer so the holo tracks
// the angle. Hero card (4 presets) toggles to a ramping grid (capacity = cards).
RectAreaLightUniformsLib.init();

const CW = 2.5;
const CH = 3.5;
const RAD = 0.18;

type Preset = { name: string; hue: number; sparkle: number; aniso: number; metal: number };
const PRESETS: Preset[] = [
  { name: 'Rainbow Rare', hue: 0.0, sparkle: 1.1, aniso: 0.25, metal: 0.6 },
  { name: 'Cosmos', hue: 0.62, sparkle: 1.8, aniso: 0.08, metal: 0.75 },
  { name: 'Line Holo', hue: 0.32, sparkle: 0.35, aniso: 1.0, metal: 0.5 },
  { name: 'Reverse', hue: 0.85, sparkle: 0.9, aniso: 0.45, metal: 0.45 },
];

type Shared = {
  front: THREE.ShapeGeometry;
  core: THREE.ExtrudeGeometry;
  mats: THREE.MeshPhysicalMaterial[];
  coreMat: THREE.MeshStandardMaterial;
  textures: THREE.Texture[];
};

function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// ShapeGeometry UVs are in world units — remap to 0..1 so the card textures map.
function remapUV(geo: THREE.BufferGeometry, w: number, h: number) {
  const pos = geo.attributes.position!;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + w / 2) / w;
    uv[i * 2 + 1] = (pos.getY(i) + h / 2) / h;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function makeTextures() {
  const W = 512;
  const H = 716;

  // ---------- albedo ----------
  const ac = document.createElement('canvas');
  ac.width = W;
  ac.height = H;
  const a = ac.getContext('2d')!;
  // gold frame + bevel
  const gold = a.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#f6d365');
  gold.addColorStop(0.5, '#c9972f');
  gold.addColorStop(1, '#f9e08a');
  a.fillStyle = gold;
  a.fillRect(0, 0, W, H);
  a.strokeStyle = 'rgba(255,255,255,0.5)';
  a.lineWidth = 3;
  rr(a, 10, 10, W - 20, H - 20, 22);
  a.stroke();
  // dark inner
  a.fillStyle = '#15102b';
  rr(a, 26, 26, W - 52, H - 52, 16);
  a.fill();

  // name bar
  a.fillStyle = '#0c0a1a';
  rr(a, 42, 40, W - 84, 46, 10);
  a.fill();
  a.fillStyle = '#ffd86b';
  a.font = 'bold 26px sans-serif';
  a.textAlign = 'left';
  a.textBaseline = 'middle';
  a.fillText('Ziggy', 58, 64);
  a.fillStyle = '#ff6b6b';
  a.beginPath();
  a.arc(W - 120, 63, 9, 0, 7);
  a.fill();
  a.fillStyle = '#ffffff';
  a.font = 'bold 24px sans-serif';
  a.textAlign = 'right';
  a.fillText('HP 120', W - 58, 64);

  // art window — cosmic gradient + stars + subtle holo stripes + dog
  const ax = 46;
  const ay = 100;
  const aw = W - 92;
  const ah = 360;
  const sky = a.createRadialGradient(W / 2, ay + 150, 30, W / 2, ay + 150, 320);
  sky.addColorStop(0, '#5b6ff0');
  sky.addColorStop(0.5, '#2a2f6b');
  sky.addColorStop(1, '#0c0a22');
  a.save();
  rr(a, ax, ay, aw, ah, 10);
  a.clip();
  a.fillStyle = sky;
  a.fillRect(ax, ay, aw, ah);
  // faint holo diagonal stripes
  a.globalAlpha = 0.06;
  for (let i = -20; i < 40; i++) {
    a.fillStyle = i % 2 ? '#ffffff' : '#7fd8ff';
    a.fillRect(ax + i * 22, ay, 11, ah);
  }
  a.globalAlpha = 1;
  // stars
  for (let i = 0; i < 90; i++) {
    a.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
    const r = Math.random() * 1.6 + 0.4;
    a.beginPath();
    a.arc(ax + Math.random() * aw, ay + Math.random() * ah, r, 0, 7);
    a.fill();
  }
  // glow + dog
  const glow = a.createRadialGradient(W / 2, ay + 175, 10, W / 2, ay + 175, 150);
  glow.addColorStop(0, 'rgba(255,240,200,0.5)');
  glow.addColorStop(1, 'rgba(255,240,200,0)');
  a.fillStyle = glow;
  a.fillRect(ax, ay, aw, ah);
  a.font = '200px serif';
  a.textAlign = 'center';
  a.textBaseline = 'middle';
  a.fillText('🐶', W / 2, ay + 180);
  a.restore();
  a.strokeStyle = 'rgba(255,255,255,0.25)';
  a.lineWidth = 2;
  rr(a, ax, ay, aw, ah, 10);
  a.stroke();

  // attack box
  a.fillStyle = '#241a3a';
  rr(a, 42, 480, W - 84, 150, 10);
  a.fill();
  // energy pips
  const pipColors = ['#ffd86b', '#7fd8ff', '#ff9ed8'];
  for (let i = 0; i < 3; i++) {
    a.fillStyle = pipColors[i]!;
    a.beginPath();
    a.arc(64 + i * 26, 512, 10, 0, 7);
    a.fill();
  }
  a.fillStyle = '#ffffff';
  a.font = 'bold 22px sans-serif';
  a.textAlign = 'left';
  a.fillText('Prism Beam', 150, 512);
  a.textAlign = 'right';
  a.fillText('90', W - 58, 512);
  a.fillStyle = '#b9c0d6';
  a.font = '15px sans-serif';
  a.fillText('Flip a coin. If heads, the foil shimmers brighter', 64, 552);
  a.fillText('and dazzles the defending Pokémon (it can’t attack).', 64, 574);

  // footer
  a.fillStyle = '#ffe08a';
  a.font = '18px sans-serif';
  a.fillText('★ ULTRA RARE', 46, 672);
  a.textAlign = 'right';
  a.fillStyle = '#cdd2e0';
  a.fillText('001 / 151', W - 46, 672);

  const albedo = new THREE.CanvasTexture(ac);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = 8;

  // ---------- foil mask (white = holo) ----------
  const fc = document.createElement('canvas');
  fc.width = W;
  fc.height = H;
  const f = fc.getContext('2d')!;
  f.fillStyle = '#000';
  f.fillRect(0, 0, W, H);
  f.fillStyle = '#fff';
  rr(f, 26, 26, W - 52, H - 52, 16); // whole inner card is foil
  f.fill();
  f.fillStyle = '#000'; // matte: text boxes
  rr(f, 42, 40, W - 84, 46, 10);
  f.fill();
  rr(f, 42, 480, W - 84, 150, 10);
  f.fill();
  const foil = new THREE.CanvasTexture(fc);
  foil.colorSpace = THREE.NoColorSpace;

  // ---------- sparkle ----------
  const sc = document.createElement('canvas');
  sc.width = 256;
  sc.height = 256;
  const s = sc.getContext('2d')!;
  const simg = s.createImageData(256, 256);
  for (let i = 0; i < simg.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 255);
    simg.data[i] = simg.data[i + 1] = simg.data[i + 2] = v;
    simg.data[i + 3] = 255;
  }
  s.putImageData(simg, 0, 0);
  const sparkle = new THREE.CanvasTexture(sc);
  sparkle.wrapS = sparkle.wrapT = THREE.RepeatWrapping;
  sparkle.colorSpace = THREE.NoColorSpace;

  // ---------- normal map (foil micro-relief: brushed lines + speckle) ----------
  const NW = 256;
  const NH = 358;
  const height = new Float32Array(NW * NH);
  for (let y = 0; y < NH; y++) {
    for (let x = 0; x < NW; x++) {
      const lines = Math.sin(y * 0.9) * 0.5;
      const speck = Math.random() < 0.08 ? Math.random() : 0;
      height[y * NW + x] = lines * 0.4 + speck * 0.6;
    }
  }
  const nc = document.createElement('canvas');
  nc.width = NW;
  nc.height = NH;
  const n = nc.getContext('2d')!;
  const nimg = n.createImageData(NW, NH);
  const at = (x: number, y: number) =>
    height[Math.min(NH - 1, Math.max(0, y)) * NW + Math.min(NW - 1, Math.max(0, x))]!;
  for (let y = 0; y < NH; y++) {
    for (let x = 0; x < NW; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.0;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.0;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * NW + x) * 4;
      nimg.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = inv * 255;
      nimg.data[i + 3] = 255;
    }
  }
  n.putImageData(nimg, 0, 0);
  const normal = new THREE.CanvasTexture(nc);
  normal.colorSpace = THREE.NoColorSpace;

  return { albedo, foil, sparkle, normal };
}

const HOLO_COMMON = /* glsl */ `#include <common>
uniform sampler2D uFoil;
uniform sampler2D uSparkle;
uniform float uTime;
uniform float uHue;
uniform float uSparkleAmt;
uniform float uAniso;
vec3 holoHue(float h){ return 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67))); }`;

// Layered holo, added to emissive so bloom catches it. `normal` here already
// includes the normal-map perturbation, and reflect() gives the tangent-space-ish
// view-angle vector that drives the iridescence + diffraction.
const HOLO_EMISSIVE = /* glsl */ `#include <emissivemap_fragment>
{
  float foil = texture2D(uFoil, vMapUv).r;
  if (foil > 0.001) {
    vec3 N = normalize(normal);
    vec3 V = normalize(vViewPosition);
    vec3 R = reflect(-V, N);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 1.4);

    // broad iridescence from the reflection direction + position
    float baseAng = R.x * 0.9 + R.y * 0.7 + vMapUv.x * 1.1 + vMapUv.y * 0.8 + uHue;
    vec3 broad = holoHue(baseAng);

    // fine diffraction streaks that race with the angle
    float grating = (R.x + R.y) * 7.0 + (vMapUv.x + vMapUv.y) * 24.0;
    vec3 streaks = holoHue(grating * 0.15 + uHue) * 0.55;

    // anisotropic brushed lines (Line Holo)
    float lines = (sin(vMapUv.y * 270.0 + R.x * 9.0) * 0.5 + 0.5) * uAniso * 0.5;

    // twinkling glitter: discrete flecks that flash as the angle shifts
    float sp = texture2D(uSparkle, vMapUv * 8.0).r;
    float twinkle = pow(max(0.0, sin(sp * 28.0 + (R.x + R.y) * 16.0 + uTime * 0.4)), 16.0);
    vec3 glitter = vec3(twinkle) * uSparkleAmt * (0.6 + fres);

    // moving glare band
    float glare = smoothstep(0.7, 1.0, sin((vMapUv.x + vMapUv.y) * 2.2 + R.x * 3.5)) * 0.5;

    vec3 holo = broad * (0.18 + 0.62 * fres) + streaks * fres * 0.8 + lines * 0.7 + glare * 0.8;
    totalEmissiveRadiance += (holo + glitter) * foil * 0.6;
  }
}`;

function makeMaterials(tex: ReturnType<typeof makeTextures>) {
  return PRESETS.map((p) => {
    const m = new THREE.MeshPhysicalMaterial({
      map: tex.albedo,
      metalnessMap: tex.foil,
      normalMap: tex.normal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      metalness: p.metal,
      roughness: 0.25,
      iridescence: 0.8,
      iridescenceIOR: 1.32,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.4,
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
  const rim = useRef<THREE.RectAreaLight>(null);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    k1.current?.lookAt(0, 0, 0);
    k2.current?.lookAt(0, 0, 0);
    rim.current?.lookAt(0, 0, 0);
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);
  return (
    <>
      <ambientLight intensity={0.18} />
      <rectAreaLight ref={k1} args={[0xffffff, 7, 7, 9]} position={[5, 5, 7]} />
      <rectAreaLight ref={k2} args={[0x88bbff, 5, 7, 9]} position={[-6, 2, 6]} />
      <rectAreaLight ref={rim} args={[0xffd0a0, 6, 5, 7]} position={[0, -4, -5]} />
      <directionalLight position={[0, 4, 8]} intensity={0.4} />
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

function useHoloTime(shared: Shared) {
  useFrame((state) => {
    for (const m of shared.mats) {
      const sh = m.userData.shader as { uniforms: { uTime: THREE.IUniform } } | undefined;
      if (sh) sh.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });
}

function Card({ shared, presetIndex }: { shared: Shared; presetIndex: number }) {
  return (
    <>
      <mesh geometry={shared.core} material={shared.coreMat} position={[0, 0, -0.1]} />
      <mesh geometry={shared.front} material={shared.mats[presetIndex]!} position={[0, 0, 0.008]} />
    </>
  );
}

function HeroMode({ onStats, shared, setMode }: BenchProps & { shared: Shared; setMode: (m: 'grid') => void }) {
  useFps(onStats);
  useHoloTime(shared);
  const [preset, setPreset] = useState(0);
  const grp = useRef<THREE.Group>(null);

  useFrame((state, dt) => {
    const g = grp.current;
    if (!g) return;
    const k = Math.min(1, dt * 3.5);
    const sway = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    g.rotation.y += (state.pointer.x * 0.85 + sway - g.rotation.y) * k;
    g.rotation.x += (-state.pointer.y * 0.6 - g.rotation.x) * k;
  });

  return (
    <>
      <color attach="background" args={['#060710']} />
      <Studio />
      <group ref={grp} scale={2.1}>
        <Card shared={shared} presetIndex={preset} />
      </group>
      <EffectComposer>
        <Bloom intensity={0.75} luminanceThreshold={0.62} luminanceSmoothing={0.25} mipmapBlur />
        <ChromaticAberration radialModulation={false} modulationOffset={0} offset={new THREE.Vector2(0.0008, 0.0008)} />
        <Vignette eskil={false} offset={0.25} darkness={0.72} />
      </EffectComposer>
      <Controls>
        <button type="button" onClick={() => setMode('grid')}>
          ▦ grid bench
        </button>
        <div className="holo-presets">
          {PRESETS.map((p, i) => (
            <button key={p.name} type="button" className={i === preset ? 'on' : ''} onClick={() => setPreset(i)}>
              {p.name}
            </button>
          ))}
        </div>
      </Controls>
    </>
  );
}

function GridMode({ onStats, runId, shared, setMode }: BenchProps & { shared: Shared; setMode: (m: 'hero') => void }) {
  const grp = useRef<THREE.Group>(null);
  const groups = useRef<THREE.Group[]>([]);
  const filled = useRef(0);
  useHoloTime(shared);

  const layout = () => {
    const nn = groups.current.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(nn)));
    const rows = Math.ceil(nn / cols);
    const sx = 2.9;
    const sy = 4.0;
    for (let i = 0; i < nn; i++) {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      groups.current[i]!.position.set((cx - (cols - 1) / 2) * sx, ((rows - 1) / 2 - cy) * sy, 0);
    }
    const g = grp.current;
    if (g) g.scale.setScalar(Math.min(1, 11 / (cols * sx)));
  };

  const grow = (count: number) => {
    const g = grp.current;
    if (!g) return;
    for (let i = filled.current; i < count; i++) {
      const card = new THREE.Group();
      const coreM = new THREE.Mesh(shared.core, shared.coreMat);
      coreM.position.z = -0.1;
      const frontM = new THREE.Mesh(shared.front, shared.mats[i % shared.mats.length]!);
      frontM.position.z = 0.008;
      frontM.frustumCulled = false;
      coreM.frustumCulled = false;
      card.add(coreM, frontM);
      groups.current.push(card);
      g.add(card);
    }
    filled.current = Math.max(filled.current, count);
    layout();
  };

  useRamp({ target: 50, step: 6, max: 1000, start: 6, grow, onStats, runId });

  useFrame((state, dt) => {
    const g = grp.current;
    if (!g) return;
    const k = Math.min(1, dt * 3);
    g.rotation.y += (state.pointer.x * 0.4 - g.rotation.y) * k;
    g.rotation.x += (-state.pointer.y * 0.3 - g.rotation.x) * k;
  });

  return (
    <>
      <color attach="background" args={['#060710']} />
      <Studio />
      <group ref={grp} />
      <EffectComposer>
        <Bloom intensity={0.85} luminanceThreshold={0.55} mipmapBlur />
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
    const front = new THREE.ShapeGeometry(roundedRectShape(CW, CH, RAD), 14);
    remapUV(front, CW, CH);
    const core = new THREE.ExtrudeGeometry(roundedRectShape(CW + 0.12, CH + 0.12, RAD + 0.03), {
      depth: 0.1,
      bevelEnabled: false,
    });
    const coreMat = new THREE.MeshStandardMaterial({ color: '#0b0b16', roughness: 0.55, metalness: 0.25 });
    return { front, core, mats, coreMat, textures: [tex.albedo, tex.foil, tex.sparkle, tex.normal] };
  }, []);

  useEffect(() => {
    return () => {
      shared.front.dispose();
      shared.core.dispose();
      shared.coreMat.dispose();
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
