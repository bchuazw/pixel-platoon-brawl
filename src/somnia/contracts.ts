/**
 * Contract instances for Somnia Reactivity integration
 * Provides typed wrappers around the deployed contracts
 */
import { Contract, parseEther, formatEther, id as keccak256, JsonRpcProvider, type ContractTransactionResponse } from 'ethers';
import { CONTRACT_ADDRESSES, SOMNIA_TESTNET } from './config';
import { ReactiveBettingPoolABI, ReactiveSponsorshipABI, ReactiveMatchTimerABI } from './abis';
import { getWalletState } from './wallet';
import type { Team } from '@/game/types';

// ─── Read-only provider for view calls ──────────────────────────
const readProvider = new JsonRpcProvider(SOMNIA_TESTNET.rpcUrl, {
  chainId: SOMNIA_TESTNET.chainId,
  name: SOMNIA_TESTNET.name,
});

// ─── Contract instances (read-only) ────────────────────────────
const bettingPoolRead = new Contract(
  CONTRACT_ADDRESSES.ReactiveBettingPool,
  ReactiveBettingPoolABI,
  readProvider,
);

const sponsorshipRead = new Contract(
  CONTRACT_ADDRESSES.ReactiveSponsorship,
  ReactiveSponsorshipABI,
  readProvider,
);

const matchTimerRead = new Contract(
  CONTRACT_ADDRESSES.ReactiveMatchTimer,
  ReactiveMatchTimerABI,
  readProvider,
);

// ─── Team → Agent address mapping ──────────────────────────────
// Each team is represented by a deterministic address derived from team name
// These serve as agent identifiers in the contract
const TEAM_AGENTS: Record<Team, string> = {
  blue:   '0x0000000000000000000000000000000000000001',
  red:    '0x0000000000000000000000000000000000000002',
  green:  '0x0000000000000000000000000000000000000003',
  yellow: '0x0000000000000000000000000000000000000004',
};

export function getAgentAddress(team: Team): string {
  return TEAM_AGENTS[team];
}

export function getTeamFromAgent(agent: string): Team | null {
  const lower = agent.toLowerCase();
  for (const [team, addr] of Object.entries(TEAM_AGENTS)) {
    if (addr.toLowerCase() === lower) return team as Team;
  }
  return null;
}

// ─── Match ID helpers ──────────────────────────────────────────
export function generateMatchId(): string {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2);
  return keccak256(`match-${timestamp}-${random}`);
}

// ─── Signed contract helpers ───────────────────────────────────
function getSignedBettingPool() {
  const { signer } = getWalletState();
  if (!signer) throw new Error('Wallet not connected');
  return new Contract(CONTRACT_ADDRESSES.ReactiveBettingPool, ReactiveBettingPoolABI, signer);
}

function getSignedSponsorship() {
  const { signer } = getWalletState();
  if (!signer) throw new Error('Wallet not connected');
  return new Contract(CONTRACT_ADDRESSES.ReactiveSponsorship, ReactiveSponsorshipABI, signer);
}

// ─── Betting Pool Functions ────────────────────────────────────

export interface MatchInfo {
  totalPool: string; // in STT
  state: number; // 0=PENDING, 1=ACTIVE, 2=RESOLVED, 3=CANCELLED
  winner: string;
  startTime: number;
  agentCount: number;
}

export interface TeamOdds {
  team: Team;
  odds: number; // e.g. 250 = 2.5x
  pool: string; // in STT
}

export async function getMatchInfo(matchId: string): Promise<MatchInfo> {
  const [totalPool, state, winner, startTime, agentCount] = await bettingPoolRead.getMatchInfo(matchId);
  return {
    totalPool: formatEther(totalPool),
    state: Number(state),
    winner,
    startTime: Number(startTime),
    agentCount: Number(agentCount),
  };
}

export async function getTeamOdds(matchId: string, team: Team): Promise<number> {
  const agent = TEAM_AGENTS[team];
  const odds = await bettingPoolRead.calculateOdds(matchId, agent);
  return Number(odds);
}

export async function getAllTeamOdds(matchId: string): Promise<TeamOdds[]> {
  const teams: Team[] = ['blue', 'red', 'green', 'yellow'];
  const results: TeamOdds[] = [];

  for (const team of teams) {
    const agent = TEAM_AGENTS[team];
    try {
      const odds = await bettingPoolRead.calculateOdds(matchId, agent);
      results.push({ team, odds: Number(odds), pool: '0' });
    } catch {
      results.push({ team, odds: 100, pool: '0' });
    }
  }

  return results;
}

export async function placeBet(matchId: string, team: Team, amountSTT: string): Promise<ContractTransactionResponse> {
  const contract = getSignedBettingPool();
  const agent = TEAM_AGENTS[team];
  const tx = await contract.placeBet(matchId, agent, {
    value: parseEther(amountSTT),
  });
  return tx;
}

export async function getUserBet(matchId: string, team: Team, userAddress: string): Promise<string> {
  const agent = TEAM_AGENTS[team];
  const amount = await bettingPoolRead.getUserBet(matchId, userAddress, agent);
  return formatEther(amount);
}

// ─── Sponsorship Functions ─────────────────────────────────────

export enum ItemType {
  HEALTH_PACK = 0,
  AMMO_CRATE = 1,
  SHIELD_BUBBLE = 2,
  DAMAGE_BOOST = 3,
}

export const ITEM_NAMES: Record<ItemType, string> = {
  [ItemType.HEALTH_PACK]: 'Health Pack',
  [ItemType.AMMO_CRATE]: 'Ammo Crate',
  [ItemType.SHIELD_BUBBLE]: 'Shield Bubble',
  [ItemType.DAMAGE_BOOST]: 'Damage Boost',
};

export const ITEM_ICONS: Record<ItemType, string> = {
  [ItemType.HEALTH_PACK]: '❤️',
  [ItemType.AMMO_CRATE]: '📦',
  [ItemType.SHIELD_BUBBLE]: '🛡️',
  [ItemType.DAMAGE_BOOST]: '⚔️',
};

export const ITEM_DESCRIPTIONS: Record<ItemType, string> = {
  [ItemType.HEALTH_PACK]: 'Restore agent HP instantly',
  [ItemType.AMMO_CRATE]: 'Refill ammunition for the squad',
  [ItemType.SHIELD_BUBBLE]: 'Temporary damage reduction shield',
  [ItemType.DAMAGE_BOOST]: 'Temporary attack power increase',
};

export async function getItemCost(item: ItemType): Promise<string> {
  const cost = await sponsorshipRead.getItemCost(item);
  return formatEther(cost);
}

export async function getAllItemCosts(): Promise<Record<ItemType, string>> {
  const costs: Record<number, string> = {};
  for (const item of [ItemType.HEALTH_PACK, ItemType.AMMO_CRATE, ItemType.SHIELD_BUBBLE, ItemType.DAMAGE_BOOST]) {
    try {
      costs[item] = await getItemCost(item);
    } catch {
      costs[item] = '0.001';
    }
  }
  return costs as Record<ItemType, string>;
}

export async function sponsorAgent(
  matchId: string,
  team: Team,
  item: ItemType,
): Promise<ContractTransactionResponse> {
  const contract = getSignedSponsorship();
  const agent = TEAM_AGENTS[team];
  const cost = await sponsorshipRead.getItemCost(item);

  const tx = await contract.sponsorAgent(matchId, agent, item, {
    value: cost,
  });
  return tx;
}

export async function getMatchSponsorStats(matchId: string) {
  const [totalSponsored, totalValue, active] = await sponsorshipRead.getMatchStats(matchId);
  return {
    totalSponsored: Number(totalSponsored),
    totalValue: formatEther(totalValue),
    active,
  };
}

// ─── Event listeners for reactive updates ──────────────────────

export function onBetPlaced(matchId: string, callback: (user: string, agent: string, amount: string) => void) {
  const filter = bettingPoolRead.filters.BetPlaced(matchId);
  bettingPoolRead.on(filter, (mId: string, user: string, agent: string, amount: bigint) => {
    callback(user, agent, formatEther(amount));
  });
  return () => { bettingPoolRead.off(filter); };
}

export function onOddsUpdated(matchId: string, callback: (agent: string, newOdds: number) => void) {
  const filter = bettingPoolRead.filters.OddsUpdated(matchId);
  bettingPoolRead.on(filter, (mId: string, agent: string, newOdds: bigint) => {
    callback(agent, Number(newOdds));
  });
  return () => { bettingPoolRead.off(filter); };
}

export function onItemSponsored(
  matchId: string,
  callback: (agent: string, item: ItemType, sponsor: string, cost: string) => void,
) {
  const filter = sponsorshipRead.filters.ItemSponsored(matchId);
  sponsorshipRead.on(filter, (mId: string, agent: string, item: number, sponsor: string, deliveryId: bigint, cost: bigint) => {
    callback(agent, item as ItemType, sponsor, formatEther(cost));
  });
  return () => { sponsorshipRead.off(filter); };
}

// ─── Exports ───────────────────────────────────────────────────
export { bettingPoolRead, sponsorshipRead, matchTimerRead, readProvider };
