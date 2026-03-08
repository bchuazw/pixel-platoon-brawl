import { useState } from 'react';
import { Team, TEAM_COLORS } from '@/game/types';

interface BettingPanelProps {
  onPlaceBet: (team: Team, amount: number) => void;
  sponsorPoints: number;
}

const BET_AMOUNTS = [1, 2, 3, 5];

export function BettingPanel({ onPlaceBet, sponsorPoints }: BettingPanelProps) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedAmount, setSelectedAmount] = useState(2);

  const handlePlaceBet = () => {
    if (!selectedTeam || selectedAmount > sponsorPoints) return;
    onPlaceBet(selectedTeam, selectedAmount);
  };

  return (
    <div className="bg-card/90 border border-accent/30 rounded-xl p-4 backdrop-blur-sm max-w-[320px] mx-auto mt-4">
      <div className="text-center mb-3">
        <div className="text-[8px] tracking-[0.3em] text-accent font-bold">🎰 PREDICTIONS</div>
        <p className="text-[7px] text-muted-foreground mt-0.5">Bet sponsor points on the winning team • 3x payout!</p>
      </div>

      {/* Team selection */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {(['blue', 'red', 'green', 'yellow'] as Team[]).map(team => (
          <button
            key={team}
            onClick={() => setSelectedTeam(team)}
            className={`relative rounded-lg p-2 border-2 transition-all ${
              selectedTeam === team
                ? 'scale-105 shadow-lg'
                : 'border-border/30 hover:border-border/60 opacity-70 hover:opacity-100'
            }`}
            style={{
              borderColor: selectedTeam === team ? TEAM_COLORS[team] : undefined,
              boxShadow: selectedTeam === team ? `0 0 15px ${TEAM_COLORS[team]}44` : undefined,
            }}
          >
            <div
              className="w-6 h-6 rounded-md mx-auto mb-1"
              style={{ backgroundColor: TEAM_COLORS[team] }}
            />
            <div className="text-[7px] font-bold text-foreground uppercase tracking-wider">{team}</div>
          </button>
        ))}
      </div>

      {/* Amount selection */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="text-[7px] text-muted-foreground">BET:</span>
        {BET_AMOUNTS.map(amt => (
          <button
            key={amt}
            onClick={() => setSelectedAmount(amt)}
            disabled={amt > sponsorPoints}
            className={`px-2.5 py-1 rounded text-[8px] font-bold transition-all ${
              selectedAmount === amt
                ? 'bg-accent text-accent-foreground'
                : amt > sponsorPoints
                  ? 'bg-muted/30 text-muted-foreground/30 cursor-not-allowed'
                  : 'bg-secondary text-secondary-foreground hover:bg-muted'
            }`}
          >
            ⭐{amt}
          </button>
        ))}
      </div>

      {/* Place bet button */}
      <button
        onClick={handlePlaceBet}
        disabled={!selectedTeam || selectedAmount > sponsorPoints}
        className={`w-full py-2 rounded-lg text-[9px] tracking-[0.2em] font-bold transition-all ${
          selectedTeam && selectedAmount <= sponsorPoints
            ? 'bg-accent text-accent-foreground hover:opacity-90'
            : 'bg-muted/30 text-muted-foreground/50 cursor-not-allowed'
        }`}
      >
        {selectedTeam
          ? `BET ⭐${selectedAmount} ON ${selectedTeam.toUpperCase()} (WIN ⭐${selectedAmount * 3})`
          : 'SELECT A TEAM'}
      </button>

      <p className="text-[6px] text-muted-foreground text-center mt-1.5">
        Balance: ⭐{sponsorPoints} • Optional — skip to just watch
      </p>
    </div>
  );
}
