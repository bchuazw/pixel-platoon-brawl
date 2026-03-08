import { GameState, Unit, TEAM_COLORS } from '@/game/types';
import { useEffect, useRef } from 'react';

interface GameHUDProps {
  state: GameState;
  onEndTurn: () => void;
  onDeselect: () => void;
  onRestart: () => void;
}

function UnitPortrait({ unit, isSelected, teamColor }: { unit: Unit; isSelected: boolean; teamColor: string }) {
  const hpPercent = (unit.hp / unit.maxHp) * 100;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded transition-all border ${
        isSelected
          ? 'bg-secondary border-primary/50 shadow-[0_0_12px_hsl(142_70%_45%/0.2)]'
          : 'bg-card/80 border-border/50'
      } ${!unit.isAlive ? 'opacity-25 grayscale' : ''}`}
    >
      <div
        className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold"
        style={{ backgroundColor: teamColor + '33', border: `2px solid ${teamColor}`, color: teamColor }}
      >
        {unit.unitClass[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-foreground truncate">{unit.name}</span>
          <span className="text-[7px] text-muted-foreground">Lv{unit.level}</span>
        </div>
        <div className="mt-0.5 h-1.5 bg-muted/50 rounded-sm overflow-hidden">
          <div
            className="h-full transition-all duration-300 rounded-sm"
            style={{
              width: `${hpPercent}%`,
              backgroundColor: hpPercent > 50 ? '#44cc44' : hpPercent > 25 ? '#cccc44' : '#cc4444',
            }}
          />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[7px] text-muted-foreground">{unit.hp}/{unit.maxHp} HP</span>
          <span className="text-[7px] text-muted-foreground">ATK {unit.attack}</span>
        </div>
      </div>
    </div>
  );
}

export function GameHUD({ state, onEndTurn, onDeselect, onRestart }: GameHUDProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const selectedUnit = state.units.find(u => u.id === state.selectedUnitId);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.log]);

  const aliveCount = state.units.filter(u => u.isAlive).length;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="pointer-events-auto flex items-center justify-between px-4 py-2 bg-card/85 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-foreground glow-text tracking-wider">⚔ TACTICAL ROYALE</span>
          <div className="h-4 w-px bg-border/50" />
          <span className="text-[9px] text-muted-foreground">TURN {state.turn}</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary/50">
            <div className="w-2.5 h-2.5 rounded-sm animate-pulse" style={{ backgroundColor: TEAM_COLORS[state.currentTeam] }} />
            <span className="text-[9px] text-foreground font-bold">{state.currentTeam.toUpperCase()}'S TURN</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[8px] text-muted-foreground">{aliveCount} ALIVE</span>
          <span className={`text-[8px] ${state.shrinkLevel > 0 ? 'text-destructive glow-text' : 'text-muted-foreground'}`}>
            ZONE {state.shrinkLevel > 0 ? `LV${state.shrinkLevel}` : 'SAFE'} • {state.zoneTimer}t
          </span>
        </div>
      </div>

      {/* Left panel - All units */}
      <div className="pointer-events-auto absolute left-2 top-14 w-48 space-y-1.5">
        <div className="text-[8px] text-muted-foreground px-1 mb-1">COMBATANTS</div>
        {state.units.map(u => (
          <UnitPortrait
            key={u.id}
            unit={u}
            isSelected={u.id === state.selectedUnitId}
            teamColor={TEAM_COLORS[u.team]}
          />
        ))}
      </div>

      {/* Right panel - Selected unit details */}
      {selectedUnit && (
        <div className="pointer-events-auto absolute right-2 top-14 w-52 bg-card/90 backdrop-blur-sm rounded pixel-border p-3 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: TEAM_COLORS[selectedUnit.team] }}
            />
            <span className="text-[11px] text-foreground glow-text">{selectedUnit.name}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[8px]">
            {[
              ['CLASS', selectedUnit.unitClass.toUpperCase()],
              ['LEVEL', `${selectedUnit.level}`],
              ['HP', `${selectedUnit.hp}/${selectedUnit.maxHp}`],
              ['XP', `${selectedUnit.xp}/100`],
              ['ATK', `${selectedUnit.attack}`],
              ['DEF', `${selectedUnit.defense}`],
              ['MOVE', `${selectedUnit.moveRange}`],
              ['RANGE', `${selectedUnit.attackRange}`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-foreground">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-1 mt-3">
            {!selectedUnit.hasMoved && <span className="text-[7px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">CAN MOVE</span>}
            {!selectedUnit.hasAttacked && <span className="text-[7px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">CAN ATTACK</span>}
          </div>

          <button
            onClick={onDeselect}
            className="mt-2 w-full text-[8px] py-1.5 bg-secondary text-secondary-foreground rounded hover:bg-muted transition-colors border border-border/50"
          >
            DESELECT [ESC]
          </button>
        </div>
      )}

      {/* Bottom bar */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 bg-card/85 backdrop-blur-sm border-t border-border/50">
        <div className="flex">
          <div ref={logRef} className="flex-1 h-24 overflow-y-auto px-4 py-2">
            {state.log.slice(-10).map((msg, i) => (
              <div
                key={i}
                className={`text-[8px] leading-relaxed ${
                  msg.includes('ELIMINATED') ? 'text-destructive' :
                  msg.includes('WINS') ? 'text-accent glow-accent' :
                  msg.includes('ZONE') ? 'text-destructive' :
                  msg.includes('Turn') ? 'text-primary' :
                  'text-muted-foreground'
                }`}
              >
                {msg}
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center justify-center gap-2 px-4 border-l border-border/50 min-w-[120px]">
            <span className="text-[8px] text-muted-foreground">
              {state.phase === 'select' && '👆 SELECT UNIT'}
              {state.phase === 'move' && '📍 CLICK TO MOVE'}
              {state.phase === 'attack' && '⚔ CLICK TO ATTACK'}
              {state.phase === 'game_over' && '🏆 GAME OVER'}
            </span>
            {state.phase !== 'game_over' ? (
              <button
                onClick={onEndTurn}
                className="text-[9px] px-5 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 transition-all glow-text tracking-wider"
              >
                END TURN
              </button>
            ) : (
              <button
                onClick={onRestart}
                className="text-[9px] px-5 py-2 bg-accent text-accent-foreground rounded hover:opacity-90 transition-all glow-accent tracking-wider"
              >
                NEW GAME
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CRT Scanlines */}
      <div className="absolute inset-0 crt-scanlines opacity-30" />
    </div>
  );
}
