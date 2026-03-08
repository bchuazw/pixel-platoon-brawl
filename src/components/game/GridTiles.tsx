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

// ── FFT-style color palette — vivid, warm, painterly ──
const TILE_COLORS: Record<string, { top: string; side: string; topAlt: string }> = {
  grass:  { top: '#5a9e3e', side: '#3d6e28', topAlt: '#4e8c35' },
  dirt:   { top: '#b89060', side: '#8a6840', topAlt: '#a88555' },
  stone:  { top: '#8a8a92', side: '#5e5e66', topAlt: '#7e7e88' },
  water:  { top: '#3388bb', side: '#1a5580', topAlt: '#2e7aaa' },
  sand:   { top: '#d4b870', side: '#a89050', topAlt: '#c8ac65' },
  wall:   { top: '#6e6e78', side: '#4a4a52', topAlt: '#626270' },
  trench: { top: '#6a5a3a', side: '#4a3e28', topAlt: '#5e5030' },
};

// Quantize elevation to discrete FFT-style steps
function quantizeElevation(elev: number): number {
  return Math.round(elev * 2.5) / 2.5; // steps of 0.4
}

export function getTileY(elevation: number): number {
  return quantizeElevation(elevation) * 0.6;
}

const TILE_GAP = 0.94;
const BASE_HEIGHT = 0.25;

// ── FFT-style Tile — thick blocky tiles with visible sides ──
function Tile({ tile, isMovable, isAttackable, isAbilityTarget, isOutOfZone, isOnPath, hasSmoke, onClick, onHover }: {
  tile: TileData; isMovable: boolean; isAttackable: boolean; isAbilityTarget: boolean;
  isOutOfZone: boolean; isOnPath: boolean; hasSmoke: boolean; onClick: () => void; onHover: (hover: boolean) => void;
}) {
  const topRef = useRef<THREE.Mesh>(null);
  const useAlt = (tile.x + tile.z) % 2 === 0;
  const colors = TILE_COLORS[tile.type] || TILE_COLORS.grass;
  const topColor = useAlt ? colors.topAlt : colors.top;
  const sideColor = colors.side;

  let emissive = '#000000';
  let emissiveIntensity = 0;

  if (tile.type === 'water') { emissive = '#1166aa'; emissiveIntensity = 0.2; }
  if (isOutOfZone) { emissive = '#cc2222'; emissiveIntensity = 0.3; }
  if (isMovable) { emissive = '#2299ff'; emissiveIntensity = 0.4; }
  if (isOnPath) { emissive = '#44ddff'; emissiveIntensity = 0.6; }
  if (isAttackable) { emissive = '#ff3333'; emissiveIntensity = 0.5; }
  if (isAbilityTarget) { emissive = '#ffaa00'; emissiveIntensity = 0.45; }

  const qElev = quantizeElevation(tile.elevation);
  const tileY = qElev * 0.6;
  const isWater = tile.type === 'water';
  const isTrench = tile.type === 'trench';

  // FFT: all tiles are thick blocks. Height = base + elevation contribution
  const totalHeight = isWater ? 0.08 : isTrench ? 0.12 : BASE_HEIGHT;
  // The side column extends from y=0 up to tileY
  const sideHeight = tileY + totalHeight;

  return (
    <group>
      {/* Top face — the actual tile surface */}
      <mesh
        ref={topRef}
        position={[tile.x, tileY + totalHeight / 2, tile.z]}
        receiveShadow
        castShadow
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
          if (topRef.current) {
            const mat = topRef.current.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = emissiveIntensity + 0.2;
          }
        }}
        onPointerOut={() => {
          onHover(false);
          if (topRef.current) {
            const mat = topRef.current.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = emissiveIntensity;
          }
        }}
      >
        <boxGeometry args={[TILE_GAP, totalHeight, TILE_GAP]} />
        <meshStandardMaterial
          color={isOutOfZone ? '#5a2020' : topColor}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.85}
          metalness={0.02}
        />
      </mesh>

      {/* Side column — fills from ground up to tile, giving FFT blocky look */}
      {tileY > 0.05 && !isWater && (
        <mesh position={[tile.x, tileY / 2, tile.z]} castShadow receiveShadow>
          <boxGeometry args={[TILE_GAP, tileY, TILE_GAP]} />
          <meshStandardMaterial color={sideColor} roughness={0.92} metalness={0.01} />
        </mesh>
      )}

      {/* Tile edge highlight — subtle grid lines on top */}
      <mesh
        position={[tile.x, tileY + totalHeight + 0.002, tile.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[TILE_GAP, TILE_GAP]} />
        <meshBasicMaterial
          color={emissiveIntensity > 0 ? emissive : '#ffffff'}
          transparent
          opacity={emissiveIntensity > 0 ? 0.15 : 0.02}
          wireframe
        />
      </mesh>

      {/* Water shimmer effect */}
      {isWater && (
        <WaterShimmer x={tile.x} z={tile.z} y={tileY + totalHeight + 0.01} />
      )}

      {/* Smoke */}
      {hasSmoke && (
        <SmokeCloud x={tile.x} z={tile.z} y={tileY + 0.5} />
      )}
    </group>
  );
}

// ── Animated water ──
function WaterShimmer({ x, z, y }: { x: number; z: number; y: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.15 + Math.sin(t * 2 + x * 1.3 + z * 0.7) * 0.08;
    ref.current.position.y = y + Math.sin(t * 1.5 + x + z * 0.8) * 0.01;
  });
  return (
    <mesh ref={ref} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[TILE_GAP, TILE_GAP]} />
      <meshBasicMaterial color="#66ccff" transparent opacity={0.15} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

// ── Smoke cloud ──
function SmokeCloud({ x, z, y }: { x: number; z: number; y: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = y + Math.sin(t * 0.8) * 0.05;
    ref.current.rotation.y = t * 0.2;
  });
  return (
    <group ref={ref} position={[x, y, z]}>
      <mesh><sphereGeometry args={[0.35, 6, 5]} /><meshBasicMaterial color="#99aabb" transparent opacity={0.25} depthWrite={false} /></mesh>
      <mesh position={[0.15, 0.1, 0.1]}><sphereGeometry args={[0.25, 5, 4]} /><meshBasicMaterial color="#889aaa" transparent opacity={0.2} depthWrite={false} /></mesh>
    </group>
  );
}

// ── FFT-style Props — chunkier, more geometric ──
function PropObject({ tile }: { tile: TileData }) {
  if (!tile.prop) return null;
  const qElev = quantizeElevation(tile.elevation);
  const baseY = qElev * 0.6 + BASE_HEIGHT;

  switch (tile.prop) {
    case 'crate':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.18, 0]} castShadow>
            <boxGeometry args={[0.42, 0.36, 0.42]} />
            <meshStandardMaterial color="#8a6a38" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.18, 0.211]}>
            <boxGeometry args={[0.44, 0.06, 0.005]} />
            <meshStandardMaterial color="#555550" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      );
    case 'barrel':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.2, 0.44, 8]} />
            <meshStandardMaterial color="#4a6848" roughness={0.7} metalness={0.2} />
          </mesh>
        </group>
      );
    case 'sandbag':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[0.6, 0.22, 0.38]} />
            <meshStandardMaterial color="#c4a870" roughness={1} />
          </mesh>
          <mesh position={[0, 0.28, 0]} castShadow>
            <boxGeometry args={[0.52, 0.16, 0.34]} />
            <meshStandardMaterial color="#b89a62" roughness={1} />
          </mesh>
        </group>
      );
    case 'rock':
      return (
        <mesh position={[tile.x, baseY + 0.18, tile.z]} rotation={[0.1, tile.variant * 0.8, 0.05]} castShadow>
          <dodecahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color="#777780" roughness={0.95} />
        </mesh>
      );
    case 'bush':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.16, 0]} castShadow>
            <sphereGeometry args={[0.28, 6, 5]} />
            <meshStandardMaterial color="#3a7828" roughness={0.95} />
          </mesh>
          <mesh position={[0.12, 0.1, 0.08]}>
            <sphereGeometry args={[0.18, 5, 4]} />
            <meshStandardMaterial color="#2e6420" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'tree':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          {/* Trunk */}
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.6, 6]} />
            <meshStandardMaterial color="#5a3818" roughness={0.95} />
          </mesh>
          {/* Canopy - FFT style layered cones */}
          <mesh position={[0, 0.65, 0]} castShadow>
            <coneGeometry args={[0.4, 0.5, 6]} />
            <meshStandardMaterial color="#2a6818" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.92, 0]} castShadow>
            <coneGeometry args={[0.3, 0.4, 6]} />
            <meshStandardMaterial color="#348a20" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.15, 0]}>
            <coneGeometry args={[0.2, 0.3, 5]} />
            <meshStandardMaterial color="#3a9828" roughness={0.9} />
          </mesh>
        </group>
      );
    case 'ruins':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <boxGeometry args={[0.6, 0.12, 0.6]} />
            <meshStandardMaterial color="#6a6a70" roughness={0.95} />
          </mesh>
          <mesh position={[-0.2, 0.3, -0.2]} castShadow>
            <boxGeometry args={[0.12, 0.5, 0.12]} />
            <meshStandardMaterial color="#7a7a80" roughness={0.95} />
          </mesh>
          <mesh position={[0.2, 0.18, 0.15]} castShadow>
            <boxGeometry args={[0.12, 0.25, 0.12]} />
            <meshStandardMaterial color="#686870" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'jersey_barrier':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <boxGeometry args={[0.65, 0.4, 0.28]} />
            <meshStandardMaterial color="#9a9a98" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'burnt_vehicle':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[0.75, 0.2, 0.44]} />
            <meshStandardMaterial color="#2a2a28" roughness={0.9} metalness={0.2} />
          </mesh>
          <mesh position={[-0.04, 0.3, 0]} castShadow>
            <boxGeometry args={[0.38, 0.2, 0.36]} />
            <meshStandardMaterial color="#222220" roughness={0.85} metalness={0.3} />
          </mesh>
        </group>
      );
    case 'wire':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[-0.3, 0.15, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.3, 4]} />
            <meshStandardMaterial color="#5a4a30" roughness={0.9} />
          </mesh>
          <mesh position={[0.3, 0.15, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.3, 4]} />
            <meshStandardMaterial color="#5a4a30" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.14, 0]} rotation={[0, 0.3, Math.PI / 2]}>
            <torusGeometry args={[0.14, 0.018, 5, 10]} />
            <meshStandardMaterial color="#7a7a78" metalness={0.5} roughness={0.5} />
          </mesh>
        </group>
      );
    case 'foxhole':
      return (
        <group position={[tile.x, baseY - 0.08, tile.z]}>
          <mesh position={[0.3, 0.06, 0]} castShadow>
            <boxGeometry args={[0.14, 0.12, 0.3]} />
            <meshStandardMaterial color="#7a6a42" roughness={1} />
          </mesh>
          <mesh position={[-0.3, 0.06, 0]} castShadow>
            <boxGeometry args={[0.14, 0.12, 0.3]} />
            <meshStandardMaterial color="#6a5a38" roughness={1} />
          </mesh>
        </group>
      );
    case 'hesco':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[0.52, 0.5, 0.52]} />
            <meshStandardMaterial color="#b49a60" roughness={0.95} />
          </mesh>
        </group>
      );
    case 'tank_trap':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
            <boxGeometry args={[0.06, 0.5, 0.06]} />
            <meshStandardMaterial color="#5a4a32" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 4, 0, 0]}>
            <boxGeometry args={[0.06, 0.5, 0.06]} />
            <meshStandardMaterial color="#4a3a22" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      );
    default: return null;
  }
}

// ── Loot pickup — floating and glowing ──
function LootObject({ tile }: { tile: TileData }) {
  const ref = useRef<THREE.Group>(null);
  const qElev = quantizeElevation(tile.elevation);
  const baseY = qElev * 0.6 + BASE_HEIGHT + 0.2;

  useFrame(({ clock }) => {
    if (!ref.current || !tile.loot) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = baseY + 0.15 + Math.sin(t * 2.5 + tile.x * 0.7 + tile.z * 1.3) * 0.08;
    ref.current.rotation.y = t * 1.5 + tile.x;
  });

  if (!tile.loot) return null;

  const color = tile.loot.type === 'weapon' ? '#ffaa22' :
                tile.loot.type === 'medkit' ? '#ff3366' :
                tile.loot.type === 'armor' ? '#3388ff' :
                tile.loot.type === 'killstreak' ? '#bb44ff' : '#66cc33';

  return (
    <group ref={ref} position={[tile.x, baseY + 0.15, tile.z]}>
      <mesh>
        <boxGeometry args={[0.24, 0.24, 0.24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.3} metalness={0.2} />
      </mesh>
      <pointLight color={color} intensity={0.8} distance={2.5} />
      <Billboard position={[0, 0.32, 0]}>
        <Text fontSize={0.08} color={color} anchorX="center" anchorY="middle" font={undefined}
          outlineWidth={0.014} outlineColor="#000000">
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
        const y = qElev * 0.6 + BASE_HEIGHT + 0.01;
        return (
          <group key={`path-${i}`} position={[pos.x, y, pos.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.12, 8]} />
              <meshBasicMaterial color="#44ddff" transparent opacity={0.55 - i * 0.04} />
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

  const movableSet = useMemo(() => new Set(movableTiles.map(t => `${t.x},${t.z}`)), [movableTiles]);
  const attackableSet = useMemo(() => new Set(attackableTiles.map(t => `${t.x},${t.z}`)), [attackableTiles]);
  const abilitySet = useMemo(() => new Set(abilityTargetTiles.map(t => `${t.x},${t.z}`)), [abilityTargetTiles]);
  const pathSet = useMemo(() => new Set(movePath ? movePath.map(p => `${p.x},${p.z}`) : []), [movePath]);

  return (
    <group>
      {/* Base ground plane — dark earth below the map */}
      <mesh position={[GRID_SIZE / 2 - 0.5, -0.5, GRID_SIZE / 2 - 0.5]} receiveShadow>
        <boxGeometry args={[GRID_SIZE + 6, 1, GRID_SIZE + 6]} />
        <meshStandardMaterial color="#2a3a1e" roughness={1} />
      </mesh>

      {/* Tiles */}
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

      {/* Props */}
      {grid.flat().filter(t => t.prop).map(tile => (
        <PropObject key={`p-${tile.x}-${tile.z}`} tile={tile} />
      ))}

      {/* Loot */}
      {lootTiles.map(tile => (
        <LootObject key={`l-${tile.x}-${tile.z}`} tile={tile} />
      ))}

      {/* Move path */}
      {movePath && <PathMarkers path={movePath} grid={grid} />}
    </group>
  );
}
