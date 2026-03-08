import { GameState, Unit, TEAM_COLORS, AbilityId, AP_MOVE_COST, AP_ATTACK_COST, GRID_SIZE, VISION_RANGE, Team } from '@/game/types';
import { useEffect, useRef, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Swords, Heart, Shield, Crosshair, Eye, Home, Trophy, Zap, Target } from 'lucide-react';
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

/* ── Unit Card (compact) ── */
function UnitCard({ unit, isActive, onClick }: { unit: Unit; isActive: boolean; onClick?: () => void }) {
  const hpPct = (unit.hp / unit.maxHp) * 100;
  const tc = TEAM_COLORS[unit.team];
  const portrait = PORTRAITS[unit.id] || PORTRAITS[`${unit.team}-${unit.unitClass}`];

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${onClick ? 'cursor-pointer' : ''} ${
        isActive
          ? 'bg-secondary/60 border-primary/30'
          : 'bg-card/30 border-border/10 hover:bg-secondary/30'
      } ${!unit.isAlive ? 'opacity-10 grayscale pointer-events-none' : ''}`}
    >
      {/* Portrait */}
      <div className="w-8 h-8 rounded overflow-hidden shrink-0 relative border" style={{ borderColor: tc + '30' }}>
        {portrait ? (
          <img src={portrait} alt={unit.name} className="w-full h-full object-cover object-top" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px]" style={{ backgroundColor: tc + '15', color: tc }}>
            {unit.unitClass === 'medic' ? '✚' : '⚔'}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ backgroundColor: tc }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-foreground font-bold truncate">{unit.name}</span>
          {unit.kills > 0 && <span className="text-[7px] text-destructive font-bold ml-1">×{unit.kills}</span>}
        </div>
        {/* HP bar */}
        <div className="mt-0.5 h-[3px] bg-muted/40 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${hpPct}%`,
              backgroundColor: hpPct > 50 ? 'hsl(142,70%,45%)' : hpPct > 25 ? 'hsl(35,90%,55%)' : 'hsl(0,75%,55%)',
            }}
          />
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[7px] text-muted-foreground font-mono">{unit.hp}/{unit.maxHp}</span>
          <span className="text-[6px] text-muted-foreground/60">{unit.weapon.icon}</span>
          {unit.isOnOverwatch && <span className="text-[6px] text-[#4488ff]">◉</span>}
        </div>
      </div>
    </div>
  );
}

/* ── Left Sidebar: Team Roster ── */
function TeamRoster({ state, onUnitInspect }: { state: GameState; onUnitInspect?: (id: string) => void }) {
  const teams = (['blue', 'red', 'green', 'yellow'] as const);

  return (
    <div className="pointer-events-auto absolute left-0 top-12 bottom-0 w-48 glass-panel-dark border-r border-border/15 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border/15">
        <span className="text-[7px] text-muted-foreground tracking-[0.25em] font-bold">TEAM ROSTER</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-2">
        {teams.map(team => {
          const teamUnits = state.units.filter(u => u.team === team);
          const alive = teamUnits.filter(u => u.isAlive).length;

          return (
            <div key={team} className={alive === 0 ? 'opacity-20' : ''}>
              <div className="flex items-center gap-1.5 px-1 mb-1">
                <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                <span className="text-[7px] font-bold tracking-[0.12em] uppercase" style={{ color: TEAM_COLORS[team] }}>
                  {team}
                </span>
                <span className="text-[6px] text-muted-foreground ml-auto">{alive}/{teamUnits.length}</span>
              </div>
              <div className="space-y-0.5">
                {teamUnits.map(u => (
                  <UnitCard
                    key={u.id}
                    unit={u}
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
    if (msg.includes('═')) return 'text-border/30 text-[5px]';
    if (msg.includes('ELIMINATED') || msg.includes('killed')) return 'text-destructive font-bold';
    if (msg.includes('WINS')) return 'text-accent glow-accent font-bold text-[9px]';
    if (msg.includes('CRITICAL')) return 'text-destructive font-bold';
    if (msg.includes('ZONE') || msg.includes('DANGER')) return 'text-destructive';
    if (msg.includes('MISSED')) return 'text-muted-foreground/30 italic';
    if (msg.includes('heals') || msg.includes('💊')) return 'text-primary';
    if (msg.includes('OVERWATCH')) return 'text-[#44aaff]';
    if (msg.includes('picks up') || msg.includes('equips')) return 'text-accent';
    if (msg.includes('»')) return 'text-foreground/80';
    return 'text-muted-foreground/60';
  };

  const getLogIcon = (msg: string) => {
    if (msg.includes('ELIMINATED') || msg.includes('killed')) return '☠';
    if (msg.includes('CRITICAL')) return '!';
    if (msg.includes('ZONE') || msg.includes('DANGER')) return '⚠';
    if (msg.includes('MISSED')) return '○';
    if (msg.includes('heals') || msg.includes('💊')) return '+';
    if (msg.includes('OVERWATCH')) return '◉';
    if (msg.includes('picks up') || msg.includes('equips')) return '▸';
    if (msg.includes('»') || msg.includes('hits') || msg.includes('shoots')) return '›';
    if (msg.includes('═')) return '';
    return '·';
  };

  return (
    <div className="pointer-events-auto absolute right-0 top-12 bottom-0 w-56 glass-panel-dark border-l border-border/15 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border/15 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-destructive/50 animate-pulse" />
        <span className="text-[7px] text-muted-foreground tracking-[0.25em] font-bold">COMBAT FEED</span>
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto px-2.5 py-1.5 font-mono space-y-px">
        {log.slice(-40).map((msg, i) => {
          const icon = getLogIcon(msg);
          return (
            <div key={i} className={`text-[7px] leading-relaxed flex items-start gap-1 ${getLogStyle(msg)}`}>
              {icon && <span className="shrink-0 w-2.5 text-center opacity-50">{icon}</span>}
              <span className="break-words">{msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Minimap (small, bottom-right) ── */
const MINIMAP_SIZE = 120;
const CELL = MINIMAP_SIZE / GRID_SIZE;

function Minimap({ state }: { state: GameState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const tile = state.grid[x][z];
        const outOfZone = state.shrinkLevel > 0 && !isInZone(x, z, state.shrinkLevel);
        const colors: Record<string, string> = {
          grass: '#2a3a1e', dirt: '#4a3d2a', stone: '#3a3a40',
          water: '#1a3050', sand: '#6a5d3a', wall: '#2a2a30',
        };
        ctx.fillStyle = outOfZone ? '#1a0e0e' : (colors[tile.type] || '#2a3a1e');
        ctx.fillRect(x * CELL, z * CELL, CELL + 0.5, CELL + 0.5);
      }
    }

    // Zone border
    if (state.shrinkLevel > 0) {
      const margin = state.shrinkLevel * 2;
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(margin * CELL, margin * CELL, (GRID_SIZE - margin * 2) * CELL, (GRID_SIZE - margin * 2) * CELL);
    }

    // Units
    for (const unit of state.units) {
      if (!unit.isAlive) continue;
      const cx = unit.position.x * CELL + CELL / 2;
      const cz = unit.position.z * CELL + CELL / 2;
      ctx.fillStyle = TEAM_COLORS[unit.team];
      ctx.beginPath();
      ctx.arc(cx, cz, Math.max(CELL * 0.6, 1.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }, [state.units, state.grid, state.shrinkLevel]);

  return (
    <div className="pointer-events-auto absolute right-60 bottom-4 glass-panel rounded p-1.5">
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        className="rounded"
        style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE, imageRendering: 'pixelated' }}
      />
    </div>
  );
}

/* ── Victory Screen ── */
function VictoryScreen({ state, onRestart, onMainMenu }: { state: GameState; onRestart: () => void; onMainMenu?: () => void }) {
  const [show, setShow] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const winnerLine = state.log.find(l => l.includes('WINS'))?.replace('🏆 ', '') || 'BATTLE COMPLETE';
  const winningTeam = (['blue', 'red', 'green', 'yellow'] as const).find(t =>
    state.units.some(u => u.team === t && u.isAlive)
  );
  const winnerColor = winningTeam ? TEAM_COLORS[winningTeam] : '#ffcc00';
  const mvp = [...state.units].sort((a, b) => b.kills - a.kills)[0];
  const mvpPortrait = mvp ? (PORTRAITS[mvp.id] || PORTRAITS[`${mvp.team}-${mvp.unitClass}`]) : null;
  const totalKills = state.units.reduce((s, u) => s + u.kills, 0);
  const survivors = state.units.filter(u => u.isAlive);

  useEffect(() => {
    playVictoryFanfare();
    setTimeout(() => setShow(true), 200);
    setTimeout(() => setShowStats(true), 1000);
  }, []);

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto">
      <div className="absolute inset-0 bg-background/92 backdrop-blur-lg transition-opacity duration-1000" style={{ opacity: show ? 1 : 0 }} />

      {/* Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full transition-all duration-[2s]"
        style={{ background: `radial-gradient(circle, ${winnerColor}12 0%, transparent 70%)`, opacity: show ? 1 : 0 }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
        <div className="text-center transition-all duration-700" style={{ opacity: show ? 1 : 0, transform: `translateY(${show ? 0 : 30}px)` }}>
          <h1 className="text-3xl font-display font-black tracking-[0.5em]"
            style={{ color: winnerColor, textShadow: `0 0 30px ${winnerColor}66` }}>
            VICTORY
          </h1>
          <p className="text-[10px] text-foreground/60 tracking-[0.15em] mt-2">{winnerLine}</p>
        </div>

        <div className="flex gap-4 transition-all duration-700" style={{ opacity: showStats ? 1 : 0, transform: `translateY(${showStats ? 0 : 20}px)` }}>
          {/* MVP */}
          {mvp && (
            <div className="glass-panel rounded-lg p-4 text-center min-w-[140px]">
              <div className="text-[7px] text-accent tracking-[0.3em] mb-2">MVP</div>
              {mvpPortrait && (
                <div className="w-14 h-14 rounded-lg overflow-hidden mx-auto mb-2 border" style={{ borderColor: TEAM_COLORS[mvp.team] + '40' }}>
                  <img src={mvpPortrait} alt={mvp.name} className="w-full h-full object-cover object-top" />
                </div>
              )}
              <div className="text-xs font-bold text-foreground">{mvp.name}</div>
              <div className="text-xl font-bold text-accent mt-1">{mvp.kills}</div>
              <div className="text-[7px] text-muted-foreground">KILLS</div>
            </div>
          )}

          {/* Stats */}
          <div className="glass-panel rounded-lg p-4 text-center min-w-[110px]">
            <div className="text-[7px] text-muted-foreground tracking-[0.3em] mb-2">STATS</div>
            <div className="space-y-2">
              <div><div className="text-lg font-bold text-foreground font-mono">{state.turn}</div><div className="text-[7px] text-muted-foreground">TURNS</div></div>
              <div><div className="text-lg font-bold text-destructive font-mono">{totalKills}</div><div className="text-[7px] text-muted-foreground">KILLS</div></div>
              <div><div className="text-lg font-bold text-primary font-mono">{survivors.length}</div><div className="text-[7px] text-muted-foreground">ALIVE</div></div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-2 transition-all duration-700" style={{ opacity: showStats ? 1 : 0, transitionDelay: '0.3s' }}>
          <button onClick={onRestart}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all text-[10px] tracking-[0.2em] flex items-center gap-2 font-bold">
            <RotateCcw className="w-3.5 h-3.5" /> PLAY AGAIN
          </button>
          {onMainMenu && (
            <button onClick={onMainMenu}
              className="px-6 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-muted transition-colors text-[10px] tracking-[0.2em] flex items-center gap-2 border border-border/30">
              <Home className="w-3.5 h-3.5" /> MENU
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
      <div className="pointer-events-auto flex items-center justify-between px-4 py-1.5 glass-panel-dark border-b border-border/15 h-12">
        {/* Left: Title + Turn */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-display font-bold text-primary tracking-[0.2em]">WARGAMING</span>
          <div className="h-4 w-px bg-border/15" />
          <div className="flex items-center gap-1.5">
            <span className="text-[7px] text-muted-foreground tracking-wider">TURN</span>
            <span className="text-xs font-display font-bold text-foreground">{state.turn}</span>
          </div>
        </div>

        {/* Center: Team pips */}
        <div className="flex items-center gap-2">
          {(['blue', 'red', 'green', 'yellow'] as const).map(team => {
            const alive = aliveByTeam[team];
            const isCurrent = state.currentTeam === team;
            return (
              <div key={team} className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all ${
                alive === 0 ? 'opacity-10' : isCurrent ? 'bg-secondary/50' : ''
              }`}>
                <div className={`w-2 h-2 rounded-sm ${isCurrent && alive > 0 ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: TEAM_COLORS[team] }} />
                <span className="text-[8px] font-bold font-mono" style={{ color: alive > 0 ? TEAM_COLORS[team] : undefined }}>
                  {alive}
                </span>
              </div>
            );
          })}
          {state.autoPlay && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 ml-1">
              <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              <span className="text-[7px] text-primary font-bold tracking-wider">LIVE</span>
            </div>
          )}
        </div>

        {/* Right: Zone + Controls */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold ${
            state.shrinkLevel > 0 ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground'
          }`}>
            <Target className="w-3 h-3" />
            {state.shrinkLevel > 0 ? `LV${state.shrinkLevel}` : 'SAFE'}
            <span className="text-muted-foreground/50 ml-0.5">{state.zoneTimer}t</span>
          </div>
          <div className="h-4 w-px bg-border/15" />
          {isGameOver ? (
            <button onClick={onRestart}
              className="text-[8px] px-3 py-1 bg-accent text-accent-foreground rounded hover:opacity-90 transition-all tracking-wider font-bold flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> NEW
            </button>
          ) : state.autoPlay ? (
            <button onClick={onStopAutoPlay}
              className="text-[8px] px-3 py-1 bg-destructive/80 text-destructive-foreground rounded hover:opacity-90 transition-all tracking-wider font-bold flex items-center gap-1">
              <Pause className="w-3 h-3" /> PAUSE
            </button>
          ) : (
            <button onClick={onStartAutoPlay}
              className="text-[8px] px-3 py-1 bg-primary text-primary-foreground rounded hover:opacity-90 transition-all tracking-wider font-bold flex items-center gap-1">
              <Play className="w-3 h-3" /> PLAY
            </button>
          )}
        </div>
      </div>

      {/* ── Left Sidebar: Team Roster ── */}
      {!isPreGame && <TeamRoster state={state} onUnitInspect={onUnitInspect} />}

      {/* ── Right Sidebar: Combat Feed ── */}
      {!isPreGame && <CombatFeed log={state.log} />}

      {/* ── Minimap ── */}
      {!isPreGame && <Minimap state={state} />}

      {/* ── Kill Feed (top-right, inside combat feed area) ── */}
      <div className="absolute top-14 right-60 z-20 flex flex-col gap-1 pointer-events-none max-w-[260px]">
        {state.combatEvents.filter(e => e.type === 'kill' && Date.now() - e.timestamp < 3000).map(e => (
          <div key={e.id} className="kill-notification glass-panel rounded px-3 py-1.5 flex items-center gap-2 border-l-2 border-destructive">
            <span className="text-[10px] text-destructive">☠</span>
            <span className="text-[8px] text-foreground/80 tracking-wider font-bold">{e.message.split('!')[0]}</span>
          </div>
        ))}
      </div>

      {/* ── Alive count bottom-center ── */}
      {!isPreGame && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="glass-panel rounded px-3 py-1 text-[8px] text-muted-foreground font-mono tracking-wider">
            {aliveUnits.length} COMBATANTS REMAINING
          </div>
        </div>
      )}

      {/* Scanlines */}
      <div className="absolute inset-0 crt-scanlines opacity-[0.03] pointer-events-none" />

      {/* Victory screen */}
      {isGameOver && <VictoryScreen state={state} onRestart={onRestart} onMainMenu={onMainMenu} />}
    </div>
  );
}
