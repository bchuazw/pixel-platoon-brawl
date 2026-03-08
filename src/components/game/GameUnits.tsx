import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { Unit, TEAM_COLORS, CombatEvent, Position, TileData } from '@/game/types';
import { getTileY } from './GridTiles';
import { playMove } from '@/game/sounds';
import * as THREE from 'three';

import spriteSoldierImg from '@/assets/sprite-soldier.png';
import spriteSniperImg from '@/assets/sprite-sniper.png';
import spriteHeavyImg from '@/assets/sprite-heavy.png';
import spriteMedicImg from '@/assets/sprite-medic.png';

interface GameUnitsProps {
  units: Unit[];
  selectedUnitId: string | null;
  onUnitClick: (unitId: string) => void;
  combatEvents: CombatEvent[];
  movePath: Position[] | null;
  movingUnitId: string | null;
  grid: TileData[][];
  onMoveComplete?: () => void;
}

// Sprite sheet layout: 4 columns x 4 rows
// Row 0: idle (4 frames), Row 1: walk (4 frames), Row 2: shoot (4 frames), Row 3: death (4 frames)
const SPRITE_COLS = 4;
const SPRITE_ROWS = 4;
const FRAME_W = 1 / SPRITE_COLS;
const FRAME_H = 1 / SPRITE_ROWS;

// Animation row mapping
const ANIM_ROW: Record<string, number> = {
  idle: 0,
  walking: 1,
  aiming: 2,
  shooting: 2,
  recoil: 2,
  hit: 0,
  dying: 3,
  healing: 0,
};

// Frames per second for each animation
const ANIM_FPS: Record<string, number> = {
  idle: 3,
  walking: 8,
  aiming: 6,
  shooting: 10,
  recoil: 6,
  hit: 8,
  dying: 4,
  healing: 4,
};

const SPRITE_MAP: Record<string, string> = {
  blue: spriteSoldierImg,
  red: spriteSniperImg,
  green: spriteHeavyImg,
  yellow: spriteMedicImg,
};

type AnimState = 'idle' | 'walking' | 'aiming' | 'shooting' | 'recoil' | 'hit' | 'dying' | 'healing';

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

function PixelCharacter({ unit, isSelected, onClick, combatEvents, movePath, isMoving, grid, onMoveComplete }: {
  unit: Unit; isSelected: boolean; onClick: () => void; combatEvents: CombatEvent[];
  movePath: Position[] | null; isMoving: boolean; grid: TileData[][]; onMoveComplete?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const spriteRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const color = TEAM_COLORS[unit.team];

  // Animation state
  const animState = useRef<AnimState>('idle');
  const animTimer = useRef(0);
  const prevPos = useRef({ x: unit.position.x, z: unit.position.z });
  const prevHp = useRef(unit.hp);
  const prevAlive = useRef(unit.isAlive);
  const deathTimer = useRef(0);
  const targetDir = useRef(new THREE.Vector2(1, 0));
  const flashIntensity = useRef(0);

  // Path walking state
  const pathRef = useRef<Position[] | null>(null);
  const pathIndex = useRef(0);
  const walkProgress = useRef(1); // 0-1 progress between path nodes
  const walkFrom = useRef(new THREE.Vector3(unit.position.x, 0.1, unit.position.z));
  const walkTo = useRef(new THREE.Vector3(unit.position.x, 0.1, unit.position.z));
  const currentVisualPos = useRef(new THREE.Vector3(unit.position.x, 0.1, unit.position.z));
  const moveCompleted = useRef(false);

  // Sprite sheet frame tracking
  const frameTimer = useRef(0);
  const currentFrame = useRef(0);

  const texture = useLoader(THREE.TextureLoader, SPRITE_MAP[unit.team]);
  const processedTexture = useMemo(() => {
    const tex = texture.clone();
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    // Set initial UV to show first frame (top-left)
    tex.repeat.set(FRAME_W, FRAME_H);
    tex.offset.set(0, 1 - FRAME_H); // Row 0, Col 0 (UV origin is bottom-left)
    tex.needsUpdate = true;
    return tex;
  }, [texture]);

  // Start walking along a new path
  useEffect(() => {
    if (movePath && isMoving && movePath.length > 0) {
      pathRef.current = movePath;
      pathIndex.current = 0;
      walkProgress.current = 0;
      moveCompleted.current = false;
      animState.current = 'walking';
      animTimer.current = 0;

      // Set initial walk segment
      const fromElev = grid[prevPos.current.x]?.[prevPos.current.z]?.elevation || 0;
      walkFrom.current.set(prevPos.current.x, getTileY(fromElev) + 0.1, prevPos.current.z);

      const firstTarget = movePath[0];
      const toElev = grid[firstTarget.x]?.[firstTarget.z]?.elevation || 0;
      walkTo.current.set(firstTarget.x, getTileY(toElev) + 0.1, firstTarget.z);

      playMove();
    }
  }, [movePath, isMoving]);

  // Detect combat events targeting this unit
  useEffect(() => {
    const recent = combatEvents.filter(e => Date.now() - e.timestamp < 300);
    for (const e of recent) {
      if (e.attackerPos.x === unit.position.x && e.attackerPos.z === unit.position.z &&
          (e.type === 'damage' || e.type === 'crit' || e.type === 'kill' || e.type === 'miss')) {
        targetDir.current.set(
          e.targetPos.x - e.attackerPos.x,
          e.targetPos.z - e.attackerPos.z
        ).normalize();
        animState.current = 'aiming';
        animTimer.current = 0;
      }
      if (e.targetPos.x === unit.position.x && e.targetPos.z === unit.position.z &&
          (e.type === 'damage' || e.type === 'crit')) {
        animState.current = 'hit';
        animTimer.current = 0;
      }
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

  // Update prevPos when position changes (but not during path walking)
  useEffect(() => {
    if (!pathRef.current || pathRef.current.length === 0) {
      prevPos.current = { x: unit.position.x, z: unit.position.z };
    }
  }, [unit.position.x, unit.position.z]);

  const WALK_SPEED = 4.0; // tiles per second

  useFrame(({ clock }, delta) => {
    if (!groupRef.current || !innerRef.current) return;
    const t = clock.getElapsedTime();
    animTimer.current += delta;

    // Get elevation-aware Y for unit's logical position
    const unitElev = grid[unit.position.x]?.[unit.position.z]?.elevation || 0;
    const unitBaseY = getTileY(unitElev) + 0.1;

    // ── Death animation ──
    if (animState.current === 'dying' || (!unit.isAlive && deathTimer.current < 2)) {
      deathTimer.current += delta;
      const dt = deathTimer.current;
      innerRef.current.rotation.z = Math.min(Math.PI / 2, dt * 4);
      innerRef.current.position.y = -dt * 0.3;

      // Animate death sprite row
      const deathFps = ANIM_FPS['dying'];
      frameTimer.current += delta;
      if (frameTimer.current >= 1 / deathFps) {
        frameTimer.current = 0;
        currentFrame.current = Math.min(currentFrame.current + 1, SPRITE_COLS - 1);
      }
      const deathRow = ANIM_ROW['dying'];
      processedTexture.offset.set(currentFrame.current * FRAME_W, 1 - (deathRow + 1) * FRAME_H);

      if (spriteRef.current) {
        const mat = spriteRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - dt * 0.8);
      }
      groupRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
      return;
    }

    if (!unit.isAlive) return;

    // ── Path walking animation ──
    if (animState.current === 'walking' && pathRef.current && pathRef.current.length > 0) {
      walkProgress.current += delta * WALK_SPEED;

      if (walkProgress.current >= 1) {
        // Arrived at current path node
        const currentTarget = pathRef.current[pathIndex.current];
        currentVisualPos.current.copy(walkTo.current);

        pathIndex.current++;

        if (pathIndex.current < pathRef.current.length) {
          // Move to next segment
          walkProgress.current = 0;
          walkFrom.current.copy(walkTo.current);
          const nextTarget = pathRef.current[pathIndex.current];
          const nextElev = grid[nextTarget.x]?.[nextTarget.z]?.elevation || 0;
          walkTo.current.set(nextTarget.x, getTileY(nextElev) + 0.1, nextTarget.z);
        } else {
          // Path complete
          animState.current = 'idle';
          pathRef.current = null;
          prevPos.current = { x: unit.position.x, z: unit.position.z };
          currentVisualPos.current.set(unit.position.x, unitBaseY, unit.position.z);
          innerRef.current.rotation.x = 0;
          innerRef.current.rotation.z = 0;
          innerRef.current.scale.set(1, 1, 1);

          if (!moveCompleted.current && onMoveComplete) {
            moveCompleted.current = true;
            onMoveComplete();
          }
        }
      }

      if (animState.current === 'walking') {
        const p = Math.min(1, walkProgress.current);
        const eased = p; // linear for consistent walking speed

        // Interpolate position
        currentVisualPos.current.lerpVectors(walkFrom.current, walkTo.current, eased);

        // Hop arc per step
        const hopHeight = Math.sin(p * Math.PI) * 0.15;
        groupRef.current.position.set(
          currentVisualPos.current.x,
          currentVisualPos.current.y + hopHeight,
          currentVisualPos.current.z
        );

        // Walking bobbing animation
        const walkCycle = t * 12;
        innerRef.current.rotation.x = Math.sin(walkCycle) * 0.08;
        innerRef.current.rotation.z = Math.sin(walkCycle * 0.5) * 0.06;
        // Slight lean in direction of travel
        const dx = walkTo.current.x - walkFrom.current.x;
        innerRef.current.rotation.z += dx * 0.1;
        innerRef.current.scale.set(1, 1, 1);
      }
    } else if (animState.current === 'aiming') {
      const aimT = Math.min(1, animTimer.current / 0.3);
      const leanX = targetDir.current.x * 0.15 * aimT;
      innerRef.current.position.x = leanX;
      innerRef.current.rotation.z = -targetDir.current.x * 0.1 * aimT;
      const aimScale = 1 - aimT * 0.05;
      innerRef.current.scale.set(aimScale, aimScale, 1);

      if (aimT >= 1) {
        animState.current = 'shooting';
        animTimer.current = 0;
      }
      groupRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else if (animState.current === 'shooting') {
      const shootT = Math.min(1, animTimer.current / 0.15);
      const recoilAmt = Math.sin(shootT * Math.PI) * 0.2;
      innerRef.current.position.x = -targetDir.current.x * recoilAmt;
      innerRef.current.position.y = Math.sin(shootT * Math.PI) * 0.08;
      const burstScale = 1 + Math.sin(shootT * Math.PI) * 0.2;
      innerRef.current.scale.set(burstScale, burstScale, 1);
      innerRef.current.rotation.z = Math.sin(shootT * Math.PI * 8) * 0.06;
      flashIntensity.current = Math.max(0, 1 - shootT);

      if (shootT >= 1) {
        animState.current = 'recoil';
        animTimer.current = 0;
      }
      groupRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else if (animState.current === 'recoil') {
      const recoilT = Math.min(1, animTimer.current / 0.3);
      const ease = 1 - Math.pow(1 - recoilT, 2);
      innerRef.current.position.x = THREE.MathUtils.lerp(innerRef.current.position.x, 0, ease);
      innerRef.current.position.y = THREE.MathUtils.lerp(innerRef.current.position.y, 0, ease);
      innerRef.current.rotation.z = THREE.MathUtils.lerp(innerRef.current.rotation.z, 0, ease);
      innerRef.current.scale.set(
        THREE.MathUtils.lerp(innerRef.current.scale.x, 1, ease),
        THREE.MathUtils.lerp(innerRef.current.scale.y, 1, ease), 1
      );
      if (recoilT >= 1) {
        animState.current = 'idle';
        innerRef.current.position.set(0, 0, 0);
        innerRef.current.scale.set(1, 1, 1);
      }
      groupRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else if (animState.current === 'hit') {
      const hitT = Math.min(1, animTimer.current / 0.4);
      const knockback = Math.sin(hitT * Math.PI) * 0.15;
      innerRef.current.position.x = knockback;
      flashIntensity.current = Math.max(0, Math.sin(hitT * Math.PI * 3));
      innerRef.current.rotation.z = Math.sin(hitT * Math.PI * 10) * 0.12 * (1 - hitT);
      const hitSquash = 1 + Math.sin(hitT * Math.PI) * 0.1;
      innerRef.current.scale.set(hitSquash, 1 / hitSquash, 1);
      if (hitT >= 1) {
        animState.current = 'idle';
        innerRef.current.position.set(0, 0, 0);
        innerRef.current.rotation.z = 0;
        innerRef.current.scale.set(1, 1, 1);
        flashIntensity.current = 0;
      }
      groupRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else if (animState.current === 'healing') {
      const healT = Math.min(1, animTimer.current / 0.6);
      innerRef.current.position.y = Math.sin(healT * Math.PI) * 0.15;
      const healScale = 1 + Math.sin(healT * Math.PI) * 0.08;
      innerRef.current.scale.set(healScale, healScale, 1);
      if (healT >= 1) {
        animState.current = 'idle';
        innerRef.current.position.set(0, 0, 0);
        innerRef.current.scale.set(1, 1, 1);
      }
      groupRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else {
      // ── Idle animation ──
      groupRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
      const bounce = Math.sin(t * 2.5 + unit.position.x * 1.5) * 0.04;
      innerRef.current.position.y = bounce;
      innerRef.current.position.x = 0;
      innerRef.current.rotation.x = 0;
      innerRef.current.rotation.z = Math.sin(t * 1.5) * 0.02;
      innerRef.current.scale.set(1, 1, 1);

      if (unit.isSuppressed) {
        innerRef.current.position.x = Math.sin(t * 15) * 0.03;
        innerRef.current.rotation.z = Math.sin(t * 12) * 0.04;
      }
    }

    // ── Sprite sheet frame animation ──
    const animRow = ANIM_ROW[animState.current] ?? 0;
    const fps = ANIM_FPS[animState.current] ?? 4;
    frameTimer.current += delta;
    if (frameTimer.current >= 1 / fps) {
      frameTimer.current = 0;
      // For death animation, don't loop - stay on last frame
      const currentAnim = animState.current as string;
      if (currentAnim === 'dying') {
        currentFrame.current = Math.min(currentFrame.current + 1, SPRITE_COLS - 1);
      } else {
        currentFrame.current = (currentFrame.current + 1) % SPRITE_COLS;
      }
    }
    // Update texture UV offset
    const col = currentFrame.current;
    // UV origin is bottom-left, so row 0 = top = offset Y = 1 - FRAME_H
    const uvX = col * FRAME_W;
    const uvY = 1 - (animRow + 1) * FRAME_H;
    processedTexture.offset.set(uvX, uvY);

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

        {/* Muzzle flash light */}
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

        {/* Walking dust particles */}
        {animState.current === 'walking' && (
          <>
            {[0, 1].map(i => (
              <mesh key={i} position={[
                (Math.random() - 0.5) * 0.3,
                0.05,
                (Math.random() - 0.5) * 0.3
              ]}>
                <sphereGeometry args={[0.06, 4, 4]} />
                <meshBasicMaterial color="#8a7a60" transparent opacity={0.3} />
              </mesh>
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
            <Text fontSize={0.06} color="#aaaaaa" anchorX="center" anchorY="middle" position={[0, -0.11, 0]}
              outlineWidth={0.015} outlineColor="#000000" font={undefined}>
              {unit.unitClass.toUpperCase()} • {unit.weapon.name}{unit.weapon.ammo !== -1 ? ` [${unit.weapon.ammo}]` : ''}
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

export function GameUnits({ units, selectedUnitId, onUnitClick, combatEvents, movePath, movingUnitId, grid, onMoveComplete }: GameUnitsProps) {
  return (
    <group>
      {units.map(unit => (
        <PixelCharacter
          key={unit.id}
          unit={unit}
          isSelected={unit.id === selectedUnitId}
          onClick={() => onUnitClick(unit.id)}
          combatEvents={combatEvents}
          movePath={unit.id === movingUnitId ? movePath : null}
          isMoving={unit.id === movingUnitId && movePath !== null}
          grid={grid}
          onMoveComplete={unit.id === movingUnitId ? onMoveComplete : undefined}
        />
      ))}
    </group>
  );
}
