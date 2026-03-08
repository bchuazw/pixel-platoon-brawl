import { useState, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Unit, TEAM_COLORS, Team } from '@/game/types';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import * as THREE from 'three';

// ── Customization Types ──
export type HelmetStyle = 'standard' | 'tactical' | 'beret' | 'bandana';
export type VestStyle = 'light' | 'heavy' | 'tactical' | 'medic';
export type BootStyle = 'standard' | 'combat' | 'sneakers';
export type CamoPattern = 'solid' | 'woodland' | 'desert' | 'urban';

export interface UnitCustomization {
  helmet: HelmetStyle;
  vest: VestStyle;
  boots: BootStyle;
  camo: CamoPattern;
}

const DEFAULT_CUSTOM: UnitCustomization = {
  helmet: 'standard', vest: 'light', boots: 'standard', camo: 'solid',
};

const HELMET_OPTIONS: { id: HelmetStyle; name: string; desc: string }[] = [
  { id: 'standard', name: 'Standard Helmet', desc: 'Basic military helmet' },
  { id: 'tactical', name: 'Tactical Helmet', desc: 'NVG-mount tactical helmet' },
  { id: 'beret', name: 'Beret', desc: 'Classic military beret' },
  { id: 'bandana', name: 'Bandana', desc: 'Stealth headband' },
];

const VEST_OPTIONS: { id: VestStyle; name: string; desc: string }[] = [
  { id: 'light', name: 'Light Vest', desc: 'Lightweight carrier' },
  { id: 'heavy', name: 'Heavy Armor', desc: 'Full ballistic plate carrier' },
  { id: 'tactical', name: 'Tactical Rig', desc: 'Modular pouch system' },
  { id: 'medic', name: 'Medic Vest', desc: 'Medical supplies carrier' },
];

const BOOT_OPTIONS: { id: BootStyle; name: string; desc: string }[] = [
  { id: 'standard', name: 'Standard Boots', desc: 'Military-issue boots' },
  { id: 'combat', name: 'Combat Boots', desc: 'Reinforced tall boots' },
  { id: 'sneakers', name: 'Tactical Sneakers', desc: 'Lightweight & quiet' },
];

const CAMO_OPTIONS: { id: CamoPattern; name: string; colors: [string, string] }[] = [
  { id: 'solid', name: 'Solid', colors: ['#556B2F', '#4a5f28'] },
  { id: 'woodland', name: 'Woodland', colors: ['#2d4a1e', '#5c3d1a'] },
  { id: 'desert', name: 'Desert', colors: ['#c4a76c', '#8b7355'] },
  { id: 'urban', name: 'Urban', colors: ['#6b6b6b', '#3d3d3d'] },
];

// ── 3D Character Model ──
function CharacterModel({ teamColor, customization }: { teamColor: string; customization: UnitCustomization }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3;
    }
  });

  const camoColors = CAMO_OPTIONS.find(c => c.id === customization.camo)?.colors || ['#556B2F', '#4a5f28'];
  const bodyColor = camoColors[0];
  const darkColor = camoColors[1];
  const skinColor = '#d4a574';

  return (
    <group ref={groupRef} position={[0, -1.2, 0]}>
      {/* Legs */}
      <mesh position={[-0.15, 0.4, 0]}>
        <boxGeometry args={[0.22, 0.7, 0.22]} />
        <meshStandardMaterial color={darkColor} />
      </mesh>
      <mesh position={[0.15, 0.4, 0]}>
        <boxGeometry args={[0.22, 0.7, 0.22]} />
        <meshStandardMaterial color={darkColor} />
      </mesh>

      {/* Boots */}
      {customization.boots === 'combat' ? (
        <>
          <mesh position={[-0.15, 0.15, 0.04]}>
            <boxGeometry args={[0.26, 0.3, 0.32]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[0.15, 0.15, 0.04]}>
            <boxGeometry args={[0.26, 0.3, 0.32]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        </>
      ) : customization.boots === 'sneakers' ? (
        <>
          <mesh position={[-0.15, 0.06, 0.04]}>
            <boxGeometry args={[0.24, 0.12, 0.3]} />
            <meshStandardMaterial color="#333344" />
          </mesh>
          <mesh position={[0.15, 0.06, 0.04]}>
            <boxGeometry args={[0.24, 0.12, 0.3]} />
            <meshStandardMaterial color="#333344" />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[-0.15, 0.1, 0.04]}>
            <boxGeometry args={[0.24, 0.2, 0.3]} />
            <meshStandardMaterial color="#2a2a1a" />
          </mesh>
          <mesh position={[0.15, 0.1, 0.04]}>
            <boxGeometry args={[0.24, 0.2, 0.3]} />
            <meshStandardMaterial color="#2a2a1a" />
          </mesh>
        </>
      )}

      {/* Torso */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.55, 0.7, 0.3]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>

      {/* Vest */}
      {customization.vest === 'heavy' && (
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[0.62, 0.6, 0.38]} />
          <meshStandardMaterial color="#2a2a2a" />
        </mesh>
      )}
      {customization.vest === 'tactical' && (
        <>
          <mesh position={[0, 1.15, 0]}>
            <boxGeometry args={[0.58, 0.55, 0.34]} />
            <meshStandardMaterial color="#3a3a2a" />
          </mesh>
          {/* Pouches */}
          <mesh position={[0.22, 1.0, 0.18]}>
            <boxGeometry args={[0.1, 0.12, 0.08]} />
            <meshStandardMaterial color={darkColor} />
          </mesh>
          <mesh position={[-0.22, 1.0, 0.18]}>
            <boxGeometry args={[0.1, 0.12, 0.08]} />
            <meshStandardMaterial color={darkColor} />
          </mesh>
        </>
      )}
      {customization.vest === 'medic' && (
        <>
          <mesh position={[0, 1.15, 0]}>
            <boxGeometry args={[0.58, 0.55, 0.34]} />
            <meshStandardMaterial color="#f0f0f0" />
          </mesh>
          {/* Red cross */}
          <mesh position={[0, 1.2, 0.18]}>
            <boxGeometry args={[0.2, 0.06, 0.01]} />
            <meshStandardMaterial color="#cc2222" />
          </mesh>
          <mesh position={[0, 1.2, 0.18]}>
            <boxGeometry args={[0.06, 0.2, 0.01]} />
            <meshStandardMaterial color="#cc2222" />
          </mesh>
        </>
      )}
      {customization.vest === 'light' && (
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[0.56, 0.45, 0.32]} />
          <meshStandardMaterial color={bodyColor} opacity={0.8} transparent />
        </mesh>
      )}

      {/* Arms */}
      <mesh position={[-0.38, 1.1, 0]}>
        <boxGeometry args={[0.18, 0.65, 0.18]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0.38, 1.1, 0]}>
        <boxGeometry args={[0.18, 0.65, 0.18]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>

      {/* Hands */}
      <mesh position={[-0.38, 0.72, 0]}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      <mesh position={[0.38, 0.72, 0]}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.65, 0]}>
        <boxGeometry args={[0.32, 0.32, 0.3]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.48, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.1, 8]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>

      {/* Team armband */}
      <mesh position={[0.38, 1.3, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.06, 8]} />
        <meshStandardMaterial color={teamColor} />
      </mesh>

      {/* Helmet */}
      {customization.helmet === 'standard' && (
        <mesh position={[0, 1.85, 0]}>
          <boxGeometry args={[0.38, 0.15, 0.36]} />
          <meshStandardMaterial color="#3a3a2a" />
        </mesh>
      )}
      {customization.helmet === 'tactical' && (
        <>
          <mesh position={[0, 1.85, 0]}>
            <sphereGeometry args={[0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            <meshStandardMaterial color="#2a2a2a" />
          </mesh>
          {/* NVG mount */}
          <mesh position={[0, 1.92, 0.18]}>
            <boxGeometry args={[0.08, 0.06, 0.12]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        </>
      )}
      {customization.helmet === 'beret' && (
        <mesh position={[0.06, 1.84, 0]}>
          <cylinderGeometry args={[0.2, 0.18, 0.06, 8]} />
          <meshStandardMaterial color="#8b1a1a" />
        </mesh>
      )}
      {customization.helmet === 'bandana' && (
        <mesh position={[0, 1.8, 0]}>
          <boxGeometry args={[0.36, 0.06, 0.34]} />
          <meshStandardMaterial color={teamColor} />
        </mesh>
      )}
    </group>
  );
}

// ── Gear Selector Row ──
function GearSelector<T extends string>({
  label,
  options,
  value,
  onChange,
  teamColor,
}: {
  label: string;
  options: { id: T; name: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
  teamColor: string;
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />

      <div
        className="relative z-10 w-full max-w-[700px] mx-4 rounded-xl overflow-hidden border-2 flex flex-col sm:flex-row"
        style={{ borderColor: teamColor + '50' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 3D Viewer */}
        <div className="w-full sm:w-[300px] h-[280px] sm:h-[420px] bg-card/90 relative shrink-0">
          <div className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
            style={{ background: `linear-gradient(180deg, ${teamColor}15, transparent)` }} />

          <Canvas camera={{ position: [0, 0.5, 3], fov: 45 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[3, 5, 3]} intensity={1} />
            <directionalLight position={[-2, 3, -1]} intensity={0.3} />
            <Suspense fallback={null}>
              <CharacterModel teamColor={teamColor} customization={localCustom} />
            </Suspense>
            <OrbitControls
              enableZoom={false}
              enablePan={false}
              minPolarAngle={Math.PI * 0.3}
              maxPolarAngle={Math.PI * 0.65}
            />
          </Canvas>

          {/* Unit name overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-card/80 backdrop-blur-sm px-4 py-2 border-t border-border/20 z-10">
            <div className="text-sm font-bold text-foreground">{unit.name}</div>
            <div className="text-[10px] uppercase tracking-[0.15em]" style={{ color: teamColor }}>
              {unit.unitClass} • {unit.team} TEAM
            </div>
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
              teamColor={teamColor}
            />
            <GearSelector
              label="VEST"
              options={VEST_OPTIONS}
              value={localCustom.vest}
              onChange={v => updateField('vest', v)}
              teamColor={teamColor}
            />
            <GearSelector
              label="BOOTS"
              options={BOOT_OPTIONS}
              value={localCustom.boots}
              onChange={v => updateField('boots', v)}
              teamColor={teamColor}
            />

            {/* Camo Pattern - visual grid */}
            <div>
              <div className="text-[10px] text-muted-foreground tracking-[0.15em] font-display mb-2">CAMO PATTERN</div>
              <div className="grid grid-cols-4 gap-2">
                {CAMO_OPTIONS.map(camo => (
                  <button
                    key={camo.id}
                    onClick={() => updateField('camo', camo.id)}
                    className={`rounded-lg border-2 p-2 transition-all ${
                      localCustom.camo === camo.id
                        ? 'border-primary scale-105 shadow-[0_0_12px_hsl(142_70%_45%/0.2)]'
                        : 'border-border/20 hover:border-border/40'
                    }`}
                  >
                    <div className="w-full h-6 rounded-sm mb-1"
                      style={{ background: `linear-gradient(135deg, ${camo.colors[0]}, ${camo.colors[1]})` }} />
                    <div className="text-[9px] text-center text-muted-foreground">{camo.name}</div>
                  </button>
                ))}
              </div>
            </div>
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
