import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { TileData, Position, GRID_SIZE } from '@/game/types';
import { isInZone } from '@/game/gameState';
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
}

// ── XCOM-inspired color palette ──
const TILE_COLORS: Record<string, string> = {
  grass: '#3d6b32',
  dirt: '#7a6548',
  stone: '#5e5e66',
  water: '#1e4a7a',
  sand: '#a89050',
  wall: '#4e4e56',
  trench: '#4a3e28',
};
const TILE_COLORS_ALT: Record<string, string> = {
  grass: '#356028',
  dirt: '#6e5a40',
  stone: '#54545c',
  water: '#184070',
  sand: '#9a8548',
  wall: '#46464e',
  trench: '#423820',
};

// Edge/side colors (darker)
const TILE_SIDE_COLORS: Record<string, string> = {
  grass: '#264a1e',
  dirt: '#5a4830',
  stone: '#3e3e44',
  water: '#0e2a4a',
  sand: '#7a6838',
  wall: '#36363e',
  trench: '#2e2818',
};

export function getTileY(elevation: number): number {
  return elevation * 0.5;
}

// ── Redesigned Tile — XCOM-style with visible edges ──
function Tile({ tile, isMovable, isAttackable, isAbilityTarget, isOutOfZone, isOnPath, hasSmoke, onClick, onHover }: {
  tile: TileData; isMovable: boolean; isAttackable: boolean; isAbilityTarget: boolean;
  isOutOfZone: boolean; isOnPath: boolean; hasSmoke: boolean; onClick: () => void; onHover: (hover: boolean) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const edgeRef = useRef<THREE.Mesh>(null);
  const useAlt = (tile.x + tile.z) % 2 === 0;
  let color = useAlt ? TILE_COLORS_ALT[tile.type] || '#3d6b32' : TILE_COLORS[tile.type] || '#3d6b32';
  const sideColor = TILE_SIDE_COLORS[tile.type] || '#264a1e';
  let emissive = '#000000';
  let emissiveIntensity = 0;

  if (tile.type === 'water') { emissive = '#0a3366'; emissiveIntensity = 0.15; }
  if (isOutOfZone) { color = '#4a1818'; emissive = '#cc2222'; emissiveIntensity = 0.2; }
  if (isMovable) { emissive = '#1188dd'; emissiveIntensity = 0.35; }
  if (isOnPath) { emissive = '#22bbff'; emissiveIntensity = 0.55; }
  if (isAttackable) { emissive = '#dd3333'; emissiveIntensity = 0.45; }
  if (isAbilityTarget) { emissive = '#dd8800'; emissiveIntensity = 0.4; }

  const tileY = getTileY(tile.elevation);
  const isTrench = tile.type === 'trench';
  const height = tile.type === 'water' ? 0.06 : isTrench ? 0.06 : 0.18 + tile.elevation * 0.1;
  const gap = 0.92; // tile size with gap for grid lines

  return (
    <group>
      {/* Main tile surface */}
      <mesh
        ref={ref}
        position={[tile.x, tileY, tile.z]}
        receiveShadow
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
          if (ref.current) (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity + 0.15;
        }}
        onPointerOut={() => {
          onHover(false);
          if (ref.current) (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
        }}
      >
        <boxGeometry args={[gap, height, gap]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.9}
          metalness={0.02}
        />
      </mesh>

      {/* Side fill for elevated tiles */}
      {tile.elevation > 0.15 && tile.type !== 'water' && (
        <mesh ref={edgeRef} position={[tile.x, tileY / 2, tile.z]}>
          <boxGeometry args={[gap, tileY, gap]} />
          <meshStandardMaterial color={sideColor} roughness={0.95} />
        </mesh>
      )}

      {/* Grid edge highlight (subtle) */}
      <mesh position={[tile.x, tileY + height / 2 + 0.001, tile.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.46, 4]} />
        <meshBasicMaterial color={emissiveIntensity > 0 ? emissive : '#ffffff'} transparent opacity={emissiveIntensity > 0 ? 0.25 : 0.03} />
      </mesh>

      {/* Smoke */}
      {hasSmoke && (
        <mesh position={[tile.x, tileY + 0.5, tile.z]}>
          <sphereGeometry args={[0.4, 6, 5]} />
          <meshBasicMaterial color="#8899aa" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// ── Redesigned Props (cleaner, more stylized) ──
function PropObject({ tile }: { tile: TileData }) {
  if (!tile.prop) return null;
  const baseY = getTileY(tile.elevation) + 0.09;

  switch (tile.prop) {
    case 'crate':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.18, 0]} castShadow>
            <boxGeometry args={[0.45, 0.32, 0.35]} />
            <meshStandardMaterial color="#6a5530" roughness={0.9} />
          </mesh>
          {/* Metal bands */}
          <mesh position={[0, 0.18, 0.176]}>
            <boxGeometry args={[0.46, 0.04, 0.005]} />
            <meshStandardMaterial color="#555550" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.30, 0.176]}>
            <boxGeometry args={[0.46, 0.04, 0.005]} />
            <meshStandardMaterial color="#555550" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'barrel':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.2, 0.44, 8]} />
            <meshStandardMaterial color="#3a5038" roughness={0.7} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.44, 0]}>
            <cylinderGeometry args={[0.19, 0.19, 0.02, 8]} />
            <meshStandardMaterial color="#2a3a28" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      );
    case 'sandbag':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.1, 0]} castShadow>
            <boxGeometry args={[0.6, 0.18, 0.35]} />
            <meshStandardMaterial color="#a89565" roughness={1} />
          </mesh>
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[0.55, 0.14, 0.32]} />
            <meshStandardMaterial color="#9a8858" roughness={1} />
          </mesh>
          <mesh position={[0, 0.36, 0]}>
            <boxGeometry args={[0.48, 0.1, 0.28]} />
            <meshStandardMaterial color="#a89060" roughness={1} />
          </mesh>
        </group>
      );
    case 'rock':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.16, 0]} rotation={[0.1, tile.variant * 0.8, 0.05]} castShadow>
            <dodecahedronGeometry args={[0.28, 0]} />
            <meshStandardMaterial color="#555558" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'bush':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.14, 0]} castShadow>
            <sphereGeometry args={[0.25, 6, 5]} />
            <meshStandardMaterial color="#2a5518" roughness={0.95} />
          </mesh>
          <mesh position={[0.1, 0.08, 0.08]}>
            <sphereGeometry args={[0.15, 5, 4]} />
            <meshStandardMaterial color="#224a14" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'tree':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.07, 0.5, 5]} />
            <meshStandardMaterial color="#3a2414" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow>
            <coneGeometry args={[0.35, 0.45, 5]} />
            <meshStandardMaterial color="#1a4010" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.82, 0]}>
            <coneGeometry args={[0.25, 0.35, 5]} />
            <meshStandardMaterial color="#225514" roughness={0.9} />
          </mesh>
        </group>
      );
    case 'ruins':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[0.55, 0.1, 0.55]} />
            <meshStandardMaterial color="#4a4a4e" roughness={0.95} />
          </mesh>
          <mesh position={[-0.18, 0.25, -0.18]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.1]} />
            <meshStandardMaterial color="#5a5a5e" roughness={0.95} />
          </mesh>
          <mesh position={[0.18, 0.15, 0.12]} castShadow>
            <boxGeometry args={[0.1, 0.2, 0.1]} />
            <meshStandardMaterial color="#505054" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'wire':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[-0.3, 0.14, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.28, 4]} />
            <meshStandardMaterial color="#4a3a28" roughness={0.9} />
          </mesh>
          <mesh position={[0.3, 0.14, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.28, 4]} />
            <meshStandardMaterial color="#4a3a28" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.12, 0]} rotation={[0, 0.3, Math.PI / 2]}>
            <torusGeometry args={[0.12, 0.015, 5, 10]} />
            <meshStandardMaterial color="#6a6a68" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0.05, 0.14, 0.04]} rotation={[0.2, -0.3, Math.PI / 2]}>
            <torusGeometry args={[0.1, 0.012, 5, 10]} />
            <meshStandardMaterial color="#5a5a58" metalness={0.6} roughness={0.5} />
          </mesh>
        </group>
      );
    case 'jersey_barrier':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.18, 0]} castShadow>
            <boxGeometry args={[0.65, 0.36, 0.25]} />
            <meshStandardMaterial color="#7a7a78" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.72, 0.04, 0.35]} />
            <meshStandardMaterial color="#6a6a68" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'burnt_vehicle':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.1, 0]} castShadow>
            <boxGeometry args={[0.75, 0.16, 0.42]} />
            <meshStandardMaterial color="#222220" roughness={0.9} metalness={0.25} />
          </mesh>
          <mesh position={[-0.04, 0.26, 0]} castShadow>
            <boxGeometry args={[0.35, 0.18, 0.32]} />
            <meshStandardMaterial color="#1a1a18" roughness={0.85} metalness={0.35} />
          </mesh>
          {/* Wheels */}
          <mesh position={[-0.28, 0.05, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.05, 6]} />
            <meshStandardMaterial color="#141414" roughness={0.95} />
          </mesh>
          <mesh position={[0.28, 0.05, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.05, 6]} />
            <meshStandardMaterial color="#141414" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'foxhole':
      return (
        <group position={[tile.x, baseY - 0.08, tile.z]}>
          <mesh position={[0.28, 0.05, 0]} castShadow>
            <boxGeometry args={[0.12, 0.1, 0.28]} />
            <meshStandardMaterial color="#6a5a3a" roughness={1} />
          </mesh>
          <mesh position={[-0.28, 0.05, 0]} castShadow>
            <boxGeometry args={[0.12, 0.1, 0.28]} />
            <meshStandardMaterial color="#5a4a30" roughness={1} />
          </mesh>
          <mesh position={[0, 0.05, 0.28]}>
            <boxGeometry args={[0.28, 0.1, 0.12]} />
            <meshStandardMaterial color="#6a5a3a" roughness={1} />
          </mesh>
        </group>
      );
    case 'hesco':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <boxGeometry args={[0.5, 0.44, 0.5]} />
            <meshStandardMaterial color="#9a8558" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.44, 0]}>
            <boxGeometry args={[0.45, 0.02, 0.45]} />
            <meshStandardMaterial color="#5a4a30" roughness={1} />
          </mesh>
        </group>
      );
    case 'tank_trap':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.16, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
            <boxGeometry args={[0.05, 0.45, 0.05]} />
            <meshStandardMaterial color="#4a3a2a" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 4, 0, 0]}>
            <boxGeometry args={[0.05, 0.45, 0.05]} />
            <meshStandardMaterial color="#3a2a1a" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI / 4, Math.PI / 4]}>
            <boxGeometry args={[0.05, 0.45, 0.05]} />
            <meshStandardMaterial color="#4a3a2a" metalness={0.5} roughness={0.5} />
          </mesh>
        </group>
      );
    default: return null;
  }
}

// ── Loot pickup — cleaner glow ──
function LootObject({ tile }: { tile: TileData }) {
  const ref = useRef<THREE.Group>(null);
  const baseY = getTileY(tile.elevation) + 0.18;

  useFrame(({ clock }) => {
    if (!ref.current || !tile.loot) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = baseY + 0.12 + Math.sin(t * 2 + tile.x * 0.7 + tile.z * 1.3) * 0.06;
    ref.current.rotation.y = t * 1.2 + tile.x;
  });

  if (!tile.loot) return null;

  const color = tile.loot.type === 'weapon' ? '#ee9922' :
                tile.loot.type === 'medkit' ? '#ee3355' :
                tile.loot.type === 'armor' ? '#3377ee' :
                tile.loot.type === 'killstreak' ? '#aa33ee' : '#66bb33';

  return (
    <group ref={ref} position={[tile.x, baseY + 0.12, tile.z]}>
      <mesh>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.4} metalness={0.2} />
      </mesh>
      <pointLight color={color} intensity={0.6} distance={2} />
      <Billboard position={[0, 0.28, 0]}>
        <Text fontSize={0.07} color={color} anchorX="center" anchorY="middle" font={undefined}
          outlineWidth={0.012} outlineColor="#000000">
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
        const elev = grid[pos.x]?.[pos.z]?.elevation || 0;
        const tile = grid[pos.x]?.[pos.z];
        const height = tile ? (tile.type === 'water' ? 0.06 : tile.type === 'trench' ? 0.06 : 0.18 + elev * 0.1) : 0.18;
        const y = getTileY(elev) + height / 2 + 0.01;
        return (
          <group key={`path-${i}`} position={[pos.x, y, pos.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.1, 6]} />
              <meshBasicMaterial color="#22bbff" transparent opacity={0.5 - i * 0.04} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Main GridTiles ──
export function GridTiles({ grid, movableTiles, attackableTiles, abilityTargetTiles, shrinkLevel, movePath, onTileClick, onTileHover }: GridTilesProps) {
  const lootTiles = useMemo(() => grid.flat().filter(t => t.loot !== null), [grid]);

  // Pre-compute lookup sets for O(1) checks instead of O(n) .some()
  const movableSet = useMemo(() => new Set(movableTiles.map(t => `${t.x},${t.z}`)), [movableTiles]);
  const attackableSet = useMemo(() => new Set(attackableTiles.map(t => `${t.x},${t.z}`)), [attackableTiles]);
  const abilitySet = useMemo(() => new Set(abilityTargetTiles.map(t => `${t.x},${t.z}`)), [abilityTargetTiles]);
  const pathSet = useMemo(() => new Set(movePath ? movePath.map(p => `${p.x},${p.z}`) : []), [movePath]);

  return (
    <group>
      {/* Ground plane */}
      <mesh position={[GRID_SIZE / 2 - 0.5, -0.12, GRID_SIZE / 2 - 0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GRID_SIZE + 20, GRID_SIZE + 20]} />
        <meshStandardMaterial color="#1a2a14" roughness={1} />
      </mesh>
      {grid.map((row, x) => row.map((tile, z) => {
        const key = `${x},${z}`;
        return (
          <Tile
            key={`t-${x}-${z}`} tile={tile}
            isMovable={movableSet.has(key)}
            isAttackable={attackableSet.has(key)}
            isAbilityTarget={abilitySet.has(key)}
            isOutOfZone={!isInZone(x, z, shrinkLevel) && shrinkLevel > 0}
            isOnPath={pathSet.has(key)}
            hasSmoke={tile.hasSmoke}
            onClick={() => onTileClick({ x, z })}
            onHover={(hover) => onTileHover(hover ? { x, z } : null)}
          />
        );
      }))}
      {grid.flat().filter(t => t.prop).map(tile => (
        <PropObject key={`p-${tile.x}-${tile.z}`} tile={tile} />
      ))}
      {lootTiles.map(tile => (
        <LootObject key={`l-${tile.x}-${tile.z}`} tile={tile} />
      ))}
      {movePath && <PathMarkers path={movePath} grid={grid} />}
    </group>
  );
}
