import { useEffect, useState, useCallback } from 'react';
import { startAmbientAudio, stopAmbientAudio } from '@/game/ambientAudio';
import { GameState, Unit, TEAM_COLORS, Team } from '@/game/types';
import { Play, Swords, Heart, Shield, Crosshair } from 'lucide-react';

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

function UnitCard({ unit, index }: { unit: Unit; index: number }) {
  const tc = TEAM_COLORS[unit.team];
  const portrait = PORTRAITS[unit.id];

  return (
    <Reveal delay={800 + index * 100}>
      <div className="relative overflow-hidden bg-card/60 backdrop-blur-sm border rounded-xl flex items-stretch transition-all hover:scale-[1.02] hover:bg-card/80 group"
        style={{ borderColor: `${tc}30` }}>
        <div className="w-20 h-20 shrink-0 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${tc}18, ${tc}06)` }}>
          {portrait ? (
            <img src={portrait} alt={unit.name}
              className="w-full h-full object-cover object-top group-hover:scale-110 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {unit.unitClass === 'soldier'
                ? <Swords className="w-8 h-8" style={{ color: tc }} />
                : <Heart className="w-8 h-8" style={{ color: tc }} />}
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ backgroundColor: tc }} />
        </div>

        <div className="flex-1 px-4 py-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground font-bold truncate">{unit.name}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md uppercase font-bold font-display"
              style={{ backgroundColor: `${tc}15`, color: tc }}>
              {unit.unitClass}
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.15em] mt-0.5 font-display" style={{ color: tc }}>
            {TEAM_NAMES[unit.team]}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-destructive" /> {unit.hp}</span>
            <span className="flex items-center gap-1"><Swords className="w-3 h-3 text-destructive/70" /> {unit.attack}</span>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-primary/70" /> {unit.defense}</span>
            <span className="flex items-center gap-1"><Crosshair className="w-3 h-3 text-accent/70" /> {unit.accuracy}%</span>
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

  return (
    <div className="absolute inset-0 z-30 pointer-events-auto overflow-y-auto" onClick={handleClick}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      {/* Subtle scanlines */}
      <div className="absolute inset-0 pointer-events-none z-20 opacity-[0.02]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, hsl(var(--foreground)) 2px, hsl(var(--foreground)) 3px)',
          backgroundSize: '100% 4px',
        }} />

      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl mx-auto px-8 py-12 min-h-full">
        {/* Title */}
        <div className="text-center space-y-4 mb-10">
          <h1 className="text-5xl font-display font-black text-primary glow-text tracking-[0.4em] select-none">
            {title.split('').map((char, i) => (
              <span key={i} className={`inline-block transition-all duration-200 ${i < titleRevealed ? 'opacity-100' : 'opacity-0'}`}
                style={{ transform: i < titleRevealed ? 'translateY(0)' : 'translateY(-8px)' }}>
                {i === titleRevealed ? '▮' : char}
              </span>
            ))}
          </h1>
          <Reveal delay={500}>
            <p className="text-base text-muted-foreground tracking-[0.15em] font-display">
              4 SQUADS • 8 COMBATANTS • 1 TEAM SURVIVES
            </p>
          </Reveal>
          <Reveal delay={650}>
            <p className="text-sm text-accent tracking-[0.1em]">
              EACH SQUAD: 1 SOLDIER + 1 MEDIC • FIND LOOT TO UPGRADE
            </p>
          </Reveal>
        </div>

        {/* Team Roster */}
        <div className="w-full space-y-5 mb-10">
          {teams.map((team, ti) => {
            const teamUnits = state.units.filter(u => u.team === team);
            return (
              <div key={team}>
                <Reveal delay={750 + ti * 80}>
                  <div className="flex items-center gap-3 justify-center mb-2">
                    <div className="h-px flex-1 max-w-[80px]" style={{ background: `linear-gradient(to right, transparent, ${TEAM_COLORS[team]}30)` }} />
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                    <span className="text-xs font-bold tracking-[0.25em] font-display" style={{ color: TEAM_COLORS[team] }}>
                      {TEAM_NAMES[team]}
                    </span>
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                    <div className="h-px flex-1 max-w-[80px]" style={{ background: `linear-gradient(to left, transparent, ${TEAM_COLORS[team]}30)` }} />
                  </div>
                </Reveal>
                <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
                  {teamUnits.map((u, i) => (
                    <UnitCard key={u.id} unit={u} index={ti * 2 + i} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Start Button */}
        <Reveal delay={1800}>
          <div className="text-center space-y-3">
            <button onClick={onStartAutoPlay}
              className="group px-14 py-4 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all text-base tracking-[0.25em] flex items-center gap-4 mx-auto relative overflow-hidden font-display font-bold">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
              <Play className="w-6 h-6 relative z-10" />
              <span className="relative z-10">START BATTLE</span>
            </button>
            <p className="text-xs text-muted-foreground">
              AI commands each squad • Fog of War active • Medics heal allies
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}