import { GameState, Unit, Position, TileData, Team, UnitClass, GRID_SIZE, CLASS_STATS, TileType, PropType } from './types';

// Seeded random for reproducible maps
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createGrid(): TileData[][] {
  const grid: TileData[][] = [];
  const rand = seededRandom(Date.now());

  // Create base terrain with noise-like patterns
  for (let x = 0; x < GRID_SIZE; x++) {
    grid[x] = [];
    for (let z = 0; z < GRID_SIZE; z++) {
      // Create natural terrain patterns
      const distFromCenter = Math.sqrt((x - 10) ** 2 + (z - 10) ** 2);
      const r = rand();

      let type: TileType = 'grass';
      let elevation = 0;

      // Paths/dirt roads crossing the map
      const onHorizPath = Math.abs(z - 10) <= 1 && x > 3 && x < 17;
      const onVertPath = Math.abs(x - 10) <= 1 && z > 3 && z < 17;
      const onDiagPath1 = Math.abs(x - z) <= 1;
      const onDiagPath2 = Math.abs(x - (GRID_SIZE - 1 - z)) <= 1;

      if (onHorizPath || onVertPath) {
        type = 'dirt';
        elevation = 0;
      } else if ((onDiagPath1 || onDiagPath2) && r < 0.4) {
        type = 'sand';
        elevation = 0;
      } else if (distFromCenter < 3 && r < 0.3) {
        type = 'stone';
        elevation = 0.1;
      } else if (r < 0.04) {
        type = 'water';
        elevation = -0.15;
      } else if (r < 0.07 && distFromCenter > 4) {
        type = 'stone';
        elevation = 0.15;
      }

      // Add random props
      let prop: PropType = null;
      let isBlocked = false;
      let givesCover = false;

      if (type === 'water') {
        isBlocked = true;
      } else if (type !== 'dirt' && type !== 'sand') {
        const propRoll = rand();
        if (propRoll < 0.03 && distFromCenter > 3) {
          prop = 'tree';
          isBlocked = true;
          givesCover = true;
          elevation = 0;
        } else if (propRoll < 0.06) {
          prop = 'rock';
          isBlocked = true;
          givesCover = true;
        } else if (propRoll < 0.08) {
          prop = 'bush';
          givesCover = true;
        } else if (propRoll < 0.10) {
          prop = 'crate';
          isBlocked = true;
          givesCover = true;
        } else if (propRoll < 0.12) {
          prop = 'barrel';
          isBlocked = true;
          givesCover = true;
        } else if (propRoll < 0.14 && distFromCenter > 5) {
          prop = 'sandbag';
          givesCover = true;
        } else if (propRoll < 0.155 && distFromCenter > 6) {
          prop = 'ruins';
          isBlocked = true;
          givesCover = true;
          elevation = 0.3;
        }
      }

      grid[x][z] = { x, z, elevation, type, prop, isBlocked, givesCover, variant: Math.floor(rand() * 4) };
    }
  }

  // Add strategic cover clusters near center
  const coverPositions = [
    { x: 8, z: 8 }, { x: 8, z: 9 }, { x: 9, z: 8 },
    { x: 11, z: 11 }, { x: 11, z: 12 }, { x: 12, z: 11 },
    { x: 8, z: 12 }, { x: 12, z: 8 },
    { x: 5, z: 10 }, { x: 14, z: 10 }, { x: 10, z: 5 }, { x: 10, z: 14 },
  ];
  for (const pos of coverPositions) {
    if (grid[pos.x][pos.z].type !== 'water') {
      const props: PropType[] = ['sandbag', 'crate', 'barrel'];
      grid[pos.x][pos.z].prop = props[Math.floor(rand() * props.length)];
      grid[pos.x][pos.z].isBlocked = true;
      grid[pos.x][pos.z].givesCover = true;
    }
  }

  // Clear spawn corners
  for (const corner of [[0, 0], [0, GRID_SIZE - 1], [GRID_SIZE - 1, 0], [GRID_SIZE - 1, GRID_SIZE - 1]]) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = corner[0] + dx;
        const cz = corner[1] + dz;
        if (cx >= 0 && cx < GRID_SIZE && cz >= 0 && cz < GRID_SIZE) {
          grid[cx][cz] = { ...grid[cx][cz], type: 'grass', prop: null, isBlocked: false, givesCover: false, elevation: 0 };
        }
      }
    }
  }

  return grid;
}

function createUnit(id: string, name: string, unitClass: UnitClass, team: Team, position: Position): Unit {
  const stats = CLASS_STATS[unitClass];
  return {
    id, name, unitClass, team, position,
    hp: stats.hp, maxHp: stats.hp, attack: stats.attack, defense: stats.defense,
    moveRange: stats.moveRange, attackRange: stats.attackRange,
    hasMoved: false, hasAttacked: false, isAlive: true, level: 1, xp: 0,
  };
}

export function createInitialState(): GameState {
  const grid = createGrid();
  const units: Unit[] = [
    createUnit('blue-0', 'Marco', 'soldier', 'blue', { x: 1, z: 1 }),
    createUnit('red-0', 'Viper', 'sniper', 'red', { x: 18, z: 18 }),
    createUnit('green-0', 'Oak', 'heavy', 'green', { x: 1, z: 18 }),
    createUnit('yellow-0', 'Bolt', 'medic', 'yellow', { x: 18, z: 1 }),
  ];

  return {
    units,
    currentTeam: 'blue',
    selectedUnitId: null,
    phase: 'select',
    turn: 1,
    movableTiles: [],
    attackableTiles: [],
    grid,
    log: ['⚔ BATTLE ROYALE BEGINS! Blue team\'s turn.', 'Select your unit to move and fight!'],
    shrinkLevel: 0,
    zoneTimer: 5,
  };
}

export function getManhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

export function getMovableTiles(unit: Unit, state: GameState): Position[] {
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

export function isInZone(x: number, z: number, shrinkLevel: number): boolean {
  const margin = shrinkLevel * 2;
  return x >= margin && x < GRID_SIZE - margin && z >= margin && z < GRID_SIZE - margin;
}

export function performAttack(attacker: Unit, defender: Unit): { damage: number; killed: boolean } {
  const baseDmg = attacker.attack - defender.defense * 0.5;
  const variance = 0.8 + Math.random() * 0.4;
  const damage = Math.max(1, Math.floor(baseDmg * variance));
  defender.hp -= damage;
  const killed = defender.hp <= 0;
  if (killed) { defender.hp = 0; defender.isAlive = false; attacker.xp += 50; }
  else { attacker.xp += 10; }
  if (attacker.xp >= 100) {
    attacker.xp -= 100; attacker.level++;
    attacker.maxHp += 10; attacker.hp = Math.min(attacker.hp + 10, attacker.maxHp);
    attacker.attack += 3; attacker.defense += 2;
  }
  return { damage, killed };
}

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

export function runAiTurn(state: GameState): GameState {
  const newState = { ...state };
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

    if (!unit.hasMoved) {
      const movable = getMovableTiles(unit, newState);
      if (movable.length > 0) {
        let bestTile = movable[0];
        let bestDist = getManhattanDistance(movable[0], closest.position);
        for (const t of movable) {
          const d = getManhattanDistance(t, closest.position);
          if (d < bestDist) { bestTile = t; bestDist = d; }
        }
        unit.position = bestTile;
        unit.hasMoved = true;
      }
    }

    if (!unit.hasAttacked) {
      const attackable = getAttackableTiles(unit, newState);
      if (attackable.length > 0) {
        const targetPos = attackable[0];
        const target = newState.units.find(u => u.isAlive && u.position.x === targetPos.x && u.position.z === targetPos.z);
        if (target) {
          const result = performAttack(unit, target);
          newState.log = [...newState.log, `${unit.name} hits ${target.name} for ${result.damage} dmg!${result.killed ? ' ELIMINATED!' : ''}`];
          unit.hasAttacked = true;
        }
      }
    }
  }

  return newState;
}
