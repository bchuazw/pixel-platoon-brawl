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

// ── Refined terrain palette — natural, warm, polished ──
const TERRAIN: Record<string, { top: string; side: string; topAlt: string; accent: string }> = {
  grass:   { top: '#6aaa48', side: '#3d6e28', topAlt: '#5e9840', accent: '#7ab858' },
  dirt:    { top: '#c4a070', side: '#8a6840', topAlt: '#b89565', accent: '#d4b080' },
  stone:   { top: '#a0a0a8', side: '#6a6a72', topAlt: '#959598', accent: '#b0b0b8' },
  water:   { top: '#4499cc', side: '#1a5580', topAlt: '#3d8cbb', accent: '#55aadd' },
  sand:    { top: '#e0c880', side: '#a89050', topAlt: '#d4bc72', accent: '#ecd890' },
  wall:    { top: '#808088', side: '#585860', topAlt: '#757580', accent: '#8a8a92' },
  trench:  { top: '#7a6a42', side: '#4a3e28', topAlt: '#6e6038', accent: '#887550' },
  crater:  { top: '#3a3530', side: '#2a2520', topAlt: '#343028', accent: '#4a4440' },
};

function quantizeElevation(elev: number): number {
  return Math.round(elev * 2.5) / 2.5;
}

export function getTileY(elevation: number): number {
  return quantizeElevation(elevation) * 0.6;
}

const TILE_SIZE = 0.96;
const BASE_H = 0.22;

// ── Material cache for performance ──
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function cachedMat(color: string, roughness: number, metalness: number, emissive = '#000000', emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const key = `${color}-${roughness}-${metalness}-${emissive}-${emissiveIntensity}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity }));
  }
  return matCache.get(key)!;
}

// ── Single Tile with beveled look ──
function Tile({ tile, isMovable, isAttackable, isAbilityTarget, isOutOfZone, isOnPath, hasSmoke, onClick, onHover }: {
  tile: TileData; isMovable: boolean; isAttackable: boolean; isAbilityTarget: boolean;
  isOutOfZone: boolean; isOnPath: boolean; hasSmoke: boolean; onClick: () => void; onHover: (hover: boolean) => void;
}) {
  const topRef = useRef<THREE.Mesh>(null);
  const useAlt = (tile.x + tile.z) % 2 === 0;
  const t = TERRAIN[tile.type] || TERRAIN.grass;
  const baseTopColor = useAlt ? t.topAlt : t.top;
  const sideColor = t.side;

  let emissive = '#000000';
  let emI = 0;
  if (tile.type === 'water') { emissive = '#1177aa'; emI = 0.15; }
  if (isOutOfZone) { emissive = '#cc2222'; emI = 0.3; }
  if (isMovable) { emissive = '#2299ff'; emI = 0.35; }
  if (isOnPath) { emissive = '#44ddff'; emI = 0.55; }
  if (isAttackable) { emissive = '#ff3333'; emI = 0.45; }
  if (isAbilityTarget) { emissive = '#ffaa00'; emI = 0.4; }

  const qElev = quantizeElevation(tile.elevation);
  const tileY = qElev * 0.6;
  const isWater = tile.type === 'water';
  const isTrench = tile.type === 'trench';
  const isCrater = tile.type === 'crater';

  const topH = isWater ? 0.06 : isTrench ? 0.1 : isCrater ? 0.08 : BASE_H;
  const sideH = tileY;

  // Damaged/scorched tint
  const topColor = isOutOfZone ? '#5a2020' : tile.scorchMark ? darkenColor(baseTopColor, 0.35) : baseTopColor;
  const topRoughness = tile.scorchMark ? 0.98 : tile.type === 'stone' ? 0.7 : 0.82;

  return (
    <group>
      {/* ── Top surface tile ── */}
      <mesh
        ref={topRef}
        position={[tile.x, tileY + topH / 2, tile.z]}
        receiveShadow castShadow
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(true); if (topRef.current) (topRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emI + 0.18; }}
        onPointerOut={() => { onHover(false); if (topRef.current) (topRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emI; }}
      >
        <boxGeometry args={[TILE_SIZE, topH, TILE_SIZE]} />
        <meshStandardMaterial color={topColor} emissive={emissive} emissiveIntensity={emI} roughness={topRoughness} metalness={tile.type === 'stone' ? 0.08 : 0.01} />
      </mesh>

      {/* ── Bevel/rim highlight on top edge ── */}
      <mesh position={[tile.x, tileY + topH + 0.001, tile.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
        <meshBasicMaterial color={emI > 0 ? emissive : t.accent} transparent opacity={emI > 0 ? 0.12 : 0.04} wireframe />
      </mesh>

      {/* ── Side column for elevation ── */}
      {sideH > 0.04 && !isWater && (
        <mesh position={[tile.x, sideH / 2, tile.z]} castShadow receiveShadow>
          <boxGeometry args={[TILE_SIZE, sideH, TILE_SIZE]} />
          <meshStandardMaterial color={tile.scorchMark ? darkenColor(sideColor, 0.3) : sideColor} roughness={0.92} metalness={0.01} />
        </mesh>
      )}

      {/* ── Surface detail: grass tufts, stone cracks, dirt patches ── */}
      {tile.type === 'grass' && !tile.scorchMark && tile.variant < 2 && (
        <mesh position={[tile.x + (tile.variant - 0.5) * 0.2, tileY + topH + 0.003, tile.z + (tile.variant - 1) * 0.15]} rotation={[-Math.PI / 2, tile.variant * 1.2, 0]}>
          <circleGeometry args={[0.08, 5]} />
          <meshBasicMaterial color={t.accent} transparent opacity={0.3} />
        </mesh>
      )}

      {/* ── Scorch mark overlay ── */}
      {tile.scorchMark && (
        <mesh position={[tile.x, tileY + topH + 0.003, tile.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.35, 8]} />
          <meshBasicMaterial color="#1a1008" transparent opacity={0.4} />
        </mesh>
      )}

      {/* ── Crater depression visual ── */}
      {isCrater && (
        <mesh position={[tile.x, tileY + topH + 0.002, tile.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.42, 8]} />
          <meshBasicMaterial color="#2a2018" transparent opacity={0.5} />
        </mesh>
      )}

      {/* ── Water animation ── */}
      {isWater && <WaterSurface x={tile.x} z={tile.z} y={tileY + topH + 0.01} />}

      {/* ── Smoke ── */}
      {hasSmoke && <SmokeEffect x={tile.x} z={tile.z} y={tileY + 0.5} />}
    </group>
  );
}

function darkenColor(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return '#' + c.getHexString();
}

// ── Water with animated shimmer ──
function WaterSurface({ x, z, y }: { x: number; z: number; y: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.12 + Math.sin(t * 2.2 + x * 1.3 + z * 0.7) * 0.06;
    ref.current.position.y = y + Math.sin(t * 1.3 + x + z * 0.8) * 0.008;
  });
  return (
    <mesh ref={ref} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshBasicMaterial color="#88ddff" transparent opacity={0.12} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

// ── Smoke cloud ──
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
      <mesh><sphereGeometry args={[0.32, 6, 5]} /><meshBasicMaterial color="#99aabb" transparent opacity={0.22} depthWrite={false} /></mesh>
      <mesh position={[0.14, 0.08, 0.1]}><sphereGeometry args={[0.22, 5, 4]} /><meshBasicMaterial color="#889aaa" transparent opacity={0.18} depthWrite={false} /></mesh>
    </group>
  );
}

// ── Props — chunkier, more defined ──
function PropObject({ tile }: { tile: TileData }) {
  if (!tile.prop) return null;
  const qElev = quantizeElevation(tile.elevation);
  const baseY = qElev * 0.6 + BASE_H;

  switch (tile.prop) {
    case 'crate':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.19, 0]} castShadow>
            <boxGeometry args={[0.44, 0.38, 0.44]} />
            <meshStandardMaterial color="#9a7a42" roughness={0.88} />
          </mesh>
          {/* Metal straps */}
          <mesh position={[0, 0.19, 0.222]}><boxGeometry args={[0.46, 0.05, 0.005]} /><meshStandardMaterial color="#666660" metalness={0.5} roughness={0.4} /></mesh>
          <mesh position={[0, 0.32, 0.222]}><boxGeometry args={[0.46, 0.05, 0.005]} /><meshStandardMaterial color="#666660" metalness={0.5} roughness={0.4} /></mesh>
        </group>
      );
    case 'barrel':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.24, 0]} castShadow>
            <cylinderGeometry args={[0.19, 0.21, 0.48, 8]} />
            <meshStandardMaterial color="#4a6848" roughness={0.65} metalness={0.25} />
          </mesh>
          <mesh position={[0, 0.48, 0]}><cylinderGeometry args={[0.2, 0.2, 0.02, 8]} /><meshStandardMaterial color="#3a4a38" metalness={0.5} roughness={0.3} /></mesh>
        </group>
      );
    case 'sandbag':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.12, 0]} castShadow><boxGeometry args={[0.62, 0.24, 0.38]} /><meshStandardMaterial color="#c8aa70" roughness={1} /></mesh>
          <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.55, 0.18, 0.35]} /><meshStandardMaterial color="#baa062" roughness={1} /></mesh>
        </group>
      );
    case 'rock':
      return (
        <mesh position={[tile.x, baseY + 0.18, tile.z]} rotation={[0.1, tile.variant * 0.8, 0.05]} castShadow>
          <dodecahedronGeometry args={[0.32, 0]} />
          <meshStandardMaterial color="#888890" roughness={0.92} />
        </mesh>
      );
    case 'bush':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.16, 0]} castShadow><sphereGeometry args={[0.28, 7, 6]} /><meshStandardMaterial color="#3a8828" roughness={0.92} /></mesh>
          <mesh position={[0.12, 0.1, 0.08]}><sphereGeometry args={[0.18, 6, 5]} /><meshStandardMaterial color="#2e7420" roughness={0.92} /></mesh>
        </group>
      );
    case 'tree':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.32, 0]} castShadow><cylinderGeometry args={[0.06, 0.09, 0.64, 6]} /><meshStandardMaterial color="#6a4020" roughness={0.95} /></mesh>
          <mesh position={[0, 0.7, 0]} castShadow><coneGeometry args={[0.42, 0.55, 6]} /><meshStandardMaterial color="#2e7818" roughness={0.88} /></mesh>
          <mesh position={[0, 0.98, 0]} castShadow><coneGeometry args={[0.32, 0.42, 6]} /><meshStandardMaterial color="#389222" roughness={0.88} /></mesh>
          <mesh position={[0, 1.22, 0]}><coneGeometry args={[0.22, 0.32, 5]} /><meshStandardMaterial color="#42a830" roughness={0.88} /></mesh>
        </group>
      );
    case 'ruins':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.06, 0]} castShadow><boxGeometry args={[0.62, 0.12, 0.62]} /><meshStandardMaterial color="#7a7a82" roughness={0.92} /></mesh>
          <mesh position={[-0.2, 0.32, -0.2]} castShadow><boxGeometry args={[0.12, 0.52, 0.12]} /><meshStandardMaterial color="#8a8a90" roughness={0.92} /></mesh>
          <mesh position={[0.2, 0.2, 0.15]} castShadow><boxGeometry args={[0.12, 0.28, 0.12]} /><meshStandardMaterial color="#757580" roughness={0.92} /></mesh>
        </group>
      );
    case 'jersey_barrier':
      return (
        <mesh position={[tile.x, baseY + 0.22, tile.z]} castShadow>
          <boxGeometry args={[0.68, 0.44, 0.3]} />
          <meshStandardMaterial color="#aaaaaa" roughness={0.9} />
        </mesh>
      );
    case 'burnt_vehicle':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.13, 0]} castShadow><boxGeometry args={[0.78, 0.22, 0.46]} /><meshStandardMaterial color="#2a2a28" roughness={0.85} metalness={0.25} /></mesh>
          <mesh position={[-0.04, 0.32, 0]} castShadow><boxGeometry args={[0.4, 0.2, 0.38]} /><meshStandardMaterial color="#222220" roughness={0.8} metalness={0.3} /></mesh>
        </group>
      );
    case 'wire':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[-0.3, 0.15, 0]}><cylinderGeometry args={[0.02, 0.02, 0.3, 4]} /><meshStandardMaterial color="#5a4a30" roughness={0.9} /></mesh>
          <mesh position={[0.3, 0.15, 0]}><cylinderGeometry args={[0.02, 0.02, 0.3, 4]} /><meshStandardMaterial color="#5a4a30" roughness={0.9} /></mesh>
          <mesh position={[0, 0.14, 0]} rotation={[0, 0.3, Math.PI / 2]}><torusGeometry args={[0.14, 0.018, 5, 10]} /><meshStandardMaterial color="#7a7a78" metalness={0.5} roughness={0.5} /></mesh>
        </group>
      );
    case 'foxhole':
      return (
        <group position={[tile.x, baseY - 0.08, tile.z]}>
          <mesh position={[0.3, 0.06, 0]} castShadow><boxGeometry args={[0.14, 0.12, 0.3]} /><meshStandardMaterial color="#7a6a42" roughness={1} /></mesh>
          <mesh position={[-0.3, 0.06, 0]} castShadow><boxGeometry args={[0.14, 0.12, 0.3]} /><meshStandardMaterial color="#6a5a38" roughness={1} /></mesh>
        </group>
      );
    case 'hesco':
      return (
        <mesh position={[tile.x, baseY + 0.26, tile.z]} castShadow>
          <boxGeometry args={[0.54, 0.52, 0.54]} />
          <meshStandardMaterial color="#b49a60" roughness={0.92} />
        </mesh>
      );
    case 'tank_trap':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 4]} castShadow><boxGeometry args={[0.06, 0.5, 0.06]} /><meshStandardMaterial color="#5a4a32" metalness={0.4} roughness={0.5} /></mesh>
          <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 4, 0, 0]}><boxGeometry args={[0.06, 0.5, 0.06]} /><meshStandardMaterial color="#4a3a22" metalness={0.4} roughness={0.5} /></mesh>
        </group>
      );
    default: return null;
  }
}

// ── Loot ──
function LootObject({ tile }: { tile: TileData }) {
  const ref = useRef<THREE.Group>(null);
  const qElev = quantizeElevation(tile.elevation);
  const baseY = qElev * 0.6 + BASE_H + 0.2;

  useFrame(({ clock }) => {
    if (!ref.current || !tile.loot) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = baseY + 0.15 + Math.sin(t * 2.5 + tile.x * 0.7 + tile.z * 1.3) * 0.08;
    ref.current.rotation.y = t * 1.5 + tile.x;
  });

  if (!tile.loot) return null;
  const color = tile.loot.type === 'weapon' ? '#ffaa22' : tile.loot.type === 'medkit' ? '#ff3366' :
                tile.loot.type === 'armor' ? '#3388ff' : tile.loot.type === 'killstreak' ? '#bb44ff' : '#66cc33';

  return (
    <group ref={ref} position={[tile.x, baseY + 0.15, tile.z]}>
      <mesh><boxGeometry args={[0.24, 0.24, 0.24]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.3} metalness={0.2} /></mesh>
      <pointLight color={color} intensity={0.8} distance={2.5} />
      <Billboard position={[0, 0.32, 0]}>
        <Text fontSize={0.08} color={color} anchorX="center" anchorY="middle" font={undefined} outlineWidth={0.014} outlineColor="#000000">
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
        const y = qElev * 0.6 + BASE_H + 0.01;
        return (
          <group key={`path-${i}`} position={[pos.x, y, pos.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.12, 8]} />
              <meshBasicMaterial color="#44ddff" transparent opacity={0.5 - i * 0.04} />
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
      {/* Base ground — extends beyond map edge */}
      <mesh position={[GRID_SIZE / 2 - 0.5, -0.5, GRID_SIZE / 2 - 0.5]} receiveShadow>
        <boxGeometry args={[GRID_SIZE + 8, 1, GRID_SIZE + 8]} />
        <meshStandardMaterial color="#2a3a1e" roughness={1} />
      </mesh>

      {/* Map edge trim */}
      <mesh position={[GRID_SIZE / 2 - 0.5, 0.01, GRID_SIZE / 2 - 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[GRID_SIZE / 2 - 0.2, GRID_SIZE / 2 + 0.5, 4]} />
        <meshBasicMaterial color="#1a2a10" transparent opacity={0.3} />
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
