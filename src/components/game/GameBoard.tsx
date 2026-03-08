import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GridTiles } from './GridTiles';
import { GameUnits } from './GameUnits';
import { ZoneBorder } from './ZoneBorder';
import { CombatVFX } from './CombatVFX';
import { ScreenShake } from './ScreenShake';
import { EmberParticles, DistantTrees, CloudLayer } from './EnvironmentVFX';
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

// ── KILL CAM: Cinematic slow-zoom to elimination ──
function KillCamController({ killCam }: { killCam: KillCamData | null }) {
  const { camera } = useThree();
  const savedPos = useRef(new THREE.Vector3());
  const savedLookAt = useRef(new THREE.Vector3());
  const isActive = useRef(false);
  const phase = useRef<'zoom_in' | 'hold' | 'zoom_out'>('zoom_in');
  const progress = useRef(0);
  const targetLook = useRef(new THREE.Vector3());
  const targetCamPos = useRef(new THREE.Vector3());
  const startLook = useRef(new THREE.Vector3());

  useEffect(() => {
    if (killCam && !isActive.current) {
      savedPos.current.copy(camera.position);
      // Approximate where camera was looking
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      savedLookAt.current.copy(camera.position).add(dir.multiplyScalar(20));

      isActive.current = true;
      phase.current = 'zoom_in';
      progress.current = 0;

      // Position camera low and close, slightly to the side of the action
      const dx = killCam.targetPos.x - killCam.attackerPos.x;
      const dz = killCam.targetPos.z - killCam.attackerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const perpX = -dz / len;
      const perpZ = dx / len;

      // Start from attacker's shoulder perspective
      startLook.current.set(
        killCam.attackerPos.x + dx * 0.3,
        1.5,
        killCam.attackerPos.z + dz * 0.3
      );

      // End looking at the victim from a dramatic low angle
      targetLook.current.set(killCam.targetPos.x, 0.8, killCam.targetPos.z);

      // Camera sweeps from behind attacker to a cinematic side angle
      targetCamPos.current.set(
        killCam.targetPos.x + perpX * 2.5 + dx / len * -1.5,
        2.2,
        killCam.targetPos.z + perpZ * 2.5 + dz / len * -1.5
      );
    } else if (!killCam && isActive.current) {
      // Smoothly return
      phase.current = 'zoom_out';
      progress.current = 0;
    }
  }, [killCam, camera]);

  useFrame((_, delta) => {
    if (!isActive.current) return;

    const speed = phase.current === 'zoom_in' ? 0.6 : phase.current === 'hold' ? 0 : 1.2;
    progress.current = Math.min(1, progress.current + delta * speed);
    // Smooth ease-out cubic
    const t = 1 - Math.pow(1 - progress.current, 3);

    if (phase.current === 'zoom_in') {
      camera.position.lerpVectors(savedPos.current, targetCamPos.current, t);
      // Smoothly shift look target from start to victim
      const lookTarget = new THREE.Vector3().lerpVectors(startLook.current, targetLook.current, t);
      camera.lookAt(lookTarget);
      // Subtle FOV zoom effect (narrow FOV = zoom)
      if ('fov' in camera && camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(38, 28, t);
        camera.updateProjectionMatrix();
      }
      if (progress.current >= 1) {
        phase.current = 'hold';
        progress.current = 0;
      }
    } else if (phase.current === 'hold') {
      camera.lookAt(targetLook.current);
      // Very slow creep forward during hold
      camera.position.lerp(
        new THREE.Vector3(
          targetCamPos.current.x * 0.95 + targetLook.current.x * 0.05,
          targetCamPos.current.y - 0.3,
          targetCamPos.current.z * 0.95 + targetLook.current.z * 0.05
        ),
        delta * 0.3
      );
    } else if (phase.current === 'zoom_out') {
      camera.position.lerpVectors(targetCamPos.current, savedPos.current, t);
      if ('fov' in camera && camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(28, 38, t);
        camera.updateProjectionMatrix();
      }
      if (progress.current >= 1) {
        isActive.current = false;
        camera.position.copy(savedPos.current);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = 38;
          camera.updateProjectionMatrix();
        }
      }
    }
  });

  return (
    <>
      {/* Dramatic spotlight on victim during kill cam */}
      {killCam && (
        <group>
          {/* Warm spotlight from above on victim */}
          <spotLight
            position={[killCam.targetPos.x, 8, killCam.targetPos.z]}
            target-position={[killCam.targetPos.x, 0, killCam.targetPos.z]}
            angle={0.4}
            penumbra={0.8}
            intensity={3}
            color="#ff6633"
            distance={15}
            castShadow
          />
          {/* Cold rim light from behind */}
          <pointLight
            position={[killCam.attackerPos.x, 3, killCam.attackerPos.z]}
            intensity={1.5}
            color="#4488ff"
            distance={8}
          />
          {/* Ground impact glow */}
          <mesh
            position={[killCam.targetPos.x, 0.02, killCam.targetPos.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[1.5, 16]} />
            <meshBasicMaterial color="#ff3300" transparent opacity={0.15} />
          </mesh>
        </group>
      )}
    </>
  );
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
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 1.5]}
      >
        <CameraController angleIndex={angleIndex} orbitRef={orbitRef} />
        <KillCamController killCam={state.killCam} />
        <AutoFollowCamera units={state.units} selectedUnitId={state.selectedUnitId} autoPlay={state.autoPlay && autoFollow} orbitRef={orbitRef} />
        <color attach="background" args={['#0c1220']} />
        <Stars radius={100} depth={60} count={1200} factor={2.5} saturation={0.2} fade speed={0.15} />

        {/* Sky dome — deeper blue-gray */}
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[95, 24, 12]} />
          <meshBasicMaterial side={THREE.BackSide} color="#0e1628" />
        </mesh>

        {/* Moon — cleaner */}
        <group position={[-40, 48, -35]}>
          <mesh>
            <sphereGeometry args={[4, 16, 16]} />
            <meshBasicMaterial color="#e8e2d8" />
          </mesh>
          <pointLight color="#b8c8dd" intensity={0.5} distance={150} />
        </group>

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[GRID_SIZE / 2 - 0.5, -0.15, GRID_SIZE / 2 - 0.5]} receiveShadow>
          <planeGeometry args={[140, 140]} />
          <meshStandardMaterial color="#0e1a0e" roughness={1} metalness={0} />
        </mesh>

        {/* Mountains — cleaner silhouettes */}
        {Array.from({ length: 10 }, (_, i) => {
          const angle = (i / 10) * Math.PI * 2;
          const dist = 38 + Math.sin(i * 2.7) * 10;
          const height = 8 + Math.sin(i * 1.3) * 5;
          return (
            <mesh key={i} position={[
              GRID_SIZE / 2 + Math.cos(angle) * dist,
              height * 0.35,
              GRID_SIZE / 2 + Math.sin(angle) * dist
            ]}>
              <coneGeometry args={[7 + i * 0.8, height, 5]} />
              <meshStandardMaterial color="#0a120c" roughness={1} />
            </mesh>
          );
        })}

        <DistantTrees />
        <CloudLayer />

        {/* ── Lighting — XCOM-style dramatic ── */}
        <ambientLight intensity={0.4} color="#5566aa" />
        
        {/* Key light — warm directional */}
        <directionalLight
          position={[18, 28, 12]}
          intensity={1.4}
          castShadow
          color="#ffd8a0"
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
        
        {/* Fill light — cool blue */}
        <directionalLight position={[-12, 16, -10]} intensity={0.35} color="#4466bb" />
        
        {/* Rim light — accent orange */}
        <directionalLight position={[-6, 10, 20]} intensity={0.25} color="#cc8844" />
        
        {/* Hemisphere */}
        <hemisphereLight intensity={0.3} color="#556688" groundColor="#1a2a14" />
        
        {/* Fog — slightly less aggressive */}
        <fog attach="fog" args={['#0c1220', 40, 85]} />

        {/* Particles */}
        <DustParticles />
        <EmberParticles />
        <ScreenShake events={state.combatEvents} />

        {/* Post-processing */}
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.35}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.85}
            mipmapBlur
          />
          <Vignette
            offset={0.2}
            darkness={0.6}
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
          minDistance={12}
          maxDistance={45}
          maxPolarAngle={Math.PI / 2.5}
          minPolarAngle={Math.PI / 6}
          rotateSpeed={0.3}
          panSpeed={0.5}
          zoomSpeed={0.6}
          enableDamping={true}
          dampingFactor={0.12}
          screenSpacePanning={false}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          touches={{
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
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

      {/* Kill Cam Overlay — Cinematic */}
      {state.killCam && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          {/* Letterbox bars — wider for cinematic ratio */}
          <div className="absolute top-0 left-0 right-0 h-[12%] bg-black transition-all duration-700" />
          <div className="absolute bottom-0 left-0 right-0 h-[12%] bg-black transition-all duration-700" />
          {/* Deep vignette */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.85) 100%)',
          }} />
          {/* Red accent edge flare */}
          <div className="absolute inset-0 opacity-30" style={{
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(180,30,0,0.3) 100%)',
          }} />
          {/* Kill info — bottom-left Gears-style */}
          <div className="absolute bottom-[14%] left-8 animate-fade-in flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div className="w-1 h-12 bg-destructive rounded-full" />
              <div>
                <div className="text-[9px] tracking-[0.5em] text-destructive/80 font-mono uppercase mb-1">
                  ELIMINATED
                </div>
                <div className="text-3xl font-black text-foreground tracking-wide"
                  style={{ textShadow: '0 0 30px rgba(255,50,50,0.4), 0 2px 8px rgba(0,0,0,0.8)' }}>
                  {state.killCam.victimName}
                </div>
                <div className="text-[10px] tracking-[0.2em] text-muted-foreground/80 font-mono mt-0.5">
                  ▸ {state.killCam.killerName}
                </div>
              </div>
            </div>
          </div>
          {/* Scanline / film grain */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)',
          }} />
          {/* Chromatic aberration hint — top-right corner flash */}
          <div className="absolute top-[12%] right-0 w-32 h-32 opacity-20" style={{
            background: 'radial-gradient(circle, rgba(255,100,50,0.5) 0%, transparent 70%)',
          }} />
        </div>
      )}
    </div>
  );
}
