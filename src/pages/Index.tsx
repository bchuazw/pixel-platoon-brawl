import { useCallback, useEffect } from 'react';
import { GameBoard } from '@/components/game/GameBoard';
import { GameHUD } from '@/components/game/GameHUD';
import { useGameStore } from '@/game/useGameStore';
import { Position, AbilityId } from '@/game/types';

const Index = () => {
  const {
    state, selectUnit, moveUnit, attackTarget, endTurn, deselect, restart,
    useAbility, executeAbility, setHoveredTile,
  } = useGameStore();

  const handleTileClick = useCallback((pos: Position) => {
    if (state.phase === 'move' && state.movableTiles.some(t => t.x === pos.x && t.z === pos.z)) {
      moveUnit(pos);
    } else if (state.phase === 'attack' && state.attackableTiles.some(t => t.x === pos.x && t.z === pos.z)) {
      attackTarget(pos);
    } else if (state.phase === 'ability' && state.abilityTargetTiles.some(t => t.x === pos.x && t.z === pos.z)) {
      executeAbility(pos);
    }
  }, [state.phase, state.movableTiles, state.attackableTiles, state.abilityTargetTiles, moveUnit, attackTarget, executeAbility]);

  const handleUnitClick = useCallback((unitId: string) => {
    if (state.phase === 'attack') {
      const unit = state.units.find(u => u.id === unitId);
      if (unit && state.attackableTiles.some(t => t.x === unit.position.x && t.z === unit.position.z)) {
        attackTarget(unit.position);
        return;
      }
    }
    if (state.phase === 'ability') {
      const unit = state.units.find(u => u.id === unitId);
      if (unit && state.abilityTargetTiles.some(t => t.x === unit.position.x && t.z === unit.position.z)) {
        executeAbility(unit.position);
        return;
      }
    }
    selectUnit(unitId);
  }, [state.phase, state.units, state.attackableTiles, state.abilityTargetTiles, selectUnit, attackTarget, executeAbility]);

  const handleUseAbility = useCallback((abilityId: AbilityId) => {
    useAbility(abilityId);
  }, [useAbility]);

  const handleTileHover = useCallback((pos: Position | null) => {
    setHoveredTile(pos);
  }, [setHoveredTile]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') deselect();
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); endTurn(); }
      // Number keys for abilities
      if (e.key >= '1' && e.key <= '4') {
        const unit = state.units.find(u => u.id === state.selectedUnitId);
        if (unit && unit.abilities[parseInt(e.key) - 1]) {
          useAbility(unit.abilities[parseInt(e.key) - 1].id);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [deselect, endTurn, state.selectedUnitId, state.units, useAbility]);

  return (
    <div className="w-screen h-screen overflow-hidden relative">
      <GameBoard
        state={state}
        onTileClick={handleTileClick}
        onUnitClick={handleUnitClick}
        onTileHover={handleTileHover}
      />
      <GameHUD
        state={state}
        onEndTurn={endTurn}
        onDeselect={deselect}
        onRestart={restart}
        onUseAbility={handleUseAbility}
      />
    </div>
  );
};

export default Index;
