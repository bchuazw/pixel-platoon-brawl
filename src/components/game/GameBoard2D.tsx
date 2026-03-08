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

// ── Isometric constants ──
const TILE_W = 52;  // diamond width — slightly larger for readability
const TILE_H = 26;  // diamond height
const ELEV_SCALE = 10; // pixels per elevation unit
const UNIT_H = 28;  // unit sprite height

// ── Isometric transform: grid → screen ──
function toIso(gx: number, gz: number, elev: number = 0): { sx: number; sy: number } {
  return {
    sx: (gx - gz) * (TILE_W / 2),
    sy: (gx + gz) * (TILE_H / 2) - elev * ELEV_SCALE,
  };
}

// ── Reverse: screen → grid (approximate, ignores elevation) ──
function fromIso(sx: number, sy: number): { gx: number; gz: number } {
  const gx = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
  const gz = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  return { gx: Math.floor(gx), gz: Math.floor(gz) };
}

// ── Tile color palette — rich & warm FFT-inspired ──
const TILE_PALETTE: Record<string, { top: string; left: string; right: string }> = {
  grass:  { top: '#5d9e4a', left: '#3d6e30', right: '#4d8e3a' },
  dirt:   { top: '#9a8458', left: '#7a6840', right: '#8a7448' },
  stone:  { top: '#8a8a90', left: '#626268', right: '#727278' },
  water:  { top: '#3a7ab8', left: '#2a5a98', right: '#306aa8' },
  sand:   { top: '#d4b468', left: '#b09448', right: '#c0a458' },
  wall:   { top: '#686870', left: '#4a4a52', right: '#5a5a62' },
  trench: { top: '#6a5840', left: '#4a3c28', right: '#5a4830' },
};

// ── Noise for tile variation ──
function tileNoise(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

// ── Draw an isometric diamond tile (top face + side faces for elevation) ──
function drawIsoTile(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  colors: { top: string; left: string; right: string },
  elevation: number,
  outOfZone: boolean,
  highlight?: string,
  tileType?: string,
  noiseVal?: number,
) {
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  const sideH = Math.max(elevation * ELEV_SCALE, 3);

  if (outOfZone) {
    drawDiamond(ctx, sx, sy, hw, hh, '#2a1212');
    drawLeftFace(ctx, sx, sy, hw, hh, sideH, '#1a0a0a');
    drawRightFace(ctx, sx, sy, hw, hh, sideH, '#200e0e');
    return;
  }

  // Side faces
  drawLeftFace(ctx, sx, sy, hw, hh, sideH, colors.left);
  drawRightFace(ctx, sx, sy, hw, hh, sideH, colors.right);

  // Top face
  drawDiamond(ctx, sx, sy, hw, hh, colors.top);

  // Subtle noise variation on top face (not decoration — just color variation)
  if (noiseVal !== undefined && tileType === 'grass') {
    if (noiseVal > 0.7) {
      drawDiamond(ctx, sx, sy, hw, hh, 'rgba(80,140,60,0.12)');
    } else if (noiseVal < 0.25) {
      drawDiamond(ctx, sx, sy, hw, hh, 'rgba(40,60,20,0.08)');
    }
  } else if (noiseVal !== undefined && tileType === 'dirt' && noiseVal > 0.75) {
    drawDiamond(ctx, sx, sy, hw, hh, 'rgba(60,50,30,0.08)');
  }

  // Highlight overlay
  if (highlight) {
    drawDiamond(ctx, sx, sy, hw, hh, highlight);
  }
}

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.fill();
}

function drawLeftFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number, sideH: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, cy + hh + sideH);
  ctx.lineTo(cx - hw, cy + sideH);
  ctx.closePath();
  ctx.fill();
}

function drawRightFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number, sideH: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, cy + hh + sideH);
  ctx.lineTo(cx + hw, cy + sideH);
  ctx.closePath();
  ctx.fill();
}

// ── Draw isometric prop on tile — simplified, cleaner shapes ──
function drawIsoProp(ctx: CanvasRenderingContext2D, prop: string, sx: number, sy: number) {
  ctx.save();
  switch (prop) {
    case 'tree': {
      ctx.fillStyle = '#4a3418';
      ctx.fillRect(sx - 2, sy - 16, 4, 16);
      ctx.fillStyle = '#2e7a20';
      ctx.beginPath(); ctx.arc(sx, sy - 22, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a9a2c';
      ctx.beginPath(); ctx.arc(sx - 2, sy - 25, 7, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'rock': {
      ctx.fillStyle = '#6a6a6e';
      ctx.beginPath();
      ctx.moveTo(sx - 7, sy); ctx.lineTo(sx - 4, sy - 9); ctx.lineTo(sx + 4, sy - 10);
      ctx.lineTo(sx + 7, sy - 3); ctx.lineTo(sx + 5, sy + 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7e7e82';
      ctx.fillRect(sx - 3, sy - 8, 4, 2);
      break;
    }
    case 'crate': {
      ctx.fillStyle = '#a07028';
      ctx.fillRect(sx - 6, sy - 12, 12, 12);
      ctx.fillStyle = '#b88838';
      ctx.fillRect(sx - 6, sy - 12, 12, 2);
      ctx.fillStyle = '#885818';
      ctx.fillRect(sx - 1, sy - 12, 2, 12);
      break;
    }
    case 'sandbag': {
      ctx.fillStyle = '#a09060';
      ctx.beginPath(); ctx.ellipse(sx, sy - 4, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b0a070';
      ctx.beginPath(); ctx.ellipse(sx, sy - 7, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bush': {
      ctx.fillStyle = '#2a6820';
      ctx.beginPath(); ctx.arc(sx, sy - 5, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a8430';
      ctx.beginPath(); ctx.arc(sx - 2, sy - 7, 5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'barrel': {
      ctx.fillStyle = '#5a4020';
      ctx.fillRect(sx - 5, sy - 11, 10, 11);
      ctx.fillStyle = '#725030';
      ctx.beginPath(); ctx.ellipse(sx, sy - 11, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#444';
      ctx.fillRect(sx - 5, sy - 8, 10, 1.5);
      break;
    }
    case 'ruins': {
      ctx.fillStyle = '#606060';
      ctx.fillRect(sx - 7, sy - 14, 5, 14);
      ctx.fillRect(sx + 2, sy - 9, 5, 9);
      ctx.fillStyle = '#707070';
      ctx.fillRect(sx - 7, sy - 14, 5, 2);
      break;
    }
    case 'wire': {
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx - 8, sy - 3);
      for (let i = 0; i < 4; i++) ctx.lineTo(sx - 8 + (i + 0.5) * 4, sy - 3 + (i % 2 === 0 ? -2 : 2));
      ctx.lineTo(sx + 8, sy - 2); ctx.stroke();
      break;
    }
    case 'jersey_barrier': {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(sx - 9, sy - 5, 18, 5);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(sx - 9, sy - 5, 18, 1.5);
      break;
    }
    case 'burnt_vehicle': {
      ctx.fillStyle = '#333';
      ctx.fillRect(sx - 10, sy - 7, 20, 7);
      ctx.fillStyle = '#282828';
      ctx.fillRect(sx - 7, sy - 12, 12, 6);
      break;
    }
    case 'foxhole': {
      ctx.fillStyle = '#4a3828';
      ctx.beginPath(); ctx.ellipse(sx, sy - 2, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#362818';
      ctx.beginPath(); ctx.ellipse(sx, sy - 2, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'hesco': {
      ctx.fillStyle = '#7a7a58';
      ctx.fillRect(sx - 7, sy - 9, 6, 9);
      ctx.fillRect(sx + 1, sy - 9, 6, 9);
      break;
    }
    case 'tank_trap': {
      ctx.strokeStyle = '#606060';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 6, sy + 1); ctx.lineTo(sx + 6, sy - 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + 6, sy + 1); ctx.lineTo(sx - 6, sy - 9); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - w / 2, cy + h);
  ctx.lineTo(cx + w / 2, cy + h);
  ctx.closePath();
  ctx.fill();
}

// ── Draw chunky isometric soldier ──
function drawUnit(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  unit: Unit,
  isSelected: boolean,
  flash: number,
  walkCycle: number,
  isMoving: boolean,
  deathProgress: number,
  timestamp: number,
) {
  const tc = TEAM_COLORS[unit.team];
  const s = 1; // scale factor

  ctx.save();
  ctx.translate(sx, sy);

  // Death
  if (!unit.isAlive) {
    ctx.globalAlpha = 1 - deathProgress;
    ctx.translate(0, deathProgress * 6);
    ctx.scale(1, 1 - deathProgress * 0.4);
  }

  // Walk bob
  const bob = isMoving ? Math.sin(walkCycle * 2) * 2.5 : 0;
  const lean = isMoving ? Math.sin(walkCycle) * 0.04 : 0;
  ctx.translate(0, bob);
  ctx.rotate(lean);

  // Leg animation
  const legL = isMoving ? Math.sin(walkCycle) * 4 : 0;
  const legR = isMoving ? Math.sin(walkCycle + Math.PI) * 4 : 0;
  const armSwing = isMoving ? Math.sin(walkCycle + Math.PI) * 3 : 0;

  // ── Selected pulse ring ──
  if (isSelected) {
    const pulse = 0.5 + Math.sin(timestamp * 0.006) * 0.3;
    ctx.strokeStyle = tc;
    ctx.globalAlpha = (ctx.globalAlpha || 1) * pulse;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4, 14, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = unit.isAlive ? 1 : (1 - deathProgress);
  }

  // ── Shadow ──
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 4 - bob, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Flash white on hit
  const bodyColor = flash > 0.3 ? '#ffffff' : flash > 0 ? '#ffaaaa' : tc;
  const darkColor = flash > 0.3 ? '#dddddd' : flash > 0 ? '#dd8888' : darken(tc, 0.3);

  // ── Boots ──
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-6, -2 + legL, 5, 4);
  ctx.fillRect(1, -2 + legR, 5, 4);

  // ── Legs ──
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(-5, -6 + legL, 4, 6);
  ctx.fillRect(1, -6 + legR, 4, 6);

  // ── Body / armor ──
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-7, -20, 14, 15);
  // Armor plate highlight
  ctx.fillStyle = darken(bodyColor, -0.15);
  ctx.fillRect(-7, -20, 14, 3);
  // Belt
  ctx.fillStyle = '#444';
  ctx.fillRect(-7, -6, 14, 2);

  // ── Arms ──
  ctx.fillStyle = darkColor;
  ctx.fillRect(-9, -18 + armSwing * 0.5, 3, 10);
  ctx.fillRect(6, -18 - armSwing * 0.5, 3, 10);

  // ── Weapon (rifle on right arm) ──
  ctx.fillStyle = '#555';
  ctx.fillRect(7, -22 - armSwing * 0.3, 3, 14);
  ctx.fillStyle = '#777';
  ctx.fillRect(7, -22 - armSwing * 0.3, 3, 2); // barrel end

  // ── Head ──
  ctx.fillStyle = '#ddc0a0';
  ctx.fillRect(-4, -26, 8, 7);

  // ── Helmet ──
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-5, -29, 10, 5);
  ctx.fillStyle = darkColor;
  ctx.fillRect(-5, -25, 10, 2); // brim

  // ── Class badge ──
  if (unit.unitClass === 'medic') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-3, -16, 6, 2);
    ctx.fillRect(-1, -18, 2, 6);
  }

  // ── HP bar ──
  const barW = 18;
  const barH = 3;
  const barY = -33;
  ctx.fillStyle = '#000000cc';
  ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
  const hpPct = unit.hp / unit.maxHp;
  ctx.fillStyle = hpPct > 0.5 ? '#44dd44' : hpPct > 0.25 ? '#ddaa22' : '#dd3322';
  ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);

  // ── Name label ──
  ctx.fillStyle = '#ffffffcc';
  ctx.font = 'bold 7px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(unit.name, 0, barY - 3);

  // ── Status icons ──
  if (unit.isOnOverwatch) {
    ctx.fillStyle = '#4488ff';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('👁', 0, -38);
  }
  if (unit.coverType === 'full') {
    ctx.fillStyle = '#4488ff';
    ctx.font = '7px monospace';
    ctx.fillText('🛡', 10, -20);
  } else if (unit.coverType === 'half') {
    ctx.fillStyle = '#88aa44';
    ctx.font = '7px monospace';
    ctx.fillText('◐', 10, -20);
  }

  ctx.restore();
}

function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `rgb(${Math.max(0, Math.min(255, Math.floor(r * f)))},${Math.max(0, Math.min(255, Math.floor(g * f)))},${Math.max(0, Math.min(255, Math.floor(b * f)))})`;
}

// ── Terrain detail decorations ──
function drawTileDecor(ctx: CanvasRenderingContext2D, type: string, sx: number, sy: number, variant: number) {
  const n = tileNoise(sx, sy, 42);
  if (type === 'grass') {
    ctx.fillStyle = '#6aaa55';
    if (n > 0.5) { ctx.fillRect(sx - 8, sy - 3, 2, 3); ctx.fillRect(sx - 6, sy - 4, 2, 4); }
    if (n > 0.7) { ctx.fillRect(sx + 5, sy - 2, 2, 3); }
    if (n < 0.3) {
      ctx.fillStyle = '#c8b040';
      ctx.fillRect(sx + 3 + n * 4, sy - 2, 2, 2); // flower
    }
  } else if (type === 'dirt') {
    ctx.fillStyle = '#786040';
    if (n > 0.4) ctx.fillRect(sx - 4, sy - 1, 3, 2);
    if (n > 0.6) ctx.fillRect(sx + 3, sy + 1, 2, 2);
  } else if (type === 'water') {
    const shimmer = Math.sin(variant * 0.01 + sx * 0.1) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(120,200,255,${shimmer * 0.2})`;
    ctx.fillRect(sx - 6, sy - 1, 8, 1);
    ctx.fillRect(sx + 2, sy + 1, 6, 1);
  }
}

// ── Unit animation state ──
interface UnitAnim {
  x: number; z: number;
  flash: number;
  walkCycle: number;
  isMoving: boolean;
  deathProgress: number;
}

// ── Floating text ──
interface FloatText {
  id: string;
  gx: number; gz: number;
  text: string; color: string;
  age: number;
  isCrit: boolean;
}

// ── Screen shake state ──
interface ShakeState {
  intensity: number;
  offsetX: number;
  offsetY: number;
}

// ── Dust particle ──
interface DustParticle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
}

export function GameBoard2D({ state, onTileClick, onUnitClick, onTileHover, onMoveComplete }: GameBoard2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1.2 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  const unitAnims = useRef<Record<string, UnitAnim>>({});
  const floatTexts = useRef<FloatText[]>([]);
  const dustParticles = useRef<DustParticle[]>([]);
  const shake = useRef<ShakeState>({ intensity: 0, offsetX: 0, offsetY: 0 });
  const lastEventCount = useRef(0);
  const animFrameId = useRef(0);
  const lastTime = useRef(0);
  const freezeFrame = useRef(0); // impact freeze in ms

  const movableSet = useMemo(() => new Set(state.movableTiles.map(t => `${t.x},${t.z}`)), [state.movableTiles]);
  const attackableSet = useMemo(() => new Set(state.attackableTiles.map(t => `${t.x},${t.z}`)), [state.attackableTiles]);
  const abilitySet = useMemo(() => new Set(state.abilityTargetTiles.map(t => `${t.x},${t.z}`)), [state.abilityTargetTiles]);

  // Init unit anims
  useEffect(() => {
    for (const unit of state.units) {
      if (!unitAnims.current[unit.id]) {
        unitAnims.current[unit.id] = {
          x: unit.position.x, z: unit.position.z,
          flash: 0, walkCycle: 0, isMoving: false,
          deathProgress: unit.isAlive ? 0 : 1,
        };
      }
    }
  }, [state.units]);

  // Process combat events
  useEffect(() => {
    if (state.combatEvents.length <= lastEventCount.current) return;
    const newEvents = state.combatEvents.slice(lastEventCount.current);
    lastEventCount.current = state.combatEvents.length;

    for (const evt of newEvents) {
      if (Date.now() - evt.timestamp > 1000) continue;

      // Flash target
      const target = state.units.find(u =>
        u.position.x === evt.targetPos.x && u.position.z === evt.targetPos.z
      );
      if (target && unitAnims.current[target.id]) {
        unitAnims.current[target.id].flash = 1;
      }

      // Screen shake
      if (evt.type === 'kill') {
        shake.current.intensity = Math.max(shake.current.intensity, 8);
        freezeFrame.current = 120; // 120ms freeze
      } else if (evt.type === 'crit') {
        shake.current.intensity = Math.max(shake.current.intensity, 5);
        freezeFrame.current = 60;
      } else if (evt.type === 'damage') {
        shake.current.intensity = Math.max(shake.current.intensity, 2);
      }

      // Float text
      let text = '', color = '#fff';
      const isCrit = evt.type === 'crit';
      if (evt.type === 'damage') { text = `-${evt.value}`; color = '#ff4444'; }
      else if (evt.type === 'crit') { text = `CRIT! -${evt.value}`; color = '#ff8800'; }
      else if (evt.type === 'miss') { text = 'MISS'; color = '#888'; }
      else if (evt.type === 'kill') { text = '☠ KILL'; color = '#ff2222'; }
      else if (evt.type === 'heal') { text = `+${evt.value}`; color = '#44dd44'; }
      else if (evt.type === 'loot') { text = evt.message.slice(0, 20); color = '#ffcc44'; }

      if (text) {
        floatTexts.current.push({
          id: evt.id, gx: evt.targetPos.x, gz: evt.targetPos.z,
          text, color, age: 0, isCrit,
        });
      }
    }
  }, [state.combatEvents, state.units]);

  // Center camera
  useEffect(() => {
    const center = toIso(GRID_SIZE / 2, GRID_SIZE / 2, 0);
    setCamera(prev => ({ ...prev, x: center.sx, y: center.sy - 100 }));
  }, []);

  // Auto-follow active unit
  useEffect(() => {
    if (!state.autoPlay || !state.selectedUnitId) return;
    const unit = state.units.find(u => u.id === state.selectedUnitId);
    if (!unit) return;
    const tile = state.grid[unit.position.x]?.[unit.position.z];
    const elev = tile?.elevation || 0;
    const target = toIso(unit.position.x, unit.position.z, elev);
    setCamera(prev => ({
      ...prev,
      x: prev.x + (target.sx - prev.x) * 0.06,
      y: prev.y + (target.sy - 60 - prev.y) * 0.06,
    }));
  }, [state.selectedUnitId, state.units, state.autoPlay, state.grid]);

  // ── Main render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let running = true;

    function render(timestamp: number) {
      if (!running || !ctx || !canvas) return;
      const rawDt = Math.min((timestamp - lastTime.current) / 1000, 0.05);
      lastTime.current = timestamp;

      // Impact freeze
      if (freezeFrame.current > 0) {
        freezeFrame.current -= rawDt * 1000;
        animFrameId.current = requestAnimationFrame(render);
        return; // skip frame — freeze effect
      }
      const dt = rawDt;

      const container = containerRef.current;
      if (!container) { animFrameId.current = requestAnimationFrame(render); return; }
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      ctx.save();
      ctx.scale(devicePixelRatio, devicePixelRatio);
      const w = rect.width;
      const h = rect.height;

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#1a2030');
      bgGrad.addColorStop(1, '#0a1018');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Screen shake
      if (shake.current.intensity > 0.1) {
        shake.current.offsetX = (Math.random() - 0.5) * shake.current.intensity;
        shake.current.offsetY = (Math.random() - 0.5) * shake.current.intensity;
        shake.current.intensity *= 0.88;
      } else {
        shake.current.offsetX = 0;
        shake.current.offsetY = 0;
      }

      // Camera transform
      ctx.save();
      ctx.translate(w / 2 + shake.current.offsetX, h / 2 + shake.current.offsetY);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      // ── Sort tiles back-to-front for painter's algorithm ──
      // In iso, draw row by row: x+z ascending, then x ascending
      const drawOrder: Array<{ x: number; z: number; tile: TileData }> = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const tile = state.grid[x]?.[z];
          if (tile) drawOrder.push({ x, z, tile });
        }
      }
      drawOrder.sort((a, b) => (a.x + a.z) - (b.x + b.z) || a.x - b.x);

      // Build unit position map for drawing units on their tiles
      const unitMap = new Map<string, Unit>();
      for (const u of state.units) {
        if (u.isAlive) {
          const anim = unitAnims.current[u.id];
          const ux = anim ? Math.round(anim.x) : u.position.x;
          const uz = anim ? Math.round(anim.z) : u.position.z;
          unitMap.set(`${ux},${uz}`, u);
        }
      }

      // ── Draw tiles + props + units in depth order ──
      for (const { x, z, tile } of drawOrder) {
        const outOfZone = state.shrinkLevel > 0 && !isInZone(x, z, state.shrinkLevel);
        const colors = TILE_PALETTE[tile.type] || TILE_PALETTE.grass;
        const { sx, sy } = toIso(x, z, tile.elevation);

        // Highlight
        const key = `${x},${z}`;
        let highlight: string | undefined;
        if (movableSet.has(key)) highlight = 'rgba(68,136,255,0.25)';
        if (attackableSet.has(key)) highlight = 'rgba(255,68,68,0.3)';
        if (abilitySet.has(key)) highlight = 'rgba(68,204,68,0.25)';

        // Draw tile
        drawIsoTile(ctx, sx, sy, colors, tile.elevation, outOfZone, highlight);

        // Tile edge outline
        ctx.strokeStyle = outOfZone ? '#1a0808' : 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        const hw = TILE_W / 2, hh = TILE_H / 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - hh); ctx.lineTo(sx + hw, sy); ctx.lineTo(sx, sy + hh); ctx.lineTo(sx - hw, sy); ctx.closePath();
        ctx.stroke();

        // Terrain decorations
        if (!outOfZone && !tile.prop) {
          drawTileDecor(ctx, tile.type, sx, sy, tile.variant);
        }

        // Smoke
        if (tile.hasSmoke) {
          ctx.fillStyle = 'rgba(180,200,220,0.3)';
          drawDiamond(ctx, sx, sy, hw, hh, 'rgba(180,200,220,0.3)');
        }

        // Loot glow
        if (tile.loot) {
          const lootPulse = 0.4 + Math.sin(timestamp * 0.004 + x + z) * 0.3;
          drawDiamond(ctx, sx, sy, hw * 0.5, hh * 0.5, `rgba(255,204,68,${lootPulse})`);
          ctx.fillStyle = '#ffcc44';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', sx, sy - 6);
        }

        // Props
        if (tile.prop) {
          drawIsoProp(ctx, tile.prop, sx, sy - 2);
        }

        // ── Draw unit on this tile ──
        const unitOnTile = unitMap.get(key);
        if (unitOnTile) {
          const anim = unitAnims.current[unitOnTile.id];
          if (anim) {
            // Interpolate position in iso space
            const dx = unitOnTile.position.x - anim.x;
            const dz = unitOnTile.position.z - anim.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            anim.isMoving = dist > 0.05;
            anim.x += dx * 0.12;
            anim.z += dz * 0.12;

            if (anim.isMoving) {
              anim.walkCycle += dt * 12;
              // Dust particles
              if (Math.floor(anim.walkCycle * 2) !== Math.floor((anim.walkCycle - dt * 12) * 2)) {
                for (let i = 0; i < 2; i++) {
                  dustParticles.current.push({
                    x: sx + (Math.random() - 0.5) * 8,
                    y: sy + 2 + Math.random() * 3,
                    vx: (Math.random() - 0.5) * 20,
                    vy: -(Math.random() * 15 + 5),
                    life: 0, maxLife: 0.35 + Math.random() * 0.2,
                    size: 2 + Math.random() * 2,
                  });
                }
              }
            } else {
              anim.walkCycle *= 0.85;
            }

            if (anim.flash > 0) anim.flash = Math.max(0, anim.flash - dt * 3.5);
            if (!unitOnTile.isAlive && anim.deathProgress < 1) {
              anim.deathProgress = Math.min(1, anim.deathProgress + dt * 1.5);
            }

            // Get interpolated iso position
            const elev = tile.elevation;
            const unitIso = toIso(anim.x, anim.z, elev);

            drawUnit(ctx, unitIso.sx, unitIso.sy - 4, unitOnTile,
              unitOnTile.id === state.selectedUnitId,
              anim.flash, anim.walkCycle, anim.isMoving,
              anim.deathProgress, timestamp);
          }
        }
      }

      // ── Also draw dead units fading out ──
      for (const unit of state.units) {
        if (unit.isAlive) continue;
        const anim = unitAnims.current[unit.id];
        if (!anim || anim.deathProgress >= 1) continue;
        anim.deathProgress = Math.min(1, anim.deathProgress + dt * 1.5);
        const tile = state.grid[Math.round(anim.x)]?.[Math.round(anim.z)];
        const elev = tile?.elevation || 0;
        const unitIso = toIso(anim.x, anim.z, elev);
        drawUnit(ctx, unitIso.sx, unitIso.sy - 4, unit, false, anim.flash, 0, false, anim.deathProgress, timestamp);
      }

      // ── Zone border (iso diamond) ──
      if (state.shrinkLevel > 0) {
        const m = state.shrinkLevel * 2;
        const pulse = 0.5 + Math.sin(timestamp * 0.003) * 0.3;
        ctx.strokeStyle = `rgba(255,34,34,${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 5]);
        const c1 = toIso(m, m, 0);
        const c2 = toIso(GRID_SIZE - m, m, 0);
        const c3 = toIso(GRID_SIZE - m, GRID_SIZE - m, 0);
        const c4 = toIso(m, GRID_SIZE - m, 0);
        ctx.beginPath();
        ctx.moveTo(c1.sx, c1.sy);
        ctx.lineTo(c2.sx, c2.sy);
        ctx.lineTo(c3.sx, c3.sy);
        ctx.lineTo(c4.sx, c4.sy);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Dust particles ──
      dustParticles.current = dustParticles.current.filter(p => p.life < p.maxLife);
      for (const p of dustParticles.current) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 30 * dt;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.fillStyle = `rgba(180,160,130,${alpha * 0.5})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }

      // ── Combat tracer lines ──
      const recentHits = state.combatEvents.filter(e =>
        (e.type === 'damage' || e.type === 'crit') && Date.now() - e.timestamp < 500
      );
      for (const evt of recentHits) {
        const age = (Date.now() - evt.timestamp) / 500;
        const aTile = state.grid[evt.attackerPos.x]?.[evt.attackerPos.z];
        const tTile = state.grid[evt.targetPos.x]?.[evt.targetPos.z];
        const a = toIso(evt.attackerPos.x, evt.attackerPos.z, aTile?.elevation || 0);
        const t = toIso(evt.targetPos.x, evt.targetPos.z, tTile?.elevation || 0);

        ctx.save();
        ctx.globalAlpha = (1 - age) * 0.8;

        // Tracer line
        ctx.strokeStyle = evt.type === 'crit' ? '#ffaa00' : '#ff6644';
        ctx.lineWidth = evt.type === 'crit' ? 3 : 2;
        ctx.shadowColor = evt.type === 'crit' ? '#ffaa00' : '#ff4422';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy - UNIT_H);
        ctx.lineTo(t.sx, t.sy - UNIT_H);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Muzzle flash
        if (age < 0.2) {
          const flashSize = (1 - age / 0.2) * (evt.type === 'crit' ? 10 : 6);
          ctx.fillStyle = '#ffffaa';
          ctx.beginPath();
          ctx.arc(a.sx, a.sy - UNIT_H, flashSize, 0, Math.PI * 2);
          ctx.fill();
        }

        // Impact spark
        if (age < 0.3) {
          const sparkSize = (1 - age / 0.3) * 8;
          ctx.fillStyle = '#ffcc44';
          ctx.beginPath();
          ctx.arc(t.sx, t.sy - UNIT_H / 2, sparkSize, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // ── Floating damage text ──
      floatTexts.current = floatTexts.current.filter(ft => ft.age < 2);
      for (const ft of floatTexts.current) {
        ft.age += dt;
        const tile = state.grid[ft.gx]?.[ft.gz];
        const elev = tile?.elevation || 0;
        const iso = toIso(ft.gx, ft.gz, elev);
        const floatY = ft.age * 35;
        const alpha = Math.max(0, 1 - ft.age / 2);
        const scale = ft.isCrit ? 1.4 : 1;
        const bounce = ft.age < 0.15 ? (1 + Math.sin(ft.age / 0.15 * Math.PI) * 0.3) : 1;

        ctx.save();
        ctx.translate(iso.sx, iso.sy - UNIT_H - floatY);
        ctx.scale(scale * bounce, scale * bounce);
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${ft.isCrit ? 14 : 11}px 'Share Tech Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Shadow
        ctx.fillStyle = '#000';
        ctx.fillText(ft.text, 1, 1);
        // Main
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, 0, 0);
        ctx.restore();
      }

      // ── Kill cam glow ──
      if (state.killCam) {
        const kTile = state.grid[state.killCam.targetPos.x]?.[state.killCam.targetPos.z];
        const kIso = toIso(state.killCam.targetPos.x, state.killCam.targetPos.z, kTile?.elevation || 0);
        const grad = ctx.createRadialGradient(kIso.sx, kIso.sy, 0, kIso.sx, kIso.sy, 80);
        grad.addColorStop(0, 'rgba(255,40,20,0.3)');
        grad.addColorStop(1, 'rgba(255,40,20,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(kIso.sx - 80, kIso.sy - 80, 160, 160);
      }

      ctx.restore(); // camera
      ctx.restore(); // DPR

      animFrameId.current = requestAnimationFrame(render);
    }

    animFrameId.current = requestAnimationFrame(render);
    return () => { running = false; cancelAnimationFrame(animFrameId.current); };
  }, [state, camera, movableSet, attackableSet, abilitySet]);

  // ── Mouse → iso grid ──
  const screenToGrid = useCallback((clientX: number, clientY: number): Position | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const sx = (clientX - rect.left - rect.width / 2) / camera.zoom + camera.x;
    const sy = (clientY - rect.top - rect.height / 2) / camera.zoom + camera.y;
    const { gx, gz } = fromIso(sx, sy);
    if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return null;
    return { x: gx, z: gz };
  }, [camera]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, camX: camera.x, camY: camera.y };
  }, [camera]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
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
    const pos = screenToGrid(e.clientX, e.clientY);
    onTileHover(pos);
  }, [screenToGrid, onTileHover]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) { isDragging.current = false; return; }
    const pos = screenToGrid(e.clientX, e.clientY);
    if (!pos) return;
    const clickedUnit = state.units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z);
    if (clickedUnit) onUnitClick(clickedUnit.id);
    else onTileClick(pos);
  }, [screenToGrid, state.units, onUnitClick, onTileClick]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(0.5, Math.min(3, prev.zoom * (e.deltaY < 0 ? 1.1 : 0.9))),
    }));
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-background" onContextMenu={e => e.preventDefault()}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Kill cam overlay */}
      {state.killCam && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-[11%] bg-black transition-all duration-500" />
          <div className="absolute bottom-0 left-0 right-0 h-[11%] bg-black transition-all duration-500" />
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.65) 100%)',
          }} />
          <div className="absolute inset-0 opacity-20" style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(200,30,0,0.3) 100%)',
          }} />
          <div className="absolute bottom-[13%] left-8 animate-fade-in flex items-center gap-3">
            <div className="w-1.5 h-12 bg-destructive rounded-full" />
            <div>
              <div className="text-[9px] tracking-[0.5em] text-destructive/90 font-mono uppercase">ELIMINATED</div>
              <div className="text-3xl font-black text-foreground tracking-wide"
                style={{ textShadow: '0 0 25px rgba(255,50,50,0.5), 0 2px 6px rgba(0,0,0,0.8)' }}>
                {state.killCam.victimName}
              </div>
              <div className="text-[10px] tracking-[0.2em] text-muted-foreground/80 font-mono mt-0.5">
                ▸ {state.killCam.killerName}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
