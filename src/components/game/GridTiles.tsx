import { useRef } from 'react';
import { TileData, Position, GRID_SIZE } from '@/game/types';
import { isInZone } from '@/game/gameState';
import * as THREE from 'three';

interface GridTilesProps {
  grid: TileData[][];
  movableTiles: Position[];
  attackableTiles: Position[];
  shrinkLevel: number;
  onTileClick: (pos: Position) => void;
}

function Tile({ tile, isMovable, isAttackable, isOutOfZone, onClick }: {
  tile: TileData;
  isMovable: boolean;
  isAttackable: boolean;
  isOutOfZone: boolean;
  onClick: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);

  let color = '#1a2030';
  let emissive = '#000000';
  let emissiveIntensity = 0;

  if (tile.type === 'wall') {
    color = '#2a3040';
  } else if (tile.type === 'water') {
    color = '#1a3050';
    emissive = '#2255aa';
    emissiveIntensity = 0.3;
  } else if (tile.type === 'cover') {
    color = '#253020';
  }

  if (isOutOfZone) {
    color = '#401515';
    emissive = '#ff2222';
    emissiveIntensity = 0.1;
  }

  if (isMovable) {
    color = '#1a3a4a';
    emissive = '#2288cc';
    emissiveIntensity = 0.4;
  }

  if (isAttackable) {
    color = '#4a1a1a';
    emissive = '#ff4444';
    emissiveIntensity = 0.5;
  }

  const height = tile.type === 'wall' ? 0.8 : 0.15;

  return (
    <mesh
      ref={ref}
      position={[tile.x, tile.elevation + height / 2, tile.z]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => { if (ref.current) (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity + 0.2; }}
      onPointerOut={() => { if (ref.current) (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity; }}
    >
      <boxGeometry args={[0.95, height, 0.95]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={0.8}
      />
    </mesh>
  );
}

export function GridTiles({ grid, movableTiles, attackableTiles, shrinkLevel, onTileClick }: GridTilesProps) {
  return (
    <group>
      {grid.map((row, x) =>
        row.map((tile, z) => (
          <Tile
            key={`${x}-${z}`}
            tile={tile}
            isMovable={movableTiles.some(t => t.x === x && t.z === z)}
            isAttackable={attackableTiles.some(t => t.x === x && t.z === z)}
            isOutOfZone={!isInZone(x, z, shrinkLevel) && shrinkLevel > 0}
            onClick={() => onTileClick({ x, z })}
          />
        ))
      )}
      {/* Grid lines */}
      <gridHelper
        args={[GRID_SIZE, GRID_SIZE, '#1a4a2a', '#0d2815']}
        position={[GRID_SIZE / 2 - 0.5, 0.01, GRID_SIZE / 2 - 0.5]}
      />
    </group>
  );
}
