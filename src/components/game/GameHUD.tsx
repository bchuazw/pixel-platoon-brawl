import { GameState, Unit, TEAM_COLORS, AbilityId, AP_MOVE_COST, AP_ATTACK_COST, GRID_SIZE, VISION_RANGE, Team } from '@/game/types';
import { useEffect, useRef, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Swords, Heart, Shield, Crosshair, Eye, Home, Trophy, Zap, Target, Activity } from 'lucide-react';
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

/* ── Compact Unit Card ── */
function UnitCard({ unit, isActive, onClick }: { unit: Unit; isActive: boolean; onClick?: () => void }) {
  const hpPct = (unit.hp / unit.maxHp) * 100;
  const tc = TEAM_COLORS[unit.team];
  const portrait = PORTRAITS[unit.id] || PORTRAITS[`${unit.team}-${unit.unitClass}`];

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-1.5 py-1 rounded border transition-all ${onClick ? 'cursor-pointer hover:brightness-110' : ''} ${
        isActive
          ? 'bg-secondary/60 border-primary/25'
          : 'bg-card/20 border-border/8 hover:bg-secondary/20'
      } ${!unit.isAlive ? 'opacity-8 grayscale pointer-events-none' : ''}`}
    >
      {/* Portrait */}
      <div className="w-7 h-7 rounded overflow-hidden shrink-0 relative" style={{ border: `1px solid ${tc}30` }}>
        {portrait ? (
          <img src={portrait} alt={unit.name} className="w-full h-full object-cover object-top" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[8px]" style={{ backgroundColor: tc + '12', color: tc }}>
            {unit.unitClass === 'medic' ? '✚' : '⚔'}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ backgroundColor: tc }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-foreground font-bold truncate leading-none">{unit.name}</span>
          <div className="flex items-center gap-0.5">
            {unit.kills > 0 && <span className="text-[6px] text-destructive font-bold">×{unit.kills}</span>}
            <span className="text-[6px] text-muted-foreground/50">{unit.weapon.icon}</span>
          </div>
        </div>
        {/* HP bar */}
        <div className="mt-0.5 h-[2px] bg-muted/30 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${hpPct}%`,
              backgroundColor: hpPct > 50 ? 'hsl(142,70%,45%)' : hpPct > 25 ? 'hsl(35,90%,55%)' : 'hsl(0,75%,55%)',
            }}
          />
        </div>
        <div className="flex items-center gap-1 mt-px">
          <span className="text-[6px] text-muted-foreground/60 font-mono">{unit.hp}/{unit.maxHp}</span>
          {unit.isOnOverwatch && <span className="text-[6px] text-[#4488ff]">◉</span>}
          {unit.coverType !== 'none' && (
            <span className={`text-[6px] ${unit.coverType === 'full' ? 'text-[#4488ff]' : 'text-accent/60'}`}>
              {unit.coverType === 'full' ? '▣' : '▤'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Left Sidebar: Team Roster ── */
function TeamRoster({ state, onUnitInspect }: { state: GameState; onUnitInspect?: (id: string) => void }) {
  const teams = (['blue', 'red', 'green', 'yellow'] as const);

  return (
    <div className="pointer-events-auto absolute left-0 top-10 bottom-0 w-44 flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(90deg, rgba(10,14,20,0.92) 0%, rgba(10,14,20,0.85) 80%, rgba(10,14,20,0) 100%)',
      }}>
      <div className="px-2.5 py-1.5 border-b border-border/10">
        <span className="text-[6px] text-muted-foreground/60 tracking-[0.3em] font-bold">ROSTER</span>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-1.5">
        {teams.map(team => {
          const teamUnits = state.units.filter(u => u.team === team);
          const alive = teamUnits.filter(u => u.isAlive).length;
          const totalKills = teamUnits.reduce((s, u) => s + u.kills, 0);

          return (
            <div key={team} className={alive === 0 ? 'opacity-15' : ''}>
              <div className="flex items-center gap-1 px-0.5 mb-0.5">
                <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                <span className="text-[6px] font-bold tracking-[0.1em]" style={{ color: TEAM_COLORS[team] }}>
                  {TEAM_NAMES[team]}
                </span>
                <span className="text-[5px] text-muted-foreground/40 ml-auto">{alive}/{teamUnits.length}</span>
                {totalKills > 0 && <span className="text-[5px] text-destructive/50">☠{totalKills}</span>}
              </div>
              <div className="space-y-px">
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
function CombatFeed({ log, events }: { log: string[]; events: any[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const getLogStyle = (msg: string) => {
    if (msg.includes('═')) return 'text-border/20 text-[4px]';
    if (msg.includes('ELIMINATED') || msg.includes('killed')) return 'text-destructive font-bold';
    if (msg.includes('WINS')) return 'text-accent glow-accent font-bold text-[8px]';
    if (msg.includes('CRITICAL')) return 'text-[#ffaa00] font-bold';
    if (msg.includes('ZONE') || msg.includes('DANGER')) return 'text-destructive';
    if (msg.includes('MISSED')) return 'text-muted-foreground/25 italic';
    if (msg.includes('heals') || msg.includes('💊')) return 'text-primary';
    if (msg.includes('OVERWATCH')) return 'text-[#44aaff]';
    if (msg.includes('picks up') || msg.includes('equips')) return 'text-accent/80';
    if (msg.includes('»')) return 'text-foreground/70';
    return 'text-muted-foreground/50';
  };

  return (
    <div className="pointer-events-auto absolute right-0 top-10 bottom-0 w-52 flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(270deg, rgba(10,14,20,0.92) 0%, rgba(10,14,20,0.85) 80%, rgba(10,14,20,0) 100%)',
      }}>
      <div className="px-2.5 py-1.5 border-b border-border/10 flex items-center gap-1.5">
        <div className="w-1 h-1 rounded-full bg-destructive/50 animate-pulse" />
        <span className="text-[6px] text-muted-foreground/60 tracking-[0.3em] font-bold">LIVE FEED</span>
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-px">
        {log.slice(-50).map((msg, i) => (
          <div key={i} className={`text-[6px] leading-relaxed ${getLogStyle(msg)}`}>
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
    setTimeout(() => setShowStats(true), 900);
  }, []);

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto">
      <div className="absolute inset-0 bg-background/94 backdrop-blur-xl transition-opacity duration-1000" style={{ opacity: show ? 1 : 0 }} />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full transition-all duration-[2s]"
        style={{ background: `radial-gradient(circle, ${winnerColor}10 0%, transparent 70%)`, opacity: show ? 1 : 0 }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <div className="text-center transition-all duration-700" style={{ opacity: show ? 1 : 0, transform: `translateY(${show ? 0 : 20}px)` }}>
          <h1 className="text-2xl font-display font-black tracking-[0.6em]"
            style={{ color: winnerColor, textShadow: `0 0 20px ${winnerColor}44` }}>
            VICTORY
          </h1>
          <p className="text-[9px] text-foreground/50 tracking-[0.12em] mt-1.5">{winnerLine}</p>
        </div>

        <div className="flex gap-3 transition-all duration-700" style={{ opacity: showStats ? 1 : 0, transform: `translateY(${showStats ? 0 : 15}px)` }}>
          {mvp && (
            <div className="glass-panel rounded-lg p-3 text-center min-w-[120px]">
              <div className="text-[6px] text-accent tracking-[0.3em] mb-1.5">MVP</div>
              {mvpPortrait && (
                <div className="w-12 h-12 rounded overflow-hidden mx-auto mb-1.5 border" style={{ borderColor: TEAM_COLORS[mvp.team] + '30' }}>
                  <img src={mvpPortrait} alt={mvp.name} className="w-full h-full object-cover object-top" />
                </div>
              )}
              <div className="text-[10px] font-bold text-foreground">{mvp.name}</div>
              <div className="text-lg font-bold text-accent mt-0.5">{mvp.kills}</div>
              <div className="text-[6px] text-muted-foreground">KILLS</div>
            </div>
          )}

          <div className="glass-panel rounded-lg p-3 text-center min-w-[90px]">
            <div className="text-[6px] text-muted-foreground tracking-[0.3em] mb-1.5">STATS</div>
            <div className="space-y-1.5">
              <div><div className="text-sm font-bold text-foreground font-mono">{state.turn}</div><div className="text-[6px] text-muted-foreground">TURNS</div></div>
              <div><div className="text-sm font-bold text-destructive font-mono">{totalKills}</div><div className="text-[6px] text-muted-foreground">KILLS</div></div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-1 transition-all duration-700" style={{ opacity: showStats ? 1 : 0, transitionDelay: '0.2s' }}>
          <button onClick={onRestart}
            className="px-5 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 transition-all text-[9px] tracking-[0.2em] flex items-center gap-1.5 font-bold">
            <RotateCcw className="w-3 h-3" /> AGAIN
          </button>
          {onMainMenu && (
            <button onClick={onMainMenu}
              className="px-5 py-2 bg-secondary text-secondary-foreground rounded hover:bg-muted transition-colors text-[9px] tracking-[0.2em] flex items-center gap-1.5 border border-border/20">
              <Home className="w-3 h-3" /> MENU
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

      {/* ── Top Bar — minimal, transparent ── */}
      <div className="pointer-events-auto flex items-center justify-between px-4 h-10"
        style={{ background: 'linear-gradient(180deg, rgba(10,14,20,0.8) 0%, rgba(10,14,20,0) 100%)' }}>
        {/* Left */}
        <div className="flex items-center gap-2.5">
          <span className="text-[9px] font-display font-bold text-primary/80 tracking-[0.25em]">WARGAMING</span>
          <div className="h-3 w-px bg-border/10" />
          <div className="flex items-center gap-1">
            <span className="text-[6px] text-muted-foreground/40 tracking-wider">TURN</span>
            <span className="text-[10px] font-display font-bold text-foreground/80">{state.turn}</span>
          </div>
        </div>

        {/* Center: Team indicators */}
        <div className="flex items-center gap-1.5">
          {(['blue', 'red', 'green', 'yellow'] as const).map(team => {
            const alive = aliveByTeam[team];
            const isCurrent = state.currentTeam === team;
            return (
              <div key={team} className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all ${
                alive === 0 ? 'opacity-8' : isCurrent ? 'bg-white/5' : ''
              }`}>
                <div className={`w-1.5 h-1.5 rounded-sm ${isCurrent && alive > 0 ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: alive > 0 ? TEAM_COLORS[team] : TEAM_COLORS[team] + '30' }} />
                <span className="text-[7px] font-bold font-mono" style={{ color: alive > 0 ? TEAM_COLORS[team] : TEAM_COLORS[team] + '30' }}>
                  {alive}
                </span>
              </div>
            );
          })}
          {state.autoPlay && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/8 ml-1">
              <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              <span className="text-[6px] text-primary/70 font-bold tracking-wider">LIVE</span>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-mono font-bold ${
            state.shrinkLevel > 0 ? 'text-destructive/70' : 'text-muted-foreground/30'
          }`}>
            <Target className="w-2.5 h-2.5" />
            {state.shrinkLevel > 0 ? `LV${state.shrinkLevel}` : 'SAFE'}
          </div>
          <div className="h-3 w-px bg-border/10" />
          <span className="text-[6px] text-muted-foreground/30 font-mono">{aliveUnits.length} ALIVE</span>
          <div className="h-3 w-px bg-border/10" />
          {isGameOver ? (
            <button onClick={onRestart}
              className="text-[7px] px-2.5 py-1 bg-accent/80 text-accent-foreground rounded hover:opacity-90 transition-all tracking-wider font-bold flex items-center gap-1">
              <RotateCcw className="w-2.5 h-2.5" /> NEW
            </button>
          ) : state.autoPlay ? (
            <button onClick={onStopAutoPlay}
              className="text-[7px] px-2.5 py-1 bg-destructive/60 text-destructive-foreground rounded hover:opacity-90 transition-all tracking-wider font-bold flex items-center gap-1">
              <Pause className="w-2.5 h-2.5" /> PAUSE
            </button>
          ) : (
            <button onClick={onStartAutoPlay}
              className="text-[7px] px-2.5 py-1 bg-primary/80 text-primary-foreground rounded hover:opacity-90 transition-all tracking-wider font-bold flex items-center gap-1">
              <Play className="w-2.5 h-2.5" /> PLAY
            </button>
          )}
        </div>
      </div>

      {/* ── Sidebars ── */}
      {!isPreGame && <TeamRoster state={state} onUnitInspect={onUnitInspect} />}
      {!isPreGame && <CombatFeed log={state.log} events={state.combatEvents} />}

      {/* ── Kill Feed ── */}
      <div className="absolute top-12 right-56 z-20 flex flex-col gap-1 pointer-events-none max-w-[240px]">
        {state.combatEvents.filter(e => e.type === 'kill' && Date.now() - e.timestamp < 3000).map(e => (
          <div key={e.id} className="kill-notification rounded px-3 py-1 flex items-center gap-2"
            style={{ background: 'rgba(10,14,20,0.85)', borderLeft: '2px solid hsl(0,75%,55%)' }}>
            <span className="text-[9px] text-destructive">☠</span>
            <span className="text-[7px] text-foreground/70 tracking-wider font-bold">{e.message.split('!')[0]}</span>
          </div>
        ))}
      </div>

      {/* ── Bottom center: alive + turn indicator ── */}
      {!isPreGame && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="rounded px-3 py-1 text-[7px] text-muted-foreground/30 font-mono tracking-wider"
            style={{ background: 'rgba(10,14,20,0.6)' }}>
            {aliveUnits.length} COMBATANTS • ROUND {state.turn}
          </div>
        </div>
      )}

      {/* Scanlines */}
      <div className="absolute inset-0 crt-scanlines opacity-[0.02] pointer-events-none" />

      {isGameOver && <VictoryScreen state={state} onRestart={onRestart} onMainMenu={onMainMenu} />}
    </div>
  );
}
