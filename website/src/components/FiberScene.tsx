'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ── Config ───────────────────────────────────────────────────────────────── */
const FIBER_COUNT   = 180;
const FIBER_SEGS    = 24;   // tube segments (low = perf, still smooth)
const FIBER_RADIUS  = 0.004;

// Color palette — left tip: sky blue → right tip: gold/violet
const COLOR_LEFT  = new THREE.Color('#38bdf8');
const COLOR_MID   = new THREE.Color('#ffffff');
const COLOR_RIGHT = new THREE.Color('#f0a832');

/* ── Seeded random (stable across re-renders) ─────────────────────────────── */
function seededRand(seed: number) {
  const s = Math.sin(seed * 9301 + 49297) * 233280;
  return s - Math.floor(s);
}

/* ── Build fiber geometry ────────────────────────────────────────────────── */
function buildFiber(index: number): THREE.TubeGeometry {
  const r = (n: number) => seededRand(index * 100 + n);

  const spread  = 2.2;
  const startX  = -4.5 - r(1) * 1.5;
  const startY  = (r(2) - 0.5) * spread;
  const startZ  = (r(3) - 0.5) * 0.8;

  const endX    = 4.5 + r(4) * 1.5;
  const endY    = (r(5) - 0.5) * spread;
  const endZ    = (r(6) - 0.5) * 0.8;

  // Middle control points — fibres converge slightly at centre
  const midY    = (startY + endY) * 0.3 + (r(7) - 0.5) * 0.4;
  const midZ    = (startZ + endZ) * 0.3 + (r(8) - 0.5) * 0.3;

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(startX,          startY,          startZ),
    new THREE.Vector3(startX * 0.55,   startY * 0.6,    startZ * 0.6),
    new THREE.Vector3(0,               midY,            midZ),
    new THREE.Vector3(endX   * 0.55,   endY   * 0.6,    endZ   * 0.6),
    new THREE.Vector3(endX,            endY,            endZ),
  ]);

  return new THREE.TubeGeometry(curve, FIBER_SEGS, FIBER_RADIUS, 4, false);
}

/* ── Per-fiber vertex colours (gradient left→mid→right) ─────────────────── */
function colorFiber(geo: THREE.TubeGeometry): void {
  const pos    = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmpX   = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    tmpX.fromBufferAttribute(pos, i);
    // t: 0 = leftmost, 1 = rightmost
    const t   = Math.max(0, Math.min(1, (tmpX.x + 6) / 12));
    const col = new THREE.Color();
    if (t < 0.5) {
      col.lerpColors(COLOR_LEFT, COLOR_MID, t * 2);
    } else {
      col.lerpColors(COLOR_MID, COLOR_RIGHT, (t - 0.5) * 2);
    }
    col.toArray(colors, i * 3);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/* ── Single fiber mesh ───────────────────────────────────────────────────── */
function Fiber({ index }: { index: number }) {
  const geo = useMemo(() => {
    const g = buildFiber(index);
    colorFiber(g);
    return g;
  }, [index]);

  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors transparent opacity={0.85} />
    </mesh>
  );
}

/* ── Group that holds all fibers + mouse parallax ────────────────────────── */
function FiberGroup() {
  const groupRef  = useRef<THREE.Group>(null!);
  const { gl }    = useThree();
  const mouseRef  = useRef({ x: 0, y: 0 });

  // Track mouse over the canvas
  useMemo(() => {
    const canvas = gl.domElement;
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width  - 0.5) * 2,
        y: ((e.clientY - rect.top)  / rect.height - 0.5) * 2,
      };
    };
    canvas.addEventListener('mousemove', onMove);
    return () => canvas.removeEventListener('mousemove', onMove);
  }, [gl]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = groupRef.current;

    // Gentle wave breathing
    g.rotation.z = Math.sin(t * 0.15) * 0.04;
    g.rotation.x = Math.sin(t * 0.12) * 0.025;

    // Mouse parallax (smooth lerp)
    g.rotation.y += (mouseRef.current.x * 0.12 - g.rotation.y) * 0.03;
    g.position.y += (-mouseRef.current.y * 0.15 - g.position.y) * 0.03;
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: FIBER_COUNT }, (_, i) => (
        <Fiber key={i} index={i} />
      ))}
    </group>
  );
}

/* ── Canvas export ────────────────────────────────────────────────────────── */
export default function FiberScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
      dpr={[1, 1.5]}
      gl={{ antialias: false, alpha: true }}
    >
      <FiberGroup />
      <EffectComposer>
        <Bloom
          intensity={1.6}
          luminanceThreshold={0.05}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
