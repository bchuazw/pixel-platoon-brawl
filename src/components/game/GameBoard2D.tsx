import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { GameState, Position, GRID_SIZE, TEAM_COLORS, Unit, TileData, CombatEvent } from '@/game/types';
import { isInZone, getAttackPreview } from '@/game/gameState';

interface GameBoard2DProps {
  state: GameState;
  onTileClick: (pos: Position) => void;
  onUnitClick: (unitId: string) => void;
  onTileHover: (pos: Position | null) => void;
  onMoveComplete?: () => void;
}

const TILE = 40;
const UNIT_R = 14;

// ── Rich terrain palettes with multiple layers ──
const TERRAIN: Record<string, { base: string; dark: string; mid: string; accent: string; highlight: string }> = {
  grass:  { base: '#3d5c2e', dark: '#2b4420', mid: '#4a6b38', accent: '#5a7d48', highlight: '#6a8d55' },
  dirt:   { base: '#5d4a35', dark: '#4a3828', mid: '#6a5740', accent: '#7a674d', highlight: '#8a7760' },
  stone:  { base: '#555560', dark: '#42424d', mid: '#62626d', accent: '#72727d', highlight: '#85858f' },
  water:  { base: '#1a3854', dark: '#122844', mid: '#224868', accent: '#2a5878', highlight: '#3a6a90' },
  sand:   { base: '#8a7a55', dark: '#756845', mid: '#9a8a65', accent: '#aa9a75', highlight: '#bbaa85' },
  wall:   { base: '#3e3e48', dark: '#2e2e38', mid: '#4e4e58', accent: '#5e5e68', highlight: '#6e6e78' },
  trench: { base: '#504030', dark: '#3e3020', mid: '#604e3a', accent: '#705e4a', highlight: '#806e5a' },
};

const CLASS_ICONS: Record<string, string> = { soldier: '⚔', medic: '✚' };

function noise(x: number, z: number, s: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + s * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// ── Persistent battlefield effects ──
interface ScorchMark { x: number; z: number; radius: number; age: number; type: 'bullet' | 'explosion' | 'crater'; }
interface Debris { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string; rotation: number; rotSpeed: number; }
interface SmokeCloud { x: number; z: number; age: number; maxAge: number; radius: number; }
interface AmbientParticle { x: number; y: number; vx: number; vy: number; size: number; alpha: number; type: 'dust' | 'ember' | 'ash'; }
interface Trail { fromX: number; fromZ: number; toX: number; toZ: number; age: number; maxAge: number; color: string; width: number; }
interface ImpactRing { x: number; z: number; age: number; maxAge: number; color: string; maxR: number; }
interface FloatText { id: string; gx: number; gz: number; text: string; color: string; age: number; isCrit: boolean; scale: number; }
interface UnitAnim { x: number; z: number; flash: number; deathProgress: number; facing: number; }

export function GameBoard2D({ state, onTileClick, onUnitClick, onTileHover, onMoveComplete }: GameBoard2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [camera, setCamera] = useState({ x: GRID_SIZE * TILE / 2, y: GRID_SIZE * TILE / 2, zoom: 1.6 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });
  const hoveredPos = useRef<Position | null>(null);

  const unitAnims = useRef<Record<string, UnitAnim>>({});
  const floatTexts = useRef<FloatText[]>([]);
  const trails = useRef<Trail[]>([]);
  const impacts = useRef<ImpactRing[]>([]);
  const scorchMarks = useRef<ScorchMark[]>([]);
  const debris = useRef<Debris[]>([]);
  const smokeClouds = useRef<SmokeCloud[]>([]);
  const ambientParticles = useRef<AmbientParticle[]>([]);
  const shake = useRef({ intensity: 0, ox: 0, oy: 0 });
  const screenFlash = useRef({ intensity: 0, color: '#fff' });
  const lastEventCount = useRef(0);
  const animFrameId = useRef(0);
  const lastTime = useRef(0);
  const freezeFrame = useRef(0);
  const killZoom = useRef({ active: false, targetZoom: 2.0, timer: 0 });
  // Pre-rendered terrain canvas for performance
  const terrainCanvas = useRef<HTMLCanvasElement | null>(null);
  const terrainVersion = useRef('');

  const movableSet = useMemo(() => new Set(state.movableTiles.map(t => `${t.x},${t.z}`)), [state.movableTiles]);
  const attackableSet = useMemo(() => new Set(state.attackableTiles.map(t => `${t.x},${t.z}`)), [state.attackableTiles]);
  const abilitySet = useMemo(() => new Set(state.abilityTargetTiles.map(t => `${t.x},${t.z}`)), [state.abilityTargetTiles]);

  // Init unit anims
  useEffect(() => {
    for (const unit of state.units) {
      if (!unitAnims.current[unit.id]) {
        unitAnims.current[unit.id] = {
          x: unit.position.x, z: unit.position.z,
          flash: 0, deathProgress: unit.isAlive ? 0 : 1, facing: 0,
        };
      }
    }
  }, [state.units]);

  // Init ambient particles
  useEffect(() => {
    if (ambientParticles.current.length === 0) {
      for (let i = 0; i < 80; i++) {
        ambientParticles.current.push({
          x: Math.random() * GRID_SIZE * TILE,
          y: Math.random() * GRID_SIZE * TILE,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.3) * 4 - 2,
          size: 0.8 + Math.random() * 1.8,
          alpha: 0.05 + Math.random() * 0.15,
          type: Math.random() > 0.7 ? 'ember' : Math.random() > 0.5 ? 'ash' : 'dust',
        });
      }
    }
  }, []);

  // Pre-render static terrain to offscreen canvas
  useEffect(() => {
    const version = `${state.shrinkLevel}`;
    if (terrainVersion.current === version && terrainCanvas.current) return;
    terrainVersion.current = version;

    const tc = document.createElement('canvas');
    tc.width = GRID_SIZE * TILE;
    tc.height = GRID_SIZE * TILE;
    const tctx = tc.getContext('2d');
    if (!tctx) return;

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const tile = state.grid[x]?.[z];
        if (!tile) continue;
        const px = x * TILE;
        const pz = z * TILE;
        const outOfZone = state.shrinkLevel > 0 && !isInZone(x, z, state.shrinkLevel);
        const n = noise(x, z, 7);
        const n2 = noise(x, z, 42);
        const n3 = noise(x, z, 99);
        const t = TERRAIN[tile.type] || TERRAIN.grass;

        if (outOfZone) {
          tctx.fillStyle = '#120808';
          tctx.fillRect(px, pz, TILE, TILE);
        } else {
          // Multi-layer terrain with natural variation
          tctx.fillStyle = n > 0.65 ? t.accent : n > 0.35 ? t.mid : n > 0.15 ? t.base : t.dark;
          tctx.fillRect(px, pz, TILE, TILE);

          // Subtle noise overlay for texture depth
          if (n2 > 0.5) {
            tctx.fillStyle = `rgba(255,255,240,${0.01 + n3 * 0.02})`;
            tctx.fillRect(px, pz, TILE, TILE);
          }
          if (n2 < 0.3) {
            tctx.fillStyle = `rgba(0,0,10,${0.02 + n3 * 0.03})`;
            tctx.fillRect(px, pz, TILE, TILE);
          }

          // Type-specific patterns
          if (tile.type === 'grass') {
            if (n2 > 0.6) {
              tctx.fillStyle = 'rgba(80,130,50,0.08)';
              for (let gi = 0; gi < 5; gi++) {
                const gx = px + noise(x, z, gi * 13) * TILE;
                const gz = pz + noise(x, z, gi * 17 + 100) * TILE;
                tctx.fillRect(gx, gz, 1, 2 + noise(x, z, gi * 7) * 3);
              }
            }
          } else if (tile.type === 'stone') {
            if (n2 > 0.6) {
              tctx.strokeStyle = 'rgba(0,0,0,0.07)';
              tctx.lineWidth = 0.5;
              tctx.beginPath();
              tctx.moveTo(px + n * TILE, pz);
              tctx.lineTo(px + n2 * TILE, pz + TILE);
              tctx.stroke();
            }
          } else if (tile.type === 'dirt') {
            if (n2 > 0.55) {
              tctx.fillStyle = 'rgba(90,70,50,0.08)';
              tctx.beginPath();
              tctx.arc(px + n * TILE * 0.8 + 4, pz + n2 * TILE * 0.8 + 4, 1 + n3, 0, Math.PI * 2);
              tctx.fill();
            }
          }

          // Elevation lighting
          if (tile.elevation > 0.3) {
            tctx.fillStyle = `rgba(255,255,240,${tile.elevation * 0.04})`;
            tctx.fillRect(px, pz, TILE, TILE);
            // Ambient occlusion on edges
            const aoGrad = tctx.createLinearGradient(px, pz + TILE - 4, px, pz + TILE);
            aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
            aoGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
            tctx.fillStyle = aoGrad;
            tctx.fillRect(px, pz + TILE - 4, TILE, 4);
          }

          // Subtle inner shadow for depth
          const innerGrad = tctx.createLinearGradient(px, pz, px, pz + 3);
          innerGrad.addColorStop(0, 'rgba(255,255,255,0.02)');
          innerGrad.addColorStop(1, 'rgba(0,0,0,0)');
          tctx.fillStyle = innerGrad;
          tctx.fillRect(px, pz, TILE, 3);
        }

        // Props
        if (tile.prop && !outOfZone) {
          drawProp(tctx, tile.prop, px + TILE / 2, pz + TILE / 2, tile.coverValue, n);
        }
      }
    }

    terrainCanvas.current = tc;
  }, [state.grid, state.shrinkLevel]);

  // Process combat events → VFX
  useEffect(() => {
    if (state.combatEvents.length <= lastEventCount.current) return;
    const newEvents = state.combatEvents.slice(lastEventCount.current);
    lastEventCount.current = state.combatEvents.length;

    for (const evt of newEvents) {
      if (Date.now() - evt.timestamp > 1000) continue;

      const target = state.units.find(u =>
        u.position.x === evt.targetPos.x && u.position.z === evt.targetPos.z
      );
      if (target && unitAnims.current[target.id]) {
        unitAnims.current[target.id].flash = 1;
      }

      const attacker = state.units.find(u =>
        u.position.x === evt.attackerPos.x && u.position.z === evt.attackerPos.z
      );
      if (attacker && unitAnims.current[attacker.id]) {
        unitAnims.current[attacker.id].facing = Math.atan2(
          evt.targetPos.z - evt.attackerPos.z,
          evt.targetPos.x - evt.attackerPos.x
        );
      }

      if (evt.type === 'kill') {
        shake.current.intensity = Math.max(shake.current.intensity, 16);
        freezeFrame.current = 180;
        screenFlash.current = { intensity: 0.6, color: '#ff1111' };
        killZoom.current = { active: true, targetZoom: 2.4, timer: 1.8 };
        scorchMarks.current.push({ x: evt.targetPos.x, z: evt.targetPos.z, radius: 16, age: 0, type: 'crater' });
        for (let i = 0; i < 16; i++) {
          debris.current.push({
            x: evt.targetPos.x * TILE + TILE / 2, y: evt.targetPos.z * TILE + TILE / 2,
            vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140 - 70,
            life: 0, maxLife: 0.7 + Math.random() * 0.5,
            size: 2 + Math.random() * 4, color: Math.random() > 0.5 ? '#ff6633' : '#cc4422',
            rotation: Math.random() * 6.28, rotSpeed: (Math.random() - 0.5) * 12,
          });
        }
        smokeClouds.current.push({ x: evt.targetPos.x, z: evt.targetPos.z, age: 0, maxAge: 5, radius: 20 });
      } else if (evt.type === 'crit') {
        shake.current.intensity = Math.max(shake.current.intensity, 10);
        freezeFrame.current = 100;
        screenFlash.current = { intensity: 0.35, color: '#ffffff' };
        scorchMarks.current.push({ x: evt.targetPos.x, z: evt.targetPos.z, radius: 10, age: 0, type: 'explosion' });
        for (let i = 0; i < 10; i++) {
          debris.current.push({
            x: evt.targetPos.x * TILE + TILE / 2, y: evt.targetPos.z * TILE + TILE / 2,
            vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100 - 50,
            life: 0, maxLife: 0.5 + Math.random() * 0.3,
            size: 1.5 + Math.random() * 2.5, color: '#ffaa44',
            rotation: Math.random() * 6.28, rotSpeed: (Math.random() - 0.5) * 10,
          });
        }
      } else if (evt.type === 'damage') {
        shake.current.intensity = Math.max(shake.current.intensity, 5);
        scorchMarks.current.push({ x: evt.targetPos.x, z: evt.targetPos.z, radius: 5, age: 0, type: 'bullet' });
        for (let i = 0; i < 5; i++) {
          debris.current.push({
            x: evt.targetPos.x * TILE + TILE / 2, y: evt.targetPos.z * TILE + TILE / 2,
            vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60 - 25,
            life: 0, maxLife: 0.35 + Math.random() * 0.2,
            size: 1 + Math.random() * 1.5, color: '#886644',
            rotation: Math.random() * 6.28, rotSpeed: (Math.random() - 0.5) * 8,
          });
        }
      }

      // Trails
      if (evt.type === 'damage' || evt.type === 'crit' || evt.type === 'miss') {
        const isCrit = evt.type === 'crit';
        trails.current.push({
          fromX: evt.attackerPos.x, fromZ: evt.attackerPos.z,
          toX: evt.targetPos.x, toZ: evt.targetPos.z,
          age: 0, maxAge: isCrit ? 0.55 : 0.4,
          color: evt.type === 'crit' ? '#ffcc00' : evt.type === 'miss' ? '#556' : '#ff6644',
          width: isCrit ? 4 : 2.5,
        });
      }

      // Impact rings
      if (evt.type === 'damage' || evt.type === 'crit' || evt.type === 'kill') {
        impacts.current.push({
          x: evt.targetPos.x, z: evt.targetPos.z,
          age: 0, maxAge: evt.type === 'kill' ? 0.9 : 0.55,
          color: evt.type === 'kill' ? '#ff2222' : evt.type === 'crit' ? '#ffaa00' : '#ff6644',
          maxR: evt.type === 'kill' ? 50 : evt.type === 'crit' ? 35 : 22,
        });
      }

      // Float text
      let text = '', color = '#fff', scale = 1;
      if (evt.type === 'damage') { text = `-${evt.value}`; color = '#ff4444'; }
      else if (evt.type === 'crit') { text = `CRIT -${evt.value}`; color = '#ffaa00'; scale = 1.5; }
      else if (evt.type === 'miss') { text = 'MISS'; color = '#667'; }
      else if (evt.type === 'kill') { text = 'ELIMINATED'; color = '#ff2222'; scale = 1.8; }
      else if (evt.type === 'heal') { text = `+${evt.value}`; color = '#44ee44'; }
      else if (evt.type === 'loot') { text = evt.message.slice(0, 18); color = '#ffcc44'; }

      if (text) {
        floatTexts.current.push({
          id: evt.id, gx: evt.targetPos.x, gz: evt.targetPos.z,
          text, color, age: 0, isCrit: evt.type === 'crit' || evt.type === 'kill', scale,
        });
      }
    }
  }, [state.combatEvents, state.units]);

  // Center camera
  useEffect(() => {
    setCamera(prev => ({ ...prev, x: GRID_SIZE * TILE / 2, y: GRID_SIZE * TILE / 2 }));
  }, []);

  // Auto-follow
  useEffect(() => {
    if (!state.autoPlay || !state.selectedUnitId) return;
    const unit = state.units.find(u => u.id === state.selectedUnitId);
    if (!unit) return;
    const tx = unit.position.x * TILE + TILE / 2;
    const tz = unit.position.z * TILE + TILE / 2;
    setCamera(prev => ({
      ...prev,
      x: prev.x + (tx - prev.x) * 0.06,
      y: prev.y + (tz - prev.y) * 0.06,
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

      if (freezeFrame.current > 0) {
        freezeFrame.current -= rawDt * 1000;
        animFrameId.current = requestAnimationFrame(render);
        return;
      }
      const dt = rawDt;

      if (killZoom.current.active) {
        killZoom.current.timer -= dt;
        if (killZoom.current.timer <= 0) killZoom.current.active = false;
      }

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

      // ── Dark background ──
      ctx.fillStyle = '#080c12';
      ctx.fillRect(0, 0, w, h);

      // Shake
      if (shake.current.intensity > 0.1) {
        shake.current.ox = (Math.random() - 0.5) * shake.current.intensity;
        shake.current.oy = (Math.random() - 0.5) * shake.current.intensity;
        shake.current.intensity *= 0.84;
      } else {
        shake.current.ox = 0;
        shake.current.oy = 0;
      }

      const effectiveZoom = killZoom.current.active
        ? camera.zoom + (killZoom.current.targetZoom - camera.zoom) * 0.08
        : camera.zoom;

      // Camera transform
      ctx.save();
      ctx.translate(w / 2 + shake.current.ox, h / 2 + shake.current.oy);
      ctx.scale(effectiveZoom, effectiveZoom);
      ctx.translate(-camera.x, -camera.y);

      // ══════════════════════════════════
      // ── PRE-RENDERED TERRAIN ──
      // ══════════════════════════════════
      if (terrainCanvas.current) {
        ctx.drawImage(terrainCanvas.current, 0, 0);
      }

      // ── Dynamic overlays on terrain (zone pulse, water animation, highlights) ──
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const tile = state.grid[x]?.[z];
          if (!tile) continue;
          const px = x * TILE;
          const pz = z * TILE;
          const outOfZone = state.shrinkLevel > 0 && !isInZone(x, z, state.shrinkLevel);

          if (outOfZone) {
            const zonePulse = 0.025 + Math.sin(timestamp * 0.0015 + x * 0.4 + z * 0.3) * 0.015;
            ctx.fillStyle = `rgba(180,20,10,${zonePulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
          }

          // Water animation
          if (tile.type === 'water' && !outOfZone) {
            const wave = Math.sin(timestamp * 0.0015 + x * 1.2 + z * 0.6) * 0.06;
            ctx.fillStyle = `rgba(50,110,190,${0.06 + wave})`;
            ctx.fillRect(px, pz, TILE, TILE);
            const n = noise(x, z, 7);
            if (n > 0.7) {
              ctx.fillStyle = `rgba(130,190,255,${0.04 + wave * 0.5})`;
              ctx.beginPath();
              ctx.ellipse(px + TILE / 2, pz + TILE / 2, 5, 2.5, timestamp * 0.0008, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Scorch marks
          for (const sm of scorchMarks.current) {
            if (sm.x === x && sm.z === z) {
              const smAlpha = Math.max(0, 0.35 - sm.age * 0.015);
              if (sm.type === 'crater') {
                const grad = ctx.createRadialGradient(px + TILE/2, pz + TILE/2, 0, px + TILE/2, pz + TILE/2, sm.radius);
                grad.addColorStop(0, `rgba(15,10,5,${smAlpha})`);
                grad.addColorStop(0.6, `rgba(30,20,10,${smAlpha * 0.6})`);
                grad.addColorStop(1, `rgba(40,30,15,0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(px, pz, TILE, TILE);
              } else if (sm.type === 'explosion') {
                ctx.fillStyle = `rgba(25,15,8,${smAlpha * 0.7})`;
                ctx.beginPath();
                ctx.arc(px + TILE / 2, pz + TILE / 2, sm.radius, 0, Math.PI * 2);
                ctx.fill();
              } else {
                ctx.fillStyle = `rgba(35,25,15,${smAlpha * 0.5})`;
                ctx.beginPath();
                ctx.arc(px + TILE / 2, pz + TILE / 2, sm.radius, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }

          // Smoke overlay
          if (tile.hasSmoke) {
            const smokePulse = 0.18 + Math.sin(timestamp * 0.0015 + x * 2) * 0.04;
            ctx.fillStyle = `rgba(180,200,220,${smokePulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
          }

          // ── Highlights ──
          const key = `${x},${z}`;
          if (movableSet.has(key)) {
            const movePulse = 0.1 + Math.sin(timestamp * 0.003 + x + z) * 0.04;
            ctx.fillStyle = `rgba(68,136,255,${movePulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
            ctx.strokeStyle = 'rgba(68,136,255,0.25)';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, pz + 0.5, TILE - 1, TILE - 1);
          }
          if (attackableSet.has(key)) {
            const atkPulse = 0.14 + Math.sin(timestamp * 0.004 + x * 2) * 0.06;
            ctx.fillStyle = `rgba(255,50,50,${atkPulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
            ctx.strokeStyle = 'rgba(255,60,60,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, pz + 0.5, TILE - 1, TILE - 1);
            // Crosshair
            ctx.strokeStyle = 'rgba(255,80,80,0.2)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(px + TILE / 2, pz + 3); ctx.lineTo(px + TILE / 2, pz + TILE - 3);
            ctx.moveTo(px + 3, pz + TILE / 2); ctx.lineTo(px + TILE - 3, pz + TILE / 2);
            ctx.stroke();
          }
          if (abilitySet.has(key)) {
            const ablPulse = 0.1 + Math.sin(timestamp * 0.003) * 0.04;
            ctx.fillStyle = `rgba(68,204,68,${ablPulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
          }

          // Loot
          if (tile.loot && !outOfZone) {
            const lp = 0.35 + Math.sin(timestamp * 0.004 + x * 3 + z * 7) * 0.2;
            const grad = ctx.createRadialGradient(px + TILE/2, pz + TILE/2, 0, px + TILE/2, pz + TILE/2, 14);
            grad.addColorStop(0, `rgba(255,204,68,${lp * 0.35})`);
            grad.addColorStop(1, `rgba(255,204,68,0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(px, pz, TILE, TILE);
            ctx.fillStyle = `rgba(255,220,100,${lp})`;
            ctx.save();
            ctx.translate(px + TILE / 2, pz + TILE / 2);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-4, -4, 8, 8);
            ctx.restore();
          }
        }
      }

      // Age scorch marks
      for (const sm of scorchMarks.current) { sm.age += dt * 0.3; }
      scorchMarks.current = scorchMarks.current.filter(s => s.age < 20);

      // Smoke clouds
      smokeClouds.current = smokeClouds.current.filter(s => s.age < s.maxAge);
      for (const sc of smokeClouds.current) {
        sc.age += dt;
        const progress = sc.age / sc.maxAge;
        const alpha = (1 - progress) * 0.18;
        const r = sc.radius + progress * 14;
        const cx = sc.x * TILE + TILE / 2;
        const cz = sc.z * TILE + TILE / 2;
        const grad = ctx.createRadialGradient(cx, cz, 0, cx, cz, r);
        grad.addColorStop(0, `rgba(110,105,95,${alpha})`);
        grad.addColorStop(1, `rgba(110,105,95,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cz, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Zone border ──
      if (state.shrinkLevel > 0) {
        const m = state.shrinkLevel * 2;
        const pulse = 0.25 + Math.sin(timestamp * 0.002) * 0.15;
        const innerX = m * TILE, innerZ = m * TILE;
        const innerW = (GRID_SIZE - m * 2) * TILE, innerH = (GRID_SIZE - m * 2) * TILE;
        ctx.shadowColor = '#ff2222';
        ctx.shadowBlur = 25;
        ctx.strokeStyle = `rgba(255,34,34,${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(innerX, innerZ, innerW, innerH);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255,60,30,${pulse * 0.2})`;
        ctx.lineWidth = 8;
        ctx.strokeRect(innerX - 3, innerZ - 3, innerW + 6, innerH + 6);
      }

      // ── Subtle grid ──
      if (effectiveZoom > 1.8) {
        ctx.strokeStyle = 'rgba(255,255,255,0.015)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= GRID_SIZE; x++) {
          ctx.beginPath();
          ctx.moveTo(x * TILE, 0);
          ctx.lineTo(x * TILE, GRID_SIZE * TILE);
          ctx.stroke();
        }
        for (let z = 0; z <= GRID_SIZE; z++) {
          ctx.beginPath();
          ctx.moveTo(0, z * TILE);
          ctx.lineTo(GRID_SIZE * TILE, z * TILE);
          ctx.stroke();
        }
      }

      // ══════════════════════════════════
      // ── UNITS ──
      // ══════════════════════════════════
      const sortedUnits = [...state.units].sort((a, b) => a.position.z - b.position.z);

      for (const unit of sortedUnits) {
        const anim = unitAnims.current[unit.id];
        if (!anim) continue;

        anim.x += (unit.position.x - anim.x) * 0.12;
        anim.z += (unit.position.z - anim.z) * 0.12;
        if (anim.flash > 0) anim.flash = Math.max(0, anim.flash - dt * 3);
        if (!unit.isAlive && anim.deathProgress < 1) anim.deathProgress = Math.min(1, anim.deathProgress + dt * 1.5);
        if (!unit.isAlive && anim.deathProgress >= 1) continue;

        const cx = anim.x * TILE + TILE / 2;
        const cz = anim.z * TILE + TILE / 2;
        const tc = TEAM_COLORS[unit.team];
        const [r, g, b] = hexRgb(tc);
        const isSelected = unit.id === state.selectedUnitId;

        ctx.save();
        ctx.translate(cx, cz);
        if (!unit.isAlive) ctx.globalAlpha = 1 - anim.deathProgress;

        // ── Ground shadow ──
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 3, UNIT_R + 1, UNIT_R * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── Outer glow halo ──
        const glowPulse = isSelected ? (0.4 + Math.sin(timestamp * 0.004) * 0.15) : 0.1;
        const glowR = isSelected ? UNIT_R + 14 : UNIT_R + 7;
        const glowGrad = ctx.createRadialGradient(0, 0, UNIT_R - 4, 0, 0, glowR);
        glowGrad.addColorStop(0, `rgba(${r},${g},${b},${glowPulse})`);
        glowGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, glowR, 0, Math.PI * 2);
        ctx.fill();

        // ── Selected pulsing ring ──
        if (isSelected) {
          ctx.save();
          ctx.rotate(timestamp * 0.0015);
          ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(0, 0, UNIT_R + 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // ── HP arc (270°) ──
        const hpPct = unit.hp / unit.maxHp;
        const hpAngle = Math.PI * 1.5 * hpPct;
        const hpStart = -Math.PI * 0.75;
        const hpR = UNIT_R + 2;

        // BG arc
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, hpR, hpStart, hpStart + Math.PI * 1.5);
        ctx.stroke();

        // Fill arc
        const hpColor = hpPct > 0.5 ? '#44ee44' : hpPct > 0.25 ? '#eeaa22' : '#ee3322';
        ctx.strokeStyle = hpColor;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = hpColor;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(0, 0, hpR, hpStart, hpStart + hpAngle);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.lineCap = 'butt';

        // ── Center circle — gradient with depth ──
        const flash = anim.flash;
        if (flash > 0.3) {
          ctx.fillStyle = '#ffffff';
        } else {
          const centerGrad = ctx.createRadialGradient(-2, -3, 0, 0, 1, UNIT_R);
          centerGrad.addColorStop(0, '#32323c');
          centerGrad.addColorStop(0.5, '#24242e');
          centerGrad.addColorStop(1, '#1a1a24');
          ctx.fillStyle = centerGrad;
        }
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_R, 0, Math.PI * 2);
        ctx.fill();

        // Team color ring
        ctx.strokeStyle = tc;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = tc;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Flash overlay
        if (flash > 0) {
          ctx.fillStyle = `rgba(255,200,200,${flash * 0.5})`;
          ctx.beginPath();
          ctx.arc(0, 0, UNIT_R, 0, Math.PI * 2);
          ctx.fill();
        }

        // ── Facing indicator ──
        ctx.save();
        ctx.rotate(anim.facing);
        ctx.fillStyle = tc;
        ctx.shadowColor = tc;
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.moveTo(UNIT_R + 5, 0);
        ctx.lineTo(UNIT_R - 1, -4);
        ctx.lineTo(UNIT_R - 1, 4);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        // ── Class icon ──
        ctx.fillStyle = '#e0e0e0';
        ctx.font = `bold ${unit.unitClass === 'medic' ? 14 : 13}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 2;
        ctx.fillText(CLASS_ICONS[unit.unitClass] || '?', 0, 0);
        ctx.shadowBlur = 0;

        // ── Name tag ──
        ctx.font = 'bold 9px "Rajdhani", sans-serif';
        const nameWidth = ctx.measureText(unit.name).width + 10;
        const nameY = -UNIT_R - 16;
        // Background pill
        ctx.fillStyle = 'rgba(8,12,18,0.75)';
        const pillH = 13;
        ctx.beginPath();
        ctx.roundRect(-nameWidth / 2, nameY - pillH / 2, nameWidth, pillH, 3);
        ctx.fill();
        // Team accent line
        ctx.fillStyle = tc;
        ctx.fillRect(-nameWidth / 2, nameY + pillH / 2 - 1.5, nameWidth, 1.5);
        // Name text
        ctx.fillStyle = '#ddd';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.name, 0, nameY);

        // ── Kills badge ──
        if (unit.kills > 0) {
          ctx.fillStyle = 'rgba(255,50,50,0.85)';
          ctx.font = 'bold 10px "Rajdhani", sans-serif';
          ctx.fillText(`☠${unit.kills}`, 0, UNIT_R + 12);
        }

        // ── Status icons ──
        let badgeX = UNIT_R + 8;
        if (unit.isOnOverwatch) {
          ctx.fillStyle = '#4488ff';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('◉', badgeX, -4);
          badgeX += 10;
        }
        if (unit.coverType !== 'none') {
          ctx.fillStyle = unit.coverType === 'full' ? '#4488ff' : '#88aa44';
          ctx.beginPath();
          ctx.arc(badgeX + 3, -3, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 6px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(unit.coverType === 'full' ? 'F' : 'H', badgeX + 3, -2);
        }

        ctx.restore();
      }

      // ── Attack preview ──
      if (hoveredPos.current && state.phase === 'attack' && state.attackPreview) {
        const hp = hoveredPos.current;
        const px = hp.x * TILE + TILE / 2;
        const pz = hp.z * TILE + TILE / 2;

        ctx.save();
        const panelW = 90, panelH = 48;
        const panelX = px - panelW / 2;
        const panelY = pz - UNIT_R - 28 - panelH;

        // Panel background
        ctx.fillStyle = 'rgba(8,12,18,0.9)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,80,80,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 4);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px "Rajdhani", sans-serif';
        ctx.fillText(`${state.attackPreview.hitChance}% HIT`, px, panelY + 16);
        ctx.fillStyle = '#ff6644';
        ctx.font = '11px "Rajdhani", sans-serif';
        ctx.fillText(`~${state.attackPreview.expectedDamage} DMG`, px, panelY + 30);
        if (state.attackPreview.critChance > 0) {
          ctx.fillStyle = '#ffaa00';
          ctx.font = '10px "Rajdhani", sans-serif';
          ctx.fillText(`${state.attackPreview.critChance}% CRIT`, px, panelY + 43);
        }
        ctx.restore();
      }

      // ══════════════════════════════════
      // ── VFX LAYERS ──
      // ══════════════════════════════════

      // Ambient particles
      for (const p of ambientParticles.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0) p.x = GRID_SIZE * TILE;
        if (p.x > GRID_SIZE * TILE) p.x = 0;
        if (p.y < 0) p.y = GRID_SIZE * TILE;
        if (p.y > GRID_SIZE * TILE) p.y = 0;

        ctx.fillStyle = p.type === 'ember'
          ? `rgba(255,120,40,${p.alpha})`
          : p.type === 'ash'
          ? `rgba(180,170,160,${p.alpha})`
          : `rgba(200,190,170,${p.alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Trails
      trails.current = trails.current.filter(t => t.age < t.maxAge);
      for (const trail of trails.current) {
        trail.age += dt;
        const progress = trail.age / trail.maxAge;
        const alpha = 1 - progress;

        const fx = trail.fromX * TILE + TILE / 2;
        const fz = trail.fromZ * TILE + TILE / 2;
        const tx = trail.toX * TILE + TILE / 2;
        const tz = trail.toZ * TILE + TILE / 2;
        const headPct = Math.min(1, progress * 3);
        const hx = fx + (tx - fx) * headPct;
        const hz = fz + (tz - fz) * headPct;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = trail.color;
        ctx.lineWidth = trail.width;
        ctx.shadowColor = trail.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(fx, fz);
        ctx.lineTo(hx, hz);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Muzzle flash
        if (progress < 0.1) {
          const fSize = (1 - progress / 0.1) * 10;
          ctx.fillStyle = '#ffffcc';
          ctx.shadowColor = '#ffffaa';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(fx, fz, fSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }

      // Impact rings
      impacts.current = impacts.current.filter(i => i.age < i.maxAge);
      for (const imp of impacts.current) {
        imp.age += dt;
        const progress = imp.age / imp.maxAge;
        const alpha = (1 - progress) * 0.65;
        const radius = imp.maxR * progress;

        const ix = imp.x * TILE + TILE / 2;
        const iz = imp.z * TILE + TILE / 2;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = imp.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = imp.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(ix, iz, radius, 0, Math.PI * 2);
        ctx.stroke();
        if (progress < 0.25) {
          ctx.fillStyle = imp.color;
          ctx.globalAlpha = alpha * 0.15;
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Debris
      debris.current = debris.current.filter(d => d.life < d.maxLife);
      for (const d of debris.current) {
        d.life += dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 220 * dt;
        d.rotation += d.rotSpeed * dt;
        const alpha = Math.max(0, 1 - d.life / d.maxLife);

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rotation);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = d.color;
        ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
        ctx.restore();
      }

      // Float text
      floatTexts.current = floatTexts.current.filter(ft => ft.age < 2);
      for (const ft of floatTexts.current) {
        ft.age += dt;
        const px = ft.gx * TILE + TILE / 2;
        const pz = ft.gz * TILE + TILE / 2;
        const floatY = ft.age * 32;
        const alpha = Math.max(0, 1 - ft.age / 1.5);
        const bounce = ft.age < 0.12 ? (1 + Math.sin(ft.age / 0.12 * Math.PI) * 0.35) : 1;

        ctx.save();
        ctx.translate(px, pz - floatY - 14);
        ctx.scale(ft.scale * bounce, ft.scale * bounce);
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${ft.isCrit ? 14 : 12}px 'Rajdhani', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(ft.text, 1.5, 1.5);
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = ft.isCrit ? 10 : 5;
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Kill cam glow
      if (state.killCam) {
        const kx = state.killCam.targetPos.x * TILE + TILE / 2;
        const kz = state.killCam.targetPos.z * TILE + TILE / 2;
        const grad = ctx.createRadialGradient(kx, kz, 0, kx, kz, 60);
        grad.addColorStop(0, 'rgba(255,30,15,0.2)');
        grad.addColorStop(1, 'rgba(255,30,15,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(kx - 60, kz - 60, 120, 120);
      }

      ctx.restore(); // camera

      // ── Vignette ──
      const vigGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);

      // ── Subtle color grade overlay ──
      ctx.fillStyle = 'rgba(20,30,50,0.06)';
      ctx.fillRect(0, 0, w, h);

      // Screen flash
      if (screenFlash.current.intensity > 0.01) {
        ctx.fillStyle = screenFlash.current.color;
        ctx.globalAlpha = screenFlash.current.intensity;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        screenFlash.current.intensity *= 0.87;
      }

      ctx.restore(); // DPR

      animFrameId.current = requestAnimationFrame(render);
    }

    animFrameId.current = requestAnimationFrame(render);
    return () => { running = false; cancelAnimationFrame(animFrameId.current); };
  }, [state, camera, movableSet, attackableSet, abilitySet]);

  // ── Mouse handlers ──
  const screenToGrid = useCallback((clientX: number, clientY: number): Position | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const sx = (clientX - rect.left - rect.width / 2) / camera.zoom + camera.x;
    const sy = (clientY - rect.top - rect.height / 2) / camera.zoom + camera.y;
    const gx = Math.floor(sx / TILE);
    const gz = Math.floor(sy / TILE);
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
    hoveredPos.current = pos;
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
      zoom: Math.max(0.7, Math.min(4, prev.zoom * (e.deltaY < 0 ? 1.12 : 0.88))),
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
          <div className="absolute top-0 left-0 right-0 h-[10%] bg-black/90 transition-all duration-300" />
          <div className="absolute bottom-0 left-0 right-0 h-[10%] bg-black/90 transition-all duration-300" />
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)',
          }} />
          <div className="absolute bottom-[12%] left-8 animate-fade-in flex items-center gap-4">
            <div className="w-1 h-10 bg-destructive rounded-full" />
            <div>
              <div className="text-xs tracking-[0.5em] text-destructive/70 font-display uppercase">ELIMINATED</div>
              <div className="text-2xl font-black text-foreground tracking-wide font-display"
                style={{ textShadow: '0 0 20px rgba(255,50,50,0.3), 0 2px 6px rgba(0,0,0,0.8)' }}>
                {state.killCam.victimName}
              </div>
              <div className="text-sm tracking-[0.12em] text-muted-foreground/60 mt-0.5">
                ▸ {state.killCam.killerName}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Draw prop helper — with shadows and depth ──
function drawProp(ctx: CanvasRenderingContext2D, prop: string, cx: number, cz: number, coverValue: number, n: number) {
  ctx.save();

  // Shadow for all props
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(cx + 1, cz + 3, 8, 3, 0.1, 0, Math.PI * 2);
  ctx.fill();

  switch (prop) {
    case 'tree': {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(cx - 2, cz - 3, 4, 8);
      // Multi-layer canopy
      ctx.fillStyle = 'rgba(30,70,22,0.9)';
      ctx.beginPath(); ctx.arc(cx, cz - 5, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(40,85,30,0.85)';
      ctx.beginPath(); ctx.arc(cx - 3, cz - 8, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(50,100,38,0.7)';
      ctx.beginPath(); ctx.arc(cx + 3, cz - 7, 5.5, 0, Math.PI * 2); ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(120,180,80,0.12)';
      ctx.beginPath(); ctx.arc(cx - 1, cz - 9, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'rock': {
      const grad = ctx.createRadialGradient(cx - 2, cz - 3, 1, cx, cz, 9);
      grad.addColorStop(0, '#6a6a72');
      grad.addColorStop(1, '#3e3e46');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cz + 4); ctx.lineTo(cx - 5, cz - 7);
      ctx.lineTo(cx + 5, cz - 8); ctx.lineTo(cx + 8, cz + 1);
      ctx.lineTo(cx + 4, cz + 5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(cx - 4, cz - 5); ctx.lineTo(cx + 3, cz - 7); ctx.lineTo(cx + 2, cz - 3);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'crate': {
      ctx.fillStyle = '#5a4828';
      ctx.fillRect(cx - 7, cz - 7, 14, 14);
      ctx.strokeStyle = '#3a2818';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(cx - 7, cz - 7, 14, 14);
      ctx.beginPath();
      ctx.moveTo(cx, cz - 7); ctx.lineTo(cx, cz + 7);
      ctx.moveTo(cx - 7, cz); ctx.lineTo(cx + 7, cz);
      ctx.stroke();
      // Top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(cx - 7, cz - 7, 14, 3);
      break;
    }
    case 'sandbag': {
      ctx.fillStyle = '#6a5d40';
      ctx.beginPath(); ctx.ellipse(cx, cz, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a6d50';
      ctx.beginPath(); ctx.ellipse(cx, cz - 3, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.beginPath(); ctx.ellipse(cx, cz - 4, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bush': {
      ctx.fillStyle = '#2a5820';
      ctx.beginPath(); ctx.arc(cx, cz, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a6830';
      ctx.beginPath(); ctx.arc(cx - 2, cz - 2, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(100,170,60,0.1)';
      ctx.beginPath(); ctx.arc(cx - 1, cz - 3, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'barrel': {
      const bGrad = ctx.createRadialGradient(cx - 1, cz - 1, 1, cx, cz, 6);
      bGrad.addColorStop(0, '#4a4030');
      bGrad.addColorStop(1, '#2a2018');
      ctx.fillStyle = bGrad;
      ctx.beginPath(); ctx.arc(cx, cz, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(cx, cz, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(cx, cz, 3.5, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'ruins': {
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(cx - 8, cz - 9, 5, 18);
      ctx.fillRect(cx + 3, cz - 6, 5, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(cx - 8, cz - 9, 5, 2);
      ctx.fillRect(cx + 3, cz - 6, 5, 2);
      break;
    }
    case 'jersey_barrier': {
      ctx.fillStyle = '#6a6a6e';
      ctx.fillRect(cx - 12, cz - 3, 24, 6);
      ctx.fillStyle = '#7a7a80';
      ctx.fillRect(cx - 12, cz - 3, 24, 2);
      break;
    }
    case 'burnt_vehicle': {
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(cx - 12, cz - 5, 24, 10);
      ctx.fillStyle = '#161616';
      ctx.fillRect(cx - 8, cz - 9, 16, 6);
      ctx.fillStyle = 'rgba(90,90,90,0.06)';
      ctx.beginPath(); ctx.arc(cx + 3, cz - 12, 5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'hesco': {
      ctx.fillStyle = '#5a5a40';
      ctx.fillRect(cx - 7, cz - 7, 14, 14);
      ctx.strokeStyle = '#4a4a30';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx - 7, cz - 7, 14, 14);
      // Wire mesh pattern
      ctx.strokeStyle = 'rgba(80,80,60,0.3)';
      ctx.lineWidth = 0.3;
      for (let i = -5; i <= 5; i += 3) {
        ctx.beginPath(); ctx.moveTo(cx + i, cz - 7); ctx.lineTo(cx + i, cz + 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 7, cz + i); ctx.lineTo(cx + 7, cz + i); ctx.stroke();
      }
      break;
    }
    case 'foxhole': {
      ctx.fillStyle = '#3a3020';
      ctx.beginPath(); ctx.ellipse(cx, cz, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2018';
      ctx.beginPath(); ctx.ellipse(cx, cz, 5.5, 3, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'wire': {
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 0.7;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(cx - 10, cz - 1);
      for (let i = 0; i < 5; i++) {
        ctx.lineTo(cx - 10 + (i + 0.5) * 4, cz - 1 + (i % 2 === 0 ? -3 : 3));
      }
      ctx.lineTo(cx + 10, cz);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'tank_trap': {
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 7, cz + 7); ctx.lineTo(cx + 7, cz - 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 7, cz + 7); ctx.lineTo(cx - 7, cz - 7); ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = '#3a3a40';
      ctx.fillRect(cx - 5, cz - 5, 10, 10);
    }
  }
  ctx.restore();
}