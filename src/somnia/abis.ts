/**
 * Contract ABIs for Somnia Reactivity contracts
 * Extracted from deployed Reactivity Arena contracts
 */

export const ReactiveBettingPoolABI = [
  // Constants
  'function MIN_BET() view returns (uint256)',
  'function MAX_AGENTS_PER_MATCH() view returns (uint256)',
  // State
  'function owner() view returns (address)',
  'function gameServer() view returns (address)',
  'function houseWallet() view returns (address)',
  // Match management
  'function createMatch(bytes32 matchId, address[] agents, uint256 houseFeeBps)',
  'function placeBet(bytes32 matchId, address agent) payable',
  'function resolveMatch(bytes32 matchId, address winner)',
  'function cancelMatch(bytes32 matchId)',
  // Views
  'function calculateOdds(bytes32 matchId, address agent) view returns (uint256)',
  'function getMatchAgents(bytes32 matchId) view returns (address[])',
  'function getAgentBettors(bytes32 matchId, address agent) view returns (address[])',
  'function getUserBet(bytes32 matchId, address user, address agent) view returns (uint256)',
  'function getMatchInfo(bytes32 matchId) view returns (uint256 totalPool, uint8 state, address winner, uint256 startTime, uint256 agentCount)',
  // Events
  'event MatchCreated(bytes32 indexed matchId, address[] agents, uint256 houseFeeBps)',
  'event BetPlaced(bytes32 indexed matchId, address indexed user, address indexed agent, uint256 amount)',
  'event OddsUpdated(bytes32 indexed matchId, address indexed agent, uint256 newOdds)',
  'event MatchStarted(bytes32 indexed matchId, uint256 startTime)',
  'event MatchAutoResolved(bytes32 indexed matchId, address indexed winner, uint256 totalPool)',
  'event PayoutDistributed(bytes32 indexed matchId, address indexed bettor, uint256 amount)',
  'event MatchCancelled(bytes32 indexed matchId)',
] as const;

export const ReactiveSponsorshipABI = [
  // State
  'function owner() view returns (address)',
  'function gameServer() view returns (address)',
  'function houseWallet() view returns (address)',
  'function bettingPool() view returns (address)',
  'function prizePoolShareBps() view returns (uint256)',
  'function houseShareBps() view returns (uint256)',
  'function totalSponsorshipsAllTime() view returns (uint256)',
  // Admin
  'function registerMatch(bytes32 matchId, address[] agents)',
  'function deactivateMatch(bytes32 matchId)',
  'function setItemCost(uint8 item, uint256 cost)',
  // Sponsorship
  'function sponsorAgent(bytes32 matchId, address agent, uint8 item) payable',
  'function confirmDelivery(bytes32 matchId, uint256 deliveryId)',
  // Views
  'function itemCosts(uint8 item) view returns (uint256)',
  'function getItemCost(uint8 item) view returns (uint256)',
  'function getMatchSponsorshipCount(bytes32 matchId) view returns (uint256)',
  'function getSponsorship(bytes32 matchId, uint256 index) view returns (address sponsor, address agent, uint8 item, uint256 cost, uint256 timestamp, bool delivered)',
  'function getMatchStats(bytes32 matchId) view returns (uint256 totalSponsored, uint256 totalValue, bool active)',
  'function isAgentInMatch(bytes32 matchId, address agent) view returns (bool)',
  // Events
  'event ItemSponsored(bytes32 indexed matchId, address indexed agent, uint8 item, address indexed sponsor, uint256 deliveryId, uint256 cost)',
  'event ItemDelivered(bytes32 indexed matchId, uint256 indexed deliveryId)',
  'event MatchRegistered(bytes32 indexed matchId, address[] agents)',
  'event MatchDeactivated(bytes32 indexed matchId)',
  'event ItemCostUpdated(uint8 indexed item, uint256 newCost)',
] as const;

export const ReactiveMatchTimerABI = [
  // Constants
  'function TURN_TIMEOUT() view returns (uint256)',
  'function MATCH_TIMEOUT() view returns (uint256)',
  'function DEFAULT_MAX_TURNS() view returns (uint256)',
  // Match lifecycle
  'function createMatch(bytes32 matchId, address[] agents, uint256 maxTurns)',
  'function startMatch(bytes32 matchId)',
  'function advanceTurn(bytes32 matchId)',
  'function checkTurnTimeout(bytes32 matchId)',
  'function checkStaleMatch(bytes32 matchId)',
  'function recordActivity(bytes32 matchId)',
  'function pauseMatch(bytes32 matchId)',
  'function resumeMatch(bytes32 matchId)',
  'function endMatch(bytes32 matchId, address winner)',
  // Views
  'function getMatchTimer(bytes32 matchId) view returns (uint8 phase, uint256 startTime, uint256 lastActivity, uint256 turnDeadline, uint256 turnNumber, uint256 maxTurns, address activeAgent)',
  'function getMatchAgents(bytes32 matchId) view returns (address[])',
  'function getCurrentAgent(bytes32 matchId) view returns (address)',
  'function isTurnExpired(bytes32 matchId) view returns (bool)',
  'function isMatchStale(bytes32 matchId) view returns (bool)',
  'function getTimeUntilTurnExpiry(bytes32 matchId) view returns (uint256)',
  // Events
  'event MatchCreated(bytes32 indexed matchId, address[] agents, uint256 maxTurns)',
  'event MatchStarted(bytes32 indexed matchId, uint256 startTime)',
  'event TurnAdvanced(bytes32 indexed matchId, address indexed currentAgent, uint256 turnNumber, uint256 turnDeadline)',
  'event TurnForced(bytes32 indexed matchId, address indexed agent, uint256 turnNumber)',
  'event MatchPhaseChanged(bytes32 indexed matchId, uint8 newPhase)',
  'event StaleMatchDetected(bytes32 indexed matchId, uint256 inactiveDuration)',
  'event MatchAutoEnded(bytes32 indexed matchId, address indexed lastActiveAgent, string reason)',
  'event ActivityRecorded(bytes32 indexed matchId, uint256 timestamp)',
] as const;
