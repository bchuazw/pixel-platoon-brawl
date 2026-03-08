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
    <div className="bg-card/90 border border-accent/30 rounded-lg p-2.5 backdrop-blur-sm">
      <div className="text-[7px] tracking-[0.2em] text-accent font-bold text-center mb-1.5">🎰 PREDICTIONS</div>

      {/* Team selection */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {(['blue', 'red', 'green', 'yellow'] as Team[]).map(team => (
          <button
            key={team}
            onClick={() => setSelectedTeam(team)}
            className={`rounded p-1.5 border transition-all ${
              selectedTeam === team ? 'scale-105' : 'border-border/30 opacity-60 hover:opacity-100'
            }`}
            style={{
              borderColor: selectedTeam === team ? TEAM_COLORS[team] : undefined,
              boxShadow: selectedTeam === team ? `0 0 8px ${TEAM_COLORS[team]}33` : undefined,
            }}
          >
            <div className="w-4 h-4 rounded-sm mx-auto" style={{ backgroundColor: TEAM_COLORS[team] }} />
            <div className="text-[6px] font-bold text-foreground uppercase mt-0.5">{team}</div>
          </button>
        ))}
      </div>

      {/* Amount + bet button inline */}
      <div className="flex items-center gap-1 mb-1.5">
        {BET_AMOUNTS.map(amt => (
          <button
            key={amt}
            onClick={() => setSelectedAmount(amt)}
            disabled={amt > sponsorPoints}
            className={`flex-1 py-0.5 rounded text-[7px] font-bold transition-all ${
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

      <button
        onClick={handlePlaceBet}
        disabled={!selectedTeam || selectedAmount > sponsorPoints}
        className={`w-full py-1.5 rounded text-[7px] tracking-[0.15em] font-bold transition-all ${
          selectedTeam && selectedAmount <= sponsorPoints
            ? 'bg-accent text-accent-foreground hover:opacity-90'
            : 'bg-muted/30 text-muted-foreground/50 cursor-not-allowed'
        }`}
      >
        {selectedTeam ? `BET ⭐${selectedAmount} → WIN ⭐${selectedAmount * 3}` : 'SELECT A TEAM'}
      </button>

      <p className="text-[5px] text-muted-foreground text-center mt-1">⭐{sponsorPoints} available • optional</p>
    </div>
  );
}
