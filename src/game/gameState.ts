import {
  GameState, Unit, Position, TileData, Team, UnitClass, GRID_SIZE,
  CLASS_STATS, CLASS_ABILITIES, TileType, PropType, CombatEvent,
  AP_MOVE_COST, AP_ATTACK_COST, AttackPreview, AbilityId,
  WEAPONS, WeaponId, LootItem, LootType, Weapon, VISION_RANGE,
  KillstreakId,
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
      if (state.grid[nx][nz].isBlocked) continue;
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
const MIN_SPAWN_DISTANCE = 10; // minimum manhattan distance between team spawns

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

      let prop: PropType = null;
      let isBlocked = false;
      let coverValue: 0 | 1 | 2 = 0;

      if (type === 'water') {
        isBlocked = true;
      } else if (type !== 'dirt' && type !== 'sand') {
        const propRoll = rand();
        if (propRoll < 0.025 && distFromCenter > 4) {
          prop = 'tree'; isBlocked = true; coverValue = 2;
        } else if (propRoll < 0.05) {
          prop = 'rock'; isBlocked = true; coverValue = 2;
        } else if (propRoll < 0.07) {
          prop = 'bush'; coverValue = 1;
        } else if (propRoll < 0.085) {
          prop = 'crate'; isBlocked = true; coverValue = 2;
        } else if (propRoll < 0.10) {
          prop = 'barrel'; isBlocked = true; coverValue = 1;
        } else if (propRoll < 0.115 && distFromCenter > 6) {
          prop = 'sandbag'; coverValue = 2;
        } else if (propRoll < 0.13 && distFromCenter > 7) {
          prop = 'ruins'; isBlocked = true; coverValue = 2; elevation += 0.3;
        }
      }

      grid[x][z] = { x, z, elevation, type, prop, isBlocked, coverValue, variant: Math.floor(rand() * 4), hasSmoke: false, loot: null };
    }
  }

  // Strategic cover clusters scattered around the map
  const coverPositions: Position[] = [];
  for (let i = 0; i < 30; i++) {
    const cx = 3 + Math.floor(rand() * (GRID_SIZE - 6));
    const cz = 3 + Math.floor(rand() * (GRID_SIZE - 6));
    coverPositions.push({ x: cx, z: cz });
    // Add a neighbor for cluster feel
    if (rand() > 0.4) coverPositions.push({ x: Math.min(GRID_SIZE - 1, cx + 1), z: cz });
    if (rand() > 0.5) coverPositions.push({ x: cx, z: Math.min(GRID_SIZE - 1, cz + 1) });
  }
  const coverProps: PropType[] = ['sandbag', 'crate', 'barrel'];
  for (const pos of coverPositions) {
    if (pos.x < GRID_SIZE && pos.z < GRID_SIZE && grid[pos.x][pos.z].type !== 'water' && !grid[pos.x][pos.z].prop) {
      grid[pos.x][pos.z].prop = coverProps[Math.floor(rand() * coverProps.length)];
      grid[pos.x][pos.z].isBlocked = true;
      grid[pos.x][pos.z].coverValue = 2;
    }
  }

  // Clear spawn areas (radius 3 around each spawn point)
  for (const spawn of spawnPoints) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const cx = spawn.x + dx, cz = spawn.z + dz;
        if (cx >= 0 && cx < GRID_SIZE && cz >= 0 && cz < GRID_SIZE) {
          grid[cx][cz] = { ...grid[cx][cz], type: 'grass', prop: null, isBlocked: false, coverValue: 0, elevation: 0, hasSmoke: false, loot: null };
        }
      }
    }
  }

  // Spawn loot (more for bigger map)
  const lootCount = 25 + Math.floor(rand() * 12);
  let placed = 0;
  let attempts = 0;
  while (placed < lootCount && attempts < 500) {
    attempts++;
    const lx = Math.floor(rand() * GRID_SIZE);
    const lz = Math.floor(rand() * GRID_SIZE);
    const tile = grid[lx][lz];
    // Don't place loot near spawn points
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
    cooldowns: {}, isOnOverwatch: false, isSuppressed: false,
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
    // Soldier at spawn, medic adjacent
    const medicOffset = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: -1, z: 0 }][i];
    const medicPos = {
      x: Math.max(0, Math.min(GRID_SIZE - 1, spawn.x + medicOffset.x)),
      z: Math.max(0, Math.min(GRID_SIZE - 1, spawn.z + medicOffset.z)),
    };
    units.push(createUnit(`${team}-soldier`, shuffledSoldiers[soldierIdx++], 'soldier', team, { ...spawn }));
    units.push(createUnit(`${team}-medic`, shuffledMedics[medicIdx++], 'medic', team, medicPos));
  }

  const occupied = new Set<string>();
  for (const u of units) {
    let key = `${u.position.x},${u.position.z}`;
    while (occupied.has(key)) {
      u.position.x = Math.max(0, Math.min(GRID_SIZE - 1, u.position.x + (Math.random() > 0.5 ? 1 : -1)));
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
      '» Everyone starts with a PISTOL — find loot to upgrade!',
      '» Fog of war: squads share vision!',
      '» Press PLAY to watch the AI battle!',
    ],
    shrinkLevel: 0, zoneTimer: 6,
    combatEvents: [], attackPreview: null, hoveredTile: null,
    autoPlay: false,
    movePath: null,
    movingUnitId: null,
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
  if (dist > 3) chance -= (dist - 3) * 5;

  const cover = getCoverFromDirection(defender.position, attacker.position, grid);
  if (cover === 'half') chance -= 25;
  if (cover === 'full') chance -= 45;

  if (attacker.isSuppressed) chance -= 30;

  const aElev = grid[attacker.position.x]?.[attacker.position.z]?.elevation || 0;
  const dElev = grid[defender.position.x]?.[defender.position.z]?.elevation || 0;
  if (aElev > dElev + 0.3) chance += 15; // height advantage matters more with real hills

  if (attacker.weapon.id === 'shotgun' && dist <= 2) chance += 15;

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
      if (dist > 0 && dist <= unit.moveRange && !state.grid[x][z].isBlocked) {
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
    case 'overwatch':
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

  return { damage, killed, hit: true, crit: isCrit, events };
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
// ── AI: Per-unit step (called once per unit) ──
// ══════════════════════════════════════════════
export function runAiUnitStep(
  unitId: string,
  state: GameState
): { state: GameState; events: CombatEvent[] } {
  const newState = {
    ...state,
    units: state.units.map(u => ({ ...u, weapon: { ...u.weapon } })),
    grid: state.grid.map(row => row.map(t => ({ ...t, loot: t.loot ? { ...t.loot } : null }))),
  };
  const allEvents: CombatEvent[] = [];

  const unit = newState.units.find(u => u.id === unitId);
  if (!unit || !unit.isAlive) return { state: newState, events: allEvents };

  const allEnemies = newState.units.filter(u => u.isAlive && u.team !== unit.team);
  if (allEnemies.length === 0) return { state: newState, events: allEvents };

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

  // Helper to move unit and return path
  const moveToTile = (bestTile: Position) => {
    const path = findPath(unit.position, bestTile, newState);
    unit.position = bestTile;
    unit.ap -= AP_MOVE_COST;

    // Set move path for animation
    newState.movePath = path;
    newState.movingUnitId = unit.id;

    // Pickup loot at destination
    const arrivalTile = newState.grid[bestTile.x][bestTile.z];
    if (arrivalTile.loot) {
      const { picked, message } = pickupLoot(unit, arrivalTile);
      if (picked) {
        allEvents.push({ id: makeEventId(), type: 'loot', attackerPos: { ...unit.position }, targetPos: { ...unit.position }, message, timestamp: Date.now() });
        newState.log = [...newState.log, message];
      }
    }
  };

  // ── Use killstreak if holding one and enemies are visible ──
  if (unit.killstreak && visibleEnemies.length > 0) {
    // Use airstrike/EMP when 2+ enemies visible, UAV/supply always
    const shouldUse = unit.killstreak === 'uav' || unit.killstreak === 'supply_drop'
      || (unit.killstreak === 'airstrike' && visibleEnemies.some(e => getManhattanDistance(unit.position, e.position) <= 3))
      || (unit.killstreak === 'emp' && visibleEnemies.length >= 2);
    if (shouldUse) {
      const ksEvents = activateKillstreak(unit, newState.units, newState.grid);
      allEvents.push(...ksEvents);
      newState.log = [...newState.log, ...ksEvents.map(e => e.message)];
    }
  }

  // ── Currently outside zone? FLEE TO SAFETY FIRST ──
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
    }
    // After fleeing, still try to attack
    if (unit.ap >= AP_ATTACK_COST && unit.weapon.ammo !== 0) {
      const visAfterFlee = getVisibleEnemies(unit, newState.units);
      const inRange = visAfterFlee.filter(e => getManhattanDistance(unit.position, e.position) <= unit.attackRange);
      if (inRange.length > 0) {
        let bestTarget = inRange[0];
        for (const t of inRange) { if (t.hp < bestTarget.hp) bestTarget = t; }
        const result = performAttack(unit, bestTarget, newState.grid);
        allEvents.push(...result.events);
        newState.log = [...newState.log, ...result.events.map(e => e.message)];
        unit.ap -= AP_ATTACK_COST;
      }
    }
    updateAllUnitsCover(newState.units, newState.grid);
    return { state: newState, events: allEvents };
  }

  // ═══ MEDIC AI ═══
  if (unit.unitClass === 'medic') {
    // Heal first
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

    // Move
    if (unit.ap >= AP_MOVE_COST && !unit.isSuppressed) {
      const movable = getMovableTiles(unit, newState);
      if (movable.length > 0) {
        let bestTile = movable[0];
        let bestScore = -Infinity;
        const injuredAlly = allies.find(a => a.hp < a.maxHp * 0.7);
        const stayNearTarget = injuredAlly || allies[0];

        for (const t of movable) {
          let score = getZonePenalty(t, newState.shrinkLevel);
          if (stayNearTarget) {
            const distToAlly = getManhattanDistance(t, stayNearTarget.position);
            score += -Math.abs(distToAlly - 2) * 5;
          }
          if (closest) {
            const distToEnemy = getManhattanDistance(t, closest.position);
            if (distToEnemy <= 2) score -= 15;
          }
          for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = t.x + dx, nz = t.z + dz;
            if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
              score += newState.grid[nx][nz].coverValue * 4;
            }
          }
          // Prefer higher ground
          score += newState.grid[t.x][t.z].elevation * 3;
          const tileData = newState.grid[t.x][t.z];
          if (tileData.loot) score += 12;
          if (score > bestScore) { bestTile = t; bestScore = score; }
        }

        moveToTile(bestTile);
      }
    }

    // Attack
    if (unit.ap >= AP_ATTACK_COST && unit.weapon.ammo !== 0) {
      const visibleAfterMove = getVisibleEnemies(unit, newState.units);
      const inRange = visibleAfterMove.filter(e => getManhattanDistance(unit.position, e.position) <= unit.attackRange);
      if (inRange.length > 0) {
        let bestTarget = inRange[0];
        for (const t of inRange) { if (t.hp < bestTarget.hp) bestTarget = t; }
        const result = performAttack(unit, bestTarget, newState.grid);
        allEvents.push(...result.events);
        newState.log = [...newState.log, ...result.events.map(e => e.message)];
        unit.ap -= AP_ATTACK_COST;
      }
    }

    // Smoke
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
  } else {
    // ═══ SOLDIER AI ═══
    // Move
    if (unit.ap >= AP_MOVE_COST && !unit.isSuppressed) {
      const movable = getMovableTiles(unit, newState);
      if (movable.length > 0) {
        let bestTile = movable[0];
        let bestScore = -Infinity;

        for (const t of movable) {
          let score = getZonePenalty(t, newState.shrinkLevel);

          if (closest) {
            const dist = getManhattanDistance(t, closest.position);
            const idealDist = unit.attackRange;
            score += -Math.abs(dist - idealDist) * 3;
            if (unit.weapon.id === 'shotgun') score += dist <= 2 ? 10 : -dist * 2;
            if (unit.weapon.id === 'sniper_rifle' && dist < 3) score -= 15;
          } else {
            const distToCenter = getManhattanDistance(t, { x: Math.floor(GRID_SIZE / 2), z: Math.floor(GRID_SIZE / 2) });
            score += -distToCenter;
          }

          const tileData = newState.grid[t.x][t.z];
          if (tileData.loot) {
            score += 15;
            if (tileData.loot.type === 'weapon') score += 12;
          }

          // Prefer higher ground for snipers
          score += newState.grid[t.x][t.z].elevation * 4;
          if (unit.weapon.id === 'sniper_rifle') score += newState.grid[t.x][t.z].elevation * 8;

          for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = t.x + dx, nz = t.z + dz;
            if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
              score += newState.grid[nx][nz].coverValue * 3;
            }
          }

          if (score > bestScore) { bestTile = t; bestScore = score; }
        }

        moveToTile(bestTile);
      }
    }

    // Attack
    const visibleAfterMove = getVisibleEnemies(unit, newState.units);

    if (unit.ap >= AP_ATTACK_COST && unit.weapon.ammo !== 0) {
      const inRangeVisible = visibleAfterMove.filter(e =>
        getManhattanDistance(unit.position, e.position) <= unit.attackRange
      );
      if (inRangeVisible.length > 0) {
        let bestTarget = inRangeVisible[0];
        for (const t of inRangeVisible) {
          const tIsMedic = t.unitClass === 'medic' ? 1 : 0;
          const bIsMedic = bestTarget.unitClass === 'medic' ? 1 : 0;
          if (tIsMedic > bIsMedic) bestTarget = t;
          else if (tIsMedic === bIsMedic && t.hp < bestTarget.hp) bestTarget = t;
        }
        const result = performAttack(unit, bestTarget, newState.grid);
        allEvents.push(...result.events);
        newState.log = [...newState.log, ...result.events.map(e => e.message)];
        unit.ap -= AP_ATTACK_COST;
      }
    }

    // Grenade
    const grenadeAbility = unit.abilities.find(a => a.id === 'grenade');
    if (grenadeAbility && unit.ap >= grenadeAbility.apCost && (!unit.cooldowns['grenade'] || unit.cooldowns['grenade'] <= 0)) {
      let bestGrenadePos: Position | null = null;
      let bestHits = 0;
      for (const enemy of visibleAfterMove) {
        if (getManhattanDistance(unit.position, enemy.position) <= grenadeAbility.range) {
          let hits = 0;
          for (const e2 of visibleAfterMove) {
            if (getManhattanDistance(enemy.position, e2.position) <= (grenadeAbility.aoeRadius || 2)) hits++;
          }
          if (hits > bestHits) { bestHits = hits; bestGrenadePos = enemy.position; }
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
        unit.ap -= grenadeAbility.apCost;
        unit.cooldowns['grenade'] = grenadeAbility.cooldown;
      }
    }

    // Overwatch
    if (unit.ap >= 1 && !unit.isOnOverwatch && visibleAfterMove.length > 0) {
      const owAbility = unit.abilities.find(a => a.id === 'overwatch');
      if (owAbility && (!unit.cooldowns['overwatch'] || unit.cooldowns['overwatch'] <= 0)) {
        unit.isOnOverwatch = true;
        unit.ap -= 1;
        allEvents.push({ id: makeEventId(), type: 'overwatch', attackerPos: { ...unit.position }, targetPos: { ...unit.position }, message: `👁 ${unit.name} goes on OVERWATCH`, timestamp: Date.now() });
      }
    }
  }

  updateAllUnitsCover(newState.units, newState.grid);
  return { state: newState, events: allEvents };
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
    const result = runAiUnitStep(unit.id, currentState);
    currentState = result.state;
    allEvents.push(...result.events);
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
