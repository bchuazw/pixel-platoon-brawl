import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { Unit, TEAM_COLORS } from '@/game/types';
import * as THREE from 'three';

interface GameUnitsProps {
  units: Unit[];
  selectedUnitId: string | null;
  onUnitClick: (unitId: string) => void;
}

function PixelCharacter({ unit, isSelected, onClick }: { unit: Unit; isSelected: boolean; onClick: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const color = TEAM_COLORS[unit.team];

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    // Idle bounce animation
    const bounce = Math.sin(clock.getElapsedTime() * 3 + unit.position.x * 2) * 0.05;
    groupRef.current.position.y = bounce;

    // Selected pulse
    if (isSelected && bodyRef.current) {
      const pulse = 0.9 + Math.sin(clock.getElapsedTime() * 5) * 0.1;
      bodyRef.current.scale.setScalar(pulse);
    } else if (bodyRef.current) {
      bodyRef.current.scale.setScalar(1);
    }
  });

  if (!unit.isAlive) return null;

  const hpPercent = unit.hp / unit.maxHp;
  const classShapes: Record<string, JSX.Element> = {
    soldier: (
      <group>
        {/* Body */}
        <mesh ref={bodyRef} position={[0, 0.3, 0]}>
          <boxGeometry args={[0.35, 0.4, 0.25]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isSelected ? 0.5 : 0.15} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[0.25, 0.2, 0.2]} />
          <meshStandardMaterial color="#ddc89e" />
        </mesh>
        {/* Helmet */}
        <mesh position={[0, 0.72, 0]}>
          <boxGeometry args={[0.28, 0.08, 0.23]} />
          <meshStandardMaterial color="#3a5a3a" />
        </mesh>
        {/* Gun */}
        <mesh position={[0.2, 0.3, 0]}>
          <boxGeometry args={[0.08, 0.08, 0.35]} />
          <meshStandardMaterial color="#444" />
        </mesh>
      </group>
    ),
    sniper: (
      <group>
        <mesh ref={bodyRef} position={[0, 0.3, 0]}>
          <boxGeometry args={[0.3, 0.45, 0.2]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isSelected ? 0.5 : 0.15} />
        </mesh>
        <mesh position={[0, 0.62, 0]}>
          <boxGeometry args={[0.22, 0.18, 0.18]} />
          <meshStandardMaterial color="#ddc89e" />
        </mesh>
        {/* Hood */}
        <mesh position={[0, 0.7, -0.02]}>
          <boxGeometry args={[0.26, 0.12, 0.22]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Long rifle */}
        <mesh position={[0.18, 0.35, 0]}>
          <boxGeometry args={[0.06, 0.06, 0.5]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      </group>
    ),
    medic: (
      <group>
        <mesh ref={bodyRef} position={[0, 0.3, 0]}>
          <boxGeometry args={[0.32, 0.38, 0.22]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isSelected ? 0.5 : 0.15} />
        </mesh>
        <mesh position={[0, 0.58, 0]}>
          <boxGeometry args={[0.22, 0.18, 0.18]} />
          <meshStandardMaterial color="#ddc89e" />
        </mesh>
        {/* Cross */}
        <mesh position={[0, 0.32, 0.12]}>
          <boxGeometry args={[0.12, 0.12, 0.02]} />
          <meshStandardMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 0.32, 0.13]}>
          <boxGeometry args={[0.04, 0.1, 0.02]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.32, 0.13]}>
          <boxGeometry args={[0.1, 0.04, 0.02]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    ),
    heavy: (
      <group>
        <mesh ref={bodyRef} position={[0, 0.35, 0]}>
          <boxGeometry args={[0.45, 0.5, 0.35]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isSelected ? 0.5 : 0.15} />
        </mesh>
        <mesh position={[0, 0.68, 0]}>
          <boxGeometry args={[0.28, 0.2, 0.22]} />
          <meshStandardMaterial color="#ddc89e" />
        </mesh>
        {/* Heavy weapon */}
        <mesh position={[0.28, 0.35, 0]}>
          <boxGeometry args={[0.1, 0.1, 0.4]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0.28, 0.35, -0.22]}>
          <boxGeometry args={[0.14, 0.14, 0.08]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      </group>
    ),
  };

  return (
    <group
      position={[unit.position.x, 0.15, unit.position.z]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <group ref={groupRef}>
        {classShapes[unit.unitClass]}

        {/* HP Bar */}
        <Billboard position={[0, 1.0, 0]}>
          <mesh position={[-0.15, 0, 0]}>
            <planeGeometry args={[0.5, 0.06]} />
            <meshBasicMaterial color="#222" />
          </mesh>
          <mesh position={[-0.15 + (hpPercent - 1) * 0.25, 0, 0.001]}>
            <planeGeometry args={[0.48 * hpPercent, 0.04]} />
            <meshBasicMaterial color={hpPercent > 0.5 ? '#44cc44' : hpPercent > 0.25 ? '#cccc44' : '#cc4444'} />
          </mesh>
        </Billboard>

        {/* Name label */}
        <Billboard position={[0, 1.15, 0]}>
          <Text fontSize={0.12} color={color} anchorX="center" anchorY="middle" font={undefined}>
            {unit.name}
          </Text>
        </Billboard>

        {/* Selection ring */}
        {isSelected && (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.35, 0.42, 16]} />
            <meshBasicMaterial color={color} transparent opacity={0.7} />
          </mesh>
        )}
      </group>
    </group>
  );
}

export function GameUnits({ units, selectedUnitId, onUnitClick }: GameUnitsProps) {
  return (
    <group>
      {units.map(unit => (
        <PixelCharacter
          key={unit.id}
          unit={unit}
          isSelected={unit.id === selectedUnitId}
          onClick={() => onUnitClick(unit.id)}
        />
      ))}
    </group>
  );
}
