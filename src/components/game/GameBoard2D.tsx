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

// ── Top-down constants ──
const TILE_SIZE = 24;
const UNIT_RADIUS = 9;

// ── Terrain colors — muted, warm military tones ──
const TERRAIN_COLORS: Record<string, string> = {
  grass:  '#3a4a2e',
  dirt:   '#5a4d3a',
  stone:  '#4a4a50',
  water:  '#2a4a6a',
  sand:   '#7a6d4a',
  wall:   '#3a3a42',
  trench: '#4a3d2a',
};

const TERRAIN_COLORS_LIGHT: Record<string, string> = {
  grass:  '#4a5a3e',
  dirt:   '#6a5d4a',
  stone:  '#5a5a60',
  water:  '#3a5a7a',
  sand:   '#8a7d5a',
  wall:   '#4a4a52',
  trench: '#5a4d3a',
};

// ── Prop colors ──
const PROP_COLOR = '#2a2a30';
const PROP_COVER_COLOR = '#3a3a44';

// ── Class icons (simple Unicode) ──
const CLASS_ICONS: Record<string, string> = {
  soldier: '⚔',
  medic: '✚',
};

// ── Noise helper ──
function tileNoise(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ── Unit animation state ──
interface UnitAnim {
  x: number; z: number;
  flash: number;
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

// ── Projectile trail ──
interface Trail {
  fromX: number; fromZ: number;
  toX: number; toZ: number;
  age: number; maxAge: number;
  color: string;
  isCrit: boolean;
}

// ── Impact ring ──
interface ImpactRing {
  x: number; z: number;
  age: number; maxAge: number;
  color: string;
  maxRadius: number;
}

// ── Screen shake state ──
interface ShakeState {
  intensity: number;
  offsetX: number;
  offsetY: number;
}

export function GameBoard2D({ state, onTileClick, onUnitClick, onTileHover, onMoveComplete }: GameBoard2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [camera, setCamera] = useState({ x: GRID_SIZE * TILE_SIZE / 2, y: GRID_SIZE * TILE_SIZE / 2, zoom: 1.8 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  const unitAnims = useRef<Record<string, UnitAnim>>({});
  const floatTexts = useRef<FloatText[]>([]);
  const trails = useRef<Trail[]>([]);
  const impacts = useRef<ImpactRing[]>([]);
  const shake = useRef<ShakeState>({ intensity: 0, offsetX: 0, offsetY: 0 });
  const lastEventCount = useRef(0);
  const animFrameId = useRef(0);
  const lastTime = useRef(0);
  const freezeFrame = useRef(0);
  const screenFlash = useRef({ intensity: 0, color: '#ffffff' });

  const movableSet = useMemo(() => new Set(state.movableTiles.map(t => `${t.x},${t.z}`)), [state.movableTiles]);
  const attackableSet = useMemo(() => new Set(state.attackableTiles.map(t => `${t.x},${t.z}`)), [state.attackableTiles]);
  const abilitySet = useMemo(() => new Set(state.abilityTargetTiles.map(t => `${t.x},${t.z}`)), [state.abilityTargetTiles]);

  // Init unit anims
  useEffect(() => {
    for (const unit of state.units) {
      if (!unitAnims.current[unit.id]) {
        unitAnims.current[unit.id] = {
          x: unit.position.x, z: unit.position.z,
          flash: 0, deathProgress: unit.isAlive ? 0 : 1,
        };
      }
    }
  }, [state.units]);

  // Process combat events → VFX
  useEffect(() => {
    if (state.combatEvents.length <= lastEventCount.current) return;
    const newEvents = state.combatEvents.slice(lastEventCount.current);
    lastEventCount.current = state.combatEvents.length;

    for (const evt of newEvents) {
      if (Date.now() - evt.timestamp > 1000) continue;

      // Flash target unit
      const target = state.units.find(u =>
        u.position.x === evt.targetPos.x && u.position.z === evt.targetPos.z
      );
      if (target && unitAnims.current[target.id]) {
        unitAnims.current[target.id].flash = 1;
      }

      // Screen shake
      if (evt.type === 'kill') {
        shake.current.intensity = Math.max(shake.current.intensity, 10);
        freezeFrame.current = 100;
        screenFlash.current = { intensity: 0.4, color: '#ff2222' };
      } else if (evt.type === 'crit') {
        shake.current.intensity = Math.max(shake.current.intensity, 6);
        freezeFrame.current = 50;
        screenFlash.current = { intensity: 0.2, color: '#ffffff' };
      } else if (evt.type === 'damage') {
        shake.current.intensity = Math.max(shake.current.intensity, 3);
      }

      // Projectile trail
      if (evt.type === 'damage' || evt.type === 'crit' || evt.type === 'miss') {
        trails.current.push({
          fromX: evt.attackerPos.x, fromZ: evt.attackerPos.z,
          toX: evt.targetPos.x, toZ: evt.targetPos.z,
          age: 0, maxAge: 0.4,
          color: evt.type === 'crit' ? '#ffaa00' : evt.type === 'miss' ? '#666666' : '#ff6644',
          isCrit: evt.type === 'crit',
        });
      }

      // Impact ring
      if (evt.type === 'damage' || evt.type === 'crit' || evt.type === 'kill') {
        impacts.current.push({
          x: evt.targetPos.x, z: evt.targetPos.z,
          age: 0, maxAge: 0.5,
          color: evt.type === 'kill' ? '#ff2222' : evt.type === 'crit' ? '#ffaa00' : '#ff6644',
          maxRadius: evt.type === 'kill' ? 30 : evt.type === 'crit' ? 22 : 15,
        });
      }

      // Float text
      let text = '', color = '#fff';
      const isCrit = evt.type === 'crit';
      if (evt.type === 'damage') { text = `-${evt.value}`; color = '#ff4444'; }
      else if (evt.type === 'crit') { text = `CRIT -${evt.value}`; color = '#ff8800'; }
      else if (evt.type === 'miss') { text = 'MISS'; color = '#666'; }
      else if (evt.type === 'kill') { text = 'ELIMINATED'; color = '#ff2222'; }
      else if (evt.type === 'heal') { text = `+${evt.value}`; color = '#44dd44'; }
      else if (evt.type === 'loot') { text = evt.message.slice(0, 16); color = '#ffcc44'; }

      if (text) {
        floatTexts.current.push({
          id: evt.id, gx: evt.targetPos.x, gz: evt.targetPos.z,
          text, color, age: 0, isCrit,
        });
      }
    }
  }, [state.combatEvents, state.units]);

  // Center camera on load
  useEffect(() => {
    setCamera(prev => ({ ...prev, x: GRID_SIZE * TILE_SIZE / 2, y: GRID_SIZE * TILE_SIZE / 2 }));
  }, []);

  // Auto-follow active unit
  useEffect(() => {
    if (!state.autoPlay || !state.selectedUnitId) return;
    const unit = state.units.find(u => u.id === state.selectedUnitId);
    if (!unit) return;
    const tx = unit.position.x * TILE_SIZE + TILE_SIZE / 2;
    const tz = unit.position.z * TILE_SIZE + TILE_SIZE / 2;
    setCamera(prev => ({
      ...prev,
      x: prev.x + (tx - prev.x) * 0.08,
      y: prev.y + (tz - prev.y) * 0.08,
    }));
  }, [state.selectedUnitId, state.units, state.autoPlay]);

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
        return;
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

      // Background
      ctx.fillStyle = '#0c1018';
      ctx.fillRect(0, 0, w, h);

      // Screen shake
      if (shake.current.intensity > 0.1) {
        shake.current.offsetX = (Math.random() - 0.5) * shake.current.intensity;
        shake.current.offsetY = (Math.random() - 0.5) * shake.current.intensity;
        shake.current.intensity *= 0.85;
      } else {
        shake.current.offsetX = 0;
        shake.current.offsetY = 0;
      }

      // Camera transform
      ctx.save();
      ctx.translate(w / 2 + shake.current.offsetX, h / 2 + shake.current.offsetY);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      // ── Draw terrain tiles ──
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const tile = state.grid[x]?.[z];
          if (!tile) continue;
          const px = x * TILE_SIZE;
          const pz = z * TILE_SIZE;

          const outOfZone = state.shrinkLevel > 0 && !isInZone(x, z, state.shrinkLevel);
          const noise = tileNoise(x, z, 7);

          // Base terrain color
          if (outOfZone) {
            ctx.fillStyle = '#1a1010';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
            // Red tint
            ctx.fillStyle = 'rgba(200,30,20,0.06)';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
          } else {
            // Elevation brightness
            const elevBrightness = Math.min(1, tile.elevation * 0.15);
            const baseColor = noise > 0.6 ? (TERRAIN_COLORS_LIGHT[tile.type] || TERRAIN_COLORS.grass) : (TERRAIN_COLORS[tile.type] || TERRAIN_COLORS.grass);
            ctx.fillStyle = baseColor;
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);

            // Elevation highlight
            if (elevBrightness > 0) {
              ctx.fillStyle = `rgba(255,255,240,${elevBrightness * 0.08})`;
              ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
            }

            // Drop shadow for elevated tiles (south/east edge)
            if (tile.elevation > 0.3) {
              ctx.fillStyle = 'rgba(0,0,0,0.12)';
              ctx.fillRect(px + TILE_SIZE - 2, pz, 2, TILE_SIZE);
              ctx.fillRect(px, pz + TILE_SIZE - 2, TILE_SIZE, 2);
            }
          }

          // Subtle grid line (only at higher zoom)
          if (camera.zoom > 1.4) {
            ctx.strokeStyle = 'rgba(255,255,255,0.03)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, pz, TILE_SIZE, TILE_SIZE);
          }

          // Highlights
          const key = `${x},${z}`;
          if (movableSet.has(key)) {
            ctx.fillStyle = 'rgba(68,136,255,0.15)';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = 'rgba(68,136,255,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, pz + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          }
          if (attackableSet.has(key)) {
            ctx.fillStyle = 'rgba(255,68,68,0.2)';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = 'rgba(255,68,68,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, pz + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          }
          if (abilitySet.has(key)) {
            ctx.fillStyle = 'rgba(68,204,68,0.15)';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
          }

          // Smoke
          if (tile.hasSmoke) {
            ctx.fillStyle = 'rgba(180,200,220,0.25)';
            ctx.fillRect(px, pz, TILE_SIZE, TILE_SIZE);
          }

          // Loot glow
          if (tile.loot && !outOfZone) {
            const pulse = 0.3 + Math.sin(timestamp * 0.004 + x * 3 + z * 7) * 0.2;
            ctx.fillStyle = `rgba(255,204,68,${pulse})`;
            ctx.beginPath();
            ctx.arc(px + TILE_SIZE / 2, pz + TILE_SIZE / 2, 5, 0, Math.PI * 2);
            ctx.fill();
            // Outer glow
            ctx.fillStyle = `rgba(255,204,68,${pulse * 0.3})`;
            ctx.beginPath();
            ctx.arc(px + TILE_SIZE / 2, pz + TILE_SIZE / 2, 9, 0, Math.PI * 2);
            ctx.fill();
          }

          // Props — simple geometric shapes
          if (tile.prop && !outOfZone) {
            const cx = px + TILE_SIZE / 2;
            const cz = pz + TILE_SIZE / 2;
            ctx.fillStyle = tile.coverValue >= 2 ? PROP_COVER_COLOR : PROP_COLOR;

            switch (tile.prop) {
              case 'tree':
                ctx.fillStyle = '#2a4a22';
                ctx.beginPath(); ctx.arc(cx, cz, 6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#1a3a14';
                ctx.beginPath(); ctx.arc(cx - 1, cz - 1, 3, 0, Math.PI * 2); ctx.fill();
                break;
              case 'rock':
                ctx.fillStyle = '#4a4a50';
                ctx.beginPath();
                ctx.moveTo(cx - 5, cz + 3); ctx.lineTo(cx - 3, cz - 5);
                ctx.lineTo(cx + 4, cz - 4); ctx.lineTo(cx + 5, cz + 2);
                ctx.closePath(); ctx.fill();
                break;
              case 'crate':
                ctx.fillStyle = '#5a4830';
                ctx.fillRect(cx - 5, cz - 5, 10, 10);
                ctx.strokeStyle = '#3a2818';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(cx - 5, cz - 5, 10, 10);
                break;
              case 'sandbag':
                ctx.fillStyle = '#6a5d40';
                ctx.beginPath(); ctx.ellipse(cx, cz, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
                break;
              case 'bush':
                ctx.fillStyle = '#2a5820';
                ctx.beginPath(); ctx.arc(cx, cz, 5, 0, Math.PI * 2); ctx.fill();
                break;
              case 'barrel':
                ctx.fillStyle = '#3a3020';
                ctx.beginPath(); ctx.arc(cx, cz, 4, 0, Math.PI * 2); ctx.fill();
                break;
              case 'ruins':
                ctx.fillStyle = '#4a4a4a';
                ctx.fillRect(cx - 6, cz - 6, 5, 12);
                ctx.fillRect(cx + 1, cz - 3, 5, 9);
                break;
              case 'jersey_barrier':
                ctx.fillStyle = '#6a6a6a';
                ctx.fillRect(cx - 8, cz - 2, 16, 4);
                break;
              case 'burnt_vehicle':
                ctx.fillStyle = '#2a2a2a';
                ctx.fillRect(cx - 8, cz - 4, 16, 8);
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(cx - 5, cz - 6, 10, 4);
                break;
              case 'hesco':
                ctx.fillStyle = '#5a5a40';
                ctx.fillRect(cx - 5, cz - 5, 10, 10);
                break;
              case 'foxhole':
                ctx.fillStyle = '#3a3020';
                ctx.beginPath(); ctx.ellipse(cx, cz, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#2a2018';
                ctx.beginPath(); ctx.ellipse(cx, cz, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
                break;
              case 'wire':
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 0.8;
                ctx.setLineDash([2, 2]);
                ctx.beginPath(); ctx.moveTo(cx - 7, cz); ctx.lineTo(cx + 7, cz); ctx.stroke();
                ctx.setLineDash([]);
                break;
              case 'tank_trap':
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(cx - 5, cz + 5); ctx.lineTo(cx + 5, cz - 5); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(cx + 5, cz + 5); ctx.lineTo(cx - 5, cz - 5); ctx.stroke();
                break;
              default:
                ctx.fillRect(cx - 4, cz - 4, 8, 8);
            }
          }
        }
      }

      // ── Zone border ──
      if (state.shrinkLevel > 0) {
        const m = state.shrinkLevel * 2;
        const pulse = 0.4 + Math.sin(timestamp * 0.003) * 0.3;

        // Zone gradient edge
        const innerX = m * TILE_SIZE;
        const innerZ = m * TILE_SIZE;
        const innerW = (GRID_SIZE - m * 2) * TILE_SIZE;
        const innerH = (GRID_SIZE - m * 2) * TILE_SIZE;

        ctx.strokeStyle = `rgba(255,34,34,${pulse})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff2222';
        ctx.shadowBlur = 15;
        ctx.strokeRect(innerX, innerZ, innerW, innerH);
        ctx.shadowBlur = 0;
      }

      // ── Draw units ──
      for (const unit of state.units) {
        const anim = unitAnims.current[unit.id];
        if (!anim) continue;

        // Interpolate position
        const dx = unit.position.x - anim.x;
        const dz = unit.position.z - anim.z;
        anim.x += dx * 0.12;
        anim.z += dz * 0.12;

        if (anim.flash > 0) anim.flash = Math.max(0, anim.flash - dt * 3);
        if (!unit.isAlive && anim.deathProgress < 1) {
          anim.deathProgress = Math.min(1, anim.deathProgress + dt * 1.5);
        }

        if (!unit.isAlive && anim.deathProgress >= 1) continue;

        const cx = anim.x * TILE_SIZE + TILE_SIZE / 2;
        const cz = anim.z * TILE_SIZE + TILE_SIZE / 2;
        const tc = TEAM_COLORS[unit.team];
        const [r, g, b] = hexToRgb(tc);
        const isSelected = unit.id === state.selectedUnitId;

        ctx.save();
        ctx.translate(cx, cz);

        if (!unit.isAlive) {
          ctx.globalAlpha = 1 - anim.deathProgress;
        }

        // ── Outer glow halo ──
        const glowPulse = isSelected ? (0.3 + Math.sin(timestamp * 0.005) * 0.15) : 0.15;
        const glowRadius = isSelected ? UNIT_RADIUS + 8 : UNIT_RADIUS + 4;
        const glowGrad = ctx.createRadialGradient(0, 0, UNIT_RADIUS - 2, 0, 0, glowRadius);
        glowGrad.addColorStop(0, `rgba(${r},${g},${b},${glowPulse})`);
        glowGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // ── Selected pulse ring ──
        if (isSelected) {
          const ringPulse = 0.4 + Math.sin(timestamp * 0.006) * 0.3;
          ctx.strokeStyle = `rgba(${r},${g},${b},${ringPulse})`;
          ctx.lineWidth = 1.5;
          const ringR = UNIT_RADIUS + 5 + Math.sin(timestamp * 0.004) * 2;
          ctx.beginPath();
          ctx.arc(0, 0, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // ── HP arc (270° max) ──
        const hpPct = unit.hp / unit.maxHp;
        const hpAngle = (Math.PI * 1.5) * hpPct; // 270 degrees max
        const hpStartAngle = -Math.PI * 0.75; // start at 7 o'clock

        // HP background arc
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_RADIUS + 1, hpStartAngle, hpStartAngle + Math.PI * 1.5);
        ctx.stroke();

        // HP fill arc
        const hpColor = hpPct > 0.5 ? '#44dd44' : hpPct > 0.25 ? '#ddaa22' : '#dd3322';
        ctx.strokeStyle = hpColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_RADIUS + 1, hpStartAngle, hpStartAngle + hpAngle);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // ── Dark center circle ──
        const flash = anim.flash;
        const centerColor = flash > 0.3 ? '#ffffff' : flash > 0 ? `rgba(255,200,200,1)` : '#1a1a22';
        ctx.fillStyle = centerColor;
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Team-colored ring border
        ctx.strokeStyle = tc;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        // ── Class icon ──
        ctx.fillStyle = '#ddd';
        ctx.font = `bold ${unit.unitClass === 'medic' ? 10 : 9}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(CLASS_ICONS[unit.unitClass] || '?', 0, 0);

        // ── Status indicators ──
        if (unit.isOnOverwatch) {
          ctx.fillStyle = '#4488ff';
          ctx.font = 'bold 6px sans-serif';
          ctx.fillText('◉', 0, -UNIT_RADIUS - 5);
        }
        if (unit.coverType === 'full') {
          ctx.fillStyle = '#4488ff';
          ctx.beginPath();
          ctx.arc(UNIT_RADIUS + 3, -UNIT_RADIUS + 3, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (unit.coverType === 'half') {
          ctx.fillStyle = '#88aa44';
          ctx.beginPath();
          ctx.arc(UNIT_RADIUS + 3, -UNIT_RADIUS + 3, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // ── Kill count pip ──
        if (unit.kills > 0) {
          ctx.fillStyle = '#ff4444';
          ctx.font = 'bold 6px "Share Tech Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${unit.kills}`, 0, UNIT_RADIUS + 8);
        }

        ctx.restore();
      }

      // ── Projectile trails ──
      trails.current = trails.current.filter(t => t.age < t.maxAge);
      for (const trail of trails.current) {
        trail.age += dt;
        const progress = trail.age / trail.maxAge;
        const alpha = 1 - progress;

        const fx = trail.fromX * TILE_SIZE + TILE_SIZE / 2;
        const fz = trail.fromZ * TILE_SIZE + TILE_SIZE / 2;
        const tx = trail.toX * TILE_SIZE + TILE_SIZE / 2;
        const tz = trail.toZ * TILE_SIZE + TILE_SIZE / 2;

        // Lerp the leading edge
        const headPct = Math.min(1, progress * 3);
        const hx = fx + (tx - fx) * headPct;
        const hz = fz + (tz - fz) * headPct;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = trail.color;
        ctx.lineWidth = trail.isCrit ? 3 : 2;
        ctx.shadowColor = trail.color;
        ctx.shadowBlur = trail.isCrit ? 12 : 6;
        ctx.beginPath();
        ctx.moveTo(fx, fz);
        ctx.lineTo(hx, hz);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Muzzle flash
        if (progress < 0.15) {
          const flashSize = (1 - progress / 0.15) * 6;
          ctx.fillStyle = '#ffffcc';
          ctx.beginPath();
          ctx.arc(fx, fz, flashSize, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // ── Impact rings ──
      impacts.current = impacts.current.filter(i => i.age < i.maxAge);
      for (const imp of impacts.current) {
        imp.age += dt;
        const progress = imp.age / imp.maxAge;
        const alpha = (1 - progress) * 0.6;
        const radius = imp.maxRadius * progress;

        const ix = imp.x * TILE_SIZE + TILE_SIZE / 2;
        const iz = imp.z * TILE_SIZE + TILE_SIZE / 2;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = imp.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = imp.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(ix, iz, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // ── Floating damage text ──
      floatTexts.current = floatTexts.current.filter(ft => ft.age < 2);
      for (const ft of floatTexts.current) {
        ft.age += dt;
        const px = ft.gx * TILE_SIZE + TILE_SIZE / 2;
        const pz = ft.gz * TILE_SIZE + TILE_SIZE / 2;
        const floatY = ft.age * 30;
        const alpha = Math.max(0, 1 - ft.age / 1.5);
        const scale = ft.isCrit ? 1.3 : 1;
        const bounce = ft.age < 0.15 ? (1 + Math.sin(ft.age / 0.15 * Math.PI) * 0.3) : 1;

        ctx.save();
        ctx.translate(px, pz - floatY);
        ctx.scale(scale * bounce, scale * bounce);
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${ft.isCrit ? 12 : 10}px 'Share Tech Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(ft.text, 1, 1);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, 0, 0);
        ctx.restore();
      }

      // ── Kill cam glow ──
      if (state.killCam) {
        const kx = state.killCam.targetPos.x * TILE_SIZE + TILE_SIZE / 2;
        const kz = state.killCam.targetPos.z * TILE_SIZE + TILE_SIZE / 2;
        const grad = ctx.createRadialGradient(kx, kz, 0, kx, kz, 60);
        grad.addColorStop(0, 'rgba(255,40,20,0.25)');
        grad.addColorStop(1, 'rgba(255,40,20,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(kx - 60, kz - 60, 120, 120);
      }

      ctx.restore(); // camera

      // ── Screen flash overlay ──
      if (screenFlash.current.intensity > 0.01) {
        ctx.fillStyle = screenFlash.current.color;
        ctx.globalAlpha = screenFlash.current.intensity;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        screenFlash.current.intensity *= 0.9;
      }

      ctx.restore(); // DPR

      animFrameId.current = requestAnimationFrame(render);
    }

    animFrameId.current = requestAnimationFrame(render);
    return () => { running = false; cancelAnimationFrame(animFrameId.current); };
  }, [state, camera, movableSet, attackableSet, abilitySet]);

  // ── Mouse → grid ──
  const screenToGrid = useCallback((clientX: number, clientY: number): Position | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const sx = (clientX - rect.left - rect.width / 2) / camera.zoom + camera.x;
    const sy = (clientY - rect.top - rect.height / 2) / camera.zoom + camera.y;
    const gx = Math.floor(sx / TILE_SIZE);
    const gz = Math.floor(sy / TILE_SIZE);
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
      zoom: Math.max(0.8, Math.min(4, prev.zoom * (e.deltaY < 0 ? 1.1 : 0.9))),
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
          <div className="absolute top-0 left-0 right-0 h-[10%] bg-black/80 transition-all duration-500" />
          <div className="absolute bottom-0 left-0 right-0 h-[10%] bg-black/80 transition-all duration-500" />
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)',
          }} />
          <div className="absolute bottom-[12%] left-8 animate-fade-in flex items-center gap-3">
            <div className="w-1 h-10 bg-destructive rounded-full" />
            <div>
              <div className="text-[8px] tracking-[0.5em] text-destructive/80 font-mono uppercase">ELIMINATED</div>
              <div className="text-2xl font-black text-foreground tracking-wide"
                style={{ textShadow: '0 0 20px rgba(255,50,50,0.4), 0 2px 4px rgba(0,0,0,0.8)' }}>
                {state.killCam.victimName}
              </div>
              <div className="text-[9px] tracking-[0.15em] text-muted-foreground/70 font-mono mt-0.5">
                ▸ {state.killCam.killerName}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
