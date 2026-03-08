import { useState } from 'react';
import { Team, TEAM_COLORS } from '@/game/types';
import { Coins, Lock, TrendingUp, Users, Zap } from 'lucide-react';

interface Bet {
  team: Team;
  amount: number;
}

interface CryptoBettingPanelProps {
  disabled?: boolean;
}

const TEAMS: Team[] = ['blue', 'red', 'green', 'yellow'];

const TEAM_NAMES: Record<Team, string> = {
  blue: 'AZURE WOLVES',
  red: 'CRIMSON HAWKS',
  green: 'JADE VIPERS',
  yellow: 'GOLD LIONS',
};

const QUICK_AMOUNTS = [0.1, 0.25, 0.5, 1.0];

export function CryptoBettingPanel({ disabled = true }: CryptoBettingPanelProps) {
  const [bets, setBets] = useState<Bet[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [walletConnected] = useState(false);

  const totalPool = bets.reduce((s, b) => s + b.amount, 0);
  const uniqueTeams = new Set(bets.map(b => b.team)).size;
  const canStart = uniqueTeams >= 2;

  const handlePlaceBet = (team: Team, amount: number) => {
    if (disabled) return;
    setBets(prev => [...prev, { team, amount }]);
    setSelectedTeam(null);
    setCustomAmount('');
  };

  const getTeamPool = (team: Team) => bets.filter(b => b.team === team).reduce((s, b) => s + b.amount, 0);
  const getTeamOdds = (team: Team) => {
    const teamPool = getTeamPool(team);
    if (totalPool === 0 || teamPool === 0) return '—';
    return `${(totalPool / teamPool).toFixed(1)}x`;
  };

  return (
    <div className="w-full max-w-sm space-y-3">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <Coins className="w-4 h-4 text-accent" />
          <h2 className="text-[11px] font-bold text-accent tracking-[0.2em]">BATTLE WAGER</h2>
          <Coins className="w-4 h-4 text-accent" />
        </div>
        <p className="text-[7px] text-muted-foreground">Place bets with $WAR tokens on the winning squad</p>
      </div>

      {/* Wallet Connect */}
      <button
        className="w-full py-2 rounded-lg border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-all flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
        disabled
      >
        {walletConnected ? (
          <>
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[8px] text-foreground font-bold">0x7f3a...4d2e</span>
            <span className="text-[7px] text-muted-foreground">• 12.5 $WAR</span>
          </>
        ) : (
          <>
            <Lock className="w-3 h-3 text-accent" />
            <span className="text-[8px] text-accent font-bold tracking-wider">CONNECT WALLET</span>
          </>
        )}
      </button>

      {/* Team Cards */}
      <div className="grid grid-cols-2 gap-2">
        {TEAMS.map(team => {
          const teamPool = getTeamPool(team);
          const odds = getTeamOdds(team);
          const isSelected = selectedTeam === team;
          const teamColor = TEAM_COLORS[team];
          const hasBet = teamPool > 0;

          return (
            <button
              key={team}
              disabled={disabled}
              onClick={() => !disabled && setSelectedTeam(isSelected ? null : team)}
              className={`relative overflow-hidden rounded-lg border p-2.5 text-left transition-all ${
                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'
              } ${isSelected ? 'ring-1' : ''}`}
              style={{
                borderColor: isSelected ? teamColor : `${teamColor}30`,
                backgroundColor: `${teamColor}08`,
                ...(isSelected ? { boxShadow: `0 0 0 1px ${teamColor}` } : {}),
              }}
            >
              {/* Team color accent bar */}
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: teamColor }} />

              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: teamColor }} />
                <span className="text-[8px] font-bold text-foreground">{TEAM_NAMES[team]}</span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[6px] text-muted-foreground">POOL</div>
                  <div className="text-[9px] font-bold text-foreground">
                    {teamPool > 0 ? `${teamPool.toFixed(2)} $WAR` : '—'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[6px] text-muted-foreground">ODDS</div>
                  <div className="text-[9px] font-bold" style={{ color: teamColor }}>{odds}</div>
                </div>
              </div>

              {hasBet && (
                <div className="mt-1.5 bg-card/60 rounded px-1.5 py-0.5 flex items-center gap-1">
                  <TrendingUp className="w-2.5 h-2.5 text-accent" />
                  <span className="text-[6px] text-accent font-bold">YOUR BET: {teamPool.toFixed(2)}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bet Amount Selector (shows when team selected) */}
      {selectedTeam && !disabled && (
        <div
          className="rounded-lg border p-3 space-y-2 animate-in slide-in-from-top-2 duration-200"
          style={{ borderColor: `${TEAM_COLORS[selectedTeam]}40`, backgroundColor: `${TEAM_COLORS[selectedTeam]}05` }}
        >
          <div className="text-[7px] text-muted-foreground tracking-wider">
            BET ON <span className="font-bold" style={{ color: TEAM_COLORS[selectedTeam] }}>{TEAM_NAMES[selectedTeam]}</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => handlePlaceBet(selectedTeam, amt)}
                className="py-1.5 rounded border border-border/30 bg-secondary/40 hover:bg-secondary/70 transition-all text-[8px] font-bold text-foreground"
              >
                {amt} $WAR
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Custom amount..."
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              className="flex-1 bg-secondary/30 border border-border/30 rounded px-2 py-1.5 text-[8px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/50"
            />
            <button
              onClick={() => {
                const amt = parseFloat(customAmount);
                if (amt > 0) handlePlaceBet(selectedTeam, amt);
              }}
              disabled={!customAmount || parseFloat(customAmount) <= 0}
              className="px-3 py-1.5 rounded bg-accent/20 border border-accent/30 text-[8px] font-bold text-accent hover:bg-accent/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              BET
            </button>
          </div>
        </div>
      )}

      {/* Pool Summary */}
      <div className="rounded-lg border border-border/20 bg-card/60 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users className="w-3 h-3 text-muted-foreground" />
            <span className="text-[7px] text-muted-foreground">TOTAL POOL</span>
          </div>
          <span className="text-[10px] font-bold text-foreground">
            {totalPool > 0 ? `${totalPool.toFixed(2)} $WAR` : '0.00 $WAR'}
          </span>
        </div>

        <div className="h-2 bg-muted/30 rounded-full overflow-hidden flex">
          {TEAMS.map(team => {
            const pct = totalPool > 0 ? (getTeamPool(team) / totalPool) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={team}
                className="h-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: TEAM_COLORS[team] }}
              />
            );
          })}
        </div>

        {/* Min bet requirement */}
        <div className="flex items-center gap-1.5 pt-1">
          <Zap className="w-3 h-3" style={{ color: canStart ? 'hsl(142, 70%, 45%)' : 'hsl(0, 75%, 55%)' }} />
          <span className="text-[6px]" style={{ color: canStart ? 'hsl(142, 70%, 45%)' : 'hsl(0, 75%, 55%)' }}>
            {canStart
              ? '✓ MIN 2 TEAMS COVERED — READY TO FIGHT'
              : `NEED BETS ON ${2 - uniqueTeams} MORE TEAM${2 - uniqueTeams > 1 ? 'S' : ''} TO START`
            }
          </span>
        </div>
      </div>

      {/* Disabled overlay message */}
      {disabled && (
        <div className="text-center py-1.5 rounded-lg border border-accent/20 bg-accent/5">
          <div className="text-[7px] text-accent font-bold tracking-wider">🔒 COMING SOON</div>
          <div className="text-[5px] text-muted-foreground mt-0.5">Crypto betting will be enabled in a future update</div>
        </div>
      )}
    </div>
  );
}
