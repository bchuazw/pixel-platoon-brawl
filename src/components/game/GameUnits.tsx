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
  if (!tile) return 0.08;
  const tileY = getTileY(tile.elevation);
  const isTrench = tile.type === 'trench';
  const surfaceH = tile.type === 'water' ? 0.03 : isTrench ? 0.04 : 0.08;
  return tileY + surfaceH;
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

type AnimState = 'idle' | 'walking' | 'aiming' | 'shooting' | 'recoil' | 'hit' | 'dying' | 'healing';

// ── Material cache ──
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function getMat(color: string, metalness = 0.1, roughness = 0.7, emissive = '#000000', emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const key = `${color}-${metalness}-${roughness}-${emissive}-${emissiveIntensity}`;
  if (materialCache.has(key)) return materialCache.get(key)!;
  const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity });
  materialCache.set(key, mat);
  return mat;
}

// ── XCOM-style chunky soldier body ──
const BEARDED_UNITS = new Set(['blue-soldier', 'yellow-soldier', 'red-medic', 'yellow-medic']);

function SoldierBody({ teamColor, isMedic, unitId }: { teamColor: string; isMedic: boolean; unitId?: string }) {
  const armorColor = useMemo(() => {
    const c = new THREE.Color(teamColor);
    return '#' + c.clone().lerp(new THREE.Color('#222222'), 0.25).getHexString();
  }, [teamColor]);
  const darkArmor = useMemo(() => {
    const c = new THREE.Color(teamColor);
    return '#' + c.clone().lerp(new THREE.Color('#111111'), 0.5).getHexString();
  }, [teamColor]);

  const torsoMat = useMemo(() => getMat(armorColor, 0.15, 0.55), [armorColor]);
  const darkMat = useMemo(() => getMat(darkArmor, 0.1, 0.7), [darkArmor]);
  const skinMat = useMemo(() => getMat('#c8a882', 0, 0.85), []);
  const bootMat = useMemo(() => getMat('#1e1a14', 0.1, 0.7), []);
  const gearMat = useMemo(() => getMat('#2e2e28', 0.15, 0.6), []);
  const beardMat = useMemo(() => getMat('#5a3a1a', 0, 0.9), []);
  const helmetMat = useMemo(() => getMat(armorColor, 0.25, 0.45), [armorColor]);
  const visorMat = useMemo(() => getMat('#0a0a0a', 0.8, 0.15), []);

  return (
    <>
      {/* ── TORSO (chunky) ── */}
      <mesh position={[0, 0.44, 0]} castShadow material={torsoMat}>
        <boxGeometry args={[0.28, 0.24, 0.16]} />
      </mesh>
      {/* Chest plate */}
      <mesh position={[0, 0.46, 0.045]} material={gearMat}>
        <boxGeometry args={[0.26, 0.2, 0.04]} />
      </mesh>
      {/* Belt */}
      <mesh position={[0, 0.32, 0]} material={bootMat}>
        <boxGeometry args={[0.27, 0.03, 0.15]} />
      </mesh>
      {/* Team color stripe on chest */}
      <mesh position={[0, 0.48, 0.066]}>
        <boxGeometry args={[0.08, 0.08, 0.002]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.3} />
      </mesh>

      {/* ── HEAD (bigger, chunkier) ── */}
      <group position={[0, 0.64, 0]}>
        <mesh position={[0, -0.04, 0]} material={skinMat}>
          <cylinderGeometry args={[0.04, 0.045, 0.05, 6]} />
        </mesh>
        <mesh position={[0, 0.04, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.12, 0.12, 0.11]} />
        </mesh>
        {/* Helmet — bigger, more tactical */}
        <mesh position={[0, 0.09, 0]} castShadow material={helmetMat}>
          <sphereGeometry args={[0.085, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        </mesh>
        <mesh position={[0, 0.06, 0]} material={helmetMat}>
          <cylinderGeometry args={[0.088, 0.088, 0.018, 8]} />
        </mesh>
        {/* Visor */}
        <mesh position={[0, 0.05, 0.055]} material={visorMat}>
          <boxGeometry args={[0.1, 0.025, 0.02]} />
        </mesh>

        {/* ── BEARD ── */}
        {unitId && BEARDED_UNITS.has(unitId) && (
          <>
            <mesh position={[0, -0.005, 0.04]} material={beardMat}>
              <boxGeometry args={[0.08, 0.05, 0.06]} />
            </mesh>
            <mesh position={[-0.05, 0.01, 0.03]} material={beardMat}>
              <boxGeometry args={[0.03, 0.06, 0.04]} />
            </mesh>
            <mesh position={[0.05, 0.01, 0.03]} material={beardMat}>
              <boxGeometry args={[0.03, 0.06, 0.04]} />
            </mesh>
            <mesh position={[0, 0.025, 0.058]} material={beardMat}>
              <boxGeometry args={[0.06, 0.015, 0.02]} />
            </mesh>
          </>
        )}
      </group>

      {/* ── BACKPACK ── */}
      <mesh position={[0, 0.44, -0.12]} material={gearMat} castShadow>
        <boxGeometry args={[0.18, 0.18, 0.08]} />
      </mesh>

      {/* ── SHOULDER PADS (team colored) ── */}
      <mesh position={[-0.17, 0.52, 0]} castShadow material={helmetMat}>
        <boxGeometry args={[0.06, 0.07, 0.12]} />
      </mesh>
      <mesh position={[0.17, 0.52, 0]} castShadow material={helmetMat}>
        <boxGeometry args={[0.06, 0.07, 0.12]} />
      </mesh>

      {/* ── Medic red cross (front) ── */}
      {isMedic && (
        <>
          {/* Front cross */}
          <mesh position={[0, 0.48, 0.069]}>
            <boxGeometry args={[0.08, 0.025, 0.002]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0, 0.48, 0.069]}>
            <boxGeometry args={[0.025, 0.08, 0.002]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.5} />
          </mesh>
          {/* White background patch */}
          <mesh position={[0, 0.48, 0.067]}>
            <boxGeometry args={[0.1, 0.1, 0.002]} />
            <meshStandardMaterial color="#dddddd" />
          </mesh>
          {/* Back cross on backpack */}
          <mesh position={[0, 0.48, -0.163]}>
            <boxGeometry args={[0.06, 0.02, 0.002]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[0, 0.48, -0.163]}>
            <boxGeometry args={[0.02, 0.06, 0.002]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.4} />
          </mesh>
          {/* Arm band cross (left) */}
          <mesh position={[-0.17, 0.52, 0.065]}>
            <boxGeometry args={[0.002, 0.04, 0.015]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[-0.17, 0.52, 0.065]}>
            <boxGeometry args={[0.002, 0.015, 0.04]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.3} />
          </mesh>
        </>
      )}
    </>
  );
}

function Weapon({ weaponId }: { weaponId: string }) {
  const metalMat = useMemo(() => getMat('#2a2a2a', 0.7, 0.3), []);
  const darkMetalMat = useMemo(() => getMat('#1a1a1a', 0.8, 0.25), []);
  const woodMat = useMemo(() => getMat('#3a2818', 0, 0.8), []);
  const brownMat = useMemo(() => getMat('#4a3020', 0.05, 0.85), []);

  switch (weaponId) {
    case 'pistol':
      return (
        <group position={[0.06, 0, 0.08]}>
          <mesh material={metalMat}><boxGeometry args={[0.025, 0.04, 0.14]} /></mesh>
          <mesh position={[0, 0.005, 0.09]} material={metalMat}><cylinderGeometry args={[0.008, 0.008, 0.06, 5]} /></mesh>
          <mesh position={[0, -0.02, -0.05]} material={woodMat}><boxGeometry args={[0.022, 0.055, 0.06]} /></mesh>
        </group>
      );
    case 'rifle':
      return (
        <group position={[0.08, 0, 0.12]}>
          <mesh material={metalMat}><boxGeometry args={[0.03, 0.04, 0.32]} /></mesh>
          <mesh position={[0, 0.005, 0.22]} material={metalMat}><cylinderGeometry args={[0.009, 0.009, 0.16, 5]} /></mesh>
          <mesh position={[0, -0.005, -0.15]} material={woodMat}><boxGeometry args={[0.025, 0.05, 0.08]} /></mesh>
          <mesh position={[0, -0.04, 0.02]} material={metalMat}><boxGeometry args={[0.02, 0.05, 0.025]} /></mesh>
          {/* Magazine */}
          <mesh position={[0, -0.04, 0.06]} material={darkMetalMat}><boxGeometry args={[0.018, 0.06, 0.02]} /></mesh>
          {/* Scope rail */}
          <mesh position={[0, 0.025, 0.04]} material={metalMat}><boxGeometry args={[0.018, 0.008, 0.1]} /></mesh>
        </group>
      );
    case 'shotgun':
      return (
        <group position={[0.08, 0, 0.1]}>
          {/* Thick barrel */}
          <mesh material={metalMat}><boxGeometry args={[0.035, 0.04, 0.28]} /></mesh>
          <mesh position={[0, 0, 0.18]} material={darkMetalMat}><cylinderGeometry args={[0.014, 0.014, 0.12, 6]} /></mesh>
          {/* Pump grip */}
          <mesh position={[0, -0.005, 0.06]} material={brownMat}><boxGeometry args={[0.038, 0.035, 0.08]} /></mesh>
          {/* Stock */}
          <mesh position={[0, -0.008, -0.16]} material={woodMat}><boxGeometry args={[0.028, 0.06, 0.1]} /></mesh>
        </group>
      );
    case 'sniper_rifle':
      return (
        <group position={[0.08, 0, 0.16]}>
          {/* Long barrel */}
          <mesh material={metalMat}><boxGeometry args={[0.025, 0.035, 0.42]} /></mesh>
          <mesh position={[0, 0.005, 0.28]} material={metalMat}><cylinderGeometry args={[0.007, 0.007, 0.2, 5]} /></mesh>
          {/* Scope */}
          <mesh position={[0, 0.035, 0.04]} material={darkMetalMat}><cylinderGeometry args={[0.012, 0.012, 0.1, 6]} /></mesh>
          <mesh position={[0, 0.035, -0.02]} material={darkMetalMat}><cylinderGeometry args={[0.015, 0.012, 0.02, 6]} /></mesh>
          <mesh position={[0, 0.035, 0.1]} material={darkMetalMat}><cylinderGeometry args={[0.012, 0.015, 0.02, 6]} /></mesh>
          {/* Stock */}
          <mesh position={[0, -0.005, -0.2]} material={woodMat}><boxGeometry args={[0.024, 0.055, 0.12]} /></mesh>
          {/* Bipod legs */}
          <mesh position={[0.015, -0.035, 0.15]} rotation={[0, 0, -0.3]} material={metalMat}><boxGeometry args={[0.005, 0.04, 0.005]} /></mesh>
          <mesh position={[-0.015, -0.035, 0.15]} rotation={[0, 0, 0.3]} material={metalMat}><boxGeometry args={[0.005, 0.04, 0.005]} /></mesh>
        </group>
      );
    case 'rocket_launcher':
      return (
        <group position={[0.08, 0.02, 0.1]}>
          {/* Main tube */}
          <mesh material={darkMetalMat}><cylinderGeometry args={[0.035, 0.035, 0.38, 8]} /></mesh>
          {/* Front flare */}
          <mesh position={[0, 0, 0.2]}><cylinderGeometry args={[0.04, 0.035, 0.04, 8]} /><meshStandardMaterial color="#3a3a3a" metalness={0.6} roughness={0.4} /></mesh>
          {/* Rear opening */}
          <mesh position={[0, 0, -0.2]}><cylinderGeometry args={[0.032, 0.04, 0.04, 8]} /><meshStandardMaterial color="#2a2a2a" metalness={0.5} roughness={0.5} /></mesh>
          {/* Grip */}
          <mesh position={[0, -0.04, -0.04]} material={brownMat}><boxGeometry args={[0.025, 0.05, 0.04]} /></mesh>
          {/* Sight */}
          <mesh position={[0, 0.04, 0.05]} material={metalMat}><boxGeometry args={[0.015, 0.02, 0.06]} /></mesh>
        </group>
      );
    case 'smg':
      return (
        <group position={[0.07, 0, 0.1]}>
          {/* Compact body */}
          <mesh material={metalMat}><boxGeometry args={[0.03, 0.04, 0.22]} /></mesh>
          <mesh position={[0, 0.005, 0.14]} material={metalMat}><cylinderGeometry args={[0.008, 0.008, 0.08, 5]} /></mesh>
          {/* Extended magazine */}
          <mesh position={[0, -0.05, 0.04]} material={darkMetalMat}><boxGeometry args={[0.02, 0.07, 0.022]} /></mesh>
          {/* Folding stock */}
          <mesh position={[0, 0.01, -0.12]} material={metalMat}><boxGeometry args={[0.008, 0.035, 0.06]} /></mesh>
          {/* Grip */}
          <mesh position={[0, -0.03, -0.02]} material={brownMat}><boxGeometry args={[0.022, 0.04, 0.03]} /></mesh>
        </group>
      );
    default:
      // Fallback pistol
      return (
        <group position={[0.06, 0, 0.08]}>
          <mesh material={metalMat}><boxGeometry args={[0.025, 0.04, 0.14]} /></mesh>
          <mesh position={[0, -0.02, -0.05]} material={woodMat}><boxGeometry args={[0.022, 0.055, 0.06]} /></mesh>
        </group>
      );
  }
}

// ── Main 3D Soldier ──
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

  const animState = useRef<AnimState>('idle');
  const animTimer = useRef(0);
  const prevAlive = useRef(unit.isAlive);
  const deathTimer = useRef(0);
  const facingAngle = useRef(0);
  const flashIntensity = useRef(0);
  const prevHp = useRef(unit.hp);

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
      walkFrom.current.set(prevPos.current.x, getUnitBaseY(grid, prevPos.current.x, prevPos.current.z), prevPos.current.z);
      const firstTarget = movePath[0];
      walkTo.current.set(firstTarget.x, getUnitBaseY(grid, firstTarget.x, firstTarget.z), firstTarget.z);
      playMove();
    }
  }, [movePath, isMoving]);

  // Combat detection
  useEffect(() => {
    const recent = combatEvents.filter(e => Date.now() - e.timestamp < 300);
    for (const e of recent) {
      if (e.attackerPos.x === unit.position.x && e.attackerPos.z === unit.position.z &&
          (e.type === 'damage' || e.type === 'crit' || e.type === 'kill' || e.type === 'miss')) {
        const dx = e.targetPos.x - e.attackerPos.x;
        const dz = e.targetPos.z - e.attackerPos.z;
        facingAngle.current = Math.atan2(dx, dz);
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

  // HP flash
  useEffect(() => {
    if (unit.hp < prevHp.current && unit.isAlive) flashIntensity.current = 1;
    prevHp.current = unit.hp;
  }, [unit.hp, unit.isAlive]);

  // Pos sync
  useEffect(() => {
    if (!pathRef.current || pathRef.current.length === 0) {
      prevPos.current = { x: unit.position.x, z: unit.position.z };
    }
  }, [unit.position.x, unit.position.z]);

  const WALK_SPEED = 4.0;

  const resetLimbs = () => {
    if (leftArmRef.current) leftArmRef.current.rotation.set(0, 0, 0);
    if (rightArmRef.current) rightArmRef.current.rotation.set(0, 0, 0);
    if (leftLegRef.current) leftLegRef.current.rotation.set(0, 0, 0);
    if (rightLegRef.current) rightLegRef.current.rotation.set(0, 0, 0);
  };

  useFrame(({ clock }, delta) => {
    if (!rootRef.current || !bodyRef.current) return;
    const t = clock.getElapsedTime();
    animTimer.current += delta;
    const unitBaseY = getUnitBaseY(grid, unit.position.x, unit.position.z);

    // ── DEATH ──
    if (animState.current === 'dying' || (!unit.isAlive && deathTimer.current < 1.5)) {
      deathTimer.current += delta;
      const dt = deathTimer.current;
      if (dt < 0.3) {
        const k = dt / 0.3;
        bodyRef.current.rotation.x = k * -0.3;
        bodyRef.current.position.y = k * 0.05;
      } else if (dt < 1.2) {
        const f = (dt - 0.3) / 0.9;
        const e = f * f;
        bodyRef.current.rotation.x = -0.3 + e * (Math.PI / 2 + 0.3);
        bodyRef.current.position.y = 0.05 - e * 0.35;
        if (leftArmRef.current) leftArmRef.current.rotation.z = -e * (Math.PI / 2.5);
        if (rightArmRef.current) rightArmRef.current.rotation.z = e * (Math.PI / 2.5);
        if (leftLegRef.current) leftLegRef.current.rotation.x = -e * 0.6;
        if (rightLegRef.current) rightLegRef.current.rotation.x = e * 0.3;
      } else {
        bodyRef.current.rotation.x = Math.PI / 2;
        bodyRef.current.position.y = -0.3;
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
          const next = pathRef.current[pathIndex.current];
          walkTo.current.set(next.x, getUnitBaseY(grid, next.x, next.z), next.z);
        } else {
          animState.current = 'idle';
          pathRef.current = null;
          prevPos.current = { x: unit.position.x, z: unit.position.z };
          currentVisualPos.current.set(unit.position.x, unitBaseY, unit.position.z);
          resetLimbs();
          bodyRef.current.rotation.set(0, 0, 0);
          bodyRef.current.position.set(0, 0, 0);
          if (!moveCompleted.current && onMoveComplete) { moveCompleted.current = true; onMoveComplete(); }
        }
      }
      if (animState.current === 'walking') {
        const p = Math.min(1, walkProgress.current);
        currentVisualPos.current.lerpVectors(walkFrom.current, walkTo.current, p);
        const dx = walkTo.current.x - walkFrom.current.x;
        const dz = walkTo.current.z - walkFrom.current.z;
        if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) facingAngle.current = Math.atan2(dx, dz);
        const wc = t * 8;
        const leg = Math.sin(wc) * 0.5;
        const arm = Math.sin(wc) * 0.35;
        const bob = Math.abs(Math.sin(wc)) * 0.025;
        if (leftLegRef.current) leftLegRef.current.rotation.x = leg;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -leg;
        if (leftArmRef.current) leftArmRef.current.rotation.x = -arm;
        if (rightArmRef.current) rightArmRef.current.rotation.x = arm;
        bodyRef.current.position.y = bob;
        bodyRef.current.rotation.x = 0.04;
        rootRef.current.position.set(currentVisualPos.current.x, currentVisualPos.current.y + bob, currentVisualPos.current.z);
      }
    } else if (animState.current === 'aiming') {
      const aimT = Math.min(1, animTimer.current / 0.35);
      resetLimbs();
      if (rightArmRef.current) { rightArmRef.current.rotation.x = -Math.PI / 2.5 * aimT; rightArmRef.current.rotation.z = 0.1 * aimT; }
      if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.PI / 3 * aimT;
      bodyRef.current.rotation.x = 0.05 * aimT;
      bodyRef.current.position.y = -0.02 * aimT;
      if (aimT >= 1) { animState.current = 'shooting'; animTimer.current = 0; }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else if (animState.current === 'shooting') {
      const st = Math.min(1, animTimer.current / 0.2);
      const recoil = Math.sin(st * Math.PI) * 0.08;
      bodyRef.current.rotation.x = 0.05 - recoil;
      bodyRef.current.position.z = -recoil * 0.3;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.PI / 2.5 + recoil * 2;
      flashIntensity.current = Math.max(0, 1 - st);
      if (st >= 1) { animState.current = 'recoil'; animTimer.current = 0; }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else if (animState.current === 'recoil') {
      const rt = Math.min(1, animTimer.current / 0.4);
      const ease = 1 - Math.pow(1 - rt, 2);
      bodyRef.current.rotation.x = THREE.MathUtils.lerp(bodyRef.current.rotation.x, 0, ease);
      bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, 0, ease);
      bodyRef.current.position.z = THREE.MathUtils.lerp(bodyRef.current.position.z, 0, ease);
      if (rightArmRef.current) rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, ease);
      if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, 0, ease);
      if (rt >= 1) { animState.current = 'idle'; resetLimbs(); bodyRef.current.rotation.set(0, 0, 0); bodyRef.current.position.set(0, 0, 0); }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else if (animState.current === 'hit') {
      const ht = Math.min(1, animTimer.current / 0.5);
      const kb = Math.sin(ht * Math.PI) * 0.1;
      bodyRef.current.rotation.x = -kb * 2;
      bodyRef.current.rotation.z = Math.sin(ht * Math.PI * 5) * 0.06 * (1 - ht);
      bodyRef.current.position.y = -kb * 0.3;
      if (leftArmRef.current) leftArmRef.current.rotation.z = -kb * 2.5;
      if (rightArmRef.current) rightArmRef.current.rotation.z = kb * 2.5;
      flashIntensity.current = Math.max(0, Math.sin(ht * Math.PI * 3));
      if (ht >= 1) { animState.current = 'idle'; resetLimbs(); bodyRef.current.rotation.set(0, 0, 0); bodyRef.current.position.set(0, 0, 0); flashIntensity.current = 0; }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else if (animState.current === 'healing') {
      const healT = Math.min(1, animTimer.current / 0.8);
      if (leftLegRef.current) leftLegRef.current.rotation.x = -0.4 * Math.min(1, healT * 3);
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0.25 * Math.min(1, healT * 3);
      bodyRef.current.position.y = -0.06 * Math.min(1, healT * 3);
      if (leftArmRef.current) leftArmRef.current.rotation.x = -0.7 * Math.min(1, healT * 2);
      if (rightArmRef.current) rightArmRef.current.rotation.x = -0.5 * Math.min(1, healT * 2);
      if (healT >= 1) { animState.current = 'idle'; resetLimbs(); bodyRef.current.rotation.set(0, 0, 0); bodyRef.current.position.set(0, 0, 0); }
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
    } else {
      // ── IDLE ──
      rootRef.current.position.set(unit.position.x, unitBaseY, unit.position.z);
      const breathe = Math.sin(t * 1.8 + unit.position.x * 2) * 0.006;
      const sway = Math.sin(t * 0.7 + unit.position.z) * 0.01;
      bodyRef.current.position.y = breathe;
      bodyRef.current.rotation.z = sway;
      bodyRef.current.rotation.x = 0;
      if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(t * 1.2) * 0.02;
      if (rightArmRef.current) rightArmRef.current.rotation.x = Math.sin(t * 1.2 + 1) * 0.02;
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;

      // Cover crouch
      if (unit.coverType === 'full') {
        bodyRef.current.position.y = -0.08;
        if (leftLegRef.current) leftLegRef.current.rotation.x = -0.35;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -0.25;
      } else if (unit.coverType === 'half') {
        bodyRef.current.position.y = -0.04;
        if (leftLegRef.current) leftLegRef.current.rotation.x = -0.15;
      }

      if (unit.isSuppressed) {
        bodyRef.current.rotation.z += Math.sin(t * 20) * 0.015;
      }
      if (unit.isOnOverwatch) {
        if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.PI / 4;
        if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.PI / 5;
        bodyRef.current.rotation.x = 0.04;
      }
    }

    // Face direction
    bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y || 0, facingAngle.current, 0.1);

    // Selection ring pulse
    if (isSelected && ringRef.current) {
      const scale = 1 + Math.sin(t * 4) * 0.08;
      ringRef.current.scale.set(scale, 1, scale);
    }
    if (flashIntensity.current > 0) flashIntensity.current = Math.max(0, flashIntensity.current - delta * 4);
  });

  const limbColor = useMemo(() => {
    const c = new THREE.Color(color);
    return '#' + c.clone().lerp(new THREE.Color('#222222'), 0.45).getHexString();
  }, [color]);

  // Show tombstone immediately after death animation (1.5s instead of 5s)
  if (!unit.isAlive && deathTimer.current >= 1.5) {
    const unitBaseY = getUnitBaseY(grid, unit.position.x, unit.position.z);
    return (
      <group position={[unit.position.x, unitBaseY, unit.position.z]}>
        {/* Tombstone base */}
        <mesh position={[0, 0.06, 0]} castShadow>
          <boxGeometry args={[0.2, 0.12, 0.06]} />
          <meshStandardMaterial color="#555555" roughness={0.9} metalness={0.05} />
        </mesh>
        {/* Tombstone headstone */}
        <mesh position={[0, 0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.14, 0.04]} />
          <meshStandardMaterial color="#666666" roughness={0.85} />
        </mesh>
        {/* Rounded top */}
        <mesh position={[0, 0.27, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.04, 6, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color="#666666" roughness={0.85} />
        </mesh>
        {/* Team color cross/emblem */}
        <mesh position={[0, 0.2, 0.022]}>
          <boxGeometry args={[0.04, 0.012, 0.002]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, 0.2, 0.022]}>
          <boxGeometry args={[0.012, 0.04, 0.002]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
        </mesh>
        {/* Ground mound */}
        <mesh position={[0, 0.02, 0.08]} rotation={[-0.3, 0, 0]}>
          <boxGeometry args={[0.22, 0.04, 0.15]} />
          <meshStandardMaterial color="#3a3520" roughness={1} />
        </mesh>
        {/* Name */}
        <Billboard position={[0, 0.38, 0]}>
          <Text fontSize={0.055} color="#888888" anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.01} outlineColor="#000000">
            {unit.name}
          </Text>
        </Billboard>
      </group>
    );
  }

  const hpPercent = unit.hp / unit.maxHp;

  return (
    <group
      ref={rootRef}
      position={[unit.position.x, getUnitBaseY(grid, unit.position.x, unit.position.z), unit.position.z]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <group ref={bodyRef}>
        <SoldierBody teamColor={color} isMedic={isMedic} unitId={unit.id} />

        {/* ── LEFT ARM ── */}
        <group ref={leftArmRef} position={[-0.19, 0.48, 0]}>
          <mesh position={[0, -0.06, 0]} castShadow>
            <boxGeometry args={[0.07, 0.13, 0.07]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.16, 0.02]}>
            <boxGeometry args={[0.06, 0.1, 0.06]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.22, 0.03]}>
            <boxGeometry args={[0.045, 0.045, 0.045]} />
            <meshStandardMaterial color="#1a1a14" roughness={0.6} />
          </mesh>
        </group>

        {/* ── RIGHT ARM ── */}
        <group ref={rightArmRef} position={[0.19, 0.48, 0]}>
          <mesh position={[0, -0.06, 0]} castShadow>
            <boxGeometry args={[0.07, 0.13, 0.07]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.16, 0.02]}>
            <boxGeometry args={[0.06, 0.1, 0.06]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.22, 0.03]}>
            <boxGeometry args={[0.045, 0.045, 0.045]} />
            <meshStandardMaterial color="#1a1a14" roughness={0.6} />
          </mesh>
          <group ref={weaponGroupRef} position={[0, -0.12, 0.05]}>
            <Weapon weaponId={unit.weapon.id} />
          </group>
        </group>

        {/* ── LEFT LEG ── */}
        <group ref={leftLegRef} position={[-0.07, 0.3, 0]}>
          <mesh position={[0, -0.08, 0]} castShadow>
            <boxGeometry args={[0.08, 0.15, 0.08]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.075, 0.12, 0.075]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.28, 0.015]}>
            <boxGeometry args={[0.08, 0.05, 0.1]} />
            <meshStandardMaterial color="#1e1a14" roughness={0.6} metalness={0.1} />
          </mesh>
        </group>

        {/* ── RIGHT LEG ── */}
        <group ref={rightLegRef} position={[0.07, 0.3, 0]}>
          <mesh position={[0, -0.08, 0]} castShadow>
            <boxGeometry args={[0.08, 0.15, 0.08]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.075, 0.12, 0.075]} />
            <meshStandardMaterial color={limbColor} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.28, 0.015]}>
            <boxGeometry args={[0.08, 0.05, 0.1]} />
            <meshStandardMaterial color="#1e1a14" roughness={0.6} metalness={0.1} />
          </mesh>
        </group>

        {/* Muzzle flash */}
        {animState.current === 'shooting' && (
          <pointLight position={[0.26, 0.36, 0.38]} color="#ffaa00" intensity={4} distance={3} />
        )}

        {/* Ground shadow */}
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.22, 10]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.3} />
        </mesh>
      </group>

      {/* ── HP Bar ── */}
      {unit.isAlive && (
        <Billboard position={[0, 0.9, 0]}>
          <mesh position={[0, 0, -0.001]}>
            <planeGeometry args={[0.45, 0.045]} />
            <meshBasicMaterial color="#111111" transparent opacity={0.85} />
          </mesh>
          <mesh position={[(hpPercent - 1) * 0.21, 0, 0]}>
            <planeGeometry args={[0.42 * hpPercent, 0.03]} />
            <meshBasicMaterial color={hpPercent > 0.5 ? '#44cc44' : hpPercent > 0.25 ? '#cccc44' : '#cc4444'} />
          </mesh>
        </Billboard>
      )}

      {/* ── Name ── */}
      {unit.isAlive && (
        <Billboard position={[0, 1.0, 0]}>
          <Text fontSize={0.075} color={color} anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.014} outlineColor="#000000">
            {unit.name}
          </Text>
          <Text fontSize={0.04} color="#888888" anchorX="center" anchorY="middle" position={[0, -0.085, 0]}
            outlineWidth={0.008} outlineColor="#000000" font={undefined}>
            {unit.unitClass.toUpperCase()} • {unit.weapon.name}
          </Text>
        </Billboard>
      )}

      {/* Status icons */}
      {unit.isHunkered && (
        <Billboard position={[-0.22, 0.72, 0]}>
          <Text fontSize={0.09} color="#ffaa00" anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.012} outlineColor="#000000">🛡</Text>
        </Billboard>
      )}
      {unit.isSuppressed && (
        <Billboard position={[0.22, 0.72, 0]}>
          <Text fontSize={0.09} color="#ff4444" anchorX="center" anchorY="middle" font={undefined}
            outlineWidth={0.012} outlineColor="#000000">⛔</Text>
        </Billboard>
      )}

      {/* Selection ring */}
      {isSelected && (
        <mesh ref={ringRef} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.4, 20]} />
          <meshBasicMaterial color={color} transparent opacity={0.65} />
        </mesh>
      )}

      {/* Team dot */}
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.05, 6]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Vision ring */}
      {unit.isAlive && (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[unit.visionRange - 0.05, unit.visionRange + 0.05, 20]} />
          <meshBasicMaterial color={color} transparent opacity={0.06} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Attack range ring when hunkered */}
      {unit.isHunkered && (
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[unit.attackRange - 0.08, unit.attackRange + 0.08, 20]} />
          <meshBasicMaterial color="#ffaa00" transparent opacity={0.1} side={THREE.DoubleSide} />
        </mesh>
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
