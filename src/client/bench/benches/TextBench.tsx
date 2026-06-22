import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FontLoader, type Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// 3D text stress: extruded glyph geometry (TextGeometry from a vendored typeface
// font — no worker, no CDN, unlike SDF/troika). A field of floating words; ramp
// the word count. Each word is a separate draw call of real glyph geometry.
const MAX = 1500;
const WORDS = ['THREE', 'WEBGL', 'BENCH', 'GPU', 'SHADER', 'MESH', 'RENDER', 'FPS', 'DRAW', 'VERTEX'];

function TextField({ font, onStats, runId }: BenchProps & { font: Font }) {
  const group = useRef<THREE.Group>(null);
  const filled = useRef(0);

  const geoms = useMemo(() => {
    return WORDS.map((w) => {
      const g = new TextGeometry(w, { font, size: 0.5, depth: 0.12, curveSegments: 3, bevelEnabled: false });
      g.center();
      return g;
    });
  }, [font]);

  const materials = useMemo(
    () =>
      Array.from(
        { length: 8 },
        (_, i) =>
          new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(i / 8, 0.6, 0.6),
            roughness: 0.4,
            metalness: 0.2,
          })
      ),
    []
  );

  const grow = (count: number) => {
    const g = group.current;
    if (!g) return;
    for (let i = filled.current; i < count; i++) {
      const m = new THREE.Mesh(geoms[i % geoms.length], materials[i % materials.length]);
      const r = 9 * Math.cbrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      m.position.set(
        r * Math.sin(ph) * Math.cos(th),
        r * Math.sin(ph) * Math.sin(th),
        r * Math.cos(ph)
      );
      m.rotation.set(0, Math.random() * Math.PI * 2, 0);
      const s = 0.6 + Math.random() * 0.8;
      m.scale.setScalar(s);
      g.add(m);
    }
    filled.current = Math.max(filled.current, count);
  };

  useRamp({ target: 50, step: 80, max: MAX, start: 80, grow, onStats, runId });

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.08;
  });

  return (
    <>
      <color attach="background" args={['#0a0d18']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} />
      <pointLight position={[-8, -4, -8]} intensity={70} color="#ffcc66" />
      <group ref={group} />
      <OrbitControls enablePan={false} />
    </>
  );
}

export function TextBench(props: BenchProps) {
  const [font, setFont] = useState<Font | null>(null);
  useEffect(() => {
    let alive = true;
    new FontLoader().load('fonts/helvetiker_regular.typeface.json', (f) => {
      if (alive) setFont(f);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!font) return null;
  return <TextField {...props} font={font} />;
}
