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

const TILE_COLORS: Record<string, string> = {
  grass: '#4a7a3a', dirt: '#8a7050', stone: '#6a6a72',
  water: '#2a5a8a', sand: '#b8a060', wall: '#5a5a62', trench: '#5a4a30',
};
const TILE_COLORS_ALT: Record<string, string> = {
  grass: '#3e6e30', dirt: '#7a6545', stone: '#606068',
  water: '#225080', sand: '#a89555', wall: '#505058', trench: '#4e4028',
};

// Get Y position for a tile based on elevation
export function getTileY(elevation: number): number {
  return elevation * 0.5;
}

function Tile({ tile, isMovable, isAttackable, isAbilityTarget, isOutOfZone, isOnPath, hasSmoke, onClick, onHover }: {
  tile: TileData; isMovable: boolean; isAttackable: boolean; isAbilityTarget: boolean;
  isOutOfZone: boolean; isOnPath: boolean; hasSmoke: boolean; onClick: () => void; onHover: (hover: boolean) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const useAlt = (tile.x + tile.z) % 2 === 0;
  let color = useAlt ? TILE_COLORS_ALT[tile.type] || '#4a7a3a' : TILE_COLORS[tile.type] || '#4a7a3a';
  let emissive = '#000000';
  let emissiveIntensity = 0;

  if (tile.type === 'water') { emissive = '#1144aa'; emissiveIntensity = 0.2; }
  if (isOutOfZone) { color = '#5a2020'; emissive = '#ff2222'; emissiveIntensity = 0.15; }
  if (isMovable) { emissive = '#22aaff'; emissiveIntensity = 0.5; }
  if (isOnPath) { emissive = '#44ddff'; emissiveIntensity = 0.7; }
  if (isAttackable) { emissive = '#ff4444'; emissiveIntensity = 0.6; }
  if (isAbilityTarget) { emissive = '#ffaa00'; emissiveIntensity = 0.5; }

  const tileY = getTileY(tile.elevation);
  const isTrench = tile.type === 'trench';
  const height = tile.type === 'water' ? 0.08 : isTrench ? 0.08 : 0.15 + tile.elevation * 0.12;

  return (
    <group>
      <mesh
        ref={ref}
        position={[tile.x, tileY, tile.z]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
          if (ref.current) (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity + 0.2;
        }}
        onPointerOut={() => {
          onHover(false);
          if (ref.current) (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
        }}
      >
        <boxGeometry args={[0.96, height, 0.96]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.85} />
      </mesh>
      {/* Side fill for elevated tiles - makes hills look solid */}
      {tile.elevation > 0.2 && tile.type !== 'water' && (
        <mesh position={[tile.x, tileY / 2, tile.z]}>
          <boxGeometry args={[0.96, tileY, 0.96]} />
          <meshStandardMaterial color={useAlt ? '#3a5a28' : '#2e4e20'} roughness={0.95} />
        </mesh>
      )}
      {hasSmoke && (
        <mesh position={[tile.x, tileY + 0.4, tile.z]}>
          <sphereGeometry args={[0.4, 6, 5]} />
          <meshBasicMaterial color="#aabbcc" transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}

function PropObject({ tile }: { tile: TileData }) {
  if (!tile.prop) return null;
  const baseY = getTileY(tile.elevation) + 0.08;

  switch (tile.prop) {
    case 'crate':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.18, 0]}><boxGeometry args={[0.5, 0.35, 0.4]} /><meshStandardMaterial color="#5a4a2a" roughness={0.95} /></mesh>
          <mesh position={[0, 0.18, 0.201]}><boxGeometry args={[0.52, 0.04, 0.01]} /><meshStandardMaterial color="#3a3a3a" metalness={0.6} roughness={0.4} /></mesh>
          <mesh position={[0, 0.28, 0.201]}><boxGeometry args={[0.52, 0.04, 0.01]} /><meshStandardMaterial color="#3a3a3a" metalness={0.6} roughness={0.4} /></mesh>
          <mesh position={[0, 0.35, 0.201]}><boxGeometry args={[0.08, 0.06, 0.02]} /><meshStandardMaterial color="#8a7a3a" metalness={0.8} roughness={0.3} /></mesh>
        </group>
      );
    case 'barrel':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.2, 0.22, 0.5, 8]} /><meshStandardMaterial color="#3a5a3a" roughness={0.6} metalness={0.4} /></mesh>
          <mesh position={[0, 0.48, 0]}><cylinderGeometry args={[0.21, 0.21, 0.03, 8]} /><meshStandardMaterial color="#2a3a2a" metalness={0.7} roughness={0.3} /></mesh>
          <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.23, 0.23, 0.03, 8]} /><meshStandardMaterial color="#2a3a2a" metalness={0.7} roughness={0.3} /></mesh>
        </group>
      );
    case 'sandbag':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          {/* Thick sandbag wall - strong full cover */}
          <mesh position={[-0.2, 0.09, 0]}><boxGeometry args={[0.28, 0.16, 0.3]} /><meshStandardMaterial color="#b0a070" roughness={1} /></mesh>
          <mesh position={[0.2, 0.09, 0]}><boxGeometry args={[0.28, 0.16, 0.3]} /><meshStandardMaterial color="#a89565" roughness={1} /></mesh>
          <mesh position={[0, 0.09, -0.25]}><boxGeometry args={[0.28, 0.16, 0.22]} /><meshStandardMaterial color="#a89060" roughness={1} /></mesh>
          {/* Second row */}
          <mesh position={[-0.1, 0.24, 0]}><boxGeometry args={[0.32, 0.14, 0.28]} /><meshStandardMaterial color="#a89060" roughness={1} /></mesh>
          <mesh position={[0.15, 0.24, 0]}><boxGeometry args={[0.28, 0.14, 0.28]} /><meshStandardMaterial color="#b5a575" roughness={1} /></mesh>
          {/* Top row */}
          <mesh position={[0, 0.36, 0]}><boxGeometry args={[0.35, 0.10, 0.26]} /><meshStandardMaterial color="#b5a575" roughness={1} /></mesh>
        </group>
      );
    case 'rock':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.18, 0]} rotation={[0.1, tile.variant * 0.8, 0.05]}>
            <dodecahedronGeometry args={[0.3, 1]} /><meshStandardMaterial color="#5a5a5e" roughness={0.95} />
          </mesh>
          <mesh position={[0.2, 0.08, 0.15]} rotation={[0, 0.5, 0]}>
            <dodecahedronGeometry args={[0.12, 0]} /><meshStandardMaterial color="#4a4a4e" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'bush':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.15, 0]}><sphereGeometry args={[0.22, 5, 4]} /><meshStandardMaterial color="#2e5a1e" roughness={0.95} /></mesh>
          <mesh position={[0.12, 0.1, 0.08]}><sphereGeometry args={[0.15, 4, 3]} /><meshStandardMaterial color="#264e18" roughness={0.95} /></mesh>
          <mesh position={[-0.08, 0.12, -0.06]}><sphereGeometry args={[0.12, 4, 3]} /><meshStandardMaterial color="#325a22" roughness={0.95} /></mesh>
        </group>
      );
    case 'tree':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.06, 0.08, 0.6, 6]} /><meshStandardMaterial color="#4a3018" roughness={0.95} /></mesh>
          <mesh position={[0, 0.65, 0]}><coneGeometry args={[0.4, 0.5, 6]} /><meshStandardMaterial color="#1a4a0e" roughness={0.9} /></mesh>
          <mesh position={[0, 0.9, 0]}><coneGeometry args={[0.3, 0.4, 6]} /><meshStandardMaterial color="#225a16" roughness={0.9} /></mesh>
          <mesh position={[0, 1.1, 0]}><coneGeometry args={[0.18, 0.3, 6]} /><meshStandardMaterial color="#2a6a1e" roughness={0.9} /></mesh>
        </group>
      );
    case 'ruins':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[-0.2, 0.25, -0.2]}><boxGeometry args={[0.1, 0.5, 0.1]} /><meshStandardMaterial color="#6a6a6e" roughness={0.95} /></mesh>
          <mesh position={[0.2, 0.15, 0.15]}><boxGeometry args={[0.12, 0.3, 0.12]} /><meshStandardMaterial color="#5a5a5e" roughness={0.95} /></mesh>
          <mesh position={[0, 0.06, 0]}><boxGeometry args={[0.6, 0.1, 0.6]} /><meshStandardMaterial color="#4a4a4e" roughness={0.95} /></mesh>
          <mesh position={[-0.2, 0.5, -0.2]} rotation={[0, 0, 0.3]}><cylinderGeometry args={[0.015, 0.015, 0.2, 4]} /><meshStandardMaterial color="#8a4a2a" metalness={0.5} roughness={0.6} /></mesh>
          <mesh position={[0, 0.18, -0.25]}><boxGeometry args={[0.5, 0.25, 0.08]} /><meshStandardMaterial color="#5e5e62" roughness={0.95} /></mesh>
        </group>
      );

    // ═══ NEW WARZONE PROPS ═══

    case 'wire':
      // Concertina wire coils — half cover, not blocked (units can move through but take penalty)
      return (
        <group position={[tile.x, baseY, tile.z]}>
          {/* Wire coil 1 */}
          <mesh position={[-0.15, 0.12, 0]} rotation={[0, 0.3, Math.PI / 2]}>
            <torusGeometry args={[0.12, 0.018, 6, 12]} /><meshStandardMaterial color="#6a6a6a" metalness={0.7} roughness={0.4} />
          </mesh>
          {/* Wire coil 2 */}
          <mesh position={[0.1, 0.14, 0.05]} rotation={[0.2, -0.4, Math.PI / 2]}>
            <torusGeometry args={[0.14, 0.015, 6, 12]} /><meshStandardMaterial color="#7a7a7a" metalness={0.7} roughness={0.4} />
          </mesh>
          {/* Wire coil 3 */}
          <mesh position={[0, 0.1, -0.1]} rotation={[0.4, 0.1, Math.PI / 2]}>
            <torusGeometry args={[0.1, 0.02, 6, 10]} /><meshStandardMaterial color="#5a5a5a" metalness={0.7} roughness={0.4} />
          </mesh>
          {/* Support posts */}
          <mesh position={[-0.3, 0.15, 0]}><cylinderGeometry args={[0.02, 0.02, 0.3, 4]} /><meshStandardMaterial color="#4a3a2a" roughness={0.9} /></mesh>
          <mesh position={[0.3, 0.15, 0]}><cylinderGeometry args={[0.02, 0.02, 0.3, 4]} /><meshStandardMaterial color="#4a3a2a" roughness={0.9} /></mesh>
        </group>
      );

    case 'jersey_barrier':
      // Concrete jersey barrier — full cover, blocked
      return (
        <group position={[tile.x, baseY, tile.z]}>
          {/* Main barrier body — tapered concrete shape */}
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.7, 0.4, 0.28]} /><meshStandardMaterial color="#8a8a88" roughness={0.95} />
          </mesh>
          {/* Tapered base */}
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[0.8, 0.06, 0.4]} /><meshStandardMaterial color="#7a7a78" roughness={0.95} />
          </mesh>
          {/* Wear/damage marks */}
          <mesh position={[0.15, 0.25, 0.141]}>
            <boxGeometry args={[0.12, 0.08, 0.005]} /><meshStandardMaterial color="#6a6a68" roughness={1} />
          </mesh>
          <mesh position={[-0.2, 0.15, 0.141]}>
            <boxGeometry args={[0.08, 0.06, 0.005]} /><meshStandardMaterial color="#5a5a58" roughness={1} />
          </mesh>
        </group>
      );

    case 'burnt_vehicle':
      // Destroyed military vehicle wreck — full cover, blocked
      return (
        <group position={[tile.x, baseY, tile.z]}>
          {/* Chassis */}
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[0.8, 0.18, 0.45]} /><meshStandardMaterial color="#2a2a28" roughness={0.9} metalness={0.3} />
          </mesh>
          {/* Cabin/turret remnant */}
          <mesh position={[-0.05, 0.3, 0]}>
            <boxGeometry args={[0.4, 0.2, 0.35]} /><meshStandardMaterial color="#1a1a18" roughness={0.85} metalness={0.4} />
          </mesh>
          {/* Wheels */}
          <mesh position={[-0.3, 0.06, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.06, 8]} /><meshStandardMaterial color="#1a1a1a" roughness={0.95} />
          </mesh>
          <mesh position={[0.3, 0.06, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.06, 8]} /><meshStandardMaterial color="#1a1a1a" roughness={0.95} />
          </mesh>
          <mesh position={[0.3, 0.06, -0.22]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.08, 0.06, 8]} /><meshStandardMaterial color="#1a1a1a" roughness={0.95} />
          </mesh>
          {/* Fire/scorch marks */}
          <mesh position={[0.1, 0.22, 0.23]}>
            <boxGeometry args={[0.2, 0.1, 0.01]} /><meshStandardMaterial color="#3a2010" roughness={1} />
          </mesh>
          {/* Bent barrel/pipe */}
          <mesh position={[0.2, 0.35, 0]} rotation={[0, 0, -0.4]}>
            <cylinderGeometry args={[0.025, 0.02, 0.3, 6]} /><meshStandardMaterial color="#3a3a38" metalness={0.6} roughness={0.5} />
          </mesh>
        </group>
      );

    case 'foxhole':
      // Dug-in fighting position — half cover, not blocked (unit can stand in it)
      return (
        <group position={[tile.x, baseY - 0.1, tile.z]}>
          {/* Dirt ring around hole */}
          <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.2, 0.4, 8]} /><meshStandardMaterial color="#6a5a3a" roughness={1} side={THREE.DoubleSide} />
          </mesh>
          {/* Dirt mound edges */}
          <mesh position={[0.3, 0.06, 0]}><boxGeometry args={[0.15, 0.1, 0.3]} /><meshStandardMaterial color="#7a6a4a" roughness={1} /></mesh>
          <mesh position={[-0.3, 0.06, 0]}><boxGeometry args={[0.15, 0.1, 0.3]} /><meshStandardMaterial color="#6a5a3a" roughness={1} /></mesh>
          <mesh position={[0, 0.06, 0.3]}><boxGeometry args={[0.3, 0.1, 0.15]} /><meshStandardMaterial color="#7a6a4a" roughness={1} /></mesh>
          {/* Small sandbag on edge */}
          <mesh position={[0.25, 0.12, 0.2]}><boxGeometry args={[0.15, 0.08, 0.1]} /><meshStandardMaterial color="#a89060" roughness={1} /></mesh>
        </group>
      );

    case 'hesco':
      // HESCO bastion (military blast wall) — full cover, blocked
      return (
        <group position={[tile.x, baseY, tile.z]}>
          {/* Main HESCO cube */}
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[0.55, 0.5, 0.55]} /><meshStandardMaterial color="#a89565" roughness={0.95} />
          </mesh>
          {/* Wire mesh exterior */}
          <mesh position={[0, 0.25, 0.276]}>
            <boxGeometry args={[0.56, 0.51, 0.005]} /><meshStandardMaterial color="#7a7a78" metalness={0.5} roughness={0.6} wireframe />
          </mesh>
          <mesh position={[0.276, 0.25, 0]}>
            <boxGeometry args={[0.005, 0.51, 0.56]} /><meshStandardMaterial color="#7a7a78" metalness={0.5} roughness={0.6} wireframe />
          </mesh>
          {/* Dirt fill visible on top */}
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.5, 0.02, 0.5]} /><meshStandardMaterial color="#6a5a3a" roughness={1} />
          </mesh>
        </group>
      );

    case 'tank_trap':
      // Czech hedgehog anti-tank obstacle — half cover, blocked
      return (
        <group position={[tile.x, baseY, tile.z]}>
          {/* Three crossed I-beams */}
          <mesh position={[0, 0.18, 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.06, 0.5, 0.06]} /><meshStandardMaterial color="#5a4a3a" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 4, 0, 0]}>
            <boxGeometry args={[0.06, 0.5, 0.06]} /><meshStandardMaterial color="#4a3a2a" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.18, 0]} rotation={[0, Math.PI / 4, Math.PI / 4]}>
            <boxGeometry args={[0.06, 0.5, 0.06]} /><meshStandardMaterial color="#5a4a3a" metalness={0.6} roughness={0.5} />
          </mesh>
          {/* Rust spots */}
          <mesh position={[0.08, 0.28, 0.08]}>
            <sphereGeometry args={[0.03, 4, 3]} /><meshStandardMaterial color="#8a4a1a" roughness={1} />
          </mesh>
        </group>
      );

    default: return null;
  }
}

// Loot item floating on tile
function LootObject({ tile }: { tile: TileData }) {
  const ref = useRef<THREE.Group>(null);
  const baseY = getTileY(tile.elevation) + 0.15;

  useFrame(({ clock }) => {
    if (!ref.current || !tile.loot) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = baseY + 0.15 + Math.sin(t * 2 + tile.x * 0.7 + tile.z * 1.3) * 0.08;
    ref.current.rotation.y = t * 1.5 + tile.x;
  });

  if (!tile.loot) return null;

  const color = tile.loot.type === 'weapon' ? '#ffaa22' :
                tile.loot.type === 'medkit' ? '#ff4466' :
                tile.loot.type === 'armor' ? '#4488ff' :
                tile.loot.type === 'killstreak' ? '#cc44ff' :
                '#88cc44';

  const glowColor = tile.loot.type === 'weapon' ? '#ffcc44' :
                    tile.loot.type === 'medkit' ? '#ff6688' :
                    tile.loot.type === 'armor' ? '#66aaff' :
                    tile.loot.type === 'killstreak' ? '#ee88ff' :
                    '#aaee66';

  return (
    <group ref={ref} position={[tile.x, baseY + 0.15, tile.z]}>
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.35, 12]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.5} metalness={0.3} />
      </mesh>
      <pointLight color={glowColor} intensity={0.8} distance={2.5} />
      <Billboard position={[0, 0.3, 0]}>
        <Text fontSize={0.08} color={glowColor} anchorX="center" anchorY="middle" font={undefined}
          outlineWidth={0.015} outlineColor="#000000">
          {tile.loot.icon} {tile.loot.name}
        </Text>
      </Billboard>
    </group>
  );
}

// Path marker dots showing the movement trail
function PathMarkers({ path, grid }: { path: Position[]; grid: TileData[][] }) {
  return (
    <group>
      {path.map((pos, i) => {
        const elev = grid[pos.x]?.[pos.z]?.elevation || 0;
        const y = getTileY(elev) + 0.15;
        return (
          <group key={`path-${i}`} position={[pos.x, y, pos.z]}>
            {/* Glowing path dot */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.12, 8]} />
              <meshBasicMaterial color="#44ddff" transparent opacity={0.6 - i * 0.05} />
            </mesh>
            {/* Chevron arrow toward next tile */}
            {i < path.length - 1 && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <ringGeometry args={[0.06, 0.1, 8]} />
                <meshBasicMaterial color="#88eeff" transparent opacity={0.4} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function GrassTuft({ x, z, elevation }: { x: number; z: number; elevation: number }) {
  const y = getTileY(elevation) + 0.08;
  return (
    <group position={[x, y, z]}>
      <mesh position={[0.15, 0.06, 0.1]} rotation={[0.1, 0.5, 0.15]}>
        <boxGeometry args={[0.04, 0.12, 0.02]} /><meshStandardMaterial color="#5a9a3a" />
      </mesh>
      <mesh position={[-0.12, 0.05, -0.15]} rotation={[-0.1, -0.3, -0.1]}>
        <boxGeometry args={[0.03, 0.10, 0.02]} /><meshStandardMaterial color="#4a8a2e" />
      </mesh>
    </group>
  );
}

export function GridTiles({ grid, movableTiles, attackableTiles, abilityTargetTiles, shrinkLevel, movePath, onTileClick, onTileHover }: GridTilesProps) {
  const grassPositions = useMemo(() => {
    const positions: { x: number; z: number; elevation: number }[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (grid[x][z].type === 'grass' && !grid[x][z].prop && grid[x][z].variant === 0) {
          positions.push({ x, z, elevation: grid[x][z].elevation });
        }
      }
    }
    return positions;
  }, [grid]);

  const lootTiles = useMemo(() => {
    return grid.flat().filter(t => t.loot !== null);
  }, [grid]);

  return (
    <group>
      {/* Ground plane */}
      <mesh position={[GRID_SIZE / 2 - 0.5, -0.1, GRID_SIZE / 2 - 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID_SIZE + 20, GRID_SIZE + 20]} /><meshStandardMaterial color="#1a3012" roughness={1} />
      </mesh>
      {grid.map((row, x) => row.map((tile, z) => (
        <Tile
          key={`t-${x}-${z}`} tile={tile}
          isMovable={movableTiles.some(t => t.x === x && t.z === z)}
          isAttackable={attackableTiles.some(t => t.x === x && t.z === z)}
          isAbilityTarget={abilityTargetTiles.some(t => t.x === x && t.z === z)}
          isOutOfZone={!isInZone(x, z, shrinkLevel) && shrinkLevel > 0}
          isOnPath={movePath ? movePath.some(p => p.x === x && p.z === z) : false}
          hasSmoke={tile.hasSmoke}
          onClick={() => onTileClick({ x, z })}
          onHover={(hover) => onTileHover(hover ? { x, z } : null)}
        />
      )))}
      {grid.flat().filter(t => t.prop).map(tile => (
        <PropObject key={`p-${tile.x}-${tile.z}`} tile={tile} />
      ))}
      {lootTiles.map(tile => (
        <LootObject key={`l-${tile.x}-${tile.z}`} tile={tile} />
      ))}
      {grassPositions.map((pos, i) => (
        <GrassTuft key={`g-${i}`} x={pos.x} z={pos.z} elevation={pos.elevation} />
      ))}
      {movePath && <PathMarkers path={movePath} grid={grid} />}
    </group>
  );
}
