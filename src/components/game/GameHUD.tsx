import { GameState, Unit, TEAM_COLORS } from '@/game/types';
import { useEffect, useRef } from 'react';

interface GameHUDProps {
  state: GameState;
  onEndTurn: () => void;
  onDeselect: () => void;
  onRestart: () => void;
}

function UnitCard({ unit, isSelected }: { unit: Unit; isSelected: boolean }) {
  const hpPercent = (unit.hp / unit.maxHp) * 100;
  const teamColor = TEAM_COLORS[unit.team];

  return (
    <div
      className={`p-2 rounded pixel-border transition-all ${
        isSelected ? 'bg-secondary ring-1 ring-primary' : 'bg-card'
      } ${!unit.isAlive ? 'opacity-30' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: teamColor }} />
        <span className="text-[8px] text-foreground">{unit.name}</span>
        <span className="text-[7px] text-muted-foreground ml-auto">{unit.unitClass.toUpperCase()}</span>
      </div>
      <div className="mt-1 h-1.5 bg-muted rounded-sm overflow-hidden">
        <div
          className="h-full transition-all"
          style={{
            width: `${hpPercent}%`,
            backgroundColor: hpPercent > 50 ? '#44cc44' : hpPercent > 25 ? '#cccc44' : '#cc4444',
          }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[7px] text-muted-foreground">{unit.hp}/{unit.maxHp}</span>
        <span className="text-[7px] text-muted-foreground">Lv{unit.level}</span>
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

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="pointer-events-auto flex items-center justify-between px-4 py-2 bg-card/90 border-b border-border">
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-foreground glow-text">⚔ TACTICAL ROYALE</span>
          <span className="text-[8px] text-muted-foreground">TURN {state.turn}</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: TEAM_COLORS[state.currentTeam] }} />
            <span className="text-[8px] text-foreground">{state.currentTeam.toUpperCase()}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] text-destructive">
            ZONE: {state.shrinkLevel > 0 ? `LV${state.shrinkLevel}` : 'SAFE'} ({state.zoneTimer}t)
          </span>
        </div>
      </div>

      {/* Left panel - Team units */}
      <div className="pointer-events-auto absolute left-2 top-14 w-44 space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto">
        {state.units
          .filter(u => u.team === 'blue')
          .map(u => (
            <UnitCard key={u.id} unit={u} isSelected={u.id === state.selectedUnitId} />
          ))}
      </div>

      {/* Right panel - Selected unit details */}
      {selectedUnit && (
        <div className="pointer-events-auto absolute right-2 top-14 w-48 bg-card/95 rounded pixel-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: TEAM_COLORS[selectedUnit.team] }} />
            <span className="text-[10px] text-foreground glow-text">{selectedUnit.name}</span>
          </div>
          <div className="space-y-1 text-[8px] text-muted-foreground">
            <div className="flex justify-between"><span>CLASS</span><span className="text-foreground">{selectedUnit.unitClass.toUpperCase()}</span></div>
            <div className="flex justify-between"><span>HP</span><span className="text-foreground">{selectedUnit.hp}/{selectedUnit.maxHp}</span></div>
            <div className="flex justify-between"><span>ATK</span><span className="text-foreground">{selectedUnit.attack}</span></div>
            <div className="flex justify-between"><span>DEF</span><span className="text-foreground">{selectedUnit.defense}</span></div>
            <div className="flex justify-between"><span>MOVE</span><span className="text-foreground">{selectedUnit.moveRange}</span></div>
            <div className="flex justify-between"><span>RANGE</span><span className="text-foreground">{selectedUnit.attackRange}</span></div>
            <div className="flex justify-between"><span>LVL</span><span className="text-foreground">{selectedUnit.level}</span></div>
            <div className="flex justify-between"><span>XP</span><span className="text-foreground">{selectedUnit.xp}/100</span></div>
          </div>
          <button
            onClick={onDeselect}
            className="mt-2 w-full text-[8px] py-1 bg-secondary text-secondary-foreground rounded hover:bg-muted transition-colors"
          >
            DESELECT [ESC]
          </button>
        </div>
      )}

      {/* Bottom bar - Actions & Log */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 bg-card/90 border-t border-border">
        <div className="flex">
          {/* Log */}
          <div ref={logRef} className="flex-1 h-20 overflow-y-auto px-3 py-1">
            {state.log.slice(-8).map((msg, i) => (
              <div key={i} className="text-[8px] text-muted-foreground leading-relaxed">{msg}</div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1 p-2 border-l border-border">
            <span className="text-[7px] text-muted-foreground text-center">
              {state.phase === 'select' && 'SELECT UNIT'}
              {state.phase === 'move' && '📍 MOVE'}
              {state.phase === 'attack' && '⚔ ATTACK'}
              {state.phase === 'game_over' && '🏆 GAME OVER'}
            </span>
            {state.phase !== 'game_over' ? (
              <button
                onClick={onEndTurn}
                className="text-[8px] px-4 py-1.5 bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity glow-text"
              >
                END TURN
              </button>
            ) : (
              <button
                onClick={onRestart}
                className="text-[8px] px-4 py-1.5 bg-accent text-accent-foreground rounded hover:opacity-90 transition-opacity glow-accent"
              >
                NEW GAME
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CRT Scanlines overlay */}
      <div className="absolute inset-0 crt-scanlines" />
    </div>
  );
}
