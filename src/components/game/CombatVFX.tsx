import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { CombatEvent } from '@/game/types';
import { playGunshot, playSniperShot, playHeavyShot, playImpact, playCrit, playMiss, playKill, playHeal, playExplosion, playAbility } from '@/game/sounds';
import * as THREE from 'three';

interface CombatVFXProps {
  events: CombatEvent[];
}

// Track which events we've already played sounds for
const playedSounds = new Set<string>();

function DamageNumber({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.position.y = 1.5 + t * 1.5;
    const opacity = Math.max(0, 1 - t / 2.5);
    ref.current.children.forEach(child => {
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.Material).opacity = opacity;
      }
    });
  });

  if (age > 2.5) return null;

  let color = '#ffffff';
  let text = '';
  let size = 0.18;

  switch (event.type) {
    case 'damage':
      color = '#ff8844'; text = `-${event.value}`; break;
    case 'crit':
      color = '#ff2222'; text = `CRIT! -${event.value}`; size = 0.28; break;
    case 'kill':
      color = '#ff0000'; text = `☠ ELIMINATED`; size = 0.3; break;
    case 'miss':
      color = '#8888aa'; text = 'MISS'; size = 0.2; break;
    case 'heal':
      color = '#44ff44'; text = `+${event.value}`; size = 0.22; break;
    case 'ability':
      color = '#ffaa00'; text = '⚡'; size = 0.22; break;
    case 'overwatch':
      color = '#44aaff'; text = '👁 OVERWATCH'; size = 0.18; break;
  }

  return (
    <group ref={ref} position={[event.targetPos.x, 1.5, event.targetPos.z]}>
      <Billboard>
        <Text fontSize={size} color={color} anchorX="center" anchorY="middle" font={undefined}
          outlineWidth={0.04} outlineColor="#000000">
          {text}
        </Text>
      </Billboard>
    </group>
  );
}

function MuzzleFlash({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    const scale = Math.max(0, (1 - t * 5)) * 0.6;
    ref.current.scale.setScalar(scale);
    ref.current.rotation.z += 0.3;
  });

  if (age > 0.25 || event.type === 'heal' || event.type === 'overwatch') return null;

  const dx = event.targetPos.x - event.attackerPos.x;
  const dz = event.targetPos.z - event.attackerPos.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  const nx = len > 0 ? dx / len : 0;
  const nz = len > 0 ? dz / len : 0;

  return (
    <group ref={ref} position={[event.attackerPos.x + nx * 0.4, 0.65, event.attackerPos.z + nz * 0.4]}>
      {/* Core flash */}
      <mesh>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>
      {/* Outer glow */}
      <mesh>
        <sphereGeometry args={[1.5, 8, 6]} />
        <meshBasicMaterial
          color={event.type === 'crit' || event.type === 'kill' ? '#ff4400' : '#ffcc00'}
          transparent opacity={0.5}
        />
      </mesh>
      {/* Light */}
      <pointLight color="#ffaa00" intensity={5} distance={4} />
    </group>
  );
}

function BulletTrail({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    // Bullet travels from attacker to target over 0.15s
    const bulletT = Math.min(1, t / 0.15);

    ref.current.children.forEach((child, i) => {
      if (i === 0) {
        // Bullet head
        const bx = THREE.MathUtils.lerp(event.attackerPos.x, event.targetPos.x, bulletT);
        const bz = THREE.MathUtils.lerp(event.attackerPos.z, event.targetPos.z, bulletT);
        child.position.set(bx, 0.6, bz);
        child.visible = bulletT < 1;
      }
    });

    // Fade trail
    const opacity = Math.max(0, 1 - t * 2.5);
    ref.current.children.forEach(child => {
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.Material).opacity = opacity;
      }
    });
  });

  if (age > 0.5 || event.type === 'heal' || event.type === 'overwatch' || event.type === 'ability') return null;

  const dx = event.targetPos.x - event.attackerPos.x;
  const dz = event.targetPos.z - event.attackerPos.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const midX = (event.attackerPos.x + event.targetPos.x) / 2;
  const midZ = (event.attackerPos.z + event.targetPos.z) / 2;

  return (
    <group ref={ref}>
      {/* Bullet */}
      <mesh position={[event.attackerPos.x, 0.6, event.attackerPos.z]}>
        <sphereGeometry args={[0.04, 6, 4]} />
        <meshBasicMaterial color="#ffee88" transparent opacity={1} />
      </mesh>
      {/* Trail line */}
      <mesh position={[midX, 0.6, midZ]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[len, 0.015, 0.015]} />
        <meshBasicMaterial
          color={event.type === 'miss' ? '#666688' : '#ffdd44'}
          transparent opacity={0.7}
        />
      </mesh>
      {/* Second trail (thinner, brighter) */}
      <mesh position={[midX, 0.6, midZ]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[len * 0.8, 0.005, 0.005]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function ImpactEffect({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    const impactT = Math.max(0, t - 0.1); // delay slightly after bullet arrives

    ref.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;

      if (i === 0) {
        // Expanding ring
        const scale = impactT * 4;
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.6 - impactT * 2);
      } else if (i === 1) {
        // Flash sphere
        const scale = Math.max(0, (0.3 - impactT) * 3);
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.8 - impactT * 3);
      }
    });
  });

  if (age > 0.6 || event.type === 'miss' || event.type === 'overwatch') return null;

  let ringColor = '#ff8800';
  let flashColor = '#ffcc44';
  if (event.type === 'kill') { ringColor = '#ff0000'; flashColor = '#ff4400'; }
  if (event.type === 'heal') { ringColor = '#44ff88'; flashColor = '#88ffaa'; }
  if (event.type === 'crit') { ringColor = '#ff4400'; flashColor = '#ff8800'; }

  return (
    <group ref={ref} position={[event.targetPos.x, 0.3, event.targetPos.z]}>
      {/* Impact ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.4, 16]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* Flash */}
      <mesh>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshBasicMaterial color={flashColor} transparent opacity={0.8} />
      </mesh>
      {/* Light flash */}
      <pointLight color={flashColor} intensity={3} distance={3} />
    </group>
  );
}

function ShellCasings({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;
  const shellDir = useRef(Math.random() > 0.5 ? 1 : -1);

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.children.forEach((child) => {
      child.position.y = 0.5 + t * 0.5 - t * t * 2;
      child.position.x = shellDir.current * t * 0.5;
      child.rotation.z += 0.2;
      const opacity = Math.max(0, 1 - t * 2);
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.Material).opacity = opacity;
      }
    });
  });

  if (age > 0.6 || event.type === 'heal' || event.type === 'overwatch' || event.type === 'ability') return null;

  return (
    <group ref={ref} position={[event.attackerPos.x, 0.5, event.attackerPos.z]}>
      <mesh>
        <cylinderGeometry args={[0.015, 0.015, 0.06, 4]} />
        <meshBasicMaterial color="#ccaa44" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function ExplosionEffect({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;
      if (i === 0) {
        // Fire sphere
        const scale = t * 3;
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.8 - t * 1.5);
      } else if (i === 1) {
        // Smoke
        const scale = t * 4;
        mesh.scale.setScalar(scale);
        mesh.position.y = t * 1.5;
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.4 - t * 0.5);
      }
    });
  });

  if (age > 0.8) return null;
  // Only for kill or ability events (grenades, etc.)
  if (event.type !== 'kill' && event.message?.includes('grenade') !== true) return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.2, event.targetPos.z]}>
      {/* Fire */}
      <mesh>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={0.8} />
      </mesh>
      {/* Smoke */}
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.25, 8, 6]} />
        <meshBasicMaterial color="#555555" transparent opacity={0.4} />
      </mesh>
      <pointLight color="#ff6600" intensity={8} distance={5} />
    </group>
  );
}

function MissRicochet({ event }: { event: CombatEvent }) {
  const sparks = useRef(
    Array.from({ length: 4 }, () => ({
      vx: (Math.random() - 0.5) * 2,
      vy: Math.random() * 2 + 1,
      vz: (Math.random() - 0.5) * 2,
    }))
  );
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.children.forEach((child, i) => {
      const spark = sparks.current[i];
      if (!spark) return;
      child.position.set(spark.vx * t, spark.vy * t - 4 * t * t, spark.vz * t);
      const opacity = Math.max(0, 1 - t * 3);
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.Material).opacity = opacity;
      }
    });
  });

  if (age > 0.4 || event.type !== 'miss') return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.4, event.targetPos.z]}>
      {sparks.current.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.02, 4, 4]} />
          <meshBasicMaterial color="#aaaacc" transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// Sound effect player component
function SoundPlayer({ event }: { event: CombatEvent }) {
  useEffect(() => {
    if (playedSounds.has(event.id)) return;
    playedSounds.add(event.id);

    // Clean old entries
    if (playedSounds.size > 100) {
      const arr = Array.from(playedSounds);
      arr.slice(0, 50).forEach(id => playedSounds.delete(id));
    }

    const delay = 150; // slight delay for aiming animation
    switch (event.type) {
      case 'damage': setTimeout(() => { playGunshot(); setTimeout(playImpact, 100); }, delay); break;
      case 'crit': setTimeout(() => { playSniperShot(); setTimeout(playCrit, 100); }, delay); break;
      case 'kill': setTimeout(() => { playHeavyShot(); setTimeout(playKill, 120); }, delay); break;
      case 'miss': setTimeout(() => { playGunshot(); setTimeout(playMiss, 100); }, delay); break;
      case 'heal': playHeal(); break;
      case 'ability': playAbility(); break;
      case 'overwatch': playAbility(); break;
    }
  }, [event.id, event.type]);

  return null;
}

export function CombatVFX({ events }: CombatVFXProps) {
  const recentEvents = events.filter(e => Date.now() - e.timestamp < 3000);

  return (
    <group>
      {recentEvents.map(event => (
        <group key={event.id}>
          <SoundPlayer event={event} />
          <DamageNumber event={event} />
          <MuzzleFlash event={event} />
          <BulletTrail event={event} />
          <ImpactEffect event={event} />
          <ShellCasings event={event} />
          <ExplosionEffect event={event} />
          <MissRicochet event={event} />
        </group>
      ))}
    </group>
  );
}
