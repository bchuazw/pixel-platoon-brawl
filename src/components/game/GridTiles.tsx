import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { TileData, Position, GRID_SIZE } from '@/game/types';
import { isInZone } from '@/game/gameState';
import { useQualityStore } from '@/game/useQualityStore';
import * as THREE from 'three';

interface GridTilesProps {
  grid: TileData[][];
  movableTiles: Position[];
  attackableTiles: Position[];
  abilityTargetTiles: Position[];
  shrinkLevel: number;
  movePath: Position[] | null;
  onTileClick: (pos: Position) => void;
  onTileHover: (pos: Position | null) => void;
  weaponRangeTiles?: Position[];
  units?: { position: Position; visionRange: number; isAlive: boolean }[];
}

// ── Naturalistic terrain palette ──
const TERRAIN: Record<string, { base: string; dark: string; light: string; side: string }> = {
  grass:         { base: '#5a9438', dark: '#4a7e2e', light: '#6aaa48', side: '#3d6828' },
  dirt:          { base: '#b08a58', dark: '#9a7848', light: '#c49a68', side: '#7a5e38' },
  stone:         { base: '#8a8a90', dark: '#6e6e76', light: '#a0a0a8', side: '#5a5a62' },
  water:         { base: '#3888bb', dark: '#2a6a99', light: '#4499cc', side: '#1a5580' },
  sand:          { base: '#d4b870', dark: '#baa058', light: '#e0c880', side: '#9a8048' },
  wall:          { base: '#707078', dark: '#585860', light: '#888890', side: '#484850' },
  trench:        { base: '#6a5a38', dark: '#544828', light: '#7a6a48', side: '#3e3220' },
  crater:        { base: '#383330', dark: '#282420', light: '#484340', side: '#1e1a18' },
  cobblestone:   { base: '#8a8078', dark: '#6e6860', light: '#9a9088', side: '#5a5450' },
  beach_sand:    { base: '#e8d8a0', dark: '#d4c488', light: '#f0e0b0', side: '#c0a870' },
  shallow_water: { base: '#5aaabb', dark: '#4899aa', light: '#6cbbcc', side: '#3a8899' },
  mud:           { base: '#6a5a3a', dark: '#544828', light: '#7a6a4a', side: '#3e3220' },
};

function tileHash(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

function quantizeElevation(elev: number): number {
  return Math.round(elev * 2.5) / 2.5;
}

export function getTileY(elevation: number): number {
  return quantizeElevation(elevation) * 0.6;
}

const TILE_SIZE = 1.0;
const SURFACE_H = 0.08;

function lerpColor(hex1: string, hex2: string, t: number): string {
  const c1 = new THREE.Color(hex1);
  const c2 = new THREE.Color(hex2);
  c1.lerp(c2, t);
  return '#' + c1.getHexString();
}

function darkenColor(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return '#' + c.getHexString();
}

// ══════════════════════════════════════════════════════════════
// ── INSTANCED TILE GRID — one draw call for all tile surfaces
// ══════════════════════════════════════════════════════════════
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function InstancedTileGrid({ grid, movableSet, attackableSet, abilitySet, pathSet, weaponRangeSet, shrinkLevel, onTileClick, onTileHover }: {
  grid: TileData[][];
  movableSet: Set<string>;
  attackableSet: Set<string>;
  abilitySet: Set<string>;
  pathSet: Set<string>;
  weaponRangeSet: Set<string>;
  shrinkLevel: number;
  onTileClick: (pos: Position) => void;
  onTileHover: (pos: Position | null) => void;
}) {
  const surfaceRef = useRef<THREE.InstancedMesh>(null);
  const sideRef = useRef<THREE.InstancedMesh>(null);
  const highlightRef = useRef<THREE.InstancedMesh>(null);
  const count = GRID_SIZE * GRID_SIZE;

  // Build instance matrices and colors
  useEffect(() => {
    if (!surfaceRef.current) return;
    let highlightCount = 0;

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const i = x * GRID_SIZE + z;
        const tile = grid[x][z];
        const t = TERRAIN[tile.type] || TERRAIN.grass;
        const h1 = tileHash(x, z, 1);
        const colorBlend = h1 * 0.4;
        const baseColor = lerpColor(t.base, h1 > 0.5 ? t.light : t.dark, colorBlend);

        const key = `${x},${z}`;
        const isOutOfZone = !isInZone(x, z, shrinkLevel) && shrinkLevel > 0;

        const qElev = quantizeElevation(tile.elevation);
        const tileY = qElev * 0.6;
        const isWater = tile.type === 'water';
        const isTrench = tile.type === 'trench';
        const isCrater = tile.type === 'crater';
        const surfaceH = isWater ? 0.03 : isTrench ? 0.04 : isCrater ? 0.04 : SURFACE_H;

        const topColor = isOutOfZone ? '#4a1818' : tile.scorchMark ? darkenColor(baseColor, 0.4) : baseColor;

        _dummy.position.set(x, tileY + surfaceH / 2, z);
        _dummy.scale.set(TILE_SIZE, surfaceH, TILE_SIZE);
        _dummy.updateMatrix();
        surfaceRef.current!.setMatrixAt(i, _dummy.matrix);
        _color.set(topColor);
        surfaceRef.current!.setColorAt(i, _color);

        // Check for highlights
        const isMovable = movableSet.has(key);
        const isOnPath = pathSet.has(key);
        const isWeaponRange = weaponRangeSet.has(key) && !isMovable && !attackableSet.has(key);
        const isAttackable = attackableSet.has(key);
        const isAbilityTarget = abilitySet.has(key);

        if (isMovable || isOnPath || isWeaponRange || isAttackable || isAbilityTarget || (isOutOfZone && tile.type === 'water')) {
          highlightCount++;
        }
      }
    }

    surfaceRef.current!.instanceMatrix.needsUpdate = true;
    if (surfaceRef.current!.instanceColor) surfaceRef.current!.instanceColor.needsUpdate = true;

    // Build side instances
    if (sideRef.current) {
      let si = 0;
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const tile = grid[x][z];
          const t = TERRAIN[tile.type] || TERRAIN.grass;
          const qElev = quantizeElevation(tile.elevation);
          const tileY = qElev * 0.6;
          const isWater = tile.type === 'water';
          if (tileY > 0.02 && !isWater) {
            _dummy.position.set(x, tileY / 2, z);
            _dummy.scale.set(TILE_SIZE, tileY, TILE_SIZE);
            _dummy.updateMatrix();
            sideRef.current!.setMatrixAt(si, _dummy.matrix);
            const sideColor = tile.scorchMark ? darkenColor(t.side, 0.3) : t.side;
            _color.set(sideColor);
            sideRef.current!.setColorAt(si, _color);
            si++;
          }
        }
      }
      sideRef.current!.instanceMatrix.needsUpdate = true;
      if (sideRef.current!.instanceColor) sideRef.current!.instanceColor.needsUpdate = true;
    }

    // Build highlight overlay instances
    if (highlightRef.current && highlightCount > 0) {
      let hi = 0;
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const key = `${x},${z}`;
          const isMovable = movableSet.has(key);
          const isOnPath = pathSet.has(key);
          const isWeaponRange = weaponRangeSet.has(key) && !isMovable && !attackableSet.has(key);
          const isAttackable = attackableSet.has(key);
          const isAbilityTarget = abilitySet.has(key);
          const isOutOfZone = !isInZone(x, z, shrinkLevel) && shrinkLevel > 0;

          let hlColor = '';
          if (isOutOfZone) hlColor = '#cc2222';
          if (isMovable) hlColor = '#2299ff';
          if (isOnPath) hlColor = '#44ddff';
          if (isWeaponRange) hlColor = '#ff8800';
          if (isAttackable) hlColor = '#ff3333';
          if (isAbilityTarget) hlColor = '#ffaa00';

          if (hlColor) {
            const tile = grid[x][z];
            const qElev = quantizeElevation(tile.elevation);
            const tileY = qElev * 0.6;
            const surfaceH = tile.type === 'water' ? 0.03 : tile.type === 'trench' ? 0.04 : tile.type === 'crater' ? 0.04 : SURFACE_H;

            _dummy.position.set(x, tileY + surfaceH + 0.005, z);
            _dummy.scale.set(TILE_SIZE * 0.95, 0.01, TILE_SIZE * 0.95);
            _dummy.updateMatrix();
            highlightRef.current!.setMatrixAt(hi, _dummy.matrix);
            _color.set(hlColor);
            highlightRef.current!.setColorAt(hi, _color);
            hi++;
          }
        }
      }
      // Hide unused instances
      for (let j = hi; j < highlightCount; j++) {
        _dummy.position.set(0, -100, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        highlightRef.current!.setMatrixAt(j, _dummy.matrix);
      }
      highlightRef.current!.instanceMatrix.needsUpdate = true;
      if (highlightRef.current!.instanceColor) highlightRef.current!.instanceColor.needsUpdate = true;
    }
  }, [grid, movableSet, attackableSet, abilitySet, pathSet, weaponRangeSet, shrinkLevel]);

  const sideCount = useMemo(() => {
    let c = 0;
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const tile = grid[x][z];
        const qElev = quantizeElevation(tile.elevation);
        const tileY = qElev * 0.6;
        if (tileY > 0.02 && tile.type !== 'water') c++;
      }
    }
    return c;
  }, [grid]);

  const highlightCount = useMemo(() => {
    let c = 0;
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const key = `${x},${z}`;
        const isMovable = movableSet.has(key);
        const isOnPath = pathSet.has(key);
        const isWeaponRange = weaponRangeSet.has(key) && !isMovable && !attackableSet.has(key);
        const isAttackable = attackableSet.has(key);
        const isAbilityTarget = abilitySet.has(key);
        const isOutOfZone = !isInZone(x, z, shrinkLevel) && shrinkLevel > 0;
        if (isMovable || isOnPath || isWeaponRange || isAttackable || isAbilityTarget || isOutOfZone) c++;
      }
    }
    return Math.max(1, c);
  }, [movableSet, attackableSet, abilitySet, pathSet, weaponRangeSet, shrinkLevel]);

  const handleClick = (e: any) => {
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId !== undefined && instanceId < count) {
      const x = Math.floor(instanceId / GRID_SIZE);
      const z = instanceId % GRID_SIZE;
      onTileClick({ x, z });
    }
  };

  const handlePointerMove = (e: any) => {
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId !== undefined && instanceId < count) {
      const x = Math.floor(instanceId / GRID_SIZE);
      const z = instanceId % GRID_SIZE;
      onTileHover({ x, z });
    }
  };

  const handlePointerOut = () => {
    onTileHover(null);
  };

  return (
    <>
      <instancedMesh
        ref={surfaceRef}
        args={[undefined, undefined, count]}
        receiveShadow
        castShadow
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>

      {sideCount > 0 && (
        <instancedMesh ref={sideRef} args={[undefined, undefined, sideCount]} receiveShadow castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial roughness={0.95} />
        </instancedMesh>
      )}

      {/* Highlight overlay for movable/attackable/path tiles */}
      <instancedMesh ref={highlightRef} args={[undefined, undefined, highlightCount]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0.35} />
      </instancedMesh>
    </>
  );
}

// ── Water with animated shimmer (kept as individual for animation) ──
function WaterSurface({ x, z, y }: { x: number; z: number; y: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.15 + Math.sin(t * 2.2 + x * 1.3 + z * 0.7) * 0.06;
    ref.current.position.y = y + Math.sin(t * 1.3 + x + z * 0.8) * 0.005;
  });
  return (
    <mesh ref={ref} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshBasicMaterial color="#88ddff" transparent opacity={0.15} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

// ── Smoke ──
function SmokeEffect({ x, z, y }: { x: number; z: number; y: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = y + Math.sin(t * 0.8) * 0.04;
    ref.current.rotation.y = t * 0.15;
  });
  return (
    <group ref={ref} position={[x, y, z]}>
      <mesh><sphereGeometry args={[0.35, 6, 4]} /><meshBasicMaterial color="#99aabb" transparent opacity={0.2} depthWrite={false} /></mesh>
      <mesh position={[0.15, 0.1, 0.1]}><sphereGeometry args={[0.25, 5, 4]} /><meshBasicMaterial color="#889aaa" transparent opacity={0.16} depthWrite={false} /></mesh>
    </group>
  );
}

// ══════════════════════════════════════════════════
// ── Props — simplified for performance; quality-dependent detail
// ══════════════════════════════════════════════════
function PropObject({ tile, detail }: { tile: TileData; detail: 'low' | 'medium' | 'high' }) {
  if (!tile.prop) return null;
  const qElev = quantizeElevation(tile.elevation);
  const baseY = qElev * 0.6 + SURFACE_H;
  const h = tileHash(tile.x, tile.z, 99);
  const scaleVar = 0.85 + tileHash(tile.x, tile.z, 200) * 0.3;
  const rotVar = tileHash(tile.x, tile.z, 201) * 0.3 - 0.15;

  // Low detail: simplified single-mesh props
  if (detail === 'low') {
    const propColors: Record<string, string> = {
      tree: '#2e7018', bush: '#3a7a28', rock: '#7a7a82', crate: '#8a6a30',
      barrel: '#4a6848', sandbag: '#c0a060', ruins: '#7a7a82', wall: '#707078',
      jersey_barrier: '#a0a0a0', wire: '#7a7a78', foxhole: '#7a6a42',
      hesco: '#b49a60', tank_trap: '#4a4035', broken_wall: '#8a7a6a',
      burnt_vehicle: '#222220', wrecked_car: '#3a3a4a', rubble_pile: '#6a6058',
      lamp_post: '#3a3a3a', bench: '#6a4a20', market_stall: '#7a5a30',
      palm_tree: '#2a7a18', driftwood: '#9a8a6a', church_wall: '#b0a890',
      chimney: '#8a4422', boat_wreck: '#5a4a30', fountain: '#9a9a9a', pier_post: '#6a5a30',
    };
    const color = propColors[tile.prop] || '#666666';
    const isTree = tile.prop === 'tree' || tile.prop === 'palm_tree';
    const height = isTree ? 1.2 : 0.35;
    return (
      <mesh position={[tile.x, baseY + height / 2, tile.z]} castShadow>
        {isTree ? <cylinderGeometry args={[0.15, 0.08, height, 6]} /> : <boxGeometry args={[0.4, height, 0.4]} />}
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    );
  }

  // Medium detail: 2-3 meshes per prop
  switch (tile.prop) {
    case 'crate':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * 0.4, 0]}>
          <mesh position={[0, 0.175, 0]} castShadow>
            <boxGeometry args={[0.42, 0.35, 0.42]} />
            <meshStandardMaterial color="#8a6a30" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.355, 0]}><boxGeometry args={[0.44, 0.012, 0.44]} /><meshStandardMaterial color="#5a5a55" metalness={0.5} roughness={0.4} /></mesh>
        </group>
      );
    case 'barrel':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.225, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.20, 0.45, 8]} />
            <meshStandardMaterial color="#4a6848" roughness={0.6} metalness={0.3} />
          </mesh>
        </group>
      );
    case 'sandbag':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h > 0.5 ? 0 : Math.PI / 2, 0]}>
          <mesh position={[0, 0.08, 0]} castShadow><boxGeometry args={[0.55, 0.14, 0.22]} /><meshStandardMaterial color="#c0a060" roughness={1} /></mesh>
          <mesh position={[0, 0.22, 0]} castShadow><boxGeometry args={[0.28, 0.14, 0.20]} /><meshStandardMaterial color="#b89858" roughness={1} /></mesh>
        </group>
      );
    case 'rock':
      return (
        <mesh position={[tile.x, baseY + 0.15, tile.z]} castShadow>
          <dodecahedronGeometry args={[0.25, 1]} />
          <meshStandardMaterial color="#7a7a82" roughness={0.95} />
        </mesh>
      );
    case 'bush':
      return (
        <mesh position={[tile.x, baseY + 0.15, tile.z]} castShadow>
          <sphereGeometry args={[0.28, 6, 5]} />
          <meshStandardMaterial color="#3a7a28" roughness={0.95} />
        </mesh>
      );
    case 'tree':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI * 2, 0]} scale={[scaleVar, 0.85 + tileHash(tile.x, tile.z, 203) * 0.35, scaleVar]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.09, 0.7, 5]} />
            <meshStandardMaterial color="#5a3818" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.85, 0]} castShadow>
            <sphereGeometry args={[0.42, 6, 5]} />
            <meshStandardMaterial color="#2e7018" roughness={0.9} />
          </mesh>
          {detail === 'high' && (
            <>
              <mesh position={[0.08, 1.15, 0.05]} castShadow>
                <sphereGeometry args={[0.32, 6, 5]} />
                <meshStandardMaterial color="#389222" roughness={0.9} />
              </mesh>
              <mesh position={[-0.05, 1.38, -0.03]}>
                <sphereGeometry args={[0.22, 5, 4]} />
                <meshStandardMaterial color="#42a830" roughness={0.9} />
              </mesh>
            </>
          )}
        </group>
      );
    case 'ruins':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI / 2, 0]}>
          <mesh position={[0, 0.04, 0]} castShadow><boxGeometry args={[0.7, 0.08, 0.6]} /><meshStandardMaterial color="#6e6e76" roughness={0.92} /></mesh>
          <mesh position={[-0.22, 0.32, -0.15]} castShadow><boxGeometry args={[0.1, 0.56, 0.28]} /><meshStandardMaterial color="#7a7a82" roughness={0.9} /></mesh>
        </group>
      );
    case 'jersey_barrier':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h > 0.5 ? 0 : Math.PI / 2, 0]}>
          <mesh position={[0, 0.225, 0]} castShadow>
            <boxGeometry args={[0.72, 0.45, 0.28]} />
            <meshStandardMaterial color="#a0a0a0" roughness={0.85} />
          </mesh>
        </group>
      );
    case 'burnt_vehicle':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI, 0]}>
          <mesh position={[0, 0.12, 0]} castShadow><boxGeometry args={[0.82, 0.2, 0.44]} /><meshStandardMaterial color="#222220" roughness={0.8} metalness={0.3} /></mesh>
          <mesh position={[-0.08, 0.3, 0]} castShadow><boxGeometry args={[0.38, 0.22, 0.38]} /><meshStandardMaterial color="#1a1a18" roughness={0.75} metalness={0.35} /></mesh>
        </group>
      );
    case 'wire':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h > 0.5 ? 0 : Math.PI / 2, 0]}>
          <mesh position={[-0.32, 0.14, 0]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.28, 4]} /><meshStandardMaterial color="#5a4a30" roughness={0.9} /></mesh>
          <mesh position={[0.32, 0.14, 0]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.28, 4]} /><meshStandardMaterial color="#5a4a30" roughness={0.9} /></mesh>
          <mesh position={[0, 0.24, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.004, 0.004, 0.64, 3]} /><meshStandardMaterial color="#8a8a88" metalness={0.7} roughness={0.3} /></mesh>
        </group>
      );
    case 'foxhole':
      return (
        <group position={[tile.x, baseY - 0.06, tile.z]}>
          <mesh position={[0.34, 0.06, 0]} castShadow><boxGeometry args={[0.12, 0.1, 0.4]} /><meshStandardMaterial color="#7a6a42" roughness={1} /></mesh>
          <mesh position={[-0.34, 0.06, 0]} castShadow><boxGeometry args={[0.12, 0.1, 0.4]} /><meshStandardMaterial color="#6a5a38" roughness={1} /></mesh>
        </group>
      );
    case 'hesco':
      return (
        <mesh position={[tile.x, baseY + 0.3, tile.z]} castShadow>
          <boxGeometry args={[0.52, 0.6, 0.52]} />
          <meshStandardMaterial color="#b49a60" roughness={0.92} />
        </mesh>
      );
    case 'tank_trap':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI / 3, 0]}>
          <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 4]} castShadow><boxGeometry args={[0.05, 0.48, 0.05]} /><meshStandardMaterial color="#4a4035" metalness={0.5} roughness={0.45} /></mesh>
          <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 4, 0, 0]}><boxGeometry args={[0.05, 0.48, 0.05]} /><meshStandardMaterial color="#3e3428" metalness={0.5} roughness={0.45} /></mesh>
        </group>
      );
    case 'broken_wall':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h > 0.5 ? 0 : Math.PI / 2, 0]}>
          <mesh position={[0, 0.25, 0]} castShadow><boxGeometry args={[0.7, 0.5, 0.12]} /><meshStandardMaterial color="#8a7a6a" roughness={0.92} /></mesh>
        </group>
      );
    case 'wrecked_car':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI * 2, 0]}>
          <mesh position={[0, 0.14, 0]} castShadow><boxGeometry args={[0.8, 0.22, 0.4]} /><meshStandardMaterial color="#3a3a4a" roughness={0.75} metalness={0.35} /></mesh>
          <mesh position={[0.05, 0.32, 0]} castShadow><boxGeometry args={[0.4, 0.18, 0.36]} /><meshStandardMaterial color="#2a2a3a" roughness={0.7} metalness={0.4} /></mesh>
        </group>
      );
    case 'rubble_pile':
      return (
        <mesh position={[tile.x, baseY + 0.06, tile.z]} castShadow>
          <dodecahedronGeometry args={[0.15, 0]} />
          <meshStandardMaterial color="#6a6058" roughness={0.95} />
        </mesh>
      );
    case 'lamp_post':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.025, 0.04, 1.0, 5]} /><meshStandardMaterial color="#3a3a3a" metalness={0.6} roughness={0.4} /></mesh>
        </group>
      );
    case 'palm_tree':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.45, 0]} castShadow><cylinderGeometry args={[0.04, 0.06, 0.9, 5]} /><meshStandardMaterial color="#8a6a30" roughness={0.95} /></mesh>
          <mesh position={[0, 0.88, 0]} castShadow><sphereGeometry args={[0.3, 5, 4]} /><meshStandardMaterial color="#2a7a18" roughness={0.9} /></mesh>
        </group>
      );
    case 'church_wall':
      return (
        <mesh position={[tile.x, baseY + 0.4, tile.z]} castShadow>
          <boxGeometry args={[0.65, 0.8, 0.14]} />
          <meshStandardMaterial color="#b0a890" roughness={0.92} />
        </mesh>
      );
    case 'chimney':
      return (
        <mesh position={[tile.x, baseY + 0.3, tile.z]} castShadow>
          <boxGeometry args={[0.22, 0.6, 0.22]} />
          <meshStandardMaterial color="#8a4422" roughness={0.9} />
        </mesh>
      );
    case 'fountain':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.06, 0]} castShadow><cylinderGeometry args={[0.35, 0.38, 0.12, 8]} /><meshStandardMaterial color="#9a9a9a" roughness={0.85} /></mesh>
          <mesh position={[0, 0.18, 0]} castShadow><cylinderGeometry args={[0.06, 0.06, 0.24, 5]} /><meshStandardMaterial color="#8a8a88" roughness={0.85} /></mesh>
        </group>
      );
    default:
      // bench, market_stall, driftwood, boat_wreck, pier_post — simplified
      return (
        <mesh position={[tile.x, baseY + 0.15, tile.z]} castShadow>
          <boxGeometry args={[0.4, 0.3, 0.3]} />
          <meshStandardMaterial color="#6a5a30" roughness={0.9} />
        </mesh>
      );
  }
}

// ── Loot — simplified ──
function LootObject({ tile }: { tile: TileData }) {
  const ref = useRef<THREE.Group>(null);
  const qElev = quantizeElevation(tile.elevation);
  const baseY = qElev * 0.6 + SURFACE_H + 0.01;

  useFrame(({ clock }) => {
    if (!ref.current || !tile.loot) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = baseY + Math.sin(t * 1.8 + tile.x * 0.7 + tile.z * 1.3) * 0.02;
  });

  if (!tile.loot) return null;
  const color = tile.loot.type === 'weapon' ? '#ffaa22' : tile.loot.type === 'medkit' ? '#ff3366' :
                tile.loot.type === 'armor' ? '#3388ff' : tile.loot.type === 'killstreak' ? '#bb44ff' : '#66cc33';

  return (
    <group ref={ref} position={[tile.x, baseY, tile.z]}>
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.25, 0.15, 0.18]} />
        <meshStandardMaterial color="#5a3a1a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.04, 5, 5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.8} />
      </mesh>
      <pointLight color={color} intensity={0.3} distance={1.2} position={[0, 0.25, 0]} />
      <Billboard position={[0, 0.32, 0]}>
        <Text fontSize={0.07} color={color} anchorX="center" anchorY="middle" font={undefined} outlineWidth={0.012} outlineColor="#000000">
          {tile.loot.icon} {tile.loot.name}
        </Text>
      </Billboard>
    </group>
  );
}

// ── Path markers ──
function PathMarkers({ path, grid }: { path: Position[]; grid: TileData[][] }) {
  return (
    <group>
      {path.map((pos, i) => {
        const tile = grid[pos.x]?.[pos.z];
        const qElev = quantizeElevation(tile?.elevation || 0);
        const y = qElev * 0.6 + SURFACE_H + 0.005;
        return (
          <mesh key={`path-${i}`} position={[pos.x, y, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.1, 6]} />
            <meshBasicMaterial color="#44ddff" transparent opacity={0.45 - i * 0.03} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── Main GridTiles ──
export function GridTiles({ grid, movableTiles, attackableTiles, abilityTargetTiles, shrinkLevel, movePath, onTileClick, onTileHover, weaponRangeTiles }: GridTilesProps) {
  const { settings } = useQualityStore();
  const lootTiles = useMemo(() => grid.flat().filter(t => t.loot !== null), [grid]);
  const movableSet = useMemo(() => new Set(movableTiles.map(t => `${t.x},${t.z}`)), [movableTiles]);
  const attackableSet = useMemo(() => new Set(attackableTiles.map(t => `${t.x},${t.z}`)), [attackableTiles]);
  const abilitySet = useMemo(() => new Set(abilityTargetTiles.map(t => `${t.x},${t.z}`)), [abilityTargetTiles]);
  const pathSet = useMemo(() => new Set(movePath ? movePath.map(p => `${p.x},${p.z}`) : []), [movePath]);
  const weaponRangeSet = useMemo(() => new Set(weaponRangeTiles ? weaponRangeTiles.map(t => `${t.x},${t.z}`) : []), [weaponRangeTiles]);

  // Water tiles for overlay
  const waterTiles = useMemo(() => grid.flat().filter(t => t.type === 'water'), [grid]);
  // Smoke tiles
  const smokeTiles = useMemo(() => grid.flat().filter(t => t.hasSmoke), [grid]);

  return (
    <group>
      {/* Base ground */}
      <mesh position={[GRID_SIZE / 2 - 0.5, -0.25, GRID_SIZE / 2 - 0.5]} receiveShadow>
        <boxGeometry args={[GRID_SIZE + 10, 0.5, GRID_SIZE + 10]} />
        <meshStandardMaterial color="#2a3a1e" roughness={1} />
      </mesh>

      {/* INSTANCED tile grid — 2 draw calls instead of 1152 */}
      <InstancedTileGrid
        grid={grid}
        movableSet={movableSet}
        attackableSet={attackableSet}
        abilitySet={abilitySet}
        pathSet={pathSet}
        weaponRangeSet={weaponRangeSet}
        shrinkLevel={shrinkLevel}
        onTileClick={onTileClick}
        onTileHover={onTileHover}
      />

      {/* Water overlays — only for water tiles */}
      {waterTiles.map(tile => {
        const tileY = getTileY(tile.elevation);
        return <WaterSurface key={`w-${tile.x}-${tile.z}`} x={tile.x} z={tile.z} y={tileY + 0.03 + 0.01} />;
      })}

      {/* Smoke effects */}
      {smokeTiles.map(tile => {
        const tileY = getTileY(tile.elevation);
        return <SmokeEffect key={`s-${tile.x}-${tile.z}`} x={tile.x} z={tile.z} y={tileY + 0.5} />;
      })}

      {/* Props — quality dependent */}
      {grid.flat().filter(t => t.prop).map(tile => (
        <PropObject key={`p-${tile.x}-${tile.z}`} tile={tile} detail={settings.propDetail} />
      ))}

      {lootTiles.map(tile => (
        <LootObject key={`l-${tile.x}-${tile.z}`} tile={tile} />
      ))}

      {movePath && <PathMarkers path={movePath} grid={grid} />}
    </group>
  );
}
