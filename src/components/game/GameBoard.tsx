import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, SSAO, ToneMapping } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GridTiles } from './GridTiles';
import { GameUnits } from './GameUnits';
import { ZoneBorder } from './ZoneBorder';
import { CombatVFX } from './CombatVFX';
import { ScreenShake } from './ScreenShake';
import { EmberParticles, LightShafts, GroundFog, DistantTrees, RainParticles, CloudLayer, RainPuddles } from './EnvironmentVFX';
import { GameState, Position, GRID_SIZE, KillCamData } from '@/game/types';
import { RotateCw, Video, VideoOff } from 'lucide-react';
import * as THREE from 'three';
import { AutoFollowCamera } from './AutoFollowCamera';

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

function CameraController({ angleIndex, orbitRef }: { angleIndex: number; orbitRef: React.RefObject<any> }) {
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
    if (progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + 0.03);
    const t = 1 - Math.pow(1 - progress.current, 3);
    camera.position.lerpVectors(startPos.current, targetPos.current, t);
    if (orbitRef.current) {
      orbitRef.current.update();
    }
  });

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
      savedPos.current.copy(camera.position);
      isActive.current = true;
      progress.current = 0;

      const midX = (killCam.attackerPos.x + killCam.targetPos.x) / 2;
      const midZ = (killCam.attackerPos.z + killCam.targetPos.z) / 2;
      targetLook.current.set(killCam.targetPos.x, 0.5, killCam.targetPos.z);

      const dx = killCam.targetPos.x - killCam.attackerPos.x;
      const dz = killCam.targetPos.z - killCam.attackerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const perpX = -dz / len;
      const perpZ = dx / len;
      targetCamPos.current.set(midX + perpX * 3, 4, midZ + perpZ * 3);
    } else if (!killCam && isActive.current) {
      isActive.current = false;
      progress.current = 0;
    }
  }, [killCam, camera]);

  useFrame(() => {
    if (!isActive.current || !killCam) return;
    progress.current = Math.min(1, progress.current + 0.04);
    camera.position.lerp(targetCamPos.current, progress.current > 0.95 ? 1 : 0.1);
    camera.lookAt(targetLook.current);
  });

  return null;
}

function DustParticles() {
  const count = 40;
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
      pos.array[i3] += Math.sin(t * 0.3 + i) * 0.004;
      pos.array[i3 + 1] += Math.sin(t * 0.2 + i * 0.5) * 0.002;
      pos.array[i3 + 2] += Math.cos(t * 0.25 + i) * 0.004;
      if (pos.array[i3 + 1] > 7) pos.array[i3 + 1] = 0.5;
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#aa9977" size={0.04} transparent opacity={0.3} sizeAttenuation depthWrite={false} />
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
  const [autoFollow, setAutoFollow] = useState(true);
  const orbitRef = useRef<any>(null);

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
        gl={{
          antialias: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 1.25]}
      >
        <CameraController angleIndex={angleIndex} orbitRef={orbitRef} />
        <KillCamController killCam={state.killCam} />
        <AutoFollowCamera units={state.units} selectedUnitId={state.selectedUnitId} autoPlay={state.autoPlay && autoFollow} orbitRef={orbitRef} />
        <color attach="background" args={['#080e1a']} />
        <Stars radius={100} depth={60} count={1500} factor={3} saturation={0.3} fade speed={0.2} />

        {/* Sky dome */}
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[95, 32, 16]} />
          <meshBasicMaterial side={THREE.BackSide}>
            <color attach="color" args={['#0a101e']} />
          </meshBasicMaterial>
        </mesh>

        {/* Moon with glow */}
        <group position={[-40, 48, -35]}>
          <mesh>
            <sphereGeometry args={[4.5, 24, 24]} />
            <meshBasicMaterial color="#e8e0d0" />
          </mesh>
          {/* Moon glow */}
          <mesh>
            <sphereGeometry args={[7, 16, 16]} />
            <meshBasicMaterial color="#ccd8ee" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <pointLight color="#b8c8dd" intensity={0.6} distance={150} />
        </group>

        {/* Extended ground plane with subtle gradient */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[GRID_SIZE / 2 - 0.5, -0.15, GRID_SIZE / 2 - 0.5]}>
          <planeGeometry args={[160, 160]} />
          <meshStandardMaterial color="#0c160c" roughness={1} metalness={0} />
        </mesh>

        {/* Mountains - reduced count */}
        {Array.from({ length: 8 }, (_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const dist = 35 + Math.sin(i * 2.7) * 12;
          const height = 6 + Math.sin(i * 1.3) * 5;
          return (
            <mesh key={i} position={[
              GRID_SIZE / 2 + Math.cos(angle) * dist,
              height * 0.35,
              GRID_SIZE / 2 + Math.sin(angle) * dist
            ]}>
              <coneGeometry args={[8 + i * 1.1, height, 5]} />
              <meshStandardMaterial color="#08100a" roughness={1} />
            </mesh>
          );
        })}

        <DistantTrees />
        <CloudLayer />

        {/* ── Lighting Setup (cinematic) ── */}
        <ambientLight intensity={0.35} color="#6677aa" />
        
        {/* Main directional (moon-like key light) */}
        <directionalLight
          position={[20, 30, 15]}
          intensity={1.2}
          castShadow
          color="#ffe0b0"
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={80}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
          shadow-bias={-0.0003}
        />
        
        {/* Fill light (cool blue) */}
        <directionalLight position={[-15, 18, -12]} intensity={0.3} color="#4466aa" />
        
        {/* Rim light (warm orange from behind) */}
        <directionalLight position={[-8, 12, 25]} intensity={0.2} color="#cc8844" />
        
        {/* Hemisphere for ambient color variety */}
        <hemisphereLight intensity={0.35} color="#556688" groundColor="#1a2a12" />
        
        {/* Fog */}
        <fog attach="fog" args={['#0a101e', 35, 80]} />

        {/* Atmospheric particles - reduced */}
        <DustParticles />
        <EmberParticles />
        <ScreenShake events={state.combatEvents} />

        {/* ── Post-processing pipeline (simplified) ── */}
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.4}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
          <Vignette
            offset={0.25}
            darkness={0.7}
            blendFunction={BlendFunction.NORMAL}
          />
        </EffectComposer>

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
          ref={orbitRef}
          target={[CENTER.x, 0, CENTER.z]}
          enableRotate={true}
          enablePan={true}
          enableZoom={true}
          minDistance={8}
          maxDistance={50}
          maxPolarAngle={Math.PI / 2.3}
          minPolarAngle={Math.PI / 7}
          rotateSpeed={0.5}
          panSpeed={0.8}
          zoomSpeed={0.8}
          enableDamping={true}
          dampingFactor={0.06}
          screenSpacePanning={false}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
          touches={{
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.DOLLY_ROTATE,
          }}
        />
      </Canvas>

      {/* Camera controls overlay */}
      <div className="absolute bottom-36 right-4 z-20 pointer-events-auto flex flex-col gap-1.5">
        <button
          onClick={() => setAutoFollow(prev => !prev)}
          className={`bg-card/90 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-secondary transition-colors ${autoFollow ? 'text-primary' : 'text-muted-foreground'}`}
        >
          {autoFollow ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          <span className="text-[8px] tracking-wider">{autoFollow ? 'TRACKING ON' : 'TRACKING OFF'}</span>
        </button>
        <button
          onClick={rotateCamera}
          className="bg-card/90 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 flex items-center gap-2 text-foreground hover:bg-secondary transition-colors"
        >
          <RotateCw className="w-4 h-4 text-primary" />
          <span className="text-[8px] tracking-wider">ROTATE ({ANGLE_LABELS[angleIndex]})</span>
        </button>
      </div>

      {/* Kill Cam Overlay */}
      {state.killCam && (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
          {/* Letterbox bars */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black to-transparent" />
          {/* Vignette */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)',
          }} />
          {/* Kill info */}
          <div className="animate-fade-in flex flex-col items-center gap-3">
            <div className="text-[10px] tracking-[0.4em] text-red-400/80 font-mono uppercase">
              Eliminated
            </div>
            <div className="text-4xl font-black text-red-500 tracking-wider"
              style={{ fontFamily: "'Share Tech Mono', monospace", textShadow: '0 0 40px rgba(255,50,50,0.6), 0 0 80px rgba(255,0,0,0.3)' }}>
              ☠ {state.killCam.victimName}
            </div>
            <div className="text-[9px] tracking-[0.25em] text-muted-foreground/70 font-mono">
              by {state.killCam.killerName}
            </div>
          </div>
          {/* Film grain */}
          <div className="absolute inset-0 opacity-[0.06]" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px)',
          }} />
        </div>
      )}
    </div>
  );
}
