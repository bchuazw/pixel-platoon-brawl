import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { GRID_SIZE } from '@/game/types';
import * as THREE from 'three';

// ── Rain Particles ──
export function RainParticles() {
  const count = 800;
  const ref = useRef<THREE.Points>(null);

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * (GRID_SIZE + 20) - 10;
      pos[i * 3 + 1] = Math.random() * 25;
      pos[i * 3 + 2] = Math.random() * (GRID_SIZE + 20) - 10;
      vel[i] = 12 + Math.random() * 8;
    }
    return [pos, vel];
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos.array[i3 + 1] -= velocities[i] * delta;
      pos.array[i3] -= delta * 2; // Wind drift
      if (pos.array[i3 + 1] < -0.5) {
        pos.array[i3 + 1] = 20 + Math.random() * 5;
        pos.array[i3] = Math.random() * (GRID_SIZE + 20) - 10;
        pos.array[i3 + 2] = Math.random() * (GRID_SIZE + 20) - 10;
      }
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        color="#99bbdd"
        size={0.03}
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── Floating embers / ash particles ──
export function EmberParticles() {
  const count = 50;
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
      pos.array[i3] += Math.sin(t * 0.5 + i * 2) * 0.006;
      pos.array[i3 + 1] += 0.006;
      pos.array[i3 + 2] += Math.cos(t * 0.4 + i * 1.3) * 0.006;
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
      <pointsMaterial color="#ff6622" size={0.06} transparent opacity={0.5} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

// ── Volumetric-style light shafts (god rays) ──
export function LightShafts() {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.children.forEach((child, i) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.015 + Math.sin(t * 0.2 + i * 1.5) * 0.01;
    });
    ref.current.rotation.y = Math.sin(t * 0.05) * 0.02;
  });

  return (
    <group ref={ref}>
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[GRID_SIZE / 2 + (i - 1) * 8, 10, GRID_SIZE / 2 + (i - 1) * 3]} rotation={[0, i * 0.4, 0.2 + i * 0.15]}>
          <cylinderGeometry args={[0.3, 14, 22, 6, 1, true]} />
          <meshBasicMaterial color="#ffe8c0" transparent opacity={0.02} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

// ── Ground fog layer - volumetric-style ──
export function GroundFog() {
  const count = 20;
  const refs = useRef<THREE.Mesh[]>([]);

  const fogData = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      x: Math.random() * GRID_SIZE,
      z: Math.random() * GRID_SIZE,
      scale: 4 + Math.random() * 6,
      speed: 0.08 + Math.random() * 0.1,
      offset: Math.random() * Math.PI * 2,
      height: 0.1 + Math.random() * 0.3,
    })), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const d = fogData[i];
      mesh.position.x = d.x + Math.sin(t * d.speed + d.offset) * 3;
      mesh.position.z = d.z + Math.cos(t * d.speed * 0.7 + d.offset) * 3;
      mesh.position.y = d.height + Math.sin(t * 0.3 + d.offset) * 0.05;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.04 + Math.sin(t * 0.4 + d.offset) * 0.02;
    });
  });

  return (
    <>
      {fogData.map((d, i) => (
        <mesh
          key={i}
          ref={el => { if (el) refs.current[i] = el; }}
          position={[d.x, d.height, d.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[d.scale, 12]} />
          <meshBasicMaterial color="#8899aa" transparent opacity={0.04} depthWrite={false} side={THREE.DoubleSide} blending={THREE.NormalBlending} />
        </mesh>
      ))}
    </>
  );
}

// ── Distant trees silhouettes ──
export function DistantTrees() {
  const trees = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => {
      const angle = (i / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const dist = 20 + Math.random() * 15;
      return {
        x: GRID_SIZE / 2 + Math.cos(angle) * dist,
        z: GRID_SIZE / 2 + Math.sin(angle) * dist,
        height: 2.5 + Math.random() * 4,
        width: 0.8 + Math.random() * 1.5,
        rotation: Math.random() * 0.3,
      };
    }), []);

  return (
    <>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          {/* Trunk */}
          <mesh position={[0, t.height * 0.3, 0]}>
            <cylinderGeometry args={[0.08, 0.14, t.height * 0.6, 5]} />
            <meshStandardMaterial color="#1a120a" roughness={1} />
          </mesh>
          {/* Canopy layers */}
          <mesh position={[0, t.height * 0.6, 0]} rotation={[0, t.rotation, 0]}>
            <coneGeometry args={[t.width * 0.9, t.height * 0.4, 6]} />
            <meshStandardMaterial color="#0e2a08" roughness={1} />
          </mesh>
          <mesh position={[0, t.height * 0.8, 0]} rotation={[0, t.rotation + 0.5, 0]}>
            <coneGeometry args={[t.width * 0.6, t.height * 0.35, 5]} />
            <meshStandardMaterial color="#132e0c" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ── Animated Clouds ──
export function CloudLayer() {
  const ref = useRef<THREE.Group>(null);
  const clouds = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      x: Math.random() * 80 - 20,
      z: Math.random() * 80 - 20,
      y: 18 + Math.random() * 8,
      scale: 6 + Math.random() * 12,
      speed: 0.15 + Math.random() * 0.15,
    })), []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.children.forEach((child, i) => {
      const c = clouds[i];
      if (!c) return;
      child.position.x = c.x + t * c.speed;
      if (child.position.x > 60) child.position.x = -30;
    });
  });

  return (
    <group ref={ref}>
      {clouds.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[c.scale, c.scale * 0.6]} />
          <meshBasicMaterial color="#2a3a4a" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// ── Puddles for rain realism ──
export function RainPuddles() {
  const puddles = useMemo(() =>
    Array.from({ length: 15 }, () => ({
      x: Math.random() * GRID_SIZE - 0.5,
      z: Math.random() * GRID_SIZE - 0.5,
      scale: 0.3 + Math.random() * 0.6,
    })), []);

  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.children.forEach((child, i) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.opacity = 0.2 + Math.sin(t * 2 + i) * 0.05;
    });
  });

  return (
    <group ref={ref}>
      {puddles.map((p, i) => (
        <mesh key={i} position={[p.x, 0.01, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[p.scale, 12]} />
          <meshStandardMaterial
            color="#2a4a6a"
            metalness={0.9}
            roughness={0.1}
            transparent
            opacity={0.25}
          />
        </mesh>
      ))}
    </group>
  );
}
