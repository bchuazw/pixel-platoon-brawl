import { useRef, useEffect, useMemo } from 'react';
import { GameState, TEAM_COLORS, GRID_SIZE, Team } from '@/game/types';
import { isInZone } from '@/game/gameState';

interface TacticalMinimapProps {
  state: GameState;
  inspectedUnitId: string | null;
}

const MAP_SIZE = 160;
const CELL = MAP_SIZE / GRID_SIZE;

export function TacticalMinimap({ state, inspectedUnitId }: TacticalMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = 'rgba(8, 12, 18, 0.95)';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Terrain hint
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const tile = state.grid[x]?.[z];
        if (!tile) continue;
        const px = x * CELL;
        const pz = z * CELL;
        
        if (tile.type === 'water') {
          ctx.fillStyle = 'rgba(56, 136, 187, 0.3)';
          ctx.fillRect(px, pz, CELL, CELL);
        } else if (tile.prop) {
          ctx.fillStyle = 'rgba(100, 100, 100, 0.2)';
          ctx.fillRect(px, pz, CELL, CELL);
        } else if (tile.type === 'dirt' || tile.type === 'sand') {
          ctx.fillStyle = 'rgba(176, 138, 88, 0.1)';
          ctx.fillRect(px, pz, CELL, CELL);
        }
      }
    }

    // Zone boundary
    if (state.shrinkLevel > 0) {
      const margin = state.shrinkLevel * 2;
      const zx = margin * CELL;
      const zy = margin * CELL;
      const zw = (GRID_SIZE - margin * 2) * CELL;
      const zh = (GRID_SIZE - margin * 2) * CELL;
      
      // Red zone outside
      ctx.fillStyle = 'rgba(204, 34, 34, 0.15)';
      ctx.fillRect(0, 0, MAP_SIZE, zy);
      ctx.fillRect(0, zy + zh, MAP_SIZE, MAP_SIZE - zy - zh);
      ctx.fillRect(0, zy, zx, zh);
      ctx.fillRect(zx + zw, zy, MAP_SIZE - zx - zw, zh);
      
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(zx, zy, zw, zh);
    }

    // Loot dots
    for (const loot of lootPositions) {
      ctx.fillStyle = 'rgba(255, 204, 68, 0.7)';
      ctx.beginPath();
      ctx.arc(loot.x * CELL + CELL / 2, loot.z * CELL + CELL / 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Airdrop markers
    for (const drop of state.airdrops || []) {
      if (drop.phase !== 'landed') continue;
      ctx.fillStyle = 'rgba(255, 170, 0, 0.9)';
      ctx.beginPath();
      ctx.arc(drop.targetPos.x * CELL + CELL / 2, drop.targetPos.z * CELL + CELL / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 170, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Weapon range overlay for inspected unit
    const inspected = inspectedUnitId ? state.units.find(u => u.id === inspectedUnitId) : null;
    if (inspected && inspected.isAlive) {
      const range = inspected.attackRange;
      ctx.fillStyle = `${TEAM_COLORS[inspected.team]}15`;
      ctx.strokeStyle = `${TEAM_COLORS[inspected.team]}40`;
      ctx.lineWidth = 0.5;
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const dist = Math.abs(x - inspected.position.x) + Math.abs(z - inspected.position.z);
          if (dist > 0 && dist <= range) {
            ctx.fillRect(x * CELL, z * CELL, CELL, CELL);
          }
        }
      }
    }

    // Units (draw dead ones faded, alive ones solid)
    for (const unit of state.units) {
      const cx = unit.position.x * CELL + CELL / 2;
      const cz = unit.position.z * CELL + CELL / 2;
      const color = TEAM_COLORS[unit.team];
      
      if (!unit.isAlive) {
        ctx.fillStyle = color + '30';
        ctx.beginPath();
        ctx.arc(cx, cz, 2, 0, Math.PI * 2);
        ctx.fill();
        // X mark
        ctx.strokeStyle = color + '40';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx - 1.5, cz - 1.5);
        ctx.lineTo(cx + 1.5, cz + 1.5);
        ctx.moveTo(cx + 1.5, cz - 1.5);
        ctx.lineTo(cx - 1.5, cz + 1.5);
        ctx.stroke();
        continue;
      }

      // Alive unit
      const isActive = unit.id === state.selectedUnitId;
      const isInspected = unit.id === inspectedUnitId;
      const radius = unit.unitClass === 'soldier' ? 3.5 : 3;

      // Selection/inspection ring
      if (isActive || isInspected) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cz, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Unit dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cz, radius, 0, Math.PI * 2);
      ctx.fill();

      // Medic cross
      if (unit.unitClass === 'medic') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 1.2, cz - 0.4, 2.4, 0.8);
        ctx.fillRect(cx - 0.4, cz - 1.2, 0.8, 2.4);
      }
    }

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, MAP_SIZE - 1, MAP_SIZE - 1);

  }, [state.units, state.shrinkLevel, state.selectedUnitId, state.grid, lootPositions, state.airdrops, inspectedUnitId]);

  return (
    <div className="pointer-events-auto absolute bottom-20 left-60 z-20">
      <div className="glass-panel rounded-lg p-1.5 relative">
        <div className="absolute top-0 left-0 right-0 px-2 py-1 flex items-center justify-between z-10">
          <span className="text-[7px] text-muted-foreground/50 tracking-[0.2em] font-display">TACTICAL MAP</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255, 204, 68, 0.7)' }} />
              <span className="text-[6px] text-muted-foreground/40">LOOT</span>
            </span>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          style={{ width: MAP_SIZE, height: MAP_SIZE }}
          className="rounded-sm"
        />
      </div>
    </div>
  );
}
