import { useRef, useEffect, useMemo } from 'react';
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

// ═══════════════════════════════════════════════════════
// ── DAMAGE NUMBERS ──
// ═══════════════════════════════════════════════════════
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
    case 'damage': color = '#ff8844'; text = `-${event.value}`; break;
    case 'crit': color = '#ff2222'; text = `CRIT! -${event.value}`; size = 0.3; break;
    case 'kill': color = '#ff0000'; text = `☠ ELIMINATED`; size = 0.35; break;
    case 'miss': color = '#8888aa'; text = 'MISS'; size = 0.2; break;
    case 'heal': color = '#44ff88'; text = `+${event.value}`; size = 0.24; break;
    case 'ability': color = '#ffaa00'; text = '⚡'; size = 0.22; break;
    case 'overwatch': color = '#44aaff'; text = '👁 OVERWATCH'; size = 0.18; break;
    case 'loot': color = '#ffcc44'; text = '📦 LOOT!'; size = 0.2; break;
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

// ═══════════════════════════════════════════════════════
// ── GRENADE PROJECTILE — Arc trajectory with spin ──
// ═══════════════════════════════════════════════════════
function GrenadeProjectile({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const trailRef = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  const isGrenade = event.message?.includes('GRENADE') || event.message?.includes('grenade');
  if (!isGrenade) return null;

  const flightDuration = 0.7; // seconds for the grenade to travel
  const explosionDelay = 0.15; // extra delay after landing before boom

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    const flightT = Math.min(1, t / flightDuration);

    if (flightT < 1) {
      // Parabolic arc: lerp XZ, parabola Y
      const x = THREE.MathUtils.lerp(event.attackerPos.x, event.targetPos.x, flightT);
      const z = THREE.MathUtils.lerp(event.attackerPos.z, event.targetPos.z, flightT);
      const arcHeight = 3.5; // max height of arc
      const y = 0.5 + arcHeight * 4 * flightT * (1 - flightT); // parabola peaking at 0.5

      ref.current.position.set(x, y, z);
      ref.current.visible = true;

      // Spin the grenade
      ref.current.rotation.x += 0.25;
      ref.current.rotation.z += 0.15;
    } else {
      // Grenade has landed
      ref.current.visible = false;
    }
  });

  if (age > flightDuration + explosionDelay + 2) return null;

  return (
    <>
      {/* Flying grenade body */}
      <group ref={ref} position={[event.attackerPos.x, 0.5, event.attackerPos.z]}>
        {/* Grenade body */}
        <mesh>
          <cylinderGeometry args={[0.05, 0.04, 0.12, 8]} />
          <meshStandardMaterial color="#3a4a2a" metalness={0.4} roughness={0.6} />
        </mesh>
        {/* Pin ring */}
        <mesh position={[0, 0.08, 0]}>
          <torusGeometry args={[0.02, 0.006, 4, 8]} />
          <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Spoon/lever */}
        <mesh position={[0.03, 0.03, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.01, 0.06, 0.015]} />
          <meshStandardMaterial color="#666666" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Trail light */}
        <pointLight color="#ff8844" intensity={2} distance={2} decay={2} />
      </group>

      {/* Grenade explosion (delayed) */}
      <GrenadeExplosion event={event} delay={flightDuration + explosionDelay} />
    </>
  );
}

// ── Grenade Explosion with shockwave, fire, debris ──
function GrenadeExplosion({ event, delay }: { event: CombatEvent; delay: number }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;
  const explodeAge = age - delay;

  // Debris directions
  const debris = useMemo(() =>
    Array.from({ length: 16 }, () => ({
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 5 + 2,
      vz: (Math.random() - 0.5) * 6,
      size: 0.02 + Math.random() * 0.06,
      rotSpeed: Math.random() * 5,
    })), []);

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000 - delay;
    if (t < 0) {
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;

    let childIdx = 0;
    ref.current.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material || !mesh.userData) return;

      // Fireball
      if (mesh.userData.type === 'fireball') {
        const scale = Math.min(3.5, t * 8);
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.9 - t * 1.2);
      }
      // Shockwave ring
      else if (mesh.userData.type === 'shockwave') {
        const scale = t * 12;
        mesh.scale.set(scale, 1, scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.6 - t * 1.5);
      }
      // Smoke cloud
      else if (mesh.userData.type === 'smoke') {
        const smokeT = Math.max(0, t - 0.1);
        const scale = 0.5 + smokeT * 3;
        mesh.scale.setScalar(scale);
        mesh.position.y = 0.5 + smokeT * 2;
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.4 - smokeT * 0.2);
      }
      // Ground scorch
      else if (mesh.userData.type === 'scorch') {
        const scale = Math.min(2.5, t * 5);
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.7 - t * 0.15);
      }
      // Debris
      else if (mesh.userData.type === 'debris') {
        const d = debris[mesh.userData.index];
        if (d) {
          mesh.position.set(d.vx * t, d.vy * t - 10 * t * t, d.vz * t);
          mesh.rotation.x += d.rotSpeed * 0.02;
          mesh.rotation.z += d.rotSpeed * 0.015;
          (mesh.material as THREE.Material).opacity = Math.max(0, 1 - t * 1.5);
        }
      }
      childIdx++;
    });
  });

  if (explodeAge > 3) return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.1, event.targetPos.z]} visible={false}>
      {/* Fireball core */}
      <mesh userData={{ type: 'fireball' }}>
        <sphereGeometry args={[0.3, 12, 10]} />
        <meshBasicMaterial color="#ff6600" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Inner white-hot core */}
      <mesh userData={{ type: 'fireball' }}>
        <sphereGeometry args={[0.15, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Shockwave ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} userData={{ type: 'shockwave' }}>
        <ringGeometry args={[0.3, 0.5, 24]} />
        <meshBasicMaterial color="#ff8844" transparent opacity={0.6} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Smoke clouds */}
      {[0, 1, 2].map(i => (
        <mesh key={`smoke-${i}`} position={[(Math.random() - 0.5) * 0.5, 0.5, (Math.random() - 0.5) * 0.5]} userData={{ type: 'smoke' }}>
          <sphereGeometry args={[0.4, 8, 6]} />
          <meshBasicMaterial color={i === 0 ? '#333333' : '#555555'} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}

      {/* Ground scorch mark */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} userData={{ type: 'scorch' }}>
        <circleGeometry args={[0.8, 16]} />
        <meshBasicMaterial color="#1a0a00" transparent opacity={0.7} />
      </mesh>

      {/* Debris chunks */}
      {debris.map((d, i) => (
        <mesh key={`debris-${i}`} userData={{ type: 'debris', index: i }}>
          <boxGeometry args={[d.size, d.size, d.size]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? '#5a4a30' : i % 3 === 1 ? '#3a3a3a' : '#6a5a3a'}
            transparent opacity={1} roughness={1}
          />
        </mesh>
      ))}

      {/* Dynamic light */}
      <pointLight color="#ff6600" intensity={20} distance={10} decay={2} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// ── ROCKET PROJECTILE — Straight line with smoke trail ──
// ═══════════════════════════════════════════════════════
function RocketProjectile({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const trailPositions = useRef<THREE.Vector3[]>([]);
  const age = (Date.now() - event.timestamp) / 1000;

  const isRocket = event.weaponId === 'rocket_launcher';
  if (!isRocket) return null;

  const flightDuration = 0.4;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    const flightT = Math.min(1, t / flightDuration);

    if (flightT < 1) {
      const x = THREE.MathUtils.lerp(event.attackerPos.x, event.targetPos.x, flightT);
      const z = THREE.MathUtils.lerp(event.attackerPos.z, event.targetPos.z, flightT);
      // Slight upward arc for rockets
      const y = 0.6 + Math.sin(flightT * Math.PI) * 0.8;

      ref.current.position.set(x, y, z);
      ref.current.visible = true;

      // Face direction of travel
      const dx = event.targetPos.x - event.attackerPos.x;
      const dz = event.targetPos.z - event.attackerPos.z;
      ref.current.rotation.y = Math.atan2(dx, dz);
      ref.current.rotation.x = -Math.sin(flightT * Math.PI) * 0.3;
    } else {
      ref.current.visible = false;
    }
  });

  if (age > flightDuration + 3) return null;

  return (
    <>
      {/* Flying rocket */}
      <group ref={ref} position={[event.attackerPos.x, 0.6, event.attackerPos.z]}>
        {/* Rocket body */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.04, 0.2, 6]} />
          <meshStandardMaterial color="#4a4a4a" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Nose cone */}
        <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.025, 0.06, 6]} />
          <meshStandardMaterial color="#cc4444" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Fins */}
        {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((rot, i) => (
          <mesh key={i} position={[Math.sin(rot) * 0.035, Math.cos(rot) * 0.035, -0.08]} rotation={[0, 0, rot]}>
            <boxGeometry args={[0.04, 0.005, 0.04]} />
            <meshStandardMaterial color="#666666" metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        {/* Exhaust flame */}
        <mesh position={[0, 0, -0.14]}>
          <coneGeometry args={[0.03, 0.15, 6]} />
          <meshBasicMaterial color="#ff8800" transparent opacity={0.8} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh position={[0, 0, -0.18]}>
          <coneGeometry args={[0.02, 0.1, 6]} />
          <meshBasicMaterial color="#ffdd44" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
        </mesh>
        {/* Exhaust light */}
        <pointLight position={[0, 0, -0.15]} color="#ff6600" intensity={8} distance={4} decay={2} />
        {/* Forward light */}
        <pointLight position={[0, 0, 0.1]} color="#ff4400" intensity={3} distance={3} decay={2} />
      </group>

      {/* Rocket smoke trail */}
      <RocketSmokeTrail event={event} flightDuration={flightDuration} />

      {/* Rocket explosion */}
      <RocketExplosion event={event} delay={flightDuration} />
    </>
  );
}

// ── Rocket smoke trail ──
function RocketSmokeTrail({ event, flightDuration }: { event: CombatEvent; flightDuration: number }) {
  const puffCount = 12;
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  const puffs = useMemo(() =>
    Array.from({ length: puffCount }, (_, i) => ({
      offset: new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1),
      size: 0.06 + Math.random() * 0.08,
    })), []);

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;

    ref.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;
      const puffTime = (i / puffCount) * flightDuration;
      const puffAge = t - puffTime;

      if (puffAge < 0 || puffAge > 2) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;

      const flightT = Math.min(1, puffTime / flightDuration);
      const x = THREE.MathUtils.lerp(event.attackerPos.x, event.targetPos.x, flightT);
      const z = THREE.MathUtils.lerp(event.attackerPos.z, event.targetPos.z, flightT);
      const y = 0.6 + Math.sin(flightT * Math.PI) * 0.8;

      const p = puffs[i];
      mesh.position.set(
        x + p.offset.x + puffAge * 0.1,
        y + p.offset.y + puffAge * 0.5,
        z + p.offset.z
      );
      const scale = p.size + puffAge * 0.5;
      mesh.scale.setScalar(scale);
      (mesh.material as THREE.Material).opacity = Math.max(0, 0.35 - puffAge * 0.18);
    });
  });

  if (age > flightDuration + 2) return null;

  return (
    <group ref={ref}>
      {puffs.map((p, i) => (
        <mesh key={i} visible={false}>
          <sphereGeometry args={[1, 6, 5]} />
          <meshBasicMaterial color="#888888" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ── Rocket Explosion (bigger than grenade) ──
function RocketExplosion({ event, delay }: { event: CombatEvent; delay: number }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;
  const explodeAge = age - delay;

  const debris = useMemo(() =>
    Array.from({ length: 24 }, () => ({
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 6 + 3,
      vz: (Math.random() - 0.5) * 8,
      size: 0.03 + Math.random() * 0.08,
      rotSpeed: Math.random() * 8,
      isEmber: Math.random() > 0.5,
    })), []);

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000 - delay;
    if (t < 0) { ref.current.visible = false; return; }
    ref.current.visible = true;

    ref.current.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material || !mesh.userData) return;

      if (mesh.userData.type === 'fireball') {
        const scale = Math.min(5, t * 12);
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 1 - t * 1);
      } else if (mesh.userData.type === 'shockwave') {
        const scale = t * 18;
        mesh.scale.set(scale, 1, scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.5 - t * 1.2);
      } else if (mesh.userData.type === 'smoke') {
        const smokeT = Math.max(0, t - 0.15);
        const scale = 0.8 + smokeT * 4;
        mesh.scale.setScalar(scale);
        mesh.position.y = 0.5 + smokeT * 3;
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.5 - smokeT * 0.15);
      } else if (mesh.userData.type === 'scorch') {
        const scale = Math.min(3.5, t * 6);
        mesh.scale.setScalar(scale);
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.8 - t * 0.1);
      } else if (mesh.userData.type === 'debris') {
        const d = debris[mesh.userData.index];
        if (d) {
          mesh.position.set(d.vx * t, d.vy * t - 12 * t * t, d.vz * t);
          mesh.rotation.x += d.rotSpeed * 0.02;
          mesh.rotation.z += d.rotSpeed * 0.015;
          (mesh.material as THREE.Material).opacity = Math.max(0, 1 - t * 1.2);
        }
      }
    });
  });

  if (explodeAge > 4) return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.1, event.targetPos.z]} visible={false}>
      {/* Fireball */}
      <mesh userData={{ type: 'fireball' }}>
        <sphereGeometry args={[0.4, 14, 12]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={1} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh userData={{ type: 'fireball' }}>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={1} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Shockwave */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} userData={{ type: 'shockwave' }}>
        <ringGeometry args={[0.4, 0.7, 32]} />
        <meshBasicMaterial color="#ff6622" transparent opacity={0.5} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Smoke */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={`smoke-${i}`} position={[(Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8]} userData={{ type: 'smoke' }}>
          <sphereGeometry args={[0.5, 8, 6]} />
          <meshBasicMaterial color={i < 2 ? '#222222' : '#444444'} transparent opacity={0.5} depthWrite={false} />
        </mesh>
      ))}
      {/* Scorch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} userData={{ type: 'scorch' }}>
        <circleGeometry args={[1.2, 20]} />
        <meshBasicMaterial color="#0a0500" transparent opacity={0.8} />
      </mesh>
      {/* Debris */}
      {debris.map((d, i) => (
        <mesh key={`debris-${i}`} userData={{ type: 'debris', index: i }}>
          <boxGeometry args={[d.size, d.size, d.size]} />
          <meshBasicMaterial
            color={d.isEmber ? '#ff6622' : i % 2 === 0 ? '#4a3a28' : '#333333'}
            transparent opacity={1}
            blending={d.isEmber ? THREE.AdditiveBlending : THREE.NormalBlending}
          />
        </mesh>
      ))}
      {/* Big light */}
      <pointLight color="#ff4400" intensity={30} distance={15} decay={2} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// ── MUZZLE FLASH ──
// ═══════════════════════════════════════════════════════
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

  if (age > 0.25 || event.type === 'heal' || event.type === 'overwatch' || event.type === 'loot' || event.type === 'ability') return null;
  // Skip muzzle for rockets (they have their own exhaust)
  if (event.weaponId === 'rocket_launcher') return null;

  const dx = event.targetPos.x - event.attackerPos.x;
  const dz = event.targetPos.z - event.attackerPos.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  const nx = len > 0 ? dx / len : 0;
  const nz = len > 0 ? dz / len : 0;
  const isHeavy = event.weaponId === 'shotgun';

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
          transparent opacity={0.4} blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight color="#ffaa00" intensity={isHeavy ? 12 : 6} distance={isHeavy ? 8 : 5} decay={2} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// ── BULLET TRAIL ──
// ═══════════════════════════════════════════════════════
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
  // Skip bullet for rockets (they have rocket projectile)
  if (event.weaponId === 'rocket_launcher') return null;

  const dx = event.targetPos.x - event.attackerPos.x;
  const dz = event.targetPos.z - event.attackerPos.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const midX = (event.attackerPos.x + event.targetPos.x) / 2;
  const midZ = (event.attackerPos.z + event.targetPos.z) / 2;
  const trailColor = event.type === 'miss' ? '#666688' : '#ffdd44';

  return (
    <group ref={ref}>
      <mesh position={[event.attackerPos.x, 0.6, event.attackerPos.z]}>
        <sphereGeometry args={[0.05, 6, 4]} />
        <meshBasicMaterial color="#ffee88" transparent opacity={1} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[midX, 0.6, midZ]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[len, 0.018, 0.018]} />
        <meshBasicMaterial color={trailColor} transparent opacity={0.7} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[midX, 0.6, midZ]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[len * 0.9, 0.006, 0.006]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// ── IMPACT EFFECT (for bullet hits) ──
// ═══════════════════════════════════════════════════════
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
  // Skip impact for grenades/rockets (they have explosions)
  if (event.weaponId === 'rocket_launcher') return null;
  if (event.message?.includes('GRENADE') || event.message?.includes('grenade')) return null;

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

// ═══════════════════════════════════════════════════════
// ── SHELL CASINGS ──
// ═══════════════════════════════════════════════════════
function ShellCasings({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;
  const shellDir = useRef(Math.random() > 0.5 ? 1 : -1);

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.children.forEach((child) => {
      child.position.y = 0.5 + t * 0.6 - t * t * 2.5;
      child.position.x = shellDir.current * t * 0.6;
      child.rotation.z += 0.2;
      child.rotation.x += 0.15;
      const opacity = Math.max(0, 1 - t * 2);
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.Material).opacity = opacity;
      }
    });
  });

  if (age > 0.6 || event.type === 'heal' || event.type === 'overwatch' || event.type === 'ability' || event.type === 'loot') return null;
  if (event.weaponId === 'rocket_launcher') return null;

  return (
    <group ref={ref} position={[event.attackerPos.x, 0.5, event.attackerPos.z]}>
      <mesh>
        <cylinderGeometry args={[0.012, 0.012, 0.05, 4]} />
        <meshStandardMaterial color="#ccaa44" metalness={0.8} roughness={0.2} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// ── DEBRIS PARTICLES (bullet impacts) ──
// ═══════════════════════════════════════════════════════
function DebrisParticles({ event }: { event: CombatEvent }) {
  const count = 6;
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;
  const dirs = useMemo(() =>
    Array.from({ length: count }, () => ({
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 1,
      vz: (Math.random() - 0.5) * 3,
      size: 0.015 + Math.random() * 0.03,
    })), []);

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.children.forEach((child, i) => {
      const d = dirs[i];
      if (!d) return;
      child.position.set(d.vx * t, d.vy * t - 6 * t * t, d.vz * t);
      child.rotation.x += 0.15;
      child.rotation.y += 0.1;
      const opacity = Math.max(0, 1 - t * 2);
      if ((child as THREE.Mesh).material) {
        ((child as THREE.Mesh).material as THREE.Material).opacity = opacity;
      }
    });
  });

  if (age > 0.6 || event.type === 'miss' || event.type === 'heal' || event.type === 'overwatch' || event.type === 'loot' || event.type === 'ability') return null;
  if (event.weaponId === 'rocket_launcher') return null;
  if (event.message?.includes('GRENADE') || event.message?.includes('grenade')) return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.3, event.targetPos.z]}>
      {dirs.map((d, i) => (
        <mesh key={i}>
          <boxGeometry args={[d.size, d.size, d.size]} />
          <meshStandardMaterial color="#5a4a3a" transparent opacity={0.9} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// ── MISS RICOCHET SPARKS ──
// ═══════════════════════════════════════════════════════
function MissRicochet({ event }: { event: CombatEvent }) {
  const sparks = useMemo(() =>
    Array.from({ length: 6 }, () => ({
      vx: (Math.random() - 0.5) * 2.5,
      vy: Math.random() * 2.5 + 1,
      vz: (Math.random() - 0.5) * 2.5,
    })), []);
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.children.forEach((child, i) => {
      const spark = sparks[i];
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
      {sparks.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.025, 4, 4]} />
          <meshBasicMaterial color="#ddddff" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// ── HEALING EFFECT ──
// ═══════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════
// ── SMOKE PLUME (residual after explosions) ──
// ═══════════════════════════════════════════════════════
function SmokePlume({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  const isExplosive = event.type === 'kill' || event.weaponId === 'rocket_launcher' || event.message?.includes('grenade') || event.message?.includes('GRENADE');
  if (!isExplosive) return null;

  // For grenades/rockets, the main explosion handles smoke — this is lingering smoke
  const startDelay = event.weaponId === 'rocket_launcher' ? 0.6 : event.message?.includes('grenade') || event.message?.includes('GRENADE') ? 1.0 : 0.3;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000 - startDelay;
    if (t < 0) { ref.current.visible = false; return; }
    ref.current.visible = true;

    ref.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;
      const phase = t - i * 0.15;
      if (phase > 0) {
        const scale = 0.5 + phase * 1.2;
        mesh.scale.setScalar(scale);
        mesh.position.y = 0.3 + phase * 1;
        mesh.position.x = Math.sin(phase * 0.5 + i) * 0.3;
        (mesh.material as THREE.Material).opacity = Math.max(0, 0.2 - phase * 0.08);
      }
    });
  });

  if (age > startDelay + 4) return null;

  return (
    <group ref={ref} position={[event.targetPos.x, 0.2, event.targetPos.z]} visible={false}>
      {[0, 1, 2, 3].map(i => (
        <mesh key={i} position={[(Math.random() - 0.5) * 0.4, 0.3 + i * 0.2, (Math.random() - 0.5) * 0.4]}>
          <sphereGeometry args={[0.4, 8, 6]} />
          <meshBasicMaterial color="#666666" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════
// ── SOUND PLAYER ──
// ═══════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════
// ── MAIN COMBAT VFX ORCHESTRATOR ──
// ═══════════════════════════════════════════════════════
export function CombatVFX({ events }: CombatVFXProps) {
  // Only keep last 3 seconds of events and cap at 8 simultaneous
  const recentEvents = events
    .filter(e => Date.now() - e.timestamp < 3000)
    .slice(-8);

  return (
    <group>
      {recentEvents.map(event => (
        <group key={event.id}>
          <SoundPlayer event={event} />
          <DamageNumber event={event} />
          <MuzzleFlash event={event} />
          <BulletTrail event={event} />
          <ImpactEffect event={event} />
          <GrenadeProjectile event={event} />
          <RocketProjectile event={event} />
          <SmokePlume event={event} />
        </group>
      ))}
    </group>
  );
}
