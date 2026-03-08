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
  blue: soldierBlueImg,
  red: sniperRedImg,
  green: heavyGreenImg,
  yellow: medicYellowImg,
};

function CoverShield({ coverType }: { coverType: 'none' | 'half' | 'full' }) {
  if (coverType === 'none') return null;
  return (
    <Billboard position={[0.35, 0.3, 0]}>
      <mesh>
        <planeGeometry args={[0.18, 0.18]} />
        <meshBasicMaterial
          color={coverType === 'full' ? '#4488ff' : '#ffaa44'}
          transparent opacity={0.8}
        />
      </mesh>
      <Text fontSize={0.1} color="#ffffff" anchorX="center" anchorY="middle" position={[0, 0, 0.01]} font={undefined}>
        {coverType === 'full' ? '🛡' : '◐'}
      </Text>
    </Billboard>
  );
}

function StatusIcons({ unit }: { unit: Unit }) {
  const icons: { text: string; color: string }[] = [];
  if (unit.isOnOverwatch) icons.push({ text: '👁', color: '#44aaff' });
  if (unit.isSuppressed) icons.push({ text: '⛔', color: '#ff4444' });
  if (icons.length === 0) return null;

  return (
    <>
      {icons.map((icon, i) => (
        <Billboard key={i} position={[-0.35 + i * 0.2, 0.9, 0]}>
          <Text fontSize={0.14} color={icon.color} anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.02} outlineColor="#000000">
            {icon.text}
          </Text>
        </Billboard>
      ))}
    </>
  );
}

function PixelCharacter({ unit, isSelected, onClick }: { unit: Unit; isSelected: boolean; onClick: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const color = TEAM_COLORS[unit.team];

  // Track animated position for smooth movement
  const animatedPos = useRef(new THREE.Vector3(unit.position.x, 0.1, unit.position.z));
  const prevPos = useRef({ x: unit.position.x, z: unit.position.z });
  const moveStartTime = useRef(0);
  const isMoving = useRef(false);
  const attackFlash = useRef(0);

  const texture = useLoader(THREE.TextureLoader, SPRITE_MAP[unit.team]);

  const processedTexture = useMemo(() => {
    const tex = texture.clone();
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, [texture]);

  useFrame(({ clock }) => {
    if (!groupRef.current || !innerRef.current) return;
    const t = clock.getElapsedTime();

    // Detect position change → trigger move animation
    if (prevPos.current.x !== unit.position.x || prevPos.current.z !== unit.position.z) {
      // Start from current animated position
      animatedPos.current.set(
        animatedPos.current.x,
        0.1,
        animatedPos.current.z
      );
      prevPos.current = { x: unit.position.x, z: unit.position.z };
      moveStartTime.current = t;
      isMoving.current = true;
    }

    // Smooth movement lerp
    const targetX = unit.position.x;
    const targetZ = unit.position.z;
    const moveDuration = 0.4;
    const moveElapsed = t - moveStartTime.current;

    if (isMoving.current) {
      const moveT = Math.min(1, moveElapsed / moveDuration);
      const eased = 1 - Math.pow(1 - moveT, 3); // ease out cubic

      animatedPos.current.x = THREE.MathUtils.lerp(animatedPos.current.x, targetX, eased);
      animatedPos.current.z = THREE.MathUtils.lerp(animatedPos.current.z, targetZ, eased);

      // Hop effect during movement
      const hopHeight = Math.sin(moveT * Math.PI) * 0.3;
      groupRef.current.position.set(animatedPos.current.x, 0.1 + hopHeight, animatedPos.current.z);

      // Lean forward during movement
      innerRef.current.rotation.x = Math.sin(moveT * Math.PI) * 0.15;

      // Sprite wobble (walking feel)
      innerRef.current.rotation.z = Math.sin(moveT * Math.PI * 4) * 0.08;

      if (moveT >= 1) {
        isMoving.current = false;
        animatedPos.current.set(targetX, 0.1, targetZ);
        innerRef.current.rotation.x = 0;
        innerRef.current.rotation.z = 0;
      }
    } else {
      // Snap to position if not animating
      groupRef.current.position.set(targetX, 0.1, targetZ);

      // Idle bounce
      const bounce = Math.sin(t * 2.5 + unit.position.x * 1.5) * 0.04;
      innerRef.current.position.y = bounce;
      innerRef.current.rotation.x = 0;
      innerRef.current.rotation.z = Math.sin(t * 1.5) * 0.02; // subtle sway
    }

    // Suppressed shake
    if (unit.isSuppressed && !isMoving.current) {
      innerRef.current.position.x = Math.sin(t * 15) * 0.02;
    } else if (!isMoving.current) {
      innerRef.current.position.x = 0;
    }

    // Attack flash effect
    if (attackFlash.current > 0) {
      attackFlash.current -= 0.05;
      const scale = 1 + attackFlash.current * 0.15;
      innerRef.current.scale.setScalar(scale);
    } else {
      innerRef.current.scale.setScalar(1);
    }

    // Selection ring pulse
    if (isSelected && ringRef.current) {
      const scale = 1 + Math.sin(t * 4) * 0.1;
      ringRef.current.scale.set(scale, 1, scale);
    }
  });

  if (!unit.isAlive) return null;

  const hpPercent = unit.hp / unit.maxHp;
  const apDots = [];
  for (let i = 0; i < unit.maxAp; i++) {
    apDots.push(i < unit.ap);
  }

  return (
    <group
      ref={groupRef}
      position={[unit.position.x, 0.1, unit.position.z]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <group ref={innerRef}>
        {/* Sprite */}
        <Billboard position={[0, 0.55, 0]}>
          <mesh>
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

        {/* HP Bar */}
        <Billboard position={[0, 1.15, 0]}>
          <mesh position={[0, 0, -0.001]}>
            <planeGeometry args={[0.6, 0.07]} />
            <meshBasicMaterial color="#111111" />
          </mesh>
          <mesh position={[(hpPercent - 1) * 0.28, 0, 0]}>
            <planeGeometry args={[0.56 * hpPercent, 0.05]} />
            <meshBasicMaterial color={hpPercent > 0.5 ? '#44cc44' : hpPercent > 0.25 ? '#cccc44' : '#cc4444'} />
          </mesh>
        </Billboard>

        {/* AP Dots */}
        <Billboard position={[0, 1.05, 0]}>
          {apDots.map((filled, i) => (
            <mesh key={i} position={[-0.08 * (apDots.length - 1) / 2 + i * 0.08, 0, 0]}>
              <circleGeometry args={[0.025, 6]} />
              <meshBasicMaterial color={filled ? '#ffcc00' : '#333333'} />
            </mesh>
          ))}
        </Billboard>

        {/* Name + Class */}
        <Billboard position={[0, 1.3, 0]}>
          <Text fontSize={0.1} color={color} anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.02} outlineColor="#000000">
            {unit.name}
          </Text>
          <Text fontSize={0.06} color="#999999" anchorX="center" anchorY="middle" position={[0, -0.11, 0]}
            outlineWidth={0.015} outlineColor="#000000" font={undefined}>
            {unit.unitClass.toUpperCase()} Lv{unit.level}
          </Text>
        </Billboard>

        {/* Cover indicator */}
        <CoverShield coverType={unit.coverType} />

        {/* Status icons */}
        <StatusIcons unit={unit} />

        {/* Selection ring */}
        {isSelected && (
          <mesh ref={ringRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.38, 0.48, 20]} />
            <meshBasicMaterial color={color} transparent opacity={0.7} />
          </mesh>
        )}

        {/* Team dot */}
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.06, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>

        {/* Overwatch range indicator */}
        {unit.isOnOverwatch && (
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[unit.attackRange - 0.1, unit.attackRange + 0.1, 24]} />
            <meshBasicMaterial color="#44aaff" transparent opacity={0.12} side={THREE.DoubleSide} />
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
