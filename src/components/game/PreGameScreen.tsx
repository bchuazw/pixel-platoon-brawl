import { useEffect, useState, useCallback } from 'react';
import { startAmbientAudio, stopAmbientAudio } from '@/game/ambientAudio';
import { GameState, Unit, TEAM_COLORS, Team } from '@/game/types';
import { Play, ChevronDown, ChevronUp, Swords, Heart, Shield, Crosshair, Target, Zap } from 'lucide-react';
import { CryptoBettingPanel } from './CryptoBettingPanel';

// Portraits keyed by unit ID
import portraitSoldierBlue from '@/assets/portrait-soldier-blue.png';
import portraitSoldierRed from '@/assets/portrait-soldier-red.png';
import portraitSoldierGreen from '@/assets/portrait-soldier-green.png';
import portraitSoldierYellow from '@/assets/portrait-soldier-yellow.png';
import portraitMedicBlue from '@/assets/portrait-medic-blue.png';
import portraitMedicRed from '@/assets/portrait-medic-red.png';
import portraitMedicGreen from '@/assets/portrait-medic-green.png';
import portraitMedicYellow from '@/assets/portrait-medic-yellow.png';

const PORTRAITS: Record<string, string> = {
  'blue-soldier': portraitSoldierBlue,
  'red-soldier': portraitSoldierRed,
  'green-soldier': portraitSoldierGreen,
  'yellow-soldier': portraitSoldierYellow,
  'blue-medic': portraitMedicBlue,
  'red-medic': portraitMedicRed,
  'green-medic': portraitMedicGreen,
  'yellow-medic': portraitMedicYellow,
};

const TEAM_NAMES: Record<Team, string> = {
  blue: 'AZURE WOLVES',
  red: 'CRIMSON HAWKS',
  green: 'JADE VIPERS',
  yellow: 'GOLD LIONS',
};

interface PreGameScreenProps {
  state: GameState;
  onStartAutoPlay: () => void;
}

// ── Glitch Title ──
function GlitchTitle() {
  const [revealed, setRevealed] = useState(0);
  const text = 'WARGAMING';
  const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`01';

  useEffect(() => {
    if (revealed >= text.length) return;
    const timer = setTimeout(() => setRevealed(r => r + 1), 80);
    return () => clearTimeout(timer);
  }, [revealed]);

  return (
    <h1 className="text-3xl md:text-4xl font-display font-bold text-primary glow-text tracking-[0.3em] select-none">
      {text.split('').map((char, i) => {
        if (i < revealed) {
          return <span key={i} className="inline-block animate-[glitchIn_0.15s_ease-out]">{char}</span>;
        }
        if (i === revealed) {
          return (
            <span key={i} className="inline-block text-accent opacity-80 animate-pulse">
              {glitchChars[Math.floor(Math.random() * glitchChars.length)]}
            </span>
          );
        }
        return <span key={i} className="inline-block opacity-0">{char}</span>;
      })}
    </h1>
  );
}

// ── Staggered reveal wrapper ──
function Reveal({ delay, children }: { delay: number; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className="transition-all duration-700 ease-out"
      style={{
        opacity: show ? 1 : 0,
        transform: `translateY(${show ? 0 : 20}px)`,
      }}
    >
      {children}
    </div>
  );
}

// ── Unit Card with Portrait ──
function UnitPreviewCard({ unit, index }: { unit: Unit; index: number }) {
  const teamColor = TEAM_COLORS[unit.team];
  const portrait = PORTRAITS[unit.id];

  return (
    <Reveal delay={900 + index * 120}>
      <div
        className="relative overflow-hidden bg-card/80 backdrop-blur-sm border rounded-xl p-0 flex items-stretch transition-all hover:scale-[1.02] hover:shadow-lg group"
        style={{ borderColor: `${teamColor}40` }}
      >
        {/* Portrait */}
        <div
          className="w-16 h-16 shrink-0 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${teamColor}20, ${teamColor}08)` }}
        >
          {portrait ? (
            <img
              src={portrait}
              alt={unit.name}
              className="w-full h-full object-cover object-top group-hover:scale-110 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {unit.unitClass === 'soldier'
                ? <Swords className="w-6 h-6" style={{ color: teamColor }} />
                : <Heart className="w-6 h-6" style={{ color: teamColor }} />
              }
            </div>
          )}
          {/* Team color strip */}
          <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: teamColor }} />
        </div>

        {/* Info */}
        <div className="flex-1 px-3 py-2 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-foreground font-bold truncate">{unit.name}</span>
            <span className="text-[6px] px-1 py-0.5 rounded uppercase font-bold" style={{ backgroundColor: `${teamColor}20`, color: teamColor }}>
              {unit.unitClass}
            </span>
          </div>
          <div className="text-[7px] uppercase tracking-wider mt-0.5" style={{ color: teamColor }}>
            {TEAM_NAMES[unit.team]}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[7px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5 text-destructive" /> {unit.hp}</span>
            <span className="flex items-center gap-0.5"><Swords className="w-2.5 h-2.5 text-destructive/70" /> {unit.attack}</span>
            <span className="flex items-center gap-0.5"><Shield className="w-2.5 h-2.5 text-primary/70" /> {unit.defense}</span>
            <span className="flex items-center gap-0.5"><Crosshair className="w-2.5 h-2.5 text-accent/70" /> {unit.accuracy}%</span>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

// ── Rules Section ──
const RULES = [
  { icon: '🗺️', title: 'ZONE SHRINK', desc: 'The battlefield shrinks every few turns. Units outside the zone take damage each turn. Stay inside to survive!' },
  { icon: '📦', title: 'LOOT & WEAPONS', desc: 'Find crates scattered across the map containing weapons, medkits, armor, and ammo. Upgrade your loadout!' },
  { icon: '🔥', title: 'KILLSTREAKS', desc: 'Earn killstreaks through combat — UAV reveals enemies, Supply Drops heal & resupply, Airstrikes deal area damage, EMP suppresses foes.' },
  { icon: '⚔️', title: 'COMBAT', desc: 'Units have AP (Action Points) for moving and attacking. Cover reduces incoming damage. Accuracy varies by range and weapon.' },
  { icon: '💊', title: 'MEDICS', desc: 'Each squad has a Medic with healing abilities and smoke grenades. Keep them alive to sustain your team!' },
  { icon: '🎰', title: 'BATTLE WAGER', desc: 'Place $WAR token bets on teams before the match. Win 3x payout if your team survives. (Coming soon!)' },
];

function RulesSection() {
  const [open, setOpen] = useState(false);

  return (
    <Reveal delay={1800}>
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 mx-auto text-[8px] text-muted-foreground hover:text-foreground transition-colors tracking-[0.15em]"
        >
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          HOW IT WORKS
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {open && (
          <div className="mt-3 grid grid-cols-2 gap-2 animate-in slide-in-from-top-2 duration-300">
            {RULES.map((r, i) => (
              <div key={i} className="bg-card/60 border border-border/20 rounded-lg px-3 py-2">
                <div className="text-[8px] font-bold text-foreground">{r.icon} {r.title}</div>
                <div className="text-[6px] text-muted-foreground mt-0.5 leading-relaxed">{r.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Reveal>
  );
}

// ── Scanline overlay for cinematic feel ──
function Scanlines() {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 opacity-[0.03]"
      style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(var(--foreground)) 2px, hsl(var(--foreground)) 3px)',
        backgroundSize: '100% 4px',
      }}
    />
  );
}

// ── Main Pre-Game Screen ──
export function PreGameScreen({ state, onStartAutoPlay }: PreGameScreenProps) {
  const teams: Team[] = ['blue', 'red', 'green', 'yellow'];
  const [audioStarted, setAudioStarted] = useState(false);

  // Start ambient audio on any click within this overlay
  const handleClick = useCallback(() => {
    if (!audioStarted) {
      startAmbientAudio();
      setAudioStarted(true);
    }
  }, [audioStarted]);

  // Clean up on unmount (battle starts)
  useEffect(() => {
    return () => stopAmbientAudio();
  }, []);

  return (
    <div className="absolute inset-0 z-30 pointer-events-auto overflow-y-auto" onClick={handleClick}>
      {/* The 3D board renders behind — we just darken over it */}
      <div className="absolute inset-0 bg-background/75 backdrop-blur-[2px]" />
      <Scanlines />

      <div className="relative z-10 flex items-start justify-center gap-6 w-full max-w-5xl mx-auto px-6 py-8 min-h-full">
        {/* Main content */}
        <div className="text-center space-y-5 flex-1">
          {/* Cinematic Title */}
          <div className="space-y-3">
            <GlitchTitle />
            <Reveal delay={600}>
              <p className="text-xs text-muted-foreground tracking-wider font-mono-game">
                4 SQUADS • 8 COMBATANTS • 1 TEAM SURVIVES
              </p>
            </Reveal>
            <Reveal delay={750}>
              <p className="text-[10px] text-accent tracking-wider font-mono-game">
                EACH SQUAD: 1 SOLDIER + 1 MEDIC • FIND LOOT TO UPGRADE!
              </p>
            </Reveal>
          </div>

          {/* Team Roster with Portraits */}
          <div className="space-y-3">
            {teams.map(team => {
              const teamUnits = state.units.filter(u => u.team === team);
              return (
                <div key={team}>
                  <Reveal delay={850 + teams.indexOf(team) * 100}>
                    <div className="flex items-center gap-2 justify-center mb-1.5">
                      <div className="h-px flex-1 max-w-[60px]" style={{ backgroundColor: `${TEAM_COLORS[team]}30` }} />
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                      <span className="text-[8px] font-bold tracking-[0.2em]" style={{ color: TEAM_COLORS[team] }}>
                        {TEAM_NAMES[team]}
                      </span>
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                      <div className="h-px flex-1 max-w-[60px]" style={{ backgroundColor: `${TEAM_COLORS[team]}30` }} />
                    </div>
                  </Reveal>
                  <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                    {teamUnits.map((u, i) => (
                      <UnitPreviewCard key={u.id} unit={u} index={teams.indexOf(team) * 2 + i} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rules */}
          <RulesSection />

          {/* Start Button */}
          <Reveal delay={2000}>
            <div className="space-y-2 pt-2">
              <button
                onClick={onStartAutoPlay}
                className="group px-10 py-3.5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all glow-text text-[12px] tracking-[0.2em] flex items-center gap-3 mx-auto relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                <Play className="w-5 h-5 relative z-10" />
                <span className="relative z-10">START BATTLE</span>
              </button>
              <p className="text-[7px] text-muted-foreground">
                AI commands each squad • Fog of War active • Medics heal allies!
              </p>
            </div>
          </Reveal>
        </div>

        {/* Crypto Betting Panel (right side) */}
        <Reveal delay={1200}>
          <div className="w-[320px] shrink-0 pt-2">
            <CryptoBettingPanel disabled />
          </div>
        </Reveal>
      </div>

      {/* Glitch keyframe */}
      <style>{`
        @keyframes glitchIn {
          0% { transform: translateY(-4px) scaleY(1.3); opacity: 0; filter: blur(2px); }
          50% { transform: translateY(2px) scaleX(1.1); opacity: 0.7; }
          100% { transform: translateY(0) scale(1); opacity: 1; filter: blur(0); }
        }
      `}</style>
    </div>
  );
}
