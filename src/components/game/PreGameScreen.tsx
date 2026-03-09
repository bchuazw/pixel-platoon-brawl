import { useEffect, useState, useCallback, useMemo } from 'react';
import { startAmbientAudio, stopAmbientAudio } from '@/game/ambientAudio';
import { GameState, Unit, TEAM_COLORS, Team } from '@/game/types';
import { Play, Swords, Heart, Shield, Crosshair, Coins, Lock, Settings } from 'lucide-react';
import { CryptoBettingPanel } from './CryptoBettingPanel';
import { CustomizationModal, DEFAULT_CUSTOM, UnitCustomization } from './CustomizationModal';

import portraitSoldierBlue from '@/assets/portrait-soldier-blue.png';
import portraitSoldierRed from '@/assets/portrait-soldier-red.png';
import portraitSoldierGreen from '@/assets/portrait-soldier-green.png';
import portraitSoldierYellow from '@/assets/portrait-soldier-yellow.png';
import portraitMedicBlue from '@/assets/portrait-medic-blue.png';
import portraitMedicRed from '@/assets/portrait-medic-red.png';
import portraitMedicGreen from '@/assets/portrait-medic-green.png';
import portraitMedicYellow from '@/assets/portrait-medic-yellow.png';

const PORTRAITS: Record<string, string> = {
  'blue-soldier': portraitSoldierBlue, 'red-soldier': portraitSoldierRed,
  'green-soldier': portraitSoldierGreen, 'yellow-soldier': portraitSoldierYellow,
  'blue-medic': portraitMedicBlue, 'red-medic': portraitMedicRed,
  'green-medic': portraitMedicGreen, 'yellow-medic': portraitMedicYellow,
};

const TEAM_NAMES: Record<Team, string> = {
  blue: 'AZURE WOLVES', red: 'CRIMSON HAWKS',
  green: 'JADE VIPERS', yellow: 'GOLD LIONS',
};

interface PreGameScreenProps {
  state: GameState;
  onStartAutoPlay: () => void;
}

function Reveal({ delay, children }: { delay: number; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div className="transition-all duration-700 ease-out"
      style={{ opacity: show ? 1 : 0, transform: `translateY(${show ? 0 : 16}px)` }}>
      {children}
    </div>
  );
}

function UnitCard({ unit, index, onCustomize }: { unit: Unit; index: number; onCustomize: (unit: Unit) => void }) {
  const tc = TEAM_COLORS[unit.team];
  const portrait = PORTRAITS[unit.id];

  return (
    <Reveal delay={800 + index * 100}>
      <div className="relative overflow-hidden bg-card/60 backdrop-blur-sm border rounded-xl flex items-stretch transition-all hover:scale-[1.02] hover:bg-card/80 group cursor-pointer"
        style={{ borderColor: `${tc}30` }}
        onClick={() => onCustomize(unit)}
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${tc}18, ${tc}06)` }}>
          {portrait ? (
            <img src={portrait} alt={unit.name}
              className="w-full h-full object-cover object-top group-hover:scale-110 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {unit.unitClass === 'soldier'
                ? <Swords className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: tc }} />
                : <Heart className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: tc }} />}
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ backgroundColor: tc }} />
          <div className="absolute top-1 right-1 w-5 h-5 rounded bg-card/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Settings className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>

        <div className="flex-1 px-3 py-2 sm:px-4 sm:py-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg text-foreground font-bold truncate">{unit.name}</span>
            <span className="text-[12px] sm:text-[13px] px-1.5 py-0.5 rounded-md uppercase font-bold font-display"
              style={{ backgroundColor: `${tc}15`, color: tc }}>
              {unit.unitClass}
            </span>
          </div>
          <div className="text-[12px] sm:text-[13px] uppercase tracking-[0.15em] mt-0.5 font-display" style={{ color: tc }}>
            {TEAM_NAMES[unit.team]}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2 text-[12px] sm:text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-destructive" /> {unit.hp}</span>
            <span className="flex items-center gap-1"><Swords className="w-3 h-3 text-destructive/70" /> {unit.attack}</span>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-primary/70" /> {unit.defense}</span>
            <span className="hidden sm:flex items-center gap-1"><Crosshair className="w-3 h-3 text-accent/70" /> {unit.accuracy}%</span>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export function PreGameScreen({ state, onStartAutoPlay }: PreGameScreenProps) {
  const teams: Team[] = ['blue', 'red', 'green', 'yellow'];
  const [audioStarted, setAudioStarted] = useState(false);
  const [titleRevealed, setTitleRevealed] = useState(0);
  const [showParticles, setShowParticles] = useState(false);
  const [customizingUnit, setCustomizingUnit] = useState<Unit | null>(null);
  const [customizations, setCustomizations] = useState<Record<string, UnitCustomization>>({});
  const title = 'WARGAMING';

  const handleClick = useCallback(() => {
    if (!audioStarted) {
      startAmbientAudio();
      setAudioStarted(true);
    }
  }, [audioStarted]);

  useEffect(() => {
    return () => stopAmbientAudio();
  }, []);

  useEffect(() => {
    if (titleRevealed >= title.length) return;
    const timer = setTimeout(() => setTitleRevealed(r => r + 1), 70);
    return () => clearTimeout(timer);
  }, [titleRevealed]);

  useEffect(() => {
    const t = setTimeout(() => setShowParticles(true), 300);
    return () => clearTimeout(t);
  }, []);

  const particles = useMemo(() => 
    Array.from({ length: 40 }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      speed: 0.3 + Math.random() * 0.7,
      delay: Math.random() * 5,
      opacity: 0.1 + Math.random() * 0.2,
    })), []);

  const handleCustomize = useCallback((unit: Unit) => {
    setCustomizingUnit(unit);
  }, []);

  const handleCustomizationChange = useCallback((unitId: string, c: UnitCustomization) => {
    setCustomizations(prev => ({ ...prev, [unitId]: c }));
  }, []);

  return (
    <div className="absolute inset-0 z-30 pointer-events-auto overflow-y-auto" onClick={handleClick}>
      <div className="fixed inset-0 bg-background/95 backdrop-blur-md z-[-1]" />
      
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 20%, hsl(142 70% 45% / 0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, hsl(0 75% 55% / 0.04) 0%, transparent 50%), radial-gradient(ellipse at 20% 70%, hsl(210 70% 55% / 0.04) 0%, transparent 50%)',
        }}
      />

      {showParticles && particles.map((p, i) => (
        <div key={i} className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`, top: `${p.y}%`,
            width: p.size, height: p.size,
            backgroundColor: 'hsl(142 70% 45%)',
            opacity: p.opacity,
            animation: `float-particle ${8 / p.speed}s ease-in-out ${p.delay}s infinite alternate`,
          }}
        />
      ))}

      <div className="absolute inset-0 pointer-events-none z-20 opacity-[0.02]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(var(--foreground)) 2px, hsl(var(--foreground)) 3px)',
          backgroundSize: '100% 4px',
        }} />

      <div className="absolute top-0 left-0 right-0 h-[1px] z-20" style={{ background: 'linear-gradient(90deg, transparent 10%, hsl(142 70% 45% / 0.3) 50%, transparent 90%)' }} />
      <div className="absolute bottom-0 left-0 right-0 h-[1px] z-20" style={{ background: 'linear-gradient(90deg, transparent 10%, hsl(0 75% 55% / 0.3) 50%, transparent 90%)' }} />

      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-12 pb-16 sm:pb-24 min-h-full">
        {/* Title section */}
        <div className="text-center space-y-3 sm:space-y-4 mb-6 sm:mb-10">
          <Reveal delay={200}>
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-8 sm:w-12 h-[1px]" style={{ background: 'linear-gradient(to right, transparent, hsl(142 70% 45% / 0.4))' }} />
              <span className="text-[11px] sm:text-[12px] tracking-[0.4em] sm:tracking-[0.5em] text-muted-foreground/30 font-display">TACTICAL BATTLE ROYALE</span>
              <div className="w-8 sm:w-12 h-[1px]" style={{ background: 'linear-gradient(to left, transparent, hsl(142 70% 45% / 0.4))' }} />
            </div>
          </Reveal>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-display font-black text-primary glow-text tracking-[0.3em] sm:tracking-[0.5em] select-none">
            {title.split('').map((char, i) => (
              <span key={i} className={`inline-block transition-all duration-300 ${i < titleRevealed ? 'opacity-100' : 'opacity-0'}`}
                style={{ 
                  transform: i < titleRevealed ? 'translateY(0) scale(1)' : 'translateY(-12px) scale(0.8)',
                  textShadow: i < titleRevealed ? '0 0 40px hsl(142 70% 45% / 0.5), 0 0 80px hsl(142 70% 45% / 0.2)' : 'none',
                }}>
                {i === titleRevealed ? '▮' : char}
              </span>
            ))}
          </h1>

          <Reveal delay={500}>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
              <div className="flex items-center gap-1.5">
                <Swords className="w-4 h-4 text-destructive/60" />
                <span className="text-base sm:text-lg text-muted-foreground tracking-[0.12em] font-display">4 SQUADS</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-muted-foreground/20 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-primary/60" />
                <span className="text-base sm:text-lg text-muted-foreground tracking-[0.12em] font-display">8 COMBATANTS</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-muted-foreground/20 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-accent/60" />
                <span className="text-base sm:text-lg text-muted-foreground tracking-[0.12em] font-display">1 SURVIVES</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={650}>
            <div className="glass-panel rounded-lg px-4 sm:px-6 py-2 inline-flex items-center gap-3">
              <span className="text-[12px] sm:text-[13px] text-accent tracking-[0.1em] font-display">
                EACH SQUAD: 1 SOLDIER + 1 MEDIC • FIND LOOT TO UPGRADE
              </span>
            </div>
          </Reveal>
        </div>

        {/* Two-column layout on desktop: Roster + Betting */}
        <div className="w-full flex flex-col lg:flex-row gap-6 sm:gap-8 mb-6 sm:mb-10">
          {/* Team Roster */}
          <div className="flex-1 space-y-4 sm:space-y-5">
            {teams.map((team, ti) => {
              const teamUnits = state.units.filter(u => u.team === team);
              return (
                <div key={team}>
                  <Reveal delay={750 + ti * 80}>
                    <div className="flex items-center gap-3 justify-center mb-2">
                      <div className="h-px flex-1 max-w-[60px] sm:max-w-[80px]" style={{ background: `linear-gradient(to right, transparent, ${TEAM_COLORS[team]}30)` }} />
                      <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team], boxShadow: `0 0 8px ${TEAM_COLORS[team]}40` }} />
                      <span className="text-[13px] sm:text-sm font-bold tracking-[0.2em] sm:tracking-[0.25em] font-display" style={{ color: TEAM_COLORS[team] }}>
                        {TEAM_NAMES[team]}
                      </span>
                      <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team], boxShadow: `0 0 8px ${TEAM_COLORS[team]}40` }} />
                      <div className="h-px flex-1 max-w-[60px] sm:max-w-[80px]" style={{ background: `linear-gradient(to left, transparent, ${TEAM_COLORS[team]}30)` }} />
                    </div>
                  </Reveal>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 max-w-2xl mx-auto">
                    {teamUnits.map((u, i) => (
                      <UnitCard key={u.id} unit={u} index={ti * 2 + i} onCustomize={handleCustomize} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Customize hint */}
            <Reveal delay={1600}>
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/20 bg-card/30">
                  <Settings className="w-4 h-4 text-muted-foreground/60" />
                  <span className="text-[15px] text-muted-foreground/60 font-medium">Click any unit to customize gear</span>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Betting Panel (WIP) */}
          <Reveal delay={1200}>
            <div className="lg:w-[300px] shrink-0">
              <div className="glass-panel rounded-xl p-4 sm:p-5 relative overflow-hidden">
                <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-xl">
                  <Lock className="w-6 h-6 text-accent/40 mb-2" />
                  <div className="text-sm font-display font-bold text-accent/50 tracking-[0.2em]">COMING SOON</div>
                  <div className="text-[11px] text-muted-foreground/40 mt-1">Crypto betting in a future update</div>
                </div>
                <CryptoBettingPanel disabled />
              </div>
            </div>
          </Reveal>
        </div>

        {/* Start Button */}
        <Reveal delay={1800}>
          <div className="text-center space-y-3 sm:space-y-4">
            <button onClick={onStartAutoPlay}
              className="group px-10 sm:px-16 py-4 sm:py-5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all text-base sm:text-lg tracking-[0.2em] sm:tracking-[0.25em] flex items-center gap-3 sm:gap-4 mx-auto relative overflow-hidden font-display font-bold shadow-[0_0_30px_hsl(142_70%_45%/0.2)]">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
              <Play className="w-5 h-5 sm:w-6 sm:h-6 relative z-10" />
              <span className="relative z-10">START BATTLE</span>
            </button>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 text-[15px] sm:text-[16px] text-muted-foreground/60 font-medium">
              <span>🤖 AI commands each squad</span>
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 hidden sm:block" />
              <span>🌫️ Fog of War active</span>
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 hidden sm:block" />
              <span>💊 Medics heal allies</span>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Customization Modal */}
      {customizingUnit && (
        <CustomizationModal
          unit={customizingUnit}
          onClose={() => setCustomizingUnit(null)}
          customization={customizations[customizingUnit.id] || DEFAULT_CUSTOM}
          onCustomizationChange={(c) => handleCustomizationChange(customizingUnit.id, c)}
        />
      )}

      <style>{`
        @keyframes float-particle {
          0% { transform: translateY(0) translateX(0); }
          100% { transform: translateY(-20px) translateX(10px); }
        }
      `}</style>
    </div>
  );
}