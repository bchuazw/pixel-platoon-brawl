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

// ── Naturalistic terrain palette ──
const TERRAIN: Record<string, { base: string; dark: string; light: string; side: string }> = {
  grass:   { base: '#5a9438', dark: '#4a7e2e', light: '#6aaa48', side: '#3d6828' },
  dirt:    { base: '#b08a58', dark: '#9a7848', light: '#c49a68', side: '#7a5e38' },
  stone:   { base: '#8a8a90', dark: '#6e6e76', light: '#a0a0a8', side: '#5a5a62' },
  water:   { base: '#3888bb', dark: '#2a6a99', light: '#4499cc', side: '#1a5580' },
  sand:    { base: '#d4b870', dark: '#baa058', light: '#e0c880', side: '#9a8048' },
  wall:    { base: '#707078', dark: '#585860', light: '#888890', side: '#484850' },
  trench:  { base: '#6a5a38', dark: '#544828', light: '#7a6a48', side: '#3e3220' },
  crater:  { base: '#383330', dark: '#282420', light: '#484340', side: '#1e1a18' },
};

// ── Deterministic hash for per-tile variation ──
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

// Seamless tiles — no gap
const TILE_SIZE = 1.0;
// Thin ground surface — not a block
const SURFACE_H = 0.08;

// ── Material cache ──
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function cachedMat(color: string, roughness: number, metalness: number, emissive = '#000000', emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const key = `${color}-${roughness}-${metalness}-${emissive}-${emissiveIntensity}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity }));
  }
  return matCache.get(key)!;
}

// ── Color blending helper ──
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

// ── Tile Component ──
function Tile({ tile, isMovable, isAttackable, isAbilityTarget, isOutOfZone, isOnPath, hasSmoke, onClick, onHover }: {
  tile: TileData; isMovable: boolean; isAttackable: boolean; isAbilityTarget: boolean;
  isOutOfZone: boolean; isOnPath: boolean; hasSmoke: boolean; onClick: () => void; onHover: (hover: boolean) => void;
}) {
  const topRef = useRef<THREE.Mesh>(null);
  const t = TERRAIN[tile.type] || TERRAIN.grass;

  // Subtle per-tile color variation using hash (no harsh checkerboard)
  const h1 = tileHash(tile.x, tile.z, 1);
  const h2 = tileHash(tile.x, tile.z, 2);
  const colorBlend = h1 * 0.4; // 0-0.4 range of variation
  const baseColor = lerpColor(t.base, h1 > 0.5 ? t.light : t.dark, colorBlend);

  let emissive = '#000000';
  let emI = 0;
  if (tile.type === 'water') { emissive = '#1177aa'; emI = 0.12; }
  if (isOutOfZone) { emissive = '#cc2222'; emI = 0.25; }
  if (isMovable) { emissive = '#2299ff'; emI = 0.3; }
  if (isOnPath) { emissive = '#44ddff'; emI = 0.45; }
  if (isAttackable) { emissive = '#ff3333'; emI = 0.4; }
  if (isAbilityTarget) { emissive = '#ffaa00'; emI = 0.35; }

  const qElev = quantizeElevation(tile.elevation);
  const tileY = qElev * 0.6;
  const isWater = tile.type === 'water';
  const isTrench = tile.type === 'trench';
  const isCrater = tile.type === 'crater';

  const surfaceH = isWater ? 0.03 : isTrench ? 0.04 : isCrater ? 0.04 : SURFACE_H;
  const sideH = tileY;

  const topColor = isOutOfZone ? '#4a1818' : tile.scorchMark ? darkenColor(baseColor, 0.4) : baseColor;
  const sideColor = tile.scorchMark ? darkenColor(t.side, 0.3) : t.side;
  const roughness = tile.type === 'stone' ? 0.65 : tile.type === 'sand' ? 0.92 : 0.85;

  return (
    <group>
      {/* ── Ground surface — thin, seamless ── */}
      <mesh
        ref={topRef}
        position={[tile.x, tileY + surfaceH / 2, tile.z]}
        receiveShadow castShadow
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(true); if (topRef.current) (topRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emI + 0.12; }}
        onPointerOut={() => { onHover(false); if (topRef.current) (topRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = emI; }}
      >
        <boxGeometry args={[TILE_SIZE, surfaceH, TILE_SIZE]} />
        <meshStandardMaterial
          color={topColor} emissive={emissive} emissiveIntensity={emI}
          roughness={roughness} metalness={tile.type === 'stone' ? 0.06 : 0.0}
        />
      </mesh>

      {/* ── Cliff/elevation side ── */}
      {sideH > 0.02 && !isWater && (
        <mesh position={[tile.x, sideH / 2, tile.z]} castShadow receiveShadow>
          <boxGeometry args={[TILE_SIZE, sideH, TILE_SIZE]} />
          <meshStandardMaterial color={sideColor} roughness={0.95} metalness={0.0} />
        </mesh>
      )}

      {/* ── Surface detail overlays ── */}
      <TileSurfaceDetail tile={tile} tileY={tileY} surfaceH={surfaceH} isOutOfZone={isOutOfZone} />

      {/* ── Scorch mark ── */}
      {tile.scorchMark && (
        <mesh position={[tile.x, tileY + surfaceH + 0.002, tile.z]} rotation={[-Math.PI / 2, h1 * Math.PI, 0]}>
          <circleGeometry args={[0.38, 10]} />
          <meshBasicMaterial color="#0e0a06" transparent opacity={0.45} />
        </mesh>
      )}

      {/* ── Crater ring ── */}
      {isCrater && (
        <mesh position={[tile.x, tileY + surfaceH + 0.001, tile.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.22, 0.44, 10]} />
          <meshBasicMaterial color="#1e1810" transparent opacity={0.4} />
        </mesh>
      )}

      {/* ── Water ── */}
      {isWater && <WaterSurface x={tile.x} z={tile.z} y={tileY + surfaceH + 0.01} />}

      {/* ── Smoke ── */}
      {hasSmoke && <SmokeEffect x={tile.x} z={tile.z} y={tileY + 0.5} />}
    </group>
  );
}

// ── Organic surface details: grass tufts, pebbles, dirt patches ──
function TileSurfaceDetail({ tile, tileY, surfaceH, isOutOfZone }: { tile: TileData; tileY: number; surfaceH: number; isOutOfZone: boolean }) {
  if (tile.scorchMark || isOutOfZone || tile.type === 'water') return null;
  const y = tileY + surfaceH + 0.001;
  const h = tileHash(tile.x, tile.z, 3);
  const h2 = tileHash(tile.x, tile.z, 4);
  const h3 = tileHash(tile.x, tile.z, 5);

  if (tile.type === 'grass') {
    // Grass patches — small clusters of blade-like shapes
    if (h > 0.3) return null;
    const count = 2 + Math.floor(h2 * 4);
    return (
      <group>
        {Array.from({ length: count }, (_, i) => {
          const angle = tileHash(tile.x + i, tile.z, 10 + i) * Math.PI * 2;
          const dist = tileHash(tile.x, tile.z + i, 20 + i) * 0.35;
          const ox = Math.cos(angle) * dist;
          const oz = Math.sin(angle) * dist;
          const bladeH = 0.04 + tileHash(tile.x + i, tile.z + i, 30) * 0.06;
          const shade = tileHash(tile.x + i, tile.z, 40 + i);
          const green = shade > 0.5 ? '#5aaa38' : '#4a8a2e';
          return (
            <mesh key={i} position={[tile.x + ox, y + bladeH / 2, tile.z + oz]} rotation={[0, angle, 0]}>
              <boxGeometry args={[0.015, bladeH, 0.005]} />
              <meshBasicMaterial color={green} transparent opacity={0.7} />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (tile.type === 'dirt' || tile.type === 'sand') {
    // Small pebbles / grain detail
    if (h > 0.4) return null;
    return (
      <group>
        {[0, 1, 2].map(i => {
          const ox = (tileHash(tile.x, tile.z, 50 + i) - 0.5) * 0.6;
          const oz = (tileHash(tile.x, tile.z, 60 + i) - 0.5) * 0.6;
          const size = 0.02 + tileHash(tile.x, tile.z, 70 + i) * 0.03;
          return (
            <mesh key={i} position={[tile.x + ox, y + size * 0.3, tile.z + oz]}>
              <sphereGeometry args={[size, 4, 3]} />
              <meshStandardMaterial color={tile.type === 'sand' ? '#b8a058' : '#8a7858'} roughness={1} />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (tile.type === 'stone') {
    // Cracks / seams
    if (h > 0.35) return null;
    return (
      <mesh position={[tile.x + (h2 - 0.5) * 0.3, y + 0.001, tile.z + (h3 - 0.5) * 0.3]} rotation={[-Math.PI / 2, h * 3, 0]}>
        <planeGeometry args={[0.3, 0.008]} />
        <meshBasicMaterial color="#4a4a50" transparent opacity={0.3} />
      </mesh>
    );
  }

  return null;
}

// ── Water with animated shimmer ──
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
      <mesh><sphereGeometry args={[0.35, 8, 6]} /><meshBasicMaterial color="#99aabb" transparent opacity={0.2} depthWrite={false} /></mesh>
      <mesh position={[0.15, 0.1, 0.1]}><sphereGeometry args={[0.25, 6, 5]} /><meshBasicMaterial color="#889aaa" transparent opacity={0.16} depthWrite={false} /></mesh>
      <mesh position={[-0.1, 0.15, -0.08]}><sphereGeometry args={[0.2, 6, 4]} /><meshBasicMaterial color="#778899" transparent opacity={0.14} depthWrite={false} /></mesh>
    </group>
  );
}

// ══════════════════════════════════════════════════
// ── Props — Realistically scaled to soldier height (~0.73 units = ~1.8m)
// 1 tile ≈ 2.5m. Soldier head at ~0.73.
// ══════════════════════════════════════════════════
function PropObject({ tile }: { tile: TileData }) {
  if (!tile.prop) return null;
  const qElev = quantizeElevation(tile.elevation);
  const baseY = qElev * 0.6 + SURFACE_H;
  const h = tileHash(tile.x, tile.z, 99);
  // Per-prop variation: random scale and rotation offset
  const scaleVar = 0.85 + tileHash(tile.x, tile.z, 200) * 0.3; // 0.85-1.15
  const rotVar = tileHash(tile.x, tile.z, 201) * 0.3 - 0.15; // small tilt

  switch (tile.prop) {
    // Wooden supply crate — waist height (~0.35)
    case 'crate':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[rotVar * 0.3, h * 0.4 + rotVar * 2, 0]} scale={[scaleVar, scaleVar, scaleVar]}>
          <mesh position={[0, 0.175, 0]} castShadow>
            <boxGeometry args={[0.42, 0.35, 0.42]} />
            <meshStandardMaterial color="#8a6a30" roughness={0.9} />
          </mesh>
          {/* Reinforcement frame */}
          <mesh position={[0, 0.175, 0.212]}><boxGeometry args={[0.44, 0.37, 0.008]} /><meshStandardMaterial color="#6a5020" roughness={0.85} /></mesh>
          <mesh position={[0.212, 0.175, 0]}><boxGeometry args={[0.008, 0.37, 0.44]} /><meshStandardMaterial color="#6a5020" roughness={0.85} /></mesh>
          {/* Metal corner bands */}
          <mesh position={[0, 0.355, 0]}><boxGeometry args={[0.44, 0.012, 0.44]} /><meshStandardMaterial color="#5a5a55" metalness={0.5} roughness={0.4} /></mesh>
          <mesh position={[0, 0.0, 0]}><boxGeometry args={[0.44, 0.012, 0.44]} /><meshStandardMaterial color="#5a5a55" metalness={0.5} roughness={0.4} /></mesh>
        </group>
      );

    // Oil drum / barrel — chest height (~0.45)
    case 'barrel':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[rotVar * 0.2, h * Math.PI, 0]} scale={[scaleVar, scaleVar, scaleVar]}>
          <mesh position={[0, 0.225, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.20, 0.45, 10]} />
            <meshStandardMaterial color="#4a6848" roughness={0.6} metalness={0.3} />
          </mesh>
          {/* Rim rings */}
          <mesh position={[0, 0.44, 0]}><cylinderGeometry args={[0.19, 0.19, 0.015, 10]} /><meshStandardMaterial color="#3a4a38" metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[0, 0.01, 0]}><cylinderGeometry args={[0.21, 0.21, 0.015, 10]} /><meshStandardMaterial color="#3a4a38" metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[0, 0.22, 0]}><cylinderGeometry args={[0.195, 0.195, 0.012, 10]} /><meshStandardMaterial color="#3a4a38" metalness={0.5} roughness={0.35} /></mesh>
        </group>
      );

    // Sandbag wall — waist-high cover (~0.4)
    case 'sandbag': {
      const sbColor1 = h > 0.5 ? '#c0a060' : '#b89858';
      const sbColor2 = h > 0.3 ? '#c8a868' : '#baa058';
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h > 0.5 ? rotVar : Math.PI / 2 + rotVar, 0]} scale={[scaleVar, scaleVar, scaleVar]}>
          {/* Bottom row */}
          <mesh position={[-0.15, 0.08, 0]} castShadow><boxGeometry args={[0.28, 0.14, 0.22]} /><meshStandardMaterial color={sbColor1} roughness={1} /></mesh>
          <mesh position={[0.15, 0.08, 0]} castShadow><boxGeometry args={[0.28, 0.14, 0.22]} /><meshStandardMaterial color={sbColor2} roughness={1} /></mesh>
          {/* Top row — offset */}
          <mesh position={[0, 0.22, 0]} castShadow><boxGeometry args={[0.28, 0.14, 0.20]} /><meshStandardMaterial color={sbColor1} roughness={1} /></mesh>
        </group>
      );
    }

    // Natural boulder — knee to waist height
    case 'rock':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI, 0]}>
          <mesh position={[0, 0.15, 0]} castShadow>
            <dodecahedronGeometry args={[0.25 + h * 0.1, 1]} />
            <meshStandardMaterial color="#7a7a82" roughness={0.95} />
          </mesh>
          {/* Small companion rock */}
          {h > 0.4 && (
            <mesh position={[0.22, 0.06, 0.12]} castShadow>
              <dodecahedronGeometry args={[0.1, 0]} />
              <meshStandardMaterial color="#8a8a90" roughness={0.95} />
            </mesh>
          )}
        </group>
      );

    // Bush — knee height, wide spread
    case 'bush':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI * 2, 0]}>
          <mesh position={[0, 0.15, 0]} castShadow>
            <sphereGeometry args={[0.28, 8, 6]} />
            <meshStandardMaterial color="#3a7a28" roughness={0.95} />
          </mesh>
          <mesh position={[0.12, 0.10, 0.1]}>
            <sphereGeometry args={[0.2, 7, 5]} />
            <meshStandardMaterial color="#2e6e20" roughness={0.95} />
          </mesh>
          <mesh position={[-0.08, 0.08, -0.06]}>
            <sphereGeometry args={[0.16, 6, 5]} />
            <meshStandardMaterial color="#348a22" roughness={0.95} />
          </mesh>
        </group>
      );

    // Tree — 2-3x soldier height (1.5-2.2 total)
    case 'tree':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI * 2, 0]}>
          {/* Trunk */}
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.09, 0.7, 7]} />
            <meshStandardMaterial color="#5a3818" roughness={0.95} />
          </mesh>
          {/* Lower canopy — dense, wide */}
          <mesh position={[0, 0.85, 0]} castShadow>
            <sphereGeometry args={[0.42, 8, 6]} />
            <meshStandardMaterial color="#2e7018" roughness={0.9} />
          </mesh>
          {/* Upper canopy */}
          <mesh position={[0.08, 1.15, 0.05]} castShadow>
            <sphereGeometry args={[0.32, 7, 6]} />
            <meshStandardMaterial color="#389222" roughness={0.9} />
          </mesh>
          {/* Top cluster */}
          <mesh position={[-0.05, 1.38, -0.03]}>
            <sphereGeometry args={[0.22, 6, 5]} />
            <meshStandardMaterial color="#42a830" roughness={0.9} />
          </mesh>
          {/* Roots */}
          <mesh position={[0.06, 0.02, 0.06]} rotation={[0.3, 0, 0.4]}>
            <cylinderGeometry args={[0.03, 0.015, 0.15, 4]} />
            <meshStandardMaterial color="#4a3018" roughness={0.95} />
          </mesh>
        </group>
      );

    // Ruined wall / building fragment — shoulder height with rubble
    case 'ruins':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI / 2, 0]}>
          {/* Foundation slab */}
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.7, 0.08, 0.6]} />
            <meshStandardMaterial color="#6e6e76" roughness={0.92} />
          </mesh>
          {/* Standing wall piece */}
          <mesh position={[-0.22, 0.32, -0.15]} castShadow>
            <boxGeometry args={[0.1, 0.56, 0.28]} />
            <meshStandardMaterial color="#7a7a82" roughness={0.9} />
          </mesh>
          {/* Broken column */}
          <mesh position={[0.18, 0.18, 0.12]} castShadow>
            <boxGeometry args={[0.1, 0.28, 0.1]} />
            <meshStandardMaterial color="#828288" roughness={0.9} />
          </mesh>
          {/* Rubble */}
          <mesh position={[0.12, 0.04, -0.18]} rotation={[0.2, 0.5, 0.1]}>
            <boxGeometry args={[0.14, 0.06, 0.10]} />
            <meshStandardMaterial color="#6a6a70" roughness={0.95} />
          </mesh>
        </group>
      );

    // Jersey barrier — proper concrete highway barrier (~0.45 tall)
    case 'jersey_barrier':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h > 0.5 ? 0 : Math.PI / 2, 0]}>
          <mesh position={[0, 0.225, 0]} castShadow>
            <boxGeometry args={[0.72, 0.45, 0.28]} />
            <meshStandardMaterial color="#a0a0a0" roughness={0.85} />
          </mesh>
          {/* Sloped base */}
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.74, 0.08, 0.36]} />
            <meshStandardMaterial color="#909090" roughness={0.88} />
          </mesh>
        </group>
      );

    // Burnt vehicle wreck — large cover, ~chest height
    case 'burnt_vehicle':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI, 0]}>
          {/* Chassis */}
          <mesh position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[0.82, 0.2, 0.44]} />
            <meshStandardMaterial color="#222220" roughness={0.8} metalness={0.3} />
          </mesh>
          {/* Cabin */}
          <mesh position={[-0.08, 0.3, 0]} castShadow>
            <boxGeometry args={[0.38, 0.22, 0.38]} />
            <meshStandardMaterial color="#1a1a18" roughness={0.75} metalness={0.35} />
          </mesh>
          {/* Wheels (flat) */}
          <mesh position={[0.28, 0.06, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.04, 8]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
          </mesh>
          <mesh position={[-0.28, 0.06, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.04, 8]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
          </mesh>
          {/* Scorch marks */}
          <mesh position={[0.15, 0.22, 0.223]} rotation={[0, 0, 0]}>
            <planeGeometry args={[0.2, 0.15]} />
            <meshBasicMaterial color="#0a0a08" transparent opacity={0.4} />
          </mesh>
        </group>
      );

    // Concertina wire — ankle-shin height
    case 'wire':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h > 0.5 ? 0 : Math.PI / 2, 0]}>
          {/* Posts */}
          <mesh position={[-0.32, 0.12, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.24, 4]} />
            <meshStandardMaterial color="#5a4a30" roughness={0.9} />
          </mesh>
          <mesh position={[0.32, 0.12, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.24, 4]} />
            <meshStandardMaterial color="#5a4a30" roughness={0.9} />
          </mesh>
          {/* Wire coils */}
          <mesh position={[0, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.12, 0.012, 5, 12]} />
            <meshStandardMaterial color="#7a7a78" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0.15, 0.15, 0]} rotation={[0.3, 0, Math.PI / 2]}>
            <torusGeometry args={[0.10, 0.01, 5, 10]} />
            <meshStandardMaterial color="#6a6a68" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      );

    // Foxhole — below ground level
    case 'foxhole':
      return (
        <group position={[tile.x, baseY - 0.06, tile.z]}>
          {/* Rim of dug-in position */}
          <mesh position={[0.34, 0.06, 0]} castShadow>
            <boxGeometry args={[0.12, 0.1, 0.4]} />
            <meshStandardMaterial color="#7a6a42" roughness={1} />
          </mesh>
          <mesh position={[-0.34, 0.06, 0]} castShadow>
            <boxGeometry args={[0.12, 0.1, 0.4]} />
            <meshStandardMaterial color="#6a5a38" roughness={1} />
          </mesh>
          <mesh position={[0, 0.06, 0.28]} castShadow>
            <boxGeometry args={[0.56, 0.1, 0.12]} />
            <meshStandardMaterial color="#726040" roughness={1} />
          </mesh>
        </group>
      );

    // HESCO bastion — tall fortification (~0.6, chest-head height)
    case 'hesco':
      return (
        <group position={[tile.x, baseY, tile.z]}>
          {/* Wire mesh exterior */}
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.52, 0.6, 0.52]} />
            <meshStandardMaterial color="#b49a60" roughness={0.92} />
          </mesh>
          {/* Wire cage top edge */}
          <mesh position={[0, 0.61, 0]}>
            <boxGeometry args={[0.54, 0.02, 0.54]} />
            <meshStandardMaterial color="#7a7a78" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      );

    // Czech hedgehog / tank trap — waist height, angular
    case 'tank_trap':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI / 3, 0]}>
          <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
            <boxGeometry args={[0.05, 0.48, 0.05]} />
            <meshStandardMaterial color="#4a4035" metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 4, 0, 0]}>
            <boxGeometry args={[0.05, 0.48, 0.05]} />
            <meshStandardMaterial color="#3e3428" metalness={0.5} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.2, 0]} rotation={[0, Math.PI / 4, Math.PI / 4]}>
            <boxGeometry args={[0.05, 0.48, 0.05]} />
            <meshStandardMaterial color="#443a2e" metalness={0.5} roughness={0.45} />
          </mesh>
        </group>
      );

    // Broken brick/concrete wall — chest-head height cover
    case 'broken_wall':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h > 0.5 ? 0 : Math.PI / 2, 0]}>
          {/* Main wall section */}
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[0.7, 0.5, 0.12]} />
            <meshStandardMaterial color="#8a7a6a" roughness={0.92} />
          </mesh>
          {/* Jagged top — broken edge */}
          <mesh position={[-0.15, 0.52, 0]} castShadow>
            <boxGeometry args={[0.25, 0.08, 0.12]} />
            <meshStandardMaterial color="#7a6a5a" roughness={0.95} />
          </mesh>
          <mesh position={[0.22, 0.56, 0]} castShadow>
            <boxGeometry args={[0.15, 0.12, 0.11]} />
            <meshStandardMaterial color="#8a7a6a" roughness={0.92} />
          </mesh>
          {/* Rubble at base */}
          <mesh position={[0.3, 0.04, 0.1]} rotation={[0.2, 0.4, 0.1]}>
            <boxGeometry args={[0.12, 0.06, 0.08]} />
            <meshStandardMaterial color="#7a7068" roughness={0.95} />
          </mesh>
          <mesh position={[-0.25, 0.03, 0.08]}>
            <boxGeometry args={[0.08, 0.05, 0.06]} />
            <meshStandardMaterial color="#6a6058" roughness={0.95} />
          </mesh>
          {/* Exposed rebar */}
          <mesh position={[0.28, 0.45, 0]} rotation={[0, 0, 0.2]}>
            <cylinderGeometry args={[0.008, 0.008, 0.2, 4]} />
            <meshStandardMaterial color="#5a4a3a" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      );

    // Civilian wrecked car — good cover, realistic proportions
    case 'wrecked_car':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI * 2, 0]}>
          {/* Body/chassis */}
          <mesh position={[0, 0.14, 0]} castShadow>
            <boxGeometry args={[0.8, 0.22, 0.4]} />
            <meshStandardMaterial color={h > 0.5 ? '#4a3a2a' : '#2a3a4a'} roughness={0.75} metalness={0.35} />
          </mesh>
          {/* Roof/cabin */}
          <mesh position={[0.05, 0.32, 0]} castShadow>
            <boxGeometry args={[0.4, 0.18, 0.36]} />
            <meshStandardMaterial color={h > 0.5 ? '#3a2a1a' : '#1a2a3a'} roughness={0.7} metalness={0.4} />
          </mesh>
          {/* Windshield (broken) */}
          <mesh position={[0.26, 0.3, 0]} rotation={[0, 0, -0.2]}>
            <boxGeometry args={[0.005, 0.14, 0.32]} />
            <meshStandardMaterial color="#445566" metalness={0.3} roughness={0.2} transparent opacity={0.5} />
          </mesh>
          {/* Wheels */}
          {[[-0.28, 0.06, 0.22], [-0.28, 0.06, -0.22], [0.28, 0.06, 0.22], [0.28, 0.06, -0.22]].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 0.04, 8]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
          ))}
          {/* Damage dent */}
          <mesh position={[-0.3, 0.18, 0.15]} rotation={[0, 0.5, 0]}>
            <boxGeometry args={[0.08, 0.1, 0.08]} />
            <meshStandardMaterial color="#1a1510" roughness={0.95} />
          </mesh>
        </group>
      );

    // Scattered rubble/debris — low cover
    case 'rubble_pile':
      return (
        <group position={[tile.x, baseY, tile.z]} rotation={[0, h * Math.PI * 2, 0]}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <dodecahedronGeometry args={[0.15, 0]} />
            <meshStandardMaterial color="#6a6058" roughness={0.95} />
          </mesh>
          <mesh position={[0.12, 0.04, 0.08]} rotation={[0.3, 0.5, 0]}>
            <boxGeometry args={[0.14, 0.06, 0.1]} />
            <meshStandardMaterial color="#7a7068" roughness={0.95} />
          </mesh>
          <mesh position={[-0.1, 0.03, -0.06]} rotation={[0.1, 0.8, 0.2]}>
            <boxGeometry args={[0.1, 0.05, 0.08]} />
            <meshStandardMaterial color="#5a5048" roughness={0.95} />
          </mesh>
          <mesh position={[0.05, 0.08, -0.12]}>
            <dodecahedronGeometry args={[0.08, 0]} />
            <meshStandardMaterial color="#8a7a70" roughness={0.95} />
          </mesh>
        </group>
      );

    default: return null;
  }
}

// ── Loot ──
function LootObject({ tile }: { tile: TileData }) {
  const ref = useRef<THREE.Group>(null);
  const qElev = quantizeElevation(tile.elevation);
  const baseY = qElev * 0.6 + SURFACE_H + 0.15;

  useFrame(({ clock }) => {
    if (!ref.current || !tile.loot) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = baseY + Math.sin(t * 2.5 + tile.x * 0.7 + tile.z * 1.3) * 0.06;
    ref.current.rotation.y = t * 1.2 + tile.x;
  });

  if (!tile.loot) return null;
  const color = tile.loot.type === 'weapon' ? '#ffaa22' : tile.loot.type === 'medkit' ? '#ff3366' :
                tile.loot.type === 'armor' ? '#3388ff' : tile.loot.type === 'killstreak' ? '#bb44ff' : '#66cc33';

  return (
    <group ref={ref} position={[tile.x, baseY, tile.z]}>
      <mesh>
        <boxGeometry args={[0.2, 0.2, 0.2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} metalness={0.2} />
      </mesh>
      <pointLight color={color} intensity={0.6} distance={2} />
      <Billboard position={[0, 0.28, 0]}>
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
          <group key={`path-${i}`} position={[pos.x, y, pos.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.1, 8]} />
              <meshBasicMaterial color="#44ddff" transparent opacity={0.45 - i * 0.03} />
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
      {/* Base ground — seamless earth beneath map */}
      <mesh position={[GRID_SIZE / 2 - 0.5, -0.25, GRID_SIZE / 2 - 0.5]} receiveShadow>
        <boxGeometry args={[GRID_SIZE + 10, 0.5, GRID_SIZE + 10]} />
        <meshStandardMaterial color="#2a3a1e" roughness={1} />
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
