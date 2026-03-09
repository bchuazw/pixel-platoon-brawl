import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GridTiles } from './GridTiles';
import { GameUnits } from './GameUnits';
import { ZoneBorder } from './ZoneBorder';
import { CombatVFX } from './CombatVFX';
import { ScreenShake } from './ScreenShake';
import { AutoFollowCamera } from './AutoFollowCamera';
import { AirdropVFX } from './AirdropVFX';
import { GameState, Position, GRID_SIZE, KillCamData, AirdropData } from '@/game/types';
import { RotateCw, Video, VideoOff } from 'lucide-react';
import * as THREE from 'three';

// Reusable vectors for WASD — avoid per-frame allocations
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// ── WASD Camera Panning — disabled during autoPlay ──
function WASDControls({ orbitRef, disabled }: { orbitRef: React.RefObject<any>; disabled: boolean }) {
  const keys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase());
    const onUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

  useFrame(() => {
    if (!orbitRef.current || disabled) return;
    const speed = 0.15;
    const target = orbitRef.current.target;
    const camera = orbitRef.current.object;
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    _forward.normalize();
    _right.crossVectors(_forward, _up).normalize();

    let moved = false;
    if (keys.current.has('w') || keys.current.has('arrowup')) { target.addScaledVector(_forward, speed); camera.position.addScaledVector(_forward, speed); moved = true; }
    if (keys.current.has('s') || keys.current.has('arrowdown')) { target.addScaledVector(_forward, -speed); camera.position.addScaledVector(_forward, -speed); moved = true; }
    if (keys.current.has('a') || keys.current.has('arrowleft')) { target.addScaledVector(_right, -speed); camera.position.addScaledVector(_right, -speed); moved = true; }
    if (keys.current.has('d') || keys.current.has('arrowright')) { target.addScaledVector(_right, speed); camera.position.addScaledVector(_right, speed); moved = true; }
    if (moved) orbitRef.current.update();
  });

  return null;
}

interface GameBoardProps {
  state: GameState;
  onTileClick: (pos: Position) => void;
  onUnitClick: (unitId: string) => void;
  onTileHover: (pos: Position | null) => void;
  onMoveComplete?: () => void;
  onAirdropLanded?: (airdrop: AirdropData) => void;
  inspectedUnitId?: string | null;
}

const CENTER = new THREE.Vector3(GRID_SIZE / 2 - 0.5, 0, GRID_SIZE / 2 - 0.5);

const CAM_DISTANCE = 22;
const CAM_HEIGHT = 18;

function getCameraPosition(angleIndex: number): [number, number, number] {
  const angle = (Math.PI / 4) + (angleIndex * Math.PI / 2);
  const x = CENTER.x + Math.cos(angle) * CAM_DISTANCE;
  const z = CENTER.z + Math.sin(angle) * CAM_DISTANCE;
  return [x, CAM_HEIGHT, z];
}

const ANGLE_LABELS = ['SW', 'SE', 'NE', 'NW'];

// CameraController only handles manual rotation transitions — NOT during autoPlay
function CameraController({ angleIndex, orbitRef, disabled }: { angleIndex: number; orbitRef: React.RefObject<any>; disabled: boolean }) {
  const { camera } = useThree();
  const progress = useRef(1);
  const startPos = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());

  useEffect(() => {
    const [x, y, z] = getCameraPosition(angleIndex);
    startPos.current.copy(camera.position);
    targetPos.current.set(x, y, z);
    progress.current = 0;
  }, [angleIndex, camera]);

  useFrame(() => {
    // Skip if autoPlay is controlling the camera, or transition is done
    if (disabled || progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + 0.03);
    const t = 1 - Math.pow(1 - progress.current, 3);
    camera.position.lerpVectors(startPos.current, targetPos.current, t);
    if (orbitRef.current) orbitRef.current.update();
  });

  return null;
}

// ── Kill Cam ──
function KillCamController({ killCam }: { killCam: KillCamData | null }) {
  const { camera } = useThree();
  const savedPos = useRef(new THREE.Vector3());
  const isActive = useRef(false);
  const phase = useRef<'zoom_in' | 'hold' | 'zoom_out'>('zoom_in');
  const progress = useRef(0);
  const targetLook = useRef(new THREE.Vector3());
  const targetCamPos = useRef(new THREE.Vector3());
  const startLook = useRef(new THREE.Vector3());
  const lerpTemp = useRef(new THREE.Vector3());

  useEffect(() => {
    if (killCam && !isActive.current) {
      savedPos.current.copy(camera.position);
      isActive.current = true;
      phase.current = 'zoom_in';
      progress.current = 0;

      const dx = killCam.targetPos.x - killCam.attackerPos.x;
      const dz = killCam.targetPos.z - killCam.attackerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const perpX = -dz / len;
      const perpZ = dx / len;

      startLook.current.set(killCam.attackerPos.x + dx * 0.3, 1.5, killCam.attackerPos.z + dz * 0.3);
      targetLook.current.set(killCam.targetPos.x, 0.8, killCam.targetPos.z);
      targetCamPos.current.set(
        killCam.targetPos.x + perpX * 2.5 + dx / len * -1.5, 2.5,
        killCam.targetPos.z + perpZ * 2.5 + dz / len * -1.5
      );
    } else if (!killCam && isActive.current) {
      phase.current = 'zoom_out';
      progress.current = 0;
    }
  }, [killCam, camera]);

  useFrame((_, rawDelta) => {
    if (!isActive.current) return;
    const delta = Math.min(rawDelta, 0.05);
    const speed = phase.current === 'zoom_in' ? 0.8 : phase.current === 'hold' ? 0 : 1.5;
    progress.current = Math.min(1, progress.current + delta * speed);
    const t = 1 - Math.pow(1 - progress.current, 3);

    if (phase.current === 'zoom_in') {
      camera.position.lerpVectors(savedPos.current, targetCamPos.current, t);
      lerpTemp.current.lerpVectors(startLook.current, targetLook.current, t);
      camera.lookAt(lerpTemp.current);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(40, 30, t);
        camera.updateProjectionMatrix();
      }
      if (progress.current >= 1) { phase.current = 'hold'; progress.current = 0; }
    } else if (phase.current === 'hold') {
      camera.lookAt(targetLook.current);
    } else if (phase.current === 'zoom_out') {
      camera.position.lerpVectors(targetCamPos.current, savedPos.current, t);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(30, 40, t);
        camera.updateProjectionMatrix();
      }
      if (progress.current >= 1) {
        isActive.current = false;
        camera.position.copy(savedPos.current);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = 40;
          camera.updateProjectionMatrix();
        }
      }
    }
  });

  return killCam ? (
    <group>
      <pointLight position={[killCam.targetPos.x, 4, killCam.targetPos.z]} intensity={2} color="#ff6633" distance={10} />
    </group>
  ) : null;
}

function LoadingFallback() {
  return (
    <mesh position={[10, 0, 10]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#44cc44" wireframe />
    </mesh>
  );
}

export function GameBoard({ state, onTileClick, onUnitClick, onTileHover, onMoveComplete, onAirdropLanded, inspectedUnitId }: GameBoardProps) {
  const [angleIndex, setAngleIndex] = useState(0);
  const [autoFollow, setAutoFollow] = useState(true);
  const orbitRef = useRef<any>(null);

  const rotateCamera = useCallback(() => {
    setAngleIndex(prev => (prev + 1) % 4);
  }, []);

  const initialCamPos = getCameraPosition(0);
  const isAutoPlaying = state.autoPlay && autoFollow;

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: initialCamPos, fov: 40, near: 0.1, far: 200 }}
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.3,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 1.5]}
      >
        {/* CameraController only for manual rotation, disabled during autoFollow */}
        <CameraController angleIndex={angleIndex} orbitRef={orbitRef} disabled={isAutoPlaying} />
        {/* WASD disabled during autoFollow to prevent conflicts */}
        <WASDControls orbitRef={orbitRef} disabled={isAutoPlaying} />
        <KillCamController killCam={state.killCam} />
        <AutoFollowCamera units={state.units} selectedUnitId={state.selectedUnitId} autoPlay={isAutoPlaying} orbitRef={orbitRef} cameraAngleIndex={angleIndex} />

        <color attach="background" args={['#1a2844']} />
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[90, 24, 12]} />
          <meshBasicMaterial side={THREE.BackSide} color="#1e3050" />
        </mesh>

        <ambientLight intensity={0.5} color="#8899cc" />
        <directionalLight
          position={[20, 30, 15]}
          intensity={1.8}
          castShadow
          color="#ffe0a0"
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={80}
          shadow-camera-left={-22}
          shadow-camera-right={22}
          shadow-camera-top={22}
          shadow-camera-bottom={-22}
          shadow-bias={-0.0003}
        />
        <directionalLight position={[-15, 18, -12]} intensity={0.4} color="#6688cc" />
        <directionalLight position={[-8, 12, 22]} intensity={0.3} color="#dd9944" />
        <hemisphereLight intensity={0.4} color="#88aadd" groundColor="#2a4a1e" />
        <fog attach="fog" args={['#1a2844', 50, 100]} />

        <EffectComposer multisampling={0}>
          <Bloom intensity={0.25} luminanceThreshold={0.6} luminanceSmoothing={0.9} mipmapBlur />
          <Vignette offset={0.15} darkness={0.45} blendFunction={BlendFunction.NORMAL} />
        </EffectComposer>

        <ScreenShake events={state.combatEvents} />

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
            weaponRangeTiles={(() => {
              if (!inspectedUnitId) return undefined;
              const u = state.units.find(u => u.id === inspectedUnitId && u.isAlive);
              if (!u) return undefined;
              const tiles: Position[] = [];
              for (let x = 0; x < GRID_SIZE; x++) {
                for (let z = 0; z < GRID_SIZE; z++) {
                  const dist = Math.abs(x - u.position.x) + Math.abs(z - u.position.z);
                  if (dist > 0 && dist <= u.attackRange) tiles.push({ x, z });
                }
              }
              return tiles;
            })()}
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
          {state.airdrops && state.airdrops.length > 0 && onAirdropLanded && (
            <AirdropVFX airdrops={state.airdrops} grid={state.grid} onAirdropLanded={onAirdropLanded} />
          )}
        </Suspense>

        <ZoneBorder shrinkLevel={state.shrinkLevel} />

        <OrbitControls
          ref={orbitRef}
          target={[CENTER.x, 0, CENTER.z]}
          enableRotate={false}
          enablePan={!isAutoPlaying}
          enableZoom={true}
          minDistance={10}
          maxDistance={40}
          maxPolarAngle={Math.PI / 2.3}
          minPolarAngle={Math.PI / 6}
          panSpeed={0.5}
          zoomSpeed={0.6}
          enableDamping
          dampingFactor={0.12}
          screenSpacePanning={false}
        />
      </Canvas>

      {/* Camera controls — positioned top-right, to the LEFT of the minimap */}
      <div className="absolute top-12 sm:top-14 right-[134px] sm:right-[140px] z-20 pointer-events-auto flex flex-col gap-1">
        <button
          onClick={() => setAutoFollow(prev => !prev)}
          className={`bg-card/90 backdrop-blur-sm border border-border/50 rounded-lg px-2 py-1.5 flex items-center gap-1.5 hover:bg-secondary transition-colors ${autoFollow ? 'text-primary' : 'text-muted-foreground'}`}
          title={autoFollow ? 'Camera tracking on' : 'Camera tracking off'}
        >
          {autoFollow ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
          <span className="text-[9px] tracking-wider font-display hidden lg:inline">{autoFollow ? 'TRACK' : 'FREE'}</span>
        </button>
        <button
          onClick={rotateCamera}
          className="bg-card/90 backdrop-blur-sm border border-border/50 rounded-lg px-2 py-1.5 flex items-center gap-1.5 text-foreground hover:bg-secondary transition-colors"
          title={`Rotate camera (${ANGLE_LABELS[angleIndex]})`}
        >
          <RotateCw className="w-3.5 h-3.5 text-primary" />
          <span className="text-[9px] tracking-wider font-display hidden lg:inline">{ANGLE_LABELS[angleIndex]}</span>
        </button>
      </div>

      {/* Kill Cam Overlay */}
      {state.killCam && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-[10%] bg-black/90 transition-all duration-700" />
          <div className="absolute bottom-0 left-0 right-0 h-[10%] bg-black/90 transition-all duration-700" />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.8) 100%)' }} />
          <div className="absolute bottom-[12%] left-8 animate-fade-in flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div className="w-1 h-12 bg-destructive rounded-full" />
              <div>
                <div className="text-[9px] tracking-[0.5em] text-destructive/80 font-mono-game uppercase mb-1">ELIMINATED</div>
                <div className="text-3xl font-black text-foreground tracking-wide font-display" style={{ textShadow: '0 0 30px rgba(255,50,50,0.4)' }}>
                  {state.killCam.victimName}
                </div>
                <div className="text-[10px] tracking-[0.2em] text-muted-foreground/80 font-mono-game mt-0.5">
                  BY {state.killCam.killerName}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
