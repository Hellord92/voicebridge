'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ── Config ─────────────────────────────────────────────────────────────── */
const COUNT = 200;

/* Seeded random — stable, no re-render jitter */
function sr(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* Build one fiber: flows left → right, fans at edges, converges at centre */
function makeFiber(i: number): THREE.CatmullRomCurve3 {
  const spread = 2.8;
  const depth  = 2.2;

  // left endpoint (off-screen left)
  const lx = -7 - sr(i * 7 + 0) * 2;
  const ly = (sr(i * 7 + 1) - 0.5) * spread;
  const lz = (sr(i * 7 + 2) - 0.5) * depth;

  // right endpoint (off-screen right)
  const rx = 7 + sr(i * 7 + 3) * 2;
  const ry = (sr(i * 7 + 4) - 0.5) * spread;
  const rz = (sr(i * 7 + 5) - 0.5) * depth;

  // middle — pull toward centre axis (y≈0, z≈0) for convergence
  const mx = 0;
  const my = (ly + ry) * 0.18 + (sr(i * 7 + 6) - 0.5) * 0.3;
  const mz = (lz + rz) * 0.18 + (sr(i * 7 + 7) - 0.5) * 0.3;

  // quarter-way control points for smooth S-curve
  const l2x = lx * 0.4;
  const l2y = ly * 0.5 + my * 0.5;
  const l2z = lz * 0.5 + mz * 0.5;

  const r2x = rx * 0.4;
  const r2y = ry * 0.5 + my * 0.5;
  const r2z = rz * 0.5 + mz * 0.5;

  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(lx,  ly,  lz),
    new THREE.Vector3(l2x, l2y, l2z),
    new THREE.Vector3(mx,  my,  mz),
    new THREE.Vector3(r2x, r2y, r2z),
    new THREE.Vector3(rx,  ry,  rz),
  ], false, 'catmullrom', 0.5);
}

/* ── Color palette ─────────────────────────────────────────────────────── */
// Shift from cool blue/white on left → warm gold on right
const C_LEFT   = new THREE.Color('#a8d8ff');  // pale ice blue
const C_MID    = new THREE.Color('#ffffff');  // bright white at centre
const C_RIGHT  = new THREE.Color('#ffb347');  // warm amber/gold

function applyGradient(geo: THREE.TubeGeometry) {
  const pos    = geo.attributes.position as THREE.BufferAttribute;
  const cols   = new Float32Array(pos.count * 3);
  const v      = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // t: 0=left, 1=right, based on X range -9 … +9
    const t   = Math.max(0, Math.min(1, (v.x + 9) / 18));
    const col = new THREE.Color();
    if (t < 0.45) {
      col.lerpColors(C_LEFT, C_MID, t / 0.45);
    } else {
      col.lerpColors(C_MID, C_RIGHT, (t - 0.45) / 0.55);
    }
    col.toArray(cols, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

/* ── Mesh per fiber ────────────────────────────────────────────────────── */
function Fiber({ idx }: { idx: number }) {
  const geo = useMemo(() => {
    const curve = makeFiber(idx);
    // Thin fibers look better — vary thickness slightly
    const radius = 0.003 + sr(idx * 13) * 0.004;
    const g = new THREE.TubeGeometry(curve, 40, radius, 4, false);
    applyGradient(g);
    return g;
  }, [idx]);

  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors transparent opacity={0.75} />
    </mesh>
  );
}

/* ── Scene group with mouse parallax ──────────────────────────────────── */
function Scene() {
  const grp   = useRef<THREE.Group>(null!);
  const mouse = useRef({ x: 0, y: 0 });
  const { gl } = useThree();

  useMemo(() => {
    const el = gl.domElement;
    const fn = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      mouse.current = {
        x: (e.clientX - r.left) / r.width  * 2 - 1,
        y: (e.clientY - r.top)  / r.height * 2 - 1,
      };
    };
    el.addEventListener('mousemove', fn);
    return () => el.removeEventListener('mousemove', fn);
  }, [gl]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = grp.current;
    // Very slow drift
    g.rotation.z = Math.sin(t * 0.08) * 0.05;
    // Mouse: tilt along Y and X gently
    g.rotation.y += (mouse.current.x * 0.18 - g.rotation.y) * 0.04;
    g.rotation.x += (-mouse.current.y * 0.09 - g.rotation.x) * 0.04;
  });

  return (
    <group ref={grp}>
      {Array.from({ length: COUNT }, (_, i) => <Fiber key={i} idx={i} />)}
    </group>
  );
}

/* ── Canvas ────────────────────────────────────────────────────────────── */
export default function FiberScene() {
  return (
    <Canvas
      camera={{ position: [0, 0.8, 5.5], fov: 55 }}
      style={{ width: '100%', height: '100%' }}
      dpr={[1, 1.5]}
      gl={{ antialias: false, alpha: true }}
    >
      <Scene />
      <EffectComposer>
        <Bloom
          intensity={2.2}
          luminanceThreshold={0.08}
          luminanceSmoothing={0.6}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
