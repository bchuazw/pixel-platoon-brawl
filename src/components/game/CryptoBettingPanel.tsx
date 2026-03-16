import { useState, useEffect, useCallback } from 'react';
import { Team, TEAM_COLORS } from '@/game/types';
import { Coins, TrendingUp, Users, Zap, Loader2, ExternalLink, Wifi } from 'lucide-react';
import { useWallet } from '@/somnia/useWallet';
import {
  placeBet,
  getTeamOdds,
  getUserBet,
  getAgentAddress,
  onOddsUpdated,
  onBetPlaced,
  getTeamFromAgent,
} from '@/somnia/contracts';
import { SOMNIA_TESTNET } from '@/somnia/config';

interface CryptoBettingPanelProps {
  matchId: string | null;
  disabled?: boolean;
  demoMode?: boolean;
}

const TEAMS: Team[] = ['blue', 'red', 'green', 'yellow'];

const TEAM_NAMES: Record<Team, string> = {
  blue: 'AZURE WOLVES',
  red: 'CRIMSON HAWKS',
  green: 'JADE VIPERS',
  yellow: 'GOLD LIONS',
};

const QUICK_AMOUNTS = ['0.001', '0.005', '0.01', '0.05'];

interface TeamBetInfo {
  odds: number;
  userBet: string;
}

export function CryptoBettingPanel({ matchId, disabled = false, demoMode = true }: CryptoBettingPanelProps) {
  const realWallet = useWallet();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [betting, setBetting] = useState(false);
  const [teamInfo, setTeamInfo] = useState<Record<Team, TeamBetInfo>>({
    blue: { odds: 100, userBet: '0' },
    red: { odds: 100, userBet: '0' },
    green: { odds: 100, userBet: '0' },
    yellow: { odds: 100, userBet: '0' },
  });
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentBets, setRecentBets] = useState<Array<{ team: Team; amount: string; user: string }>>([]);
  const [demoBalance, setDemoBalance] = useState('25.0000');

  const wallet = demoMode
    ? { connected: true, connecting: false, address: '0xDem0...1337', shortAddress: '0xDem0...1337', balance: demoBalance, error: null, connect: () => {}, disconnect: () => {} }
    : realWallet;

  // Load odds from contract (skip in demo mode)
  const refreshOdds = useCallback(async () => {
    if (!matchId || demoMode) return;
    const updates: Partial<Record<Team, TeamBetInfo>> = {};
    for (const team of TEAMS) {
      try {
        const odds = await getTeamOdds(matchId, team);
        const userBet = wallet.address ? await getUserBet(matchId, team, wallet.address) : '0';
        updates[team] = { odds, userBet };
      } catch {
        updates[team] = { odds: 100, userBet: '0' };
      }
    }
    setTeamInfo(prev => ({ ...prev, ...updates }));
  }, [matchId, wallet.address, demoMode]);

  useEffect(() => {
    refreshOdds();
  }, [refreshOdds]);

  // Subscribe to reactive events (skip in demo mode)
  useEffect(() => {
    if (!matchId || demoMode) return;

    const unsubOdds = onOddsUpdated(matchId, (agent, newOdds) => {
      const team = getTeamFromAgent(agent);
      if (team) {
        setTeamInfo(prev => ({
          ...prev,
          [team]: { ...prev[team], odds: newOdds },
        }));
      }
    });

    const unsubBets = onBetPlaced(matchId, (user, agent, amount) => {
      const team = getTeamFromAgent(agent);
      if (team) {
        setRecentBets(prev => [{ team, amount, user: `${user.slice(0, 6)}...${user.slice(-4)}` }, ...prev].slice(0, 5));
        refreshOdds();
      }
    });

    return () => { unsubOdds(); unsubBets(); };
  }, [matchId, refreshOdds, demoMode]);

  const handlePlaceBet = async (team: Team, amount: string) => {
    if (!matchId || !wallet.connected || betting) return;
    setError(null);
    setTxHash(null);
    setBetting(true);

    if (demoMode) {
      await new Promise(r => setTimeout(r, 600));
      const fakeHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      setTxHash(fakeHash);
      setTeamInfo(prev => ({
        ...prev,
        [team]: { ...prev[team], userBet: (parseFloat(prev[team].userBet) + parseFloat(amount)).toString() },
      }));
      setRecentBets(prev => [{ team, amount, user: '0xDem0...1337' }, ...prev].slice(0, 5));
      setDemoBalance(prev => (parseFloat(prev) - parseFloat(amount)).toFixed(4));
      setSelectedTeam(null);
      setCustomAmount('');
      setBetting(false);
      return;
    }

    try {
      const tx = await placeBet(matchId, team, amount);
      setTxHash(tx.hash);
      await tx.wait();
      await refreshOdds();
      setSelectedTeam(null);
      setCustomAmount('');
    } catch (err: any) {
      setError(err.reason || err.message || 'Transaction failed');
    } finally {
      setBetting(false);
    }
  };

  const formatOdds = (odds: number) => {
    if (odds <= 0) return '—';
    return `${(odds / 100).toFixed(1)}x`;
  };

  const totalUserBet = TEAMS.reduce((sum, team) => sum + parseFloat(teamInfo[team].userBet || '0'), 0);
  const teamsWithBets = TEAMS.filter(t => parseFloat(teamInfo[t].userBet) > 0).length;

  return (
    <div className="w-full max-w-sm space-y-3">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <Coins className="w-4 h-4 text-accent" />
          <h2 className="text-[13px] font-bold text-accent tracking-[0.2em]">REACTIVE BETTING</h2>
          <Coins className="w-4 h-4 text-accent" />
        </div>
        <p className="text-[9px] text-muted-foreground">
          Place bets with STT on Somnia Testnet • Odds update reactively
        </p>
        <div className="flex items-center justify-center gap-1.5">
          <Wifi className="w-3 h-3 text-green-400" />
          <span className="text-[8px] text-green-400 font-bold tracking-wider">SOMNIA REACTIVITY • LIVE</span>
        </div>
      </div>

      {/* Wallet Connect */}
      <button
        onClick={wallet.connected ? wallet.disconnect : wallet.connect}
        disabled={wallet.connecting}
        className={`w-full py-2 rounded-lg border transition-all flex items-center justify-center gap-2 ${
          wallet.connected
            ? 'border-green-500/30 bg-green-500/5 hover:bg-green-500/10'
            : 'border-accent/30 bg-accent/5 hover:bg-accent/10'
        }`}
      >
        {wallet.connecting ? (
          <Loader2 className="w-3 h-3 text-accent animate-spin" />
        ) : wallet.connected ? (
          <>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-foreground font-bold">{wallet.shortAddress}</span>
            <span className="text-[9px] text-muted-foreground">• {parseFloat(wallet.balance || '0').toFixed(4)} STT</span>
          </>
        ) : (
          <>
            <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iOCIgZmlsbD0iIzY4NjZGRiIvPjxwYXRoIGQ9Ik00IDhoOE00IDEwaDgiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMS41Ii8+PC9zdmc+" alt="" className="w-3 h-3" />
            <span className="text-[10px] text-accent font-bold tracking-wider">CONNECT WALLET</span>
          </>
        )}
      </button>

      {wallet.error && (
        <div className="text-[9px] text-red-400 text-center px-2">{wallet.error}</div>
      )}

      {/* Team Cards */}
      <div className="grid grid-cols-2 gap-2">
        {TEAMS.map(team => {
          const info = teamInfo[team];
          const odds = formatOdds(info.odds);
          const isSelected = selectedTeam === team;
          const teamColor = TEAM_COLORS[team];
          const hasBet = parseFloat(info.userBet) > 0;

          return (
            <button
              key={team}
              disabled={disabled || !wallet.connected}
              onClick={() => wallet.connected && setSelectedTeam(isSelected ? null : team)}
              className={`relative overflow-hidden rounded-lg border p-2.5 text-left transition-all ${
                !wallet.connected || disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'
              } ${isSelected ? 'ring-1' : ''}`}
              style={{
                borderColor: isSelected ? teamColor : `${teamColor}30`,
                backgroundColor: `${teamColor}08`,
                ...(isSelected ? { boxShadow: `0 0 0 1px ${teamColor}` } : {}),
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: teamColor }} />

              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: teamColor }} />
                <span className="text-[10px] font-bold text-foreground">{TEAM_NAMES[team]}</span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[8px] text-muted-foreground">ODDS</div>
                  <div className="text-[11px] font-bold" style={{ color: teamColor }}>{odds}</div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] text-muted-foreground">YOUR BET</div>
                  <div className="text-[11px] font-bold text-foreground">
                    {hasBet ? `${parseFloat(info.userBet).toFixed(4)} STT` : '—'}
                  </div>
                </div>
              </div>

              {hasBet && (
                <div className="mt-1.5 bg-card/60 rounded px-1.5 py-0.5 flex items-center gap-1">
                  <TrendingUp className="w-2.5 h-2.5 text-green-400" />
                  <span className="text-[8px] text-green-400 font-bold">POSITION ACTIVE</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bet Amount Selector */}
      {selectedTeam && wallet.connected && !disabled && (
        <div
          className="rounded-lg border p-3 space-y-2 animate-in slide-in-from-top-2 duration-200"
          style={{ borderColor: `${TEAM_COLORS[selectedTeam]}40`, backgroundColor: `${TEAM_COLORS[selectedTeam]}05` }}
        >
          <div className="text-[9px] text-muted-foreground tracking-wider">
            BET ON <span className="font-bold" style={{ color: TEAM_COLORS[selectedTeam] }}>{TEAM_NAMES[selectedTeam]}</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => handlePlaceBet(selectedTeam, amt)}
                disabled={betting}
                className="py-1.5 rounded border border-border/30 bg-secondary/40 hover:bg-secondary/70 transition-all text-[10px] font-bold text-foreground disabled:opacity-50"
              >
                {amt} STT
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <input
              type="number"
              step="0.001"
              min="0.0001"
              placeholder="Custom STT..."
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              className="flex-1 bg-secondary/30 border border-border/30 rounded px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/50"
            />
            <button
              onClick={() => {
                const amt = parseFloat(customAmount);
                if (amt > 0) handlePlaceBet(selectedTeam, customAmount);
              }}
              disabled={!customAmount || parseFloat(customAmount) <= 0 || betting}
              className="px-3 py-1.5 rounded bg-accent/20 border border-accent/30 text-[10px] font-bold text-accent hover:bg-accent/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {betting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'BET'}
            </button>
          </div>
        </div>
      )}

      {/* Transaction Status */}
      {txHash && (
        <a
          href={`${SOMNIA_TESTNET.explorer}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-green-500/30 bg-green-500/5 text-green-400"
        >
          <span className="text-[9px] font-bold">✅ TX Confirmed</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      )}

      {error && (
        <div className="text-center py-1.5 rounded-lg border border-red-500/30 bg-red-500/5">
          <div className="text-[9px] text-red-400 font-bold px-2">{error}</div>
        </div>
      )}

      {/* Recent Bets Feed */}
      {recentBets.length > 0 && (
        <div className="rounded-lg border border-border/20 bg-card/40 p-2 space-y-1">
          <div className="text-[8px] text-muted-foreground tracking-wider mb-1">LIVE BET FEED</div>
          {recentBets.map((bet, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[8px]">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TEAM_COLORS[bet.team] }} />
              <span className="text-muted-foreground">{bet.user}</span>
              <span className="text-foreground font-bold">{parseFloat(bet.amount).toFixed(4)} STT</span>
              <span className="text-muted-foreground">on</span>
              <span style={{ color: TEAM_COLORS[bet.team] }} className="font-bold">{TEAM_NAMES[bet.team]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pool Summary */}
      <div className="rounded-lg border border-border/20 bg-card/60 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground">YOUR TOTAL BETS</span>
          </div>
          <span className="text-[12px] font-bold text-foreground">
            {totalUserBet > 0 ? `${totalUserBet.toFixed(4)} STT` : '0 STT'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <Zap className="w-3 h-3 text-accent" />
          <span className="text-[8px] text-accent">
            ⚡ Powered by Somnia Reactivity — odds update instantly on every bet
          </span>
        </div>
      </div>
    </div>
  );
}
