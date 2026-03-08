import { GameState, Unit, Position, TileData, Team, UnitClass, GRID_SIZE, CLASS_STATS } from './types';

function createGrid(): TileData[][] {
  const grid: TileData[][] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    grid[x] = [];
    for (let z = 0; z < GRID_SIZE; z++) {
      const rand = Math.random();
      let type: TileData['type'] = 'ground';
      let elevation = 0;

      if (rand < 0.05) {
        type = 'wall';
        elevation = 1;
      } else if (rand < 0.08) {
        type = 'water';
        elevation = -0.2;
      } else if (rand < 0.15) {
        type = 'cover';
        elevation = 0.3;
      }
      grid[x][z] = { x, z, elevation, type };
    }
  }
  return grid;
}

function createUnit(id: string, name: string, unitClass: UnitClass, team: Team, position: Position): Unit {
  const stats = CLASS_STATS[unitClass];
  return {
    id,
    name,
    unitClass,
    team,
    position,
    hp: stats.hp,
    maxHp: stats.hp,
    attack: stats.attack,
    defense: stats.defense,
    moveRange: stats.moveRange,
    attackRange: stats.attackRange,
    hasMoved: false,
    hasAttacked: false,
    isAlive: true,
    level: 1,
    xp: 0,
  };
}

function findSpawnPos(grid: TileData[][], occupied: Position[], zone: { minX: number; maxX: number; minZ: number; maxZ: number }): Position {
  let attempts = 0;
  while (attempts < 100) {
    const x = zone.minX + Math.floor(Math.random() * (zone.maxX - zone.minX));
    const z = zone.minZ + Math.floor(Math.random() * (zone.maxZ - zone.minZ));
    if (grid[x][z].type !== 'wall' && grid[x][z].type !== 'water' && !occupied.some(p => p.x === x && p.z === z)) {
      return { x, z };
    }
    attempts++;
  }
  return { x: zone.minX, z: zone.minZ };
}

export function createInitialState(): GameState {
  const grid = createGrid();
  const occupied: Position[] = [];
  const units: Unit[] = [];
  const classes: UnitClass[] = ['soldier', 'sniper', 'medic', 'heavy'];

  const zones: Record<Team, { minX: number; maxX: number; minZ: number; maxZ: number }> = {
    blue: { minX: 0, maxX: 5, minZ: 0, maxZ: 5 },
    red: { minX: 15, maxX: 20, minZ: 15, maxZ: 20 },
    green: { minX: 0, maxX: 5, minZ: 15, maxZ: 20 },
    yellow: { minX: 15, maxX: 20, minZ: 0, maxZ: 5 },
  };

  const teams: Team[] = ['blue', 'red', 'green', 'yellow'];
  const names: Record<Team, string[]> = {
    blue: ['Marco', 'Tarma', 'Eri', 'Fio'],
    red: ['Viper', 'Cobra', 'Mamba', 'Asp'],
    green: ['Oak', 'Elm', 'Ash', 'Pine'],
    yellow: ['Bolt', 'Spark', 'Flash', 'Volt'],
  };

  teams.forEach(team => {
    classes.forEach((cls, i) => {
      const pos = findSpawnPos(grid, occupied, zones[team]);
      occupied.push(pos);
      // Clear wall/water from spawn positions
      grid[pos.x][pos.z] = { ...grid[pos.x][pos.z], type: 'ground', elevation: 0 };
      units.push(createUnit(`${team}-${i}`, names[team][i], cls, team, pos));
    });
  });

  return {
    units,
    currentTeam: 'blue',
    selectedUnitId: null,
    phase: 'select',
    turn: 1,
    movableTiles: [],
    attackableTiles: [],
    grid,
    log: ['⚔ BATTLE ROYALE BEGINS! Blue team\'s turn.'],
    shrinkLevel: 0,
    zoneTimer: 3,
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
      if (dist > 0 && dist <= unit.moveRange && state.grid[x][z].type !== 'wall' && state.grid[x][z].type !== 'water') {
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
  const coverBonus = 1; // could check tile
  const damage = Math.max(1, Math.floor(baseDmg * variance * coverBonus));
  defender.hp -= damage;
  const killed = defender.hp <= 0;
  if (killed) {
    defender.hp = 0;
    defender.isAlive = false;
    attacker.xp += 50;
  } else {
    attacker.xp += 10;
  }
  if (attacker.xp >= 100) {
    attacker.xp -= 100;
    attacker.level++;
    attacker.maxHp += 10;
    attacker.hp = Math.min(attacker.hp + 10, attacker.maxHp);
    attacker.attack += 3;
    attacker.defense += 2;
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
    // Try to attack first
    const enemies = newState.units.filter(u => u.isAlive && u.team !== unit.team);
    if (enemies.length === 0) break;

    // Find closest enemy
    let closest = enemies[0];
    let closestDist = getManhattanDistance(unit.position, closest.position);
    for (const e of enemies) {
      const d = getManhattanDistance(unit.position, e.position);
      if (d < closestDist) { closest = e; closestDist = d; }
    }

    // Move toward closest enemy
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

    // Try attack after moving
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
