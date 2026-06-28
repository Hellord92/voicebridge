'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ── Arc connections between world cities ────────────────────────────────── */
const ARCS: Array<{ from: [number,number]; to: [number,number]; color: string }> = [
  { from: [39.9, 32.8],  to: [51.5, -0.1],   color: '#00c8ff' },
  { from: [39.9, 32.8],  to: [35.7, 139.7],  color: '#7c3aed' },
  { from: [48.8, 2.3],   to: [39.9, 32.8],   color: '#00c8ff' },
  { from: [52.5, 13.4],  to: [22.3, 114.2],  color: '#7c3aed' },
  { from: [40.7, -74.0], to: [48.8, 2.3],    color: '#00e5ff' },
  { from: [35.7, 139.7], to: [55.7, 37.6],   color: '#a78bfa' },
  { from: [-23.5,-46.6], to: [40.7, -74.0],  color: '#00c8ff' },
  { from: [1.3, 103.8],  to: [28.6, 77.2],   color: '#7c3aed' },
  { from: [55.7, 37.6],  to: [52.5, 13.4],   color: '#00e5ff' },
  { from: [28.6, 77.2],  to: [51.5, -0.1],   color: '#a78bfa' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function ll2v(lat: number, lon: number, r = 1.02): THREE.Vector3 {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function arcPoints(from: [number,number], to: [number,number], segs = 48): THREE.Vector3[] {
  const p1   = ll2v(...from);
  const p2   = ll2v(...to);
  const ctrl = new THREE.Vector3().addVectors(p1, p2)
    .multiplyScalar(0.5).normalize().multiplyScalar(1.6);
  return new THREE.QuadraticBezierCurve3(p1, ctrl, p2).getPoints(segs);
}

/* ── Country dots ─────────────────────────────────────────────────────────── */
const DOT_POSITIONS = Array.from(
  new Set(ARCS.flatMap(a => [a.from.join(), a.to.join()])),
).map(k => { const [la, lo] = k.split(',').map(Number); return ll2v(la, lo, 1.025); });

/* ── Arc + traveling dot ──────────────────────────────────────────────────── */
function Arc({ from, to, color, offset }: {
  from: [number,number]; to: [number,number]; color: string; offset: number;
}) {
  const dotRef = useRef<THREE.Mesh>(null!);
  const tRef   = useRef(offset);
  const pts    = useMemo(() => arcPoints(from, to), [from, to]);

  useFrame((_, dt) => {
    tRef.current = (tRef.current + dt * 0.25) % 1;
    const idx = Math.min(Math.floor(tRef.current * (pts.length - 1)), pts.length - 2);
    const p = pts[idx];
    dotRef.current.position.set(p.x, p.y, p.z);
  });

  return (
    <group>
      <Line points={pts} color={color} lineWidth={1} transparent opacity={0.45} />
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

/* ── Particle cloud ───────────────────────────────────────────────────────── */
function Particles({ count = 1400 }) {
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 1.25 + Math.random() * 0.9;
      pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.cos(phi);
      pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);

  return (
    <points geometry={geo}>
      <pointsMaterial size={0.012} color="#00c8ff" transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

/* ── Globe mesh ───────────────────────────────────────────────────────────── */
function Globe() {
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

  useFrame((_, dt) => {
    const g = grp.current;
    g.rotation.y += dt * 0.09;
    // Tilt toward mouse
    g.rotation.x += (-mouse.current.y * 0.3 - g.rotation.x) * 0.05;
    g.rotation.z += ( mouse.current.x * 0.15 - g.rotation.z) * 0.05;
  });

  return (
    <group ref={grp}>
      {/* Core sphere */}
      <mesh>
        <icosahedronGeometry args={[1, 8]} />
        <meshStandardMaterial color="#050a18" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Wireframe */}
      <mesh>
        <icosahedronGeometry args={[1.002, 8]} />
        <meshBasicMaterial color="#0ea5e9" wireframe transparent opacity={0.07} />
      </mesh>
      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[1.15, 32, 32]} />
        <meshBasicMaterial color="#00c8ff" transparent opacity={0.025} side={THREE.BackSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.08, 32, 32]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.015} side={THREE.BackSide} />
      </mesh>

      {/* Arcs */}
      {ARCS.map((a, i) => (
        <Arc key={i} from={a.from} to={a.to} color={a.color} offset={i / ARCS.length} />
      ))}

      {/* City dots */}
      {DOT_POSITIONS.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[0.012, 6, 6]} />
          <meshBasicMaterial color="#00c8ff" />
        </mesh>
      ))}

      {/* Particles */}
      <Particles />
    </group>
  );
}

/* ── Export ───────────────────────────────────────────────────────────────── */
export default function GlobeHero() {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 3.0], fov: 44 }}
      style={{ width: '100%', height: '100%' }}
      dpr={[1, 2]}
      gl={{ antialias: false, alpha: true }}
    >
      <ambientLight intensity={0.2} />
      <pointLight position={[4, 6, 4]} intensity={1.8} color="#00c8ff" />
      <pointLight position={[-4, -4, -4]} intensity={0.6} color="#7c3aed" />
      <Globe />
      <EffectComposer>
        <Bloom intensity={1.8} luminanceThreshold={0.06} luminanceSmoothing={0.5} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
