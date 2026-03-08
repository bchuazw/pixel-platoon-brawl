import { useState, useCallback } from 'react';
import {
  GameState, Position, Team,
} from './types';
import {
  createInitialState, getMovableTiles, getAttackableTiles,
  performAttack, getNextTeam, getAliveTeams, runAiTurn, isInZone,
} from './gameState';

export function useGameStore() {
  const [state, setState] = useState<GameState>(createInitialState);

  const selectUnit = useCallback((unitId: string) => {
    setState(prev => {
      const unit = prev.units.find(u => u.id === unitId);
      if (!unit || !unit.isAlive || unit.team !== prev.currentTeam) return prev;
      if (unit.hasMoved && unit.hasAttacked) return prev;

      const movable = unit.hasMoved ? [] : getMovableTiles(unit, prev);
      const attackable = unit.hasAttacked ? [] : getAttackableTiles(unit, prev);

      return {
        ...prev,
        selectedUnitId: unitId,
        phase: movable.length > 0 && !unit.hasMoved ? 'move' : 'attack',
        movableTiles: movable,
        attackableTiles: attackable,
      };
    });
  }, []);

  const moveUnit = useCallback((pos: Position) => {
    setState(prev => {
      if (!prev.selectedUnitId || prev.phase !== 'move') return prev;
      const units = prev.units.map(u => {
        if (u.id === prev.selectedUnitId) {
          return { ...u, position: pos, hasMoved: true };
        }
        return u;
      });
      const unit = units.find(u => u.id === prev.selectedUnitId)!;
      const attackable = getAttackableTiles(unit, { ...prev, units });

      return {
        ...prev,
        units,
        phase: attackable.length > 0 ? 'attack' : 'select',
        movableTiles: [],
        attackableTiles: attackable,
        selectedUnitId: attackable.length > 0 ? prev.selectedUnitId : null,
      };
    });
  }, []);

  const attackTarget = useCallback((pos: Position) => {
    setState(prev => {
      if (!prev.selectedUnitId || prev.phase !== 'attack') return prev;
      const attacker = prev.units.find(u => u.id === prev.selectedUnitId);
      const target = prev.units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z && u.team !== attacker?.team);
      if (!attacker || !target) return prev;

      const units = [...prev.units];
      const aIdx = units.findIndex(u => u.id === attacker.id);
      const tIdx = units.findIndex(u => u.id === target.id);
      const a = { ...units[aIdx] };
      const t = { ...units[tIdx] };

      const result = performAttack(a, t);
      a.hasAttacked = true;
      units[aIdx] = a;
      units[tIdx] = t;

      const log = [...prev.log, `${a.name} hits ${t.name} for ${result.damage} dmg!${result.killed ? ' 💀 ELIMINATED!' : ''}`];

      const aliveTeams = getAliveTeams(units);
      if (aliveTeams.length <= 1) {
        return {
          ...prev, units, log: [...log, `🏆 ${aliveTeams[0]?.toUpperCase() || 'NO'} TEAM WINS!`],
          phase: 'game_over', selectedUnitId: null, movableTiles: [], attackableTiles: [],
        };
      }

      return {
        ...prev, units, log,
        phase: 'select', selectedUnitId: null, movableTiles: [], attackableTiles: [],
      };
    });
  }, []);

  const endTurn = useCallback(() => {
    setState(prev => {
      const aliveTeams = getAliveTeams(prev.units);
      if (aliveTeams.length <= 1) return prev;

      let newState = { ...prev };

      // Reset current team units
      newState.units = newState.units.map(u =>
        u.team === newState.currentTeam ? { ...u, hasMoved: false, hasAttacked: false } : u
      );

      // Process AI teams until it's blue's turn again
      let nextTeam = getNextTeam(newState.currentTeam, newState.units);
      while (nextTeam && nextTeam !== 'blue') {
        newState.currentTeam = nextTeam;
        newState = runAiTurn(newState);
        // Reset AI team units
        newState.units = newState.units.map(u =>
          u.team === nextTeam ? { ...u, hasMoved: false, hasAttacked: false } : u
        );

        const alive = getAliveTeams(newState.units);
        if (alive.length <= 1) {
          return {
            ...newState,
            log: [...newState.log, `🏆 ${alive[0]?.toUpperCase() || 'NO'} TEAM WINS!`],
            phase: 'game_over', selectedUnitId: null, movableTiles: [], attackableTiles: [],
          };
        }

        nextTeam = getNextTeam(newState.currentTeam, newState.units);
      }

      if (!nextTeam) return newState;

      // New turn
      const newTurn = newState.currentTeam === 'blue' ? newState.turn : newState.turn + 1;
      let { shrinkLevel, zoneTimer } = newState;
      const log = [...newState.log];

      if (nextTeam === 'blue') {
        zoneTimer--;
        if (zoneTimer <= 0 && shrinkLevel < 4) {
          shrinkLevel++;
          zoneTimer = 3;
          log.push(`⚠ ZONE SHRINKS! Stay inside the safe area!`);

          // Damage units outside zone
          newState.units = newState.units.map(u => {
            if (u.isAlive && !isInZone(u.position.x, u.position.z, shrinkLevel)) {
              const dmg = 15 * shrinkLevel;
              const newHp = Math.max(0, u.hp - dmg);
              log.push(`☠ ${u.name} takes ${dmg} zone damage!`);
              return { ...u, hp: newHp, isAlive: newHp > 0 };
            }
            return u;
          });
        }
      }

      return {
        ...newState,
        currentTeam: nextTeam,
        turn: newTurn,
        phase: 'select',
        selectedUnitId: null,
        movableTiles: [],
        attackableTiles: [],
        shrinkLevel,
        zoneTimer,
        log: [...log, `── Turn ${newTurn}: ${nextTeam.toUpperCase()} team's turn ──`],
      };
    });
  }, []);

  const deselect = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedUnitId: null,
      phase: 'select',
      movableTiles: [],
      attackableTiles: [],
    }));
  }, []);

  const restart = useCallback(() => {
    setState(createInitialState());
  }, []);

  return { state, selectUnit, moveUnit, attackTarget, endTurn, deselect, restart };
}
