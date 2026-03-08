import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GridTiles } from './GridTiles';
import { GameUnits } from './GameUnits';
import { ZoneBorder } from './ZoneBorder';
import { CombatVFX } from './CombatVFX';
import { GameState, Position, GRID_SIZE, KillCamData } from '@/game/types';
import { RotateCw } from 'lucide-react';
import * as THREE from 'three';

interface GameBoardProps {
  state: GameState;
  onTileClick: (pos: Position) => void;
  onUnitClick: (unitId: string) => void;
  onTileHover: (pos: Position | null) => void;
  onMoveComplete?: () => void;
}

const CENTER = new THREE.Vector3(GRID_SIZE / 2 - 0.5, 0, GRID_SIZE / 2 - 0.5);
const CAM_DISTANCE = 34;
const CAM_HEIGHT = 26;

function getCameraPosition(angleIndex: number): [number, number, number] {
  const angle = (Math.PI / 4) + (angleIndex * Math.PI / 2);
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
        const t = 1 - Math.pow(1 - progress.current, 3);
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

// ── KILL CAM: Cinematic zoom to elimination ──
function KillCamController({ killCam }: { killCam: KillCamData | null }) {
  const { camera } = useThree();
  const savedPos = useRef(new THREE.Vector3());
  const isActive = useRef(false);
  const progress = useRef(0);
  const targetLook = useRef(new THREE.Vector3());
  const targetCamPos = useRef(new THREE.Vector3());

  useEffect(() => {
    if (killCam && !isActive.current) {
      // Save current camera position
      savedPos.current.copy(camera.position);
      isActive.current = true;
      progress.current = 0;

      // Compute kill cam position: look from attacker toward target, offset up and to side
      const midX = (killCam.attackerPos.x + killCam.targetPos.x) / 2;
      const midZ = (killCam.attackerPos.z + killCam.targetPos.z) / 2;
      targetLook.current.set(killCam.targetPos.x, 0.5, killCam.targetPos.z);

      const dx = killCam.targetPos.x - killCam.attackerPos.x;
      const dz = killCam.targetPos.z - killCam.attackerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      // Position camera perpendicular to attack direction, elevated
      const perpX = -dz / len;
      const perpZ = dx / len;
      targetCamPos.current.set(
        midX + perpX * 3,
        4,
        midZ + perpZ * 3
      );
    } else if (!killCam && isActive.current) {
      isActive.current = false;
      progress.current = 0;
    }
  }, [killCam, camera]);

  useFrame(() => {
    if (!isActive.current || !killCam) return;
    progress.current = Math.min(1, progress.current + 0.04);
    const t = 1 - Math.pow(1 - progress.current, 3); // ease out cubic

    camera.position.lerp(targetCamPos.current, t > 0.95 ? 1 : 0.1);
    camera.lookAt(targetLook.current);
  });

  // Restore camera when killcam ends
  useEffect(() => {
    if (!killCam && savedPos.current.lengthSq() > 0) {
      // Will be naturally overridden by CameraController lerp
    }
  }, [killCam]);

  return null;
}

function DustParticles() {
  const count = 60;
  const ref = useRef<THREE.Points>(null);
  
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = Math.random() * GRID_SIZE - 0.5;
      arr[i * 3 + 1] = Math.random() * 6 + 0.5;
      arr[i * 3 + 2] = Math.random() * GRID_SIZE - 0.5;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos.array[i3] += Math.sin(t * 0.3 + i) * 0.003;
      pos.array[i3 + 1] += Math.sin(t * 0.2 + i * 0.5) * 0.002;
      pos.array[i3 + 2] += Math.cos(t * 0.25 + i) * 0.003;
      if (pos.array[i3 + 1] > 7) pos.array[i3 + 1] = 0.5;
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#bbaa88" size={0.06} transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

function LoadingFallback() {
  return (
    <mesh position={[10, 0, 10]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#44cc44" wireframe />
    </mesh>
  );
}

export function GameBoard({ state, onTileClick, onUnitClick, onTileHover, onMoveComplete }: GameBoardProps) {
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
          far: 200,
        }}
        shadows
      >
        <CameraController angleIndex={angleIndex} />
        <KillCamController killCam={state.killCam} />
        <color attach="background" args={['#0c1a12']} />
        <Stars radius={80} depth={40} count={800} factor={2} saturation={0.1} fade speed={0.5} />

        <ambientLight intensity={0.35} color="#8899aa" />
        <directionalLight position={[15, 25, 15]} intensity={0.7} castShadow color="#ffd8a0"
          shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
        <directionalLight position={[-10, 15, -10]} intensity={0.12} color="#6688cc" />
        <hemisphereLight intensity={0.3} color="#556677" groundColor="#1a2a12" />
        <fog attach="fog" args={['#0c1a12', 25, 65]} />

        <DustParticles />

        <Suspense fallback={<LoadingFallback />}>
          <GridTiles
            grid={state.grid}
            movableTiles={state.movableTiles}
            attackableTiles={state.attackableTiles}
            abilityTargetTiles={state.abilityTargetTiles}
            shrinkLevel={state.shrinkLevel}
            movePath={state.movePath}
            onTileClick={onTileClick}
            onTileHover={onTileHover}
          />
          <GameUnits
            units={state.units}
            selectedUnitId={state.selectedUnitId}
            onUnitClick={onUnitClick}
            combatEvents={state.combatEvents}
            movePath={state.movePath}
            movingUnitId={state.movingUnitId}
            grid={state.grid}
            onMoveComplete={onMoveComplete}
          />
          <CombatVFX events={state.combatEvents} />
        </Suspense>

        <ZoneBorder shrinkLevel={state.shrinkLevel} />

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
