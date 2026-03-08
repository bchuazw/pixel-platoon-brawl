import { GameState, Unit, TEAM_COLORS, AbilityId, AP_MOVE_COST, AP_ATTACK_COST, GRID_SIZE, VISION_RANGE } from '@/game/types';
import { useEffect, useRef, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Swords, Shield, Heart, Crosshair, Eye, Home, Trophy } from 'lucide-react';
import { isInZone, getManhattanDistance } from '@/game/gameState';
import { playVictoryFanfare } from '@/game/sounds';
import bgTactical from '@/assets/bg-tactical.png';

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

const CLASS_ICONS: Record<string, typeof Swords> = {
  soldier: Swords,
  medic: Heart,
};

function UnitCard({ unit, isActive, onClick }: { unit: Unit; isActive: boolean; onClick?: () => void }) {
  const hpPercent = (unit.hp / unit.maxHp) * 100;
  const teamColor = TEAM_COLORS[unit.team];
  const Icon = CLASS_ICONS[unit.unitClass] || Swords;

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${onClick ? 'cursor-pointer hover:bg-secondary/60' : ''} ${
        isActive
          ? 'bg-secondary/80 border-primary/40 shadow-[0_0_15px_hsl(142_70%_45%/0.15)]'
          : 'bg-card/60 border-border/20'
      } ${!unit.isAlive ? 'opacity-20 grayscale' : ''}`}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{ backgroundColor: teamColor + '22', border: `2px solid ${teamColor}` }}
      >
        <Icon className="w-4 h-4" style={{ color: teamColor }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-foreground font-bold truncate">{unit.name}</span>
          <span className="text-[7px] uppercase tracking-wider" style={{ color: teamColor }}>{unit.team}</span>
        </div>

        {/* HP bar */}
        <div className="mt-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{
              width: `${hpPercent}%`,
              backgroundColor: hpPercent > 50 ? 'hsl(142, 70%, 45%)' : hpPercent > 25 ? 'hsl(35, 90%, 55%)' : 'hsl(0, 75%, 55%)',
            }}
          />
        </div>

        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[7px] text-muted-foreground">{unit.hp}/{unit.maxHp} HP</span>
          <div className="flex items-center gap-1">
            {/* Weapon indicator */}
            <span className="text-[6px] text-accent">{unit.weapon.icon}{unit.weapon.ammo !== -1 ? `${unit.weapon.ammo}` : ''}</span>
            {unit.isOnOverwatch && <span className="text-[7px] text-[#44aaff]">👁</span>}
            {unit.isSuppressed && <span className="text-[7px] text-destructive">⛔</span>}
            {unit.coverType !== 'none' && (
              <span className={`text-[7px] ${unit.coverType === 'full' ? 'text-[#4488ff]' : 'text-accent'}`}>
                {unit.coverType === 'full' ? '🛡' : '◐'}
              </span>
            )}
            {unit.kills > 0 && <span className="text-[7px] text-destructive">💀{unit.kills}</span>}
          </div>
        </div>
        
        {/* Weapon name */}
        <div className="text-[6px] text-muted-foreground/70 mt-0.5">{unit.weapon.name}</div>
      </div>
    </div>
  );
}

const MINIMAP_SIZE = 140;
const CELL = MINIMAP_SIZE / GRID_SIZE;

const TILE_MINIMAP_COLORS: Record<string, string> = {
  grass: '#3a5a2a', dirt: '#6a5a40', stone: '#55555a',
  water: '#2244668', sand: '#8a7a50', wall: '#44444a',
};

function Minimap({ state }: { state: GameState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Draw tiles
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const tile = state.grid[x][z];
        const outOfZone = state.shrinkLevel > 0 && !isInZone(x, z, state.shrinkLevel);

        if (outOfZone) {
          ctx.fillStyle = '#3a1515';
        } else {
          ctx.fillStyle = TILE_MINIMAP_COLORS[tile.type] || '#3a5a2a';
        }
        ctx.fillRect(x * CELL, z * CELL, CELL, CELL);

        if (tile.prop) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x * CELL + 1, z * CELL + 1, CELL - 2, CELL - 2);
        }

        // Loot markers
        if (tile.loot) {
          ctx.fillStyle = tile.loot.type === 'weapon' ? '#ffaa22' :
                         tile.loot.type === 'medkit' ? '#ff4466' :
                         tile.loot.type === 'armor' ? '#4488ff' : '#88cc44';
          ctx.fillRect(x * CELL + 1, z * CELL + 1, CELL - 2, CELL - 2);
        }

        if (tile.hasSmoke) {
          ctx.fillStyle = 'rgba(150,170,190,0.4)';
          ctx.fillRect(x * CELL, z * CELL, CELL, CELL);
        }
      }
    }

    // Draw zone border
    if (state.shrinkLevel > 0) {
      const margin = state.shrinkLevel * 2;
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        margin * CELL, margin * CELL,
        (GRID_SIZE - margin * 2) * CELL, (GRID_SIZE - margin * 2) * CELL
      );
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, MINIMAP_SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(MINIMAP_SIZE, i * CELL); ctx.stroke();
    }

    // Draw units with vision circles
    for (const unit of state.units) {
      if (!unit.isAlive) continue;
      const cx = unit.position.x * CELL + CELL / 2;
      const cz = unit.position.z * CELL + CELL / 2;

      // Vision range circle (subtle)
      ctx.beginPath();
      ctx.arc(cx, cz, VISION_RANGE * CELL, 0, Math.PI * 2);
      ctx.strokeStyle = TEAM_COLORS[unit.team] + '20';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Outer glow
      ctx.beginPath();
      ctx.arc(cx, cz, CELL * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = TEAM_COLORS[unit.team] + '44';
      ctx.fill();

      // Unit dot
      ctx.beginPath();
      ctx.arc(cx, cz, CELL * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = TEAM_COLORS[unit.team];
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }, [state.units, state.grid, state.shrinkLevel]);

  return (
    <div className="pointer-events-auto absolute right-2 top-14 bg-card/90 backdrop-blur-sm border border-border/40 rounded-lg p-1.5">
      <div className="text-[6px] text-muted-foreground tracking-[0.15em] text-center mb-1">TACTICAL MAP</div>
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        className="rounded border border-border/30"
        style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE, imageRendering: 'pixelated' }}
      />
      <div className="flex items-center justify-center gap-1 mt-1">
        <Eye className="w-2.5 h-2.5 text-muted-foreground" />
        <span className="text-[5px] text-muted-foreground">FOG OF WAR ACTIVE</span>
      </div>
    </div>
  );
}

function VictoryScreen({ state, onRestart, onMainMenu }: { state: GameState; onRestart: () => void; onMainMenu?: () => void }) {
  const [show, setShow] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; delay: number; color: string; size: number }[]>([]);

  const winnerLine = state.log.find(l => l.includes('WINS'))?.replace('🏆 ', '') || 'BATTLE COMPLETE';
  const winningTeam = (['blue', 'red', 'green', 'yellow'] as const).find(t =>
    state.units.some(u => u.team === t && u.isAlive)
  );
  const winnerColor = winningTeam ? TEAM_COLORS[winningTeam] : '#ffcc00';

  // MVP - most kills
  const mvp = [...state.units].sort((a, b) => b.kills - a.kills)[0];
  const totalKills = state.units.reduce((s, u) => s + u.kills, 0);
  const survivors = state.units.filter(u => u.isAlive);

  useEffect(() => {
    playVictoryFanfare();
    // Stagger reveal
    setTimeout(() => setShow(true), 200);
    setTimeout(() => setShowStats(true), 1200);

    // Generate confetti particles
    const confetti = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
      color: ['#ffcc00', '#ff4444', '#44cc44', '#4488ff', '#ff88ff', '#ff8844'][Math.floor(Math.random() * 6)],
      size: 4 + Math.random() * 8,
    }));
    setParticles(confetti);
  }, []);

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto">
      {/* Dark overlay with fade in */}
      <div
        className="absolute inset-0 bg-background/85 backdrop-blur-sm transition-opacity duration-1000"
        style={{ opacity: show ? 1 : 0 }}
      />

      {/* Confetti particles */}
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute top-0 pointer-events-none"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size * 1.5,
            backgroundColor: p.color,
            borderRadius: '2px',
            animation: `confetti-fall ${3 + Math.random() * 2}s linear ${p.delay}s infinite`,
            transform: `rotate(${Math.random() * 360}deg)`,
            opacity: show ? 0.9 : 0,
          }}
        />
      ))}

      {/* Radial glow behind trophy */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full transition-all duration-[2s]"
        style={{
          background: `radial-gradient(circle, ${winnerColor}22 0%, transparent 70%)`,
          opacity: show ? 1 : 0,
          transform: `translate(-50%, -50%) scale(${show ? 1 : 0.3})`,
        }}
      />

      {/* Main content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        {/* Trophy + title */}
        <div
          className="text-center transition-all duration-700"
          style={{
            opacity: show ? 1 : 0,
            transform: `translateY(${show ? 0 : 40}px) scale(${show ? 1 : 0.5})`,
          }}
        >
          <div
            className="text-[60px] mb-2"
            style={{ animation: show ? 'trophy-bounce 1s ease-out 0.5s both' : 'none' }}
          >
            🏆
          </div>
          <h1
            className="text-[28px] font-bold tracking-[0.4em] mb-2"
            style={{ color: winnerColor, textShadow: `0 0 30px ${winnerColor}88, 0 0 60px ${winnerColor}44` }}
          >
            VICTORY
          </h1>
          <p className="text-[12px] text-foreground/80 tracking-[0.2em]">{winnerLine}</p>
        </div>

        {/* Stats cards */}
        <div
          className="flex gap-4 transition-all duration-700"
          style={{
            opacity: showStats ? 1 : 0,
            transform: `translateY(${showStats ? 0 : 30}px)`,
          }}
        >
          {/* MVP Card */}
          {mvp && (
            <div className="bg-card/90 border border-accent/40 rounded-xl p-4 text-center min-w-[140px]"
              style={{ boxShadow: `0 0 20px ${winnerColor}22` }}>
              <div className="text-[7px] text-accent tracking-[0.2em] mb-1">⭐ MVP</div>
              <div className="text-[12px] font-bold text-foreground">{mvp.name}</div>
              <div className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: TEAM_COLORS[mvp.team] }}>
                {mvp.unitClass} • {mvp.team}
              </div>
              <div className="text-[18px] font-bold text-accent mt-1">{mvp.kills}</div>
              <div className="text-[7px] text-muted-foreground">KILLS</div>
            </div>
          )}

          {/* Battle stats */}
          <div className="bg-card/90 border border-border/40 rounded-xl p-4 text-center min-w-[120px]">
            <div className="text-[7px] text-muted-foreground tracking-[0.2em] mb-2">BATTLE STATS</div>
            <div className="space-y-2">
              <div>
                <div className="text-[16px] font-bold text-foreground">{state.turn}</div>
                <div className="text-[7px] text-muted-foreground">TURNS</div>
              </div>
              <div>
                <div className="text-[16px] font-bold text-destructive">{totalKills}</div>
                <div className="text-[7px] text-muted-foreground">ELIMINATIONS</div>
              </div>
              <div>
                <div className="text-[16px] font-bold text-primary">{survivors.length}</div>
                <div className="text-[7px] text-muted-foreground">SURVIVORS</div>
              </div>
            </div>
          </div>

          {/* Survivors */}
          <div className="bg-card/90 border border-border/40 rounded-xl p-4 min-w-[140px]">
            <div className="text-[7px] text-muted-foreground tracking-[0.2em] mb-2 text-center">SURVIVORS</div>
            <div className="space-y-1.5">
              {survivors.map(u => (
                <div key={u.id} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TEAM_COLORS[u.team] }} />
                  <span className="text-[8px] text-foreground font-bold">{u.name}</span>
                  <span className="text-[7px] text-muted-foreground ml-auto">{u.hp}HP</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div
          className="flex gap-3 mt-2 transition-all duration-700"
          style={{
            opacity: showStats ? 1 : 0,
            transform: `translateY(${showStats ? 0 : 20}px)`,
            transitionDelay: '0.3s',
          }}
        >
          <button
            onClick={onRestart}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all text-[11px] tracking-[0.2em] flex items-center gap-2"
            style={{ boxShadow: `0 0 20px hsl(var(--primary) / 0.3)` }}
          >
            <RotateCcw className="w-4 h-4" />
            PLAY AGAIN
          </button>
          {onMainMenu && (
            <button
              onClick={onMainMenu}
              className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-muted transition-all text-[11px] tracking-[0.2em] flex items-center gap-2 border border-border/40"
            >
              <Home className="w-4 h-4" />
              MAIN MENU
            </button>
          )}
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes trophy-bounce {
          0% { transform: scale(0.3) translateY(40px); opacity: 0; }
          50% { transform: scale(1.2) translateY(-10px); opacity: 1; }
          70% { transform: scale(0.95) translateY(2px); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function GameHUD({ state, onEndTurn, onDeselect, onRestart, onUseAbility, onStartAutoPlay, onStopAutoPlay, onMainMenu, sponsorPoints, onUnitInspect }: GameHUDProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.log]);

  const aliveUnits = state.units.filter(u => u.isAlive);
  const isPreGame = state.phase === 'pre_game';
  const isGameOver = state.phase === 'game_over';

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Pre-game overlay */}
      {isPreGame && (
        <div className="absolute inset-0 z-30 pointer-events-auto flex items-center justify-center">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30"
            style={{ backgroundImage: `url(${bgTactical})` }}
          />
          <div className="absolute inset-0 bg-background/80" />
          <div className="relative z-10 text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-[20px] text-primary glow-text tracking-[0.3em]">WARGAMING</h1>
              <p className="text-[9px] text-muted-foreground tracking-wider">4 SQUADS • 8 COMBATANTS • 1 TEAM SURVIVES</p>
              <p className="text-[7px] text-accent tracking-wider">EACH SQUAD: 1 SOLDIER + 1 MEDIC • FIND LOOT TO UPGRADE!</p>
            </div>

            {/* Unit previews */}
            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
              {state.units.map(u => (
                <div key={u.id} className="bg-card/80 border border-border/30 rounded-lg p-3 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: TEAM_COLORS[u.team] + '22', border: `2px solid ${TEAM_COLORS[u.team]}` }}
                  >
                    {(() => { const I = CLASS_ICONS[u.unitClass]; return <I className="w-5 h-5" style={{ color: TEAM_COLORS[u.team] }} />; })()}
                  </div>
                  <div>
                    <div className="text-[9px] text-foreground font-bold">{u.name}</div>
                    <div className="text-[7px] uppercase tracking-wider" style={{ color: TEAM_COLORS[u.team] }}>
                      {u.unitClass} • {u.team}
                    </div>
                    <div className="text-[7px] text-muted-foreground">
                      HP:{u.hp} • {u.weapon.name} • Vision:{u.visionRange}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <button
                onClick={onStartAutoPlay}
                className="px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all glow-text text-[11px] tracking-[0.2em] flex items-center gap-3 mx-auto"
              >
                <Play className="w-5 h-5" />
                START BATTLE
              </button>
              <p className="text-[7px] text-muted-foreground">AI commands each squad • Fog of War active • Medics heal allies!</p>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-auto flex items-center justify-between px-4 py-2 glass-panel border-b border-border/40">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-primary glow-text tracking-[0.15em]">⚔ WARGAMING</span>
          <div className="h-4 w-px bg-border/30" />
          <span className="text-[8px] text-muted-foreground">TURN {state.turn}</span>
          {!isPreGame && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary/50">
              <div className="w-2.5 h-2.5 rounded-sm animate-pulse" style={{ backgroundColor: TEAM_COLORS[state.currentTeam] }} />
              <span className="text-[8px] text-foreground font-bold">{state.currentTeam.toUpperCase()}</span>
            </div>
          )}
          {state.autoPlay && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 border border-primary/30">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[7px] text-primary font-bold">AUTO</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {(['blue', 'red', 'green', 'yellow'] as const).map(team => {
              const alive = state.units.filter(u => u.team === team && u.isAlive).length;
              return (
                <div key={team} className={`flex items-center gap-1 ${alive === 0 ? 'opacity-20' : ''}`}>
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                  <span className="text-[7px] text-muted-foreground">{alive > 0 ? '●' : '✕'}</span>
                </div>
              );
            })}
          </div>
          <span className={`text-[7px] ${state.shrinkLevel > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            ZONE {state.shrinkLevel > 0 ? `LV${state.shrinkLevel}` : 'SAFE'} • {state.zoneTimer}t
          </span>
        </div>
      </div>

      {/* Left - Unit cards */}
      {!isPreGame && (
        <div className="pointer-events-auto absolute left-2 top-14 w-48 space-y-1.5 max-h-[calc(100vh-200px)] overflow-y-auto">
          {sponsorPoints !== undefined && (
            <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-1.5 text-center mb-1">
              <span className="text-[7px] text-accent font-bold">🎁 SPONSOR POINTS: ⭐{sponsorPoints}</span>
              <div className="text-[5px] text-muted-foreground mt-0.5">Click a unit to sponsor</div>
            </div>
          )}
          {state.units.map(u => (
            <UnitCard key={u.id} unit={u} isActive={u.team === state.currentTeam && u.isAlive} onClick={() => onUnitInspect?.(u.id)} />
          ))}
        </div>
      )}

      {/* Minimap */}
      {!isPreGame && <Minimap state={state} />}

      {/* Bottom bar */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 glass-panel-dark border-t border-border/40">
        <div className="flex">
          <div ref={logRef} className="flex-1 h-24 overflow-y-auto px-4 py-2 font-mono">
            {state.log.slice(-20).map((msg, i) => (
              <div
                key={i}
                className={`text-[7px] leading-relaxed ${
                  msg.includes('═') ? 'text-muted-foreground/30' :
                  msg.includes('ELIMINATED') || msg.includes('killed') ? 'text-destructive font-bold' :
                  msg.includes('WINS') ? 'text-accent glow-accent font-bold text-[9px]' :
                  msg.includes('CRITICAL') ? 'text-destructive' :
                  msg.includes('ZONE') || msg.includes('DANGER') ? 'text-destructive animate-pulse' :
                  msg.includes('MISSED') ? 'text-muted-foreground/50' :
                  msg.includes('heals') || msg.includes('💊') ? 'text-primary' :
                  msg.includes('OVERWATCH') ? 'text-[#44aaff]' :
                  msg.includes('picks up') || msg.includes('📦') || msg.includes('equips') ? 'text-accent' :
                  msg.includes('»') ? 'text-foreground' :
                  'text-muted-foreground'
                }`}
              >
                {msg}
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center justify-center gap-2 px-4 border-l border-border/40 min-w-[150px]">
            {isGameOver ? (
              <button
                onClick={onRestart}
                className="text-[9px] px-5 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-all glow-accent tracking-wider w-full flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                NEW GAME
              </button>
            ) : (
              <>
                {state.autoPlay ? (
                  <button
                    onClick={onStopAutoPlay}
                    className="text-[9px] px-5 py-2 bg-destructive/80 text-destructive-foreground rounded-lg hover:opacity-90 transition-all tracking-wider w-full flex items-center justify-center gap-2"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    PAUSE
                  </button>
                ) : (
                  <>
                    <button
                      onClick={onStartAutoPlay}
                      className="text-[9px] px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all glow-text tracking-wider w-full flex items-center justify-center gap-2"
                    >
                      <Play className="w-3.5 h-3.5" />
                      AUTO PLAY
                    </button>
                    <button
                      onClick={onEndTurn}
                      className="text-[8px] px-4 py-1.5 bg-secondary text-secondary-foreground rounded hover:bg-muted transition-colors border border-border/30 w-full"
                    >
                      END TURN ⏎
                    </button>
                  </>
                )}
              </>
            )}
            <span className="text-[7px] text-muted-foreground">
              {aliveUnits.length} alive • Turn {state.turn}
            </span>
          </div>
        </div>
      </div>

      {/* Scanlines */}
      <div className="absolute inset-0 crt-scanlines opacity-[0.06]" />

      {/* Kill feed - top right */}
      <div className="absolute top-14 right-3 z-20 flex flex-col gap-1.5 pointer-events-none max-w-[280px]">
        {state.combatEvents.filter(e => e.type === 'kill' && Date.now() - e.timestamp < 3500).map(e => (
          <div key={e.id} className="kill-notification glass-panel-dark rounded px-3 py-1.5 flex items-center gap-2 border-l-2 border-destructive">
            <span className="text-[8px] text-destructive glow-destructive">☠</span>
            <span className="text-[7px] text-foreground/90 tracking-wider">{e.message.split('!')[0]}</span>
          </div>
        ))}
      </div>

      {/* Loot pickup - bottom center */}
      {state.combatEvents.filter(e => e.type === 'loot' && Date.now() - e.timestamp < 2000).map(e => (
        <div key={e.id} className="absolute bottom-28 left-1/2 -translate-x-1/2 animate-fade-in z-20">
          <div className="glass-panel rounded-lg px-5 py-2 text-[9px] text-accent tracking-wider font-bold whitespace-nowrap border-l-2 border-accent">
            {e.message}
          </div>
        </div>
      ))}

      {/* Victory screen */}
      {isGameOver && <VictoryScreen state={state} onRestart={onRestart} onMainMenu={onMainMenu} />}
    </div>
  );
}
