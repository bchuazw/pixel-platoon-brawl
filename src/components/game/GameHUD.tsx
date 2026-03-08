import { GameState, Unit, TEAM_COLORS, AbilityId, AP_MOVE_COST, AP_ATTACK_COST } from '@/game/types';
import { useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Swords, Shield, Heart, Crosshair } from 'lucide-react';
import bgTactical from '@/assets/bg-tactical.png';

interface GameHUDProps {
  state: GameState;
  onEndTurn: () => void;
  onDeselect: () => void;
  onRestart: () => void;
  onUseAbility: (id: AbilityId) => void;
  onStartAutoPlay: () => void;
  onStopAutoPlay: () => void;
}

const CLASS_ICONS: Record<string, typeof Swords> = {
  soldier: Swords,
  sniper: Crosshair,
  medic: Heart,
  heavy: Shield,
};

function UnitCard({ unit, isActive }: { unit: Unit; isActive: boolean }) {
  const hpPercent = (unit.hp / unit.maxHp) * 100;
  const teamColor = TEAM_COLORS[unit.team];
  const Icon = CLASS_ICONS[unit.unitClass] || Swords;

  return (
    <div
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all ${
        isActive
          ? 'bg-secondary/80 border-primary/40 shadow-[0_0_15px_hsl(142_70%_45%/0.15)]'
          : 'bg-card/60 border-border/20'
      } ${!unit.isAlive ? 'opacity-20 grayscale' : ''}`}
    >
      {/* Team color indicator */}
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
      </div>
    </div>
  );
}

export function GameHUD({ state, onEndTurn, onDeselect, onRestart, onUseAbility, onStartAutoPlay, onStopAutoPlay }: GameHUDProps) {
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
              <h1 className="text-[20px] text-primary glow-text tracking-[0.3em]">TACTICAL ROYALE</h1>
              <p className="text-[9px] text-muted-foreground tracking-wider">4 WARRIORS • 4 CORNERS • 1 SURVIVOR</p>
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
                      HP:{u.hp} ATK:{u.attack} DEF:{u.defense}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={onStartAutoPlay}
              className="px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all glow-text text-[11px] tracking-[0.2em] flex items-center gap-3 mx-auto"
            >
              <Play className="w-5 h-5" />
              START BATTLE
            </button>
            <p className="text-[7px] text-muted-foreground">AI controls all teams • Watch the battle unfold</p>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-auto flex items-center justify-between px-4 py-2 bg-card/90 backdrop-blur-sm border-b border-border/40">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-primary glow-text tracking-[0.15em]">⚔ TACTICAL ROYALE</span>
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
          {/* Team status indicators */}
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
          {state.units.map(u => (
            <UnitCard key={u.id} unit={u} isActive={u.team === state.currentTeam && u.isAlive} />
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 bg-card/90 backdrop-blur-sm border-t border-border/40">
        <div className="flex">
          {/* Combat log */}
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
                  msg.includes('»') ? 'text-foreground' :
                  'text-muted-foreground'
                }`}
              >
                {msg}
              </div>
            ))}
          </div>

          {/* Controls */}
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

      {/* CRT Scanlines */}
      <div className="absolute inset-0 crt-scanlines opacity-10" />

      {/* Kill notification */}
      {state.combatEvents.filter(e => e.type === 'kill' && Date.now() - e.timestamp < 2500).map(e => (
        <div key={e.id} className="absolute top-1/4 left-1/2 -translate-x-1/2 animate-fade-in z-20">
          <div className="bg-destructive/90 text-destructive-foreground px-6 py-2.5 rounded-lg text-[11px] tracking-[0.15em] font-bold whitespace-nowrap border border-destructive">
            💀 {e.message.split('!')[0]}!
          </div>
        </div>
      ))}

      {/* Winner overlay */}
      {isGameOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="bg-card/95 backdrop-blur-md border border-accent/50 rounded-xl px-12 py-8 text-center space-y-3 shadow-[0_0_40px_hsl(35_90%_55%/0.2)]">
            <div className="text-[14px] text-accent glow-accent tracking-[0.3em]">🏆 VICTORY</div>
            <div className="text-[10px] text-foreground tracking-wider">
              {state.log.find(l => l.includes('WINS'))?.replace('🏆 ', '')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
