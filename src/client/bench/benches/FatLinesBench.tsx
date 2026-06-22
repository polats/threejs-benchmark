import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { useRamp } from '../useRamp';
import type { BenchProps } from '../types';

// Fat-lines stress: Line2/LineGeometry/LineMaterial — true screen-space-width lines
// (each segment is GPU-expanded to a quad), unlike LineBasicMaterial. Ramp the
// line count; each is a wavy multi-segment curve with per-vertex colour.
const MAX = 6000;
const SEGS = 24;

export function FatLinesBench({ onStats, runId }: BenchProps) {
  const size = useThree((s) => s.size);
  const group = useRef<THREE.Group>(null);
  const filled = useRef(0);

  const material = useMemo(
    () =>
      new LineMaterial({
        color: 0xffffff,
        linewidth: 2.5,
        worldUnits: false,
        vertexColors: true,
        alphaToCoverage: true,
      }),
    []
  );

  useEffect(() => {
    material.resolution.set(size.width, size.height);
  }, [size, material]);

  const grow = (count: number) => {
    const g = group.current;
    if (!g) return;
    const c = new THREE.Color();
    for (let i = filled.current; i < count; i++) {
      const bx = (Math.random() - 0.5) * 13;
      const by = (Math.random() - 0.5) * 13;
      const bz = (Math.random() - 0.5) * 13;
      c.setHSL(Math.random(), 0.7, 0.55);
      const pts: number[] = [];
      const cols: number[] = [];
      for (let k = 0; k < SEGS; k++) {
        const t = k / (SEGS - 1);
        pts.push(bx + Math.sin(t * 6 + i) * 1.6, by + t * 3 - 1.5, bz + Math.cos(t * 6 + i) * 1.6);
        cols.push(c.r * (0.4 + t * 0.6), c.g * (0.4 + t * 0.6), c.b * (0.4 + t * 0.6));
      }
      const geom = new LineGeometry();
      geom.setPositions(pts);
      geom.setColors(cols);
      const line = new Line2(geom, material);
      line.computeLineDistances();
      g.add(line);
    }
    filled.current = Math.max(filled.current, count);
  };

  useRamp({ target: 50, step: 250, max: MAX, start: 250, grow, onStats, runId });

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.1;
  });

  return (
    <>
      <color attach="background" args={['#0a0d18']} />
      <group ref={group} />
      <OrbitControls enablePan={false} />
    </>
  );
}
