import { useState, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Unit, TEAM_COLORS, Team } from '@/game/types';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import * as THREE from 'three';

import fullbodySoldierBlue from '@/assets/fullbody-soldier-blue.png';
import fullbodySoldierRed from '@/assets/fullbody-soldier-red.png';
import fullbodySoldierGreen from '@/assets/fullbody-soldier-green.png';
import fullbodySoldierYellow from '@/assets/fullbody-soldier-yellow.png';
import fullbodyMedicBlue from '@/assets/fullbody-medic-blue.png';
import fullbodyMedicRed from '@/assets/fullbody-medic-red.png';
import fullbodyMedicGreen from '@/assets/fullbody-medic-green.png';
import fullbodyMedicYellow from '@/assets/fullbody-medic-yellow.png';

const FULLBODY_MAP: Record<string, string> = {
  'blue-soldier': fullbodySoldierBlue, 'red-soldier': fullbodySoldierRed,
  'green-soldier': fullbodySoldierGreen, 'yellow-soldier': fullbodySoldierYellow,
  'blue-medic': fullbodyMedicBlue, 'red-medic': fullbodyMedicRed,
  'green-medic': fullbodyMedicGreen, 'yellow-medic': fullbodyMedicYellow,
};

// ── Customization Types ──
export type HelmetStyle = 'standard' | 'tactical' | 'beret' | 'bandana';
export type VestStyle = 'light' | 'heavy' | 'tactical' | 'medic';
export type BootStyle = 'standard' | 'combat' | 'sneakers' | 'armored' | 'wrapped';
export type ShoulderStyle = 'standard' | 'heavy' | 'spikes' | 'radio';

export interface UnitCustomization {
  helmet: HelmetStyle;
  vest: VestStyle;
  boots: BootStyle;
  shoulder: ShoulderStyle;
}

const DEFAULT_CUSTOM: UnitCustomization = {
  helmet: 'standard', vest: 'light', boots: 'standard', shoulder: 'standard',
};

const HELMET_OPTIONS: { id: HelmetStyle; name: string; desc: string }[] = [
  { id: 'standard', name: 'Standard Helmet', desc: 'Basic military helmet' },
  { id: 'tactical', name: 'Tactical Helmet', desc: 'NVG-mount tactical helmet' },
  { id: 'beret', name: 'Beret', desc: 'Classic military beret' },
  { id: 'bandana', name: 'Bandana', desc: 'Stealth headband' },
];

const VEST_OPTIONS: { id: VestStyle; name: string; desc: string }[] = [
  { id: 'light', name: 'Light Vest', desc: 'Minimal chest plate' },
  { id: 'heavy', name: 'Heavy Armor', desc: 'Massive plate carrier + collar' },
  { id: 'tactical', name: 'Tactical Rig', desc: 'Pouches & ammo belts' },
  { id: 'medic', name: 'Medic Vest', desc: 'White vest with red cross' },
];

const BOOT_OPTIONS: { id: BootStyle; name: string; desc: string }[] = [
  { id: 'standard', name: 'Standard Boots', desc: 'Military-issue boots' },
  { id: 'combat', name: 'Combat Boots', desc: 'Tall reinforced boots' },
  { id: 'sneakers', name: 'Tactical Sneakers', desc: 'Lightweight & quiet' },
  { id: 'armored', name: 'Armored Greaves', desc: 'Plated leg armor + boots' },
  { id: 'wrapped', name: 'Wrapped Boots', desc: 'Bandage-wrapped desert boots' },
];

const SHOULDER_OPTIONS: { id: ShoulderStyle; name: string; desc: string }[] = [
  { id: 'standard', name: 'Standard Pads', desc: 'Basic shoulder armor' },
  { id: 'heavy', name: 'Heavy Pads', desc: 'Extra-thick shoulder plates' },
  { id: 'spikes', name: 'Spiked Pads', desc: 'Intimidating spiked shoulders' },
  { id: 'radio', name: 'Radio Gear', desc: 'Antenna + comms equipment' },
];

// Units with beards based on their portrait art
const BEARDED_UNITS = new Set(['blue-soldier', 'yellow-soldier', 'red-medic', 'yellow-medic']);

// ── Material helper (matching GameUnits.tsx) ──
function getMat(color: string, metalness = 0.1, roughness = 0.7, emissive = '#000000', emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity });
}

// ── Game-accurate SoldierBody for customization preview ──
function GameSoldierPreview({ teamColor, isMedic, customization, hasBeard }: { teamColor: string; isMedic: boolean; customization: UnitCustomization; hasBeard: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  const armorColor = useMemo(() => {
    const c = new THREE.Color(teamColor);
    return '#' + c.clone().lerp(new THREE.Color('#222222'), 0.25).getHexString();
  }, [teamColor]);
  const darkArmor = useMemo(() => {
    const c = new THREE.Color(teamColor);
    return '#' + c.clone().lerp(new THREE.Color('#111111'), 0.5).getHexString();
  }, [teamColor]);

  const torsoMat = useMemo(() => getMat(armorColor, 0.15, 0.55), [armorColor]);
  const darkMat = useMemo(() => getMat(darkArmor, 0.1, 0.7), [darkArmor]);
  const skinMat = useMemo(() => getMat('#c8a882', 0, 0.85), []);
  const beardMat = useMemo(() => getMat('#5a3a1a', 0, 0.9), []);
  const gearMat = useMemo(() => getMat('#2e2e28', 0.15, 0.6), []);
  const helmetMat = useMemo(() => getMat(armorColor, 0.25, 0.45), [armorColor]);
  const visorMat = useMemo(() => getMat('#0a0a0a', 0.8, 0.15), []);

  // Scaled up 3x from the game model for the preview
  const s = 3;

  return (
    <group ref={groupRef} position={[0, -1.0, 0]} scale={[s, s, s]}>
      {/* ── LEGS ── */}
      <mesh position={[-0.065, 0.12, 0]} material={darkMat}>
        <boxGeometry args={[0.08, 0.22, 0.08]} />
      </mesh>
      <mesh position={[0.065, 0.12, 0]} material={darkMat}>
        <boxGeometry args={[0.08, 0.22, 0.08]} />
      </mesh>

      {/* ── BOOTS ── */}
      {customization.boots === 'combat' ? (
        <>
          <mesh position={[-0.065, 0.04, 0.01]} material={bootMat}>
            <boxGeometry args={[0.09, 0.1, 0.11]} />
          </mesh>
          <mesh position={[0.065, 0.04, 0.01]} material={bootMat}>
            <boxGeometry args={[0.09, 0.1, 0.11]} />
          </mesh>
        </>
      ) : customization.boots === 'sneakers' ? (
        <>
          <mesh position={[-0.065, 0.015, 0.01]}>
            <boxGeometry args={[0.085, 0.04, 0.1]} />
            <meshStandardMaterial color="#333344" />
          </mesh>
          <mesh position={[0.065, 0.015, 0.01]}>
            <boxGeometry args={[0.085, 0.04, 0.1]} />
            <meshStandardMaterial color="#333344" />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[-0.065, 0.03, 0.01]} material={bootMat}>
            <boxGeometry args={[0.085, 0.07, 0.1]} />
          </mesh>
          <mesh position={[0.065, 0.03, 0.01]} material={bootMat}>
            <boxGeometry args={[0.085, 0.07, 0.1]} />
          </mesh>
        </>
      )}

      {/* ── TORSO (game-accurate) ── */}
      <mesh position={[0, 0.44, 0]} castShadow material={torsoMat}>
        <boxGeometry args={[0.28, 0.24, 0.16]} />
      </mesh>

      {/* ── VEST VARIANTS ── */}
      {customization.vest === 'light' && (
        <mesh position={[0, 0.46, 0.045]} material={gearMat}>
          <boxGeometry args={[0.26, 0.2, 0.04]} />
        </mesh>
      )}
      {customization.vest === 'heavy' && (
        <>
          <mesh position={[0, 0.46, 0.045]} material={gearMat}>
            <boxGeometry args={[0.28, 0.22, 0.06]} />
          </mesh>
          <mesh position={[0, 0.44, -0.1]} material={gearMat}>
            <boxGeometry args={[0.26, 0.2, 0.04]} />
          </mesh>
        </>
      )}
      {customization.vest === 'tactical' && (
        <>
          <mesh position={[0, 0.46, 0.045]} material={gearMat}>
            <boxGeometry args={[0.26, 0.2, 0.04]} />
          </mesh>
          {/* Pouches */}
          <mesh position={[-0.12, 0.38, 0.07]} material={darkMat}>
            <boxGeometry args={[0.05, 0.06, 0.03]} />
          </mesh>
          <mesh position={[0.12, 0.38, 0.07]} material={darkMat}>
            <boxGeometry args={[0.05, 0.06, 0.03]} />
          </mesh>
          <mesh position={[0, 0.36, 0.07]} material={darkMat}>
            <boxGeometry args={[0.06, 0.04, 0.03]} />
          </mesh>
        </>
      )}
      {customization.vest === 'medic' && (
        <>
          <mesh position={[0, 0.46, 0.045]}>
            <boxGeometry args={[0.26, 0.2, 0.04]} />
            <meshStandardMaterial color="#dddddd" metalness={0.05} roughness={0.7} />
          </mesh>
          {/* Red cross */}
          <mesh position={[0, 0.48, 0.069]}>
            <boxGeometry args={[0.06, 0.02, 0.002]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 0.48, 0.069]}>
            <boxGeometry args={[0.02, 0.06, 0.002]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.3} />
          </mesh>
        </>
      )}

      {/* Belt */}
      <mesh position={[0, 0.32, 0]} material={bootMat}>
        <boxGeometry args={[0.27, 0.03, 0.15]} />
      </mesh>

      {/* Team color stripe on chest */}
      <mesh position={[0, 0.48, 0.066]}>
        <boxGeometry args={[0.08, 0.08, 0.002]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.3} />
      </mesh>

      {/* ── HEAD ── */}
      <group position={[0, 0.64, 0]}>
        {/* Neck */}
        <mesh position={[0, -0.04, 0]} material={skinMat}>
          <cylinderGeometry args={[0.04, 0.045, 0.05, 6]} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 0.04, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.12, 0.12, 0.11]} />
        </mesh>

        {/* ── HELMET VARIANTS ── */}
        {customization.helmet === 'standard' && (
          <>
            <mesh position={[0, 0.09, 0]} castShadow material={helmetMat}>
              <sphereGeometry args={[0.085, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            </mesh>
            <mesh position={[0, 0.06, 0]} material={helmetMat}>
              <cylinderGeometry args={[0.088, 0.088, 0.018, 8]} />
            </mesh>
          </>
        )}
        {customization.helmet === 'tactical' && (
          <>
            <mesh position={[0, 0.09, 0]} castShadow material={helmetMat}>
              <sphereGeometry args={[0.085, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            </mesh>
            <mesh position={[0, 0.06, 0]} material={helmetMat}>
              <cylinderGeometry args={[0.088, 0.088, 0.018, 8]} />
            </mesh>
            {/* NVG mount */}
            <mesh position={[0, 0.08, 0.07]}>
              <boxGeometry args={[0.03, 0.025, 0.04]} />
              <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.3} />
            </mesh>
            {/* NVG tubes */}
            <mesh position={[-0.012, 0.075, 0.095]}>
              <cylinderGeometry args={[0.008, 0.008, 0.03, 6]} />
              <meshStandardMaterial color="#0a0a0a" metalness={0.7} roughness={0.2} />
            </mesh>
            <mesh position={[0.012, 0.075, 0.095]}>
              <cylinderGeometry args={[0.008, 0.008, 0.03, 6]} />
              <meshStandardMaterial color="#0a0a0a" metalness={0.7} roughness={0.2} />
            </mesh>
          </>
        )}
        {customization.helmet === 'beret' && (
          <mesh position={[0.02, 0.09, 0]}>
            <cylinderGeometry args={[0.08, 0.07, 0.03, 8]} />
            <meshStandardMaterial color="#8b1a1a" />
          </mesh>
        )}
        {customization.helmet === 'bandana' && (
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.13, 0.025, 0.12]} />
            <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.15} />
          </mesh>
        )}

        {/* Visor */}
        <mesh position={[0, 0.05, 0.055]} material={visorMat}>
          <boxGeometry args={[0.1, 0.025, 0.02]} />
        </mesh>
      </group>

      {/* ── BACKPACK ── */}
      <mesh position={[0, 0.44, -0.12]} material={gearMat} castShadow>
        <boxGeometry args={[0.18, 0.18, 0.08]} />
      </mesh>

      {/* ── SHOULDER PAD VARIANTS ── */}
      {customization.shoulder === 'standard' && (
        <>
          <mesh position={[-0.17, 0.52, 0]} castShadow material={helmetMat}>
            <boxGeometry args={[0.06, 0.07, 0.12]} />
          </mesh>
          <mesh position={[0.17, 0.52, 0]} castShadow material={helmetMat}>
            <boxGeometry args={[0.06, 0.07, 0.12]} />
          </mesh>
        </>
      )}
      {customization.shoulder === 'heavy' && (
        <>
          <mesh position={[-0.18, 0.53, 0]} castShadow material={helmetMat}>
            <boxGeometry args={[0.08, 0.09, 0.14]} />
          </mesh>
          <mesh position={[0.18, 0.53, 0]} castShadow material={helmetMat}>
            <boxGeometry args={[0.08, 0.09, 0.14]} />
          </mesh>
          {/* Extra plate */}
          <mesh position={[-0.2, 0.54, 0]} material={gearMat}>
            <boxGeometry args={[0.02, 0.06, 0.1]} />
          </mesh>
          <mesh position={[0.2, 0.54, 0]} material={gearMat}>
            <boxGeometry args={[0.02, 0.06, 0.1]} />
          </mesh>
        </>
      )}
      {customization.shoulder === 'spikes' && (
        <>
          <mesh position={[-0.17, 0.52, 0]} castShadow material={helmetMat}>
            <boxGeometry args={[0.06, 0.07, 0.12]} />
          </mesh>
          <mesh position={[0.17, 0.52, 0]} castShadow material={helmetMat}>
            <boxGeometry args={[0.06, 0.07, 0.12]} />
          </mesh>
          {/* Spikes */}
          <mesh position={[-0.2, 0.58, 0]}>
            <coneGeometry args={[0.015, 0.06, 4]} />
            <meshStandardMaterial color="#333333" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[-0.2, 0.58, 0.04]}>
            <coneGeometry args={[0.012, 0.05, 4]} />
            <meshStandardMaterial color="#333333" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0.2, 0.58, 0]}>
            <coneGeometry args={[0.015, 0.06, 4]} />
            <meshStandardMaterial color="#333333" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0.2, 0.58, 0.04]}>
            <coneGeometry args={[0.012, 0.05, 4]} />
            <meshStandardMaterial color="#333333" metalness={0.7} roughness={0.3} />
          </mesh>
        </>
      )}
      {customization.shoulder === 'radio' && (
        <>
          <mesh position={[-0.17, 0.52, 0]} castShadow material={helmetMat}>
            <boxGeometry args={[0.06, 0.07, 0.12]} />
          </mesh>
          <mesh position={[0.17, 0.52, 0]} castShadow material={helmetMat}>
            <boxGeometry args={[0.06, 0.07, 0.12]} />
          </mesh>
          {/* Radio box on left shoulder */}
          <mesh position={[-0.2, 0.56, -0.02]} material={gearMat}>
            <boxGeometry args={[0.04, 0.04, 0.04]} />
          </mesh>
          {/* Antenna */}
          <mesh position={[-0.2, 0.64, -0.02]}>
            <cylinderGeometry args={[0.003, 0.003, 0.14, 4]} />
            <meshStandardMaterial color="#222222" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[-0.2, 0.72, -0.02]}>
            <sphereGeometry args={[0.008, 4, 4]} />
            <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.6} />
          </mesh>
        </>
      )}

      {/* ── ARMS ── */}
      <group position={[-0.19, 0.44, 0]}>
        <mesh material={torsoMat}><boxGeometry args={[0.06, 0.2, 0.06]} /></mesh>
        <mesh position={[0, -0.12, 0]} material={skinMat}><boxGeometry args={[0.05, 0.05, 0.05]} /></mesh>
      </group>
      <group position={[0.19, 0.44, 0]}>
        <mesh material={torsoMat}><boxGeometry args={[0.06, 0.2, 0.06]} /></mesh>
        <mesh position={[0, -0.12, 0]} material={skinMat}><boxGeometry args={[0.05, 0.05, 0.05]} /></mesh>
      </group>

      {/* ── Medic red cross (game-accurate) ── */}
      {isMedic && (
        <>
          <mesh position={[0, 0.48, 0.069]}>
            <boxGeometry args={[0.08, 0.025, 0.002]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0, 0.48, 0.069]}>
            <boxGeometry args={[0.025, 0.08, 0.002]} />
            <meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.5} />
          </mesh>
          {/* White background */}
          <mesh position={[0, 0.48, 0.067]}>
            <boxGeometry args={[0.1, 0.1, 0.002]} />
            <meshStandardMaterial color="#dddddd" />
          </mesh>
        </>
      )}

      {/* ── WEAPON (pistol default) ── */}
      <group position={[0.19, 0.32, 0.08]}>
        <mesh><boxGeometry args={[0.025, 0.04, 0.14]} /><meshStandardMaterial color="#2a2a2a" metalness={0.7} roughness={0.3} /></mesh>
        <mesh position={[0, -0.02, -0.05]}><boxGeometry args={[0.022, 0.055, 0.06]} /><meshStandardMaterial color="#3a2818" /></mesh>
      </group>

      {/* ── Selection ring ── */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.18, 16]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.5} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ── Gear Selector Row ──
function GearSelector<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; name: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const idx = options.findIndex(o => o.id === value);
  const prev = () => onChange(options[(idx - 1 + options.length) % options.length].id);
  const next = () => onChange(options[(idx + 1) % options.length].id);
  const current = options[idx];

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 text-[10px] text-muted-foreground tracking-[0.15em] font-display shrink-0">{label}</div>
      <button onClick={prev} className="w-7 h-7 rounded bg-secondary/60 hover:bg-secondary flex items-center justify-center transition-colors">
        <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <div className="flex-1 text-center px-2 py-1.5 rounded border border-border/20 bg-card/40 min-w-[120px]">
        <div className="text-xs font-bold text-foreground">{current.name}</div>
        {current.desc && <div className="text-[9px] text-muted-foreground/60">{current.desc}</div>}
      </div>
      <button onClick={next} className="w-7 h-7 rounded bg-secondary/60 hover:bg-secondary flex items-center justify-center transition-colors">
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

// ── Main Modal ──
interface CustomizationModalProps {
  unit: Unit;
  onClose: () => void;
  customization: UnitCustomization;
  onCustomizationChange: (c: UnitCustomization) => void;
}

export function CustomizationModal({ unit, onClose, customization, onCustomizationChange }: CustomizationModalProps) {
  const teamColor = TEAM_COLORS[unit.team];
  const [localCustom, setLocalCustom] = useState<UnitCustomization>(customization);

  const updateField = <K extends keyof UnitCustomization>(key: K, value: UnitCustomization[K]) => {
    const updated = { ...localCustom, [key]: value };
    setLocalCustom(updated);
    onCustomizationChange(updated);
  };

  // Replace camo with shoulder
  const handleShoulderChange = (v: ShoulderStyle) => updateField('shoulder', v);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />

      <div
        className="relative z-10 w-full max-w-[900px] mx-4 rounded-xl overflow-hidden border-2 flex flex-col sm:flex-row"
        style={{ borderColor: teamColor + '50' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left: Full-body portrait */}
        <div
          className="hidden sm:flex w-[200px] shrink-0 flex-col items-center justify-end relative overflow-hidden"
          style={{ background: `linear-gradient(180deg, ${teamColor}15 0%, ${teamColor}08 50%, hsl(220, 20%, 8%) 100%)` }}
        >
          <div className="absolute top-0 left-0 right-0 h-20 opacity-30"
            style={{ background: `radial-gradient(ellipse at center top, ${teamColor}, transparent 70%)` }} />
          {(() => {
            const fb = FULLBODY_MAP[`${unit.team}-${unit.unitClass}`];
            return fb ? (
              <img src={fb} alt={unit.name} className="relative z-10 w-[180px] h-auto object-contain drop-shadow-2xl"
                style={{ filter: `drop-shadow(0 0 20px ${teamColor}40)` }} />
            ) : null;
          })()}
          <div className="relative z-10 w-full bg-card/90 backdrop-blur-sm py-2 px-3 text-center border-t border-border/30">
            <div className="text-[11px] font-bold text-foreground">{unit.name}</div>
            <div className="text-[7px] uppercase tracking-[0.2em] mt-0.5" style={{ color: teamColor }}>
              {unit.unitClass} • {unit.team} TEAM
            </div>
          </div>
        </div>

        {/* Center: 3D Viewer */}
        <div className="w-full sm:w-[300px] h-[280px] sm:h-[420px] bg-card/90 relative shrink-0">
          <div className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
            style={{ background: `linear-gradient(180deg, ${teamColor}15, transparent)` }} />

          <Canvas camera={{ position: [0, 0.5, 4.2], fov: 38 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[3, 5, 3]} intensity={1} />
            <directionalLight position={[-2, 3, -1]} intensity={0.3} />
            <pointLight position={[0, 2, 2]} intensity={0.4} color={teamColor} />
            <Suspense fallback={null}>
              <GameSoldierPreview
                teamColor={teamColor}
                isMedic={unit.unitClass === 'medic'}
                customization={localCustom}
              />
            </Suspense>
            <OrbitControls
              enableZoom={false}
              enablePan={false}
              minPolarAngle={Math.PI * 0.3}
              maxPolarAngle={Math.PI * 0.65}
            />
          </Canvas>

          {/* Label */}
          <div className="absolute bottom-0 left-0 right-0 bg-card/80 backdrop-blur-sm px-3 py-1.5 border-t border-border/20 z-10">
            <div className="text-[9px] text-muted-foreground tracking-wider text-center">3D PREVIEW</div>
          </div>
        </div>

        {/* Gear Selector Panel */}
        <div className="flex-1 bg-card/95 backdrop-blur-md flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
            <div>
              <div className="text-xs font-display font-bold tracking-[0.2em] text-foreground">CUSTOMIZE GEAR</div>
              <div className="text-[9px] text-muted-foreground/60">Configure loadout appearance</div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Gear options */}
          <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
            <GearSelector
              label="HELMET"
              options={HELMET_OPTIONS}
              value={localCustom.helmet}
              onChange={v => updateField('helmet', v)}
            />
            <GearSelector
              label="VEST"
              options={VEST_OPTIONS}
              value={localCustom.vest}
              onChange={v => updateField('vest', v)}
            />
            <GearSelector
              label="BOOTS"
              options={BOOT_OPTIONS}
              value={localCustom.boots}
              onChange={v => updateField('boots', v)}
            />
            <GearSelector
              label="SHOULDER"
              options={SHOULDER_OPTIONS}
              value={localCustom.shoulder}
              onChange={handleShoulderChange}
            />
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border/20 flex items-center justify-between">
            <div className="text-[9px] text-muted-foreground/40">Changes are cosmetic only</div>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-xs font-bold tracking-[0.15em] font-display transition-all"
              style={{ backgroundColor: teamColor, color: '#0a0e14' }}
            >
              CONFIRM
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_CUSTOM };
export type { UnitCustomization as CustomizationType };
