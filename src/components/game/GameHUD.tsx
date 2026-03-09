import { GameState, Unit, TEAM_COLORS, AbilityId, GRID_SIZE, Team } from '@/game/types';
import { useEffect, useRef, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Heart, Shield, Crosshair, Home, Target, Skull, Users, MessageSquare, LogOut } from 'lucide-react';
import { isInZone } from '@/game/gameState';
import { playVictoryFanfare } from '@/game/sounds';
import { PreGameScreen } from './PreGameScreen';
import { TacticalMinimap } from './TacticalMinimap';
import { SponsorHUDPanel } from './SponsorHUDPanel';

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
  blue: 'AZURE', red: 'CRIMSON', green: 'JADE', yellow: 'GOLD',
};

interface GameHUDProps {
  state: GameState;
  onEndTurn: () => void;
  onDeselect: () => void;
  onRestart: () => void;
  onUseAbility: (id: AbilityId) => void;
  onStartAutoPlay: () => void;
  onStopAutoPlay: () => void;
  onMainMenu?: () => void;
  sponsorPoints?: number;
  onUnitInspect?: (unitId: string) => void;
  inspectedUnitId?: string | null;
}

/* ── Unit Card ── */
function UnitCard({ unit, isActive, onClick }: { unit: Unit; isActive: boolean; onClick?: () => void }) {
  const hpPct = (unit.hp / unit.maxHp) * 100;
  const tc = TEAM_COLORS[unit.team];
  const portrait = PORTRAITS[unit.id] || PORTRAITS[`${unit.team}-${unit.unitClass}`];

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center gap-2 px-2 py-1.5 rounded-md border transition-all duration-200 ${onClick ? 'cursor-pointer hover:brightness-125' : ''} ${
        isActive
          ? 'border-primary/30 bg-secondary/50'
          : 'border-border/10 bg-card/15 hover:bg-secondary/15'
      } ${!unit.isAlive ? 'opacity-20 grayscale pointer-events-none' : ''}`}
    >
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md overflow-hidden shrink-0 relative" style={{ border: `1.5px solid ${tc}40` }}>
        {portrait ? (
          <img src={portrait} alt={unit.name} className="w-full h-full object-cover object-top" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs" style={{ backgroundColor: tc + '15', color: tc }}>
            {unit.unitClass === 'medic' ? '✚' : '⚔'}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ backgroundColor: tc }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground font-bold truncate leading-none">{unit.name}</span>
          <div className="flex items-center gap-1">
            {unit.kills > 0 && <span className="text-[12px] text-destructive font-bold">☠{unit.kills}</span>}
          </div>
        </div>
        <div className="mt-1 h-[3px] bg-muted/30 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${hpPct}%`,
              backgroundColor: hpPct > 50 ? 'hsl(142,70%,45%)' : hpPct > 25 ? 'hsl(35,90%,55%)' : 'hsl(0,75%,55%)',
            }}
          />
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[12px] text-muted-foreground/60 font-mono">{unit.hp}/{unit.maxHp}</span>
          {unit.isHunkered && <span className="text-[12px] text-accent">🛡</span>}
          {unit.coverType !== 'none' && (
            <span className={`text-[11px] ${unit.coverType === 'full' ? 'text-[#4488ff]' : 'text-accent/60'}`}>
              {unit.coverType === 'full' ? '▣' : '▤'}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/40 ml-auto hidden sm:inline">{unit.weapon.name}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Left Sidebar: Team Roster ── */
function TeamRoster({ state, onUnitInspect, visible }: { state: GameState; onUnitInspect?: (id: string) => void; visible: boolean }) {
  const teams = (['blue', 'red', 'green', 'yellow'] as const);

  return (
    <div className={`pointer-events-auto absolute left-0 top-12 sm:top-14 bottom-8 w-44 sm:w-56 flex flex-col overflow-hidden transition-transform duration-300 ${
      visible ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
    }`}
      style={{
        background: 'linear-gradient(90deg, rgba(8,12,18,0.95) 0%, rgba(8,12,18,0.88) 75%, rgba(8,12,18,0) 100%)',
      }}>
      <div className="px-3 py-2 border-b border-border/10">
        <span className="text-[13px] text-muted-foreground/50 tracking-[0.3em] font-display font-bold">ROSTER</span>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 sm:px-2 py-1.5 space-y-2">
        {teams.map(team => {
          const teamUnits = state.units.filter(u => u.team === team);
          const alive = teamUnits.filter(u => u.isAlive).length;
          const totalKills = teamUnits.reduce((s, u) => s + u.kills, 0);

          return (
            <div key={team} className={alive === 0 ? 'opacity-15' : ''}>
              <div className="flex items-center gap-1.5 px-1 mb-1">
                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                <span className="text-[13px] font-bold tracking-[0.12em]" style={{ color: TEAM_COLORS[team] }}>
                  {TEAM_NAMES[team]}
                </span>
                <span className="text-[12px] text-muted-foreground/40 ml-auto">{alive}/{teamUnits.length}</span>
                {totalKills > 0 && <span className="text-[12px] text-destructive/50">☠{totalKills}</span>}
              </div>
              <div className="space-y-1">
                {teamUnits.map(u => (
                  <UnitCard key={u.id} unit={u}
                    isActive={u.id === state.selectedUnitId || (state.autoPlay && u.team === state.currentTeam && u.isAlive)}
                    onClick={() => onUnitInspect?.(u.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Right Sidebar: Combat Feed ── */
function CombatFeed({ log, visible }: { log: string[]; visible: boolean }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const getLogStyle = (msg: string) => {
    if (msg.includes('═')) return 'text-border/15 text-[10px]';
    if (msg.includes('ELIMINATED') || msg.includes('killed')) return 'text-destructive font-bold';
    if (msg.includes('WINS')) return 'text-accent glow-accent font-bold text-base';
    if (msg.includes('CRITICAL')) return 'text-[#ffaa00] font-bold';
    if (msg.includes('ZONE') || msg.includes('DANGER')) return 'text-destructive';
    if (msg.includes('MISSED')) return 'text-muted-foreground/25 italic';
    if (msg.includes('heals') || msg.includes('💊')) return 'text-primary';
    if (msg.includes('HUNKER')) return 'text-accent';
    if (msg.includes('picks up') || msg.includes('equips')) return 'text-accent/80';
    if (msg.includes('»')) return 'text-foreground/60';
    return 'text-muted-foreground/40';
  };

  return (
    <div className={`pointer-events-auto absolute right-0 top-[180px] sm:top-[190px] bottom-8 w-44 sm:w-56 flex flex-col overflow-hidden transition-transform duration-300 ${
      visible ? 'translate-x-0' : 'translate-x-full sm:translate-x-0'
    }`}
      style={{
        background: 'linear-gradient(270deg, rgba(8,12,18,0.95) 0%, rgba(8,12,18,0.88) 75%, rgba(8,12,18,0) 100%)',
      }}>
      <div className="px-3 py-2 border-b border-border/10 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-destructive/50 animate-pulse" />
        <span className="text-[13px] text-muted-foreground/50 tracking-[0.3em] font-display font-bold">LIVE FEED</span>
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto px-2 sm:px-3 py-1.5 space-y-0.5">
        {log.slice(-60).map((msg, i) => (
          <div key={i} className={`text-[13px] leading-relaxed ${getLogStyle(msg)}`}>
            {msg}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Victory Screen ── */
function VictoryScreen({ state, onRestart, onMainMenu }: { state: GameState; onRestart: () => void; onMainMenu?: () => void }) {
  const [show, setShow] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const winnerLine = state.log.find(l => l.includes('WINS'))?.replace('🏆 ', '') || '';
  const winningTeam = (['blue', 'red', 'green', 'yellow'] as const).find(t =>
    state.units.some(u => u.team === t && u.isAlive)
  );
  const winnerColor = winningTeam ? TEAM_COLORS[winningTeam] : '#ffcc00';
  const winnerName = winningTeam ? TEAM_NAMES[winningTeam] : 'UNKNOWN';

  const survivors = state.units.filter(u => u.team === winningTeam && u.isAlive);
  const fallenHeroes = state.units.filter(u => u.team === winningTeam && !u.isAlive);

  const mvp = [...state.units].sort((a, b) => b.kills - a.kills)[0];
  const mvpPortrait = mvp ? (PORTRAITS[mvp.id] || PORTRAITS[`${mvp.team}-${mvp.unitClass}`]) : null;

  const totalKills = state.units.reduce((s, u) => s + u.kills, 0);
  const teamKills: Record<Team, number> = { blue: 0, red: 0, green: 0, yellow: 0 };
  state.units.forEach(u => { teamKills[u.team] += u.kills; });

  useEffect(() => {
    playVictoryFanfare();
    setTimeout(() => setShow(true), 200);
    setTimeout(() => setShowStats(true), 800);
    setTimeout(() => setShowDetails(true), 1500);
  }, []);

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto">
      <div className="absolute inset-0 bg-background/95 backdrop-blur-2xl transition-opacity duration-1000" style={{ opacity: show ? 1 : 0 }} />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] rounded-full transition-all duration-[2s]"
        style={{ background: `radial-gradient(circle, ${winnerColor}15 0%, ${winnerColor}05 40%, transparent 70%)`, opacity: show ? 1 : 0 }}
      />

      <div className="absolute top-0 left-0 right-0 h-[2px] transition-all duration-[2s]"
        style={{ background: `linear-gradient(90deg, transparent, ${winnerColor}, transparent)`, opacity: show ? 0.6 : 0 }} />
      <div className="absolute bottom-0 left-0 right-0 h-[2px] transition-all duration-[2s]"
        style={{ background: `linear-gradient(90deg, transparent, ${winnerColor}, transparent)`, opacity: show ? 0.6 : 0 }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 sm:gap-4 overflow-y-auto py-4 sm:py-8 px-4">
        {/* Victory Title */}
        <div className="text-center transition-all duration-700" style={{ opacity: show ? 1 : 0, transform: `translateY(${show ? 0 : 30}px)` }}>
          <div className="text-[12px] sm:text-[13px] tracking-[0.8em] sm:tracking-[1em] text-muted-foreground/50 mb-2 font-display">BATTLE ROYALE</div>
          <h1 className="text-3xl sm:text-5xl font-display font-black tracking-[0.3em] sm:tracking-[0.5em]"
            style={{ color: winnerColor, textShadow: `0 0 40px ${winnerColor}44, 0 0 80px ${winnerColor}22` }}>
            VICTORY
          </h1>
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="w-6 sm:w-8 h-[1px]" style={{ backgroundColor: winnerColor + '40' }} />
            <p className="text-sm sm:text-base font-bold tracking-[0.2em]" style={{ color: winnerColor }}>{winnerName} TEAM</p>
            <div className="w-6 sm:w-8 h-[1px]" style={{ backgroundColor: winnerColor + '40' }} />
          </div>
        </div>

        {/* Surviving soldiers showcase */}
        <div className="flex flex-wrap justify-center gap-3 sm:gap-6 transition-all duration-700" style={{ opacity: showStats ? 1 : 0, transform: `translateY(${showStats ? 0 : 20}px)` }}>
          {survivors.map(unit => {
            const portrait = PORTRAITS[unit.id] || PORTRAITS[`${unit.team}-${unit.unitClass}`];
            const hpPct = (unit.hp / unit.maxHp) * 100;
            return (
              <div key={unit.id} className="glass-panel rounded-xl p-3 sm:p-4 text-center min-w-[120px] sm:min-w-[140px] relative overflow-hidden">
                <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 50% 30%, ${winnerColor}, transparent 70%)` }} />
                <div className="relative">
                  <div className="text-[12px] tracking-[0.3em] text-muted-foreground/50 mb-2 font-display">
                    {unit.unitClass === 'medic' ? 'MEDIC' : 'SOLDIER'}
                  </div>
                  {portrait && (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden mx-auto mb-2 border-2 shadow-lg" style={{ borderColor: winnerColor + '60' }}>
                      <img src={portrait} alt={unit.name} className="w-full h-full object-cover object-top" />
                    </div>
                  )}
                  <div className="text-sm font-bold text-foreground">{unit.name}</div>
                  <div className="mt-2 h-[4px] bg-muted/30 rounded-full overflow-hidden mx-2">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${hpPct}%`,
                        backgroundColor: hpPct > 50 ? 'hsl(142,70%,45%)' : hpPct > 25 ? 'hsl(35,90%,55%)' : 'hsl(0,75%,55%)',
                      }}
                    />
                  </div>
                  <div className="text-[12px] text-muted-foreground/50 mt-1">{unit.hp}/{unit.maxHp} HP</div>
                  <div className="flex items-center justify-center gap-3 mt-2">
                    <div className="text-center">
                      <div className="text-lg font-bold text-destructive font-display">{unit.kills}</div>
                      <div className="text-[11px] text-muted-foreground/50">KILLS</div>
                    </div>
                    <div className="w-px h-6 bg-border/20" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-foreground/70 font-display">LV{unit.level}</div>
                      <div className="text-[11px] text-muted-foreground/50">LEVEL</div>
                    </div>
                  </div>
                  <div className="text-[12px] text-muted-foreground/40 mt-1">{unit.weapon.name}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Fallen heroes */}
        {fallenHeroes.length > 0 && (
          <div className="transition-all duration-700" style={{ opacity: showDetails ? 0.6 : 0, transform: `translateY(${showDetails ? 0 : 10}px)` }}>
            <div className="text-[12px] tracking-[0.3em] text-muted-foreground/30 text-center mb-1 font-display">FALLEN IN BATTLE</div>
            <div className="flex flex-wrap justify-center gap-2">
              {fallenHeroes.map(unit => {
                const portrait = PORTRAITS[unit.id] || PORTRAITS[`${unit.team}-${unit.unitClass}`];
                return (
                  <div key={unit.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-card/20 border border-border/10 grayscale opacity-60">
                    {portrait && (
                      <div className="w-6 h-6 rounded overflow-hidden">
                        <img src={portrait} alt={unit.name} className="w-full h-full object-cover object-top" />
                      </div>
                    )}
                    <span className="text-[13px] text-muted-foreground">{unit.name} ({unit.kills}☠)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="flex flex-wrap justify-center gap-3 transition-all duration-700" style={{ opacity: showDetails ? 1 : 0, transform: `translateY(${showDetails ? 0 : 15}px)` }}>
          {mvp && (
            <div className="glass-panel rounded-xl p-3 sm:p-4 text-center min-w-[110px] sm:min-w-[120px]">
              <div className="text-[12px] tracking-[0.3em] text-accent mb-2 font-display">⭐ MVP</div>
              {mvpPortrait && (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden mx-auto mb-1 border" style={{ borderColor: TEAM_COLORS[mvp.team] + '40' }}>
                  <img src={mvpPortrait} alt={mvp.name} className="w-full h-full object-cover object-top" />
                </div>
              )}
              <div className="text-sm font-bold text-foreground">{mvp.name}</div>
              <div className="text-[12px] font-bold" style={{ color: TEAM_COLORS[mvp.team] }}>{TEAM_NAMES[mvp.team]}</div>
              <div className="text-xl font-bold text-accent mt-1 font-display">{mvp.kills} kills</div>
            </div>
          )}

          <div className="glass-panel rounded-xl p-3 sm:p-4 text-center min-w-[90px] sm:min-w-[100px]">
            <div className="text-[12px] tracking-[0.3em] text-muted-foreground/50 mb-2 font-display">BATTLE</div>
            <div className="space-y-2">
              <div>
                <div className="text-xl font-bold text-foreground font-display">{state.turn}</div>
                <div className="text-[12px] text-muted-foreground/50">ROUNDS</div>
              </div>
              <div>
                <div className="text-xl font-bold text-destructive font-display">{totalKills}</div>
                <div className="text-[12px] text-muted-foreground/50">TOTAL KILLS</div>
              </div>
              <div>
                <div className="text-sm font-bold text-foreground/60 font-display">LV{state.shrinkLevel}</div>
                <div className="text-[12px] text-muted-foreground/50">FINAL ZONE</div>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-3 sm:p-4 min-w-[120px] sm:min-w-[130px]">
            <div className="text-[12px] tracking-[0.3em] text-muted-foreground/50 mb-2 font-display text-center">SCOREBOARD</div>
            <div className="space-y-1.5">
              {([...(['blue', 'red', 'green', 'yellow'] as const)])
                .sort((a, b) => {
                  const aAlive = state.units.filter(u => u.team === a && u.isAlive).length;
                  const bAlive = state.units.filter(u => u.team === b && u.isAlive).length;
                  if (bAlive !== aAlive) return bAlive - aAlive;
                  return teamKills[b] - teamKills[a];
                })
                .map((team, i) => {
                  const alive = state.units.filter(u => u.team === team && u.isAlive).length;
                  return (
                    <div key={team} className={`flex items-center gap-2 px-2 py-1 rounded ${team === winningTeam ? 'bg-white/5' : ''}`}>
                      <span className="text-[13px] text-muted-foreground/30 w-3">{i + 1}.</span>
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                      <span className="text-[13px] font-bold flex-1" style={{ color: alive > 0 ? TEAM_COLORS[team] : TEAM_COLORS[team] + '40' }}>
                        {TEAM_NAMES[team]}
                      </span>
                      <span className="text-[13px] text-destructive/60">☠{teamKills[team]}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-2 transition-all duration-700" style={{ opacity: showDetails ? 1 : 0, transitionDelay: '0.3s' }}>
          <button onClick={onRestart}
            className="px-6 sm:px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all text-sm tracking-[0.2em] flex items-center gap-2 font-bold font-display">
            <RotateCcw className="w-4 h-4" /> PLAY AGAIN
          </button>
          {onMainMenu && (
            <button onClick={onMainMenu}
              className="px-6 sm:px-8 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-muted transition-colors text-sm tracking-[0.2em] flex items-center gap-2 border border-border/20 font-display">
              <Home className="w-4 h-4" /> MENU
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main HUD ── */
export function GameHUD({ state, onEndTurn, onDeselect, onRestart, onUseAbility, onStartAutoPlay, onStopAutoPlay, onMainMenu, sponsorPoints, onUnitInspect, inspectedUnitId }: GameHUDProps) {
  const isPreGame = state.phase === 'pre_game';
  const isGameOver = state.phase === 'game_over';
  const aliveUnits = state.units.filter(u => u.isAlive);
  const [showRoster, setShowRoster] = useState(false);
  const [showFeed, setShowFeed] = useState(false);

  const aliveByTeam = useMemo(() => {
    const counts: Record<Team, number> = { blue: 0, red: 0, green: 0, yellow: 0 };
    state.units.forEach(u => { if (u.isAlive) counts[u.team]++; });
    return counts;
  }, [state.units]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {isPreGame && <PreGameScreen state={state} onStartAutoPlay={onStartAutoPlay} />}

      {/* ── Top Bar ── */}
      <div className="pointer-events-auto flex items-center justify-between px-3 sm:px-6 h-12 sm:h-14"
        style={{ background: 'linear-gradient(180deg, rgba(8,12,18,0.9) 0%, rgba(8,12,18,0) 100%)' }}>
        {/* Left */}
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-sm sm:text-base font-display font-bold text-primary/80 tracking-[0.2em] sm:tracking-[0.3em]">WAR</span>
          <div className="h-5 w-px bg-border/15 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-muted-foreground/40 tracking-wider font-display hidden sm:inline">TURN</span>
            <span className="text-base sm:text-lg font-display font-bold text-foreground/80">{state.turn}</span>
          </div>
        </div>

        {/* Center: Team indicators */}
        <div className="flex items-center gap-1 sm:gap-2">
          {(['blue', 'red', 'green', 'yellow'] as const).map(team => {
            const alive = aliveByTeam[team];
            const isCurrent = state.currentTeam === team;
            return (
              <div key={team} className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-md transition-all ${
                alive === 0 ? 'opacity-15' : isCurrent ? 'bg-white/5' : ''
              }`}>
                <div className={`w-2 h-2 rounded-sm ${isCurrent && alive > 0 ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: alive > 0 ? TEAM_COLORS[team] : TEAM_COLORS[team] + '30' }} />
                <span className="text-sm sm:text-base font-bold font-display" style={{ color: alive > 0 ? TEAM_COLORS[team] : TEAM_COLORS[team] + '30' }}>
                  {alive}
                </span>
              </div>
            );
          })}
          {state.autoPlay && (
            <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md bg-primary/8 ml-1 sm:ml-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[12px] sm:text-[13px] text-primary/70 font-bold tracking-wider font-display">LIVE</span>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-md text-sm font-display font-bold ${
            state.shrinkLevel > 0 ? 'text-destructive/70' : 'text-muted-foreground/30'
          }`}>
            <Target className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{state.shrinkLevel > 0 ? `LV${state.shrinkLevel}` : 'SAFE'}</span>
          </div>
          <div className="h-5 w-px bg-border/15 hidden sm:block" />
          <span className="text-sm text-muted-foreground/30 font-display hidden sm:inline">{aliveUnits.length} ALIVE</span>
          <div className="h-5 w-px bg-border/15 hidden sm:block" />
          {isGameOver ? (
            <button onClick={onRestart}
              className="text-sm px-3 sm:px-4 py-1.5 bg-accent/80 text-accent-foreground rounded-md hover:opacity-90 transition-all tracking-wider font-bold font-display flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> NEW
            </button>
          ) : state.autoPlay ? (
            <button onClick={onStopAutoPlay}
              className="text-sm px-3 sm:px-4 py-1.5 bg-destructive/60 text-destructive-foreground rounded-md hover:opacity-90 transition-all tracking-wider font-bold font-display flex items-center gap-1.5">
              <Pause className="w-3.5 h-3.5" /> PAUSE
            </button>
          ) : (
            <button onClick={onStartAutoPlay}
              className="text-sm px-3 sm:px-4 py-1.5 bg-primary/80 text-primary-foreground rounded-md hover:opacity-90 transition-all tracking-wider font-bold font-display flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5" /> PLAY
            </button>
          )}
          {/* Exit button */}
          {onMainMenu && !isGameOver && (
            <>
              <div className="h-5 w-px bg-border/15" />
              <button onClick={onMainMenu}
                className="text-sm px-2 sm:px-3 py-1.5 bg-muted/40 hover:bg-muted/70 text-muted-foreground rounded-md transition-all tracking-wider font-bold font-display flex items-center gap-1.5 border border-border/20"
                title="Exit to menu">
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">EXIT</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile toggle buttons ── */}
      {!isPreGame && (
        <>
          <button
            onClick={() => setShowRoster(v => !v)}
            className={`pointer-events-auto sm:hidden absolute left-2 top-14 z-30 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
              showRoster ? 'bg-primary/20 border border-primary/30' : 'bg-card/80 border border-border/20'
            }`}
          >
            <Users className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setShowFeed(v => !v)}
            className={`pointer-events-auto sm:hidden absolute right-2 top-14 z-30 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
              showFeed ? 'bg-primary/20 border border-primary/30' : 'bg-card/80 border border-border/20'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
          </button>
        </>
      )}

      {/* ── Sidebars ── */}
      {!isPreGame && <TeamRoster state={state} onUnitInspect={onUnitInspect} visible={showRoster} />}
      {!isPreGame && <CombatFeed log={state.log} visible={showFeed} />}

      {/* ── Tactical Minimap — right side, above live feed ── */}
      {!isPreGame && !isGameOver && (
        <TacticalMinimap state={state} inspectedUnitId={inspectedUnitId ?? null} />
      )}

      {/* ── Sponsor HUD Panel (WIP) — bottom-left, below roster ── */}
      {!isPreGame && !isGameOver && state.autoPlay && <SponsorHUDPanel />}

      {/* ── Kill Feed ── */}
      <div className="absolute top-14 sm:top-16 right-[190px] sm:right-[240px] z-20 flex flex-col gap-1.5 pointer-events-none max-w-[180px] sm:max-w-[250px] hidden sm:flex">
        {state.combatEvents.filter(e => e.type === 'kill' && Date.now() - e.timestamp < 3500).map(e => (
          <div key={e.id} className="kill-notification rounded-md px-3 sm:px-4 py-1.5 flex items-center gap-2"
            style={{ background: 'rgba(8,12,18,0.9)', borderLeft: '3px solid hsl(0,75%,55%)' }}>
            <Skull className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[13px] sm:text-sm text-foreground/70 tracking-wider font-bold">{e.message.split('!')[0]}</span>
          </div>
        ))}
      </div>

      {/* ── Bottom center ── */}
      {!isPreGame && (
        <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="rounded-md px-4 sm:px-5 py-1.5 sm:py-2 text-[13px] sm:text-sm text-muted-foreground/25 font-display tracking-[0.15em]"
            style={{ background: 'rgba(8,12,18,0.7)' }}>
            {aliveUnits.length} COMBATANTS • ROUND {state.turn}
          </div>
        </div>
      )}

      {/* Scanlines */}
      <div className="absolute inset-0 crt-scanlines opacity-[0.015] pointer-events-none" />

      {isGameOver && <VictoryScreen state={state} onRestart={onRestart} onMainMenu={onMainMenu} />}
    </div>
  );
}