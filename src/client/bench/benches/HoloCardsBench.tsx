import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { useRamp } from '../useRamp';
import { useFps } from '../useFps';
import { useHoloStore, PRESETS, TUNE_DEFAULTS, type Preset } from '../holoStore';
import type { BenchProps } from '../types';

// Holographic trading cards — built up in stages, following Isaac Johnson's
// "Ziggy card" build order (https://isaac-johnson-blog.pages.dev/ziggy-card/),
// credited; technique re-implemented with our own procedural assets.
//   1 Base   — laminated geometry + clean PBR material + studio lighting (no foil)
//   2 Foil   — foil mask blends metalness/roughness (+ gentle detail normal)
//   3 Sheen  — view-angle iridescence (reflection→tangent tilt → cosine-palette hue)
//   4 Lines  — anisotropic brushed diffraction lines
//   5 Glitter— discrete faceted glitter flecks (+ motion lift)
// Hero card exposes the stage toggles + presets; the grid runs the full stack.
RectAreaLightUniformsLib.init();

const CW = 2.2;
const CH = 3.08;
const RAD = 0.12;
const DEPTH = 0.06;

type Shared = {
  front: THREE.ShapeGeometry;
  core: THREE.ExtrudeGeometry;
  mats: THREE.MeshPhysicalMaterial[];
  coreMat: THREE.MeshStandardMaterial;
  textures: THREE.Texture[];
  tex: ReturnType<typeof makeTextures>;
  backMat: THREE.MeshStandardMaterial;
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

// Smooth grayscale via bilinear upscale of a low-res random grid (no white-noise grain).
function smoothCanvas(size: number, cells: number, base: number, amp: number) {
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = Math.random();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;
      const a = g[iy * (cells + 1) + ix]!;
      const b = g[iy * (cells + 1) + ix + 1]!;
      const cc = g[(iy + 1) * (cells + 1) + ix]!;
      const d = g[(iy + 1) * (cells + 1) + ix + 1]!;
      const v = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + d * fx * fy;
      const px = Math.max(0, Math.min(255, (base + amp * v) * 255));
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = px;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Structural emboss: draw the printed elements (frame ridges, borders, boxes,
// raised text/pips) as a height field with blurred bevels, then convert to a
// tangent-space normal map so the studio lights catch the raised edges.
function embossNormalMap() {
  const W = 512;
  const H = 716;
  const strength = 4.0;
  const hc = document.createElement('canvas');
  hc.width = W;
  hc.height = H;
  const h = hc.getContext('2d')!;
  h.fillStyle = '#808080';
  h.fillRect(0, 0, W, H);
  h.strokeStyle = '#ffffff';
  h.fillStyle = '#ffffff';
  h.lineJoin = 'round';
  h.lineWidth = 7;
  rr(h, 12, 12, W - 24, H - 24, 20);
  h.stroke();
  h.lineWidth = 5;
  rr(h, 28, 28, W - 56, H - 56, 14);
  h.stroke();
  rr(h, 46, 100, W - 92, 360, 10);
  h.stroke();
  h.lineWidth = 4;
  rr(h, 42, 40, W - 84, 46, 10);
  h.stroke();
  rr(h, 42, 480, W - 84, 150, 10);
  h.stroke();
  h.textBaseline = 'middle';
  h.font = 'bold 26px sans-serif';
  h.textAlign = 'left';
  h.fillText('Ember Drake', 58, 64);
  h.font = 'bold 24px sans-serif';
  h.textAlign = 'right';
  h.fillText('HP 120', W - 58, 64);
  h.font = 'bold 22px sans-serif';
  h.textAlign = 'left';
  h.fillText('Dragonfire', 150, 512);
  h.textAlign = 'right';
  h.fillText('90', W - 58, 512);
  h.font = '18px sans-serif';
  h.textAlign = 'left';
  h.fillText('★ ULTRA RARE', 46, 672);
  for (let i = 0; i < 3; i++) {
    h.beginPath();
    h.arc(64 + i * 26, 512, 10, 0, 7);
    h.fill();
  }
  // blur → soft bevels
  const bc = document.createElement('canvas');
  bc.width = W;
  bc.height = H;
  const b = bc.getContext('2d')!;
  b.filter = 'blur(2px)';
  b.drawImage(hc, 0, 0);
  const src = b.getImageData(0, 0, W, H).data;
  const at = (x: number, y: number) =>
    src[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4]! / 255;
  const nc = document.createElement('canvas');
  nc.width = W;
  nc.height = H;
  const n = nc.getContext('2d')!;
  const out = n.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * W + x) * 4;
      out.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      out.data[i + 2] = inv * 255;
      out.data[i + 3] = 255;
    }
  }
  n.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(nc);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Shared ornate card back (original design) used by every card.
function makeCardBack() {
  const W = 512;
  const H = 716;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const bg = x.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 430);
  bg.addColorStop(0, '#241a52');
  bg.addColorStop(0.6, '#140e30');
  bg.addColorStop(1, '#08060f');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#caa24a');
  g.addColorStop(0.5, '#f3e08a');
  g.addColorStop(1, '#9a7a2e');
  x.strokeStyle = g;
  x.lineWidth = 14;
  rr(x, 16, 16, W - 32, H - 32, 26);
  x.stroke();
  x.lineWidth = 2;
  x.strokeStyle = 'rgba(255,255,255,0.22)';
  rr(x, 30, 30, W - 60, H - 60, 18);
  x.stroke();
  x.save();
  x.translate(W / 2, H / 2);
  for (let i = 0; i < 5; i++) {
    x.beginPath();
    x.arc(0, 0, 60 + i * 26, 0, 7);
    x.strokeStyle = `rgba(243,224,138,${0.1 + i * 0.02})`;
    x.lineWidth = 2;
    x.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    x.beginPath();
    x.moveTo(Math.cos(a) * 64, Math.sin(a) * 64);
    x.lineTo(Math.cos(a) * 184, Math.sin(a) * 184);
    x.strokeStyle = 'rgba(243,224,138,0.06)';
    x.lineWidth = 1.5;
    x.stroke();
  }
  const eg = x.createRadialGradient(0, 0, 2, 0, 0, 86);
  eg.addColorStop(0, 'rgba(150,120,255,0.6)');
  eg.addColorStop(1, 'rgba(150,120,255,0)');
  x.fillStyle = eg;
  x.beginPath();
  x.arc(0, 0, 86, 0, 7);
  x.fill();
  x.fillStyle = '#f3e08a';
  x.font = 'bold 120px serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('✦', 0, 6);
  x.restore();
  x.fillStyle = '#e7d9a0';
  x.font = 'bold 28px serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('T I N Y   A R M Y', W / 2, 92);
  x.font = '15px serif';
  x.fillStyle = 'rgba(231,217,160,0.65)';
  x.fillText('TRADING CARD', W / 2, H - 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeTextures() {
  const W = 512;
  const H = 716;
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
  a.strokeStyle = 'rgba(255,255,255,0.45)';
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
  a.fillText('Ember Drake', 58, 64);
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
  for (let i = 0; i < 70; i++) {
    a.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;
    a.beginPath();
    a.arc(ax + Math.random() * aw, ay + Math.random() * ah, Math.random() * 1.4 + 0.4, 0, 7);
    a.fill();
  }
  const glow = a.createRadialGradient(W / 2, ay + 175, 10, W / 2, ay + 175, 150);
  glow.addColorStop(0, 'rgba(255,240,200,0.45)');
  glow.addColorStop(1, 'rgba(255,240,200,0)');
  a.fillStyle = glow;
  a.fillRect(ax, ay, aw, ah);
  a.font = '200px serif';
  a.textAlign = 'center';
  a.textBaseline = 'middle';
  a.fillText('🐉', W / 2, ay + 180);
  a.restore();
  a.strokeStyle = 'rgba(255,255,255,0.22)';
  a.lineWidth = 2;
  rr(a, ax, ay, aw, ah, 10);
  a.stroke();
  a.fillStyle = '#241a3a';
  rr(a, 42, 480, W - 84, 150, 10);
  a.fill();
  const pip = ['#ffd86b', '#7fd8ff', '#ff9ed8'];
  for (let i = 0; i < 3; i++) {
    a.fillStyle = pip[i]!;
    a.beginPath();
    a.arc(64 + i * 26, 512, 10, 0, 7);
    a.fill();
  }
  a.fillStyle = '#ffffff';
  a.font = 'bold 22px sans-serif';
  a.textAlign = 'left';
  a.fillText('Dragonfire', 150, 512);
  a.textAlign = 'right';
  a.fillText('90', W - 58, 512);
  a.fillStyle = '#b9c0d6';
  a.font = '15px sans-serif';
  a.textAlign = 'left';
  a.fillText('Deals 90 damage. If the foil ignites, the target', 64, 552);
  a.fillText('burns for 20 more at the start of your next turn.', 64, 574);
  a.fillStyle = '#ffe08a';
  a.font = '18px sans-serif';
  a.fillText('★ ULTRA RARE', 46, 672);
  a.textAlign = 'right';
  a.fillStyle = '#cdd2e0';
  a.fillText('001 / 151', W - 46, 672);
  const albedo = new THREE.CanvasTexture(ac);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = 8;

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
  rr(f, 42, 40, W - 84, 46, 10);
  f.fill();
  rr(f, 42, 480, W - 84, 150, 10);
  f.fill();
  const holoMask = new THREE.CanvasTexture(fc);
  holoMask.colorSpace = THREE.NoColorSpace;

  const wc = document.createElement('canvas');
  wc.width = wc.height = 4;
  const w = wc.getContext('2d')!;
  w.fillStyle = '#000';
  w.fillRect(0, 0, 4, 4);
  const whiteInk = new THREE.CanvasTexture(wc);
  whiteInk.colorSpace = THREE.NoColorSpace;

  const foilPattern = smoothCanvas(256, 10, 0.0, 1.0); // smooth 0..1 blobs
  const height = smoothCanvas(256, 24, 0.25, 0.5); // gentle smooth foil relief
  const emboss = embossNormalMap();
  const cardBack = makeCardBack();

  return { albedo, holoMask, whiteInk, foilPattern, height, emboss, cardBack };
}

const HOLO_COMMON = /* glsl */ `#include <common>
uniform sampler2D uHoloMask;
uniform sampler2D uWhiteInk;
uniform sampler2D uFoilPattern;
uniform sampler2D uHeight;
uniform float uHue, uTshift, uMilk, uSat, uWarp, uLine, uAng;
uniform float uGlint, uSpark, uSparkDensity, uSparkSize, uBright;
uniform float uHoloIntensity, uFoilRough, uFoilMetal, uHeightStrength, uMotion;
uniform float uStageFoil, uStageHolo, uStageLines, uStageGlitter;
float hHash12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hHash22(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031,0.1030,0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float hNoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hHash12(i),hHash12(i+vec2(1.,0.)),f.x), mix(hHash12(i+vec2(0.,1.)),hHash12(i+vec2(1.,1.)),f.x), f.y); }
float hFbm(vec2 p){ float v=0., a=0.5; for(int i=0;i<4;i++){ v+=a*hNoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p; a*=0.5; } return v; }
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
roughnessFactor = mix(roughnessFactor, uFoilRough, hExposed(vMapUv) * uStageFoil);`;

const HOLO_METAL = /* glsl */ `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, uFoilMetal, hExposed(vMapUv) * uStageFoil);`;

const HOLO_NORMAL = /* glsl */ `#include <normal_fragment_maps>
if (uStageFoil > 0.5) {
  float hh = texture2D(uHeight, vMapUv).r;
  mat3 tbn = hTBN(-vViewPosition, normal, vMapUv);
  vec2 grad = vec2(dFdx(hh), dFdy(hh));
  vec3 tn = hN3(vec3(-grad.x*uHeightStrength, -grad.y*uHeightStrength, 1.0));
  normal = normalize(tbn * tn);
}`;

const HOLO_OPAQUE = /* glsl */ `float anyHolo = clamp(uStageHolo + uStageLines + uStageGlitter, 0.0, 1.0);
if (anyHolo > 0.5) {
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
  float hue = along * uHue + dot(tilt, dir) * uTshift + (wv - 0.5) * 1.0;
  vec3 sheen = 0.5 + 0.5 * cos(PI2 * (hue + vec3(0.0, 0.33, 0.66)));
  float luma = dot(sheen, vec3(0.299, 0.587, 0.114));
  sheen = mix(vec3(luma), sheen, uSat);
  sheen = mix(sheen, vec3(1.0), uMilk);
  float lines = 0.5 + 0.5 * sin(across * uLine + (wv - 0.5) * 4.0);
  float align = clamp(dot(hN2(tilt), nrm) * 0.5 + 0.5, 0.0, 1.0);
  // softer, wider glint streaks (was pow 9) — no longer overpower the design
  float glint = pow(lines, 6.0) * uGlint * (0.25 + 0.75 * align) * 0.5;
  vec2 sparkDir = hN2(tilt * 3.0 + vec2(0.2, 0.35));
  vec3 spark = hGlitter(vMapUv * uSparkDensity, sparkDir, 22.0, uSparkSize)
    + hGlitter(vMapUv * uSparkDensity * 2.3 + 11.0, sparkDir, 22.0, uSparkSize) * 0.6;
  float patMod = mix(0.9, 1.1, texture2D(uFoilPattern, vMapUv * 6.0).r);
  // each layer toggles independently
  float lineMix = mix(0.5, lines, uStageLines);
  vec3 foil = sheen * (0.82 + 0.18 * lineMix) * patMod * uStageHolo;
  foil += vec3(glint) * uStageLines;
  foil += spark * uSpark * (0.7 + uMotion * 0.9) * uStageGlitter;
  foil *= uBright * (0.85 + uMotion * 0.55);
  float fres = pow(1.0 - saturate(dot(N, V)), 2.5);
  float blend = clamp(foilAmt * uHoloIntensity * mix(0.5, 1.0, fres), 0.0, 1.0) * anyHolo;
  outgoingLight = mix(outgoingLight, foil, blend);
}
#include <opaque_fragment>`;

type HoloTexBundle = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  holoMask: THREE.Texture;
  whiteInk: THREE.Texture;
  foilPattern: THREE.Texture;
  height: THREE.Texture;
};

function buildHoloMaterial(tex: HoloTexBundle, p: Preset, opts: { normalScale?: number; heightStrength?: number } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(opts.normalScale ?? 1.3, opts.normalScale ?? 1.3),
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.24,
    ior: 1.47,
    envMapIntensity: 1,
  });
  m.customProgramCacheKey = () => 'holo-card-ziggy-v2';
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
      uSparkSize: { value: 0.4 },
      uBright: { value: 1 },
      uHoloIntensity: { value: 0.6 },
      uFoilRough: { value: 0.16 },
      uFoilMetal: { value: 0.72 },
      uHeightStrength: { value: opts.heightStrength ?? 3 },
      uMotion: { value: 0 },
      uStageFoil: { value: 1 },
      uStageHolo: { value: 1 },
      uStageLines: { value: 1 },
      uStageGlitter: { value: 1 },
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
}

function makeMaterials(tex: ReturnType<typeof makeTextures>) {
  return PRESETS.map((p) =>
    buildHoloMaterial(
      { map: tex.albedo, normalMap: tex.emboss, holoMask: tex.holoMask, whiteInk: tex.whiteInk, foilPattern: tex.foilPattern, height: tex.height },
      p,
      { normalScale: 1.3, heightStrength: 3 }
    )
  );
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
      <ambientLight intensity={0.3} />
      <rectAreaLight ref={k1} args={[0xfff0e0, 9, 7, 9]} position={[6, 6, 6]} />
      <rectAreaLight ref={k2} args={[0xbcd4ff, 4, 7, 9]} position={[-6, 2, 6]} />
      <rectAreaLight ref={rim} args={[0xffd0a0, 4, 5, 7]} position={[0, -4, -5]} />
      <directionalLight position={[0, 4, 8]} intensity={0.45} />
    </>
  );
}

// Drives the shader uniforms + normalScale every frame from the store (no React
// re-render on slider drag), for all preset mats plus an optional loaded-card mat.
function useHolo(shared: Shared, motionRef: { current: number }, extraRef?: { current: THREE.MeshPhysicalMaterial | null }) {
  useFrame(() => {
    const { tune: tn, layers } = useHoloStore.getState();
    const mats = extraRef?.current ? [...shared.mats, extraRef.current] : shared.mats;
    for (const m of mats) {
      const sh = m.userData.shader as { uniforms: Record<string, THREE.IUniform> } | undefined;
      if (!sh) continue;
      const u = sh.uniforms;
      u.uMotion!.value = motionRef.current;
      u.uStageFoil!.value = layers.foil ? 1 : 0;
      u.uStageHolo!.value = layers.holo ? 1 : 0;
      u.uStageLines!.value = layers.lines ? 1 : 0;
      u.uStageGlitter!.value = layers.glitter ? 1 : 0;
      u.uHoloIntensity!.value = tn.holoIntensity;
      u.uSpark!.value = tn.spark;
      u.uGlint!.value = tn.glint;
      u.uFoilMetal!.value = tn.foilMetal;
      u.uFoilRough!.value = tn.foilRough;
      m.normalScale.set(tn.normal, tn.normal);
    }
  });
}

function Card({ shared, presetIndex, material }: { shared: Shared; presetIndex: number; material?: THREE.Material | null }) {
  return (
    <>
      <mesh geometry={shared.core} material={shared.coreMat} position={[0, 0, -DEPTH / 2]} />
      <mesh geometry={shared.front} material={material ?? shared.mats[presetIndex]!} position={[0, 0, DEPTH / 2 + 0.002]} />
      <mesh geometry={shared.front} material={shared.backMat} position={[0, 0, -DEPTH / 2 - 0.002]} rotation={[0, Math.PI, 0]} />
    </>
  );
}

function HeroMode({ onStats, shared }: BenchProps & { shared: Shared }) {
  useFps(onStats);
  const cardSlug = useHoloStore((s) => s.cardSlug);
  const view = useHoloStore((s) => s.view);
  const preset = useHoloStore((s) => s.preset);
  const [cardMat, setCardMat] = useState<THREE.MeshPhysicalMaterial | null>(null);
  const cardMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  cardMatRef.current = cardMat;
  const motion = useRef(0);
  const prevQ = useRef(new THREE.Quaternion());
  useHolo(shared, motion, cardMatRef);

  // load a generated card's texture set (albedo + combined-emboss normal + holo mask)
  useEffect(() => {
    if (!cardSlug) {
      setCardMat((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }
    let alive = true;
    const L = new THREE.TextureLoader();
    Promise.all([
      L.loadAsync(`cards/${cardSlug}/albedo.png`),
      L.loadAsync(`cards/${cardSlug}/normal.png`),
      L.loadAsync(`cards/${cardSlug}/holo.png`),
    ])
      .then(([al, no, ho]) => {
        if (!alive) return;
        al.colorSpace = THREE.SRGBColorSpace;
        al.anisotropy = 8;
        no.colorSpace = THREE.NoColorSpace;
        ho.colorSpace = THREE.NoColorSpace;
        const mat = buildHoloMaterial(
          { map: al, normalMap: no, holoMask: ho, whiteInk: shared.tex.whiteInk, foilPattern: shared.tex.foilPattern, height: shared.tex.height },
          PRESETS[0]!,
          { normalScale: TUNE_DEFAULTS.normal, heightStrength: 1.2 }
        );
        setCardMat((prev) => {
          prev?.dispose();
          return mat;
        });
      })
      .catch((e) => console.error('card load failed', e));
    return () => {
      alive = false;
    };
  }, [cardSlug, shared]);

  // motion = camera angular velocity → lifts sparkle while you orbit
  useFrame((state, dt) => {
    const q = state.camera.quaternion;
    const d = Math.min(1, Math.abs(prevQ.current.dot(q)));
    const vel = (2 * Math.acos(d)) / Math.max(dt, 1e-3);
    motion.current += (Math.min(1, vel * 0.5) - motion.current) * Math.min(1, dt * 4);
    prevQ.current.copy(q);
  });

  return (
    <>
      <color attach="background" args={['#070811']} />
      <Studio />
      {view === '3d' ? (
        <group scale={2.6}>
          <Card shared={shared} presetIndex={preset} material={cardMat} />
        </group>
      ) : null}
      <EffectComposer>
        <Bloom intensity={0.45} luminanceThreshold={0.72} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette eskil={false} offset={0.28} darkness={0.7} />
      </EffectComposer>
      <OrbitControls enablePan={false} target={[0, 0, 0]} minDistance={3} maxDistance={18} minPolarAngle={0.5} maxPolarAngle={Math.PI - 0.5} />
    </>
  );
}

function GridMode({ onStats, runId, shared }: BenchProps & { shared: Shared }) {
  const grp = useRef<THREE.Group>(null);
  const groups = useRef<THREE.Group[]>([]);
  const filled = useRef(0);
  const motion = useRef(0.4);
  useHolo(shared, motion);

  const layout = () => {
    const nn = groups.current.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(nn)));
    const rows = Math.ceil(nn / cols);
    const sx = 2.6;
    const sy = 3.5;
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
      coreM.position.z = -DEPTH / 2;
      coreM.frustumCulled = false;
      const frontM = new THREE.Mesh(shared.front, shared.mats[i % shared.mats.length]!);
      frontM.position.z = DEPTH / 2 + 0.002;
      frontM.frustumCulled = false;
      const backM = new THREE.Mesh(shared.front, shared.backMat);
      backM.position.z = -DEPTH / 2 - 0.002;
      backM.rotation.y = Math.PI;
      backM.frustumCulled = false;
      card.add(coreM, frontM, backM);
      groups.current.push(card);
      g.add(card);
    }
    filled.current = Math.max(filled.current, count);
    layout();
  };

  useRamp({ target: 50, step: 6, max: 1000, start: 6, grow, onStats, runId });

  return (
    <>
      <color attach="background" args={['#070811']} />
      <Studio />
      <group ref={grp} />
      <EffectComposer>
        <Bloom intensity={0.4} luminanceThreshold={0.72} mipmapBlur />
      </EffectComposer>
      <OrbitControls enablePan={false} minDistance={6} maxDistance={40} />
    </>
  );
}

export function HoloCardsBench({ onStats, runId }: BenchProps) {
  const mode = useHoloStore((s) => s.mode);
  const shared = useMemo<Shared>(() => {
    const tex = makeTextures();
    const mats = makeMaterials(tex);
    const front = new THREE.ShapeGeometry(roundedRectShape(CW - 0.04, CH - 0.04, RAD - 0.02), 16);
    remapUV(front, CW - 0.04, CH - 0.04);
    const core = new THREE.ExtrudeGeometry(roundedRectShape(CW, CH, RAD), { depth: DEPTH, bevelEnabled: false });
    const coreMat = new THREE.MeshStandardMaterial({ color: '#0a0a12', roughness: 0.5, metalness: 0.15 });
    const backMat = new THREE.MeshStandardMaterial({ map: tex.cardBack, roughness: 0.42, metalness: 0.32 });
    return {
      front,
      core,
      mats,
      coreMat,
      backMat,
      tex,
      textures: [tex.albedo, tex.holoMask, tex.whiteInk, tex.foilPattern, tex.height, tex.emboss, tex.cardBack],
    };
  }, []);

  useEffect(() => {
    return () => {
      shared.front.dispose();
      shared.core.dispose();
      shared.coreMat.dispose();
      shared.backMat.dispose();
      shared.mats.forEach((m) => m.dispose());
      shared.textures.forEach((t) => t.dispose());
    };
  }, [shared]);

  return mode === 'hero' ? (
    <HeroMode onStats={onStats} runId={runId} shared={shared} />
  ) : (
    <GridMode onStats={onStats} runId={runId} shared={shared} />
  );
}
