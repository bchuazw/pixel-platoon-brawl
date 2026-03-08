import { useRef, useEffect } from 'react';
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
    ref.current.position.y = 1.5 + t * 1.8;
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
      color = '#ff2222'; text = `CRIT! -${event.value}`; size = 0.3; break;
    case 'kill':
      color = '#ff0000'; text = `☠ ELIMINATED`; size = 0.35; break;
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
  const isHeavy = event.weaponId === 'rocket_launcher' || event.weaponId === 'shotgun';

  return (
    <group ref={ref} position={[event.attackerPos.x + nx * 0.4, 0.65, event.attackerPos.z + nz * 0.4]}>
      <mesh>
        <sphereGeometry args={[isHeavy ? 1.5 : 1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh>
        <sphereGeometry args={[isHeavy ? 2.5 : 1.8, 8, 6]} />
        <meshBasicMaterial
          color={event.type === 'crit' || event.type === 'kill' ? '#ff4400' : '#ffcc00'}
          transparent opacity={0.4}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight color="#ffaa00" intensity={isHeavy ? 12 : 6} distance={isHeavy ? 8 : 5} decay={2} />
    </group>
  );
}

function BulletTrail({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    const bulletT = Math.min(1, t / 0.12);

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

  const isRocket = event.weaponId === 'rocket_launcher';
  const trailColor = isRocket ? '#ff6600' : event.type === 'miss' ? '#666688' : '#ffdd44';

  return (
    <group ref={ref}>
      <mesh position={[event.attackerPos.x, 0.6, event.attackerPos.z]}>
        <sphereGeometry args={[isRocket ? 0.1 : 0.05, 6, 4]} />
        <meshBasicMaterial color={isRocket ? '#ff8844' : '#ffee88'} transparent opacity={1} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[midX, 0.6, midZ]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[len, isRocket ? 0.04 : 0.018, isRocket ? 0.04 : 0.018]} />
        <meshBasicMaterial color={trailColor} transparent opacity={0.7} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Inner bright core */}
      <mesh position={[midX, 0.6, midZ]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[len * 0.9, 0.006, 0.006]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
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
    const impactT = Math.max(0, t - 0.08);

    ref.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;
      if (i === 0) {
        const scale = impactT * 5;
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.7 - impactT * 2);
      } else if (i === 1) {
        const scale = Math.max(0, (0.3 - impactT) * 4);
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.9 - impactT * 3);
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
        <ringGeometry args={[0.15, 0.5, 20]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.7} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.35, 10, 8]} />
        <meshBasicMaterial color={flashColor} transparent opacity={0.8} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight color={flashColor} intensity={5} distance={4} decay={2} />
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
        <meshStandardMaterial color="#ccaa44" metalness={0.8} roughness={0.2} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

// ── Debris Particles on Impact ──
function DebrisParticles({ event }: { event: CombatEvent }) {
  const count = 8;
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;
  const dirs = useRef(
    Array.from({ length: count }, () => ({
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 1,
      vz: (Math.random() - 0.5) * 3,
      size: 0.02 + Math.random() * 0.04,
    }))
  );

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.children.forEach((child, i) => {
      const d = dirs.current[i];
      if (!d) return;
      child.position.set(d.vx * t, d.vy * t - 5 * t * t, d.vz * t);
      child.rotation.x += 0.15;
      child.rotation.y += 0.1;
      const opacity = Math.max(0, 1 - t * 2);
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.Material).opacity = opacity;
      }
    });
  });

  if (age > 0.6 || event.type === 'miss' || event.type === 'heal' || event.type === 'overwatch' || event.type === 'loot') return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.3, event.targetPos.z]}>
      {dirs.current.map((d, i) => (
        <mesh key={i}>
          <boxGeometry args={[d.size, d.size, d.size]} />
          <meshStandardMaterial color="#5a4a3a" transparent opacity={0.9} roughness={1} />
        </mesh>
      ))}
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
        const scale = t * 4;
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.9 - t * 1.5);
      } else if (i === 1) {
        const scale = t * 5;
        mesh.scale.setScalar(scale);
        mesh.position.y = t * 2;
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.5 - t * 0.5);
      } else if (i === 2) {
        // Ground scorch ring
        const scale = Math.min(1.5, t * 3);
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.6 - t * 0.3);
      }
    });
  });

  if (age > 1) return null;
  if (event.type !== 'kill' && !event.message?.includes('grenade') && event.weaponId !== 'rocket_launcher') return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.2, event.targetPos.z]}>
      <mesh>
        <sphereGeometry args={[0.4, 10, 8]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.3, 10, 8]} />
        <meshBasicMaterial color="#444444" transparent opacity={0.5} />
      </mesh>
      {/* Ground scorch */}
      <mesh position={[0, -0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 16]} />
        <meshBasicMaterial color="#1a1008" transparent opacity={0.6} />
      </mesh>
      <pointLight color="#ff6600" intensity={15} distance={8} decay={2} />
    </group>
  );
}

function MissRicochet({ event }: { event: CombatEvent }) {
  const sparks = useRef(
    Array.from({ length: 6 }, () => ({
      vx: (Math.random() - 0.5) * 2.5,
      vy: Math.random() * 2.5 + 1,
      vz: (Math.random() - 0.5) * 2.5,
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
      child.position.set(spark.vx * t, spark.vy * t - 5 * t * t, spark.vz * t);
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
          <sphereGeometry args={[0.025, 4, 4]} />
          <meshBasicMaterial color="#ddddff" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

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
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <mesh key={i}>
          <sphereGeometry args={[0.035, 6, 4]} />
          <meshBasicMaterial color="#44ff88" transparent opacity={0.7} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      <pointLight color="#44ff88" intensity={3} distance={4} decay={2} />
    </group>
  );
}

// ── Smoke Plume ──
function SmokePlume({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;
      const phase = t - i * 0.08;
      if (phase > 0) {
        const scale = 0.3 + phase * 1.5;
        mesh.scale.setScalar(scale);
        mesh.position.y = 0.2 + phase * 1.5;
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.25 - phase * 0.15);
      }
    });
  });

  if (age > 2 || (event.type !== 'kill' && event.weaponId !== 'rocket_launcher' && !event.message?.includes('grenade'))) return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.2, event.targetPos.z]}>
      {[0, 1, 2, 3, 4].map(i => (
        <mesh key={i} position={[(Math.random() - 0.5) * 0.3, 0.2 + i * 0.2, (Math.random() - 0.5) * 0.3]}>
          <sphereGeometry args={[0.3, 8, 6]} />
          <meshBasicMaterial color="#555555" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

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
          <DebrisParticles event={event} />
          <ExplosionEffect event={event} />
          <SmokePlume event={event} />
          <MissRicochet event={event} />
          <HealingEffect event={event} />
        </group>
      ))}
    </group>
  );
}
