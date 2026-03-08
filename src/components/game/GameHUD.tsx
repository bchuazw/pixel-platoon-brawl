import { GameState, Unit, TEAM_COLORS, AbilityId, AP_MOVE_COST, AP_ATTACK_COST, GRID_SIZE, VISION_RANGE, Team } from '@/game/types';
import { useEffect, useRef, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Swords, Shield, Heart, Crosshair, Eye, Home, Trophy, Zap, Target, Footprints } from 'lucide-react';
import { isInZone, getManhattanDistance } from '@/game/gameState';
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

/* ── Unit Card ── */
function UnitCard({ unit, isActive, onClick }: { unit: Unit; isActive: boolean; onClick?: () => void }) {
  const hpPercent = (unit.hp / unit.maxHp) * 100;
  const teamColor = TEAM_COLORS[unit.team];
  const portrait = PORTRAITS[unit.id] || PORTRAITS[`${unit.team}-${unit.unitClass}`];

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all group ${onClick ? 'cursor-pointer' : ''} ${
        isActive
          ? 'bg-secondary/80 border-primary/30 shadow-[0_0_12px_hsl(142_70%_45%/0.12)]'
          : 'bg-card/50 border-border/15 hover:bg-secondary/40'
      } ${!unit.isAlive ? 'opacity-15 grayscale pointer-events-none' : ''}`}
    >
      {/* Portrait */}
      <div
        className="w-10 h-10 rounded-md overflow-hidden shrink-0 relative border"
        style={{ borderColor: teamColor + '40' }}
      >
        {portrait ? (
          <img src={portrait} alt={unit.name} className="w-full h-full object-cover object-top" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs" style={{ backgroundColor: teamColor + '22', color: teamColor }}>
            {unit.unitClass === 'medic' ? '✚' : '⚔'}
          </div>
        )}
        {/* Team color stripe */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ backgroundColor: teamColor }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] text-foreground font-bold truncate leading-tight">{unit.name}</span>
          {unit.kills > 0 && <span className="text-[8px] text-destructive font-bold">💀{unit.kills}</span>}
        </div>

        {/* HP bar */}
        <div className="mt-0.5 h-[5px] bg-muted/50 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{
              width: `${hpPercent}%`,
              background: hpPercent > 50
                ? 'linear-gradient(90deg, hsl(142, 70%, 40%), hsl(142, 70%, 50%))'
                : hpPercent > 25
                ? 'linear-gradient(90deg, hsl(35, 90%, 45%), hsl(35, 90%, 60%))'
                : 'linear-gradient(90deg, hsl(0, 75%, 45%), hsl(0, 75%, 60%))',
            }}
          />
        </div>

        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[8px] text-muted-foreground font-mono-game">{unit.hp}/{unit.maxHp}</span>
          <div className="flex items-center gap-1">
            <span className="text-[7px] text-accent/80">{unit.weapon.icon}</span>
            {unit.isOnOverwatch && <span className="text-[8px] text-[#44aaff]">◉</span>}
            {unit.isSuppressed && <span className="text-[8px] text-destructive">⛔</span>}
            {unit.coverType === 'full' && <span className="text-[8px] text-[#4488ff]">▣</span>}
            {unit.coverType === 'half' && <span className="text-[8px] text-accent">▤</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Team Roster ── */
function TeamRoster({ state, onUnitInspect, sponsorPoints }: { state: GameState; onUnitInspect?: (id: string) => void; sponsorPoints?: number }) {
  const teams = (['blue', 'red', 'green', 'yellow'] as const);

  return (
    <div className="pointer-events-auto absolute left-3 top-16 w-52 flex flex-col gap-2 max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
      {sponsorPoints !== undefined && (
        <div className="glass-panel rounded-lg px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🎁</span>
            <span className="text-[9px] text-accent font-bold tracking-wider">SPONSOR</span>
          </div>
          <div className="flex items-center gap-1 bg-accent/15 rounded px-2 py-0.5">
            <span className="text-[10px] text-accent font-bold font-mono-game">⭐ {sponsorPoints}</span>
          </div>
        </div>
      )}

      {teams.map(team => {
        const teamUnits = state.units.filter(u => u.team === team);
        const alive = teamUnits.filter(u => u.isAlive).length;
        if (alive === 0 && !teamUnits.some(u => !u.isAlive)) return null;

        return (
          <div key={team} className={`${alive === 0 ? 'opacity-30' : ''}`}>
            <div className="flex items-center gap-2 mb-1 px-1">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
              <span className="text-[8px] font-bold tracking-[0.15em] uppercase" style={{ color: TEAM_COLORS[team] }}>
                {team} TEAM
              </span>
              <span className="text-[7px] text-muted-foreground ml-auto">{alive}/{teamUnits.length}</span>
            </div>
            <div className="space-y-1">
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
  );
}

/* ── Minimap ── */
const MINIMAP_SIZE = 150;
const CELL = MINIMAP_SIZE / GRID_SIZE;

const TILE_MINIMAP_COLORS: Record<string, string> = {
  grass: '#3a5a2a', dirt: '#6a5a40', stone: '#55555a',
  water: '#224466', sand: '#8a7a50', wall: '#44444a',
};

function Minimap({ state }: { state: GameState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const tile = state.grid[x][z];
        const outOfZone = state.shrinkLevel > 0 && !isInZone(x, z, state.shrinkLevel);
        ctx.fillStyle = outOfZone ? '#3a1515' : (TILE_MINIMAP_COLORS[tile.type] || '#3a5a2a');
        ctx.fillRect(x * CELL, z * CELL, CELL, CELL);
        if (tile.prop) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x * CELL, z * CELL, CELL, CELL); }
        if (tile.loot) {
          ctx.fillStyle = tile.loot.type === 'weapon' ? '#ffaa22' : tile.loot.type === 'medkit' ? '#ff4466' : '#4488ff';
          ctx.beginPath(); ctx.arc(x * CELL + CELL/2, z * CELL + CELL/2, CELL * 0.4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // Zone border
    if (state.shrinkLevel > 0) {
      const margin = state.shrinkLevel * 2;
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1.5;
      ctx.strokeRect(margin * CELL, margin * CELL, (GRID_SIZE - margin * 2) * CELL, (GRID_SIZE - margin * 2) * CELL);
    }

    // Units
    for (const unit of state.units) {
      if (!unit.isAlive) continue;
      const cx = unit.position.x * CELL + CELL / 2;
      const cz = unit.position.z * CELL + CELL / 2;
      // Glow
      ctx.beginPath(); ctx.arc(cx, cz, CELL * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = TEAM_COLORS[unit.team] + '30'; ctx.fill();
      // Dot
      ctx.beginPath(); ctx.arc(cx, cz, CELL * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = TEAM_COLORS[unit.team]; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 0.5; ctx.stroke();
    }
  }, [state.units, state.grid, state.shrinkLevel]);

  return (
    <div className="pointer-events-auto absolute right-3 top-16 glass-panel rounded-lg p-2 flex flex-col items-center gap-1.5">
      <div className="text-[7px] text-muted-foreground tracking-[0.2em] font-bold">TACTICAL MAP</div>
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        className="rounded border border-border/20"
        style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE, imageRendering: 'pixelated' }}
      />
      <div className="flex items-center gap-3 text-[6px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/60" /> SAFE
        </span>
        <span className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-destructive/60" /> DANGER
        </span>
      </div>
    </div>
  );
}

/* ── Combat Log ── */
function CombatLog({ log }: { log: string[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const getLogStyle = (msg: string) => {
    if (msg.includes('═')) return 'text-border/40 text-[6px]';
    if (msg.includes('ELIMINATED') || msg.includes('killed')) return 'text-destructive font-bold';
    if (msg.includes('WINS')) return 'text-accent glow-accent font-bold text-[10px]';
    if (msg.includes('CRITICAL')) return 'text-destructive font-bold';
    if (msg.includes('ZONE') || msg.includes('DANGER')) return 'text-destructive';
    if (msg.includes('MISSED')) return 'text-muted-foreground/40 italic';
    if (msg.includes('heals') || msg.includes('💊')) return 'text-primary';
    if (msg.includes('OVERWATCH')) return 'text-[#44aaff]';
    if (msg.includes('picks up') || msg.includes('📦') || msg.includes('equips')) return 'text-accent';
    if (msg.includes('»')) return 'text-foreground/90';
    return 'text-muted-foreground/70';
  };

  const getLogIcon = (msg: string) => {
    if (msg.includes('ELIMINATED') || msg.includes('killed')) return '☠';
    if (msg.includes('CRITICAL')) return '💥';
    if (msg.includes('ZONE') || msg.includes('DANGER')) return '⚠';
    if (msg.includes('MISSED')) return '○';
    if (msg.includes('heals') || msg.includes('💊')) return '✚';
    if (msg.includes('OVERWATCH')) return '◉';
    if (msg.includes('picks up') || msg.includes('equips')) return '▸';
    if (msg.includes('»') || msg.includes('hits') || msg.includes('shoots')) return '›';
    if (msg.includes('═')) return '';
    return '·';
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-4 py-1.5 border-b border-border/20 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-destructive/60 animate-pulse" />
        <span className="text-[8px] text-muted-foreground tracking-[0.2em] font-bold">COMBAT LOG</span>
      </div>
      <div ref={logRef} className="flex-1 h-20 overflow-y-auto px-3 py-1.5 font-mono-game space-y-px">
        {log.slice(-25).map((msg, i) => {
          const icon = getLogIcon(msg);
          return (
            <div key={i} className={`text-[8px] leading-relaxed flex items-start gap-1.5 ${getLogStyle(msg)}`}>
              {icon && <span className="shrink-0 w-3 text-center opacity-60">{icon}</span>}
              <span className="break-words">{msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Victory Screen ── */
function VictoryScreen({ state, onRestart, onMainMenu }: { state: GameState; onRestart: () => void; onMainMenu?: () => void }) {
  const [show, setShow] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; delay: number; color: string; size: number }[]>([]);

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
    setTimeout(() => setShowStats(true), 1200);
    setParticles(Array.from({ length: 40 }, (_, i) => ({
      id: i, x: Math.random() * 100, delay: Math.random() * 2,
      color: ['#ffcc00', '#ff4444', '#44cc44', '#4488ff', '#ff88ff', '#ff8844'][Math.floor(Math.random() * 6)],
      size: 4 + Math.random() * 8,
    })));
  }, []);

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-md transition-opacity duration-1000" style={{ opacity: show ? 1 : 0 }} />

      {particles.map(p => (
        <div key={p.id} className="absolute top-0 pointer-events-none"
          style={{
            left: `${p.x}%`, width: p.size, height: p.size * 1.5, backgroundColor: p.color,
            borderRadius: '2px', animation: `confetti-fall ${3 + Math.random() * 2}s linear ${p.delay}s infinite`,
            transform: `rotate(${Math.random() * 360}deg)`, opacity: show ? 0.9 : 0,
          }}
        />
      ))}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full transition-all duration-[2s]"
        style={{ background: `radial-gradient(circle, ${winnerColor}18 0%, transparent 70%)`, opacity: show ? 1 : 0 }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        <div className="text-center transition-all duration-700" style={{ opacity: show ? 1 : 0, transform: `translateY(${show ? 0 : 40}px)` }}>
          <div className="text-[60px] mb-2" style={{ animation: show ? 'trophy-bounce 1s ease-out 0.5s both' : 'none' }}>🏆</div>
          <h1 className="text-4xl font-display font-black tracking-[0.5em] mb-2"
            style={{ color: winnerColor, textShadow: `0 0 40px ${winnerColor}88, 0 0 80px ${winnerColor}44` }}>
            VICTORY
          </h1>
          <p className="text-xs text-foreground/70 tracking-[0.2em]">{winnerLine}</p>
        </div>

        <div className="flex gap-5 transition-all duration-700" style={{ opacity: showStats ? 1 : 0, transform: `translateY(${showStats ? 0 : 30}px)` }}>
          {/* MVP */}
          {mvp && (
            <div className="glass-panel rounded-xl p-5 text-center min-w-[160px] border-accent/30"
              style={{ boxShadow: `0 0 30px ${winnerColor}15` }}>
              <div className="text-[8px] text-accent tracking-[0.3em] mb-2">⭐ MVP</div>
              {mvpPortrait && (
                <div className="w-16 h-16 rounded-lg overflow-hidden mx-auto mb-2 border-2" style={{ borderColor: TEAM_COLORS[mvp.team] + '60' }}>
                  <img src={mvpPortrait} alt={mvp.name} className="w-full h-full object-cover object-top" />
                </div>
              )}
              <div className="text-sm font-bold text-foreground">{mvp.name}</div>
              <div className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: TEAM_COLORS[mvp.team] }}>
                {mvp.unitClass} • {mvp.team}
              </div>
              <div className="text-2xl font-bold text-accent mt-2">{mvp.kills}</div>
              <div className="text-[8px] text-muted-foreground">KILLS</div>
            </div>
          )}

          {/* Stats */}
          <div className="glass-panel rounded-xl p-5 text-center min-w-[130px]">
            <div className="text-[8px] text-muted-foreground tracking-[0.3em] mb-3">BATTLE STATS</div>
            <div className="space-y-3">
              <div><div className="text-xl font-bold text-foreground font-mono-game">{state.turn}</div><div className="text-[8px] text-muted-foreground">TURNS</div></div>
              <div><div className="text-xl font-bold text-destructive font-mono-game">{totalKills}</div><div className="text-[8px] text-muted-foreground">ELIMINATIONS</div></div>
              <div><div className="text-xl font-bold text-primary font-mono-game">{survivors.length}</div><div className="text-[8px] text-muted-foreground">SURVIVORS</div></div>
            </div>
          </div>

          {/* Survivors */}
          <div className="glass-panel rounded-xl p-5 min-w-[160px]">
            <div className="text-[8px] text-muted-foreground tracking-[0.3em] mb-3 text-center">SURVIVORS</div>
            <div className="space-y-2">
              {survivors.map(u => {
                const p = PORTRAITS[u.id] || PORTRAITS[`${u.team}-${u.unitClass}`];
                return (
                  <div key={u.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded overflow-hidden border" style={{ borderColor: TEAM_COLORS[u.team] + '40' }}>
                      {p ? <img src={p} className="w-full h-full object-cover object-top" /> :
                        <div className="w-full h-full" style={{ backgroundColor: TEAM_COLORS[u.team] + '33' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] text-foreground font-bold truncate block">{u.name}</span>
                    </div>
                    <span className="text-[8px] text-muted-foreground font-mono-game">{u.hp}HP</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-2 transition-all duration-700" style={{ opacity: showStats ? 1 : 0, transitionDelay: '0.3s' }}>
          <button onClick={onRestart}
            className="px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all text-xs tracking-[0.25em] flex items-center gap-2 font-bold"
            style={{ boxShadow: `0 0 25px hsl(var(--primary) / 0.3)` }}>
            <RotateCcw className="w-4 h-4" /> PLAY AGAIN
          </button>
          {onMainMenu && (
            <button onClick={onMainMenu}
              className="px-8 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-muted transition-all text-xs tracking-[0.25em] flex items-center gap-2 border border-border/40">
              <Home className="w-4 h-4" /> MAIN MENU
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes confetti-fall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
        @keyframes trophy-bounce { 0% { transform: scale(0.3) translateY(40px); opacity: 0; } 50% { transform: scale(1.2) translateY(-10px); opacity: 1; } 70% { transform: scale(0.95); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

/* ── Main HUD ── */
export function GameHUD({ state, onEndTurn, onDeselect, onRestart, onUseAbility, onStartAutoPlay, onStopAutoPlay, onMainMenu, sponsorPoints, onUnitInspect }: GameHUDProps) {
  const aliveUnits = state.units.filter(u => u.isAlive);
  const isPreGame = state.phase === 'pre_game';
  const isGameOver = state.phase === 'game_over';

  const aliveByTeam = useMemo(() => {
    const counts: Record<Team, number> = { blue: 0, red: 0, green: 0, yellow: 0 };
    state.units.forEach(u => { if (u.isAlive) counts[u.team]++; });
    return counts;
  }, [state.units]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {isPreGame && <PreGameScreen state={state} onStartAutoPlay={onStartAutoPlay} />}

      {/* ── Top Bar ── */}
      <div className="pointer-events-auto flex items-center justify-between px-4 py-2 glass-panel-dark border-b border-border/20">
        {/* Left: Branding + Turn */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Swords className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-display font-bold text-primary glow-text tracking-[0.2em]">WARGAMING</span>
          </div>
          <div className="h-5 w-px bg-border/20" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground font-mono-game">TURN</span>
            <span className="text-sm font-display font-bold text-foreground">{state.turn}</span>
          </div>
        </div>

        {/* Center: Team status */}
        <div className="flex items-center gap-3">
          {(['blue', 'red', 'green', 'yellow'] as const).map(team => {
            const alive = aliveByTeam[team];
            const isCurrent = state.currentTeam === team;
            return (
              <div key={team} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                alive === 0 ? 'opacity-15' : isCurrent ? 'bg-secondary/60 border border-border/30' : ''
              }`}>
                <div className={`w-2.5 h-2.5 rounded-sm ${isCurrent && alive > 0 ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: TEAM_COLORS[team] }} />
                <span className="text-[9px] font-bold font-mono-game" style={{ color: alive > 0 ? TEAM_COLORS[team] : undefined }}>
                  {alive}
                </span>
              </div>
            );
          })}

          {state.autoPlay && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/15 border border-primary/25 ml-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[8px] text-primary font-bold tracking-wider">AUTO</span>
            </div>
          )}
        </div>

        {/* Right: Zone */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
            state.shrinkLevel > 0 ? 'bg-destructive/15 border border-destructive/25' : 'bg-secondary/30'
          }`}>
            <Target className={`w-3 h-3 ${state.shrinkLevel > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            <span className={`text-[9px] font-mono-game font-bold ${state.shrinkLevel > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {state.shrinkLevel > 0 ? `ZONE LV${state.shrinkLevel}` : 'SAFE'}
            </span>
            <span className="text-[8px] text-muted-foreground font-mono-game">{state.zoneTimer}t</span>
          </div>
          <span className="text-[8px] text-muted-foreground">{aliveUnits.length} ALIVE</span>
        </div>
      </div>

      {/* ── Left: Team Roster ── */}
      {!isPreGame && <TeamRoster state={state} onUnitInspect={onUnitInspect} sponsorPoints={sponsorPoints} />}

      {/* ── Right: Minimap ── */}
      {!isPreGame && <Minimap state={state} />}

      {/* ── Bottom Bar: Combat Log + Controls ── */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 glass-panel-dark border-t border-border/20">
        <div className="flex h-28">
          <CombatLog log={state.log} />

          {/* Controls */}
          <div className="flex flex-col items-center justify-center gap-2 px-5 border-l border-border/20 min-w-[160px]">
            {isGameOver ? (
              <button onClick={onRestart}
                className="text-[10px] px-5 py-2.5 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-all tracking-[0.15em] w-full flex items-center justify-center gap-2 font-bold">
                <RotateCcw className="w-3.5 h-3.5" /> NEW GAME
              </button>
            ) : (
              <>
                {state.autoPlay ? (
                  <button onClick={onStopAutoPlay}
                    className="text-[10px] px-5 py-2.5 bg-destructive/80 text-destructive-foreground rounded-lg hover:opacity-90 transition-all tracking-[0.15em] w-full flex items-center justify-center gap-2 font-bold">
                    <Pause className="w-3.5 h-3.5" /> PAUSE
                  </button>
                ) : (
                  <>
                    <button onClick={onStartAutoPlay}
                      className="text-[10px] px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all tracking-[0.15em] w-full flex items-center justify-center gap-2 font-bold glow-text">
                      <Play className="w-3.5 h-3.5" /> AUTO PLAY
                    </button>
                    <button onClick={onEndTurn}
                      className="text-[9px] px-4 py-1.5 bg-secondary text-secondary-foreground rounded hover:bg-muted transition-colors border border-border/20 w-full font-bold tracking-wider">
                      END TURN ⏎
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Kill Feed ── */}
      <div className="absolute top-14 right-3 z-20 flex flex-col gap-1.5 pointer-events-none max-w-[300px]">
        {state.combatEvents.filter(e => e.type === 'kill' && Date.now() - e.timestamp < 3500).map(e => (
          <div key={e.id} className="kill-notification glass-panel-dark rounded-lg px-4 py-2 flex items-center gap-2.5 border-l-2 border-destructive">
            <span className="text-sm text-destructive glow-destructive">☠</span>
            <span className="text-[9px] text-foreground/90 tracking-wider font-bold">{e.message.split('!')[0]}</span>
          </div>
        ))}
      </div>

      {/* ── Loot Pickup ── */}
      {state.combatEvents.filter(e => e.type === 'loot' && Date.now() - e.timestamp < 2000).map(e => (
        <div key={e.id} className="absolute bottom-32 left-1/2 -translate-x-1/2 animate-fade-in z-20">
          <div className="glass-panel rounded-lg px-6 py-2.5 text-[10px] text-accent tracking-wider font-bold whitespace-nowrap border-l-2 border-accent">
            {e.message}
          </div>
        </div>
      ))}

      {/* Scanlines */}
      <div className="absolute inset-0 crt-scanlines opacity-[0.04]" />

      {/* Victory screen */}
      {isGameOver && <VictoryScreen state={state} onRestart={onRestart} onMainMenu={onMainMenu} />}
    </div>
  );
}
