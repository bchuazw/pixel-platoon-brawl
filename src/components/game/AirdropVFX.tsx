import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { AirdropData, GRID_SIZE } from '@/game/types';
import { getTileY } from './GridTiles';
import * as THREE from 'three';

interface AirdropVFXProps {
  airdrops: AirdropData[];
  grid: any[][];
  onAirdropLanded: (airdrop: AirdropData) => void;
}

const PLANE_SPEED = 8; // units per second
const DROP_DURATION = 2.5; // seconds for crate to fall
const PLANE_HEIGHT = 12;
const CRATE_START_HEIGHT = 11;

function AirdropPlane({ airdrop, grid, onLanded }: { airdrop: AirdropData; grid: any[][]; onLanded: (a: AirdropData) => void }) {
  const planeRef = useRef<THREE.Group>(null);
  const crateRef = useRef<THREE.Group>(null);
  const parachuteRef = useRef<THREE.Mesh>(null);
  const [phase, setPhase] = useState<'flying' | 'dropping' | 'landed'>(airdrop.phase);
  const startTime = useRef(Date.now());
  const dropStartTime = useRef(0);
  const hasLanded = useRef(false);

  // Plane flies from one edge to opposite, passing over target
  const targetX = airdrop.targetPos.x;
  const targetZ = airdrop.targetPos.z;
  
  // Fly direction: random angle, entering from outside the map
  const flyAngle = useRef(Math.random() * Math.PI * 2);
  const startPos = useRef(new THREE.Vector3(
    targetX - Math.cos(flyAngle.current) * (GRID_SIZE + 10),
    PLANE_HEIGHT,
    targetZ - Math.sin(flyAngle.current) * (GRID_SIZE + 10)
  ));
  const endPos = useRef(new THREE.Vector3(
    targetX + Math.cos(flyAngle.current) * (GRID_SIZE + 10),
    PLANE_HEIGHT,
    targetZ + Math.sin(flyAngle.current) * (GRID_SIZE + 10)
  ));

  const totalFlyDist = startPos.current.distanceTo(endPos.current);
  const dropTriggerDist = startPos.current.distanceTo(new THREE.Vector3(targetX, PLANE_HEIGHT, targetZ));

  const tile = grid[targetX]?.[targetZ];
  const groundY = tile ? getTileY(tile.elevation) + 0.3 : 0.3;

  useFrame((_, delta) => {
    if (phase === 'landed') return;
    
    const elapsed = (Date.now() - startTime.current) / 1000;
    
    if (phase === 'flying' && planeRef.current) {
      const progress = Math.min(1, (elapsed * PLANE_SPEED) / totalFlyDist);
      planeRef.current.position.lerpVectors(startPos.current, endPos.current, progress);
      planeRef.current.lookAt(endPos.current);
      
      // Check if plane has passed over target
      const distToTarget = (elapsed * PLANE_SPEED);
      if (distToTarget >= dropTriggerDist && !dropStartTime.current) {
        dropStartTime.current = Date.now();
        setPhase('dropping');
      }
      
      // Plane exits map
      if (progress >= 1) {
        if (planeRef.current) planeRef.current.visible = false;
      }
    }
    
    if (phase === 'dropping' && crateRef.current) {
      const dropElapsed = (Date.now() - dropStartTime.current) / 1000;
      const dropProgress = Math.min(1, dropElapsed / DROP_DURATION);
      
      // Ease out for gentle landing
      const easedProgress = 1 - Math.pow(1 - dropProgress, 2);
      const currentY = THREE.MathUtils.lerp(CRATE_START_HEIGHT, groundY, easedProgress);
      
      crateRef.current.position.set(targetX, currentY, targetZ);
      crateRef.current.rotation.y += delta * 0.5;
      
      // Parachute sway
      if (parachuteRef.current) {
        parachuteRef.current.scale.setScalar(1 - dropProgress * 0.3);
        parachuteRef.current.rotation.y += delta * 1.2;
      }
      
      if (dropProgress >= 1 && !hasLanded.current) {
        hasLanded.current = true;
        setPhase('landed');
        onLanded(airdrop);
      }
    }
  });

  return (
    <group>
      {/* ── Cargo Plane ── */}
      <group ref={planeRef} position={[startPos.current.x, PLANE_HEIGHT, startPos.current.z]}>
        {/* Fuselage */}
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.4, 2.2]} />
          <meshStandardMaterial color="#556655" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Cockpit */}
        <mesh position={[0, 0.1, 1.0]}>
          <boxGeometry args={[0.35, 0.25, 0.4]} />
          <meshStandardMaterial color="#334433" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Wings */}
        <mesh position={[0, 0.05, 0]} castShadow>
          <boxGeometry args={[3.5, 0.08, 0.7]} />
          <meshStandardMaterial color="#4a5a4a" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Tail fin vertical */}
        <mesh position={[0, 0.35, -1.0]}>
          <boxGeometry args={[0.06, 0.5, 0.5]} />
          <meshStandardMaterial color="#556655" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Tail fin horizontal */}
        <mesh position={[0, 0.35, -0.9]}>
          <boxGeometry args={[1.2, 0.06, 0.35]} />
          <meshStandardMaterial color="#4a5a4a" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Engine pods */}
        <mesh position={[0.8, -0.1, 0.2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.5, 6]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[-0.8, -0.1, 0.2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.5, 6]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.4} metalness={0.6} />
        </mesh>
        {/* Running lights */}
        <pointLight position={[1.75, 0, 0]} color="#ff0000" intensity={2} distance={3} />
        <pointLight position={[-1.75, 0, 0]} color="#00ff00" intensity={2} distance={3} />
        {/* Engine glow */}
        <pointLight position={[0, -0.3, -1.2]} color="#ffaa44" intensity={3} distance={4} />
      </group>

      {/* ── Falling Crate with Parachute ── */}
      {(phase === 'dropping') && (
        <group ref={crateRef} position={[targetX, CRATE_START_HEIGHT, targetZ]}>
          {/* Parachute */}
          <mesh ref={parachuteRef} position={[0, 1.5, 0]}>
            <sphereGeometry args={[0.8, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#cc4422" roughness={0.8} side={THREE.DoubleSide} transparent opacity={0.85} />
          </mesh>
          {/* Chute lines */}
          {[0, 1, 2, 3].map(i => {
            const angle = (i / 4) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(angle) * 0.3, 0.75, Math.sin(angle) * 0.3]}>
                <cylinderGeometry args={[0.008, 0.008, 1.5, 3]} />
                <meshBasicMaterial color="#886644" />
              </mesh>
            );
          })}
          {/* Supply crate */}
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.4, 0.5]} />
            <meshStandardMaterial color="#8a6a30" roughness={0.85} />
          </mesh>
          {/* Metal straps */}
          <mesh position={[0, 0, 0.252]}>
            <boxGeometry args={[0.52, 0.06, 0.005]} />
            <meshStandardMaterial color="#555550" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0.252, 0, 0]}>
            <boxGeometry args={[0.005, 0.06, 0.52]} />
            <meshStandardMaterial color="#555550" metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Glow beacon */}
          <pointLight color="#ffcc00" intensity={4} distance={6} />
          <Billboard position={[0, 0.8, 0]}>
            <Text fontSize={0.15} color="#ffcc00" anchorX="center" font={undefined} outlineWidth={0.02} outlineColor="#000000">
              📦 SUPPLY DROP
            </Text>
          </Billboard>
        </group>
      )}

      {/* ── Landing marker (pulsing circle on ground) ── */}
      {phase !== 'landed' && (
        <LandingMarker x={targetX} z={targetZ} groundY={groundY} />
      )}
    </group>
  );
}

function LandingMarker({ x, z, groundY }: { x: number; z: number; groundY: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const scale = 0.8 + Math.sin(t * 3) * 0.2;
    ref.current.scale.set(scale, scale, 1);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 4) * 0.15;
  });
  return (
    <mesh ref={ref} position={[x, groundY + 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.5, 8]} />
      <meshBasicMaterial color="#ffcc00" transparent opacity={0.3} />
    </mesh>
  );
}

export function AirdropVFX({ airdrops, grid, onAirdropLanded }: AirdropVFXProps) {
  const activeDrops = airdrops.filter(a => a.phase !== 'landed');
  
  return (
    <group>
      {activeDrops.map(drop => (
        <AirdropPlane
          key={drop.id}
          airdrop={drop}
          grid={grid}
          onLanded={onAirdropLanded}
        />
      ))}
    </group>
  );
}
