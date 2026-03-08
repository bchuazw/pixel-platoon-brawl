import { useCallback, useEffect } from 'react';
import { GameBoard } from '@/components/game/GameBoard';
import { GameHUD } from '@/components/game/GameHUD';
import { useGameStore } from '@/game/useGameStore';
import { CharacterPanel, SponsorAction } from '@/components/game/CharacterPanel';
import { BroadcastOverlay } from '@/components/game/BroadcastOverlay';
import { Position, AbilityId } from '@/game/types';

const Index = () => {
  const {
    state, selectUnit, moveUnit, attackTarget, endTurn, deselect, restart,
    useAbility, executeAbility, setHoveredTile, startAutoPlay, stopAutoPlay,
    sponsorPoints, inspectedUnitId, inspectUnit, sponsorUnit, clearMovePath,
  } = useGameStore();

  const handleTileClick = useCallback((pos: Position) => {
    if (state.autoPlay) return;
    if (state.phase === 'move' && state.movableTiles.some(t => t.x === pos.x && t.z === pos.z)) {
      moveUnit(pos);
    } else if (state.phase === 'attack' && state.attackableTiles.some(t => t.x === pos.x && t.z === pos.z)) {
      attackTarget(pos);
    } else if (state.phase === 'ability' && state.abilityTargetTiles.some(t => t.x === pos.x && t.z === pos.z)) {
      executeAbility(pos);
    }
  }, [state.phase, state.autoPlay, state.movableTiles, state.attackableTiles, state.abilityTargetTiles, moveUnit, attackTarget, executeAbility]);

  const handleUnitClick = useCallback((unitId: string) => {
    if (state.autoPlay) {
      inspectUnit(unitId);
      return;
    }
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
  }, [state.phase, state.autoPlay, state.units, state.attackableTiles, state.abilityTargetTiles, selectUnit, attackTarget, executeAbility, inspectUnit]);

  const handleUseAbility = useCallback((abilityId: AbilityId) => {
    useAbility(abilityId);
  }, [useAbility]);

  const handleTileHover = useCallback((pos: Position | null) => {
    setHoveredTile(pos);
  }, [setHoveredTile]);

  const handleSponsor = useCallback((unitId: string, action: SponsorAction) => {
    sponsorUnit(unitId, action);
  }, [sponsorUnit]);

  const handleMoveComplete = useCallback(() => {
    clearMovePath();
  }, [clearMovePath]);

  const handlePlaceBet = useCallback((team: Team, amount: number) => {
    placeBet(team, amount);
  }, [placeBet]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (inspectedUnitId && e.key === 'Escape') { inspectUnit(null); return; }
      if (state.autoPlay) return;
      if (e.key === 'Escape') deselect();
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); endTurn(); }
      if (e.key >= '1' && e.key <= '4') {
        const unit = state.units.find(u => u.id === state.selectedUnitId);
        if (unit && unit.abilities[parseInt(e.key) - 1]) {
          useAbility(unit.abilities[parseInt(e.key) - 1].id);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [deselect, endTurn, state.selectedUnitId, state.units, state.autoPlay, useAbility, inspectedUnitId, inspectUnit]);

  const inspectedUnit = inspectedUnitId ? state.units.find(u => u.id === inspectedUnitId) : null;

  return (
    <div className="w-screen h-screen overflow-hidden relative">
      <GameBoard
        state={state}
        onTileClick={handleTileClick}
        onUnitClick={handleUnitClick}
        onTileHover={handleTileHover}
        onMoveComplete={handleMoveComplete}
      />
      <GameHUD
        state={state}
        onEndTurn={endTurn}
        onDeselect={deselect}
        onRestart={restart}
        onUseAbility={handleUseAbility}
        onStartAutoPlay={startAutoPlay}
        onStopAutoPlay={stopAutoPlay}
        onMainMenu={restart}
        sponsorPoints={sponsorPoints}
        onUnitInspect={inspectUnit}
        onPlaceBet={handlePlaceBet}
        betTeam={betTeam}
        betAmount={betAmount}
        collectBetPayout={collectBetPayout}
      />
      {/* Broadcast overlay for cinematic announcements */}
      {state.autoPlay && <BroadcastOverlay state={state} />}
      {inspectedUnit && (
        <CharacterPanel
          unit={inspectedUnit}
          sponsorPoints={sponsorPoints}
          onClose={() => inspectUnit(null)}
          onSponsor={handleSponsor}
        />
      )}
    </div>
  );
};

export default Index;
