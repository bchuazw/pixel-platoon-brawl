import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { CombatEvent } from '@/game/types';
import * as THREE from 'three';

interface CombatVFXProps {
  events: CombatEvent[];
}

function DamageNumber({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Group>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    ref.current.position.y = 1.5 + t * 1.2;
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
      color = '#ff8844';
      text = `-${event.value}`;
      break;
    case 'crit':
      color = '#ff2222';
      text = `CRIT! -${event.value}`;
      size = 0.25;
      break;
    case 'kill':
      color = '#ff0000';
      text = `☠ KILL! -${event.value}`;
      size = 0.28;
      break;
    case 'miss':
      color = '#8888aa';
      text = 'MISS';
      size = 0.16;
      break;
    case 'heal':
      color = '#44ff44';
      text = `+${event.value}`;
      break;
    case 'ability':
      color = '#ffaa00';
      text = '⚡';
      size = 0.22;
      break;
    case 'overwatch':
      color = '#44aaff';
      text = '👁';
      size = 0.2;
      break;
  }

  return (
    <group ref={ref} position={[event.targetPos.x, 1.5, event.targetPos.z]}>
      <Billboard>
        <Text
          fontSize={size}
          color={color}
          anchorX="center"
          anchorY="middle"
          font={undefined}
          outlineWidth={0.03}
          outlineColor="#000000"
        >
          {text}
        </Text>
      </Billboard>
    </group>
  );
}

function MuzzleFlash({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Mesh>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    const scale = Math.max(0, (1 - t * 4)) * 0.5;
    ref.current.scale.setScalar(scale);
  });

  if (age > 0.3 || event.type === 'heal' || event.type === 'overwatch') return null;

  return (
    <mesh ref={ref} position={[event.attackerPos.x, 0.7, event.attackerPos.z]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial
        color={event.type === 'crit' || event.type === 'kill' ? '#ff4400' : '#ffaa00'}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

function ImpactEffect({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Mesh>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    const scale = t * 2;
    ref.current.scale.setScalar(scale);
    (ref.current.material as THREE.Material).opacity = Math.max(0, 0.6 - t * 1.5);
  });

  if (age > 0.5 || event.type === 'miss' || event.type === 'overwatch') return null;

  let color = '#ff8800';
  if (event.type === 'kill') color = '#ff0000';
  if (event.type === 'heal') color = '#44ff44';
  if (event.type === 'crit') color = '#ff4400';

  return (
    <mesh ref={ref} position={[event.targetPos.x, 0.3, event.targetPos.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.2, 0.5, 12]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

function TracerLine({ event }: { event: CombatEvent }) {
  const ref = useRef<THREE.Line>(null);
  const age = (Date.now() - event.timestamp) / 1000;

  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - event.timestamp) / 1000;
    (ref.current.material as THREE.LineBasicMaterial).opacity = Math.max(0, 0.8 - t * 2);
  });

  if (age > 0.4 || event.type === 'heal' || event.type === 'overwatch' || event.type === 'ability') return null;

  const points = [
    new THREE.Vector3(event.attackerPos.x, 0.7, event.attackerPos.z),
    new THREE.Vector3(event.targetPos.x, 0.5, event.targetPos.z),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  return (
    <line ref={ref as any} geometry={geometry}>
      <lineBasicMaterial
        color={event.type === 'miss' ? '#666666' : '#ffdd00'}
        transparent
        opacity={0.8}
        linewidth={2}
      />
    </line>
  );
}

export function CombatVFX({ events }: CombatVFXProps) {
  const recentEvents = events.filter(e => Date.now() - e.timestamp < 3000);

  return (
    <group>
      {recentEvents.map(event => (
        <group key={event.id}>
          <DamageNumber event={event} />
          <MuzzleFlash event={event} />
          <ImpactEffect event={event} />
          <TracerLine event={event} />
        </group>
      ))}
    </group>
  );
}
