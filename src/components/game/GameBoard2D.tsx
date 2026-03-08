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

const TILE = 28;
const UNIT_R = 10;

// ── Terrain palettes — richer, with texture patterns ──
const TERRAIN: Record<string, { base: string; dark: string; accent: string }> = {
  grass:  { base: '#384c2c', dark: '#2e4024', accent: '#4a5e3a' },
  dirt:   { base: '#5a4d38', dark: '#4a3d2a', accent: '#6a5d48' },
  stone:  { base: '#4e4e56', dark: '#3e3e46', accent: '#5e5e66' },
  water:  { base: '#1e3a5e', dark: '#142e4e', accent: '#2e4a6e' },
  sand:   { base: '#7a6d4a', dark: '#6a5d3a', accent: '#8a7d5a' },
  wall:   { base: '#3a3a44', dark: '#2a2a34', accent: '#4a4a54' },
  trench: { base: '#4a3d28', dark: '#3a2d18', accent: '#5a4d38' },
};

const CLASS_ICONS: Record<string, string> = { soldier: '⚔', medic: '✚' };

function noise(x: number, z: number, s: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + s * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a);
  const [br, bg, bb] = hexRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

// ── Persistent battlefield effects ──
interface ScorchMark { x: number; z: number; radius: number; age: number; type: 'bullet' | 'explosion' | 'crater'; }
interface Debris { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string; rotation: number; rotSpeed: number; }
interface SmokeCloud { x: number; z: number; age: number; maxAge: number; radius: number; }
interface AmbientParticle { x: number; y: number; vx: number; vy: number; size: number; alpha: number; type: 'dust' | 'ember' | 'ash'; }
interface Trail { fromX: number; fromZ: number; toX: number; toZ: number; age: number; maxAge: number; color: string; width: number; }
interface ImpactRing { x: number; z: number; age: number; maxAge: number; color: string; maxR: number; }
interface FloatText { id: string; gx: number; gz: number; text: string; color: string; age: number; isCrit: boolean; scale: number; }

// ── Unit anim ──
interface UnitAnim { x: number; z: number; flash: number; deathProgress: number; facing: number; }

export function GameBoard2D({ state, onTileClick, onUnitClick, onTileHover, onMoveComplete }: GameBoard2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [camera, setCamera] = useState({ x: GRID_SIZE * TILE / 2, y: GRID_SIZE * TILE / 2, zoom: 2.0 });
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
          facing: 0,
        };
      }
    }
  }, [state.units]);

  // Init ambient particles
  useEffect(() => {
    if (ambientParticles.current.length === 0) {
      for (let i = 0; i < 60; i++) {
        ambientParticles.current.push({
          x: Math.random() * GRID_SIZE * TILE,
          y: Math.random() * GRID_SIZE * TILE,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.3) * 5 - 2,
          size: 1 + Math.random() * 2,
          alpha: 0.1 + Math.random() * 0.2,
          type: Math.random() > 0.7 ? 'ember' : Math.random() > 0.5 ? 'ash' : 'dust',
        });
      }
    }
  }, []);

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

      // Update facing for attacker
      const attacker = state.units.find(u =>
        u.position.x === evt.attackerPos.x && u.position.z === evt.attackerPos.z
      );
      if (attacker && unitAnims.current[attacker.id]) {
        unitAnims.current[attacker.id].facing = Math.atan2(
          evt.targetPos.z - evt.attackerPos.z,
          evt.targetPos.x - evt.attackerPos.x
        );
      }

      // Shake + freeze
      if (evt.type === 'kill') {
        shake.current.intensity = Math.max(shake.current.intensity, 14);
        freezeFrame.current = 150;
        screenFlash.current = { intensity: 0.5, color: '#ff1111' };
        killZoom.current = { active: true, targetZoom: 2.8, timer: 1.5 };
        // Crater + heavy debris
        scorchMarks.current.push({ x: evt.targetPos.x, z: evt.targetPos.z, radius: 12, age: 0, type: 'crater' });
        for (let i = 0; i < 12; i++) {
          debris.current.push({
            x: evt.targetPos.x * TILE + TILE / 2, y: evt.targetPos.z * TILE + TILE / 2,
            vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120 - 60,
            life: 0, maxLife: 0.6 + Math.random() * 0.5,
            size: 2 + Math.random() * 3, color: Math.random() > 0.5 ? '#ff6633' : '#aa4422',
            rotation: Math.random() * 6.28, rotSpeed: (Math.random() - 0.5) * 10,
          });
        }
        smokeClouds.current.push({
          x: evt.targetPos.x, z: evt.targetPos.z,
          age: 0, maxAge: 4, radius: 16,
        });
      } else if (evt.type === 'crit') {
        shake.current.intensity = Math.max(shake.current.intensity, 8);
        freezeFrame.current = 80;
        screenFlash.current = { intensity: 0.3, color: '#ffffff' };
        scorchMarks.current.push({ x: evt.targetPos.x, z: evt.targetPos.z, radius: 8, age: 0, type: 'explosion' });
        for (let i = 0; i < 8; i++) {
          debris.current.push({
            x: evt.targetPos.x * TILE + TILE / 2, y: evt.targetPos.z * TILE + TILE / 2,
            vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80 - 40,
            life: 0, maxLife: 0.4 + Math.random() * 0.3,
            size: 1.5 + Math.random() * 2, color: '#ffaa44',
            rotation: Math.random() * 6.28, rotSpeed: (Math.random() - 0.5) * 8,
          });
        }
      } else if (evt.type === 'damage') {
        shake.current.intensity = Math.max(shake.current.intensity, 4);
        scorchMarks.current.push({ x: evt.targetPos.x, z: evt.targetPos.z, radius: 4, age: 0, type: 'bullet' });
        for (let i = 0; i < 4; i++) {
          debris.current.push({
            x: evt.targetPos.x * TILE + TILE / 2, y: evt.targetPos.z * TILE + TILE / 2,
            vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50 - 20,
            life: 0, maxLife: 0.3 + Math.random() * 0.2,
            size: 1 + Math.random() * 1.5, color: '#886644',
            rotation: Math.random() * 6.28, rotSpeed: (Math.random() - 0.5) * 6,
          });
        }
      }

      // Trails
      if (evt.type === 'damage' || evt.type === 'crit' || evt.type === 'miss') {
        const isCrit = evt.type === 'crit';
        trails.current.push({
          fromX: evt.attackerPos.x, fromZ: evt.attackerPos.z,
          toX: evt.targetPos.x, toZ: evt.targetPos.z,
          age: 0, maxAge: isCrit ? 0.5 : 0.35,
          color: evt.type === 'crit' ? '#ffcc00' : evt.type === 'miss' ? '#555' : '#ff6644',
          width: isCrit ? 3.5 : 2,
        });
      }

      // Impact rings
      if (evt.type === 'damage' || evt.type === 'crit' || evt.type === 'kill') {
        impacts.current.push({
          x: evt.targetPos.x, z: evt.targetPos.z,
          age: 0, maxAge: evt.type === 'kill' ? 0.8 : 0.5,
          color: evt.type === 'kill' ? '#ff2222' : evt.type === 'crit' ? '#ffaa00' : '#ff6644',
          maxR: evt.type === 'kill' ? 40 : evt.type === 'crit' ? 28 : 18,
        });
      }

      // Float text
      let text = '', color = '#fff', scale = 1;
      if (evt.type === 'damage') { text = `-${evt.value}`; color = '#ff4444'; }
      else if (evt.type === 'crit') { text = `CRIT -${evt.value}`; color = '#ffaa00'; scale = 1.4; }
      else if (evt.type === 'miss') { text = 'MISS'; color = '#555'; }
      else if (evt.type === 'kill') { text = 'ELIMINATED'; color = '#ff2222'; scale = 1.6; }
      else if (evt.type === 'heal') { text = `+${evt.value}`; color = '#44dd44'; }
      else if (evt.type === 'loot') { text = evt.message.slice(0, 16); color = '#ffcc44'; }

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
      x: prev.x + (tx - prev.x) * 0.07,
      y: prev.y + (tz - prev.y) * 0.07,
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

      // Kill zoom decay
      if (killZoom.current.active) {
        killZoom.current.timer -= dt;
        if (killZoom.current.timer <= 0) {
          killZoom.current.active = false;
        }
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

      // ── Background with vignette ──
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, w, h);

      // Shake
      if (shake.current.intensity > 0.1) {
        shake.current.ox = (Math.random() - 0.5) * shake.current.intensity;
        shake.current.oy = (Math.random() - 0.5) * shake.current.intensity;
        shake.current.intensity *= 0.85;
      } else {
        shake.current.ox = 0;
        shake.current.oy = 0;
      }

      // Dynamic zoom (kill zoom)
      const effectiveZoom = killZoom.current.active
        ? camera.zoom + (killZoom.current.targetZoom - camera.zoom) * 0.1
        : camera.zoom;

      // Camera
      ctx.save();
      ctx.translate(w / 2 + shake.current.ox, h / 2 + shake.current.oy);
      ctx.scale(effectiveZoom, effectiveZoom);
      ctx.translate(-camera.x, -camera.y);

      // ══════════════════════════════════
      // ── TERRAIN ──
      // ══════════════════════════════════
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const tile = state.grid[x]?.[z];
          if (!tile) continue;
          const px = x * TILE;
          const pz = z * TILE;
          const outOfZone = state.shrinkLevel > 0 && !isInZone(x, z, state.shrinkLevel);
          const n = noise(x, z, 7);
          const n2 = noise(x, z, 42);
          const t = TERRAIN[tile.type] || TERRAIN.grass;

          if (outOfZone) {
            ctx.fillStyle = '#140c0c';
            ctx.fillRect(px, pz, TILE, TILE);
            // Pulsing red overlay
            const zonePulse = 0.03 + Math.sin(timestamp * 0.002 + x * 0.5 + z * 0.3) * 0.02;
            ctx.fillStyle = `rgba(200,20,10,${zonePulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
          } else {
            // Base color with noise variation
            ctx.fillStyle = n > 0.6 ? t.accent : n > 0.3 ? t.base : t.dark;
            ctx.fillRect(px, pz, TILE, TILE);

            // Subtle texture pattern per terrain type
            if (tile.type === 'grass') {
              // Grass blades pattern
              if (n2 > 0.7) {
                ctx.fillStyle = 'rgba(80,120,50,0.12)';
                ctx.fillRect(px + 2, pz + 4, 1, 3);
                ctx.fillRect(px + 8, pz + 2, 1, 4);
                ctx.fillRect(px + 15, pz + 6, 1, 3);
                ctx.fillRect(px + 22, pz + 3, 1, 4);
              }
            } else if (tile.type === 'dirt') {
              // Pebble pattern
              if (n2 > 0.65) {
                ctx.fillStyle = 'rgba(100,80,50,0.15)';
                ctx.beginPath();
                ctx.arc(px + 6, pz + 5, 1.5, 0, Math.PI * 2);
                ctx.arc(px + 18, pz + 10, 1, 0, Math.PI * 2);
                ctx.fill();
              }
            } else if (tile.type === 'water') {
              // Animated wave pattern
              const wave = Math.sin(timestamp * 0.002 + x * 1.5 + z * 0.8) * 0.08;
              ctx.fillStyle = `rgba(60,120,200,${0.08 + wave})`;
              ctx.fillRect(px, pz, TILE, TILE);
              // Specular highlight
              if (n > 0.75) {
                ctx.fillStyle = 'rgba(150,200,255,0.1)';
                ctx.beginPath();
                ctx.ellipse(px + TILE / 2, pz + TILE / 2, 4, 2, timestamp * 0.001, 0, Math.PI * 2);
                ctx.fill();
              }
            } else if (tile.type === 'stone') {
              // Crack patterns
              if (n2 > 0.7) {
                ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(px + 4, pz + 2);
                ctx.lineTo(px + 12, pz + 14);
                ctx.lineTo(px + 20, pz + 10);
                ctx.stroke();
              }
            }

            // Elevation depth (brighter + shadow)
            if (tile.elevation > 0.3) {
              ctx.fillStyle = `rgba(255,255,240,${tile.elevation * 0.06})`;
              ctx.fillRect(px, pz, TILE, TILE);
              // Shadow on south/east edge
              ctx.fillStyle = 'rgba(0,0,0,0.15)';
              ctx.fillRect(px + TILE - 1, pz, 1, TILE);
              ctx.fillRect(px, pz + TILE - 1, TILE, 1);
            }
          }

          // ── Scorch marks (persistent) ──
          for (const sm of scorchMarks.current) {
            if (sm.x === x && sm.z === z) {
              const smAlpha = Math.max(0, 0.4 - sm.age * 0.02);
              if (sm.type === 'crater') {
                ctx.fillStyle = `rgba(20,15,10,${smAlpha})`;
                ctx.beginPath();
                ctx.arc(px + TILE / 2, pz + TILE / 2, sm.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = `rgba(80,40,10,${smAlpha * 0.5})`;
                ctx.lineWidth = 1;
                ctx.stroke();
              } else if (sm.type === 'explosion') {
                ctx.fillStyle = `rgba(30,20,10,${smAlpha * 0.7})`;
                ctx.beginPath();
                ctx.arc(px + TILE / 2, pz + TILE / 2, sm.radius, 0, Math.PI * 2);
                ctx.fill();
              } else {
                ctx.fillStyle = `rgba(40,30,20,${smAlpha * 0.5})`;
                ctx.beginPath();
                ctx.arc(px + TILE / 2, pz + TILE / 2, sm.radius, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }

          // ── Highlights ──
          const key = `${x},${z}`;
          if (movableSet.has(key)) {
            const movePulse = 0.12 + Math.sin(timestamp * 0.004 + x + z) * 0.04;
            ctx.fillStyle = `rgba(68,136,255,${movePulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
            ctx.strokeStyle = 'rgba(68,136,255,0.35)';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, pz + 0.5, TILE - 1, TILE - 1);
          }
          if (attackableSet.has(key)) {
            const atkPulse = 0.18 + Math.sin(timestamp * 0.005 + x * 2) * 0.06;
            ctx.fillStyle = `rgba(255,50,50,${atkPulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
            ctx.strokeStyle = 'rgba(255,50,50,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, pz + 0.5, TILE - 1, TILE - 1);
            // Crosshair
            ctx.strokeStyle = 'rgba(255,80,80,0.3)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(px + TILE / 2, pz + 2); ctx.lineTo(px + TILE / 2, pz + TILE - 2);
            ctx.moveTo(px + 2, pz + TILE / 2); ctx.lineTo(px + TILE - 2, pz + TILE / 2);
            ctx.stroke();
          }
          if (abilitySet.has(key)) {
            const ablPulse = 0.12 + Math.sin(timestamp * 0.004) * 0.05;
            ctx.fillStyle = `rgba(68,204,68,${ablPulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
          }

          // ── Subtle grid at high zoom ──
          if (effectiveZoom > 1.6) {
            ctx.strokeStyle = 'rgba(255,255,255,0.02)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, pz, TILE, TILE);
          }

          // ── Smoke overlay ──
          if (tile.hasSmoke) {
            const smokePulse = 0.2 + Math.sin(timestamp * 0.002 + x * 2) * 0.05;
            ctx.fillStyle = `rgba(180,200,220,${smokePulse})`;
            ctx.fillRect(px, pz, TILE, TILE);
          }

          // ── Loot ──
          if (tile.loot && !outOfZone) {
            const lp = 0.4 + Math.sin(timestamp * 0.005 + x * 3 + z * 7) * 0.25;
            // Outer glow
            const grad = ctx.createRadialGradient(px + TILE / 2, pz + TILE / 2, 0, px + TILE / 2, pz + TILE / 2, 10);
            grad.addColorStop(0, `rgba(255,204,68,${lp * 0.4})`);
            grad.addColorStop(1, `rgba(255,204,68,0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(px, pz, TILE, TILE);
            // Inner diamond
            ctx.fillStyle = `rgba(255,220,100,${lp})`;
            const cx = px + TILE / 2, cz = pz + TILE / 2;
            ctx.save();
            ctx.translate(cx, cz);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-3, -3, 6, 6);
            ctx.restore();
          }

          // ── Props ──
          if (tile.prop && !outOfZone) {
            const cx = px + TILE / 2;
            const cz = pz + TILE / 2;
            drawProp(ctx, tile.prop, cx, cz, tile.coverValue, n);
          }
        }
      }

      // ── Smoke clouds (lingering) ──
      smokeClouds.current = smokeClouds.current.filter(s => s.age < s.maxAge);
      for (const sc of smokeClouds.current) {
        sc.age += dt;
        const progress = sc.age / sc.maxAge;
        const alpha = (1 - progress) * 0.2;
        const r = sc.radius + progress * 10;
        const cx = sc.x * TILE + TILE / 2;
        const cz = sc.z * TILE + TILE / 2;
        const grad = ctx.createRadialGradient(cx, cz, 0, cx, cz, r);
        grad.addColorStop(0, `rgba(120,110,100,${alpha})`);
        grad.addColorStop(1, `rgba(120,110,100,0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cz, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Age scorch marks
      for (const sm of scorchMarks.current) { sm.age += dt * 0.3; }
      scorchMarks.current = scorchMarks.current.filter(s => s.age < 20);

      // ── Zone border ──
      if (state.shrinkLevel > 0) {
        const m = state.shrinkLevel * 2;
        const pulse = 0.3 + Math.sin(timestamp * 0.003) * 0.2;
        const innerX = m * TILE, innerZ = m * TILE;
        const innerW = (GRID_SIZE - m * 2) * TILE, innerH = (GRID_SIZE - m * 2) * TILE;
        // Glow border
        ctx.shadowColor = '#ff2222';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = `rgba(255,34,34,${pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(innerX, innerZ, innerW, innerH);
        ctx.shadowBlur = 0;
        // Inner soft glow
        ctx.strokeStyle = `rgba(255,80,40,${pulse * 0.3})`;
        ctx.lineWidth = 6;
        ctx.strokeRect(innerX - 2, innerZ - 2, innerW + 4, innerH + 4);
      }

      // ══════════════════════════════════
      // ── UNITS ──
      // ══════════════════════════════════
      // Sort units by z position for proper overlap
      const sortedUnits = [...state.units].sort((a, b) => a.position.z - b.position.z);

      for (const unit of sortedUnits) {
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

        const cx = anim.x * TILE + TILE / 2;
        const cz = anim.z * TILE + TILE / 2;
        const tc = TEAM_COLORS[unit.team];
        const [r, g, b] = hexRgb(tc);
        const isSelected = unit.id === state.selectedUnitId;

        ctx.save();
        ctx.translate(cx, cz);

        if (!unit.isAlive) ctx.globalAlpha = 1 - anim.deathProgress;

        // ── Ground shadow ──
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 2, UNIT_R, UNIT_R * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── Outer glow halo ──
        const glowPulse = isSelected ? (0.35 + Math.sin(timestamp * 0.005) * 0.15) : 0.12;
        const glowR = isSelected ? UNIT_R + 10 : UNIT_R + 5;
        const glowGrad = ctx.createRadialGradient(0, 0, UNIT_R - 3, 0, 0, glowR);
        glowGrad.addColorStop(0, `rgba(${r},${g},${b},${glowPulse})`);
        glowGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, glowR, 0, Math.PI * 2);
        ctx.fill();

        // ── Selected rotating ring ──
        if (isSelected) {
          ctx.save();
          ctx.rotate(timestamp * 0.002);
          ctx.strokeStyle = `rgba(${r},${g},${b},0.4)`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(0, 0, UNIT_R + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // ── HP arc (270°) ──
        const hpPct = unit.hp / unit.maxHp;
        const hpAngle = Math.PI * 1.5 * hpPct;
        const hpStart = -Math.PI * 0.75;

        // BG arc
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_R + 1.5, hpStart, hpStart + Math.PI * 1.5);
        ctx.stroke();

        // Fill arc
        const hpColor = hpPct > 0.5 ? '#44dd44' : hpPct > 0.25 ? '#ddaa22' : '#dd3322';
        ctx.strokeStyle = hpColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = hpColor;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_R + 1.5, hpStart, hpStart + hpAngle);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.lineCap = 'butt';

        // ── Center circle ──
        const flash = anim.flash;
        if (flash > 0.3) {
          ctx.fillStyle = '#ffffff';
        } else if (flash > 0) {
          ctx.fillStyle = `rgba(255,${200 - flash * 100},${200 - flash * 100},1)`;
        } else {
          // Gradient center
          const centerGrad = ctx.createRadialGradient(0, -2, 0, 0, 0, UNIT_R);
          centerGrad.addColorStop(0, '#282830');
          centerGrad.addColorStop(1, '#1a1a22');
          ctx.fillStyle = centerGrad;
        }
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_R, 0, Math.PI * 2);
        ctx.fill();

        // Team border ring
        ctx.strokeStyle = tc;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_R, 0, Math.PI * 2);
        ctx.stroke();

        // ── Facing indicator (small triangle) ──
        ctx.save();
        ctx.rotate(anim.facing);
        ctx.fillStyle = tc;
        ctx.beginPath();
        ctx.moveTo(UNIT_R + 3, 0);
        ctx.lineTo(UNIT_R - 1, -3);
        ctx.lineTo(UNIT_R - 1, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // ── Class icon ──
        ctx.fillStyle = '#ddd';
        ctx.font = `bold ${unit.unitClass === 'medic' ? 11 : 10}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(CLASS_ICONS[unit.unitClass] || '?', 0, 0);

        // ── Name tag ──
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const nameWidth = ctx.measureText(unit.name).width + 6;
        ctx.fillRect(-nameWidth / 2, -UNIT_R - 12, nameWidth, 8);
        ctx.fillStyle = '#ddd';
        ctx.font = 'bold 6px "Share Tech Mono", monospace';
        ctx.fillText(unit.name, 0, -UNIT_R - 8);

        // ── Kills ──
        if (unit.kills > 0) {
          ctx.fillStyle = 'rgba(255,50,50,0.8)';
          ctx.font = 'bold 7px "Share Tech Mono", monospace';
          ctx.fillText(`×${unit.kills}`, 0, UNIT_R + 9);
        }

        // ── Weapon indicator ──
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '7px sans-serif';
        ctx.fillText(unit.weapon.icon, UNIT_R + 5, 2);

        // ── Status badges ──
        let badgeY = -UNIT_R - 2;
        if (unit.isOnOverwatch) {
          ctx.fillStyle = '#4488ff';
          ctx.font = 'bold 7px sans-serif';
          ctx.fillText('◉', -UNIT_R - 5, badgeY);
          badgeY -= 8;
        }
        if (unit.coverType !== 'none') {
          ctx.fillStyle = unit.coverType === 'full' ? '#4488ff' : '#88aa44';
          ctx.beginPath();
          ctx.arc(-UNIT_R - 4, badgeY + 3, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // ── Attack preview on hover ──
      if (hoveredPos.current && state.phase === 'attack') {
        const hp = hoveredPos.current;
        const targetUnit = state.units.find(u => u.isAlive && u.position.x === hp.x && u.position.z === hp.z);
        if (targetUnit && state.attackPreview) {
          const px = hp.x * TILE + TILE / 2;
          const pz = hp.z * TILE + TILE / 2;

          // Preview panel
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          const panelW = 70, panelH = 36;
          ctx.fillRect(px - panelW / 2, pz - UNIT_R - 22 - panelH, panelW, panelH);
          ctx.strokeStyle = 'rgba(255,80,80,0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px - panelW / 2, pz - UNIT_R - 22 - panelH, panelW, panelH);

          ctx.fillStyle = '#fff';
          ctx.font = 'bold 9px "Share Tech Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${state.attackPreview.hitChance}% HIT`, px, pz - UNIT_R - 22 - panelH + 12);
          ctx.fillStyle = '#ff6644';
          ctx.font = '8px "Share Tech Mono", monospace';
          ctx.fillText(`~${state.attackPreview.expectedDamage} DMG`, px, pz - UNIT_R - 22 - panelH + 24);
          if (state.attackPreview.critChance > 0) {
            ctx.fillStyle = '#ffaa00';
            ctx.font = '7px "Share Tech Mono", monospace';
            ctx.fillText(`${state.attackPreview.critChance}% CRIT`, px, pz - UNIT_R - 22 - panelH + 34);
          }
          ctx.restore();
        }
      }

      // ══════════════════════════════════
      // ── VFX LAYERS ──
      // ══════════════════════════════════

      // Ambient particles
      for (const p of ambientParticles.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Wrap around visible area
        if (p.x < 0) p.x = GRID_SIZE * TILE;
        if (p.x > GRID_SIZE * TILE) p.x = 0;
        if (p.y < 0) p.y = GRID_SIZE * TILE;
        if (p.y > GRID_SIZE * TILE) p.y = 0;

        ctx.fillStyle = p.type === 'ember'
          ? `rgba(255,120,40,${p.alpha})`
          : p.type === 'ash'
          ? `rgba(180,170,160,${p.alpha})`
          : `rgba(200,190,170,${p.alpha})`;
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
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(fx, fz);
        ctx.lineTo(hx, hz);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Muzzle flash
        if (progress < 0.12) {
          const fSize = (1 - progress / 0.12) * 8;
          ctx.fillStyle = '#ffffcc';
          ctx.shadowColor = '#ffffaa';
          ctx.shadowBlur = 12;
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
        const alpha = (1 - progress) * 0.7;
        const radius = imp.maxR * progress;

        const ix = imp.x * TILE + TILE / 2;
        const iz = imp.z * TILE + TILE / 2;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = imp.color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = imp.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(ix, iz, radius, 0, Math.PI * 2);
        ctx.stroke();
        // Inner fill
        if (progress < 0.3) {
          ctx.fillStyle = `${imp.color}`;
          ctx.globalAlpha = alpha * 0.2;
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Debris particles
      debris.current = debris.current.filter(d => d.life < d.maxLife);
      for (const d of debris.current) {
        d.life += dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 200 * dt; // gravity
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
        const floatY = ft.age * 28;
        const alpha = Math.max(0, 1 - ft.age / 1.5);
        const bounce = ft.age < 0.12 ? (1 + Math.sin(ft.age / 0.12 * Math.PI) * 0.4) : 1;

        ctx.save();
        ctx.translate(px, pz - floatY - 10);
        ctx.scale(ft.scale * bounce, ft.scale * bounce);
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${ft.isCrit ? 11 : 9}px 'Share Tech Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Shadow
        ctx.fillStyle = '#000';
        ctx.fillText(ft.text, 1, 1);
        // Glow
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = ft.isCrit ? 8 : 4;
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Kill cam glow
      if (state.killCam) {
        const kx = state.killCam.targetPos.x * TILE + TILE / 2;
        const kz = state.killCam.targetPos.z * TILE + TILE / 2;
        const grad = ctx.createRadialGradient(kx, kz, 0, kx, kz, 50);
        grad.addColorStop(0, 'rgba(255,30,15,0.2)');
        grad.addColorStop(1, 'rgba(255,30,15,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(kx - 50, kz - 50, 100, 100);
      }

      ctx.restore(); // camera

      // ── Vignette overlay ──
      const vigGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);

      // Screen flash
      if (screenFlash.current.intensity > 0.01) {
        ctx.fillStyle = screenFlash.current.color;
        ctx.globalAlpha = screenFlash.current.intensity;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        screenFlash.current.intensity *= 0.88;
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
          <div className="absolute top-0 left-0 right-0 h-[9%] bg-black/85 transition-all duration-300" />
          <div className="absolute bottom-0 left-0 right-0 h-[9%] bg-black/85 transition-all duration-300" />
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.4) 100%)',
          }} />
          <div className="absolute bottom-[11%] left-6 animate-fade-in flex items-center gap-3">
            <div className="w-0.5 h-8 bg-destructive rounded-full" />
            <div>
              <div className="text-[7px] tracking-[0.5em] text-destructive/70 font-mono uppercase">ELIMINATED</div>
              <div className="text-xl font-black text-foreground tracking-wide"
                style={{ textShadow: '0 0 15px rgba(255,50,50,0.3), 0 2px 4px rgba(0,0,0,0.8)' }}>
                {state.killCam.victimName}
              </div>
              <div className="text-[8px] tracking-[0.12em] text-muted-foreground/60 font-mono mt-0.5">
                ▸ {state.killCam.killerName}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Draw prop helper ──
function drawProp(ctx: CanvasRenderingContext2D, prop: string, cx: number, cz: number, coverValue: number, n: number) {
  ctx.save();
  const coverAlpha = coverValue >= 2 ? 0.9 : 0.7;

  switch (prop) {
    case 'tree': {
      // Trunk
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(cx - 1.5, cz - 2, 3, 6);
      // Canopy layers
      ctx.fillStyle = `rgba(35,75,25,${coverAlpha})`;
      ctx.beginPath(); ctx.arc(cx, cz - 4, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(45,90,35,${coverAlpha * 0.8})`;
      ctx.beginPath(); ctx.arc(cx - 2, cz - 6, 5, 0, Math.PI * 2); ctx.fill();
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath(); ctx.ellipse(cx, cz + 4, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'rock': {
      ctx.fillStyle = '#4a4a52';
      ctx.beginPath();
      ctx.moveTo(cx - 6, cz + 3); ctx.lineTo(cx - 4, cz - 5);
      ctx.lineTo(cx + 4, cz - 6); ctx.lineTo(cx + 6, cz + 1);
      ctx.lineTo(cx + 3, cz + 4);
      ctx.closePath(); ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(cx - 3, cz - 4); ctx.lineTo(cx + 2, cz - 5); ctx.lineTo(cx + 1, cz - 2);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'crate': {
      ctx.fillStyle = '#5a4828';
      ctx.fillRect(cx - 5, cz - 5, 10, 10);
      // Cross pattern
      ctx.strokeStyle = '#3a2818';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cz - 5); ctx.lineTo(cx, cz + 5);
      ctx.moveTo(cx - 5, cz); ctx.lineTo(cx + 5, cz);
      ctx.stroke();
      // Top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(cx - 5, cz - 5, 10, 2);
      break;
    }
    case 'sandbag': {
      ctx.fillStyle = '#6a5d40';
      ctx.beginPath(); ctx.ellipse(cx, cz, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a6d50';
      ctx.beginPath(); ctx.ellipse(cx, cz - 2, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bush': {
      ctx.fillStyle = '#2a5820';
      ctx.beginPath(); ctx.arc(cx, cz, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a6830';
      ctx.beginPath(); ctx.arc(cx - 2, cz - 1, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'barrel': {
      ctx.fillStyle = '#3a3020';
      ctx.beginPath(); ctx.arc(cx, cz, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(cx, cz, 4.5, 0, Math.PI * 2); ctx.stroke();
      // Metallic ring
      ctx.strokeStyle = '#444';
      ctx.beginPath(); ctx.arc(cx, cz, 3, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'ruins': {
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(cx - 6, cz - 7, 4, 14);
      ctx.fillRect(cx + 2, cz - 4, 4, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(cx - 6, cz - 7, 4, 2);
      break;
    }
    case 'jersey_barrier': {
      ctx.fillStyle = '#6a6a6e';
      ctx.fillRect(cx - 9, cz - 2, 18, 4);
      ctx.fillStyle = '#7a7a80';
      ctx.fillRect(cx - 9, cz - 2, 18, 1);
      break;
    }
    case 'burnt_vehicle': {
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - 9, cz - 4, 18, 8);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 6, cz - 7, 12, 5);
      // Smoke wisps
      ctx.fillStyle = 'rgba(100,100,100,0.08)';
      ctx.beginPath(); ctx.arc(cx + 2, cz - 10, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'hesco': {
      ctx.fillStyle = '#5a5a40';
      ctx.fillRect(cx - 5, cz - 5, 10, 10);
      ctx.strokeStyle = '#4a4a30';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx - 5, cz - 5, 10, 10);
      break;
    }
    case 'foxhole': {
      ctx.fillStyle = '#3a3020';
      ctx.beginPath(); ctx.ellipse(cx, cz, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2018';
      ctx.beginPath(); ctx.ellipse(cx, cz, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'wire': {
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([1.5, 1.5]);
      ctx.beginPath();
      ctx.moveTo(cx - 8, cz - 1);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(cx - 8 + (i + 0.5) * 4, cz - 1 + (i % 2 === 0 ? -2 : 2));
      }
      ctx.lineTo(cx + 8, cz);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'tank_trap': {
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - 5, cz + 5); ctx.lineTo(cx + 5, cz - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 5, cz + 5); ctx.lineTo(cx - 5, cz - 5); ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = '#3a3a40';
      ctx.fillRect(cx - 4, cz - 4, 8, 8);
    }
  }
  ctx.restore();
}
