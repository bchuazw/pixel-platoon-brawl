export type UnitClass = 'soldier' | 'sniper' | 'medic' | 'heavy';
export type Team = 'blue' | 'red' | 'green' | 'yellow';

export interface Position {
  x: number;
  z: number;
}

export type AbilityId = 'grenade' | 'overwatch' | 'heal' | 'suppress' | 'smoke';

export interface Ability {
  id: AbilityId;
  name: string;
  description: string;
  apCost: number;
  cooldown: number;
  range: number;
  aoeRadius?: number;
  icon: string;
}

export interface Unit {
  id: string;
  name: string;
  unitClass: UnitClass;
  team: Team;
  position: Position;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  accuracy: number;
  moveRange: number;
  attackRange: number;
  ap: number;
  maxAp: number;
  isAlive: boolean;
  level: number;
  xp: number;
  abilities: Ability[];
  cooldowns: Record<string, number>;
  isOnOverwatch: boolean;
  isSuppressed: boolean;
  coverType: 'none' | 'half' | 'full';
  kills: number;
}

export type TileType = 'grass' | 'dirt' | 'stone' | 'water' | 'wall' | 'sand';
export type PropType = 'crate' | 'barrel' | 'sandbag' | 'rock' | 'bush' | 'tree' | 'ruins' | null;

export interface TileData {
  x: number;
  z: number;
  elevation: number;
  type: TileType;
  prop: PropType;
  isBlocked: boolean;
  coverValue: 0 | 1 | 2;
  variant: number;
  hasSmoke: boolean;
}

export type GamePhase = 'select' | 'move' | 'attack' | 'ability' | 'enemy_turn' | 'game_over' | 'pre_game';

export interface CombatEvent {
  id: string;
  type: 'damage' | 'miss' | 'crit' | 'kill' | 'heal' | 'ability' | 'overwatch';
  attackerPos: Position;
  targetPos: Position;
  value?: number;
  message: string;
  timestamp: number;
}

export interface AttackPreview {
  targetId: string;
  hitChance: number;
  expectedDamage: number;
  critChance: number;
  targetCover: 'none' | 'half' | 'full';
}

export interface GameState {
  units: Unit[];
  currentTeam: Team;
  selectedUnitId: string | null;
  phase: GamePhase;
  turn: number;
  movableTiles: Position[];
  attackableTiles: Position[];
  abilityTargetTiles: Position[];
  activeAbility: AbilityId | null;
  grid: TileData[][];
  log: string[];
  shrinkLevel: number;
  zoneTimer: number;
  combatEvents: CombatEvent[];
  attackPreview: AttackPreview | null;
  hoveredTile: Position | null;
  autoPlay: boolean;
}

export const GRID_SIZE = 20;
export const AP_MOVE_COST = 1;
export const AP_ATTACK_COST = 1;

export const TEAM_COLORS: Record<Team, string> = {
  blue: '#4488ff',
  red: '#ff4444',
  green: '#44cc44',
  yellow: '#ffcc44',
};

export const CLASS_ABILITIES: Record<UnitClass, Ability[]> = {
  soldier: [{
    id: 'grenade', name: 'FRAG GRENADE', description: 'Explosive dealing 20 dmg in 2-tile radius',
    apCost: 1, cooldown: 3, range: 4, aoeRadius: 2, icon: '💣',
  }],
  sniper: [{
    id: 'overwatch', name: 'OVERWATCH', description: 'Shoot first enemy that moves in range',
    apCost: 1, cooldown: 0, range: 0, icon: '👁',
  }],
  medic: [{
    id: 'heal', name: 'FIELD HEAL', description: 'Restore 40 HP to adjacent ally',
    apCost: 1, cooldown: 2, range: 2, icon: '💊',
  }, {
    id: 'smoke', name: 'SMOKE BOMB', description: 'Drop smoke granting cover in area',
    apCost: 1, cooldown: 3, range: 3, aoeRadius: 1, icon: '💨',
  }],
  heavy: [{
    id: 'suppress', name: 'SUPPRESS', description: 'Pin enemy: -50% accuracy, can\'t move next turn',
    apCost: 2, cooldown: 2, range: 3, icon: '🔫',
  }],
};

export const CLASS_STATS: Record<UnitClass, {
  hp: number; attack: number; defense: number; accuracy: number;
  moveRange: number; attackRange: number; maxAp: number;
}> = {
  soldier: { hp: 100, attack: 22, defense: 10, accuracy: 80, moveRange: 4, attackRange: 2, maxAp: 2 },
  sniper: { hp: 60, attack: 38, defense: 5, accuracy: 90, moveRange: 3, attackRange: 6, maxAp: 2 },
  medic: { hp: 85, attack: 12, defense: 8, accuracy: 70, moveRange: 5, attackRange: 2, maxAp: 3 },
  heavy: { hp: 150, attack: 28, defense: 22, accuracy: 65, moveRange: 2, attackRange: 2, maxAp: 2 },
};
