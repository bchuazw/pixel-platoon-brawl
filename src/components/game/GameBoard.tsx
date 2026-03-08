import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import { GridTiles } from './GridTiles';
import { GameUnits } from './GameUnits';
import { ZoneBorder } from './ZoneBorder';
import { GameState, Position } from '@/game/types';

interface GameBoardProps {
  state: GameState;
  onTileClick: (pos: Position) => void;
  onUnitClick: (unitId: string) => void;
}

function LoadingFallback() {
  return (
    <mesh position={[10, 0, 10]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#44cc44" wireframe />
    </mesh>
  );
}

export function GameBoard({ state, onTileClick, onUnitClick }: GameBoardProps) {
  return (
    <Canvas
      camera={{ position: [22, 20, 22], fov: 40 }}
      style={{ background: 'linear-gradient(180deg, #1a2a3a 0%, #0a1520 100%)' }}
      shadows
    >
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[15, 20, 15]}
        intensity={0.9}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-10, 10, -10]} intensity={0.2} color="#aaccff" />
      <hemisphereLight intensity={0.3} color="#aaddff" groundColor="#2a4a1a" />

      {/* Fog for atmosphere */}
      <fog attach="fog" args={['#0a1520', 25, 55]} />

      <Suspense fallback={<LoadingFallback />}>
        <GridTiles
          grid={state.grid}
          movableTiles={state.movableTiles}
          attackableTiles={state.attackableTiles}
          shrinkLevel={state.shrinkLevel}
          onTileClick={onTileClick}
        />
        <GameUnits
          units={state.units}
          selectedUnitId={state.selectedUnitId}
          onUnitClick={onUnitClick}
        />
      </Suspense>

      <ZoneBorder shrinkLevel={state.shrinkLevel} />

      <OrbitControls
        target={[10, 0, 10]}
        minDistance={8}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2.3}
        minPolarAngle={Math.PI / 8}
      />
    </Canvas>
  );
}
