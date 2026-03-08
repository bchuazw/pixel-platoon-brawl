import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { GRID_SIZE } from '@/game/types';
import * as THREE from 'three';

// Floating embers / ash particles for atmosphere
export function EmberParticles() {
  const count = 30;
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = Math.random() * GRID_SIZE;
      arr[i * 3 + 1] = Math.random() * 8 + 1;
      arr[i * 3 + 2] = Math.random() * GRID_SIZE;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos.array[i3] += Math.sin(t * 0.5 + i * 2) * 0.005;
      pos.array[i3 + 1] += 0.008;
      pos.array[i3 + 2] += Math.cos(t * 0.4 + i * 1.3) * 0.005;
      if (pos.array[i3 + 1] > 10) {
        pos.array[i3 + 1] = 0.5;
        pos.array[i3] = Math.random() * GRID_SIZE;
        pos.array[i3 + 2] = Math.random() * GRID_SIZE;
      }
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#ff8844" size={0.05} transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

// Volumetric-style light shafts (god rays approximation)
export function LightShafts() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.03 + Math.sin(t * 0.3) * 0.015;
  });

  return (
    <mesh ref={ref} position={[GRID_SIZE / 2, 8, GRID_SIZE / 2]} rotation={[0, 0, 0.3]}>
      <cylinderGeometry args={[0.5, 12, 18, 8, 1, true]} />
      <meshBasicMaterial color="#ffe8c0" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// Ground fog layer
export function GroundFog() {
  const count = 12;
  const refs = useRef<THREE.Mesh[]>([]);

  const fogData = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      x: Math.random() * GRID_SIZE,
      z: Math.random() * GRID_SIZE,
      scale: 3 + Math.random() * 4,
      speed: 0.1 + Math.random() * 0.15,
      offset: Math.random() * Math.PI * 2,
    })), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const d = fogData[i];
      mesh.position.x = d.x + Math.sin(t * d.speed + d.offset) * 2;
      mesh.position.z = d.z + Math.cos(t * d.speed * 0.7 + d.offset) * 2;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.06 + Math.sin(t * 0.5 + d.offset) * 0.03;
    });
  });

  return (
    <>
      {fogData.map((d, i) => (
        <mesh
          key={i}
          ref={el => { if (el) refs.current[i] = el; }}
          position={[d.x, 0.15, d.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[d.scale, 8]} />
          <meshBasicMaterial color="#aabbaa" transparent opacity={0.06} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

// Distant trees silhouettes around the map
export function DistantTrees() {
  const trees = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const dist = 22 + Math.random() * 10;
      return {
        x: GRID_SIZE / 2 + Math.cos(angle) * dist,
        z: GRID_SIZE / 2 + Math.sin(angle) * dist,
        height: 2 + Math.random() * 3,
        width: 0.8 + Math.random() * 1.2,
      };
    }), []);

  return (
    <>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          {/* Trunk */}
          <mesh position={[0, t.height * 0.3, 0]}>
            <cylinderGeometry args={[0.1, 0.15, t.height * 0.6, 4]} />
            <meshStandardMaterial color="#2a1a0a" roughness={1} />
          </mesh>
          {/* Canopy */}
          <mesh position={[0, t.height * 0.7, 0]}>
            <coneGeometry args={[t.width, t.height * 0.6, 5]} />
            <meshStandardMaterial color="#1a3a12" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}
