/**
 * In-game overlay showing reactive sponsorship events
 * Displays a toast-like notification when items are sponsored on-chain
 */
import { useState, useEffect } from 'react';
import { TEAM_COLORS, Team } from '@/game/types';
import { onItemSponsored, getTeamFromAgent, ItemType, ITEM_NAMES, ITEM_ICONS } from '@/somnia/contracts';

interface SponsorEvent {
  id: string;
  team: Team;
  item: ItemType;
  sponsor: string;
  timestamp: number;
}

interface SponsorOverlayProps {
  matchId: string | null;
}

const TEAM_NAMES: Record<Team, string> = {
  blue: 'AZURE WOLVES',
  red: 'CRIMSON HAWKS',
  green: 'JADE VIPERS',
  yellow: 'GOLD LIONS',
};

export function SponsorOverlay({ matchId }: SponsorOverlayProps) {
  const [events, setEvents] = useState<SponsorEvent[]>([]);

  useEffect(() => {
    if (!matchId) return;
    const unsub = onItemSponsored(matchId, (agent, item, sponsor) => {
      const team = getTeamFromAgent(agent);
      if (!team) return;

      const event: SponsorEvent = {
        id: `${Date.now()}-${Math.random()}`,
        team,
        item,
        sponsor: `${sponsor.slice(0, 6)}...${sponsor.slice(-4)}`,
        timestamp: Date.now(),
      };

      setEvents(prev => [...prev, event]);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        setEvents(prev => prev.filter(e => e.id !== event.id));
      }, 5000);
    });

    return unsub;
  }, [matchId]);

  if (events.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-40 space-y-2 pointer-events-none">
      {events.map(event => (
        <div
          key={event.id}
          className="animate-in slide-in-from-right-4 fade-in duration-300 bg-card/90 backdrop-blur-md border rounded-lg px-4 py-3 min-w-[240px] shadow-lg"
          style={{ borderColor: TEAM_COLORS[event.team] + '60' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[9px] text-green-400 font-bold tracking-wider">⚡ REACTIVE SPONSORSHIP</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{ITEM_ICONS[event.item]}</span>
            <div>
              <div className="text-[11px] text-foreground font-bold">
                {ITEM_NAMES[event.item]} → <span style={{ color: TEAM_COLORS[event.team] }}>{TEAM_NAMES[event.team]}</span>
              </div>
              <div className="text-[9px] text-muted-foreground">
                by {event.sponsor} • on-chain delivery
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
