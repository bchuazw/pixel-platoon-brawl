import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { CombatEvent } from '@/game/types';
import {
  playWeaponSound, playImpact, playCrit, playMiss, playKill,
  playHeal, playExplosion, playAbility, playOverwatch, playGrenade, playSmoke,
} from '@/game/sounds';
import * as THREE from 'three';

interface CombatVFXProps {
  events: CombatEvent[];
}

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
      color = '#44ff88'; text = `+${event.value}`; size = 0.24; break;
    case 'ability':
      color = '#ffaa00'; text = '⚡'; size = 0.22; break;
    case 'overwatch':
      color = '#44aaff'; text = '👁 OVERWATCH'; size = 0.18; break;
    case 'loot':
      color = '#ffcc44'; text = '📦 LOOT!'; size = 0.2; break;
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

  if (age > 0.25 || event.type === 'heal' || event.type === 'overwatch' || event.type === 'loot') return null;

  const dx = event.targetPos.x - event.attackerPos.x;
  const dz = event.targetPos.z - event.attackerPos.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  const nx = len > 0 ? dx / len : 0;
  const nz = len > 0 ? dz / len : 0;

  // Bigger flash for heavier weapons
  const isHeavy = event.weaponId === 'rocket_launcher' || event.weaponId === 'shotgun';

  return (
    <group ref={ref} position={[event.attackerPos.x + nx * 0.4, 0.65, event.attackerPos.z + nz * 0.4]}>
      <mesh>
        <sphereGeometry args={[isHeavy ? 1.5 : 1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>
      <mesh>
        <sphereGeometry args={[isHeavy ? 2 : 1.5, 8, 6]} />
        <meshBasicMaterial
          color={event.type === 'crit' || event.type === 'kill' ? '#ff4400' : '#ffcc00'}
          transparent opacity={0.5}
        />
      </mesh>
      <pointLight color="#ffaa00" intensity={isHeavy ? 8 : 5} distance={isHeavy ? 6 : 4} />
    </group>
  );
}

function BulletTrail({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    const bulletT = Math.min(1, t / 0.15);

    ref.current.children.forEach((child, i) => {
      if (i === 0) {
        const bx = THREE.MathUtils.lerp(event.attackerPos.x, event.targetPos.x, bulletT);
        const bz = THREE.MathUtils.lerp(event.attackerPos.z, event.targetPos.z, bulletT);
        child.position.set(bx, 0.6, bz);
        child.visible = bulletT < 1;
      }
    });

    const opacity = Math.max(0, 1 - t * 2.5);
    ref.current.children.forEach(child => {
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.Material).opacity = opacity;
      }
    });
  });

  if (age > 0.5 || event.type === 'heal' || event.type === 'overwatch' || event.type === 'ability' || event.type === 'loot') return null;

  const dx = event.targetPos.x - event.attackerPos.x;
  const dz = event.targetPos.z - event.attackerPos.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const midX = (event.attackerPos.x + event.targetPos.x) / 2;
  const midZ = (event.attackerPos.z + event.targetPos.z) / 2;

  // Rocket has thicker trail
  const isRocket = event.weaponId === 'rocket_launcher';
  const trailColor = isRocket ? '#ff6600' : event.type === 'miss' ? '#666688' : '#ffdd44';

  return (
    <group ref={ref}>
      <mesh position={[event.attackerPos.x, 0.6, event.attackerPos.z]}>
        <sphereGeometry args={[isRocket ? 0.08 : 0.04, 6, 4]} />
        <meshBasicMaterial color={isRocket ? '#ff8844' : '#ffee88'} transparent opacity={1} />
      </mesh>
      <mesh position={[midX, 0.6, midZ]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[len, isRocket ? 0.03 : 0.015, isRocket ? 0.03 : 0.015]} />
        <meshBasicMaterial color={trailColor} transparent opacity={0.7} />
      </mesh>
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
    const impactT = Math.max(0, t - 0.1);

    ref.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;

      if (i === 0) {
        const scale = impactT * 4;
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.6 - impactT * 2);
      } else if (i === 1) {
        const scale = Math.max(0, (0.3 - impactT) * 3);
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.8 - impactT * 3);
      }
    });
  });

  if (age > 0.6 || event.type === 'miss' || event.type === 'overwatch' || event.type === 'loot') return null;

  let ringColor = '#ff8800';
  let flashColor = '#ffcc44';
  if (event.type === 'kill') { ringColor = '#ff0000'; flashColor = '#ff4400'; }
  if (event.type === 'heal') { ringColor = '#44ff88'; flashColor = '#88ffaa'; }
  if (event.type === 'crit') { ringColor = '#ff4400'; flashColor = '#ff8800'; }

  return (
    <group ref={ref} position={[event.targetPos.x, 0.3, event.targetPos.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.4, 16]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshBasicMaterial color={flashColor} transparent opacity={0.8} />
      </mesh>
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

  if (age > 0.6 || event.type === 'heal' || event.type === 'overwatch' || event.type === 'ability' || event.type === 'loot') return null;

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
        const scale = t * 3;
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.8 - t * 1.5);
      } else if (i === 1) {
        const scale = t * 4;
        mesh.scale.setScalar(scale);
        mesh.position.y = t * 1.5;
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.4 - t * 0.5);
      }
    });
  });

  if (age > 0.8) return null;
  if (event.type !== 'kill' && !event.message?.includes('grenade') && event.weaponId !== 'rocket_launcher') return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.2, event.targetPos.z]}>
      <mesh>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={0.8} />
      </mesh>
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

// Healing VFX - green sparkles
function HealingEffect({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.children.forEach((child, i) => {
      child.position.y = 0.3 + t * 1.2 + Math.sin(clock.getElapsedTime() * 5 + i) * 0.1;
      child.position.x = Math.sin(clock.getElapsedTime() * 3 + i * 1.5) * 0.3;
      child.position.z = Math.cos(clock.getElapsedTime() * 3 + i * 1.5) * 0.3;
      const opacity = Math.max(0, 1 - t / 1.5);
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.Material).opacity = opacity;
      }
    });
  });

  if (age > 1.5 || event.type !== 'heal') return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0, event.targetPos.z]}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <mesh key={i}>
          <sphereGeometry args={[0.04, 6, 4]} />
          <meshBasicMaterial color="#44ff88" transparent opacity={0.8} />
        </mesh>
      ))}
      <pointLight color="#44ff88" intensity={2} distance={3} />
    </group>
  );
}

// Sound effect player - weapon-aware
function SoundPlayer({ event }: { event: CombatEvent }) {
  useEffect(() => {
    if (playedSounds.has(event.id)) return;
    playedSounds.add(event.id);

    if (playedSounds.size > 100) {
      const arr = Array.from(playedSounds);
      arr.slice(0, 50).forEach(id => playedSounds.delete(id));
    }

    const delay = 150;
    switch (event.type) {
      case 'damage':
        setTimeout(() => { playWeaponSound(event.weaponId); setTimeout(playImpact, 100); }, delay);
        break;
      case 'crit':
        setTimeout(() => { playWeaponSound(event.weaponId); setTimeout(playCrit, 100); }, delay);
        break;
      case 'kill':
        setTimeout(() => { playWeaponSound(event.weaponId); setTimeout(playKill, 120); }, delay);
        break;
      case 'miss':
        setTimeout(() => { playWeaponSound(event.weaponId); setTimeout(playMiss, 80); }, delay);
        break;
      case 'heal':
        playHeal();
        break;
      case 'ability':
        if (event.message?.includes('SMOKE')) playSmoke();
        else if (event.message?.includes('GRENADE') || event.message?.includes('grenade')) playGrenade();
        else playAbility();
        break;
      case 'overwatch':
        playOverwatch();
        break;
    }
  }, [event.id, event.type, event.weaponId, event.message]);

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
          <HealingEffect event={event} />
        </group>
      ))}
    </group>
  );
}
