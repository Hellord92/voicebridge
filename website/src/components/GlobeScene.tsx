'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';

/* ── Connection data (lat, lon) ───────────────────────────────────────────── */
const CONNECTIONS: Array<{ from: [number, number]; to: [number, number]; color: string }> = [
  { from: [39.9, 32.8],   to: [51.5, -0.1],    color: '#38bdf8' }, // Ankara → London
  { from: [39.9, 32.8],   to: [35.7, 139.7],   color: '#a78bfa' }, // Ankara → Tokyo
  { from: [48.8, 2.3],    to: [39.9, 32.8],    color: '#34d399' }, // Paris → Ankara
  { from: [52.5, 13.4],   to: [22.3, 114.2],   color: '#f472b6' }, // Berlin → HK
  { from: [40.7, -74.0],  to: [48.8, 2.3],     color: '#38bdf8' }, // NYC → Paris
  { from: [35.7, 139.7],  to: [55.7, 37.6],    color: '#fb923c' }, // Tokyo → Moscow
  { from: [-23.5, -46.6], to: [40.7, -74.0],   color: '#a78bfa' }, // São Paulo → NYC
  { from: [1.3, 103.8],   to: [28.6, 77.2],    color: '#34d399' }, // Singapore → Delhi
  { from: [55.7, 37.6],   to: [52.5, 13.4],    color: '#fbbf24' }, // Moscow → Berlin
  { from: [28.6, 77.2],   to: [51.5, -0.1],    color: '#f472b6' }, // Delhi → London
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function latlonToVec3(lat: number, lon: number, r = 1.01): THREE.Vector3 {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function buildArcPoints(from: [number, number], to: [number, number], segs = 60): THREE.Vector3[] {
  const p1   = latlonToVec3(...from);
  const p2   = latlonToVec3(...to);
  const ctrl = new THREE.Vector3()
    .addVectors(p1, p2)
    .multiplyScalar(0.5)
    .normalize()
    .multiplyScalar(1.55);
  return new THREE.QuadraticBezierCurve3(p1, ctrl, p2).getPoints(segs);
}

/* ── Unique country dots ──────────────────────────────────────────────────── */
const ALL_POINTS = Array.from(
  new Set(CONNECTIONS.flatMap(c => [c.from.join(','), c.to.join(',')])),
).map(key => {
  const [lat, lon] = key.split(',').map(Number);
  return latlonToVec3(lat, lon, 1.03);
});

/* ── Arc with animated traveling dot ─────────────────────────────────────── */
function Arc({ from, to, color, offset }: {
  from: [number, number]; to: [number, number]; color: string; offset: number;
}) {
  const dotRef  = useRef<THREE.Mesh>(null!);
  const tRef    = useRef(offset);
  const points  = useMemo(() => buildArcPoints(from, to), [from, to]);

  useFrame((_, delta) => {
    tRef.current = (tRef.current + delta * 0.22) % 1;
    const idx = Math.min(Math.floor(tRef.current * (points.length - 1)), points.length - 1);
    const p   = points[idx];
    dotRef.current.position.set(p.x, p.y, p.z);
  });

  return (
    <group>
      <Line points={points} color={color} lineWidth={1.2} transparent opacity={0.55} />
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

/* ── Globe mesh (auto-rotating group) ────────────────────────────────────── */
function GlobeMesh() {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    groupRef.current.rotation.y += delta * 0.07;
  });

  return (
    <group ref={groupRef}>
      {/* Core sphere */}
      <mesh>
        <sphereGeometry args={[1, 72, 72]} />
        <meshStandardMaterial color="#071528" roughness={1} metalness={0.1} />
      </mesh>

      {/* Latitude / longitude grid */}
      <mesh>
        <sphereGeometry args={[1.002, 36, 18]} />
        <meshBasicMaterial color="#1d4ed8" wireframe transparent opacity={0.09} />
      </mesh>

      {/* Outer atmosphere */}
      <mesh>
        <sphereGeometry args={[1.12, 32, 32]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.035} side={THREE.BackSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.06, 32, 32]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.02} side={THREE.BackSide} />
      </mesh>

      {/* Arcs */}
      {CONNECTIONS.map((c, i) => (
        <Arc
          key={i}
          from={c.from}
          to={c.to}
          color={c.color}
          offset={i / CONNECTIONS.length}
        />
      ))}

      {/* Country dots */}
      {ALL_POINTS.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[0.013, 8, 8]} />
          <meshBasicMaterial color="#7dd3fc" />
        </mesh>
      ))}
    </group>
  );
}

/* ── Canvas export ────────────────────────────────────────────────────────── */
export default function GlobeScene() {
  return (
    <Canvas
      camera={{ position: [0, 0.3, 2.7], fov: 42 }}
      style={{ width: '100%', height: '100%' }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.25} />
      <pointLight position={[4, 6, 4]}  intensity={1.4} color="#60a5fa" />
      <pointLight position={[-4, -4, -4]} intensity={0.5} color="#7c3aed" />
      <GlobeMesh />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={false}
        minPolarAngle={Math.PI * 0.25}
        maxPolarAngle={Math.PI * 0.75}
      />
    </Canvas>
  );
}
