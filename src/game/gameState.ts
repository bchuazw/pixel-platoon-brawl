import {
  GameState, Unit, Position, TileData, Team, UnitClass, GRID_SIZE,
  CLASS_STATS, CLASS_ABILITIES, TileType, PropType, CombatEvent,
  AP_MOVE_COST, AP_ATTACK_COST, AttackPreview, AbilityId,
  WEAPONS, WeaponId, LootItem, LootType, Weapon, VISION_RANGE,
  KillstreakId, AirdropData,
} from './types';

// ── Random ──
function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const globalRand = () => Math.random();

let eventCounter = 0;
function makeEventId() { return `evt-${++eventCounter}-${Date.now()}`; }

// ── Simple noise for terrain ──
function simpleNoise(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, z: number, scale: number, seed: number): number {
  const sx = x / scale;
  const sz = z / scale;
  const ix = Math.floor(sx);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fz = sz - iz;
  // Smoothstep
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);

  const a = simpleNoise(ix, iz, seed);
  const b = simpleNoise(ix + 1, iz, seed);
  const c = simpleNoise(ix, iz + 1, seed);
  const d = simpleNoise(ix + 1, iz + 1, seed);

  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function getTerrainElevation(x: number, z: number, seed: number, flatZones?: Position[]): number {
  let elev = 0;
  elev += smoothNoise(x, z, 8, seed) * 1.2;
  elev += smoothNoise(x, z, 4, seed + 100) * 0.5;
  elev += smoothNoise(x, z, 2, seed + 200) * 0.15;

  // Flatten near spawn zones
  if (flatZones) {
    for (const zone of flatZones) {
      const dist = Math.sqrt((x - zone.x) ** 2 + (z - zone.z) ** 2);
      if (dist < 4) {
        elev *= Math.min(1, dist / 4);
      }
    }
  }

  return Math.max(0, Math.min(1.8, elev));
}

// ── Loot Generation ──
function generateLootItem(rand: () => number): LootItem {
  const roll = rand();
  if (roll < 0.14) {
    return { type: 'weapon', weaponId: 'rifle', value: 0, icon: '🔫', name: 'Assault Rifle' };
  } else if (roll < 0.24) {
    return { type: 'weapon', weaponId: 'shotgun', value: 0, icon: '💥', name: 'Shotgun' };
  } else if (roll < 0.32) {
    return { type: 'weapon', weaponId: 'sniper_rifle', value: 0, icon: '🎯', name: 'Sniper Rifle' };
  } else if (roll < 0.37) {
    return { type: 'weapon', weaponId: 'rocket_launcher', value: 0, icon: '🚀', name: 'Rocket Launcher' };
  } else if (roll < 0.45) {
    return { type: 'weapon', weaponId: 'smg', value: 0, icon: '⚡', name: 'SMG' };
  } else if (roll < 0.58) {
    return { type: 'medkit', value: 40, icon: '❤️', name: 'Medkit' };
  } else if (roll < 0.70) {
    return { type: 'armor', value: 8, icon: '🛡️', name: 'Armor Vest' };
  } else if (roll < 0.80) {
    return { type: 'ammo', value: 0, icon: '📦', name: 'Ammo Crate' };
  } else if (roll < 0.86) {
    return { type: 'killstreak', killstreakId: 'uav', value: 0, icon: '📡', name: 'UAV' };
  } else if (roll < 0.92) {
    return { type: 'killstreak', killstreakId: 'supply_drop', value: 0, icon: '📦', name: 'Supply Drop' };
  } else if (roll < 0.96) {
    return { type: 'killstreak', killstreakId: 'airstrike', value: 0, icon: '✈️', name: 'Airstrike' };
  } else {
    return { type: 'killstreak', killstreakId: 'emp', value: 0, icon: '⚡', name: 'EMP Blast' };
  }
}

// ── BFS Pathfinding ──
export function findPath(from: Position, to: Position, state: GameState): Position[] {
  if (from.x === to.x && from.z === to.z) return [to];

  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: Position[] = [from];
  visited.add(`${from.x},${from.z}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.x},${current.z}`;

    if (current.x === to.x && current.z === to.z) {
      // Reconstruct path
      const path: Position[] = [];
      let cur = `${to.x},${to.z}`;
      while (cur !== `${from.x},${from.z}`) {
        const [px, pz] = cur.split(',').map(Number);
        path.unshift({ x: px, z: pz });
        cur = parent.get(cur)!;
      }
      return path;
    }

    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = current.x + dx;
      const nz = current.z + dz;
      const nKey = `${nx},${nz}`;
      if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
      if (visited.has(nKey)) continue;
      const nextTile = state.grid[nx][nz];
      if (nextTile.isBlocked || nextTile.prop || nextTile.type === 'water') continue;
      if (state.units.some(u => u.isAlive && u.position.x === nx && u.position.z === nz &&
        !(nx === to.x && nz === to.z))) continue;

      visited.add(nKey);
      parent.set(nKey, key);
      queue.push({ x: nx, z: nz });
    }
  }

  // No path found, direct move
  return [to];
}

// ── Random spawn point generation ──
const MIN_SPAWN_DISTANCE = 8; // minimum manhattan distance between team spawns

function generateSpawnPoints(rand: () => number): Position[] {
  const margin = 3; // keep away from edges
  const max = GRID_SIZE - margin;
  const spawns: Position[] = [];
  let attempts = 0;

  while (spawns.length < 4 && attempts < 500) {
    attempts++;
    const x = margin + Math.floor(rand() * (max - margin));
    const z = margin + Math.floor(rand() * (max - margin));

    // Check distance from all existing spawns
    let tooClose = false;
    for (const s of spawns) {
      const dist = Math.abs(s.x - x) + Math.abs(s.z - z);
      if (dist < MIN_SPAWN_DISTANCE) { tooClose = true; break; }
    }
    if (!tooClose) {
      spawns.push({ x, z });
    }
  }

  // Fallback: spread evenly if random placement failed
  if (spawns.length < 4) {
    return [
      { x: 4, z: 4 },
      { x: GRID_SIZE - 5, z: GRID_SIZE - 5 },
      { x: GRID_SIZE - 5, z: 4 },
      { x: 4, z: GRID_SIZE - 5 },
    ];
  }

  return spawns;
}

// ── Grid Generation ──
function createGrid(spawnPoints: Position[]): TileData[][] {
  const grid: TileData[][] = [];
  const rand = seededRandom(Date.now());
  const terrainSeed = Date.now() % 10000;
  const center = GRID_SIZE / 2;

  for (let x = 0; x < GRID_SIZE; x++) {
    grid[x] = [];
    for (let z = 0; z < GRID_SIZE; z++) {
      const distFromCenter = Math.sqrt((x - center) ** 2 + (z - center) ** 2);
      const r = rand();

      let type: TileType = 'grass';
      let elevation = getTerrainElevation(x, z, terrainSeed, spawnPoints);

      // Paths through center
      const onHorizPath = Math.abs(z - center) <= 1 && x > 4 && x < GRID_SIZE - 5;
      const onVertPath = Math.abs(x - center) <= 1 && z > 4 && z < GRID_SIZE - 5;
      const onDiagPath1 = Math.abs(x - z) <= 1;
      const onDiagPath2 = Math.abs(x - (GRID_SIZE - 1 - z)) <= 1;

      if (onHorizPath || onVertPath) {
        type = 'dirt'; elevation = Math.max(0, elevation * 0.3);
      } else if ((onDiagPath1 || onDiagPath2) && r < 0.4) {
        type = 'sand'; elevation = Math.max(0, elevation * 0.4);
      } else if (distFromCenter < 4 && r < 0.3) {
        type = 'stone'; elevation = elevation + 0.1;
      } else if (elevation < 0.15 && r < 0.08) {
        type = 'water'; elevation = -0.15;
      } else if (elevation > 1.2) {
        type = 'stone';
      } else if (r < 0.03 && distFromCenter > 5) {
        type = 'water'; elevation = -0.15;
      }

      grid[x][z] = { x, z, elevation, type, prop: null, isBlocked: false, coverValue: 0, variant: Math.floor(rand() * 4), hasSmoke: false, loot: null, damaged: false, scorchMark: false };
    }
  }

  // Helper to set prop on tile safely
  const setTileProp = (x: number, z: number, prop: PropType, blocked: boolean, cover: 0 | 1 | 2) => {
    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return;
    const t = grid[x][z];
    if (t.type === 'water' || t.prop) return;
    t.prop = prop; t.isBlocked = blocked; t.coverValue = cover;
  };

  // ═══ TRENCH LINES ═══
  // Generate 3-6 trench lines across the map
  const trenchCount = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < trenchCount; i++) {
    const horizontal = rand() > 0.5;
    const startX = 4 + Math.floor(rand() * (GRID_SIZE - 8));
    const startZ = 4 + Math.floor(rand() * (GRID_SIZE - 8));
    const length = 4 + Math.floor(rand() * 6);

    for (let s = 0; s < length; s++) {
      const tx = horizontal ? startX + s : startX + Math.floor(rand() * 2 - 0.5);
      const tz = horizontal ? startZ + Math.floor(rand() * 2 - 0.5) : startZ + s;
      if (tx >= 0 && tx < GRID_SIZE && tz >= 0 && tz < GRID_SIZE && grid[tx][tz].type !== 'water') {
        grid[tx][tz].type = 'trench';
        grid[tx][tz].elevation = Math.max(-0.2, grid[tx][tz].elevation - 0.4);
        grid[tx][tz].coverValue = Math.max(grid[tx][tz].coverValue, 1) as 0 | 1 | 2;
      }
    }
    // Sandbags at trench ends
    if (horizontal) {
      setTileProp(startX - 1, startZ, 'sandbag', false, 2);
      setTileProp(startX + length, startZ, 'sandbag', false, 2);
    } else {
      setTileProp(startX, startZ - 1, 'sandbag', false, 2);
      setTileProp(startX, startZ + length, 'sandbag', false, 2);
    }
  }

  // ═══ FORTIFIED POSITIONS ═══
  // 4-7 fortified outposts with sandbags, HESCO, barrels
  const fortCount = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < fortCount; i++) {
    const fx = 5 + Math.floor(rand() * (GRID_SIZE - 10));
    const fz = 5 + Math.floor(rand() * (GRID_SIZE - 10));
    const fortType = rand();

    if (fortType < 0.3) {
      // L-shaped sandbag wall
      setTileProp(fx, fz, 'sandbag', false, 2);
      setTileProp(fx + 1, fz, 'sandbag', false, 2);
      setTileProp(fx, fz + 1, 'sandbag', false, 2);
      setTileProp(fx + 1, fz + 1, 'crate', true, 2);
    } else if (fortType < 0.55) {
      // HESCO bastion pair with barrel
      setTileProp(fx, fz, 'hesco', true, 2);
      setTileProp(fx + 1, fz, 'hesco', true, 2);
      setTileProp(fx, fz + 1, 'barrel', true, 1);
    } else if (fortType < 0.75) {
      // Foxhole with surrounding sandbags
      setTileProp(fx, fz, 'foxhole', false, 1);
      setTileProp(fx + 1, fz, 'sandbag', false, 2);
      setTileProp(fx - 1, fz, 'sandbag', false, 2);
      setTileProp(fx, fz - 1, 'sandbag', false, 2);
    } else {
      // Jersey barrier checkpoint
      setTileProp(fx, fz, 'jersey_barrier', true, 2);
      setTileProp(fx + 1, fz, 'jersey_barrier', true, 2);
      if (rand() > 0.5) setTileProp(fx + 2, fz, 'wire', false, 1);
    }
  }

  // ═══ VEHICLE WRECKS ═══
  const vehicleCount = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < vehicleCount; i++) {
    const vx = 4 + Math.floor(rand() * (GRID_SIZE - 8));
    const vz = 4 + Math.floor(rand() * (GRID_SIZE - 8));
    if (grid[vx][vz].type !== 'water' && !grid[vx][vz].prop) {
      setTileProp(vx, vz, 'burnt_vehicle', true, 2);
      // Debris around vehicle
      if (rand() > 0.4) setTileProp(vx + 1, vz, 'rock', true, 2);
      if (rand() > 0.6) setTileProp(vx, vz + 1, 'barrel', true, 1);
    }
  }

  // ═══ WIRE BARRIERS ═══
  const wireCount = 5 + Math.floor(rand() * 5);
  for (let i = 0; i < wireCount; i++) {
    const wx = 3 + Math.floor(rand() * (GRID_SIZE - 6));
    const wz = 3 + Math.floor(rand() * (GRID_SIZE - 6));
    const wLen = 2 + Math.floor(rand() * 3);
    const wHoriz = rand() > 0.5;
    for (let s = 0; s < wLen; s++) {
      const cx = wHoriz ? wx + s : wx;
      const cz = wHoriz ? wz : wz + s;
      setTileProp(cx, cz, 'wire', false, 1);
    }
  }

  // ═══ TANK TRAPS ═══
  const trapCount = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < trapCount; i++) {
    const tx = 5 + Math.floor(rand() * (GRID_SIZE - 10));
    const tz = 5 + Math.floor(rand() * (GRID_SIZE - 10));
    setTileProp(tx, tz, 'tank_trap', true, 1);
    if (rand() > 0.5) setTileProp(tx + 1, tz, 'tank_trap', true, 1);
  }

  // ═══ SCATTERED NATURAL/MILITARY COVER ═══
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let z = 0; z < GRID_SIZE; z++) {
      const t = grid[x][z];
      if (t.prop || t.type === 'water' || t.type === 'trench') continue;
      const distFromCenter = Math.sqrt((x - center) ** 2 + (z - center) ** 2);
      const propRoll = rand();

      if (t.type === 'dirt' || t.type === 'sand') {
        // Paths get occasional roadside cover
        if (propRoll < 0.04) setTileProp(x, z, 'jersey_barrier', true, 2);
        else if (propRoll < 0.06) setTileProp(x, z, 'barrel', true, 1);
        else if (propRoll < 0.07) setTileProp(x, z, 'rubble_pile', false, 1);
        else if (propRoll < 0.08) setTileProp(x, z, 'wrecked_car', true, 2);
      } else {
        if (propRoll < 0.018 && distFromCenter > 4) {
          setTileProp(x, z, 'tree', true, 2);
        } else if (propRoll < 0.035) {
          setTileProp(x, z, 'rock', true, 2);
        } else if (propRoll < 0.05) {
          setTileProp(x, z, 'bush', false, 1);
        } else if (propRoll < 0.06) {
          setTileProp(x, z, 'crate', true, 2);
        } else if (propRoll < 0.07) {
          setTileProp(x, z, 'barrel', true, 1);
        } else if (propRoll < 0.078 && distFromCenter > 6) {
          setTileProp(x, z, 'sandbag', false, 2);
        } else if (propRoll < 0.086 && distFromCenter > 5) {
          setTileProp(x, z, 'broken_wall', true, 2);
        } else if (propRoll < 0.094 && distFromCenter > 7) {
          grid[x][z].elevation += 0.3;
          setTileProp(x, z, 'ruins', true, 2);
        } else if (propRoll < 0.10 && distFromCenter > 4) {
          setTileProp(x, z, 'wrecked_car', true, 2);
        } else if (propRoll < 0.105) {
          setTileProp(x, z, 'rubble_pile', false, 1);
        }
      }
    }
  }

  // ═══ STRATEGIC COVER CLUSTERS ═══
  // Ensure good cover is spread around for tactical gameplay
  const coverPositions: Position[] = [];
  for (let i = 0; i < 40; i++) {
    const cx = 3 + Math.floor(rand() * (GRID_SIZE - 6));
    const cz = 3 + Math.floor(rand() * (GRID_SIZE - 6));
    coverPositions.push({ x: cx, z: cz });
    if (rand() > 0.3) coverPositions.push({ x: Math.min(GRID_SIZE - 1, cx + 1), z: cz });
    if (rand() > 0.4) coverPositions.push({ x: cx, z: Math.min(GRID_SIZE - 1, cz + 1) });
    if (rand() > 0.7) coverPositions.push({ x: Math.min(GRID_SIZE - 1, cx + 1), z: Math.min(GRID_SIZE - 1, cz + 1) });
  }
  const clusterProps: PropType[] = ['sandbag', 'crate', 'barrel', 'jersey_barrier', 'hesco', 'foxhole'];
  for (const pos of coverPositions) {
    if (pos.x < GRID_SIZE && pos.z < GRID_SIZE) {
      const t = grid[pos.x][pos.z];
      if (t.type !== 'water' && !t.prop) {
        const p = clusterProps[Math.floor(rand() * clusterProps.length)];
        const blocked = p !== 'sandbag' && p !== 'foxhole';
        const cv: 0 | 1 | 2 = (p === 'barrel' || p === 'foxhole') ? 1 : 2;
        setTileProp(pos.x, pos.z, p, blocked, cv);
      }
    }
  }

  // ═══ CLEAR SPAWN AREAS ═══
  for (const spawn of spawnPoints) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const cx = spawn.x + dx, cz = spawn.z + dz;
        if (cx >= 0 && cx < GRID_SIZE && cz >= 0 && cz < GRID_SIZE) {
          grid[cx][cz] = { ...grid[cx][cz], type: 'grass', prop: null, isBlocked: false, coverValue: 0, elevation: 0, hasSmoke: false, loot: null, damaged: false, scorchMark: false };
        }
      }
    }
    // Place starting cover near spawns (2 sandbag walls per spawn)
    const offsets = [
      { dx: -3, dz: 0 }, { dx: 3, dz: 0 }, { dx: 0, dz: -3 }, { dx: 0, dz: 3 },
    ];
    for (const off of offsets.slice(0, 2)) {
      const sx = spawn.x + off.dx, sz = spawn.z + off.dz;
      if (sx >= 0 && sx < GRID_SIZE && sz >= 0 && sz < GRID_SIZE) {
        setTileProp(sx, sz, 'sandbag', false, 2);
      }
    }
  }

  // ═══ SPAWN LOOT ═══
  const lootCount = 18 + Math.floor(rand() * 8);
  let placed = 0;
  let attempts = 0;
  while (placed < lootCount && attempts < 500) {
    attempts++;
    const lx = Math.floor(rand() * GRID_SIZE);
    const lz = Math.floor(rand() * GRID_SIZE);
    const tile = grid[lx][lz];
    const nearSpawn = spawnPoints.some(s => Math.abs(s.x - lx) <= 3 && Math.abs(s.z - lz) <= 3);
    if (!tile.isBlocked && tile.type !== 'water' && !tile.loot && !nearSpawn) {
      grid[lx][lz].loot = generateLootItem(rand);
      placed++;
    }
  }

  return grid;
}

// ── Unit Creation ──
function createUnit(id: string, name: string, unitClass: UnitClass, team: Team, position: Position): Unit {
  const stats = CLASS_STATS[unitClass];
  const pistol = { ...WEAPONS.pistol };
  return {
    id, name, unitClass, team, position,
    hp: stats.hp, maxHp: stats.hp,
    attack: pistol.attack, defense: stats.defense,
    accuracy: pistol.accuracy, moveRange: stats.moveRange,
    attackRange: pistol.range,
    ap: stats.maxAp, maxAp: stats.maxAp,
    isAlive: true, level: 1, xp: 0,
    abilities: [...CLASS_ABILITIES[unitClass]],
    cooldowns: {}, isOnOverwatch: false, isHunkered: false, isSuppressed: false,
    coverType: 'none', kills: 0,
    weapon: pistol,
    visionRange: VISION_RANGE,
    armor: 0,
    killstreak: null,
    uavTurnsLeft: 0,
    empTurnsLeft: 0,
  };
}

// ── Loot Pickup ──
export function pickupLoot(unit: Unit, tile: TileData): { picked: boolean; message: string } {
  if (!tile.loot) return { picked: false, message: '' };
  const loot = tile.loot;

  switch (loot.type) {
    case 'weapon': {
      if (loot.weaponId) {
        const newWeapon = { ...WEAPONS[loot.weaponId] };
        unit.weapon = newWeapon;
        unit.attack = newWeapon.attack;
        unit.accuracy = newWeapon.accuracy;
        unit.attackRange = newWeapon.range;
        tile.loot = null;
        return { picked: true, message: `📦 ${unit.name} picks up ${newWeapon.name}!` };
      }
      break;
    }
    case 'medkit': {
      const healAmt = Math.min(loot.value, unit.maxHp - unit.hp);
      if (healAmt > 0) {
        unit.hp += healAmt;
        tile.loot = null;
        return { picked: true, message: `❤️ ${unit.name} uses Medkit (+${healAmt} HP)!` };
      }
      return { picked: false, message: '' };
    }
    case 'armor': {
      unit.armor += loot.value;
      unit.defense += Math.floor(loot.value / 2);
      tile.loot = null;
      return { picked: true, message: `🛡️ ${unit.name} equips Armor (+${loot.value} DEF)!` };
    }
    case 'ammo': {
      if (unit.weapon.ammo !== -1) {
        unit.weapon.ammo = unit.weapon.maxAmmo;
        tile.loot = null;
        return { picked: true, message: `📦 ${unit.name} refills ammo!` };
      }
      break;
    }
    case 'killstreak': {
      if (loot.killstreakId && !unit.killstreak) {
        unit.killstreak = loot.killstreakId;
        tile.loot = null;
        return { picked: true, message: `🎖️ ${unit.name} picks up ${loot.name}! Ready to activate.` };
      } else if (loot.killstreakId && unit.killstreak) {
        // Already holding one — swap it
        unit.killstreak = loot.killstreakId;
        tile.loot = null;
        return { picked: true, message: `🎖️ ${unit.name} swaps killstreak for ${loot.name}!` };
      }
      break;
    }
  }
  tile.loot = null;
  return { picked: true, message: `📦 ${unit.name} picks up ${loot.name}!` };
}

// ── Killstreak Activation ──
export function activateKillstreak(unit: Unit, allUnits: Unit[], grid: TileData[][]): CombatEvent[] {
  if (!unit.killstreak) return [];
  const events: CombatEvent[] = [];
  const ks = unit.killstreak;
  unit.killstreak = null;

  switch (ks) {
    case 'uav': {
      // Boost vision for entire team for 3 turns
      for (const u of allUnits) {
        if (u.isAlive && u.team === unit.team) {
          u.uavTurnsLeft = 3;
          u.visionRange = VISION_RANGE + 4;
        }
      }
      events.push({ id: makeEventId(), type: 'ability', attackerPos: { ...unit.position }, targetPos: { ...unit.position }, message: `📡 ${unit.name} calls in UAV! Team vision boosted for 3 turns!`, timestamp: Date.now() });
      break;
    }
    case 'supply_drop': {
      // Full heal, refill ammo, +1 AP
      unit.hp = unit.maxHp;
      if (unit.weapon.ammo !== -1) unit.weapon.ammo = unit.weapon.maxAmmo;
      unit.ap = Math.min(unit.ap + 1, unit.maxAp + 1);
      events.push({ id: makeEventId(), type: 'ability', attackerPos: { ...unit.position }, targetPos: { ...unit.position }, message: `📦 ${unit.name} calls in Supply Drop! Full heal + ammo + AP!`, timestamp: Date.now() });
      break;
    }
    case 'airstrike': {
      // Deal 30 damage to all enemies within 3 tiles of unit
      const radius = 3;
      for (const enemy of allUnits) {
        if (!enemy.isAlive || enemy.team === unit.team) continue;
        if (getManhattanDistance(unit.position, enemy.position) <= radius) {
          const dmg = 25 + Math.floor(Math.random() * 15);
          enemy.hp -= dmg;
          if (enemy.hp <= 0) { enemy.hp = 0; enemy.isAlive = false; unit.kills++; }
          events.push({
            id: makeEventId(),
            type: enemy.isAlive ? 'damage' : 'kill',
            attackerPos: { ...unit.position }, targetPos: { ...enemy.position },
            value: dmg,
            message: enemy.isAlive
              ? `✈️ Airstrike hits ${enemy.name} for ${dmg} damage!`
              : `✈️💀 Airstrike kills ${enemy.name}!`,
            timestamp: Date.now(),
          });
        }
      }
      if (events.length === 0) {
        events.push({ id: makeEventId(), type: 'ability', attackerPos: { ...unit.position }, targetPos: { ...unit.position }, message: `✈️ ${unit.name} calls Airstrike but no enemies in range!`, timestamp: Date.now() });
      }
      break;
    }
    case 'emp': {
      // Suppress all enemies for 2 turns, disable overwatch
      for (const enemy of allUnits) {
        if (!enemy.isAlive || enemy.team === unit.team) continue;
        enemy.isSuppressed = true;
        enemy.isOnOverwatch = false;
        enemy.empTurnsLeft = 2;
      }
      events.push({ id: makeEventId(), type: 'ability', attackerPos: { ...unit.position }, targetPos: { ...unit.position }, message: `⚡ ${unit.name} activates EMP Blast! All enemies suppressed!`, timestamp: Date.now() });
      break;
    }
  }

  return events;
}

// ── Turn-based Killstreak Tick (call at start of team's turn) ──
export function tickKillstreakEffects(team: Team, units: Unit[]) {
  for (const u of units) {
    if (!u.isAlive) continue;
    // UAV countdown
    if (u.team === team && u.uavTurnsLeft > 0) {
      u.uavTurnsLeft--;
      if (u.uavTurnsLeft <= 0) {
        u.visionRange = VISION_RANGE;
      }
    }
    // EMP countdown
    if (u.team !== team && u.empTurnsLeft > 0) {
      u.empTurnsLeft--;
      if (u.empTurnsLeft <= 0) {
        u.isSuppressed = false;
      }
    }
  }
}
export function canUnitSee(unit: Unit, targetPos: Position): boolean {
  return getManhattanDistance(unit.position, targetPos) <= unit.visionRange;
}

export function teamCanSee(team: Team, targetPos: Position, units: Unit[]): boolean {
  return units.some(u => u.team === team && u.isAlive && canUnitSee(u, targetPos));
}

// ── Airdrop Generation ──
export function generateAirdrops(grid: TileData[][]): AirdropData[] {
  const count = 1 + (Math.random() < 0.4 ? 1 : 0); // 1-2 airdrops
  const drops: AirdropData[] = [];
  const margin = 3;
  
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 50) {
      attempts++;
      const x = margin + Math.floor(Math.random() * (GRID_SIZE - margin * 2));
      const z = margin + Math.floor(Math.random() * (GRID_SIZE - margin * 2));
      const tile = grid[x]?.[z];
      if (!tile || tile.isBlocked || tile.type === 'water' || tile.loot) continue;
      // Don't drop too close to another drop
      if (drops.some(d => Math.abs(d.targetPos.x - x) + Math.abs(d.targetPos.z - z) < 5)) continue;
      
      const loot = generateAirdropLoot();
      drops.push({
        id: `airdrop-${Date.now()}-${i}`,
        targetPos: { x, z },
        startTime: Date.now(),
        phase: 'flying',
        loot,
      });
      break;
    }
  }
  return drops;
}

function generateAirdropLoot(): LootItem {
  const roll = Math.random();
  if (roll < 0.25) return { type: 'weapon', weaponId: 'sniper_rifle', value: 0, icon: '🎯', name: 'Sniper Rifle' };
  if (roll < 0.45) return { type: 'weapon', weaponId: 'rocket_launcher', value: 0, icon: '🚀', name: 'Rocket Launcher' };
  if (roll < 0.6) return { type: 'medkit', value: 60, icon: '❤️', name: 'Field Surgery Kit' };
  if (roll < 0.75) return { type: 'armor', value: 15, icon: '🛡️', name: 'Heavy Armor' };
  if (roll < 0.88) return { type: 'killstreak', killstreakId: 'airstrike', value: 0, icon: '✈️', name: 'Airstrike' };
  return { type: 'killstreak', killstreakId: 'supply_drop', value: 0, icon: '📦', name: 'Supply Drop' };
}

export function getVisibleEnemies(unit: Unit, allUnits: Unit[]): Unit[] {
  return allUnits.filter(u =>
    u.isAlive && u.team !== unit.team &&
    teamCanSee(unit.team, u.position, allUnits)
  );
}

// ── State Init ──
export function createInitialState(): GameState {
  const spawnPoints = generateSpawnPoints(globalRand);
  const grid = createGrid(spawnPoints);

  const soldierNames = ['Marco', 'Ralf', 'Knox', 'Hawk', 'Blaze', 'Steel', 'Rex', 'Ace'];
  const medicNames = ['Mercy', 'Patch', 'Doc', 'Vita', 'Sage', 'Pulse', 'Angel', 'Fern'];

  const shuffle = (arr: string[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(globalRand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const shuffledSoldiers = shuffle(soldierNames);
  const shuffledMedics = shuffle(medicNames);
  let soldierIdx = 0;
  let medicIdx = 0;

  const teams: Team[] = ['blue', 'red', 'green', 'yellow'];
  const units: Unit[] = [];

  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    const spawn = spawnPoints[i];
    
    // Randomize medic position: 2-4 tiles away in a random direction
    const angle = globalRand() * Math.PI * 2;
    const dist = 2 + Math.floor(globalRand() * 3); // 2-4 tiles
    const medicPos = {
      x: Math.max(0, Math.min(GRID_SIZE - 1, spawn.x + Math.round(Math.cos(angle) * dist))),
      z: Math.max(0, Math.min(GRID_SIZE - 1, spawn.z + Math.round(Math.sin(angle) * dist))),
    };
    // Ensure medic doesn't land on blocked tile
    const medicTile = grid[medicPos.x]?.[medicPos.z];
    if (medicTile && (medicTile.isBlocked || medicTile.type === 'water' || medicTile.prop)) {
      // Fallback to adjacent
      medicPos.x = Math.max(0, Math.min(GRID_SIZE - 1, spawn.x + (globalRand() > 0.5 ? 1 : -1)));
      medicPos.z = Math.max(0, Math.min(GRID_SIZE - 1, spawn.z + (globalRand() > 0.5 ? 1 : -1)));
    }
    
    units.push(createUnit(`${team}-soldier`, shuffledSoldiers[soldierIdx++], 'soldier', team, { ...spawn }));
    units.push(createUnit(`${team}-medic`, shuffledMedics[medicIdx++], 'medic', team, medicPos));
  }

  const occupied = new Set<string>();
  for (const u of units) {
    let key = `${u.position.x},${u.position.z}`;
    while (occupied.has(key)) {
      u.position.x = Math.max(0, Math.min(GRID_SIZE - 1, u.position.x + (Math.random() > 0.5 ? 1 : -1)));
      u.position.z = Math.max(0, Math.min(GRID_SIZE - 1, u.position.z + (Math.random() > 0.5 ? 1 : -1)));
      key = `${u.position.x},${u.position.z}`;
    }
    occupied.add(key);
  }

  updateAllUnitsCover(units, grid);

  return {
    units, currentTeam: 'blue', selectedUnitId: null,
    phase: 'pre_game', turn: 1,
    movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
    activeAbility: null, grid,
    log: [
      '═══════════════════════════',
      '⚔ WARGAMING',
      '═══════════════════════════',
      '» 4 squads. 8 combatants. 1 team survives.',
      '» Each squad: 1 Soldier + 1 Medic',
      '» 2 AP per turn: Move (1 AP, 4 tiles) • Shoot/Hunker (ends turn)',
      '» Everyone starts with a PISTOL — find loot to upgrade!',
      '» Press PLAY to watch the AI battle!',
    ],
    shrinkLevel: 0, zoneTimer: 6,
    combatEvents: [], attackPreview: null, hoveredTile: null,
    autoPlay: false,
    movePath: null,
    movingUnitId: null,
    killCam: null,
    airdrops: [],
    nextAirdropRound: 7 + Math.floor(Math.random() * 4),
  };
}

// ── Cover System ──
export function getCoverFromDirection(pos: Position, attackerPos: Position, grid: TileData[][]): 'none' | 'half' | 'full' {
  const dx = Math.sign(attackerPos.x - pos.x);
  const dz = Math.sign(attackerPos.z - pos.z);

  const checkPositions = [
    { x: pos.x + dx, z: pos.z },
    { x: pos.x, z: pos.z + dz },
    { x: pos.x + dx, z: pos.z + dz },
  ];

  let bestCover: 'none' | 'half' | 'full' = 'none';
  for (const cp of checkPositions) {
    if (cp.x >= 0 && cp.x < GRID_SIZE && cp.z >= 0 && cp.z < GRID_SIZE) {
      const tile = grid[cp.x][cp.z];
      if (tile.coverValue === 2) bestCover = 'full';
      else if (tile.coverValue === 1 && bestCover === 'none') bestCover = 'half';
      if (tile.hasSmoke) bestCover = 'full';
    }
  }
  return bestCover;
}

function updateAllUnitsCover(units: Unit[], grid: TileData[][]) {
  for (const u of units) {
    if (!u.isAlive) continue;
    let best: 0 | 1 | 2 = 0;
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = u.position.x + dx, nz = u.position.z + dz;
      if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
        const cv = grid[nx][nz].coverValue;
        if (cv > best) best = cv;
        if (grid[nx][nz].hasSmoke && best < 2) best = 2;
      }
    }
    u.coverType = best === 2 ? 'full' : best === 1 ? 'half' : 'none';
  }
}

// ── Hit Chance ──
export function calcHitChance(attacker: Unit, defender: Unit, grid: TileData[][]): number {
  let chance = attacker.accuracy;
  const dist = getManhattanDistance(attacker.position, defender.position);
  const weaponRange = attacker.weapon.range;

  // Weapon range falloff — accuracy drops sharply beyond effective range
  if (dist > weaponRange) {
    chance -= (dist - weaponRange) * 15; // heavy penalty beyond range
  } else if (dist > Math.ceil(weaponRange * 0.6)) {
    chance -= (dist - Math.ceil(weaponRange * 0.6)) * 5; // mild penalty at long end
  }

  // Close range penalty for sniper
  if (attacker.weapon.id === 'sniper_rifle' && dist <= 2) chance -= 25;

  const cover = getCoverFromDirection(defender.position, attacker.position, grid);
  if (cover === 'half') chance -= 25;
  if (cover === 'full') chance -= 45;

  // Hunker down bonus — significantly harder to hit
  if (defender.isHunkered) chance -= 30;

  if (attacker.isSuppressed) chance -= 30;

  const aElev = grid[attacker.position.x]?.[attacker.position.z]?.elevation || 0;
  const dElev = grid[defender.position.x]?.[defender.position.z]?.elevation || 0;
  if (aElev > dElev + 0.3) chance += 15;

  if (attacker.weapon.id === 'shotgun' && dist <= 1) chance += 20;
  if (attacker.weapon.id === 'shotgun' && dist === 2) chance += 10;

  return Math.max(5, Math.min(95, chance));
}

export function calcCritChance(attacker: Unit, defender: Unit): number {
  let crit = 10;
  if (attacker.weapon.id === 'sniper_rifle') crit += 20;
  if (defender.coverType === 'none') crit += 10;
  const dist = getManhattanDistance(attacker.position, defender.position);
  if (dist <= 1) crit += 10;
  if (attacker.weapon.id === 'shotgun' && dist <= 2) crit += 15;
  return Math.min(45, crit);
}

export function getAttackPreview(attacker: Unit, defender: Unit, grid: TileData[][]): AttackPreview {
  const hitChance = calcHitChance(attacker, defender, grid);
  const critChance = calcCritChance(attacker, defender);
  const baseDmg = Math.max(1, attacker.attack - defender.defense * 0.4);
  const cover = getCoverFromDirection(defender.position, attacker.position, grid);
  return {
    targetId: defender.id,
    hitChance,
    expectedDamage: Math.floor(baseDmg),
    critChance,
    targetCover: cover,
  };
}

// ── Core Mechanics ──
export function getManhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

export function getMovableTiles(unit: Unit, state: GameState): Position[] {
  if (unit.ap < AP_MOVE_COST || unit.isSuppressed) return [];
  const tiles: Position[] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let z = 0; z < GRID_SIZE; z++) {
      const dist = getManhattanDistance(unit.position, { x, z });
      const tile = state.grid[x][z];
      if (dist > 0 && dist <= unit.moveRange && !tile.isBlocked && !tile.prop && tile.type !== 'water') {
        if (!state.units.some(u => u.isAlive && u.position.x === x && u.position.z === z)) {
          tiles.push({ x, z });
        }
      }
    }
  }
  return tiles;
}

export function getAttackableTiles(unit: Unit, state: GameState): Position[] {
  if (unit.ap < AP_ATTACK_COST) return [];
  if (unit.weapon.ammo === 0) return [];
  const tiles: Position[] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let z = 0; z < GRID_SIZE; z++) {
      const dist = getManhattanDistance(unit.position, { x, z });
      if (dist > 0 && dist <= unit.attackRange) {
        const target = state.units.find(u => u.isAlive && u.position.x === x && u.position.z === z && u.team !== unit.team);
        if (target) tiles.push({ x, z });
      }
    }
  }
  return tiles;
}

export function getAbilityTargetTiles(unit: Unit, abilityId: AbilityId, state: GameState): Position[] {
  const ability = unit.abilities.find(a => a.id === abilityId);
  if (!ability || unit.ap < ability.apCost) return [];
  if (unit.cooldowns[abilityId] && unit.cooldowns[abilityId] > 0) return [];

  const tiles: Position[] = [];
  switch (abilityId) {
    case 'grenade':
    case 'smoke':
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const dist = getManhattanDistance(unit.position, { x, z });
          if (dist > 0 && dist <= ability.range) tiles.push({ x, z });
        }
      }
      break;
    case 'first_aid':
      if (unit.hp < unit.maxHp) tiles.push(unit.position);
      for (const u of state.units) {
        if (u.isAlive && u.team === unit.team && u.id !== unit.id && u.hp < u.maxHp) {
          if (getManhattanDistance(unit.position, u.position) <= ability.range) {
            tiles.push(u.position);
          }
        }
      }
      break;
    case 'heal':
      for (const u of state.units) {
        if (u.isAlive && u.team === unit.team && u.id !== unit.id && u.hp < u.maxHp) {
          if (getManhattanDistance(unit.position, u.position) <= ability.range) {
            tiles.push(u.position);
          }
        }
      }
      break;
    case 'suppress':
      for (const u of state.units) {
        if (u.isAlive && u.team !== unit.team) {
          if (getManhattanDistance(unit.position, u.position) <= ability.range) {
            tiles.push(u.position);
          }
        }
      }
      break;
    case 'hunker_down':
      tiles.push(unit.position);
      break;
  }
  return tiles;
}

export function isInZone(x: number, z: number, shrinkLevel: number): boolean {
  const margin = shrinkLevel * 2;
  return x >= margin && x < GRID_SIZE - margin && z >= margin && z < GRID_SIZE - margin;
}

// ── Zone-aware movement scoring ──
function getZonePenalty(pos: Position, shrinkLevel: number): number {
  if (shrinkLevel === 0) return 0;
  if (!isInZone(pos.x, pos.z, shrinkLevel)) return -100;
  const nextMargin = (shrinkLevel + 1) * 2;
  if (pos.x < nextMargin || pos.x >= GRID_SIZE - nextMargin ||
      pos.z < nextMargin || pos.z >= GRID_SIZE - nextMargin) {
    return -15;
  }
  return 0;
}

// ── Combat Resolution ──
export function performAttack(
  attacker: Unit, defender: Unit, grid: TileData[][]
): { damage: number; killed: boolean; hit: boolean; crit: boolean; events: CombatEvent[] } {
  const events: CombatEvent[] = [];

  if (attacker.weapon.ammo > 0) attacker.weapon.ammo--;

  const hitChance = calcHitChance(attacker, defender, grid);
  const critChance = calcCritChance(attacker, defender);
  const roll = Math.random() * 100;

  if (roll > hitChance) {
    events.push({
      id: makeEventId(), type: 'miss',
      attackerPos: { ...attacker.position }, targetPos: { ...defender.position },
      message: `${attacker.name} MISSED ${defender.name}! [${attacker.weapon.name}]`,
      timestamp: Date.now(), weaponId: attacker.weapon.id,
    });
    return { damage: 0, killed: false, hit: false, crit: false, events };
  }

  const isCrit = Math.random() * 100 < critChance;
  const baseDmg = Math.max(1, attacker.attack - defender.defense * 0.4);
  const variance = 0.85 + Math.random() * 0.3;
  let damage = Math.floor(baseDmg * variance);
  if (isCrit) damage = Math.floor(damage * 1.5);
  if (attacker.weapon.id === 'rocket_launcher') damage = Math.floor(damage * 1.2);

  defender.hp -= damage;
  const killed = defender.hp <= 0;
  if (killed) {
    defender.hp = 0;
    defender.isAlive = false;
    attacker.xp += 50;
    attacker.kills++;
  } else {
    attacker.xp += 10;
  }

  if (attacker.xp >= 100) {
    attacker.xp -= 100; attacker.level++;
    attacker.maxHp += 10; attacker.hp = Math.min(attacker.hp + 10, attacker.maxHp);
    attacker.attack += 2; attacker.defense += 1; attacker.accuracy += 2;
  }

  const weaponTag = `[${attacker.weapon.name}]`;
  events.push({
    id: makeEventId(),
    type: killed ? 'kill' : isCrit ? 'crit' : 'damage',
    attackerPos: { ...attacker.position }, targetPos: { ...defender.position },
    value: damage,
    message: killed
      ? `💀 ${attacker.name} ELIMINATED ${defender.name}! (${damage} dmg) ${weaponTag}`
      : isCrit
        ? `💥 CRITICAL! ${attacker.name} → ${defender.name} for ${damage} dmg ${weaponTag}`
        : `${attacker.name} → ${defender.name} for ${damage} dmg ${weaponTag}`,
    timestamp: Date.now(), weaponId: attacker.weapon.id,
  });

  // Environmental destruction
  applyEnvironmentalDamage(grid, defender.position, isCrit || killed ? 2 : 1);

  return { damage, killed, hit: true, crit: isCrit, events };
}

// ── Environmental Destruction ──
export function applyEnvironmentalDamage(grid: TileData[][], pos: Position, intensity: number) {
  const tile = grid[pos.x]?.[pos.z];
  if (!tile) return;

  // Mark tile as damaged
  tile.damaged = true;
  tile.scorchMark = true;

  // Destroy cover objects on direct hit
  if (tile.prop && intensity >= 2) {
    const destructible = ['crate', 'barrel', 'bush', 'wire', 'sandbag', 'foxhole', 'rubble_pile'];
    if (destructible.includes(tile.prop)) {
      tile.prop = null;
      tile.isBlocked = false;
      tile.coverValue = 0;
    }
  }

  // Area damage for high intensity (explosions)
  if (intensity >= 2) {
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = pos.x + dx, nz = pos.z + dz;
      if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
        const neighbor = grid[nx][nz];
        neighbor.scorchMark = true;
        // Small chance to destroy nearby props
        if (Math.random() < 0.3 && neighbor.prop) {
          const fragile = ['bush', 'wire', 'crate'];
          if (fragile.includes(neighbor.prop)) {
            neighbor.prop = null;
            neighbor.isBlocked = false;
            neighbor.coverValue = 0;
          }
        }
      }
    }
  }
}

// ── Explosion Destruction (grenades, airstrikes, rockets) ──
export function applyExplosionDamage(grid: TileData[][], center: Position, radius: number) {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const nx = center.x + dx, nz = center.z + dz;
      if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
      const dist = Math.abs(dx) + Math.abs(dz);
      if (dist > radius) continue;

      const tile = grid[nx][nz];
      tile.scorchMark = true;

      if (dist === 0) {
        // Ground zero — crater
        tile.type = 'crater';
        tile.elevation = Math.max(-0.2, tile.elevation - 0.3);
        tile.prop = null;
        tile.isBlocked = false;
        tile.coverValue = 0;
        tile.damaged = true;
      } else if (dist <= 1) {
        tile.damaged = true;
        // Destroy most props near center
        if (tile.prop && Math.random() < 0.7) {
          tile.prop = null;
          tile.isBlocked = false;
          tile.coverValue = 0;
        }
      } else {
        // Outer ring — chance to destroy fragile props
        if (tile.prop && Math.random() < 0.25) {
          const fragile = ['bush', 'wire', 'crate', 'barrel'];
          if (fragile.includes(tile.prop)) {
            tile.prop = null;
            tile.isBlocked = false;
            tile.coverValue = 0;
          }
        }
      }
    }
  }
}

// ── Team Management ──
export function getNextTeam(currentTeam: Team, units: Unit[]): Team | null {
  const order: Team[] = ['blue', 'red', 'green', 'yellow'];
  const idx = order.indexOf(currentTeam);
  for (let i = 1; i <= 4; i++) {
    const next = order[(idx + i) % 4];
    if (units.some(u => u.team === next && u.isAlive)) return next;
  }
  return null;
}

export function getAliveTeams(units: Unit[]): Team[] {
  const teams = new Set<Team>();
  units.filter(u => u.isAlive).forEach(u => teams.add(u.team));
  return Array.from(teams);
}

// ══════════════════════════════════════════════
// ── AI: Per-unit step with 2-turn lookahead ──
// XCOM-style: shooting ends your turn (consumes all remaining AP)
// phase: 'move' = movement + loot only, 'combat' = attack/abilities only
// ══════════════════════════════════════════════

// Find nearest loot tile for scouting/looting AI
function findNearestLoot(pos: Position, grid: TileData[][]): Position | null {
  let nearest: Position | null = null;
  let nearestDist = Infinity;
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let z = 0; z < GRID_SIZE; z++) {
      if (grid[x][z].loot) {
        const d = Math.abs(pos.x - x) + Math.abs(pos.z - z);
        if (d < nearestDist) { nearestDist = d; nearest = { x, z }; }
      }
    }
  }
  return nearest;
}

// Score a position for tactical value (used for lookahead)
function scoreTacticalPosition(pos: Position, unit: Unit, enemies: Unit[], state: GameState): number {
  let score = getZonePenalty(pos, state.shrinkLevel);
  const tile = state.grid[pos.x]?.[pos.z];
  if (!tile) return -999;

  // ── Cover is king — heavily prioritize being behind cover ──
  let coverScore = 0;
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = pos.x + dx, nz = pos.z + dz;
    if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
      coverScore += state.grid[nx][nz].coverValue * 5;
    }
  }
  score += tile.coverValue * 4;
  score += coverScore;

  // Elevation advantage
  score += tile.elevation * 5;

  // Enemy proximity — RANGED combat: maintain optimal distance
  const visibleEnemies = enemies.filter(e => getManhattanDistance(pos, e.position) <= unit.visionRange);
  const inAttackRange = visibleEnemies.filter(e => getManhattanDistance(pos, e.position) <= unit.attackRange);
  const weaponRange = unit.weapon.range;

  if (inAttackRange.length > 0) {
    score += 25; // Can attack from here
    const weakest = inAttackRange.reduce((a, b) => a.hp < b.hp ? a : b);
    if (weakest.hp < 30) score += 15;
  }

  // ── Maintain optimal engagement distance — stay at MAX weapon range ──
  for (const enemy of visibleEnemies) {
    const dist = getManhattanDistance(pos, enemy.position);
    // Too close — penalize heavily (ranged units shouldn't melee)
    if (dist <= 1) score -= 35;
    else if (dist === 2 && unit.weapon.id !== 'shotgun') score -= 15;
    // Best position: at weapon's max range (can still shoot but far away)
    if (dist === weaponRange) score += 20;
    else if (dist === weaponRange - 1 && weaponRange >= 3) score += 12;
    // Bonus for being farther from enemies while still in range
    if (dist >= Math.max(2, weaponRange - 1) && dist <= weaponRange) score += 15;
    // Penalty for being within half weapon range (too close for comfort)
    if (dist <= Math.ceil(weaponRange * 0.4) && unit.weapon.id !== 'shotgun') score -= 10;
  }

  // Weapon-specific positioning
  if (unit.weapon.id === 'sniper_rifle') {
    score += tile.elevation * 10;
    const nearestEnemy = visibleEnemies[0];
    if (nearestEnemy) {
      const dist = getManhattanDistance(pos, nearestEnemy.position);
      if (dist >= 4 && dist <= weaponRange) score += 20;
      if (dist < 3) score -= 30;
    }
  } else if (unit.weapon.id === 'shotgun') {
    const nearestEnemy = visibleEnemies[0];
    if (nearestEnemy) {
      const dist = getManhattanDistance(pos, nearestEnemy.position);
      if (dist <= 2) score += 15;
      else score -= dist * 3;
    }
  }

  // ── Loot seeking — higher priority when no enemies visible ──
  if (tile.loot) {
    const lootBonus = visibleEnemies.length === 0 ? 30 : 12;
    score += lootBonus;
    if (tile.loot.type === 'weapon') score += 10;
    if (tile.loot.type === 'killstreak') score += 15;
  }

  // Don't cluster with allies
  const allyNear = state.units.filter(u => u.isAlive && u.team === unit.team && u.id !== unit.id)
    .some(u => getManhattanDistance(pos, u.position) <= 1);
  if (allyNear) score -= 8;

  return score;
}

// 2-turn lookahead: evaluate current position + what we can do next turn
function evaluateWithLookahead(pos: Position, unit: Unit, enemies: Unit[], state: GameState): number {
  let score = scoreTacticalPosition(pos, unit, enemies, state);

  // Simulate next turn: what tiles can we reach from this position?
  const fakeUnit = { ...unit, position: pos, ap: unit.maxAp };
  const futureMovable = getMovableTiles(fakeUnit, state);

  if (futureMovable.length > 0) {
    // Best future position score (discounted)
    let bestFutureScore = -Infinity;
    // Sample up to 8 future positions for performance
    const sampled = futureMovable.length <= 8 ? futureMovable :
      futureMovable.filter((_, i) => i % Math.ceil(futureMovable.length / 8) === 0);
    for (const ft of sampled) {
      const futureScore = scoreTacticalPosition(ft, unit, enemies, state);
      if (futureScore > bestFutureScore) bestFutureScore = futureScore;
    }
    score += bestFutureScore * 0.3; // 30% weight on next-turn potential
  }

  return score;
}

export function runAiUnitStep(
  unitId: string,
  state: GameState,
  phase: 'move' | 'combat' = 'combat'
): { state: GameState; events: CombatEvent[]; didMove: boolean } {
  const newState = {
    ...state,
    units: state.units.map(u => ({ ...u, weapon: { ...u.weapon } })),
    grid: state.grid.map(row => row.map(t => ({ ...t, loot: t.loot ? { ...t.loot } : null }))),
  };
  const allEvents: CombatEvent[] = [];
  let didMove = false;

  const unit = newState.units.find(u => u.id === unitId);
  if (!unit || !unit.isAlive) return { state: newState, events: allEvents, didMove };

  const allEnemies = newState.units.filter(u => u.isAlive && u.team !== unit.team);
  if (allEnemies.length === 0) return { state: newState, events: allEvents, didMove };

  const visibleEnemies = getVisibleEnemies(unit, newState.units);
  const allies = newState.units.filter(u => u.isAlive && u.team === unit.team && u.id !== unit.id);

  let closest: Unit | null = visibleEnemies.length > 0 ? visibleEnemies[0] : null;
  if (closest) {
    let closestDist = getManhattanDistance(unit.position, closest.position);
    for (const e of visibleEnemies) {
      const d = getManhattanDistance(unit.position, e.position);
      if (d < closestDist) { closest = e; closestDist = d; }
    }
  }

  // Helper to move unit and return path (optionally to an intermediate stop along the path)
  const moveToTile = (bestTile: Position) => {
    const path = findPath(unit.position, bestTile, newState);
    unit.position = bestTile;
    unit.ap -= AP_MOVE_COST;
    didMove = true;
    newState.movePath = path;
    newState.movingUnitId = unit.id;

    const arrivalTile = newState.grid[bestTile.x][bestTile.z];
    if (arrivalTile.loot) {
      const { picked, message } = pickupLoot(unit, arrivalTile);
      if (picked) {
        allEvents.push({ id: makeEventId(), type: 'loot', attackerPos: { ...unit.position }, targetPos: { ...unit.position }, message, timestamp: Date.now() });
        newState.log = [...newState.log, message];
      }
    }
  };

  // ── Helper: scan path for enemies — find best tile to stop at where we can shoot ──
  function findBestStopAlongPath(from: Position, to: Position): Position | null {
    const path = findPath(from, to, newState);
    // Walk along path and check each tile for attack opportunities
    for (let i = 0; i < path.length; i++) {
      const tile = path[i];
      const enemiesInRange = allEnemies.filter(e => 
        e.isAlive && getManhattanDistance(tile, e.position) <= unit.attackRange &&
        teamCanSee(unit.team, e.position, newState.units)
      );
      if (enemiesInRange.length > 0) {
        // Check if this tile has cover
        let coverScore = 0;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = tile.x + dx, nz = tile.z + dz;
          if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
            coverScore += newState.grid[nx][nz].coverValue;
          }
        }
        // Prefer stopping at tiles with cover, but any tile with enemies in range is good
        if (coverScore > 0 || i >= path.length - 1) {
          return tile;
        }
        // If no cover, check next few tiles for cover
        for (let j = i + 1; j < Math.min(i + 3, path.length); j++) {
          const nextTile = path[j];
          const stillInRange = enemiesInRange.some(e => 
            getManhattanDistance(nextTile, e.position) <= unit.attackRange
          );
          if (stillInRange) {
            let nextCover = 0;
            for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const nx = nextTile.x + dx, nz = nextTile.z + dz;
              if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
                nextCover += newState.grid[nx][nz].coverValue;
              }
            }
            if (nextCover > coverScore) return nextTile;
          }
        }
        return tile; // Stop here
      }
    }
    return null; // No enemies found along path
  }

  // ══ MOVE PHASE ══
  // Units can spend 1 or 2 AP on movement (4 tiles per AP, up to 8 total)
  if (phase === 'move') {
    // Killstreak activation
    if (unit.killstreak && visibleEnemies.length > 0) {
      const shouldUse = unit.killstreak === 'uav' || unit.killstreak === 'supply_drop'
        || (unit.killstreak === 'airstrike' && visibleEnemies.some(e => getManhattanDistance(unit.position, e.position) <= 3))
        || (unit.killstreak === 'emp' && visibleEnemies.length >= 2);
      if (shouldUse) {
        const ksEvents = activateKillstreak(unit, newState.units, newState.grid);
        allEvents.push(...ksEvents);
        newState.log = [...newState.log, ...ksEvents.map(e => e.message)];
      }
    }

    // Flee zone
    const currentlyOutsideZone = newState.shrinkLevel > 0 && !isInZone(unit.position.x, unit.position.z, newState.shrinkLevel);
    if (currentlyOutsideZone && unit.ap >= AP_MOVE_COST && !unit.isSuppressed) {
      const movable = getMovableTiles(unit, newState);
      if (movable.length > 0) {
        const center = { x: Math.floor(GRID_SIZE / 2), z: Math.floor(GRID_SIZE / 2) };
        let bestTile = movable[0];
        let bestScore = -Infinity;
        for (const t of movable) {
          let score = 0;
          if (isInZone(t.x, t.z, newState.shrinkLevel)) score += 200;
          score -= getManhattanDistance(t, center);
          if (score > bestScore) { bestTile = t; bestScore = score; }
        }
        moveToTile(bestTile);
        // If still outside zone and has AP, move again
        if (unit.ap >= AP_MOVE_COST && !isInZone(unit.position.x, unit.position.z, newState.shrinkLevel)) {
          const movable2 = getMovableTiles(unit, newState);
          if (movable2.length > 0) {
            let bestTile2 = movable2[0];
            let bestScore2 = -Infinity;
            for (const t of movable2) {
              let score = 0;
              if (isInZone(t.x, t.z, newState.shrinkLevel)) score += 200;
              score -= getManhattanDistance(t, center);
              if (score > bestScore2) { bestTile2 = t; bestScore2 = score; }
            }
            moveToTile(bestTile2);
          }
        }
      }
      updateAllUnitsCover(newState.units, newState.grid);
      return { state: newState, events: allEvents, didMove };
    }

    // MEDIC MOVE
    if (unit.unitClass === 'medic') {
      // Heal first (uses 1 AP)
      const firstAid = unit.abilities.find(a => a.id === 'first_aid');
      if (firstAid && unit.ap >= firstAid.apCost && (!unit.cooldowns['first_aid'] || unit.cooldowns['first_aid'] <= 0)) {
        let healTarget: Unit | null = null;
        if (unit.hp < unit.maxHp * 0.5) healTarget = unit;
        if (!healTarget) {
          const injuredAlly = allies.find(a =>
            a.hp < a.maxHp * 0.6 && getManhattanDistance(unit.position, a.position) <= firstAid.range
          );
          if (injuredAlly) healTarget = injuredAlly;
        }
        if (healTarget) {
          const healAmt = 35;
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmt);
          unit.ap -= firstAid.apCost;
          unit.cooldowns['first_aid'] = firstAid.cooldown;
          const isSelf = healTarget.id === unit.id;
          allEvents.push({
            id: makeEventId(), type: 'heal',
            attackerPos: { ...unit.position }, targetPos: { ...healTarget.position },
            value: healAmt,
            message: isSelf
              ? `💊 ${unit.name} uses FIRST AID on self (+${healAmt} HP)!`
              : `💊 ${unit.name} uses FIRST AID on ${healTarget.name} (+${healAmt} HP)!`,
            timestamp: Date.now(),
          });
          newState.log = [...newState.log, allEvents[allEvents.length - 1].message];
        }
      }

      // Medic movement — ONE move per step (to sync with walk animation)
      if (unit.ap >= AP_MOVE_COST && !unit.isSuppressed) {
        const movable = getMovableTiles(unit, newState);
        if (movable.length > 0) {
          const currentScore = evaluateWithLookahead(unit.position, unit, allEnemies, newState);
          let bestTile = unit.position;
          let bestScore = currentScore;

          const injuredAlly = allies.find(a => a.hp < a.maxHp * 0.7);
          const stayNearTarget = injuredAlly || allies[0];

          for (const t of movable) {
            let score = evaluateWithLookahead(t, unit, allEnemies, newState);
            if (stayNearTarget) {
              const distToAlly = getManhattanDistance(t, stayNearTarget.position);
              score += -Math.abs(distToAlly - 2) * 5;
            }
            if (closest) {
              const distToEnemy = getManhattanDistance(t, closest.position);
              if (distToEnemy <= 2) score -= 15;
            }
            if (score > bestScore) { bestTile = t; bestScore = score; }
          }

          if (bestTile.x !== unit.position.x || bestTile.z !== unit.position.z) {
            if (bestScore > currentScore + 3) {
              moveToTile(bestTile);
            }
          }
        }
      }
    } else {
      // SOLDIER MOVE — can spend 1 or 2 AP on movement
      // Strategy: if enemies visible and in range, don't move (save AP to shoot)
      // If enemies visible but not in range, move toward optimal position
      // If no enemies visible, spend both AP on scouting/looting
      
      if (unit.ap >= AP_MOVE_COST && !unit.isSuppressed) {
        const canShootFromHere = visibleEnemies.some(e =>
          getManhattanDistance(unit.position, e.position) <= unit.attackRange
        ) && unit.weapon.ammo !== 0;

        const hasGoodCover = unit.coverType === 'full' || unit.coverType === 'half';
        
        if (canShootFromHere && hasGoodCover) {
          // Stay and shoot — don't move
        } else if (visibleEnemies.length > 0 && !canShootFromHere) {
          // Enemies visible but out of range — move toward weapon max range
          const movable = getMovableTiles(unit, newState);
          let bestTile = unit.position;
          let bestScore = -Infinity;

          for (const t of movable) {
            let score = evaluateWithLookahead(t, unit, allEnemies, newState);
            // Bonus for getting in attack range
            const inRangeFromT = visibleEnemies.some(e => getManhattanDistance(t, e.position) <= unit.attackRange);
            if (inRangeFromT) score += 30;
            if (score > bestScore) { bestTile = t; bestScore = score; }
          }

          if (bestTile.x !== unit.position.x || bestTile.z !== unit.position.z) {
            // Check path for mid-movement target detection
            const stopTile = findBestStopAlongPath(unit.position, bestTile);
            if (stopTile && (stopTile.x !== bestTile.x || stopTile.z !== bestTile.z)) {
              moveToTile(stopTile); // Stop early — enemy spotted along path
            } else {
              moveToTile(bestTile);
            }
          }
        } else if (visibleEnemies.length === 0) {
          // No enemies visible — ONE move per step for scouting/looting
          if (unit.ap >= AP_MOVE_COST && !unit.isSuppressed) {
            const movable = getMovableTiles(unit, newState);
            if (movable.length > 0) {
              let bestTile = unit.position;
              let bestScore = -Infinity;
              const currentScore = evaluateWithLookahead(unit.position, unit, allEnemies, newState);

              for (const t of movable) {
                let score = evaluateWithLookahead(t, unit, allEnemies, newState);
                const nearestLoot = findNearestLoot(t, newState.grid);
                if (nearestLoot) {
                  score += Math.max(0, 20 - getManhattanDistance(t, nearestLoot) * 3);
                }
                const centerDist = getManhattanDistance(t, { x: Math.floor(GRID_SIZE/2), z: Math.floor(GRID_SIZE/2) });
                score += Math.max(0, 10 - centerDist);
                if (score > bestScore) { bestTile = t; bestScore = score; }
              }

              if ((bestTile.x !== unit.position.x || bestTile.z !== unit.position.z) && bestScore > currentScore) {
                const stopTile = findBestStopAlongPath(unit.position, bestTile);
                if (stopTile) {
                  moveToTile(stopTile);
                } else {
                  moveToTile(bestTile);
                }
              }
            }
          }
        } else {
          // Can shoot but no cover — try to reposition to cover then shoot
          const movable = getMovableTiles(unit, newState);
          let bestTile = unit.position;
          let bestScore = evaluateWithLookahead(unit.position, unit, allEnemies, newState);

          for (const t of movable) {
            const score = evaluateWithLookahead(t, unit, allEnemies, newState);
            // Must still be in attack range after moving
            const inRangeFromT = visibleEnemies.some(e => getManhattanDistance(t, e.position) <= unit.attackRange);
            if (inRangeFromT && score > bestScore) { bestTile = t; bestScore = score; }
          }

          if (bestTile.x !== unit.position.x || bestTile.z !== unit.position.z) {
            moveToTile(bestTile);
          }
        }
      }
    }

    updateAllUnitsCover(newState.units, newState.grid);
    return { state: newState, events: allEvents, didMove };
  }

  // ══ COMBAT PHASE ══
  // XCOM rule: shooting ends your turn (set AP to 0 after shooting)

  const currentlyOutsideZone = newState.shrinkLevel > 0 && !isInZone(unit.position.x, unit.position.z, newState.shrinkLevel);
  if (currentlyOutsideZone) {
    if (unit.ap >= AP_ATTACK_COST && unit.weapon.ammo !== 0) {
      const visAfterFlee = getVisibleEnemies(unit, newState.units);
      const inRange = visAfterFlee.filter(e => getManhattanDistance(unit.position, e.position) <= unit.attackRange);
      if (inRange.length > 0) {
        let bestTarget = inRange[0];
        for (const t of inRange) { if (t.hp < bestTarget.hp) bestTarget = t; }
        const result = performAttack(unit, bestTarget, newState.grid);
        allEvents.push(...result.events);
        newState.log = [...newState.log, ...result.events.map(e => e.message)];
        unit.ap = 0; // Shooting ends turn
      }
    }
    updateAllUnitsCover(newState.units, newState.grid);
    return { state: newState, events: allEvents, didMove };
  }

  // MEDIC COMBAT
  if (unit.unitClass === 'medic') {
    if (unit.ap >= AP_ATTACK_COST && unit.weapon.ammo !== 0) {
      const visibleAfterMove = getVisibleEnemies(unit, newState.units);
      const inRange = visibleAfterMove.filter(e => getManhattanDistance(unit.position, e.position) <= unit.attackRange);
      if (inRange.length > 0) {
        let bestTarget = inRange[0];
        for (const t of inRange) { if (t.hp < bestTarget.hp) bestTarget = t; }
        const result = performAttack(unit, bestTarget, newState.grid);
        allEvents.push(...result.events);
        newState.log = [...newState.log, ...result.events.map(e => e.message)];
        unit.ap = 0; // Shooting ends turn
      }
    }

    // Smoke (only if didn't shoot)
    if (unit.ap > 0) {
      const smokeAbility = unit.abilities.find(a => a.id === 'smoke');
      if (smokeAbility && unit.ap >= smokeAbility.apCost && (!unit.cooldowns['smoke'] || unit.cooldowns['smoke'] <= 0)) {
        if (closest && getManhattanDistance(unit.position, closest.position) <= 3) {
          const radius = smokeAbility.aoeRadius || 1;
          for (let x = 0; x < GRID_SIZE; x++) {
            for (let z = 0; z < GRID_SIZE; z++) {
              if (getManhattanDistance({ x, z }, unit.position) <= radius) {
                newState.grid[x][z].hasSmoke = true;
              }
            }
          }
          unit.ap -= smokeAbility.apCost;
          unit.cooldowns['smoke'] = smokeAbility.cooldown;
          allEvents.push({ id: makeEventId(), type: 'ability', attackerPos: { ...unit.position }, targetPos: { ...unit.position }, message: `💨 ${unit.name} deploys SMOKE SCREEN!`, timestamp: Date.now() });
          newState.log = [...newState.log, allEvents[allEvents.length - 1].message];
        }
      }
    }
  } else {
    // SOLDIER COMBAT
    const visibleAfterMove = getVisibleEnemies(unit, newState.units);

    // Try grenade first (before shooting, since shooting ends turn)
    const grenadeAbility = unit.abilities.find(a => a.id === 'grenade');
    if (grenadeAbility && unit.ap >= grenadeAbility.apCost && (!unit.cooldowns['grenade'] || unit.cooldowns['grenade'] <= 0)) {
      let bestGrenadePos: Position | null = null;
      let bestHits = 0;
      for (const enemy of visibleAfterMove) {
        if (getManhattanDistance(unit.position, enemy.position) <= grenadeAbility.range) {
          let hits = 0;
          let allyHits = 0;
          for (const e2 of visibleAfterMove) {
            if (getManhattanDistance(enemy.position, e2.position) <= (grenadeAbility.aoeRadius || 2)) hits++;
          }
          // Check for friendly fire
          for (const ally of allies) {
            if (getManhattanDistance(enemy.position, ally.position) <= (grenadeAbility.aoeRadius || 2)) allyHits++;
          }
          if (hits > bestHits && allyHits === 0) { bestHits = hits; bestGrenadePos = enemy.position; }
        }
      }
      if (bestGrenadePos && bestHits >= 2) {
        const radius = grenadeAbility.aoeRadius || 2;
        const damaged: string[] = [];
        for (const u of newState.units) {
          if (!u.isAlive || u.team === unit.team) continue;
          if (getManhattanDistance(u.position, bestGrenadePos) <= radius) {
            const dmg = 25 + Math.floor(Math.random() * 10);
            u.hp -= dmg;
            if (u.hp <= 0) { u.hp = 0; u.isAlive = false; unit.kills++; }
            damaged.push(`${u.name}(-${dmg})`);
            allEvents.push({ id: makeEventId(), type: u.isAlive ? 'damage' : 'kill', attackerPos: { ...unit.position }, targetPos: { ...u.position }, value: dmg, message: u.isAlive ? `💣 ${u.name} takes ${dmg} grenade damage!` : `💣💀 ${u.name} killed by grenade!`, timestamp: Date.now() });
          }
        }
        newState.log = [...newState.log, `💣 ${unit.name} throws GRENADE! ${damaged.join(', ')}`];
        applyExplosionDamage(newState.grid, bestGrenadePos, radius);
        unit.ap -= grenadeAbility.apCost;
        unit.cooldowns['grenade'] = grenadeAbility.cooldown;
      }
    }

    // Shoot (ends turn)
    if (unit.ap >= AP_ATTACK_COST && unit.weapon.ammo !== 0) {
      const inRangeVisible = visibleAfterMove.filter(e =>
        e.isAlive && getManhattanDistance(unit.position, e.position) <= unit.attackRange
      );
      if (inRangeVisible.length > 0) {
        // Smart target selection: prioritize low HP, then medics, then closest
        let bestTarget = inRangeVisible[0];
        let bestTargetScore = -Infinity;
        for (const t of inRangeVisible) {
          let tScore = 0;
          if (t.hp <= unit.attack) tScore += 50; // Can likely kill
          if (t.unitClass === 'medic') tScore += 20; // Target healers
          tScore += (100 - t.hp); // Lower HP = higher priority
          const preview = getAttackPreview(unit, t, newState.grid);
          tScore += preview.hitChance * 0.5; // Prefer higher hit chance
          if (tScore > bestTargetScore) { bestTarget = t; bestTargetScore = tScore; }
        }
        const result = performAttack(unit, bestTarget, newState.grid);
        allEvents.push(...result.events);
        newState.log = [...newState.log, ...result.events.map(e => e.message)];
        unit.ap = 0; // XCOM rule: shooting ends turn
      }
    }

    // Hunker down (only if didn't shoot — still has AP and enemies visible)
    if (unit.ap >= 1 && !unit.isHunkered && visibleAfterMove.length > 0 && unit.coverType !== 'none') {
      const hunkerAbility = unit.abilities.find(a => a.id === 'hunker_down');
      if (hunkerAbility) {
        unit.isHunkered = true;
        unit.ap -= 1;
        allEvents.push({ id: makeEventId(), type: 'hunker', attackerPos: { ...unit.position }, targetPos: { ...unit.position }, message: `🛡 ${unit.name} HUNKERS DOWN!`, timestamp: Date.now() });
        newState.log = [...newState.log, allEvents[allEvents.length - 1].message];
      }
    }
  }

  updateAllUnitsCover(newState.units, newState.grid);
  return { state: newState, events: allEvents, didMove };
}

// Legacy wrapper (still used by manual endTurn)
export function runAiTurn(state: GameState): { state: GameState; events: CombatEvent[] } {
  const teamUnits = state.units.filter(u => u.team === state.currentTeam && u.isAlive);
  const sorted = [...teamUnits].sort((a, b) => {
    if (a.unitClass === 'soldier' && b.unitClass === 'medic') return -1;
    if (a.unitClass === 'medic' && b.unitClass === 'soldier') return 1;
    return 0;
  });

  let currentState = state;
  const allEvents: CombatEvent[] = [];
  for (const unit of sorted) {
    const moveResult = runAiUnitStep(unit.id, currentState, 'move');
    currentState = moveResult.state;
    allEvents.push(...moveResult.events);
    const combatResult = runAiUnitStep(unit.id, currentState, 'combat');
    currentState = combatResult.state;
    allEvents.push(...combatResult.events);
  }
  return { state: currentState, events: allEvents };
}

// ── Overwatch Trigger ──
export function checkOverwatch(movingUnit: Unit, state: GameState): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (const u of state.units) {
    if (!u.isAlive || u.team === movingUnit.team || !u.isOnOverwatch) continue;
    if (!canUnitSee(u, movingUnit.position)) continue;
    const dist = getManhattanDistance(u.position, movingUnit.position);
    if (dist <= u.attackRange) {
      const result = performAttack(u, movingUnit, state.grid);
      events.push(...result.events);
      u.isOnOverwatch = false;
      if (!movingUnit.isAlive) break;
    }
  }
  return events;
}
