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

// Holographic trading cards — a faithful re-implementation of the foil technique
// from Isaac Johnson's "Ziggy card" (https://isaac-johnson-blog.pages.dev/ziggy-card/),
// credited. Unlike a built-in iridescence, the whole holo is a custom shader patched
// into MeshPhysicalMaterial: the reflection vector is projected into tangent space
// (tilt), driving a cosine-palette hue + anisotropic diffraction lines + faceted
// per-cell glitter + foil-pattern modulation, then blended over the lit colour gated
// by exposedFoil × fresnel. Foil regions also get their own roughness/metalness, and
// a height map perturbs the normal. Art + all foil maps are generated procedurally
// (no copied assets). Studio RectAreaLights + RoomEnvironment + bloom; cards tilt to
// the pointer (uMotion tracks angular velocity). Hero card (4 presets) ⇄ ramping grid.
RectAreaLightUniformsLib.init();

const CW = 2.5;
const CH = 3.5;
const RAD = 0.16;

type Preset = {
  name: string;
  hue: number;
  tshift: number;
  milk: number;
  sat: number;
  line: number;
  ang: number;
  glint: number;
  spark: number;
  sparkDensity: number;
};
const PRESETS: Preset[] = [
  { name: 'Rainbow Rare', hue: 1.5, tshift: 2.0, milk: 0.35, sat: 0.9, line: 120, ang: 23, glint: 0.5, spark: 0.7, sparkDensity: 90 },
  { name: 'Cosmos', hue: 2.3, tshift: 2.6, milk: 0.22, sat: 1.0, line: 80, ang: 12, glint: 0.35, spark: 1.2, sparkDensity: 140 },
  { name: 'Line Holo', hue: 1.0, tshift: 1.4, milk: 0.3, sat: 0.85, line: 240, ang: 8, glint: 1.0, spark: 0.18, sparkDensity: 60 },
  { name: 'Reverse', hue: 1.6, tshift: 2.0, milk: 0.5, sat: 0.8, line: 90, ang: 62, glint: 0.45, spark: 0.85, sparkDensity: 110 },
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

function noiseCanvas(size: number, lines: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = Math.random();
      if (lines) v = 0.5 + 0.5 * Math.sin(y * 0.6) * 0.6 + (Math.random() < 0.06 ? Math.random() * 0.5 : 0);
      const i = (y * size + x) * 4;
      const b = Math.max(0, Math.min(255, v * 255));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function makeTextures() {
  const W = 512;
  const H = 716;

  // ---------- albedo ----------
  const ac = document.createElement('canvas');
  ac.width = W;
  ac.height = H;
  const a = ac.getContext('2d')!;
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
  a.fillStyle = '#15102b';
  rr(a, 26, 26, W - 52, H - 52, 16);
  a.fill();
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
  for (let i = 0; i < 90; i++) {
    a.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
    a.beginPath();
    a.arc(ax + Math.random() * aw, ay + Math.random() * ah, Math.random() * 1.6 + 0.4, 0, 7);
    a.fill();
  }
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
  a.fillStyle = '#241a3a';
  rr(a, 42, 480, W - 84, 150, 10);
  a.fill();
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
  a.fillStyle = '#ffe08a';
  a.font = '18px sans-serif';
  a.fillText('★ ULTRA RARE', 46, 672);
  a.textAlign = 'right';
  a.fillStyle = '#cdd2e0';
  a.fillText('001 / 151', W - 46, 672);
  const albedo = new THREE.CanvasTexture(ac);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = 8;

  // ---------- holo mask (r: where foil is exposed) ----------
  const fc = document.createElement('canvas');
  fc.width = W;
  fc.height = H;
  const f = fc.getContext('2d')!;
  f.fillStyle = '#000';
  f.fillRect(0, 0, W, H);
  f.fillStyle = '#fff';
  rr(f, 26, 26, W - 52, H - 52, 16);
  f.fill();
  f.fillStyle = '#000';
  rr(f, 42, 40, W - 84, 46, 10); // name bar matte
  f.fill();
  rr(f, 42, 480, W - 84, 150, 10); // attack box matte
  f.fill();
  const holoMask = new THREE.CanvasTexture(fc);
  holoMask.colorSpace = THREE.NoColorSpace;

  // white-ink mask (r): unused detail → flat black (no ink suppression)
  const wc = document.createElement('canvas');
  wc.width = wc.height = 4;
  const w = wc.getContext('2d')!;
  w.fillStyle = '#000';
  w.fillRect(0, 0, 4, 4);
  const whiteInk = new THREE.CanvasTexture(wc);
  whiteInk.colorSpace = THREE.NoColorSpace;

  const foilPattern = noiseCanvas(256, false);
  const height = noiseCanvas(256, true);

  return { albedo, holoMask, whiteInk, foilPattern, height };
}

// ---- ported holo technique (re-implemented; credit: Isaac Johnson's Ziggy card) ----
const HOLO_COMMON = /* glsl */ `#include <common>
uniform sampler2D uHoloMask;
uniform sampler2D uWhiteInk;
uniform sampler2D uFoilPattern;
uniform sampler2D uHeight;
uniform float uHue, uTshift, uMilk, uSat, uWarp, uLine, uAng;
uniform float uGlint, uSpark, uSparkDensity, uSparkSize, uBright;
uniform float uHoloIntensity, uFoilRough, uFoilMetal, uHeightStrength, uMotion;
float hHash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hHash22(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031,0.1030,0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float hNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hHash12(i),hHash12(i+vec2(1.,0.)),f.x), mix(hHash12(i+vec2(0.,1.)),hHash12(i+vec2(1.,1.)),f.x), f.y); }
float hFbm(vec2 p){ float v=0., a=0.5; for(int i=0;i<5;i++){ v+=a*hNoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p; a*=0.5; } return v; }
vec2 hN2(vec2 v){ float l=dot(v,v); return l<1e-8 ? vec2(1.,0.) : v*inversesqrt(l); }
vec3 hN3(vec3 v){ float l=dot(v,v); return l<1e-8 ? vec3(0.,0.,1.) : v*inversesqrt(l); }
mat3 hTBN(vec3 pos, vec3 n, vec2 uv){ vec3 pdx=dFdx(pos), pdy=dFdy(pos); vec2 udx=dFdx(uv), udy=dFdy(uv);
  vec3 t=hN3(pdx*udy.y - pdy*udx.y); t=hN3(t - n*dot(n,t)); vec3 b=hN3(cross(n,t)); return mat3(t,b,n); }
vec3 hGlitter(vec2 g, vec2 vd, float sharp, float size){ vec3 acc=vec3(0.); vec2 ip=floor(g);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 cell=ip+vec2(float(x),float(y));
    vec2 pos=cell+0.5+(hHash22(cell)-0.5)*0.85; float d=length(g-pos);
    float fa=hHash12(cell+19.7)*PI2; vec2 fc=vec2(cos(fa),sin(fa));
    float fl=pow(clamp(dot(vd,fc)*0.5+0.5,0.,1.), sharp); float hue=hHash12(cell+4.3);
    vec3 col=mix(vec3(1.), 0.5+0.5*cos(PI2*(hue+vec3(0.,0.33,0.66))), 0.7);
    acc += smoothstep(size,0.,d)*fl*col; } return acc; }
float hExposed(vec2 uv){ float m=texture2D(uHoloMask,uv).r; float ink=texture2D(uWhiteInk,uv).r;
  return clamp(m*pow(max(1.0-ink,0.0),1.4),0.0,1.0); }`;

const HOLO_ROUGH = /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, uFoilRough, hExposed(vMapUv));`;

const HOLO_METAL = /* glsl */ `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, uFoilMetal, hExposed(vMapUv));`;

const HOLO_NORMAL = /* glsl */ `#include <normal_fragment_maps>
{
  float hh = texture2D(uHeight, vMapUv).r;
  mat3 tbn = hTBN(-vViewPosition, normal, vMapUv);
  vec2 grad = vec2(dFdx(hh), dFdy(hh));
  vec3 tn = hN3(vec3(-grad.x*uHeightStrength, -grad.y*uHeightStrength, 1.0));
  normal = normalize(tbn * tn);
}`;

const HOLO_OPAQUE = /* glsl */ `{
  float foilAmt = hExposed(vMapUv);
  vec3 V = hN3(vViewPosition);
  vec3 N = normalize(normal);
  vec3 Rd = reflect(-V, N);
  mat3 tbn = hTBN(-vViewPosition, N, vMapUv);
  vec2 tilt = vec2(dot(Rd, tbn[0]), dot(Rd, tbn[1]));
  vec2 dir = vec2(cos(uAng), sin(uAng));
  vec2 nrm = vec2(-dir.y, dir.x);
  float along = dot(vMapUv - 0.5, dir);
  float across = dot(vMapUv - 0.5, nrm);
  float wv = hFbm(vMapUv * uWarp + vec2(3.1));
  float hue = along * uHue + dot(tilt, dir) * uTshift + (wv - 0.5) * 1.2;
  vec3 sheen = 0.5 + 0.5 * cos(PI2 * (hue + vec3(0.0, 0.33, 0.66)));
  float luma = dot(sheen, vec3(0.299, 0.587, 0.114));
  sheen = mix(vec3(luma), sheen, uSat);
  sheen = mix(sheen, vec3(1.0), uMilk);
  float lines = 0.5 + 0.5 * sin(across * uLine + (wv - 0.5) * 4.0);
  float align = clamp(dot(hN2(tilt), nrm) * 0.5 + 0.5, 0.0, 1.0);
  float glint = pow(lines, 9.0) * uGlint * (0.25 + 0.75 * align);
  vec2 sparkDir = hN2(tilt * 3.0 + vec2(0.2, 0.35));
  vec3 spark = hGlitter(vMapUv * uSparkDensity, sparkDir, 22.0, uSparkSize)
    + hGlitter(vMapUv * uSparkDensity * 2.3 + 11.0, sparkDir, 22.0, uSparkSize) * 0.6;
  float patMod = mix(0.82, 1.18, texture2D(uFoilPattern, vMapUv * 8.0).r);
  vec3 foil = sheen * (0.72 + 0.28 * lines) * patMod + vec3(glint);
  foil += spark * uSpark * (0.7 + uMotion * 0.9);
  foil *= uBright * (0.85 + uMotion * 0.55);
  float fres = pow(1.0 - saturate(dot(N, V)), 2.5);
  float blend = clamp(foilAmt * uHoloIntensity * mix(0.55, 1.0, fres), 0.0, 1.0);
  outgoingLight = mix(outgoingLight, foil, blend);
}
#include <opaque_fragment>`;

function makeMaterials(tex: ReturnType<typeof makeTextures>) {
  return PRESETS.map((p) => {
    const m = new THREE.MeshPhysicalMaterial({
      map: tex.albedo,
      roughness: 0.52,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.24,
      ior: 1.47,
      envMapIntensity: 1,
    });
    m.customProgramCacheKey = () => 'holo-card-ziggy-v1';
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uHoloMask: { value: tex.holoMask },
        uWhiteInk: { value: tex.whiteInk },
        uFoilPattern: { value: tex.foilPattern },
        uHeight: { value: tex.height },
        uHue: { value: p.hue },
        uTshift: { value: p.tshift },
        uMilk: { value: p.milk },
        uSat: { value: p.sat },
        uWarp: { value: 2 },
        uLine: { value: p.line },
        uAng: { value: (p.ang * Math.PI) / 180 },
        uGlint: { value: p.glint },
        uSpark: { value: p.spark },
        uSparkDensity: { value: p.sparkDensity },
        uSparkSize: { value: 0.45 },
        uBright: { value: 1 },
        uHoloIntensity: { value: 0.85 },
        uFoilRough: { value: 0.16 },
        uFoilMetal: { value: 0.72 },
        uHeightStrength: { value: 6 },
        uMotion: { value: 0 },
      });
      m.userData.shader = shader;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', HOLO_COMMON)
        .replace('#include <roughnessmap_fragment>', HOLO_ROUGH)
        .replace('#include <metalnessmap_fragment>', HOLO_METAL)
        .replace('#include <normal_fragment_maps>', HOLO_NORMAL)
        .replace('#include <opaque_fragment>', HOLO_OPAQUE);
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
      <ambientLight intensity={0.25} />
      <rectAreaLight ref={k1} args={[0xffffff, 8, 7, 9]} position={[5, 5, 7]} />
      <rectAreaLight ref={k2} args={[0x9ec3ff, 5, 7, 9]} position={[-6, 2, 6]} />
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

function useHolo(shared: Shared, motionRef: { current: number }) {
  useFrame(() => {
    for (const m of shared.mats) {
      const sh = m.userData.shader as { uniforms: Record<string, THREE.IUniform> } | undefined;
      if (sh) sh.uniforms.uMotion!.value = motionRef.current;
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
  const [preset, setPreset] = useState(0);
  const grp = useRef<THREE.Group>(null);
  const motion = useRef(0);
  useHolo(shared, motion);

  useFrame((state, dt) => {
    const g = grp.current;
    if (!g) return;
    const k = Math.min(1, dt * 3.5);
    const sway = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    const ty = state.pointer.x * 0.85 + sway;
    const tx = -state.pointer.y * 0.6;
    const d = Math.abs(ty - g.rotation.y) + Math.abs(tx - g.rotation.x);
    motion.current += (Math.min(1, d * 6) - motion.current) * Math.min(1, dt * 4);
    g.rotation.y += (ty - g.rotation.y) * k;
    g.rotation.x += (tx - g.rotation.x) * k;
  });

  return (
    <>
      <color attach="background" args={['#060710']} />
      <Studio />
      <group ref={grp} scale={2.1}>
        <Card shared={shared} presetIndex={preset} />
      </group>
      <EffectComposer>
        <Bloom intensity={0.7} luminanceThreshold={0.62} luminanceSmoothing={0.25} mipmapBlur />
        <ChromaticAberration radialModulation={false} modulationOffset={0} offset={new THREE.Vector2(0.0007, 0.0007)} />
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
  const motion = useRef(0.4);
  useHolo(shared, motion);

  const layout = () => {
    const nn = groups.current.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(nn)));
    const rows = Math.ceil(nn / cols);
    const sx = 2.9;
    const sy = 4.0;
    for (let i = 0; i < nn; i++) {
      groups.current[i]!.position.set(((i % cols) - (cols - 1) / 2) * sx, ((rows - 1) / 2 - Math.floor(i / cols)) * sy, 0);
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
      coreM.frustumCulled = false;
      const frontM = new THREE.Mesh(shared.front, shared.mats[i % shared.mats.length]!);
      frontM.position.z = 0.008;
      frontM.frustumCulled = false;
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
        <Bloom intensity={0.65} luminanceThreshold={0.62} mipmapBlur />
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
    const front = new THREE.ShapeGeometry(roundedRectShape(CW, CH, RAD), 16);
    remapUV(front, CW, CH);
    const core = new THREE.ExtrudeGeometry(roundedRectShape(CW + 0.12, CH + 0.12, RAD + 0.03), {
      depth: 0.1,
      bevelEnabled: false,
    });
    const coreMat = new THREE.MeshStandardMaterial({ color: '#0b0b16', roughness: 0.55, metalness: 0.25 });
    return { front, core, mats, coreMat, textures: [tex.albedo, tex.holoMask, tex.whiteInk, tex.foilPattern, tex.height] };
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
