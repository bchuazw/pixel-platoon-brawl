import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { Unit, TEAM_COLORS, CombatEvent } from '@/game/types';
import { playMove } from '@/game/sounds';
import * as THREE from 'three';

import soldierBlueImg from '@/assets/soldier-blue.png';
import sniperRedImg from '@/assets/sniper-red.png';
import heavyGreenImg from '@/assets/heavy-green.png';
import medicYellowImg from '@/assets/medic-yellow.png';

interface GameUnitsProps {
  units: Unit[];
  selectedUnitId: string | null;
  onUnitClick: (unitId: string) => void;
  combatEvents: CombatEvent[];
}

const SPRITE_MAP: Record<string, string> = {
  blue: soldierBlueImg,
  red: sniperRedImg,
  green: heavyGreenImg,
  yellow: medicYellowImg,
};

type AnimState = 'idle' | 'moving' | 'aiming' | 'shooting' | 'recoil' | 'hit' | 'dying' | 'healing';

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

function PixelCharacter({ unit, isSelected, onClick, combatEvents }: {
  unit: Unit; isSelected: boolean; onClick: () => void; combatEvents: CombatEvent[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const spriteRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const color = TEAM_COLORS[unit.team];

  // Animation state
  const animState = useRef<AnimState>('idle');
  const animTimer = useRef(0);
  const animatedPos = useRef(new THREE.Vector3(unit.position.x, 0.1, unit.position.z));
  const prevPos = useRef({ x: unit.position.x, z: unit.position.z });
  const prevHp = useRef(unit.hp);
  const prevAlive = useRef(unit.isAlive);
  const deathTimer = useRef(0);
  const targetDir = useRef(new THREE.Vector2(1, 0)); // direction to face when shooting
  const flashIntensity = useRef(0);

  const texture = useLoader(THREE.TextureLoader, SPRITE_MAP[unit.team]);
  const processedTexture = useMemo(() => {
    const tex = texture.clone();
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, [texture]);

  // Detect combat events targeting this unit
  useEffect(() => {
    const recent = combatEvents.filter(e => Date.now() - e.timestamp < 300);
    for (const e of recent) {
      // This unit is attacking
      if (e.attackerPos.x === unit.position.x && e.attackerPos.z === unit.position.z &&
          (e.type === 'damage' || e.type === 'crit' || e.type === 'kill' || e.type === 'miss')) {
        targetDir.current.set(
          e.targetPos.x - e.attackerPos.x,
          e.targetPos.z - e.attackerPos.z
        ).normalize();
        animState.current = 'aiming';
        animTimer.current = 0;
      }
      // This unit is being hit
      if (e.targetPos.x === unit.position.x && e.targetPos.z === unit.position.z &&
          (e.type === 'damage' || e.type === 'crit')) {
        animState.current = 'hit';
        animTimer.current = 0;
      }
      // This unit is being healed
      if (e.targetPos.x === unit.position.x && e.targetPos.z === unit.position.z && e.type === 'heal') {
        animState.current = 'healing';
        animTimer.current = 0;
      }
    }
  }, [combatEvents, unit.position.x, unit.position.z]);

  // Detect death
  useEffect(() => {
    if (prevAlive.current && !unit.isAlive) {
      animState.current = 'dying';
      animTimer.current = 0;
      deathTimer.current = 0;
    }
    prevAlive.current = unit.isAlive;
  }, [unit.isAlive]);

  // Detect HP change (got hit)
  useEffect(() => {
    if (unit.hp < prevHp.current && unit.isAlive) {
      flashIntensity.current = 1;
    }
    prevHp.current = unit.hp;
  }, [unit.hp, unit.isAlive]);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current || !innerRef.current) return;
    const t = clock.getElapsedTime();
    animTimer.current += delta;

    // ── Death animation ──
    if (animState.current === 'dying' || (!unit.isAlive && deathTimer.current < 2)) {
      deathTimer.current += delta;
      const dt = deathTimer.current;

      // Fall over
      innerRef.current.rotation.z = Math.min(Math.PI / 2, dt * 4);
      // Sink down
      innerRef.current.position.y = -dt * 0.3;
      // Fade out
      if (spriteRef.current) {
        const mat = spriteRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - dt * 0.8);
      }
      groupRef.current.position.set(unit.position.x, 0.1, unit.position.z);
      return;
    }

    if (!unit.isAlive) return;

    // ── Movement detection ──
    if (prevPos.current.x !== unit.position.x || prevPos.current.z !== unit.position.z) {
      prevPos.current = { x: unit.position.x, z: unit.position.z };
      animState.current = 'moving';
      animTimer.current = 0;
      playMove();
    }

    // ── State machine ──
    switch (animState.current) {
      case 'moving': {
        const moveT = Math.min(1, animTimer.current / 0.5);
        const eased = 1 - Math.pow(1 - moveT, 3);

        animatedPos.current.x = THREE.MathUtils.lerp(animatedPos.current.x, unit.position.x, eased);
        animatedPos.current.z = THREE.MathUtils.lerp(animatedPos.current.z, unit.position.z, eased);

        // Hop arc
        const hopHeight = Math.sin(moveT * Math.PI) * 0.35;
        groupRef.current.position.set(animatedPos.current.x, 0.1 + hopHeight, animatedPos.current.z);

        // Run lean + bob
        innerRef.current.rotation.x = Math.sin(moveT * Math.PI) * 0.2;
        innerRef.current.rotation.z = Math.sin(moveT * Math.PI * 6) * 0.1;
        // Scale squash on land
        const squash = moveT > 0.85 ? 1 + (1 - moveT) * 1.5 : 1;
        innerRef.current.scale.set(squash, 1 / squash, 1);

        if (moveT >= 1) {
          animState.current = 'idle';
          animatedPos.current.set(unit.position.x, 0.1, unit.position.z);
          innerRef.current.rotation.x = 0;
          innerRef.current.rotation.z = 0;
          innerRef.current.scale.set(1, 1, 1);
        }
        break;
      }

      case 'aiming': {
        // Wind up for 0.3s, lean toward target
        const aimT = Math.min(1, animTimer.current / 0.3);
        const leanX = targetDir.current.x * 0.15 * aimT;
        innerRef.current.position.x = leanX;
        innerRef.current.rotation.z = -targetDir.current.x * 0.1 * aimT;
        // Squint (scale down slightly)
        const aimScale = 1 - aimT * 0.05;
        innerRef.current.scale.set(aimScale, aimScale, 1);

        if (aimT >= 1) {
          animState.current = 'shooting';
          animTimer.current = 0;
        }
        groupRef.current.position.set(unit.position.x, 0.1, unit.position.z);
        break;
      }

      case 'shooting': {
        // Quick recoil burst 0.15s
        const shootT = Math.min(1, animTimer.current / 0.15);

        // Recoil kick back
        const recoilAmt = Math.sin(shootT * Math.PI) * 0.2;
        innerRef.current.position.x = -targetDir.current.x * recoilAmt;
        innerRef.current.position.y = Math.sin(shootT * Math.PI) * 0.08;

        // Flash scale burst
        const burstScale = 1 + Math.sin(shootT * Math.PI) * 0.2;
        innerRef.current.scale.set(burstScale, burstScale, 1);

        // Sprite shake
        innerRef.current.rotation.z = Math.sin(shootT * Math.PI * 8) * 0.06;

        flashIntensity.current = Math.max(0, 1 - shootT);

        if (shootT >= 1) {
          animState.current = 'recoil';
          animTimer.current = 0;
        }
        groupRef.current.position.set(unit.position.x, 0.1, unit.position.z);
        break;
      }

      case 'recoil': {
        // Recovery 0.3s
        const recoilT = Math.min(1, animTimer.current / 0.3);
        const ease = 1 - Math.pow(1 - recoilT, 2);
        innerRef.current.position.x = THREE.MathUtils.lerp(innerRef.current.position.x, 0, ease);
        innerRef.current.position.y = THREE.MathUtils.lerp(innerRef.current.position.y, 0, ease);
        innerRef.current.rotation.z = THREE.MathUtils.lerp(innerRef.current.rotation.z, 0, ease);
        innerRef.current.scale.set(
          THREE.MathUtils.lerp(innerRef.current.scale.x, 1, ease),
          THREE.MathUtils.lerp(innerRef.current.scale.y, 1, ease),
          1
        );

        if (recoilT >= 1) {
          animState.current = 'idle';
          innerRef.current.position.set(0, 0, 0);
          innerRef.current.scale.set(1, 1, 1);
        }
        groupRef.current.position.set(unit.position.x, 0.1, unit.position.z);
        break;
      }

      case 'hit': {
        // Flinch back 0.4s
        const hitT = Math.min(1, animTimer.current / 0.4);

        // Knockback
        const knockback = Math.sin(hitT * Math.PI) * 0.15;
        innerRef.current.position.x = knockback;
        // Flash red
        flashIntensity.current = Math.max(0, Math.sin(hitT * Math.PI * 3));
        // Shake
        innerRef.current.rotation.z = Math.sin(hitT * Math.PI * 10) * 0.12 * (1 - hitT);
        // Squash on impact
        const hitSquash = 1 + Math.sin(hitT * Math.PI) * 0.1;
        innerRef.current.scale.set(hitSquash, 1 / hitSquash, 1);

        if (hitT >= 1) {
          animState.current = 'idle';
          innerRef.current.position.set(0, 0, 0);
          innerRef.current.rotation.z = 0;
          innerRef.current.scale.set(1, 1, 1);
          flashIntensity.current = 0;
        }
        groupRef.current.position.set(unit.position.x, 0.1, unit.position.z);
        break;
      }

      case 'healing': {
        // Rise up with glow 0.6s
        const healT = Math.min(1, animTimer.current / 0.6);
        innerRef.current.position.y = Math.sin(healT * Math.PI) * 0.15;
        const healScale = 1 + Math.sin(healT * Math.PI) * 0.08;
        innerRef.current.scale.set(healScale, healScale, 1);

        if (healT >= 1) {
          animState.current = 'idle';
          innerRef.current.position.set(0, 0, 0);
          innerRef.current.scale.set(1, 1, 1);
        }
        groupRef.current.position.set(unit.position.x, 0.1, unit.position.z);
        break;
      }

      default: {
        // ── Idle animation ──
        groupRef.current.position.set(unit.position.x, 0.1, unit.position.z);
        const bounce = Math.sin(t * 2.5 + unit.position.x * 1.5) * 0.04;
        innerRef.current.position.y = bounce;
        innerRef.current.position.x = 0;
        innerRef.current.rotation.x = 0;
        innerRef.current.rotation.z = Math.sin(t * 1.5) * 0.02;
        innerRef.current.scale.set(1, 1, 1);

        // Suppressed shake
        if (unit.isSuppressed) {
          innerRef.current.position.x = Math.sin(t * 15) * 0.03;
          innerRef.current.rotation.z = Math.sin(t * 12) * 0.04;
        }
      }
    }

    // ── Flash overlay (hit/shoot feedback) ──
    if (spriteRef.current) {
      const mat = spriteRef.current.material as THREE.MeshBasicMaterial;
      if (flashIntensity.current > 0) {
        mat.color.setRGB(1, 1 - flashIntensity.current * 0.5, 1 - flashIntensity.current * 0.5);
        flashIntensity.current = Math.max(0, flashIntensity.current - delta * 4);
      } else {
        mat.color.setRGB(1, 1, 1);
      }
      mat.opacity = 1;
    }

    // Selection ring pulse
    if (isSelected && ringRef.current) {
      const scale = 1 + Math.sin(t * 4) * 0.1;
      ringRef.current.scale.set(scale, 1, scale);
    }
  });

  // Show dead units fading for a bit
  if (!unit.isAlive && deathTimer.current >= 2) return null;

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

        {/* Muzzle flash light (during shooting) */}
        {animState.current === 'shooting' && (
          <pointLight
            position={[targetDir.current.x * 0.4, 0.6, targetDir.current.y * 0.4]}
            color="#ffaa00"
            intensity={3}
            distance={3}
          />
        )}

        {/* Healing particles */}
        {animState.current === 'healing' && (
          <>
            {[0, 1, 2, 3, 4].map(i => (
              <Billboard key={i} position={[
                Math.sin(Date.now() * 0.003 + i * 1.2) * 0.3,
                0.3 + ((Date.now() * 0.002 + i * 0.5) % 1) * 0.7,
                Math.cos(Date.now() * 0.003 + i * 1.2) * 0.3
              ]}>
                <mesh>
                  <planeGeometry args={[0.08, 0.08]} />
                  <meshBasicMaterial color="#44ff88" transparent opacity={0.7} />
                </mesh>
              </Billboard>
            ))}
          </>
        )}

        {/* Shadow */}
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.6, 1]}>
          <circleGeometry args={[0.25, 12]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.3} />
        </mesh>

        {/* HP Bar */}
        {unit.isAlive && (
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
        )}

        {/* AP Dots */}
        {unit.isAlive && (
          <Billboard position={[0, 1.05, 0]}>
            {apDots.map((filled, i) => (
              <mesh key={i} position={[-0.08 * (apDots.length - 1) / 2 + i * 0.08, 0, 0]}>
                <circleGeometry args={[0.025, 6]} />
                <meshBasicMaterial color={filled ? '#ffcc00' : '#333333'} />
              </mesh>
            ))}
          </Billboard>
        )}

        {/* Name + Class */}
        {unit.isAlive && (
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
        )}

        <CoverShield coverType={unit.coverType} />
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

        {/* Overwatch range */}
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

export function GameUnits({ units, selectedUnitId, onUnitClick, combatEvents }: GameUnitsProps) {
  return (
    <group>
      {units.map(unit => (
        <PixelCharacter
          key={unit.id}
          unit={unit}
          isSelected={unit.id === selectedUnitId}
          onClick={() => onUnitClick(unit.id)}
          combatEvents={combatEvents}
        />
      ))}
    </group>
  );
}
