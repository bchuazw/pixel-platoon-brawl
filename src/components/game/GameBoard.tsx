import { Canvas } from '@react-three/fiber';
import { Suspense, useState, useCallback } from 'react';
import { GridTiles } from './GridTiles';
import { GameUnits } from './GameUnits';
import { ZoneBorder } from './ZoneBorder';
import { CombatVFX } from './CombatVFX';
import { GameState, Position, GRID_SIZE } from '@/game/types';
import { RotateCw } from 'lucide-react';

interface GameBoardProps {
  state: GameState;
  onTileClick: (pos: Position) => void;
  onUnitClick: (unitId: string) => void;
  onTileHover: (pos: Position | null) => void;
}

// Fixed isometric camera positions (4 angles, 90° apart)
const CAMERA_ANGLES = [
  { position: [22, 18, 22] as [number, number, number], label: 'SW' },
  { position: [22, 18, -2] as [number, number, number], label: 'NW' },
  { position: [-2, 18, -2] as [number, number, number], label: 'NE' },
  { position: [-2, 18, 22] as [number, number, number], label: 'SE' },
];

function LoadingFallback() {
  return (
    <mesh position={[10, 0, 10]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#44cc44" wireframe />
    </mesh>
  );
}

export function GameBoard({ state, onTileClick, onUnitClick, onTileHover }: GameBoardProps) {
  const [angleIndex, setAngleIndex] = useState(0);

  const rotateCamera = useCallback(() => {
    setAngleIndex(prev => (prev + 1) % 4);
  }, []);

  const cameraPos = CAMERA_ANGLES[angleIndex].position;

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{
          position: cameraPos,
          fov: 38,
          near: 0.1,
          far: 100,
        }}
        style={{ background: 'linear-gradient(180deg, #1a2a1a 0%, #0a1510 100%)' }}
        shadows
        key={angleIndex}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[15, 20, 15]} intensity={0.85} castShadow color="#ffe8c0"
          shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
        <directionalLight position={[-10, 10, -10]} intensity={0.15} color="#aaccff" />
        <hemisphereLight intensity={0.35} color="#aaddff" groundColor="#2a4a1a" />
        <fog attach="fog" args={['#0a1510', 28, 55]} />

        <Suspense fallback={<LoadingFallback />}>
          <GridTiles
            grid={state.grid}
            movableTiles={state.movableTiles}
            attackableTiles={state.attackableTiles}
            abilityTargetTiles={state.abilityTargetTiles}
            shrinkLevel={state.shrinkLevel}
            onTileClick={onTileClick}
            onTileHover={onTileHover}
          />
          <GameUnits
            units={state.units}
            selectedUnitId={state.selectedUnitId}
            onUnitClick={onUnitClick}
          />
          <CombatVFX events={state.combatEvents} />
        </Suspense>

        <ZoneBorder shrinkLevel={state.shrinkLevel} />
      </Canvas>

      {/* Rotate Camera Button */}
      <button
        onClick={rotateCamera}
        className="absolute bottom-36 right-4 z-20 pointer-events-auto bg-card/90 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 flex items-center gap-2 text-foreground hover:bg-secondary transition-colors"
      >
        <RotateCw className="w-4 h-4 text-primary" />
        <span className="text-[8px] tracking-wider">ROTATE ({CAMERA_ANGLES[angleIndex].label})</span>
      </button>
    </div>
  );
}
