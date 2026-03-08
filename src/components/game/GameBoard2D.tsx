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

// ── Richer terrain palette with multiple tones for natural variation ──
const TERRAIN_COLORS: Record<string, { base: string; shade: string; highlight: string; detail: string }> = {
  grass:  { base: '#4a7a3a', shade: '#3a6530', highlight: '#5c8e48', detail: '#3d6e2e' },
  dirt:   { base: '#8a7050', shade: '#6e5a3e', highlight: '#a0845e', detail: '#7a6444' },
  stone:  { base: '#787880', shade: '#5a5a62', highlight: '#92929a', detail: '#686870' },
  water:  { base: '#2860a0', shade: '#1c4878', highlight: '#3878c0', detail: '#205088' },
  sand:   { base: '#c8aa68', shade: '#a89050', highlight: '#e0c280', detail: '#b89858' },
  wall:   { base: '#585860', shade: '#404048', highlight: '#6e6e78', detail: '#4e4e56' },
  trench: { base: '#5a4a38', shade: '#443828', highlight: '#6e5c48', detail: '#4e4030' },
};

// ── Seeded noise for consistent tile variation ──
function tileNoise(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

// ── Prop drawing functions (drawn as pixel art shapes, not glyphs) ──
function drawProp(ctx: CanvasRenderingContext2D, prop: string, px: number, pz: number, ts: number, variant: number) {
  const cx = px + ts / 2;
  const cy = pz + ts / 2;

  switch (prop) {
    case 'crate': {
      // Wooden crate with planks
      ctx.fillStyle = '#a07838';
      ctx.fillRect(cx - ts * 0.32, cy - ts * 0.32, ts * 0.64, ts * 0.64);
      ctx.fillStyle = '#8a6428';
      ctx.fillRect(cx - ts * 0.32, cy - ts * 0.05, ts * 0.64, ts * 0.1); // horizontal plank
      ctx.fillRect(cx - ts * 0.05, cy - ts * 0.32, ts * 0.1, ts * 0.64); // vertical plank
      ctx.fillStyle = '#c09048';
      ctx.fillRect(cx - ts * 0.3, cy - ts * 0.3, ts * 0.6, 2); // top highlight
      ctx.fillRect(cx - ts * 0.3, cy - ts * 0.3, 2, ts * 0.6);
      break;
    }
    case 'barrel': {
      ctx.fillStyle = '#6a4828';
      ctx.beginPath();
      ctx.ellipse(cx, cy, ts * 0.22, ts * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5a38';
      ctx.fillRect(cx - ts * 0.2, cy - ts * 0.06, ts * 0.4, ts * 0.04); // metal band
      ctx.fillRect(cx - ts * 0.2, cy + ts * 0.1, ts * 0.4, ts * 0.04);
      ctx.fillStyle = '#8a6a48';
      ctx.fillRect(cx - ts * 0.15, cy - ts * 0.26, ts * 0.3, 2); // lid highlight
      break;
    }
    case 'sandbag': {
      // Stacked sandbag wall
      ctx.fillStyle = '#a09068';
      ctx.fillRect(cx - ts * 0.35, cy - ts * 0.1, ts * 0.32, ts * 0.2);
      ctx.fillRect(cx + ts * 0.03, cy - ts * 0.1, ts * 0.32, ts * 0.2);
      ctx.fillRect(cx - ts * 0.18, cy - ts * 0.28, ts * 0.36, ts * 0.2);
      ctx.fillStyle = '#8a7a58';
      ctx.fillRect(cx - ts * 0.35, cy + ts * 0.08, ts * 0.7, 2);
      ctx.fillStyle = '#b0a078';
      ctx.fillRect(cx - ts * 0.35, cy - ts * 0.1, ts * 0.7, 1);
      break;
    }
    case 'rock': {
      ctx.fillStyle = '#707070';
      ctx.beginPath();
      ctx.moveTo(cx - ts * 0.25, cy + ts * 0.15);
      ctx.lineTo(cx - ts * 0.15, cy - ts * 0.2);
      ctx.lineTo(cx + ts * 0.1, cy - ts * 0.25);
      ctx.lineTo(cx + ts * 0.28, cy - ts * 0.05);
      ctx.lineTo(cx + ts * 0.2, cy + ts * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#888';
      ctx.fillRect(cx - ts * 0.12, cy - ts * 0.18, ts * 0.18, 2); // highlight
      ctx.fillStyle = '#585858';
      ctx.fillRect(cx + ts * 0.05, cy + ts * 0.05, ts * 0.12, ts * 0.08); // shadow crack
      break;
    }
    case 'bush': {
      // Layered foliage
      ctx.fillStyle = '#2a5520';
      ctx.beginPath();
      ctx.arc(cx, cy + ts * 0.05, ts * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#387028';
      ctx.beginPath();
      ctx.arc(cx - ts * 0.08, cy - ts * 0.05, ts * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#48883a';
      ctx.beginPath();
      ctx.arc(cx + ts * 0.1, cy - ts * 0.08, ts * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'tree': {
      // Tree trunk + layered canopy
      ctx.fillStyle = '#5a4028';
      ctx.fillRect(cx - ts * 0.06, cy, ts * 0.12, ts * 0.3); // trunk
      ctx.fillStyle = '#2a5a1e';
      ctx.beginPath();
      ctx.moveTo(cx, cy - ts * 0.35);
      ctx.lineTo(cx - ts * 0.28, cy + ts * 0.05);
      ctx.lineTo(cx + ts * 0.28, cy + ts * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#38701e';
      ctx.beginPath();
      ctx.moveTo(cx, cy - ts * 0.22);
      ctx.lineTo(cx - ts * 0.22, cy + ts * 0.12);
      ctx.lineTo(cx + ts * 0.22, cy + ts * 0.12);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'ruins': {
      // Broken wall segments
      ctx.fillStyle = '#606060';
      ctx.fillRect(cx - ts * 0.3, cy - ts * 0.1, ts * 0.18, ts * 0.35);
      ctx.fillRect(cx + ts * 0.05, cy - ts * 0.25, ts * 0.2, ts * 0.5);
      ctx.fillRect(cx - ts * 0.15, cy + ts * 0.1, ts * 0.25, ts * 0.15);
      ctx.fillStyle = '#505050';
      ctx.fillRect(cx - ts * 0.28, cy + ts * 0.2, ts * 0.14, ts * 0.08);
      ctx.fillStyle = '#707070';
      ctx.fillRect(cx + ts * 0.05, cy - ts * 0.25, ts * 0.2, 2);
      break;
    }
    case 'wire': {
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      // Zigzag wire
      ctx.beginPath();
      ctx.moveTo(px + 3, pz + ts * 0.3);
      for (let i = 0; i < 5; i++) {
        const wx = px + 3 + (i + 0.5) * (ts - 6) / 5;
        const wy = pz + (i % 2 === 0 ? ts * 0.2 : ts * 0.5);
        ctx.lineTo(wx, wy);
      }
      ctx.lineTo(px + ts - 3, pz + ts * 0.4);
      ctx.stroke();
      // Posts
      ctx.fillStyle = '#777';
      ctx.fillRect(px + 4, pz + ts * 0.15, 2, ts * 0.45);
      ctx.fillRect(px + ts - 6, pz + ts * 0.2, 2, ts * 0.4);
      break;
    }
    case 'jersey_barrier': {
      ctx.fillStyle = '#909090';
      ctx.fillRect(cx - ts * 0.35, cy - ts * 0.12, ts * 0.7, ts * 0.24);
      ctx.fillStyle = '#a0a0a0';
      ctx.fillRect(cx - ts * 0.33, cy - ts * 0.12, ts * 0.66, 2);
      ctx.fillStyle = '#e8a020';
      ctx.fillRect(cx - ts * 0.3, cy - ts * 0.02, ts * 0.6, ts * 0.04); // warning stripe
      break;
    }
    case 'burnt_vehicle': {
      ctx.fillStyle = '#383838';
      ctx.fillRect(cx - ts * 0.35, cy - ts * 0.2, ts * 0.7, ts * 0.4);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(cx - ts * 0.3, cy - ts * 0.3, ts * 0.5, ts * 0.15); // cab
      // Wheels
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(cx - ts * 0.22, cy + ts * 0.2, ts * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + ts * 0.22, cy + ts * 0.2, ts * 0.08, 0, Math.PI * 2); ctx.fill();
      // Burn marks
      ctx.fillStyle = '#4a3020';
      ctx.fillRect(cx - ts * 0.1, cy - ts * 0.28, ts * 0.25, ts * 0.1);
      break;
    }
    case 'foxhole': {
      ctx.fillStyle = '#3a3020';
      ctx.beginPath();
      ctx.ellipse(cx, cy, ts * 0.28, ts * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#504030';
      ctx.beginPath();
      ctx.ellipse(cx, cy, ts * 0.22, ts * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5a4a38';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, ts * 0.28, ts * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'hesco': {
      // Hesco barrier — stacked boxes
      ctx.fillStyle = '#8a8a68';
      ctx.fillRect(cx - ts * 0.3, cy - ts * 0.15, ts * 0.28, ts * 0.3);
      ctx.fillRect(cx + ts * 0.02, cy - ts * 0.15, ts * 0.28, ts * 0.3);
      ctx.strokeStyle = '#6a6a50';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(cx - ts * 0.3, cy - ts * 0.15, ts * 0.28, ts * 0.3);
      ctx.strokeRect(cx + ts * 0.02, cy - ts * 0.15, ts * 0.28, ts * 0.3);
      // Mesh lines
      ctx.strokeStyle = '#7a7a5a';
      ctx.beginPath();
      ctx.moveTo(cx - ts * 0.3, cy); ctx.lineTo(cx - ts * 0.02, cy); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + ts * 0.02, cy); ctx.lineTo(cx + ts * 0.3, cy); ctx.stroke();
      break;
    }
    case 'tank_trap': {
      // Czech hedgehog
      ctx.strokeStyle = '#606060';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.25, cy + ts * 0.2); ctx.lineTo(cx + ts * 0.25, cy - ts * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + ts * 0.25, cy + ts * 0.2); ctx.lineTo(cx - ts * 0.25, cy - ts * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - ts * 0.28); ctx.lineTo(cx, cy + ts * 0.28); ctx.stroke();
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill(); // center bolt
      break;
    }
  }
}

// ── Draw natural terrain details on a tile ──
function drawTerrainDetail(ctx: CanvasRenderingContext2D, type: string, px: number, pz: number, ts: number, variant: number, elevation: number) {
  const n1 = tileNoise(px, pz, 1);
  const n2 = tileNoise(px, pz, 2);
  const n3 = tileNoise(px, pz, 3);

  switch (type) {
    case 'grass': {
      // Small grass tufts
      ctx.fillStyle = '#5a9a45';
      if (n1 > 0.5) {
        ctx.fillRect(px + ts * 0.15, pz + ts * 0.7, 2, 3);
        ctx.fillRect(px + ts * 0.18, pz + ts * 0.68, 2, 4);
      }
      if (n2 > 0.4) {
        ctx.fillRect(px + ts * 0.65, pz + ts * 0.3, 2, 3);
        ctx.fillRect(px + ts * 0.68, pz + ts * 0.28, 2, 4);
      }
      if (n3 > 0.6) {
        // Small flower / pebble
        ctx.fillStyle = n1 > 0.7 ? '#c8b848' : '#6aa050';
        ctx.fillRect(px + ts * 0.4 + n2 * ts * 0.2, pz + ts * 0.5 + n3 * ts * 0.2, 2, 2);
      }
      break;
    }
    case 'dirt': {
      // Pebbles and tracks
      ctx.fillStyle = '#665538';
      if (n1 > 0.3) ctx.fillRect(px + n2 * ts * 0.6 + 2, pz + n3 * ts * 0.6 + 2, 3, 2);
      if (n2 > 0.5) ctx.fillRect(px + n1 * ts * 0.5 + 4, pz + n3 * ts * 0.4 + 6, 2, 2);
      // Subtle tire track
      if (n3 > 0.7) {
        ctx.fillStyle = '#5a4a35';
        ctx.fillRect(px + ts * 0.3, pz, 2, ts);
        ctx.fillRect(px + ts * 0.65, pz, 2, ts);
      }
      break;
    }
    case 'stone': {
      // Cracks and chips
      ctx.strokeStyle = '#50505a';
      ctx.lineWidth = 0.8;
      if (n1 > 0.5) {
        ctx.beginPath();
        ctx.moveTo(px + ts * 0.2, pz + ts * n2);
        ctx.lineTo(px + ts * 0.5, pz + ts * n3 * 0.8);
        ctx.stroke();
      }
      if (n2 > 0.6) {
        ctx.fillStyle = '#62626a';
        ctx.fillRect(px + ts * 0.6, pz + ts * 0.4, 3, 3);
      }
      break;
    }
    case 'water': {
      // Animated ripple highlights (using variant as pseudo-time)
      const shimmer = Math.sin(variant * 0.5 + px * 0.1 + pz * 0.15) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(100,180,255,${shimmer * 0.12})`;
      ctx.fillRect(px + ts * n1 * 0.5, pz + ts * n2 * 0.5, ts * 0.4, 1);
      ctx.fillRect(px + ts * n3 * 0.3 + 2, pz + ts * n1 * 0.6 + 4, ts * 0.3, 1);
      break;
    }
    case 'sand': {
      // Wind ripple lines
      ctx.strokeStyle = '#b8985a';
      ctx.lineWidth = 0.6;
      const yOff = ts * 0.2 + n1 * ts * 0.6;
      ctx.beginPath();
      ctx.moveTo(px + 2, pz + yOff);
      ctx.quadraticCurveTo(px + ts / 2, pz + yOff - 2, px + ts - 2, pz + yOff + 1);
      ctx.stroke();
      if (n2 > 0.4) {
        const yOff2 = ts * 0.5 + n3 * ts * 0.3;
        ctx.beginPath();
        ctx.moveTo(px + 3, pz + yOff2);
        ctx.quadraticCurveTo(px + ts / 2, pz + yOff2 + 2, px + ts - 3, pz + yOff2 - 1);
        ctx.stroke();
      }
      break;
    }
    case 'trench': {
      // Plank lines
      ctx.fillStyle = '#4a3a28';
      ctx.fillRect(px + 2, pz + ts * 0.2, ts - 4, 2);
      ctx.fillRect(px + 2, pz + ts * 0.6, ts - 4, 2);
      break;
    }
  }
}

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
  walkCycle: number; // 0-2π, drives leg alternation + bob
  isMoving: boolean;
  prevX: number;
  prevZ: number;
}

// ── Dust particle ──
interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
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
  const dustParticles = useRef<DustParticle[]>([]);
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
          walkCycle: 0, isMoving: false,
          prevX: unit.position.x, prevZ: unit.position.z,
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

          // Base tile with subtle variation using noise
          const n = tileNoise(x, z, 0);
          if (outOfZone) {
            ctx.fillStyle = n > 0.5 ? '#2a1515' : '#241212';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
          } else {
            // Main fill
            ctx.fillStyle = (x + z) % 2 === 0 ? colors.base : colors.shade;
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);

            // Natural noise patches — break up the grid
            if (n > 0.55) {
              ctx.fillStyle = colors.detail + '60';
              ctx.fillRect(px + n * 4, pz + n * 6, TILE_SIZE * 0.5, TILE_SIZE * 0.4);
            }
            if (n < 0.3) {
              ctx.fillStyle = colors.highlight + '30';
              ctx.fillRect(px + 2, pz + 2, TILE_SIZE * 0.6, TILE_SIZE * 0.5);
            }

            // Bevel — subtle top-left highlight, bottom-right shadow
            ctx.fillStyle = colors.highlight + '28';
            ctx.fillRect(px, pz, TILE_SIZE, 1);
            ctx.fillRect(px, pz, 1, TILE_SIZE);
            ctx.fillStyle = '#00000018';
            ctx.fillRect(px, pz + TILE_SIZE - 1, TILE_SIZE, 1);
            ctx.fillRect(px + TILE_SIZE - 1, pz, 1, TILE_SIZE);

            // Elevation shading
            if (tile.elevation > 0.6) {
              ctx.fillStyle = 'rgba(255,255,255,0.07)';
              ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
            } else if (tile.elevation < 0.3) {
              ctx.fillStyle = 'rgba(0,0,0,0.1)';
              ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
            }

            // Natural terrain detail (tufts, pebbles, ripples)
            drawTerrainDetail(ctx, tile.type, px, pz, TILE_SIZE, tile.variant, tile.elevation);
          }

          // Grid line — very subtle
          ctx.strokeStyle = outOfZone ? '#1a080808' : '#00000018';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px + 0.25, pz + 0.25, TILE_SIZE - 0.5, TILE_SIZE - 0.5);

          // Props — drawn as pixel art shapes
          if (tile.prop) {
            drawProp(ctx, tile.prop, px, pz, TILE_SIZE, tile.variant);
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

      // ── Draw dust particles ──
      dustParticles.current = dustParticles.current.filter(p => p.life < p.maxLife);
      for (const p of dustParticles.current) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 15 * dt; // gravity
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.fillStyle = `rgba(160,140,110,${alpha * 0.6})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }

      // ── Draw units ──
      for (const unit of state.units) {
        const anim = unitAnims.current[unit.id];
        if (!anim) continue;

        // Smooth position interpolation
        const dx = unit.position.x - anim.x;
        const dz = unit.position.z - anim.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const wasMoving = anim.isMoving;
        anim.isMoving = dist > 0.05;

        anim.x += dx * 0.12;
        anim.z += dz * 0.12;

        // Walk cycle — advance while moving
        if (anim.isMoving) {
          anim.walkCycle += dt * 14; // speed of leg pump
          // Spawn dust every ~0.25 of walk cycle
          if (Math.floor(anim.walkCycle * 2) !== Math.floor((anim.walkCycle - dt * 14) * 2)) {
            const footX = anim.x * TILE_SIZE + TILE_SIZE / 2;
            const footZ = anim.z * TILE_SIZE + TILE_SIZE / 2 + TILE_SIZE * 0.38 * 0.7;
            for (let i = 0; i < 3; i++) {
              dustParticles.current.push({
                x: footX + (Math.random() - 0.5) * 6,
                y: footZ + (Math.random() - 0.5) * 2,
                vx: (Math.random() - 0.5) * 15,
                vy: -(Math.random() * 12 + 3),
                life: 0,
                maxLife: 0.3 + Math.random() * 0.3,
                size: 1.5 + Math.random() * 1.5,
              });
            }
          }
        } else {
          // Smoothly decay walk cycle to nearest rest position
          anim.walkCycle *= 0.85;
        }

        anim.prevX = anim.x;
        anim.prevZ = anim.z;

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

        // Walk bob offset
        const bobY = anim.isMoving ? Math.sin(anim.walkCycle * 2) * 2 : 0;
        const tiltX = anim.isMoving ? Math.sin(anim.walkCycle) * 0.06 : 0;
        // Leg offsets — alternate legs
        const legPhase = anim.walkCycle;
        const leftLegOffset = anim.isMoving ? Math.sin(legPhase) * size * 0.35 : 0;
        const rightLegOffset = anim.isMoving ? Math.sin(legPhase + Math.PI) * size * 0.35 : 0;
        // Arm swing
        const armSwing = anim.isMoving ? Math.sin(legPhase + Math.PI) * size * 0.2 : 0;

        ctx.save();
        ctx.translate(px, pz + bobY);
        ctx.rotate(tiltX);

        // Death fade
        if (!unit.isAlive) {
          ctx.globalAlpha = 1 - anim.deathProgress;
          ctx.rotate(anim.deathProgress * 1.2);
        }

        // Selected glow
        if (isSelected) {
          const glowPulse = 0.4 + Math.sin(timestamp * 0.005) * 0.2;
          ctx.beginPath();
          ctx.arc(0, -bobY, size + 5, 0, Math.PI * 2);
          ctx.fillStyle = teamColor + Math.floor(glowPulse * 255).toString(16).padStart(2, '0');
          ctx.fill();
        }

        // Unit shadow (squashes with bob)
        const shadowSquash = 1 - Math.abs(bobY) * 0.04;
        ctx.beginPath();
        ctx.ellipse(0, size * 0.6 - bobY, size * 0.7, size * 0.25 * shadowSquash, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // ── Legs (drawn behind body) ──
        ctx.fillStyle = '#3a3a3a';
        // Left leg
        ctx.fillRect(-size * 0.35, size * 0.35 + leftLegOffset * 0.5, size * 0.28, size * 0.4);
        // Right leg
        ctx.fillRect(size * 0.08, size * 0.35 + rightLegOffset * 0.5, size * 0.28, size * 0.4);

        // Boots — pixel detail
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(-size * 0.38, size * 0.7 + leftLegOffset * 0.5, size * 0.34, size * 0.12);
        ctx.fillRect(size * 0.05, size * 0.7 + rightLegOffset * 0.5, size * 0.34, size * 0.12);

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

        // Weapon (right side, swings with arm)
        ctx.save();
        ctx.translate(size * 0.4, -size * 0.1 + armSwing);
        ctx.fillStyle = '#555';
        ctx.fillRect(-size * 0.07, -size * 0.4, size * 0.15, size * 0.8);
        ctx.restore();

        // Class indicator
        if (unit.unitClass === 'medic') {
          ctx.fillStyle = '#fff';
          ctx.fillRect(-size * 0.12, -size * 0.4, size * 0.24, size * 0.08);
          ctx.fillRect(-size * 0.04, -size * 0.5, size * 0.08, size * 0.28);
        }

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
