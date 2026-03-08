import { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { Unit, TEAM_COLORS } from '@/game/types';
import * as THREE from 'three';

import soldierBlueImg from '@/assets/soldier-blue.png';
import sniperRedImg from '@/assets/sniper-red.png';
import heavyGreenImg from '@/assets/heavy-green.png';
import medicYellowImg from '@/assets/medic-yellow.png';

interface GameUnitsProps {
  units: Unit[];
  selectedUnitId: string | null;
  onUnitClick: (unitId: string) => void;
}

const SPRITE_MAP: Record<string, string> = {
  'blue': soldierBlueImg,
  'red': sniperRedImg,
  'green': heavyGreenImg,
  'yellow': medicYellowImg,
};

function PixelCharacter({ unit, isSelected, onClick }: { unit: Unit; isSelected: boolean; onClick: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const spriteRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const color = TEAM_COLORS[unit.team];

  const texture = useLoader(THREE.TextureLoader, SPRITE_MAP[unit.team]);

  const processedTexture = useMemo(() => {
    const tex = texture.clone();
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, [texture]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    // Idle bounce
    const bounce = Math.sin(clock.getElapsedTime() * 2.5 + unit.position.x * 1.5) * 0.04;
    groupRef.current.position.y = bounce;

    // Selection ring pulse
    if (isSelected && ringRef.current) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.1;
      ringRef.current.scale.set(scale, 1, scale);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(clock.getElapsedTime() * 3) * 0.2;
    }
  });

  if (!unit.isAlive) return null;

  const hpPercent = unit.hp / unit.maxHp;

  return (
    <group
      position={[unit.position.x, 0.1, unit.position.z]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <group ref={groupRef}>
        {/* Sprite billboard */}
        <Billboard position={[0, 0.55, 0]}>
          <mesh ref={spriteRef}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial
              map={processedTexture}
              transparent
              alphaTest={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        </Billboard>

        {/* Shadow */}
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.6, 1]}>
          <circleGeometry args={[0.25, 12]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.3} />
        </mesh>

        {/* HP Bar background */}
        <Billboard position={[0, 1.1, 0]}>
          <mesh position={[0, 0, -0.001]}>
            <planeGeometry args={[0.55, 0.07]} />
            <meshBasicMaterial color="#1a1a1a" />
          </mesh>
          {/* HP Bar fill */}
          <mesh position={[(hpPercent - 1) * 0.255, 0, 0]}>
            <planeGeometry args={[0.51 * hpPercent, 0.05]} />
            <meshBasicMaterial color={hpPercent > 0.5 ? '#44cc44' : hpPercent > 0.25 ? '#cccc44' : '#cc4444'} />
          </mesh>
        </Billboard>

        {/* Name label */}
        <Billboard position={[0, 1.25, 0]}>
          <Text fontSize={0.11} color={color} anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.02} outlineColor="#000000">
            {unit.name}
          </Text>
          <Text fontSize={0.07} color="#aaaaaa" anchorX="center" anchorY="middle" position={[0, -0.12, 0]}
            outlineWidth={0.015} outlineColor="#000000" font={undefined}>
            {unit.unitClass.toUpperCase()} Lv{unit.level}
          </Text>
        </Billboard>

        {/* Selection ring */}
        {isSelected && (
          <mesh ref={ringRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.38, 0.45, 20]} />
            <meshBasicMaterial color={color} transparent opacity={0.7} />
          </mesh>
        )}

        {/* Team indicator dot */}
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.06, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
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
