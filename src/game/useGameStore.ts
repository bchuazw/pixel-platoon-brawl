import { useState, useCallback, useRef, useEffect } from 'react';
import {
  GameState, Position, CombatEvent, AbilityId, AP_MOVE_COST, AP_ATTACK_COST,
} from './types';
import {
  createInitialState, getMovableTiles, getAttackableTiles, getAbilityTargetTiles,
  performAttack, getNextTeam, getAliveTeams, runAiTurn, isInZone,
  checkOverwatch, getAttackPreview, getManhattanDistance,
} from './gameState';

export function useGameStore() {
  const [state, setState] = useState<GameState>(createInitialState);
  const autoPlayRef = useRef(false);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addEvents = useCallback((events: CombatEvent[]) => {
    setState(prev => ({
      ...prev,
      combatEvents: [...prev.combatEvents, ...events],
    }));
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        combatEvents: prev.combatEvents.filter(e => Date.now() - e.timestamp < 2500),
      }));
    }, 3000);
  }, []);

  const runFullTurn = useCallback(() => {
    setState(prev => {
      if (prev.phase === 'game_over' || prev.phase === 'pre_game') return prev;

      const aliveTeams = getAliveTeams(prev.units);
      if (aliveTeams.length <= 1) return prev;

      let newState = { ...prev, units: prev.units.map(u => ({ ...u })) };

      // Run current team AI
      const currentTeamUnits = newState.units.filter(u => u.team === newState.currentTeam && u.isAlive);
      // Reset current team AP
      newState.units = newState.units.map(u => {
        if (u.team === newState.currentTeam) {
          const newCooldowns: Record<string, number> = {};
          for (const [k, v] of Object.entries(u.cooldowns)) {
            if (v > 0) newCooldowns[k] = v - 1;
          }
          return { ...u, ap: u.maxAp, isSuppressed: false, isOnOverwatch: false, cooldowns: newCooldowns };
        }
        return u;
      });

      const aiResult = runAiTurn(newState);
      newState = aiResult.state;
      const allEvents = [...aiResult.events];

      const alive = getAliveTeams(newState.units);
      if (alive.length <= 1) {
        return {
          ...newState,
          log: [...newState.log, `🏆 ${alive[0]?.toUpperCase() || 'NO'} TEAM WINS THE BATTLE ROYALE!`],
          phase: 'game_over' as const, selectedUnitId: null,
          movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
          combatEvents: [...prev.combatEvents, ...allEvents], activeAbility: null,
          autoPlay: false,
        };
      }

      // Advance to next team
      const nextTeam = getNextTeam(newState.currentTeam, newState.units);
      if (!nextTeam) return newState;

      // Check if we completed a full round (back to first alive team)
      const teamOrder = ['blue', 'red', 'green', 'yellow'] as const;
      const firstAliveTeam = teamOrder.find(t => newState.units.some(u => u.team === t && u.isAlive));
      const isNewRound = nextTeam === firstAliveTeam;

      let { turn, shrinkLevel, zoneTimer } = newState;
      const log = [...newState.log];

      if (isNewRound) {
        turn++;
        zoneTimer--;
        if (zoneTimer <= 0 && shrinkLevel < 4) {
          shrinkLevel++;
          zoneTimer = 4;
          log.push(`═══════════════════════════`);
          log.push(`⚠ DANGER ZONE LEVEL ${shrinkLevel}! The ring closes in!`);

          newState.units = newState.units.map(u => {
            if (u.isAlive && !isInZone(u.position.x, u.position.z, shrinkLevel)) {
              const dmg = 15 * shrinkLevel;
              const newHp = Math.max(0, u.hp - dmg);
              log.push(`☠ ${u.name} takes ${dmg} zone damage!`);
              allEvents.push({
                id: `evt-${Date.now()}-${u.id}`, type: 'damage',
                attackerPos: u.position, targetPos: u.position, value: dmg,
                message: `☠ Zone damage!`, timestamp: Date.now(),
              });
              return { ...u, hp: newHp, isAlive: newHp > 0 };
            }
            return u;
          });
        }

        // Clear smoke every 2 turns
        let grid = newState.grid;
        if (turn % 2 === 0) {
          grid = grid.map(row => row.map(t => ({ ...t, hasSmoke: false })));
        }
        newState.grid = grid;

        log.push(`═══════════════════════════`);
        log.push(`» TURN ${turn} — ${nextTeam.toUpperCase()} TEAM'S MOVE`);
        log.push(`» ${newState.units.filter(u => u.isAlive).length} combatants remaining`);
      }

      const alive2 = getAliveTeams(newState.units);
      if (alive2.length <= 1) {
        return {
          ...newState,
          log: [...log, `🏆 ${alive2[0]?.toUpperCase() || 'NO'} TEAM WINS THE BATTLE ROYALE!`],
          phase: 'game_over' as const, selectedUnitId: null,
          movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
          combatEvents: [...prev.combatEvents, ...allEvents], activeAbility: null,
          turn, shrinkLevel, zoneTimer, autoPlay: false,
        };
      }

      return {
        ...newState,
        currentTeam: nextTeam,
        turn, shrinkLevel, zoneTimer,
        phase: 'select' as const,
        selectedUnitId: null,
        movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
        activeAbility: null,
        log,
        combatEvents: [...prev.combatEvents, ...allEvents],
        attackPreview: null, hoveredTile: null,
      };
    });
  }, []);

  // Auto-play loop
  useEffect(() => {
    autoPlayRef.current = state.autoPlay;
    if (state.autoPlay && state.phase !== 'game_over' && state.phase !== 'pre_game') {
      autoPlayTimerRef.current = setTimeout(() => {
        if (autoPlayRef.current) {
          runFullTurn();
        }
      }, 1200);
    }
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [state.autoPlay, state.phase, state.currentTeam, state.turn, runFullTurn]);

  const startAutoPlay = useCallback(() => {
    setState(prev => ({
      ...prev,
      phase: 'select',
      autoPlay: true,
      log: [...prev.log, '» AUTO-BATTLE ENGAGED! All teams controlled by AI.'],
    }));
  }, []);

  const stopAutoPlay = useCallback(() => {
    setState(prev => ({ ...prev, autoPlay: false }));
  }, []);

  const selectUnit = useCallback((unitId: string) => {
    setState(prev => {
      if (prev.autoPlay) return prev;
      const unit = prev.units.find(u => u.id === unitId);
      if (!unit || !unit.isAlive || unit.team !== prev.currentTeam) return prev;
      if (unit.ap <= 0) return prev;

      const movable = unit.ap >= AP_MOVE_COST && !unit.isSuppressed ? getMovableTiles(unit, prev) : [];
      const attackable = unit.ap >= AP_ATTACK_COST ? getAttackableTiles(unit, prev) : [];

      return {
        ...prev,
        selectedUnitId: unitId,
        phase: movable.length > 0 ? 'move' : attackable.length > 0 ? 'attack' : 'select',
        movableTiles: movable,
        attackableTiles: attackable,
        abilityTargetTiles: [],
        activeAbility: null,
        attackPreview: null,
      };
    });
  }, []);

  const moveUnit = useCallback((pos: Position) => {
    setState(prev => {
      if (!prev.selectedUnitId || prev.phase !== 'move') return prev;
      const units = prev.units.map(u => {
        if (u.id === prev.selectedUnitId) {
          return { ...u, position: pos, ap: u.ap - AP_MOVE_COST };
        }
        return u;
      });

      const movedUnit = units.find(u => u.id === prev.selectedUnitId)!;
      const owEvents = checkOverwatch(movedUnit, { ...prev, units });

      const unit = units.find(u => u.id === prev.selectedUnitId)!;
      const attackable = unit.ap >= AP_ATTACK_COST && unit.isAlive ? getAttackableTiles(unit, { ...prev, units }) : [];

      return {
        ...prev,
        units,
        phase: unit.isAlive && (attackable.length > 0 || unit.ap > 0) ? (attackable.length > 0 ? 'attack' : 'select') : 'select',
        movableTiles: [],
        attackableTiles: attackable,
        selectedUnitId: unit.isAlive && (attackable.length > 0 || unit.ap > 0) ? prev.selectedUnitId : null,
        log: [...prev.log, ...owEvents.map(e => e.message)],
        combatEvents: [...prev.combatEvents, ...owEvents],
      };
    });
  }, []);

  const attackTarget = useCallback((pos: Position) => {
    setState(prev => {
      if (!prev.selectedUnitId || prev.phase !== 'attack') return prev;
      const units = prev.units.map(u => ({ ...u }));
      const attacker = units.find(u => u.id === prev.selectedUnitId)!;
      const target = units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z && u.team !== attacker.team);
      if (!target) return prev;

      const result = performAttack(attacker, target, prev.grid);
      attacker.ap -= AP_ATTACK_COST;

      const log = [...prev.log, ...result.events.map(e => e.message)];
      const events = [...prev.combatEvents, ...result.events];

      const aliveTeams = getAliveTeams(units);
      if (aliveTeams.length <= 1) {
        return {
          ...prev, units, log: [...log, `🏆 ${aliveTeams[0]?.toUpperCase() || 'NO'} TEAM WINS THE BATTLE ROYALE!`],
          phase: 'game_over', selectedUnitId: null, movableTiles: [], attackableTiles: [],
          abilityTargetTiles: [], combatEvents: events, attackPreview: null, autoPlay: false,
        };
      }

      const canStillAct = attacker.ap > 0 && attacker.isAlive;

      return {
        ...prev, units, log,
        phase: 'select',
        selectedUnitId: canStillAct ? prev.selectedUnitId : null,
        movableTiles: [],
        attackableTiles: canStillAct ? getAttackableTiles(attacker, { ...prev, units }) : [],
        abilityTargetTiles: [],
        combatEvents: events,
        attackPreview: null,
      };
    });
  }, []);

  const useAbility = useCallback((abilityId: AbilityId) => {
    setState(prev => {
      if (!prev.selectedUnitId) return prev;
      const unit = prev.units.find(u => u.id === prev.selectedUnitId);
      if (!unit) return prev;

      const tiles = getAbilityTargetTiles(unit, abilityId, prev);
      if (abilityId === 'overwatch' && tiles.length > 0) {
        const units = prev.units.map(u => {
          if (u.id === prev.selectedUnitId) {
            return { ...u, isOnOverwatch: true, ap: u.ap - 1, cooldowns: { ...u.cooldowns } };
          }
          return u;
        });
        const evt: CombatEvent = {
          id: `evt-${Date.now()}`, type: 'overwatch',
          attackerPos: unit.position, targetPos: unit.position,
          message: `👁 ${unit.name} goes on OVERWATCH`,
          timestamp: Date.now(),
        };
        return {
          ...prev, units,
          log: [...prev.log, evt.message],
          combatEvents: [...prev.combatEvents, evt],
          phase: 'select', selectedUnitId: null,
          movableTiles: [], attackableTiles: [], abilityTargetTiles: [], activeAbility: null,
        };
      }

      return {
        ...prev,
        phase: 'ability',
        abilityTargetTiles: tiles,
        activeAbility: abilityId,
        movableTiles: [],
        attackableTiles: [],
      };
    });
  }, []);

  const executeAbility = useCallback((pos: Position) => {
    setState(prev => {
      if (!prev.selectedUnitId || !prev.activeAbility || prev.phase !== 'ability') return prev;
      const units = prev.units.map(u => ({ ...u }));
      const unit = units.find(u => u.id === prev.selectedUnitId)!;
      const ability = unit.abilities.find(a => a.id === prev.activeAbility);
      if (!ability) return prev;

      const log = [...prev.log];
      const events: CombatEvent[] = [];

      switch (prev.activeAbility) {
        case 'grenade': {
          const radius = ability.aoeRadius || 2;
          const damaged: string[] = [];
          for (const u of units) {
            if (!u.isAlive || u.id === unit.id) continue;
            if (getManhattanDistance(u.position, pos) <= radius) {
              const dmg = 20 + Math.floor(Math.random() * 10);
              u.hp -= dmg;
              if (u.hp <= 0) { u.hp = 0; u.isAlive = false; unit.kills++; }
              damaged.push(`${u.name}(-${dmg})`);
              events.push({
                id: `evt-${Date.now()}-${u.id}`, type: u.isAlive ? 'damage' : 'kill',
                attackerPos: unit.position, targetPos: u.position, value: dmg,
                message: u.isAlive ? `💣 ${u.name} takes ${dmg} grenade damage!` : `💣💀 ${u.name} killed by grenade!`,
                timestamp: Date.now(),
              });
            }
          }
          log.push(`💣 ${unit.name} throws GRENADE! ${damaged.join(', ')}`);
          break;
        }
        case 'heal': {
          const target = units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z && u.team === unit.team);
          if (target) {
            const healAmt = 40;
            target.hp = Math.min(target.maxHp, target.hp + healAmt);
            log.push(`💊 ${unit.name} heals ${target.name} for ${healAmt} HP!`);
            events.push({
              id: `evt-${Date.now()}`, type: 'heal',
              attackerPos: unit.position, targetPos: target.position, value: healAmt,
              message: `💊 ${target.name} healed for ${healAmt} HP`,
              timestamp: Date.now(),
            });
          }
          break;
        }
        case 'suppress': {
          const target = units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z && u.team !== unit.team);
          if (target) {
            target.isSuppressed = true;
            log.push(`🔫 ${unit.name} SUPPRESSES ${target.name}!`);
            events.push({
              id: `evt-${Date.now()}`, type: 'ability',
              attackerPos: unit.position, targetPos: target.position,
              message: `🔫 ${target.name} SUPPRESSED!`,
              timestamp: Date.now(),
            });
          }
          break;
        }
        case 'smoke': {
          const radius = ability.aoeRadius || 1;
          const grid = prev.grid.map(row => row.map(t => ({ ...t })));
          for (let x = 0; x < 20; x++) {
            for (let z = 0; z < 20; z++) {
              if (getManhattanDistance({ x, z }, pos) <= radius) {
                grid[x][z].hasSmoke = true;
              }
            }
          }
          log.push(`💨 ${unit.name} deploys SMOKE COVER!`);
          events.push({
            id: `evt-${Date.now()}`, type: 'ability',
            attackerPos: unit.position, targetPos: pos,
            message: `💨 Smoke deployed!`,
            timestamp: Date.now(),
          });
          unit.ap -= ability.apCost;
          unit.cooldowns[prev.activeAbility] = ability.cooldown;
          return {
            ...prev, units, grid, log,
            combatEvents: [...prev.combatEvents, ...events],
            phase: 'select', selectedUnitId: null,
            movableTiles: [], attackableTiles: [], abilityTargetTiles: [], activeAbility: null,
          };
        }
      }

      unit.ap -= ability.apCost;
      unit.cooldowns[prev.activeAbility] = ability.cooldown;

      const aliveTeams = getAliveTeams(units);
      if (aliveTeams.length <= 1) {
        return {
          ...prev, units, log: [...log, `🏆 ${aliveTeams[0]?.toUpperCase()} TEAM WINS!`],
          phase: 'game_over', selectedUnitId: null,
          movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
          combatEvents: [...prev.combatEvents, ...events], activeAbility: null, autoPlay: false,
        };
      }

      return {
        ...prev, units, log,
        combatEvents: [...prev.combatEvents, ...events],
        phase: 'select', selectedUnitId: null,
        movableTiles: [], attackableTiles: [], abilityTargetTiles: [], activeAbility: null,
      };
    });
  }, []);

  const setHoveredTile = useCallback((pos: Position | null) => {
    setState(prev => {
      if (!pos || !prev.selectedUnitId || prev.phase !== 'attack') {
        if (prev.attackPreview) return { ...prev, attackPreview: null, hoveredTile: pos };
        return { ...prev, hoveredTile: pos };
      }
      const attacker = prev.units.find(u => u.id === prev.selectedUnitId);
      const target = prev.units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z && u.team !== attacker?.team);
      if (attacker && target) {
        return { ...prev, hoveredTile: pos, attackPreview: getAttackPreview(attacker, target, prev.grid) };
      }
      return { ...prev, hoveredTile: pos, attackPreview: null };
    });
  }, []);

  const endTurn = useCallback(() => {
    setState(prev => {
      const aliveTeams = getAliveTeams(prev.units);
      if (aliveTeams.length <= 1) return prev;

      let newState = {
        ...prev,
        units: prev.units.map(u => {
          if (u.team === prev.currentTeam) {
            const newCooldowns: Record<string, number> = {};
            for (const [k, v] of Object.entries(u.cooldowns)) {
              if (v > 0) newCooldowns[k] = v - 1;
            }
            return { ...u, ap: u.maxAp, isSuppressed: false, cooldowns: newCooldowns };
          }
          return { ...u };
        }),
      };

      // Process AI teams
      let nextTeam = getNextTeam(newState.currentTeam, newState.units);
      const allAiEvents: CombatEvent[] = [];

      while (nextTeam && nextTeam !== 'blue') {
        newState.currentTeam = nextTeam;
        newState.units = newState.units.map(u => {
          if (u.team === nextTeam) {
            const newCooldowns: Record<string, number> = {};
            for (const [k, v] of Object.entries(u.cooldowns)) {
              if (v > 0) newCooldowns[k] = v - 1;
            }
            return { ...u, ap: u.maxAp, isSuppressed: false, isOnOverwatch: false, cooldowns: newCooldowns };
          }
          return u;
        });

        const aiResult = runAiTurn(newState);
        newState = aiResult.state;
        allAiEvents.push(...aiResult.events);

        const alive = getAliveTeams(newState.units);
        if (alive.length <= 1) {
          return {
            ...newState,
            log: [...newState.log, `🏆 ${alive[0]?.toUpperCase() || 'NO'} TEAM WINS THE BATTLE ROYALE!`],
            phase: 'game_over', selectedUnitId: null,
            movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
            combatEvents: [...prev.combatEvents, ...allAiEvents], activeAbility: null, autoPlay: false,
          };
        }

        nextTeam = getNextTeam(newState.currentTeam, newState.units);
      }

      if (!nextTeam) return newState;

      const newTurn = newState.turn + 1;
      let { shrinkLevel, zoneTimer } = newState;
      const log = [...newState.log];

      zoneTimer--;
      if (zoneTimer <= 0 && shrinkLevel < 4) {
        shrinkLevel++;
        zoneTimer = 4;
        log.push(`═══════════════════════════`);
        log.push(`⚠ DANGER ZONE LEVEL ${shrinkLevel}! The ring closes in!`);

        newState.units = newState.units.map(u => {
          if (u.isAlive && !isInZone(u.position.x, u.position.z, shrinkLevel)) {
            const dmg = 15 * shrinkLevel;
            const newHp = Math.max(0, u.hp - dmg);
            log.push(`☠ ${u.name} takes ${dmg} zone damage!`);
            allAiEvents.push({
              id: `evt-${Date.now()}-${u.id}`, type: 'damage',
              attackerPos: u.position, targetPos: u.position, value: dmg,
              message: `☠ Zone damage!`, timestamp: Date.now(),
            });
            return { ...u, hp: newHp, isAlive: newHp > 0 };
          }
          return u;
        });
      }

      newState.units = newState.units.map(u => {
        if (u.team === 'blue') {
          const newCooldowns: Record<string, number> = {};
          for (const [k, v] of Object.entries(u.cooldowns)) {
            if (v > 0) newCooldowns[k] = v - 1;
          }
          return { ...u, ap: u.maxAp, isSuppressed: false, cooldowns: newCooldowns };
        }
        return u;
      });

      let grid = newState.grid;
      if (newTurn % 2 === 0) {
        grid = grid.map(row => row.map(t => ({ ...t, hasSmoke: false })));
      }

      log.push(`═══════════════════════════`);
      log.push(`» TURN ${newTurn} — BLUE TEAM'S MOVE`);
      log.push(`» ${newState.units.filter(u => u.isAlive).length} combatants remaining`);

      return {
        ...newState,
        currentTeam: nextTeam,
        turn: newTurn,
        phase: 'select',
        selectedUnitId: null,
        movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
        activeAbility: null,
        shrinkLevel, zoneTimer,
        log,
        grid,
        combatEvents: [...prev.combatEvents, ...allAiEvents],
        attackPreview: null, hoveredTile: null,
      };
    });
  }, []);

  const deselect = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedUnitId: null,
      phase: 'select',
      movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
      activeAbility: null, attackPreview: null,
    }));
  }, []);

  const restart = useCallback(() => {
    setState(createInitialState());
  }, []);

  return {
    state, selectUnit, moveUnit, attackTarget, endTurn, deselect, restart,
    useAbility, executeAbility, setHoveredTile, addEvents,
    startAutoPlay, stopAutoPlay, runFullTurn,
  };
}
