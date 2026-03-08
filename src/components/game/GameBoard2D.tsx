import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { GameState, Position, GRID_SIZE, TEAM_COLORS, Unit, TileData, CombatEvent } from '@/game/types';
import { isInZone } from '@/game/gameState';

interface GameBoard2DProps {
  state: GameState;
  onTileClick: (pos: Position) => void;
  onUnitClick: (unitId: string) => void;
  onTileHover: (pos: Position | null) => void;
  onMoveComplete?: () => void;
}

// ── Constants ──
const TILE_SIZE = 28;
const BOARD_PX = GRID_SIZE * TILE_SIZE;

// ── Pixel art color palette — Advance Wars inspired ──
const TERRAIN_COLORS: Record<string, { base: string; shade: string; highlight: string }> = {
  grass:  { base: '#3d6b35', shade: '#2d5228', highlight: '#4e8043' },
  dirt:   { base: '#7a6545', shade: '#5e4e35', highlight: '#8f7a58' },
  stone:  { base: '#6b6b72', shade: '#4f4f55', highlight: '#82828a' },
  water:  { base: '#2a5580', shade: '#1e3f62', highlight: '#3a6b9a' },
  sand:   { base: '#b8a060', shade: '#9a854e', highlight: '#d0b870' },
  wall:   { base: '#4a4a52', shade: '#333338', highlight: '#5e5e68' },
  trench: { base: '#4a3e2e', shade: '#352c20', highlight: '#5c4e3c' },
};

const PROP_GLYPHS: Record<string, { color: string; char: string }> = {
  crate:          { color: '#c89040', char: '▪' },
  barrel:         { color: '#7a5530', char: '●' },
  sandbag:        { color: '#a09070', char: '▬' },
  rock:           { color: '#666', char: '◆' },
  bush:           { color: '#3a7a30', char: '♣' },
  tree:           { color: '#2a5a20', char: '▲' },
  ruins:          { color: '#555', char: '▧' },
  wire:           { color: '#888', char: '╳' },
  jersey_barrier: { color: '#888', char: '▰' },
  burnt_vehicle:  { color: '#444', char: '▮' },
  foxhole:        { color: '#5a4a30', char: '◌' },
  hesco:          { color: '#7a7a60', char: '▦' },
  tank_trap:      { color: '#555', char: '✖' },
};

// ── Unit Animation State ──
interface UnitAnim {
  x: number;
  z: number;
  flash: number; // 0-1, red flash for hit
  floatText: string | null;
  floatY: number;
  floatOpacity: number;
  scale: number;
  deathProgress: number; // 0 = alive, 1 = fully dead
}

// ── Floating damage number ──
interface FloatingText {
  id: string;
  x: number;
  z: number;
  text: string;
  color: string;
  age: number;
}

export function GameBoard2D({ state, onTileClick, onUnitClick, onTileHover, onMoveComplete }: GameBoard2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  // Animation state
  const unitAnims = useRef<Record<string, UnitAnim>>({});
  const floatingTexts = useRef<FloatingText[]>([]);
  const lastEventCount = useRef(0);
  const animFrameId = useRef(0);
  const lastTime = useRef(0);

  // Moving unit path animation
  const movePathIndex = useRef(0);
  const moveProgress = useRef(0);
  const lastMovePath = useRef<Position[] | null>(null);

  // Sets for O(1) lookups
  const movableSet = useMemo(() => new Set(state.movableTiles.map(t => `${t.x},${t.z}`)), [state.movableTiles]);
  const attackableSet = useMemo(() => new Set(state.attackableTiles.map(t => `${t.x},${t.z}`)), [state.attackableTiles]);
  const abilitySet = useMemo(() => new Set(state.abilityTargetTiles.map(t => `${t.x},${t.z}`)), [state.abilityTargetTiles]);

  // Initialize unit anims
  useEffect(() => {
    for (const unit of state.units) {
      if (!unitAnims.current[unit.id]) {
        unitAnims.current[unit.id] = {
          x: unit.position.x, z: unit.position.z,
          flash: 0, floatText: null, floatY: 0, floatOpacity: 0,
          scale: 1, deathProgress: unit.isAlive ? 0 : 1,
        };
      }
    }
  }, [state.units]);

  // Process combat events for floating text
  useEffect(() => {
    if (state.combatEvents.length <= lastEventCount.current) return;
    const newEvents = state.combatEvents.slice(lastEventCount.current);
    lastEventCount.current = state.combatEvents.length;

    for (const evt of newEvents) {
      if (Date.now() - evt.timestamp > 1000) continue;

      // Flash the target
      const targetUnit = state.units.find(u =>
        u.position.x === evt.targetPos.x && u.position.z === evt.targetPos.z
      );
      if (targetUnit && unitAnims.current[targetUnit.id]) {
        unitAnims.current[targetUnit.id].flash = 1;
      }

      // Floating text
      let text = '';
      let color = '#fff';
      if (evt.type === 'damage') { text = `-${evt.value}`; color = '#ff4444'; }
      else if (evt.type === 'crit') { text = `CRIT -${evt.value}`; color = '#ff8800'; }
      else if (evt.type === 'miss') { text = 'MISS'; color = '#888'; }
      else if (evt.type === 'kill') { text = 'ELIMINATED'; color = '#ff2222'; }
      else if (evt.type === 'heal') { text = `+${evt.value}`; color = '#44cc44'; }
      else if (evt.type === 'loot') { text = '📦'; color = '#ffcc44'; }

      if (text) {
        floatingTexts.current.push({
          id: evt.id,
          x: evt.targetPos.x,
          z: evt.targetPos.z,
          text, color, age: 0,
        });
      }
    }
  }, [state.combatEvents, state.units]);

  // Handle move path animation
  useEffect(() => {
    if (state.movePath && state.movePath !== lastMovePath.current) {
      movePathIndex.current = 0;
      moveProgress.current = 0;
      lastMovePath.current = state.movePath;
    }
    if (!state.movePath) {
      lastMovePath.current = null;
    }
  }, [state.movePath]);

  // Center camera on initial load
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setCamera({
      x: BOARD_PX / 2 - rect.width / 2,
      y: BOARD_PX / 2 - rect.height / 2,
      zoom: Math.min(rect.width / BOARD_PX, rect.height / BOARD_PX) * 0.95,
    });
  }, []);

  // Auto-follow active unit
  useEffect(() => {
    if (!state.autoPlay || !state.selectedUnitId) return;
    const unit = state.units.find(u => u.id === state.selectedUnitId);
    if (!unit) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const targetX = unit.position.x * TILE_SIZE + TILE_SIZE / 2 - rect.width / (2 * camera.zoom);
    const targetY = unit.position.z * TILE_SIZE + TILE_SIZE / 2 - rect.height / (2 * camera.zoom);
    setCamera(prev => ({
      ...prev,
      x: prev.x + (targetX - prev.x) * 0.08,
      y: prev.y + (targetY - prev.y) * 0.08,
    }));
  }, [state.selectedUnitId, state.units, state.autoPlay, camera.zoom]);

  // ── Main render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    function render(timestamp: number) {
      if (!running || !ctx || !canvas) return;
      const dt = Math.min((timestamp - lastTime.current) / 1000, 0.05);
      lastTime.current = timestamp;

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }

      ctx.save();
      ctx.scale(devicePixelRatio, devicePixelRatio);

      const w = canvas.width / devicePixelRatio;
      const h = canvas.height / devicePixelRatio;

      // Clear
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, w, h);

      // Apply camera
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x - w / (2 * camera.zoom), -camera.y - h / (2 * camera.zoom));

      // ── Draw tiles ──
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const tile = state.grid[x]?.[z];
          if (!tile) continue;

          const px = x * TILE_SIZE;
          const pz = z * TILE_SIZE;
          const outOfZone = state.shrinkLevel > 0 && !isInZone(x, z, state.shrinkLevel);
          const colors = TERRAIN_COLORS[tile.type] || TERRAIN_COLORS.grass;

          // Base tile
          ctx.fillStyle = outOfZone ? '#2a1515' : colors.base;
          ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);

          // Pixel art detail — checkerboard pattern
          if ((x + z) % 2 === 0) {
            ctx.fillStyle = outOfZone ? '#331a1a' : colors.shade;
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
          }

          // Highlight edge (top-left pixel art bevel)
          if (!outOfZone) {
            ctx.fillStyle = colors.highlight + '40';
            ctx.fillRect(px, pz, TILE_SIZE, 1);
            ctx.fillRect(px, pz, 1, TILE_SIZE);
          }

          // Grid line
          ctx.strokeStyle = outOfZone ? '#1a0808' : '#00000030';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px + 0.25, pz + 0.25, TILE_SIZE - 0.5, TILE_SIZE - 0.5);

          // Elevation shading
          if (tile.elevation > 0.6) {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
          } else if (tile.elevation < 0.3) {
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
          }

          // Props
          if (tile.prop) {
            const glyph = PROP_GLYPHS[tile.prop];
            if (glyph) {
              ctx.fillStyle = glyph.color;
              ctx.font = `bold ${TILE_SIZE * 0.55}px monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(glyph.char, px + TILE_SIZE / 2, pz + TILE_SIZE / 2);
            }
          }

          // Smoke
          if (tile.hasSmoke) {
            ctx.fillStyle = 'rgba(180,200,220,0.35)';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
          }

          // Loot
          if (tile.loot) {
            ctx.fillStyle = '#ffcc4488';
            ctx.fillRect(px + 4, pz + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.fillStyle = '#ffcc44';
            ctx.font = `${TILE_SIZE * 0.4}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', px + TILE_SIZE / 2, pz + TILE_SIZE / 2);
          }

          // Highlight overlays
          const key = `${x},${z}`;
          if (movableSet.has(key)) {
            ctx.fillStyle = 'rgba(68,136,255,0.2)';
            ctx.fillRect(px + 1, pz + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            ctx.strokeStyle = '#4488ff55';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 1, pz + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
          if (attackableSet.has(key)) {
            ctx.fillStyle = 'rgba(255,68,68,0.2)';
            ctx.fillRect(px + 1, pz + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            ctx.strokeStyle = '#ff444488';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 1, pz + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
          if (abilitySet.has(key)) {
            ctx.fillStyle = 'rgba(68,204,68,0.2)';
            ctx.fillRect(px + 1, pz + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            ctx.strokeStyle = '#44cc4488';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 1, pz + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        }
      }

      // ── Zone border ──
      if (state.shrinkLevel > 0) {
        const margin = state.shrinkLevel * 2;
        ctx.strokeStyle = '#ff2222';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
          margin * TILE_SIZE,
          margin * TILE_SIZE,
          (GRID_SIZE - margin * 2) * TILE_SIZE,
          (GRID_SIZE - margin * 2) * TILE_SIZE
        );
        ctx.setLineDash([]);

        // Pulsing glow
        const pulse = 0.3 + Math.sin(timestamp * 0.003) * 0.2;
        ctx.strokeStyle = `rgba(255,34,34,${pulse})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(
          margin * TILE_SIZE - 2,
          margin * TILE_SIZE - 2,
          (GRID_SIZE - margin * 2) * TILE_SIZE + 4,
          (GRID_SIZE - margin * 2) * TILE_SIZE + 4
        );
      }

      // ── Move path preview ──
      if (state.movePath && state.movePath.length > 1) {
        ctx.strokeStyle = '#4488ffaa';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(
          state.movePath[0].x * TILE_SIZE + TILE_SIZE / 2,
          state.movePath[0].z * TILE_SIZE + TILE_SIZE / 2
        );
        for (let i = 1; i < state.movePath.length; i++) {
          ctx.lineTo(
            state.movePath[i].x * TILE_SIZE + TILE_SIZE / 2,
            state.movePath[i].z * TILE_SIZE + TILE_SIZE / 2
          );
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Draw units ──
      for (const unit of state.units) {
        const anim = unitAnims.current[unit.id];
        if (!anim) continue;

        // Smooth position interpolation
        anim.x += (unit.position.x - anim.x) * 0.12;
        anim.z += (unit.position.z - anim.z) * 0.12;

        // Flash decay
        if (anim.flash > 0) anim.flash = Math.max(0, anim.flash - dt * 4);

        // Death animation
        if (!unit.isAlive && anim.deathProgress < 1) {
          anim.deathProgress = Math.min(1, anim.deathProgress + dt * 2);
        }

        if (anim.deathProgress >= 1 && !unit.isAlive) continue; // Skip fully dead

        const px = anim.x * TILE_SIZE + TILE_SIZE / 2;
        const pz = anim.z * TILE_SIZE + TILE_SIZE / 2;
        const teamColor = TEAM_COLORS[unit.team];
        const isSelected = unit.id === state.selectedUnitId;
        const size = TILE_SIZE * 0.38;

        ctx.save();
        ctx.translate(px, pz);

        // Death fade
        if (!unit.isAlive) {
          ctx.globalAlpha = 1 - anim.deathProgress;
          ctx.rotate(anim.deathProgress * 1.2);
        }

        // Selected glow
        if (isSelected) {
          const glowPulse = 0.4 + Math.sin(timestamp * 0.005) * 0.2;
          ctx.beginPath();
          ctx.arc(0, 0, size + 5, 0, Math.PI * 2);
          ctx.fillStyle = teamColor + Math.floor(glowPulse * 255).toString(16).padStart(2, '0');
          ctx.fill();
        }

        // Unit shadow
        ctx.beginPath();
        ctx.ellipse(0, size * 0.6, size * 0.7, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Body — pixel art soldier shape
        // Torso
        ctx.fillStyle = anim.flash > 0 ? `rgba(255,${Math.floor(100 * (1 - anim.flash))},${Math.floor(100 * (1 - anim.flash))},1)` : teamColor;
        ctx.fillRect(-size * 0.45, -size * 0.7, size * 0.9, size * 1.1);

        // Head
        ctx.fillStyle = '#ddc8a0';
        ctx.fillRect(-size * 0.3, -size * 1.1, size * 0.6, size * 0.45);

        // Helmet
        ctx.fillStyle = teamColor;
        ctx.fillRect(-size * 0.35, -size * 1.2, size * 0.7, size * 0.25);

        // Weapon (right side)
        ctx.fillStyle = '#555';
        ctx.fillRect(size * 0.35, -size * 0.5, size * 0.15, size * 0.8);

        // Class indicator
        if (unit.unitClass === 'medic') {
          ctx.fillStyle = '#fff';
          ctx.fillRect(-size * 0.12, -size * 0.4, size * 0.24, size * 0.08);
          ctx.fillRect(-size * 0.04, -size * 0.5, size * 0.08, size * 0.28);
        }

        // Legs
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(-size * 0.35, size * 0.35, size * 0.28, size * 0.4);
        ctx.fillRect(size * 0.08, size * 0.35, size * 0.28, size * 0.4);

        // HP bar above unit
        const barW = size * 1.8;
        const barH = 3;
        const barY = -size * 1.4;
        ctx.fillStyle = '#000000aa';
        ctx.fillRect(-barW / 2, barY, barW, barH);
        const hpPct = unit.hp / unit.maxHp;
        ctx.fillStyle = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#cc8800' : '#cc2222';
        ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);
        ctx.strokeStyle = '#00000066';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-barW / 2, barY, barW, barH);

        // Overwatch indicator
        if (unit.isOnOverwatch) {
          ctx.fillStyle = '#4488ff';
          ctx.font = `bold ${TILE_SIZE * 0.3}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('👁', 0, -size * 1.7);
        }

        ctx.restore();
      }

      // ── Floating damage text ──
      floatingTexts.current = floatingTexts.current.filter(ft => ft.age < 1.5);
      for (const ft of floatingTexts.current) {
        ft.age += dt;
        const px = ft.x * TILE_SIZE + TILE_SIZE / 2;
        const pz = ft.z * TILE_SIZE + TILE_SIZE / 2 - ft.age * 40;
        const alpha = Math.max(0, 1 - ft.age / 1.5);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ft.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.font = `bold ${14 / camera.zoom > 10 ? 14 : 10}px 'Share Tech Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(ft.text, px, pz);
        ctx.fillText(ft.text, px, pz);
        ctx.restore();
      }

      // ── Combat lines (attacker → target) ──
      const recentEvents = state.combatEvents.filter(e =>
        (e.type === 'damage' || e.type === 'crit') && Date.now() - e.timestamp < 400
      );
      for (const evt of recentEvents) {
        const age = (Date.now() - evt.timestamp) / 400;
        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.strokeStyle = evt.type === 'crit' ? '#ff8800' : '#ff4444';
        ctx.lineWidth = evt.type === 'crit' ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(
          evt.attackerPos.x * TILE_SIZE + TILE_SIZE / 2,
          evt.attackerPos.z * TILE_SIZE + TILE_SIZE / 2
        );
        ctx.lineTo(
          evt.targetPos.x * TILE_SIZE + TILE_SIZE / 2,
          evt.targetPos.z * TILE_SIZE + TILE_SIZE / 2
        );
        ctx.stroke();

        // Muzzle flash at attacker
        if (age < 0.3) {
          ctx.fillStyle = '#ffff88';
          ctx.beginPath();
          ctx.arc(
            evt.attackerPos.x * TILE_SIZE + TILE_SIZE / 2,
            evt.attackerPos.z * TILE_SIZE + TILE_SIZE / 2,
            4 * (1 - age / 0.3), 0, Math.PI * 2
          );
          ctx.fill();
        }

        ctx.restore();
      }

      // ── Kill cam overlay glow ──
      if (state.killCam) {
        const kx = state.killCam.targetPos.x * TILE_SIZE + TILE_SIZE / 2;
        const kz = state.killCam.targetPos.z * TILE_SIZE + TILE_SIZE / 2;
        const grad = ctx.createRadialGradient(kx, kz, 0, kx, kz, TILE_SIZE * 4);
        grad.addColorStop(0, 'rgba(255,50,30,0.25)');
        grad.addColorStop(1, 'rgba(255,50,30,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(kx - TILE_SIZE * 4, kz - TILE_SIZE * 4, TILE_SIZE * 8, TILE_SIZE * 8);
      }

      ctx.restore(); // camera transform
      ctx.restore(); // DPR scale

      animFrameId.current = requestAnimationFrame(render);
    }

    animFrameId.current = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameId.current);
    };
  }, [state, camera, movableSet, attackableSet, abilitySet]);

  // ── Mouse handlers ──
  const screenToGrid = useCallback((clientX: number, clientY: number): Position | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    // Reverse camera transform
    const wx = (sx - rect.width / 2) / camera.zoom + camera.x + rect.width / (2 * camera.zoom);
    const wy = (sy - rect.height / 2) / camera.zoom + camera.y + rect.height / (2 * camera.zoom);
    const gx = Math.floor(wx / TILE_SIZE);
    const gz = Math.floor(wy / TILE_SIZE);
    if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return null;
    return { x: gx, z: gz };
  }, [camera]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 2) {
      isDragging.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY, camX: camera.x, camY: camera.y };
    }
  }, [camera]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Check if dragging (right-click or left-click drag)
    if (e.buttons > 0) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDragging.current = true;
        setCamera(prev => ({
          ...prev,
          x: dragStart.current.camX - dx / prev.zoom,
          y: dragStart.current.camY - dy / prev.zoom,
        }));
      }
    }

    // Hover
    const pos = screenToGrid(e.clientX, e.clientY);
    onTileHover(pos);
  }, [screenToGrid, onTileHover]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      return;
    }

    const pos = screenToGrid(e.clientX, e.clientY);
    if (!pos) return;

    // Check if clicking a unit
    const clickedUnit = state.units.find(u =>
      u.isAlive && u.position.x === pos.x && u.position.z === pos.z
    );

    if (clickedUnit) {
      onUnitClick(clickedUnit.id);
    } else {
      onTileClick(pos);
    }
  }, [screenToGrid, state.units, onUnitClick, onTileClick]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(0.4, Math.min(3, prev.zoom * (e.deltaY < 0 ? 1.1 : 0.9))),
    }));
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-background"
      onContextMenu={handleContextMenu}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Kill cam overlay */}
      {state.killCam && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-[10%] bg-black transition-all duration-500" />
          <div className="absolute bottom-0 left-0 right-0 h-[10%] bg-black transition-all duration-500" />
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
          }} />
          <div className="absolute bottom-[12%] left-6 animate-fade-in flex items-center gap-3">
            <div className="w-1 h-10 bg-destructive rounded-full" />
            <div>
              <div className="text-[8px] tracking-[0.5em] text-destructive/80 font-mono uppercase">
                ELIMINATED
              </div>
              <div className="text-2xl font-black text-foreground tracking-wide"
                style={{ textShadow: '0 0 20px rgba(255,50,50,0.4)' }}>
                {state.killCam.victimName}
              </div>
              <div className="text-[9px] tracking-[0.2em] text-muted-foreground/80 font-mono">
                ▸ {state.killCam.killerName}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
