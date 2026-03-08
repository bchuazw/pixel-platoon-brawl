export type UnitClass = 'soldier' | 'medic';
export type Team = 'blue' | 'red' | 'green' | 'yellow';

export interface Position {
  x: number;
  z: number;
}

export type AbilityId = 'grenade' | 'overwatch' | 'heal' | 'suppress' | 'smoke' | 'first_aid';

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

// ── Weapon System ──
export type WeaponId = 'pistol' | 'rifle' | 'shotgun' | 'sniper_rifle' | 'rocket_launcher' | 'smg';

export interface Weapon {
  id: WeaponId;
  name: string;
  attack: number;
  accuracy: number;
  range: number;
  ammo: number;
  maxAmmo: number;
  icon: string;
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  pistol: { id: 'pistol', name: 'Pistol', attack: 15, accuracy: 70, range: 3, ammo: -1, maxAmmo: -1, icon: '🔫' },
  rifle: { id: 'rifle', name: 'Assault Rifle', attack: 22, accuracy: 78, range: 4, ammo: 12, maxAmmo: 12, icon: '🔫' },
  shotgun: { id: 'shotgun', name: 'Shotgun', attack: 35, accuracy: 60, range: 2, ammo: 6, maxAmmo: 6, icon: '💥' },
  sniper_rifle: { id: 'sniper_rifle', name: 'Sniper Rifle', attack: 45, accuracy: 90, range: 8, ammo: 4, maxAmmo: 4, icon: '🎯' },
  rocket_launcher: { id: 'rocket_launcher', name: 'Rocket Launcher', attack: 60, accuracy: 55, range: 5, ammo: 2, maxAmmo: 2, icon: '🚀' },
  smg: { id: 'smg', name: 'SMG', attack: 18, accuracy: 65, range: 3, ammo: 20, maxAmmo: 20, icon: '⚡' },
};

// ── Loot System ──
export type LootType = 'weapon' | 'medkit' | 'armor' | 'ammo' | 'killstreak';
export type KillstreakId = 'uav' | 'supply_drop' | 'airstrike' | 'emp';

export interface LootItem {
  type: LootType;
  weaponId?: WeaponId;
  killstreakId?: KillstreakId;
  value: number;
  icon: string;
  name: string;
}

export interface KillstreakDef {
  id: KillstreakId;
  name: string;
  description: string;
  icon: string;
}

export const KILLSTREAKS: Record<KillstreakId, KillstreakDef> = {
  uav: { id: 'uav', name: 'UAV', description: 'Reveals all enemies for 3 turns (+4 vision range)', icon: '📡' },
  supply_drop: { id: 'supply_drop', name: 'Supply Drop', description: 'Full heal, refill ammo, +1 AP this turn', icon: '📦' },
  airstrike: { id: 'airstrike', name: 'Airstrike', description: 'Deals 30 dmg to all enemies in a 3-tile radius', icon: '✈️' },
  emp: { id: 'emp', name: 'EMP Blast', description: 'Suppresses all enemies for 2 turns, disables overwatch', icon: '⚡' },
};

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
  weapon: Weapon;
  visionRange: number;
  armor: number;
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
  loot: LootItem | null;
}

export type GamePhase = 'select' | 'move' | 'attack' | 'ability' | 'enemy_turn' | 'game_over' | 'pre_game';

export interface CombatEvent {
  id: string;
  type: 'damage' | 'miss' | 'crit' | 'kill' | 'heal' | 'ability' | 'overwatch' | 'loot';
  attackerPos: Position;
  targetPos: Position;
  value?: number;
  message: string;
  timestamp: number;
  weaponId?: WeaponId; // for sound selection
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
  movePath: Position[] | null; // path animation: array of tiles the moving unit walks through
  movingUnitId: string | null; // which unit is currently animating movement
}

export const GRID_SIZE = 30;
export const AP_MOVE_COST = 1;
export const AP_ATTACK_COST = 1;
export const VISION_RANGE = 7;

export const TEAM_COLORS: Record<Team, string> = {
  blue: '#4488ff',
  red: '#ff4444',
  green: '#44cc44',
  yellow: '#ffcc44',
};

// ── Class Abilities ──
export const SOLDIER_ABILITIES: Ability[] = [{
  id: 'grenade', name: 'FRAG GRENADE', description: 'Explosive dealing 25 dmg in 2-tile radius',
  apCost: 1, cooldown: 3, range: 4, aoeRadius: 2, icon: '💣',
}, {
  id: 'overwatch', name: 'OVERWATCH', description: 'Shoot first enemy that moves in range',
  apCost: 1, cooldown: 0, range: 0, icon: '👁',
}];

export const MEDIC_ABILITIES: Ability[] = [{
  id: 'first_aid', name: 'FIRST AID', description: 'Heal self or adjacent ally for 35 HP. 2-turn cooldown.',
  apCost: 1, cooldown: 2, range: 2, icon: '💊',
}, {
  id: 'smoke', name: 'SMOKE SCREEN', description: 'Deploy smoke for concealment in area',
  apCost: 1, cooldown: 3, range: 3, aoeRadius: 1, icon: '💨',
}];

// ── Class Stats (differentiated) ──
export const CLASS_STATS: Record<UnitClass, {
  hp: number; attack: number; defense: number; accuracy: number;
  moveRange: number; attackRange: number; maxAp: number;
}> = {
  soldier: { hp: 90, attack: 15, defense: 8, accuracy: 72, moveRange: 4, attackRange: 3, maxAp: 2 },
  medic: { hp: 70, attack: 12, defense: 5, accuracy: 65, moveRange: 5, attackRange: 2, maxAp: 3 },
};

// Legacy compat
export const CLASS_ABILITIES: Record<UnitClass, Ability[]> = {
  soldier: SOLDIER_ABILITIES,
  medic: MEDIC_ABILITIES,
};
