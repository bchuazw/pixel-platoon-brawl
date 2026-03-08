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
  onTileClick: (pos: Position) => void;
  onTileHover: (pos: Position | null) => void;
}

const TILE_COLORS: Record<string, string> = {
  grass: '#4a7a3a', dirt: '#8a7050', stone: '#6a6a72',
  water: '#2a5a8a', sand: '#b8a060', wall: '#5a5a62',
};
const TILE_COLORS_ALT: Record<string, string> = {
  grass: '#3e6e30', dirt: '#7a6545', stone: '#606068',
  water: '#225080', sand: '#a89555', wall: '#505058',
};

function Tile({ tile, isMovable, isAttackable, isAbilityTarget, isOutOfZone, hasSmoke, onClick, onHover }: {
  tile: TileData; isMovable: boolean; isAttackable: boolean; isAbilityTarget: boolean;
  isOutOfZone: boolean; hasSmoke: boolean; onClick: () => void; onHover: (hover: boolean) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const useAlt = (tile.x + tile.z) % 2 === 0;
  let color = useAlt ? TILE_COLORS_ALT[tile.type] || '#4a7a3a' : TILE_COLORS[tile.type] || '#4a7a3a';
  let emissive = '#000000';
  let emissiveIntensity = 0;

  if (tile.type === 'water') { emissive = '#1144aa'; emissiveIntensity = 0.2; }
  if (isOutOfZone) { color = '#5a2020'; emissive = '#ff2222'; emissiveIntensity = 0.15; }
  if (isMovable) { emissive = '#22aaff'; emissiveIntensity = 0.5; }
  if (isAttackable) { emissive = '#ff4444'; emissiveIntensity = 0.6; }
  if (isAbilityTarget) { emissive = '#ffaa00'; emissiveIntensity = 0.5; }

  const height = tile.type === 'water' ? 0.08 : 0.12 + tile.elevation * 0.3;

  return (
    <group>
      <mesh
        ref={ref}
        position={[tile.x, tile.elevation * 0.3 + height / 2 - 0.06, tile.z]}
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
      {hasSmoke && (
        <mesh position={[tile.x, 0.4, tile.z]}>
          <sphereGeometry args={[0.4, 6, 5]} />
          <meshBasicMaterial color="#aabbcc" transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}

function PropObject({ tile }: { tile: TileData }) {
  if (!tile.prop) return null;
  const baseY = tile.elevation * 0.3 + 0.06;

  switch (tile.prop) {
    case 'crate':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.55, 0.4, 0.55]} /><meshStandardMaterial color="#8a6a3a" roughness={0.9} /></mesh>
          <mesh position={[0, 0.2, 0.275]}><boxGeometry args={[0.4, 0.04, 0.02]} /><meshStandardMaterial color="#6a5030" /></mesh>
        </group>
      );
    case 'barrel':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.22, 0]}><cylinderGeometry args={[0.2, 0.22, 0.45, 8]} /><meshStandardMaterial color="#5a6a5a" roughness={0.7} metalness={0.3} /></mesh>
        </group>
      );
    case 'sandbag':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.1, 0]}><boxGeometry args={[0.6, 0.15, 0.3]} /><meshStandardMaterial color="#b0a070" roughness={1} /></mesh>
          <mesh position={[0, 0.22, 0]}><boxGeometry args={[0.55, 0.12, 0.28]} /><meshStandardMaterial color="#a89565" roughness={1} /></mesh>
        </group>
      );
    case 'rock':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.15, 0]} rotation={[0.1, tile.variant * 0.8, 0]}>
            <dodecahedronGeometry args={[0.25, 0]} /><meshStandardMaterial color="#6a6a6e" roughness={0.95} />
          </mesh>
          <mesh position={[0.15, 0.08, 0.12]}><dodecahedronGeometry args={[0.12, 0]} /><meshStandardMaterial color="#5a5a5e" roughness={0.95} /></mesh>
        </group>
      );
    case 'bush':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.18, 0]}><sphereGeometry args={[0.25, 6, 5]} /><meshStandardMaterial color="#3a7a2a" roughness={0.9} /></mesh>
          <mesh position={[0.1, 0.12, 0.1]}><sphereGeometry args={[0.15, 5, 4]} /><meshStandardMaterial color="#2e6e22" roughness={0.9} /></mesh>
        </group>
      );
    case 'tree':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.12, 0.5, 0.12]} /><meshStandardMaterial color="#5a3a1a" roughness={0.95} /></mesh>
          <mesh position={[0, 0.6, 0]}><coneGeometry args={[0.35, 0.4, 6]} /><meshStandardMaterial color="#2a6a1a" roughness={0.85} /></mesh>
          <mesh position={[0, 0.82, 0]}><coneGeometry args={[0.25, 0.35, 6]} /><meshStandardMaterial color="#3a7a2a" roughness={0.85} /></mesh>
        </group>
      );
    case 'ruins':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[-0.15, 0.2, -0.15]}><boxGeometry args={[0.12, 0.4, 0.12]} /><meshStandardMaterial color="#7a7a7e" roughness={0.95} /></mesh>
          <mesh position={[0.15, 0.12, 0.15]}><boxGeometry args={[0.15, 0.25, 0.15]} /><meshStandardMaterial color="#6a6a6e" roughness={0.95} /></mesh>
          <mesh position={[0, 0.08, 0]}><boxGeometry args={[0.6, 0.08, 0.6]} /><meshStandardMaterial color="#5a5a5e" roughness={0.95} /></mesh>
        </group>
      );
    default: return null;
  }
}

// Loot item floating on tile
function LootObject({ tile }: { tile: TileData }) {
  const ref = useRef<THREE.Group>(null);
  const baseY = tile.elevation * 0.3 + 0.15;

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
                '#88cc44';

  const glowColor = tile.loot.type === 'weapon' ? '#ffcc44' :
                    tile.loot.type === 'medkit' ? '#ff6688' :
                    tile.loot.type === 'armor' ? '#66aaff' :
                    '#aaee66';


  return (
    <group ref={ref} position={[tile.x, baseY + 0.15, tile.z]}>
      {/* Glow ring on ground */}
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.35, 12]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Item box */}
      <mesh>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.5} metalness={0.3} />
      </mesh>
      
      {/* Light beacon */}
      <pointLight color={glowColor} intensity={0.8} distance={2.5} />

      {/* Label */}
      <Billboard position={[0, 0.3, 0]}>
        <Text fontSize={0.08} color={glowColor} anchorX="center" anchorY="middle" font={undefined}
          outlineWidth={0.015} outlineColor="#000000">
          {tile.loot.icon} {tile.loot.name}
        </Text>
      </Billboard>
    </group>
  );
}

function GrassTuft({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.1, z]}>
      <mesh position={[0.15, 0.06, 0.1]} rotation={[0.1, 0.5, 0.15]}>
        <boxGeometry args={[0.04, 0.12, 0.02]} /><meshStandardMaterial color="#5a9a3a" />
      </mesh>
      <mesh position={[-0.12, 0.05, -0.15]} rotation={[-0.1, -0.3, -0.1]}>
        <boxGeometry args={[0.03, 0.10, 0.02]} /><meshStandardMaterial color="#4a8a2e" />
      </mesh>
    </group>
  );
}

export function GridTiles({ grid, movableTiles, attackableTiles, abilityTargetTiles, shrinkLevel, onTileClick, onTileHover }: GridTilesProps) {
  const grassPositions = useMemo(() => {
    const positions: { x: number; z: number }[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (grid[x][z].type === 'grass' && !grid[x][z].prop && grid[x][z].variant === 0) {
          positions.push({ x, z });
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
      {/* Ground plane - extends beyond grid for atmosphere */}
      <mesh position={[GRID_SIZE / 2 - 0.5, -0.05, GRID_SIZE / 2 - 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID_SIZE + 20, GRID_SIZE + 20]} /><meshStandardMaterial color="#1a3012" roughness={1} />
      </mesh>
      {grid.map((row, x) => row.map((tile, z) => (
        <Tile
          key={`t-${x}-${z}`} tile={tile}
          isMovable={movableTiles.some(t => t.x === x && t.z === z)}
          isAttackable={attackableTiles.some(t => t.x === x && t.z === z)}
          isAbilityTarget={abilityTargetTiles.some(t => t.x === x && t.z === z)}
          isOutOfZone={!isInZone(x, z, shrinkLevel) && shrinkLevel > 0}
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
        <GrassTuft key={`g-${i}`} x={pos.x} z={pos.z} />
      ))}
    </group>
  );
}
