import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { Unit, TEAM_COLORS, CombatEvent, Position, TileData, VISION_RANGE } from '@/game/types';
import { getTileY } from './GridTiles';
import { playMove } from '@/game/sounds';
import * as THREE from 'three';

// Get the Y position where units should stand (on TOP of the tile)
function getUnitBaseY(grid: TileData[][], x: number, z: number): number {
  const tile = grid[x]?.[z];
  if (!tile) return 0.15;
  const tileY = getTileY(tile.elevation);
  const isTrench = tile.type === 'trench';
  const height = tile.type === 'water' ? 0.08 : isTrench ? 0.08 : 0.15 + tile.elevation * 0.12;
  return tileY + height / 2;
}

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

type AnimState = 'idle' | 'walking' | 'aiming' | 'shooting' | 'recoil' | 'hit' | 'dying' | 'healing' | 'crouching';

// ── Material cache for performance ──
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function getMaterial(color: string, opts?: { metalness?: number; roughness?: number; emissive?: string; emissiveIntensity?: number }) {
  const key = `${color}-${opts?.metalness}-${opts?.roughness}-${opts?.emissive}`;
  if (materialCache.has(key)) return materialCache.get(key)!;
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: opts?.metalness ?? 0.1,
    roughness: opts?.roughness ?? 0.7,
    emissive: opts?.emissive || '#000000',
    emissiveIntensity: opts?.emissiveIntensity ?? 0,
  });
  materialCache.set(key, mat);
  return mat;
}

// ── 3D Soldier Body Parts ──
function SoldierBody({ teamColor, unitClass, isMedic }: { teamColor: string; unitClass: string; isMedic: boolean }) {
  // Color palette based on team
  const bodyColor = useMemo(() => {
    const c = new THREE.Color(teamColor);
    return '#' + c.clone().lerp(new THREE.Color('#333333'), 0.4).getHexString();
  }, [teamColor]);

  const armorColor = useMemo(() => {
    const c = new THREE.Color(teamColor);
    return '#' + c.clone().lerp(new THREE.Color('#222222'), 0.3).getHexString();
  }, [teamColor]);

  const skinColor = '#c8a882';
  const bootColor = '#2a2218';
  const gearColor = '#3a3a30';

  const torsoMat = useMemo(() => getMaterial(armorColor, { metalness: 0.15, roughness: 0.6 }), [armorColor]);
  const limbMat = useMemo(() => getMaterial(bodyColor, { metalness: 0.05, roughness: 0.8 }), [bodyColor]);
  const skinMat = useMemo(() => getMaterial(skinColor, { metalness: 0, roughness: 0.9 }), []);
  const bootMat = useMemo(() => getMaterial(bootColor, { metalness: 0.1, roughness: 0.7 }), []);
  const gearMat = useMemo(() => getMaterial(gearColor, { metalness: 0.2, roughness: 0.5 }), []);
  const helmetMat = useMemo(() => getMaterial(armorColor, { metalness: 0.3, roughness: 0.4 }), [armorColor]);

  return (
    <>
      {/* ── TORSO ── */}
      <mesh position={[0, 0.42, 0]} castShadow material={torsoMat}>
        <boxGeometry args={[0.22, 0.22, 0.12]} />
      </mesh>
      {/* Chest plate / vest */}
      <mesh position={[0, 0.44, 0.035]} material={gearMat}>
        <boxGeometry args={[0.2, 0.18, 0.04]} />
      </mesh>
      {/* Belt */}
      <mesh position={[0, 0.31, 0]} material={bootMat}>
        <boxGeometry args={[0.21, 0.03, 0.12]} />
      </mesh>

      {/* ── HEAD ── */}
      <group position={[0, 0.6, 0]}>
        {/* Neck */}
        <mesh position={[0, -0.04, 0]} material={skinMat}>
          <cylinderGeometry args={[0.035, 0.04, 0.05, 8]} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 0.04, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
        </mesh>
        {/* Helmet */}
        <mesh position={[0, 0.08, 0]} castShadow material={helmetMat}>
          <sphereGeometry args={[0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        </mesh>
        {/* Helmet rim */}
        <mesh position={[0, 0.055, 0]} material={helmetMat}>
          <cylinderGeometry args={[0.072, 0.072, 0.015, 12]} />
        </mesh>
        {/* Goggles/visor */}
        <mesh position={[0, 0.05, 0.05]} material={useMemo(() => getMaterial('#111111', { metalness: 0.8, roughness: 0.2 }), [])}>
          <boxGeometry args={[0.08, 0.02, 0.02]} />
        </mesh>
      </group>

      {/* ── BACKPACK ── */}
      <mesh position={[0, 0.42, -0.1]} material={gearMat} castShadow>
        <boxGeometry args={[0.14, 0.16, 0.06]} />
      </mesh>
      {/* Pouch */}
      <mesh position={[0.06, 0.34, -0.1]} material={gearMat}>
        <boxGeometry args={[0.04, 0.06, 0.04]} />
      </mesh>

      {/* ── Medic cross ── */}
      {isMedic && (
        <>
          <mesh position={[0, 0.46, 0.058]}>
            <boxGeometry args={[0.06, 0.02, 0.005]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 0.46, 0.058]}>
            <boxGeometry args={[0.02, 0.06, 0.005]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
          </mesh>
        </>
      )}

      {/* ── Shoulder pads ── */}
      <mesh position={[-0.14, 0.5, 0]} material={helmetMat}>
        <boxGeometry args={[0.05, 0.06, 0.1]} />
      </mesh>
      <mesh position={[0.14, 0.5, 0]} material={helmetMat}>
        <boxGeometry args={[0.05, 0.06, 0.1]} />
      </mesh>
    </>
  );
}

function Weapon({ unitClass }: { unitClass: string }) {
  const metalMat = useMemo(() => getMaterial('#2a2a2a', { metalness: 0.7, roughness: 0.3 }), []);
  const woodMat = useMemo(() => getMaterial('#4a3520', { metalness: 0, roughness: 0.8 }), []);

  return (
    <group position={[0.08, 0, 0.12]}>
      {/* Gun body */}
      <mesh material={metalMat}>
        <boxGeometry args={[0.03, 0.04, 0.25]} />
      </mesh>
      {/* Barrel */}
      <mesh position={[0, 0.005, 0.18]} material={metalMat}>
        <cylinderGeometry args={[0.008, 0.008, 0.12, 6]} />
      </mesh>
      {/* Stock */}
      <mesh position={[0, -0.005, -0.14]} material={woodMat}>
        <boxGeometry args={[0.025, 0.05, 0.08]} />
      </mesh>
      {/* Magazine */}
      <mesh position={[0, -0.04, 0.02]} material={metalMat}>
        <boxGeometry args={[0.02, 0.05, 0.03]} />
      </mesh>
      {/* Scope (soldier only) */}
      {unitClass === 'soldier' && (
        <mesh position={[0, 0.03, 0.04]} material={metalMat}>
          <cylinderGeometry args={[0.01, 0.012, 0.06, 6]} />
        </mesh>
      )}
    </group>
  );
}

// ── Main 3D Soldier Character ──
function Soldier3D({ unit, isSelected, onClick, combatEvents, movePath, isMoving, grid, onMoveComplete }: {
  unit: Unit; isSelected: boolean; onClick: () => void; combatEvents: CombatEvent[];
  movePath: Position[] | null; isMoving: boolean; grid: TileData[][]; onMoveComplete?: () => void;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const weaponGroupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const color = TEAM_COLORS[unit.team];
  const isMedic = unit.unitClass === 'medic';

  // Animation state
  const animState = useRef<AnimState>('idle');
  const animTimer = useRef(0);
  const prevHp = useRef(unit.hp);
  const prevAlive = useRef(unit.isAlive);
  const deathTimer = useRef(0);
  const targetDir = useRef(new THREE.Vector2(1, 0));
  const flashIntensity = useRef(0);
  const facingAngle = useRef(0);

  // Path walking
  const pathRef = useRef<Position[] | null>(null);
  const pathIndex = useRef(0);
  const walkProgress = useRef(1);
  const walkFrom = useRef(new THREE.Vector3(unit.position.x, getUnitBaseY(grid, unit.position.x, unit.position.z), unit.position.z));
  const walkTo = useRef(new THREE.Vector3(unit.position.x, getUnitBaseY(grid, unit.position.x, unit.position.z), unit.position.z));
  const currentVisualPos = useRef(new THREE.Vector3(unit.position.x, getUnitBaseY(grid, unit.position.x, unit.position.z), unit.position.z));
  const moveCompleted = useRef(false);
  const prevPos = useRef({ x: unit.position.x, z: unit.position.z });

  // Start walking
  useEffect(() => {
    if (movePath && isMoving && movePath.length > 0) {
      pathRef.current = movePath;
      pathIndex.current = 0;
      walkProgress.current = 0;
      moveCompleted.current = false;
      animState.current = 'walking';
      animTimer.current = 0;

      const fromElev = grid[prevPos.current.x]?.[prevPos.current.z]?.elevation || 0;
      walkFrom.current.set(prevPos.current.x, getUnitBaseY(grid, prevPos.current.x, prevPos.current.z), prevPos.current.z);

      const firstTarget = movePath[0];
      walkTo.current.set(firstTarget.x, getUnitBaseY(grid, firstTarget.x, firstTarget.z), firstTarget.z);

      playMove();
    }
  }, [movePath, isMoving]);

  // Detect combat
  useEffect(() => {
    const recent = combatEvents.filter(e => Date.now() - e.timestamp < 300);
    for (const e of recent) {
      if (e.attackerPos.x === unit.position.x && e.attackerPos.z === unit.position.z &&
          (e.type === 'damage' || e.type === 'crit' || e.type === 'kill' || e.type === 'miss')) {
        targetDir.current.set(
          e.targetPos.x - e.attackerPos.x,
          e.targetPos.z - e.attackerPos.z
        ).normalize();
        facingAngle.current = Math.atan2(targetDir.current.x, targetDir.current.y);
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

  // Death
  useEffect(() => {
    if (prevAlive.current && !unit.isAlive) {
      animState.current = 'dying';
      animTimer.current = 0;
      deathTimer.current = 0;
    }
    prevAlive.current = unit.isAlive;
  }, [unit.isAlive]);

  // HP change flash
  useEffect(() => {
    if (unit.hp < prevHp.current && unit.isAlive) {
      flashIntensity.current = 1;
    }
    prevHp.current = unit.hp;
  }, [unit.hp, unit.isAlive]);

  // Update prevPos
  useEffect(() => {
    if (!pathRef.current || pathRef.current.length === 0) {
      prevPos.current = { x: unit.position.x, z: unit.position.z };
    }
  }, [unit.position.x, unit.position.z]);

  const WALK_SPEED = 4.0;

  useFrame(({ clock }, delta) => {
    if (!rootRef.current || !bodyRef.current) return;
    const t = clock.getElapsedTime();
    animTimer.current += delta;

    const unitBaseY = getUnitBaseY(grid, unit.position.x, unit.position.z);

    // Reset limb rotations each frame
    const resetLimbs = () => {
      if (leftArmRef.current) leftArmRef.current.rotation.set(0, 0, 0);
      if (rightArmRef.current) rightArmRef.current.rotation.set(0, 0, 0);
      if (leftLegRef.current) leftLegRef.current.rotation.set(0, 0, 0);
      if (rightLegRef.current) rightLegRef.current.rotation.set(0, 0, 0);
    };

    // ── DEATH with physics-based ragdoll ──
    if (animState.current === 'dying' || (!unit.isAlive && deathTimer.current < 5)) {
      deathTimer.current += delta;
      const dt = deathTimer.current;

      // Phase 1: Initial knockback (0-0.3s)
      if (dt < 0.3) {
        const knockT = dt / 0.3;
        bodyRef.current.rotation.x = knockT * -0.3; // stagger back
        bodyRef.current.position.y = knockT * 0.05; // slight lift
        bodyRef.current.position.z = -knockT * 0.1; // push back
      }
      // Phase 2: Collapse with gravity (0.3-1.2s)
      else if (dt < 1.2) {
        const fallT = (dt - 0.3) / 0.9;
        const eased = fallT * fallT; // gravity acceleration
        bodyRef.current.rotation.x = -0.3 + eased * (Math.PI / 2 + 0.3); // fall forward
        bodyRef.current.position.y = 0.05 - eased * 0.35; // drop down
        bodyRef.current.position.z = -0.1 + eased * 0.15;

        // Arms flail outward
        if (leftArmRef.current) {
          leftArmRef.current.rotation.z = -eased * (Math.PI / 2.5);
          leftArmRef.current.rotation.x = Math.sin(dt * 12) * (1 - eased) * 0.5;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.z = eased * (Math.PI / 2.5);
          rightArmRef.current.rotation.x = Math.sin(dt * 10 + 1) * (1 - eased) * 0.5;
        }
        // Legs buckle
        if (leftLegRef.current) {
          leftLegRef.current.rotation.x = -eased * 0.6;
          leftLegRef.current.rotation.z = eased * 0.15;
        }
        if (rightLegRef.current) {
          rightLegRef.current.rotation.x = eased * 0.3;
          rightLegRef.current.rotation.z = -eased * 0.1;
        }
      }
      // Phase 3: Settle on ground with bounce (1.2s+)
      else {
        bodyRef.current.rotation.x = Math.PI / 2;
        const settleT = dt - 1.2;
        const bounce = Math.exp(-settleT * 4) * Math.sin(settleT * 8) * 0.03;
        bodyRef.current.position.y = -0.3 + bounce;

        if (leftArmRef.current) leftArmRef.current.rotation.z = -Math.PI / 2.5;
        if (rightArmRef.current) rightArmRef.current.rotation.z = Math.PI / 2.5;
        if (leftLegRef.current) { leftLegRef.current.rotation.x = -0.6; leftLegRef.current.rotation.z = 0.15; }
        if (rightLegRef.current) { rightLegRef.current.rotation.x = 0.3; rightLegRef.current.rotation.z = -0.1; }
      }

      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
      return;
    }

    if (!unit.isAlive) return;

    // ── WALKING ──
    if (animState.current === 'walking' && pathRef.current && pathRef.current.length > 0) {
      walkProgress.current += delta * WALK_SPEED;

      if (walkProgress.current >= 1) {
        currentVisualPos.current.copy(walkTo.current);
        pathIndex.current++;

        if (pathIndex.current < pathRef.current.length) {
          walkProgress.current = 0;
          walkFrom.current.copy(walkTo.current);
          const nextTarget = pathRef.current[pathIndex.current];
          walkTo.current.set(nextTarget.x, getUnitBaseY(grid, nextTarget.x, nextTarget.z), nextTarget.z);
        } else {
          animState.current = 'idle';
          pathRef.current = null;
          prevPos.current = { x: unit.position.x, z: unit.position.z };
          currentVisualPos.current.set(unit.position.x, unitBaseY, unit.position.z);
          resetLimbs();
          bodyRef.current.rotation.set(0, 0, 0);
          bodyRef.current.position.set(0, 0, 0);

          if (!moveCompleted.current && onMoveComplete) {
            moveCompleted.current = true;
            onMoveComplete();
          }
        }
      }

      if (animState.current === 'walking') {
        const p = Math.min(1, walkProgress.current);
        currentVisualPos.current.lerpVectors(walkFrom.current, walkTo.current, p);

        // Face walk direction
        const dx = walkTo.current.x - walkFrom.current.x;
        const dz = walkTo.current.z - walkFrom.current.z;
        if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
          facingAngle.current = Math.atan2(dx, dz);
        }

        // Walking animation cycle
        const walkCycle = t * 8;
        const legSwing = Math.sin(walkCycle) * 0.6;
        const armSwing = Math.sin(walkCycle) * 0.4;
        const bodyBob = Math.abs(Math.sin(walkCycle)) * 0.03;
        const bodySway = Math.sin(walkCycle * 0.5) * 0.03;

        if (leftLegRef.current) leftLegRef.current.rotation.x = legSwing;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -legSwing;
        if (leftArmRef.current) leftArmRef.current.rotation.x = -armSwing;
        if (rightArmRef.current) rightArmRef.current.rotation.x = armSwing;

        bodyRef.current.position.y = bodyBob;
        bodyRef.current.rotation.z = bodySway;
        bodyRef.current.rotation.x = 0.05; // Lean forward

        rootRef.current.position.set(
          currentVisualPos.current.x,
          currentVisualPos.current.y + bodyBob,
          currentVisualPos.current.z
        );
      }
    } else if (animState.current === 'aiming') {
      // ── AIMING ──
      const aimT = Math.min(1, animTimer.current / 0.4);
      resetLimbs();

      // Raise weapon arm
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -Math.PI / 2.5 * aimT;
        rightArmRef.current.rotation.z = 0.1 * aimT;
      }
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = -Math.PI / 3 * aimT;
      }
      // Slight crouch
      bodyRef.current.rotation.x = 0.05 * aimT;
      bodyRef.current.position.y = -0.02 * aimT;

      if (aimT >= 1) {
        animState.current = 'shooting';
        animTimer.current = 0;
      }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);

    } else if (animState.current === 'shooting') {
      // ── SHOOTING ──
      const shootT = Math.min(1, animTimer.current / 0.2);

      // Recoil
      const recoil = Math.sin(shootT * Math.PI) * 0.08;
      bodyRef.current.rotation.x = 0.05 - recoil;
      bodyRef.current.position.z = -recoil * 0.3;

      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = -Math.PI / 2.5 + recoil * 2;
      }

      flashIntensity.current = Math.max(0, 1 - shootT);

      if (shootT >= 1) {
        animState.current = 'recoil';
        animTimer.current = 0;
      }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);

    } else if (animState.current === 'recoil') {
      // ── RECOIL RECOVERY ──
      const recoilT = Math.min(1, animTimer.current / 0.4);
      const ease = 1 - Math.pow(1 - recoilT, 2);

      bodyRef.current.rotation.x = THREE.MathUtils.lerp(bodyRef.current.rotation.x, 0, ease);
      bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, 0, ease);
      bodyRef.current.position.z = THREE.MathUtils.lerp(bodyRef.current.position.z, 0, ease);

      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, ease);
      }
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, 0, ease);
      }

      if (recoilT >= 1) {
        animState.current = 'idle';
        resetLimbs();
        bodyRef.current.rotation.set(0, 0, 0);
        bodyRef.current.position.set(0, 0, 0);
      }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);

    } else if (animState.current === 'hit') {
      // ── HIT REACTION ──
      const hitT = Math.min(1, animTimer.current / 0.5);

      const knockback = Math.sin(hitT * Math.PI) * 0.1;
      bodyRef.current.rotation.x = -knockback * 2;
      bodyRef.current.rotation.z = Math.sin(hitT * Math.PI * 6) * 0.08 * (1 - hitT);
      bodyRef.current.position.y = -knockback * 0.3;

      if (leftArmRef.current) leftArmRef.current.rotation.z = -knockback * 3;
      if (rightArmRef.current) rightArmRef.current.rotation.z = knockback * 3;

      flashIntensity.current = Math.max(0, Math.sin(hitT * Math.PI * 3));

      if (hitT >= 1) {
        animState.current = 'idle';
        resetLimbs();
        bodyRef.current.rotation.set(0, 0, 0);
        bodyRef.current.position.set(0, 0, 0);
        flashIntensity.current = 0;
      }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);

    } else if (animState.current === 'healing') {
      // ── HEALING ──
      const healT = Math.min(1, animTimer.current / 0.8);

      // Kneeling pose
      if (leftLegRef.current) leftLegRef.current.rotation.x = -0.5 * Math.min(1, healT * 3);
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0.3 * Math.min(1, healT * 3);
      bodyRef.current.position.y = -0.08 * Math.min(1, healT * 3);

      // Arms forward (applying medicine)
      if (leftArmRef.current) leftArmRef.current.rotation.x = -0.8 * Math.min(1, healT * 2);
      if (rightArmRef.current) rightArmRef.current.rotation.x = -0.6 * Math.min(1, healT * 2);

      if (healT >= 1) {
        animState.current = 'idle';
        resetLimbs();
        bodyRef.current.rotation.set(0, 0, 0);
        bodyRef.current.position.set(0, 0, 0);
      }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);

    } else {
      // ── IDLE ──
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);

      // Breathing animation
      const breathe = Math.sin(t * 1.8 + unit.position.x * 2) * 0.008;
      const weightShift = Math.sin(t * 0.7 + unit.position.z) * 0.015;

      bodyRef.current.position.y = breathe;
      bodyRef.current.rotation.z = weightShift;
      bodyRef.current.rotation.x = 0;

      // Subtle idle arm sway
      if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(t * 1.2) * 0.03;
      if (rightArmRef.current) rightArmRef.current.rotation.x = Math.sin(t * 1.2 + 1) * 0.03;
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;

      // Cover crouch
      if (unit.coverType === 'full') {
        bodyRef.current.position.y = -0.1;
        if (leftLegRef.current) leftLegRef.current.rotation.x = -0.4;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -0.3;
      } else if (unit.coverType === 'half') {
        bodyRef.current.position.y = -0.05;
        if (leftLegRef.current) leftLegRef.current.rotation.x = -0.2;
      }

      // Suppressed shaking
      if (unit.isSuppressed) {
        bodyRef.current.rotation.z += Math.sin(t * 20) * 0.02;
        bodyRef.current.rotation.x += Math.sin(t * 15) * 0.01;
      }

      // Overwatch stance - weapon raised
      if (unit.isOnOverwatch) {
        if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.PI / 4;
        if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.PI / 5;
        bodyRef.current.rotation.x = 0.05;
      }
    }

    // Face direction
    bodyRef.current.rotation.y = THREE.MathUtils.lerp(
      bodyRef.current.rotation.y || 0,
      facingAngle.current,
      0.1
    );

    // Selection ring
    if (isSelected && ringRef.current) {
      const scale = 1 + Math.sin(t * 4) * 0.1;
      ringRef.current.scale.set(scale, 1, scale);
    }

    // Flash on hit (change emissive on all children)
    if (flashIntensity.current > 0) {
      flashIntensity.current = Math.max(0, flashIntensity.current - delta * 4);
    }
  });

  // Arm materials (must be before early return)
  const limbColor = useMemo(() => {
    const c = new THREE.Color(color);
    return '#' + c.clone().lerp(new THREE.Color('#333333'), 0.4).getHexString();
  }, [color]);

  const bootColor = '#2a2218';

  if (!unit.isAlive && deathTimer.current >= 5) return null;

  const hpPercent = unit.hp / unit.maxHp;
  const apDots = [];
  for (let i = 0; i < unit.maxAp; i++) {
    apDots.push(i < unit.ap);
  }

  return (
    <group
      ref={rootRef}
      position={[unit.position.x, getUnitBaseY(grid, unit.position.x, unit.position.z), unit.position.z]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <group ref={bodyRef}>
        {/* Main body */}
        <SoldierBody teamColor={color} unitClass={unit.unitClass} isMedic={isMedic} />

        {/* ── LEFT ARM ── */}
        <group ref={leftArmRef} position={[-0.16, 0.46, 0]}>
          {/* Upper arm */}
          <mesh position={[0, -0.06, 0]} castShadow>
            <boxGeometry args={[0.06, 0.12, 0.06]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          {/* Forearm */}
          <mesh position={[0, -0.15, 0.02]}>
            <boxGeometry args={[0.05, 0.1, 0.05]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          {/* Glove */}
          <mesh position={[0, -0.2, 0.03]}>
            <boxGeometry args={[0.04, 0.04, 0.04]} />
            <meshStandardMaterial color="#1a1a14" roughness={0.6} />
          </mesh>
        </group>

        {/* ── RIGHT ARM ── */}
        <group ref={rightArmRef} position={[0.16, 0.46, 0]}>
          {/* Upper arm */}
          <mesh position={[0, -0.06, 0]} castShadow>
            <boxGeometry args={[0.06, 0.12, 0.06]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          {/* Forearm */}
          <mesh position={[0, -0.15, 0.02]}>
            <boxGeometry args={[0.05, 0.1, 0.05]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          {/* Glove */}
          <mesh position={[0, -0.2, 0.03]}>
            <boxGeometry args={[0.04, 0.04, 0.04]} />
            <meshStandardMaterial color="#1a1a14" roughness={0.6} />
          </mesh>
          {/* Weapon attached to right arm */}
          <group ref={weaponGroupRef} position={[0, -0.12, 0.05]}>
            <Weapon unitClass={unit.unitClass} />
          </group>
        </group>

        {/* ── LEFT LEG ── */}
        <group ref={leftLegRef} position={[-0.06, 0.28, 0]}>
          {/* Thigh */}
          <mesh position={[0, -0.08, 0]} castShadow>
            <boxGeometry args={[0.07, 0.14, 0.07]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          {/* Shin */}
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.065, 0.12, 0.065]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          {/* Boot */}
          <mesh position={[0, -0.28, 0.015]}>
            <boxGeometry args={[0.07, 0.05, 0.09]} />
            <meshStandardMaterial color={bootColor} roughness={0.6} metalness={0.1} />
          </mesh>
        </group>

        {/* ── RIGHT LEG ── */}
        <group ref={rightLegRef} position={[0.06, 0.28, 0]}>
          {/* Thigh */}
          <mesh position={[0, -0.08, 0]} castShadow>
            <boxGeometry args={[0.07, 0.14, 0.07]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          {/* Shin */}
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.065, 0.12, 0.065]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          {/* Boot */}
          <mesh position={[0, -0.28, 0.015]}>
            <boxGeometry args={[0.07, 0.05, 0.09]} />
            <meshStandardMaterial color={bootColor} roughness={0.6} metalness={0.1} />
          </mesh>
        </group>

        {/* ── Muzzle flash ── */}
        {animState.current === 'shooting' && (
          <pointLight
            position={[0.24, 0.34, 0.35]}
            color="#ffaa00"
            intensity={5}
            distance={4}
          />
        )}

        {/* ── Healing particles ── */}
        {animState.current === 'healing' && (
          <>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <mesh key={i} position={[
                Math.sin(Date.now() * 0.003 + i * 1.2) * 0.2,
                0.2 + ((Date.now() * 0.002 + i * 0.5) % 1) * 0.5,
                Math.cos(Date.now() * 0.003 + i * 1.2) * 0.2
              ]}>
                <sphereGeometry args={[0.015, 4, 4]} />
                <meshBasicMaterial color="#44ff88" transparent opacity={0.6} />
              </mesh>
            ))}
          </>
        )}

        {/* ── Ground shadow ── */}
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.2, 12]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </group>

      {/* ── HP Bar ── */}
      {unit.isAlive && (
        <Billboard position={[0, 0.85, 0]}>
          <mesh position={[0, 0, -0.001]}>
            <planeGeometry args={[0.5, 0.05]} />
            <meshBasicMaterial color="#111111" transparent opacity={0.8} />
          </mesh>
          <mesh position={[(hpPercent - 1) * 0.235, 0, 0]}>
            <planeGeometry args={[0.47 * hpPercent, 0.035]} />
            <meshBasicMaterial color={hpPercent > 0.5 ? '#44cc44' : hpPercent > 0.25 ? '#cccc44' : '#cc4444'} />
          </mesh>
        </Billboard>
      )}

      {/* ── AP Dots ── */}
      {unit.isAlive && (
        <Billboard position={[0, 0.78, 0]}>
          {apDots.map((filled, i) => (
            <mesh key={i} position={[-0.06 * (apDots.length - 1) / 2 + i * 0.06, 0, 0]}>
              <circleGeometry args={[0.018, 6]} />
              <meshBasicMaterial color={filled ? '#ffcc00' : '#333333'} />
            </mesh>
          ))}
        </Billboard>
      )}

      {/* ── Name ── */}
      {unit.isAlive && (
        <Billboard position={[0, 0.95, 0]}>
          <Text fontSize={0.08} color={color} anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.015} outlineColor="#000000">
            {unit.name}
          </Text>
          <Text fontSize={0.045} color="#999999" anchorX="center" anchorY="middle" position={[0, -0.09, 0]}
            outlineWidth={0.01} outlineColor="#000000" font={undefined}>
            {unit.unitClass.toUpperCase()} • {unit.weapon.name}
          </Text>
        </Billboard>
      )}

      {/* ── Status icons ── */}
      {unit.isOnOverwatch && (
        <Billboard position={[-0.25, 0.7, 0]}>
          <Text fontSize={0.1} color="#44aaff" anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.015} outlineColor="#000000">
            👁
          </Text>
        </Billboard>
      )}
      {unit.isSuppressed && (
        <Billboard position={[0.25, 0.7, 0]}>
          <Text fontSize={0.1} color="#ff4444" anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.015} outlineColor="#000000">
            ⛔
          </Text>
        </Billboard>
      )}

      {/* ── Selection ring ── */}
      {isSelected && (
        <mesh ref={ringRef} position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.38, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} />
        </mesh>
      )}

      {/* ── Team dot ── */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.05, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* ── Fog of war vision ring ── */}
      {unit.isAlive && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[unit.visionRange - 0.06, unit.visionRange + 0.06, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* ── Overwatch range ── */}
      {unit.isOnOverwatch && (
        <>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[unit.attackRange, 32]} />
            <meshBasicMaterial color="#44aaff" transparent opacity={0.05} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[unit.attackRange - 0.1, unit.attackRange + 0.1, 32]} />
            <meshBasicMaterial color="#44aaff" transparent opacity={0.2} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[unit.attackRange * 0.5 - 0.04, unit.attackRange * 0.5 + 0.04, 32]} />
            <meshBasicMaterial color="#44aaff" transparent opacity={0.08} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}

export function GameUnits({ units, selectedUnitId, onUnitClick, combatEvents, movePath, movingUnitId, grid, onMoveComplete }: GameUnitsProps) {
  return (
    <group>
      {units.map(unit => (
        <Soldier3D
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
