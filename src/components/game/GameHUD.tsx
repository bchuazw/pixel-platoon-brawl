import { GameState, Unit, TEAM_COLORS, AbilityId, AP_MOVE_COST, AP_ATTACK_COST } from '@/game/types';
import { useEffect, useRef } from 'react';

interface GameHUDProps {
  state: GameState;
  onEndTurn: () => void;
  onDeselect: () => void;
  onRestart: () => void;
  onUseAbility: (id: AbilityId) => void;
}

function UnitPortrait({ unit, isSelected, teamColor }: { unit: Unit; isSelected: boolean; teamColor: string }) {
  const hpPercent = (unit.hp / unit.maxHp) * 100;

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded transition-all border ${
        isSelected
          ? 'bg-secondary border-primary/50 shadow-[0_0_12px_hsl(142_70%_45%/0.2)]'
          : 'bg-card/80 border-border/30'
      } ${!unit.isAlive ? 'opacity-20 grayscale' : ''}`}
    >
      <div
        className="w-7 h-7 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
        style={{ backgroundColor: teamColor + '33', border: `2px solid ${teamColor}`, color: teamColor }}
      >
        {unit.unitClass[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[8px] text-foreground truncate">{unit.name}</span>
          <div className="flex gap-0.5">
            {Array.from({ length: unit.maxAp }).map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < unit.ap ? 'bg-accent' : 'bg-muted'}`} />
            ))}
          </div>
        </div>
        <div className="mt-0.5 h-1 bg-muted/50 rounded-sm overflow-hidden">
          <div
            className="h-full transition-all duration-300 rounded-sm"
            style={{
              width: `${hpPercent}%`,
              backgroundColor: hpPercent > 50 ? '#44cc44' : hpPercent > 25 ? '#cccc44' : '#cc4444',
            }}
          />
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[6px] text-muted-foreground">{unit.hp}/{unit.maxHp}</span>
          {unit.isOnOverwatch && <span className="text-[6px] text-[#44aaff]">👁</span>}
          {unit.isSuppressed && <span className="text-[6px] text-destructive">⛔</span>}
          {unit.coverType !== 'none' && (
            <span className={`text-[6px] ${unit.coverType === 'full' ? 'text-[#4488ff]' : 'text-accent'}`}>
              {unit.coverType === 'full' ? '🛡' : '◐'}
            </span>
          )}
          {unit.kills > 0 && <span className="text-[6px] text-destructive">💀{unit.kills}</span>}
        </div>
      </div>
    </div>
  );
}

function ActionBar({ unit, onUseAbility, phase }: {
  unit: Unit; onUseAbility: (id: AbilityId) => void; phase: string;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Ability buttons */}
      {unit.abilities.map(ability => {
        const onCooldown = (unit.cooldowns[ability.id] || 0) > 0;
        const noAp = unit.ap < ability.apCost;
        const disabled = onCooldown || noAp;

        return (
          <button
            key={ability.id}
            onClick={() => !disabled && onUseAbility(ability.id)}
            disabled={disabled}
            className={`relative px-2 py-1.5 rounded border text-[8px] transition-all ${
              disabled
                ? 'border-border/30 bg-muted/30 text-muted-foreground/50 cursor-not-allowed'
                : 'border-accent/50 bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer'
            }`}
            title={ability.description}
          >
            <span className="mr-1">{ability.icon}</span>
            {ability.name}
            <span className="ml-1 text-[6px] text-muted-foreground">({ability.apCost}AP)</span>
            {onCooldown && (
              <span className="absolute -top-1 -right-1 text-[6px] bg-destructive text-destructive-foreground rounded-full w-3 h-3 flex items-center justify-center">
                {unit.cooldowns[ability.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function GameHUD({ state, onEndTurn, onDeselect, onRestart, onUseAbility }: GameHUDProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const selectedUnit = state.units.find(u => u.id === state.selectedUnitId);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.log]);

  const aliveCount = state.units.filter(u => u.isAlive).length;
  const blueAlive = state.units.filter(u => u.team === 'blue' && u.isAlive).length;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="pointer-events-auto flex items-center justify-between px-4 py-2 bg-card/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-foreground glow-text tracking-wider">⚔ TACTICAL ROYALE</span>
          <div className="h-4 w-px bg-border/30" />
          <span className="text-[9px] text-muted-foreground">TURN {state.turn}</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-secondary/50">
            <div className="w-2.5 h-2.5 rounded-sm animate-pulse" style={{ backgroundColor: TEAM_COLORS[state.currentTeam] }} />
            <span className="text-[9px] text-foreground font-bold">{state.currentTeam.toUpperCase()}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {(['blue', 'red', 'green', 'yellow'] as const).map(team => {
              const alive = state.units.filter(u => u.team === team && u.isAlive).length;
              return (
                <div key={team} className={`flex items-center gap-1 ${alive === 0 ? 'opacity-30' : ''}`}>
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                  <span className="text-[7px] text-muted-foreground">{alive}</span>
                </div>
              );
            })}
          </div>
          <span className={`text-[8px] ${state.shrinkLevel > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            ZONE {state.shrinkLevel > 0 ? `LV${state.shrinkLevel}` : 'SAFE'} • {state.zoneTimer}t
          </span>
        </div>
      </div>

      {/* Left - Blue team */}
      <div className="pointer-events-auto absolute left-2 top-14 w-44 space-y-1">
        <div className="text-[7px] text-primary px-1 mb-1 tracking-wider">YOUR SQUAD ({blueAlive}/3)</div>
        {state.units.filter(u => u.team === 'blue').map(u => (
          <UnitPortrait key={u.id} unit={u} isSelected={u.id === state.selectedUnitId} teamColor={TEAM_COLORS[u.team]} />
        ))}
        <div className="text-[7px] text-muted-foreground px-1 mt-2 mb-1 tracking-wider">ENEMIES</div>
        {state.units.filter(u => u.team !== 'blue').map(u => (
          <UnitPortrait key={u.id} unit={u} isSelected={u.id === state.selectedUnitId} teamColor={TEAM_COLORS[u.team]} />
        ))}
      </div>

      {/* Right - Selected unit + Attack preview */}
      {selectedUnit && (
        <div className="pointer-events-auto absolute right-2 top-14 w-56 space-y-2">
          <div className="bg-card/90 backdrop-blur-sm rounded p-3 border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: TEAM_COLORS[selectedUnit.team] }} />
                <span className="text-[11px] text-foreground glow-text">{selectedUnit.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: selectedUnit.maxAp }).map((_, i) => (
                  <div key={i} className={`w-2.5 h-2.5 rounded-full border ${
                    i < selectedUnit.ap ? 'bg-accent border-accent' : 'bg-transparent border-muted-foreground/30'
                  }`} />
                ))}
                <span className="text-[7px] text-muted-foreground ml-1">AP</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px] mb-2">
              {[
                ['CLASS', selectedUnit.unitClass.toUpperCase()],
                ['LVL', `${selectedUnit.level}`],
                ['HP', `${selectedUnit.hp}/${selectedUnit.maxHp}`],
                ['ACC', `${selectedUnit.accuracy}%`],
                ['ATK', `${selectedUnit.attack}`],
                ['DEF', `${selectedUnit.defense}`],
                ['MOVE', `${selectedUnit.moveRange} (${AP_MOVE_COST}AP)`],
                ['RANGE', `${selectedUnit.attackRange} (${AP_ATTACK_COST}AP)`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-foreground">{value}</span>
                </div>
              ))}
            </div>

            <ActionBar unit={selectedUnit} onUseAbility={onUseAbility} phase={state.phase} />

            <button
              onClick={onDeselect}
              className="mt-2 w-full text-[7px] py-1 bg-secondary text-secondary-foreground rounded hover:bg-muted transition-colors border border-border/30"
            >
              DESELECT [ESC]
            </button>
          </div>

          {/* Attack Preview */}
          {state.attackPreview && (
            <div className="bg-card/90 backdrop-blur-sm rounded p-3 border border-destructive/30">
              <div className="text-[8px] text-destructive mb-2 tracking-wider">⚔ ATTACK PREVIEW</div>
              <div className="space-y-1 text-[8px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HIT CHANCE</span>
                  <span className={`font-bold ${
                    state.attackPreview.hitChance > 70 ? 'text-primary' :
                    state.attackPreview.hitChance > 40 ? 'text-accent' : 'text-destructive'
                  }`}>
                    {state.attackPreview.hitChance}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DAMAGE</span>
                  <span className="text-foreground">~{state.attackPreview.expectedDamage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CRIT CHANCE</span>
                  <span className="text-accent">{state.attackPreview.critChance}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TARGET COVER</span>
                  <span className={
                    state.attackPreview.targetCover === 'full' ? 'text-[#4488ff]' :
                    state.attackPreview.targetCover === 'half' ? 'text-accent' : 'text-foreground'
                  }>
                    {state.attackPreview.targetCover.toUpperCase()}
                  </span>
                </div>
              </div>
              {/* Hit chance bar */}
              <div className="mt-2 h-2 bg-muted/50 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: `${state.attackPreview.hitChance}%`,
                    backgroundColor: state.attackPreview.hitChance > 70 ? '#44cc44' :
                      state.attackPreview.hitChance > 40 ? '#cccc44' : '#cc4444',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom bar */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 bg-card/90 backdrop-blur-sm border-t border-border/50">
        <div className="flex">
          <div ref={logRef} className="flex-1 h-28 overflow-y-auto px-4 py-2 font-mono">
            {state.log.slice(-15).map((msg, i) => (
              <div
                key={i}
                className={`text-[7px] leading-relaxed ${
                  msg.includes('═') ? 'text-muted-foreground/50' :
                  msg.includes('ELIMINATED') || msg.includes('killed') ? 'text-destructive font-bold' :
                  msg.includes('WINS') ? 'text-accent glow-accent font-bold' :
                  msg.includes('CRITICAL') ? 'text-destructive' :
                  msg.includes('ZONE') || msg.includes('DANGER') ? 'text-destructive animate-pulse' :
                  msg.includes('MISSED') ? 'text-muted-foreground/60' :
                  msg.includes('heals') || msg.includes('💊') ? 'text-primary' :
                  msg.includes('OVERWATCH') ? 'text-[#44aaff]' :
                  msg.includes('Turn') || msg.includes('»') ? 'text-foreground' :
                  'text-muted-foreground'
                }`}
              >
                {msg}
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center justify-center gap-2 px-4 border-l border-border/50 min-w-[140px]">
            <div className="text-center">
              <span className="text-[9px] text-muted-foreground block">
                {state.phase === 'select' && '👆 SELECT UNIT'}
                {state.phase === 'move' && '📍 MOVE (1 AP)'}
                {state.phase === 'attack' && '⚔ ATTACK (1 AP)'}
                {state.phase === 'ability' && `⚡ ${state.activeAbility?.toUpperCase()}`}
                {state.phase === 'game_over' && '🏆 GAME OVER'}
              </span>
              {state.phase === 'attack' && state.attackPreview && (
                <span className={`text-[8px] font-bold block mt-0.5 ${
                  state.attackPreview.hitChance > 70 ? 'text-primary' : 'text-accent'
                }`}>
                  {state.attackPreview.hitChance}% HIT
                </span>
              )}
            </div>
            {state.phase !== 'game_over' ? (
              <button
                onClick={onEndTurn}
                className="text-[9px] px-5 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 transition-all glow-text tracking-wider w-full"
              >
                END TURN ⏎
              </button>
            ) : (
              <button
                onClick={onRestart}
                className="text-[9px] px-5 py-2 bg-accent text-accent-foreground rounded hover:opacity-90 transition-all glow-accent tracking-wider w-full"
              >
                NEW GAME
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CRT Scanlines */}
      <div className="absolute inset-0 crt-scanlines opacity-20" />

      {/* Kill notification overlay */}
      {state.combatEvents.filter(e => e.type === 'kill' && Date.now() - e.timestamp < 2000).map(e => (
        <div key={e.id} className="absolute top-1/3 left-1/2 -translate-x-1/2 animate-fade-in">
          <div className="bg-destructive/90 text-destructive-foreground px-6 py-2 rounded text-[12px] tracking-widest font-bold glow-text whitespace-nowrap">
            💀 {e.message.split('!')[0]}!
          </div>
        </div>
      ))}
    </div>
  );
}
