import { GameState, Unit, TEAM_COLORS, AbilityId, GRID_SIZE, Team } from '@/game/types';
import { useEffect, useRef, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Heart, Shield, Crosshair, Home, Target, Skull } from 'lucide-react';
import { isInZone } from '@/game/gameState';
import { playVictoryFanfare } from '@/game/sounds';
import { PreGameScreen } from './PreGameScreen';

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
      <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 relative" style={{ border: `1.5px solid ${tc}40` }}>
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
          <span className="text-[11px] text-foreground font-bold truncate leading-none">{unit.name}</span>
          <div className="flex items-center gap-1">
            {unit.kills > 0 && <span className="text-[9px] text-destructive font-bold">☠{unit.kills}</span>}
          </div>
        </div>
        {/* HP bar */}
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
          <span className="text-[9px] text-muted-foreground/60 font-mono">{unit.hp}/{unit.maxHp}</span>
          {unit.isOnOverwatch && <span className="text-[9px] text-[#4488ff]">◉</span>}
          {unit.coverType !== 'none' && (
            <span className={`text-[8px] ${unit.coverType === 'full' ? 'text-[#4488ff]' : 'text-accent/60'}`}>
              {unit.coverType === 'full' ? '▣' : '▤'}
            </span>
          )}
          <span className="text-[8px] text-muted-foreground/40 ml-auto">{unit.weapon.name}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Left Sidebar: Team Roster ── */
function TeamRoster({ state, onUnitInspect }: { state: GameState; onUnitInspect?: (id: string) => void }) {
  const teams = (['blue', 'red', 'green', 'yellow'] as const);

  return (
    <div className="pointer-events-auto absolute left-0 top-14 bottom-8 w-56 flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(90deg, rgba(8,12,18,0.95) 0%, rgba(8,12,18,0.88) 75%, rgba(8,12,18,0) 100%)',
      }}>
      <div className="px-3 py-2 border-b border-border/10">
        <span className="text-[10px] text-muted-foreground/50 tracking-[0.3em] font-display font-bold">ROSTER</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-2">
        {teams.map(team => {
          const teamUnits = state.units.filter(u => u.team === team);
          const alive = teamUnits.filter(u => u.isAlive).length;
          const totalKills = teamUnits.reduce((s, u) => s + u.kills, 0);

          return (
            <div key={team} className={alive === 0 ? 'opacity-15' : ''}>
              <div className="flex items-center gap-1.5 px-1 mb-1">
                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                <span className="text-[10px] font-bold tracking-[0.12em]" style={{ color: TEAM_COLORS[team] }}>
                  {TEAM_NAMES[team]}
                </span>
                <span className="text-[9px] text-muted-foreground/40 ml-auto">{alive}/{teamUnits.length}</span>
                {totalKills > 0 && <span className="text-[9px] text-destructive/50">☠{totalKills}</span>}
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
function CombatFeed({ log }: { log: string[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const getLogStyle = (msg: string) => {
    if (msg.includes('═')) return 'text-border/15 text-[7px]';
    if (msg.includes('ELIMINATED') || msg.includes('killed')) return 'text-destructive font-bold';
    if (msg.includes('WINS')) return 'text-accent glow-accent font-bold text-sm';
    if (msg.includes('CRITICAL')) return 'text-[#ffaa00] font-bold';
    if (msg.includes('ZONE') || msg.includes('DANGER')) return 'text-destructive';
    if (msg.includes('MISSED')) return 'text-muted-foreground/25 italic';
    if (msg.includes('heals') || msg.includes('💊')) return 'text-primary';
    if (msg.includes('OVERWATCH')) return 'text-[#44aaff]';
    if (msg.includes('picks up') || msg.includes('equips')) return 'text-accent/80';
    if (msg.includes('»')) return 'text-foreground/60';
    return 'text-muted-foreground/40';
  };

  return (
    <div className="pointer-events-auto absolute right-0 top-14 bottom-8 w-64 flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(270deg, rgba(8,12,18,0.95) 0%, rgba(8,12,18,0.88) 75%, rgba(8,12,18,0) 100%)',
      }}>
      <div className="px-3 py-2 border-b border-border/10 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-destructive/50 animate-pulse" />
        <span className="text-[10px] text-muted-foreground/50 tracking-[0.3em] font-display font-bold">LIVE FEED</span>
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto px-3 py-1.5 space-y-0.5">
        {log.slice(-60).map((msg, i) => (
          <div key={i} className={`text-[10px] leading-relaxed ${getLogStyle(msg)}`}>
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

  const winnerLine = state.log.find(l => l.includes('WINS'))?.replace('🏆 ', '') || '';
  const winningTeam = (['blue', 'red', 'green', 'yellow'] as const).find(t =>
    state.units.some(u => u.team === t && u.isAlive)
  );
  const winnerColor = winningTeam ? TEAM_COLORS[winningTeam] : '#ffcc00';
  const mvp = [...state.units].sort((a, b) => b.kills - a.kills)[0];
  const mvpPortrait = mvp ? (PORTRAITS[mvp.id] || PORTRAITS[`${mvp.team}-${mvp.unitClass}`]) : null;
  const totalKills = state.units.reduce((s, u) => s + u.kills, 0);

  useEffect(() => {
    playVictoryFanfare();
    setTimeout(() => setShow(true), 200);
    setTimeout(() => setShowStats(true), 1000);
  }, []);

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto">
      <div className="absolute inset-0 bg-background/95 backdrop-blur-2xl transition-opacity duration-1000" style={{ opacity: show ? 1 : 0 }} />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full transition-all duration-[2s]"
        style={{ background: `radial-gradient(circle, ${winnerColor}10 0%, transparent 70%)`, opacity: show ? 1 : 0 }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        <div className="text-center transition-all duration-700" style={{ opacity: show ? 1 : 0, transform: `translateY(${show ? 0 : 30}px)` }}>
          <h1 className="text-4xl font-display font-black tracking-[0.6em]"
            style={{ color: winnerColor, textShadow: `0 0 30px ${winnerColor}44` }}>
            VICTORY
          </h1>
          <p className="text-sm text-foreground/50 tracking-[0.12em] mt-2">{winnerLine}</p>
        </div>

        <div className="flex gap-4 transition-all duration-700" style={{ opacity: showStats ? 1 : 0, transform: `translateY(${showStats ? 0 : 20}px)` }}>
          {mvp && (
            <div className="glass-panel rounded-xl p-5 text-center min-w-[160px]">
              <div className="text-[10px] text-accent tracking-[0.3em] mb-2 font-display">MVP</div>
              {mvpPortrait && (
                <div className="w-16 h-16 rounded-lg overflow-hidden mx-auto mb-2 border-2" style={{ borderColor: TEAM_COLORS[mvp.team] + '40' }}>
                  <img src={mvpPortrait} alt={mvp.name} className="w-full h-full object-cover object-top" />
                </div>
              )}
              <div className="text-sm font-bold text-foreground">{mvp.name}</div>
              <div className="text-2xl font-bold text-accent mt-1 font-display">{mvp.kills}</div>
              <div className="text-[10px] text-muted-foreground">KILLS</div>
            </div>
          )}

          <div className="glass-panel rounded-xl p-5 text-center min-w-[120px]">
            <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 font-display">STATS</div>
            <div className="space-y-3">
              <div>
                <div className="text-xl font-bold text-foreground font-display">{state.turn}</div>
                <div className="text-[10px] text-muted-foreground">TURNS</div>
              </div>
              <div>
                <div className="text-xl font-bold text-destructive font-display">{totalKills}</div>
                <div className="text-[10px] text-muted-foreground">KILLS</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-2 transition-all duration-700" style={{ opacity: showStats ? 1 : 0, transitionDelay: '0.3s' }}>
          <button onClick={onRestart}
            className="px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all text-sm tracking-[0.2em] flex items-center gap-2 font-bold font-display">
            <RotateCcw className="w-4 h-4" /> AGAIN
          </button>
          {onMainMenu && (
            <button onClick={onMainMenu}
              className="px-8 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-muted transition-colors text-sm tracking-[0.2em] flex items-center gap-2 border border-border/20 font-display">
              <Home className="w-4 h-4" /> MENU
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main HUD ── */
export function GameHUD({ state, onEndTurn, onDeselect, onRestart, onUseAbility, onStartAutoPlay, onStopAutoPlay, onMainMenu, sponsorPoints, onUnitInspect }: GameHUDProps) {
  const isPreGame = state.phase === 'pre_game';
  const isGameOver = state.phase === 'game_over';
  const aliveUnits = state.units.filter(u => u.isAlive);

  const aliveByTeam = useMemo(() => {
    const counts: Record<Team, number> = { blue: 0, red: 0, green: 0, yellow: 0 };
    state.units.forEach(u => { if (u.isAlive) counts[u.team]++; });
    return counts;
  }, [state.units]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {isPreGame && <PreGameScreen state={state} onStartAutoPlay={onStartAutoPlay} />}

      {/* ── Top Bar ── */}
      <div className="pointer-events-auto flex items-center justify-between px-6 h-14"
        style={{ background: 'linear-gradient(180deg, rgba(8,12,18,0.9) 0%, rgba(8,12,18,0) 100%)' }}>
        {/* Left */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-display font-bold text-primary/80 tracking-[0.3em]">WARGAMING</span>
          <div className="h-5 w-px bg-border/15" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/40 tracking-wider font-display">TURN</span>
            <span className="text-base font-display font-bold text-foreground/80">{state.turn}</span>
          </div>
        </div>

        {/* Center: Team indicators */}
        <div className="flex items-center gap-2">
          {(['blue', 'red', 'green', 'yellow'] as const).map(team => {
            const alive = aliveByTeam[team];
            const isCurrent = state.currentTeam === team;
            return (
              <div key={team} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                alive === 0 ? 'opacity-15' : isCurrent ? 'bg-white/5' : ''
              }`}>
                <div className={`w-2 h-2 rounded-sm ${isCurrent && alive > 0 ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: alive > 0 ? TEAM_COLORS[team] : TEAM_COLORS[team] + '30' }} />
                <span className="text-xs font-bold font-display" style={{ color: alive > 0 ? TEAM_COLORS[team] : TEAM_COLORS[team] + '30' }}>
                  {alive}
                </span>
              </div>
            );
          })}
          {state.autoPlay && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/8 ml-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] text-primary/70 font-bold tracking-wider font-display">LIVE</span>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-display font-bold ${
            state.shrinkLevel > 0 ? 'text-destructive/70' : 'text-muted-foreground/30'
          }`}>
            <Target className="w-3.5 h-3.5" />
            {state.shrinkLevel > 0 ? `LV${state.shrinkLevel}` : 'SAFE'}
          </div>
          <div className="h-5 w-px bg-border/15" />
          <span className="text-xs text-muted-foreground/30 font-display">{aliveUnits.length} ALIVE</span>
          <div className="h-5 w-px bg-border/15" />
          {isGameOver ? (
            <button onClick={onRestart}
              className="text-xs px-4 py-1.5 bg-accent/80 text-accent-foreground rounded-md hover:opacity-90 transition-all tracking-wider font-bold font-display flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> NEW
            </button>
          ) : state.autoPlay ? (
            <button onClick={onStopAutoPlay}
              className="text-xs px-4 py-1.5 bg-destructive/60 text-destructive-foreground rounded-md hover:opacity-90 transition-all tracking-wider font-bold font-display flex items-center gap-1.5">
              <Pause className="w-3.5 h-3.5" /> PAUSE
            </button>
          ) : (
            <button onClick={onStartAutoPlay}
              className="text-xs px-4 py-1.5 bg-primary/80 text-primary-foreground rounded-md hover:opacity-90 transition-all tracking-wider font-bold font-display flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5" /> PLAY
            </button>
          )}
        </div>
      </div>

      {/* ── Sidebars ── */}
      {!isPreGame && <TeamRoster state={state} onUnitInspect={onUnitInspect} />}
      {!isPreGame && <CombatFeed log={state.log} />}

      {/* ── Kill Feed ── */}
      <div className="absolute top-16 right-[280px] z-20 flex flex-col gap-1.5 pointer-events-none max-w-[280px]">
        {state.combatEvents.filter(e => e.type === 'kill' && Date.now() - e.timestamp < 3500).map(e => (
          <div key={e.id} className="kill-notification rounded-md px-4 py-1.5 flex items-center gap-2.5"
            style={{ background: 'rgba(8,12,18,0.9)', borderLeft: '3px solid hsl(0,75%,55%)' }}>
            <Skull className="w-3.5 h-3.5 text-destructive" />
            <span className="text-xs text-foreground/70 tracking-wider font-bold">{e.message.split('!')[0]}</span>
          </div>
        ))}
      </div>

      {/* ── Bottom center ── */}
      {!isPreGame && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="rounded-md px-5 py-2 text-xs text-muted-foreground/25 font-display tracking-[0.15em]"
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