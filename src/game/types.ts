export type UnitClass = 'soldier' | 'sniper' | 'medic' | 'heavy';
export type Team = 'blue' | 'red' | 'green' | 'yellow';

export interface Position {
  x: number;
  z: number;
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
  moveRange: number;
  attackRange: number;
  hasMoved: boolean;
  hasAttacked: boolean;
  isAlive: boolean;
  level: number;
  xp: number;
}

export type TileType = 'grass' | 'dirt' | 'stone' | 'water' | 'wall' | 'sand';
export type PropType = 'crate' | 'barrel' | 'sandbag' | 'rock' | 'bush' | 'tree' | 'ruins' | null;

export interface TileData {
  x: number;
  z: number;
  elevation: number;
  type: TileType;
  prop: PropType;
  isBlocked: boolean; // can't walk through
  givesCover: boolean; // adjacent tiles get defense bonus
  variant: number; // for visual variety
}

export type GamePhase = 'select' | 'move' | 'attack' | 'enemy_turn' | 'game_over';

export interface GameState {
  units: Unit[];
  currentTeam: Team;
  selectedUnitId: string | null;
  phase: GamePhase;
  turn: number;
  movableTiles: Position[];
  attackableTiles: Position[];
  grid: TileData[][];
  log: string[];
  shrinkLevel: number;
  zoneTimer: number;
}

export const GRID_SIZE = 20;

export const TEAM_COLORS: Record<Team, string> = {
  blue: '#4488ff',
  red: '#ff4444',
  green: '#44cc44',
  yellow: '#ffcc44',
};

export const CLASS_STATS: Record<UnitClass, { hp: number; attack: number; defense: number; moveRange: number; attackRange: number }> = {
  soldier: { hp: 100, attack: 25, defense: 10, moveRange: 4, attackRange: 1 },
  sniper: { hp: 60, attack: 40, defense: 5, moveRange: 3, attackRange: 5 },
  medic: { hp: 80, attack: 10, defense: 8, moveRange: 4, attackRange: 2 },
  heavy: { hp: 150, attack: 30, defense: 20, moveRange: 2, attackRange: 1 },
};
