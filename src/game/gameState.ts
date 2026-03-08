import {
  GameState, Unit, Position, TileData, Team, UnitClass, GRID_SIZE,
  CLASS_STATS, CLASS_ABILITIES, TileType, PropType, CombatEvent,
  AP_MOVE_COST, AP_ATTACK_COST, AttackPreview, AbilityId,
} from './types';

// ── Random ──
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

let eventCounter = 0;
function makeEventId() { return `evt-${++eventCounter}-${Date.now()}`; }

// ── Grid Generation ──
function createGrid(): TileData[][] {
  const grid: TileData[][] = [];
  const rand = seededRandom(Date.now());

  for (let x = 0; x < GRID_SIZE; x++) {
    grid[x] = [];
    for (let z = 0; z < GRID_SIZE; z++) {
      const distFromCenter = Math.sqrt((x - 10) ** 2 + (z - 10) ** 2);
      const r = rand();

      let type: TileType = 'grass';
      let elevation = 0;

      const onHorizPath = Math.abs(z - 10) <= 1 && x > 3 && x < 17;
      const onVertPath = Math.abs(x - 10) <= 1 && z > 3 && z < 17;
      const onDiagPath1 = Math.abs(x - z) <= 1;
      const onDiagPath2 = Math.abs(x - (GRID_SIZE - 1 - z)) <= 1;

      if (onHorizPath || onVertPath) {
        type = 'dirt'; elevation = 0;
      } else if ((onDiagPath1 || onDiagPath2) && r < 0.4) {
        type = 'sand'; elevation = 0;
      } else if (distFromCenter < 3 && r < 0.3) {
        type = 'stone'; elevation = 0.1;
      } else if (r < 0.04) {
        type = 'water'; elevation = -0.15;
      } else if (r < 0.07 && distFromCenter > 4) {
        type = 'stone'; elevation = 0.15;
      }

      let prop: PropType = null;
      let isBlocked = false;
      let coverValue: 0 | 1 | 2 = 0;

      if (type === 'water') {
        isBlocked = true;
      } else if (type !== 'dirt' && type !== 'sand') {
        const propRoll = rand();
        if (propRoll < 0.03 && distFromCenter > 3) {
          prop = 'tree'; isBlocked = true; coverValue = 2;
        } else if (propRoll < 0.06) {
          prop = 'rock'; isBlocked = true; coverValue = 2;
        } else if (propRoll < 0.08) {
          prop = 'bush'; coverValue = 1;
        } else if (propRoll < 0.10) {
          prop = 'crate'; isBlocked = true; coverValue = 2;
        } else if (propRoll < 0.12) {
          prop = 'barrel'; isBlocked = true; coverValue = 1;
        } else if (propRoll < 0.14 && distFromCenter > 5) {
          prop = 'sandbag'; coverValue = 2;
        } else if (propRoll < 0.155 && distFromCenter > 6) {
          prop = 'ruins'; isBlocked = true; coverValue = 2; elevation = 0.3;
        }
      }

      grid[x][z] = { x, z, elevation, type, prop, isBlocked, coverValue, variant: Math.floor(rand() * 4), hasSmoke: false };
    }
  }

  // Strategic cover clusters
  const coverPositions = [
    { x: 8, z: 8 }, { x: 8, z: 9 }, { x: 9, z: 8 },
    { x: 11, z: 11 }, { x: 11, z: 12 }, { x: 12, z: 11 },
    { x: 8, z: 12 }, { x: 12, z: 8 },
    { x: 5, z: 10 }, { x: 14, z: 10 }, { x: 10, z: 5 }, { x: 10, z: 14 },
    { x: 4, z: 4 }, { x: 15, z: 15 }, { x: 4, z: 15 }, { x: 15, z: 4 },
    { x: 7, z: 5 }, { x: 12, z: 14 }, { x: 5, z: 13 }, { x: 14, z: 7 },
  ];
  const coverProps: PropType[] = ['sandbag', 'crate', 'barrel'];
  for (const pos of coverPositions) {
    if (pos.x < GRID_SIZE && pos.z < GRID_SIZE && grid[pos.x][pos.z].type !== 'water') {
      grid[pos.x][pos.z].prop = coverProps[Math.floor(rand() * coverProps.length)];
      grid[pos.x][pos.z].isBlocked = true;
      grid[pos.x][pos.z].coverValue = 2;
    }
  }

  // Clear spawn corners
  for (const corner of [[0, 0], [0, GRID_SIZE - 1], [GRID_SIZE - 1, 0], [GRID_SIZE - 1, GRID_SIZE - 1]]) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const cx = corner[0] + dx, cz = corner[1] + dz;
        if (cx >= 0 && cx < GRID_SIZE && cz >= 0 && cz < GRID_SIZE) {
          grid[cx][cz] = { ...grid[cx][cz], type: 'grass', prop: null, isBlocked: false, coverValue: 0, elevation: 0, hasSmoke: false };
        }
      }
    }
  }

  return grid;
}

// ── Unit Creation ──
function createUnit(id: string, name: string, unitClass: UnitClass, team: Team, position: Position): Unit {
  const stats = CLASS_STATS[unitClass];
  return {
    id, name, unitClass, team, position,
    hp: stats.hp, maxHp: stats.hp, attack: stats.attack, defense: stats.defense,
    accuracy: stats.accuracy, moveRange: stats.moveRange, attackRange: stats.attackRange,
    ap: stats.maxAp, maxAp: stats.maxAp,
    isAlive: true, level: 1, xp: 0,
    abilities: [...CLASS_ABILITIES[unitClass]],
    cooldowns: {}, isOnOverwatch: false, isSuppressed: false,
    coverType: 'none', kills: 0,
  };
}

// ── State Init ── (1 unit per team, 4 corners)
export function createInitialState(): GameState {
  const grid = createGrid();
  const units: Unit[] = [
    createUnit('blue-0', 'Marco', 'soldier', 'blue', { x: 1, z: 1 }),
    createUnit('red-0', 'Viper', 'sniper', 'red', { x: 18, z: 18 }),
    createUnit('green-0', 'Oak', 'heavy', 'green', { x: 18, z: 1 }),
    createUnit('yellow-0', 'Bolt', 'medic', 'yellow', { x: 1, z: 18 }),
  ];

  updateAllUnitsCover(units, grid);

  return {
    units, currentTeam: 'blue', selectedUnitId: null,
    phase: 'pre_game', turn: 1,
    movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
    activeAbility: null,
    grid,
    log: [
      '═══════════════════════════',
      '⚔ TACTICAL ROYALE',
      '═══════════════════════════',
      '» 4 warriors. 4 corners. 1 survivor.',
      '» Press PLAY to watch the AI battle!',
    ],
    shrinkLevel: 0, zoneTimer: 5,
    combatEvents: [], attackPreview: null, hoveredTile: null,
    autoPlay: false,
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
  if (aElev > dElev) chance += 10;

  return Math.max(5, Math.min(95, chance));
}

export function calcCritChance(attacker: Unit, defender: Unit): number {
  let crit = 10;
  if (attacker.unitClass === 'sniper') crit += 15;
  if (defender.coverType === 'none') crit += 10;
  const dist = getManhattanDistance(attacker.position, defender.position);
  if (dist <= 1) crit += 10;
  return Math.min(40, crit);
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

// ── Combat Resolution ──
export function performAttack(
  attacker: Unit, defender: Unit, grid: TileData[][]
): { damage: number; killed: boolean; hit: boolean; crit: boolean; events: CombatEvent[] } {
  const events: CombatEvent[] = [];
  const hitChance = calcHitChance(attacker, defender, grid);
  const critChance = calcCritChance(attacker, defender);
  const roll = Math.random() * 100;

  if (roll > hitChance) {
    events.push({
      id: makeEventId(), type: 'miss',
      attackerPos: { ...attacker.position }, targetPos: { ...defender.position },
      message: `${attacker.name} MISSED ${defender.name}!`,
      timestamp: Date.now(),
    });
    return { damage: 0, killed: false, hit: false, crit: false, events };
  }

  const isCrit = Math.random() * 100 < critChance;
  const baseDmg = Math.max(1, attacker.attack - defender.defense * 0.4);
  const variance = 0.85 + Math.random() * 0.3;
  let damage = Math.floor(baseDmg * variance);
  if (isCrit) damage = Math.floor(damage * 1.5);

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
    attacker.attack += 3; attacker.defense += 2; attacker.accuracy += 2;
  }

  events.push({
    id: makeEventId(),
    type: killed ? 'kill' : isCrit ? 'crit' : 'damage',
    attackerPos: { ...attacker.position }, targetPos: { ...defender.position },
    value: damage,
    message: killed
      ? `💀 ${attacker.name} ELIMINATED ${defender.name}! (${damage} dmg)`
      : isCrit
        ? `💥 CRITICAL HIT! ${attacker.name} → ${defender.name} for ${damage} dmg!`
        : `${attacker.name} → ${defender.name} for ${damage} dmg`,
    timestamp: Date.now(),
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

// ── AI ──
export function runAiTurn(state: GameState): { state: GameState; events: CombatEvent[] } {
  const newState = { ...state, units: state.units.map(u => ({ ...u })) };
  const allEvents: CombatEvent[] = [];
  const teamUnits = newState.units.filter(u => u.team === newState.currentTeam && u.isAlive);

  for (const unit of teamUnits) {
    const enemies = newState.units.filter(u => u.isAlive && u.team !== unit.team);
    if (enemies.length === 0) break;

    let closest = enemies[0];
    let closestDist = getManhattanDistance(unit.position, closest.position);
    for (const e of enemies) {
      const d = getManhattanDistance(unit.position, e.position);
      if (d < closestDist) { closest = e; closestDist = d; }
    }

    // Try ability first
    if (unit.ap >= 1) {
      if (unit.unitClass === 'medic') {
        const injuredAlly = newState.units.find(u =>
          u.isAlive && u.team === unit.team && u.id !== unit.id &&
          u.hp < u.maxHp * 0.6 && getManhattanDistance(unit.position, u.position) <= 2
        );
        if (injuredAlly && (!unit.cooldowns['heal'] || unit.cooldowns['heal'] <= 0)) {
          const healAmt = 40;
          injuredAlly.hp = Math.min(injuredAlly.maxHp, injuredAlly.hp + healAmt);
          unit.ap -= 1;
          unit.cooldowns['heal'] = 2;
          allEvents.push({
            id: makeEventId(), type: 'heal',
            attackerPos: { ...unit.position }, targetPos: { ...injuredAlly.position },
            value: healAmt,
            message: `💊 ${unit.name} heals ${injuredAlly.name} for ${healAmt} HP!`,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Move toward closest enemy (prefer cover)
    if (unit.ap >= AP_MOVE_COST && !unit.isSuppressed) {
      const movable = getMovableTiles(unit, newState);
      if (movable.length > 0) {
        let bestTile = movable[0];
        let bestScore = -Infinity;
        for (const t of movable) {
          const dist = getManhattanDistance(t, closest.position);
          let score = -dist * 2;
          for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = t.x + dx, nz = t.z + dz;
            if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
              score += newState.grid[nx][nz].coverValue * 3;
            }
          }
          if (unit.unitClass === 'sniper' && dist < 3) score -= 10;
          if (score > bestScore) { bestTile = t; bestScore = score; }
        }
        unit.position = bestTile;
        unit.ap -= AP_MOVE_COST;
      }
    }

    // Attack
    if (unit.ap >= AP_ATTACK_COST) {
      const attackable = getAttackableTiles(unit, newState);
      if (attackable.length > 0) {
        let bestTarget: Unit | null = null;
        let lowestHp = Infinity;
        for (const tp of attackable) {
          const target = newState.units.find(u => u.isAlive && u.position.x === tp.x && u.position.z === tp.z && u.team !== unit.team);
          if (target && target.hp < lowestHp) { bestTarget = target; lowestHp = target.hp; }
        }
        if (bestTarget) {
          const result = performAttack(unit, bestTarget, newState.grid);
          allEvents.push(...result.events);
          newState.log = [...newState.log, ...result.events.map(e => e.message)];
          unit.ap -= AP_ATTACK_COST;
        }
      }
    }

    // Overwatch with remaining AP
    if (unit.unitClass === 'sniper' && unit.ap >= 1 && !unit.isOnOverwatch) {
      unit.isOnOverwatch = true;
      unit.ap -= 1;
      allEvents.push({
        id: makeEventId(), type: 'overwatch',
        attackerPos: { ...unit.position }, targetPos: { ...unit.position },
        message: `👁 ${unit.name} goes on OVERWATCH`,
        timestamp: Date.now(),
      });
    }
  }

  updateAllUnitsCover(newState.units, newState.grid);
  return { state: newState, events: allEvents };
}

// ── Overwatch Trigger ──
export function checkOverwatch(movingUnit: Unit, state: GameState): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (const u of state.units) {
    if (!u.isAlive || u.team === movingUnit.team || !u.isOnOverwatch) continue;
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
