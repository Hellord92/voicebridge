'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ── Sound-wave ring (single) ─────────────────────────────────────────────── */
function Ring({ offset, y }: { offset: number; y: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame(({ clock }) => {
    const t = ((clock.elapsedTime * 0.55 + offset) % 1);
    const scale = 1 + t * 2.2;
    ref.current.scale.setScalar(scale);
    mat.current.opacity = Math.max(0, 1 - t * 1.4);
  });

  return (
    <mesh ref={ref} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.26, 0.007, 8, 64]} />
      <meshBasicMaterial ref={mat} color="#00c8ff" transparent wireframe />
    </mesh>
  );
}

/* ── 3D Microphone ────────────────────────────────────────────────────────── */
function Mic() {
  const grp   = useRef<THREE.Group>(null!);
  const pulse = useRef<THREE.PointLight>(null!);
  const mouse = useRef({ x: 0, y: 0 });
  const { gl } = useThree();

  /* Track mouse over canvas */
  useMemo(() => {
    const el = gl.domElement;
    const fn = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      mouse.current.x = ((e.clientX - r.left) / r.width  - 0.5) * 2;
      mouse.current.y = ((e.clientY - r.top)  / r.height - 0.5) * 2;
    };
    el.addEventListener('mousemove', fn);
    return () => el.removeEventListener('mousemove', fn);
  }, [gl]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = grp.current;
    /* Parallax — smooth lerp, max ±0.3 rad */
    const tx = Math.max(-0.3, Math.min(0.3,  mouse.current.x * 0.3));
    const ty = Math.max(-0.3, Math.min(0.3, -mouse.current.y * 0.2));
    g.rotation.y += (tx - g.rotation.y) * 0.05;
    g.rotation.x += (ty - g.rotation.x) * 0.05;
    /* Slow idle Y drift */
    g.rotation.y += Math.sin(t * 0.3) * 0.0015;
    /* Pulsing active point light */
    if (pulse.current) pulse.current.intensity = Math.sin(t * 2.5) * 0.8 + 2.0;
  });

  /* Stand arm curve (gooseneck) */
  const standCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.95, 0),
    new THREE.Vector3(0, -0.6,  0),
    new THREE.Vector3(0, -0.2,  0),
    new THREE.Vector3(0,  0.1,  0),
  ]), []);

  /* Cable drooping off base */
  const cableCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.15, -1.05, 0),
    new THREE.Vector3(0.35, -1.35, 0.1),
    new THREE.Vector3(0.5,  -1.7,  0.2),
    new THREE.Vector3(0.3,  -2.1,  0.0),
  ]), []);

  const standGeo  = useMemo(() => new THREE.TubeGeometry(standCurve, 20, 0.025, 8, false), [standCurve]);
  const cableGeo  = useMemo(() => new THREE.TubeGeometry(cableCurve, 24, 0.014, 6, false), [cableCurve]);

  /* PBR materials */
  const matBody   = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.9, roughness: 0.2 }), []);
  const matGrille = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x252535, metalness: 0.95, roughness: 0.08, envMapIntensity: 1.2 }), []);
  const matStand  = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x9090a8, metalness: 1.0, roughness: 0.04 }), []);
  const matBase   = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.8, roughness: 0.28 }), []);
  const matCable  = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x0d0d18, metalness: 0.3, roughness: 0.8  }), []);
  const matGlow   = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x00c8ff, emissive: new THREE.Color(0x00c8ff), emissiveIntensity: 2.2, metalness: 0, roughness: 0 }), []);

  return (
    <group ref={grp} position={[0, 0.2, 0]}>
      {/* Pulsing "active" point light at grille */}
      <pointLight ref={pulse} position={[0, 0.75, 0.3]} color="#00c8ff" intensity={2.0} distance={3} />

      {/* Base */}
      <mesh position={[0, -1.05, 0]} material={matBase}>
        <cylinderGeometry args={[0.42, 0.42, 0.07, 40]} />
      </mesh>
      {/* Base bevel ring */}
      <mesh position={[0, -1.01, 0]} rotation={[Math.PI/2, 0, 0]} material={matStand}>
        <torusGeometry args={[0.4, 0.012, 12, 60]} />
      </mesh>

      {/* Stand arm */}
      <mesh geometry={standGeo} material={matStand} />

      {/* Body */}
      <mesh position={[0, -0.28, 0]} material={matBody}>
        <cylinderGeometry args={[0.17, 0.21, 1.16, 32]} />
      </mesh>
      {/* Body band rings */}
      {[-0.55, -0.28, 0.0].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI/2,0,0]} material={matStand}>
          <torusGeometry args={[0.18, 0.008, 8, 40]} />
        </mesh>
      ))}

      {/* Grille capsule (sphere, top portion) */}
      <mesh position={[0, 0.58, 0]} material={matGrille}>
        <sphereGeometry args={[0.21, 40, 40]} />
      </mesh>
      {/* Grille mesh lines overlay (wireframe look) */}
      <mesh position={[0, 0.58, 0]}>
        <sphereGeometry args={[0.212, 16, 16]} />
        <meshBasicMaterial color="#3a3a5a" wireframe transparent opacity={0.35} />
      </mesh>

      {/* Glow ring around grille */}
      <mesh position={[0, 0.52, 0]} rotation={[Math.PI/2, 0, 0]} material={matGlow}>
        <torusGeometry args={[0.225, 0.011, 16, 64]} />
      </mesh>
      {/* Second softer glow ring */}
      <mesh position={[0, 0.52, 0]} rotation={[Math.PI/2, 0, 0]}>
        <torusGeometry args={[0.235, 0.007, 8, 64]} />
        <meshBasicMaterial color="#00c8ff" transparent opacity={0.4} />
      </mesh>

      {/* Sound wave rings */}
      <Ring offset={0}    y={0.52} />
      <Ring offset={0.33} y={0.52} />
      <Ring offset={0.66} y={0.52} />

      {/* Cable */}
      <mesh geometry={cableGeo} material={matCable} />
    </group>
  );
}

/* ── Scene (lighting + floor) ─────────────────────────────────────────────── */
function Scene() {
  return (
    <>
      {/* Lighting */}
      <ambientLight color={0x0a0a1a} intensity={0.6} />
      {/* Key light — top-left warm white */}
      <pointLight position={[-2, 3, 2]} color="#ffffff" intensity={5} />
      {/* Rim light — cyan from top-right */}
      <pointLight position={[2.5, 2, -1]} color="#00c8ff" intensity={3.5} />
      {/* Fill — purple from behind-below */}
      <pointLight position={[0, -1, -3]} color="#7c3aed" intensity={2} />

      {/* Mirror floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.09, 0]}>
        <planeGeometry args={[8, 8]} />
        <MeshReflectorMaterial
          blur={[300, 100]}
          resolution={512}
          mixBlur={0.9}
          mixStrength={0.6}
          roughness={0.4}
          depthScale={1.2}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#050510"
          metalness={0.9}
          mirror={0.8}
        />
      </mesh>

      <Mic />

      <EffectComposer>
        <Bloom intensity={1.4} luminanceThreshold={0.1} luminanceSmoothing={0.5} mipmapBlur />
      </EffectComposer>
    </>
  );
}

/* ── Canvas export ────────────────────────────────────────────────────────── */
export default function MicScene() {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 3.8], fov: 42 }}
      style={{ width: '100%', height: '100%' }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
    >
      <Scene />
    </Canvas>
  );
}
