import { useRef, useEffect, useMemo, useState } from 'react';
import { GameState, TEAM_COLORS, GRID_SIZE, Team } from '@/game/types';
import { isInZone } from '@/game/gameState';
import { ChevronDown, ChevronUp, Map } from 'lucide-react';

interface TacticalMinimapProps {
  state: GameState;
  inspectedUnitId: string | null;
}

const MAP_SIZE = 160;
const CELL = MAP_SIZE / GRID_SIZE;

export function TacticalMinimap({ state, inspectedUnitId }: TacticalMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const lootPositions = useMemo(() => {
    const positions: { x: number; z: number }[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (state.grid[x]?.[z]?.loot) positions.push({ x, z });
      }
    }
    return positions;
  }, [state.grid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || collapsed) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = 'rgba(8, 12, 18, 0.92)';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Grid terrain
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const tile = state.grid[x]?.[z];
        if (!tile) continue;
        const px = x * CELL;
        const pz = z * CELL;

        const inZone = isInZone(x, z, state.shrinkLevel);
        let tileColor = 'rgba(30, 40, 30, 0.4)';
        if (tile.type === 'water' || tile.type === 'shallow_water') tileColor = 'rgba(50, 100, 140, 0.5)';
        else if (tile.type === 'stone' || tile.type === 'wall' || tile.type === 'cobblestone') tileColor = 'rgba(80, 80, 90, 0.5)';
        else if (tile.type === 'sand' || tile.type === 'beach_sand') tileColor = 'rgba(180, 160, 100, 0.3)';
        else if (tile.type === 'dirt' || tile.type === 'mud') tileColor = 'rgba(120, 90, 50, 0.4)';

        ctx.fillStyle = tileColor;
        ctx.fillRect(px, pz, CELL, CELL);

        if (!inZone) {
          ctx.fillStyle = 'rgba(180, 40, 40, 0.2)';
          ctx.fillRect(px, pz, CELL, CELL);
        }

        if (tile.prop && tile.isBlocked) {
          ctx.fillStyle = 'rgba(60, 60, 60, 0.6)';
          ctx.fillRect(px + 1, pz + 1, CELL - 2, CELL - 2);
        }
      }
    }

    // Zone border
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const inZ = isInZone(x, z, state.shrinkLevel);
        if (!inZ) continue;
        const px = x * CELL;
        const pz = z * CELL;
        if (!isInZone(x - 1, z, state.shrinkLevel)) { ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(px, pz + CELL); ctx.stroke(); }
        if (!isInZone(x + 1, z, state.shrinkLevel)) { ctx.beginPath(); ctx.moveTo(px + CELL, pz); ctx.lineTo(px + CELL, pz + CELL); ctx.stroke(); }
        if (!isInZone(x, z - 1, state.shrinkLevel)) { ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(px + CELL, pz); ctx.stroke(); }
        if (!isInZone(x, z + 1, state.shrinkLevel)) { ctx.beginPath(); ctx.moveTo(px, pz + CELL); ctx.lineTo(px + CELL, pz + CELL); ctx.stroke(); }
      }
    }
    ctx.setLineDash([]);

    // Loot markers
    for (const pos of lootPositions) {
      const cx = pos.x * CELL + CELL / 2;
      const cz = pos.z * CELL + CELL / 2;
      ctx.fillStyle = 'rgba(255, 204, 68, 0.7)';
      ctx.beginPath();
      ctx.arc(cx, cz, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Airdrops
    for (const drop of state.airdrops) {
      if (drop.phase === 'landed') {
        const cx = drop.targetPos.x * CELL + CELL / 2;
        const cz = drop.targetPos.z * CELL + CELL / 2;
        ctx.fillStyle = 'rgba(255, 170, 0, 0.8)';
        ctx.fillRect(cx - 3, cz - 3, 6, 6);
      }
    }

    // Units
    for (const unit of state.units) {
      if (!unit.isAlive) continue;
      const cx = unit.position.x * CELL + CELL / 2;
      const cz = unit.position.z * CELL + CELL / 2;
      const color = TEAM_COLORS[unit.team];

      const isActive = unit.id === state.selectedUnitId;
      const isInspected = unit.id === inspectedUnitId;
      const radius = unit.unitClass === 'soldier' ? 3.5 : 3;

      if (isActive || isInspected) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cz, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cz, radius, 0, Math.PI * 2);
      ctx.fill();

      if (unit.unitClass === 'medic') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 1.2, cz - 0.4, 2.4, 0.8);
        ctx.fillRect(cx - 0.4, cz - 1.2, 0.8, 2.4);
      }
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, MAP_SIZE - 1, MAP_SIZE - 1);

  }, [state.units, state.shrinkLevel, state.selectedUnitId, state.grid, lootPositions, state.airdrops, inspectedUnitId, collapsed]);

  return (
    <div className="pointer-events-auto absolute right-1 sm:right-2 top-12 sm:top-14 z-20 hidden sm:block">
      <div className="glass-panel rounded-lg overflow-hidden" style={{ width: collapsed ? 'auto' : MAP_SIZE + 12 }}>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="w-full px-2 py-1 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Map className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-[9px] text-muted-foreground/50 tracking-[0.2em] font-display">TACTICAL MAP</span>
          </div>
          {collapsed ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
          ) : (
            <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
          )}
        </button>
        {!collapsed && (
          <div className="p-1.5 pt-0">
            <canvas
              ref={canvasRef}
              style={{ width: MAP_SIZE, height: MAP_SIZE }}
              className="rounded-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
