import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GridTiles } from './GridTiles';
import { GameUnits } from './GameUnits';
import { ZoneBorder } from './ZoneBorder';
import { GameState, Position } from '@/game/types';

interface GameBoardProps {
  state: GameState;
  onTileClick: (pos: Position) => void;
  onUnitClick: (unitId: string) => void;
}

export function GameBoard({ state, onTileClick, onUnitClick }: GameBoardProps) {
  return (
    <Canvas
      camera={{ position: [20, 18, 20], fov: 45 }}
      style={{ background: 'hsl(220, 20%, 6%)' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} castShadow />
      <pointLight position={[10, 5, 10]} intensity={0.3} color="#44cc44" />

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
      <ZoneBorder shrinkLevel={state.shrinkLevel} />

      <OrbitControls
        target={[10, 0, 10]}
        minDistance={10}
        maxDistance={35}
        maxPolarAngle={Math.PI / 2.5}
        minPolarAngle={Math.PI / 6}
      />
    </Canvas>
  );
}
