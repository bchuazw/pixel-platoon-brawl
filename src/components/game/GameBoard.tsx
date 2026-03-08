import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { GridTiles } from './GridTiles';
import { GameUnits } from './GameUnits';
import { ZoneBorder } from './ZoneBorder';
import { CombatVFX } from './CombatVFX';
import { GameState, Position, GRID_SIZE } from '@/game/types';
import { RotateCw } from 'lucide-react';
import * as THREE from 'three';

interface GameBoardProps {
  state: GameState;
  onTileClick: (pos: Position) => void;
  onUnitClick: (unitId: string) => void;
  onTileHover: (pos: Position | null) => void;
}

const CENTER = new THREE.Vector3(GRID_SIZE / 2 - 0.5, 0, GRID_SIZE / 2 - 0.5);
const CAM_DISTANCE = 24;
const CAM_HEIGHT = 18;

// 4 fixed angles around the board center
function getCameraPosition(angleIndex: number): [number, number, number] {
  const angle = (Math.PI / 4) + (angleIndex * Math.PI / 2); // 45°, 135°, 225°, 315°
  const x = CENTER.x + Math.cos(angle) * CAM_DISTANCE;
  const z = CENTER.z + Math.sin(angle) * CAM_DISTANCE;
  return [x, CAM_HEIGHT, z];
}

const ANGLE_LABELS = ['SW', 'SE', 'NE', 'NW'];

function CameraController({ angleIndex }: { angleIndex: number }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const animating = useRef(false);
  const progress = useRef(1);

  useEffect(() => {
    const [x, y, z] = getCameraPosition(angleIndex);
    targetPos.current.set(x, y, z);
    progress.current = 0;
    animating.current = true;
  }, [angleIndex]);

  useEffect(() => {
    let raf: number;
    const animate = () => {
      if (animating.current && progress.current < 1) {
        progress.current = Math.min(1, progress.current + 0.04);
        const t = 1 - Math.pow(1 - progress.current, 3); // ease out cubic
        camera.position.lerp(targetPos.current, t > 0.99 ? 1 : 0.08);
        camera.lookAt(CENTER);
        if (progress.current >= 1) animating.current = false;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [camera, angleIndex]);

  return null;
}

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

  const initialCamPos = getCameraPosition(0);

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{
          position: initialCamPos,
          fov: 38,
          near: 0.1,
          far: 100,
        }}
        style={{ background: 'linear-gradient(180deg, #1a2a1a 0%, #0a1510 100%)' }}
        shadows
      >
        <CameraController angleIndex={angleIndex} />

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

        {/* Pan/zoom controls - no rotation (rotation via button only) */}
        <OrbitControls
          target={[CENTER.x, 0, CENTER.z]}
          enableRotate={false}
          enablePan={true}
          enableZoom={true}
          minDistance={8}
          maxDistance={40}
          maxPolarAngle={Math.PI / 2.3}
          minPolarAngle={Math.PI / 8}
          panSpeed={1.2}
          screenSpacePanning={false}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          touches={{
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
        />
      </Canvas>

      {/* Rotate Camera Button */}
      <button
        onClick={rotateCamera}
        className="absolute bottom-36 right-4 z-20 pointer-events-auto bg-card/90 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 flex items-center gap-2 text-foreground hover:bg-secondary transition-colors"
      >
        <RotateCw className="w-4 h-4 text-primary" />
        <span className="text-[8px] tracking-wider">ROTATE ({ANGLE_LABELS[angleIndex]})</span>
      </button>
    </div>
  );
}
