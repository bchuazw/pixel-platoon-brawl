import { useEffect, useRef, useState } from 'react';
import { GameState, TEAM_COLORS, Team } from '@/game/types';

interface Announcement {
  id: string;
  text: string;
  subtext?: string;
  color: string;
  duration: number;
}

interface BroadcastOverlayProps {
  state: GameState;
}

export function BroadcastOverlay({ state }: BroadcastOverlayProps) {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState<Announcement | null>(null);
  const seenKills = useRef(new Set<string>());
  const lastShrink = useRef(state.shrinkLevel);
  const lastTeamCounts = useRef<Record<Team, number>>({ blue: 2, red: 2, green: 2, yellow: 2 });
  const firstBloodDone = useRef(false);
  const lastTurn = useRef(state.turn);

  useEffect(() => {
    const newAnnouncements: Announcement[] = [];

    // Kill events
    const killEvents = state.combatEvents.filter(e => e.type === 'kill' && !seenKills.current.has(e.id));
    for (const evt of killEvents) {
      seenKills.current.add(evt.id);
      if (!firstBloodDone.current) {
        firstBloodDone.current = true;
        newAnnouncements.push({
          id: `fb-${evt.id}`, text: 'FIRST BLOOD',
          subtext: evt.message.split('!')[0], color: '#ff4444', duration: 2500,
        });
        continue;
      }
    }

    // Double kill
    if (killEvents.length >= 2) {
      const positions = killEvents.map(e => `${e.attackerPos.x},${e.attackerPos.z}`);
      if (new Set(positions).size === 1) {
        newAnnouncements.push({
          id: `dk-${Date.now()}`, text: 'DOUBLE KILL',
          subtext: 'Devastating efficiency', color: '#ff8800', duration: 2500,
        });
      }
    }

    // Zone closing
    if (state.shrinkLevel > lastShrink.current) {
      lastShrink.current = state.shrinkLevel;
      newAnnouncements.push({
        id: `zone-${state.shrinkLevel}`, text: 'ZONE CLOSING',
        subtext: `Danger level ${state.shrinkLevel}`, color: '#ff2222', duration: 3000,
      });
    }

    // Team eliminated
    const teamCounts: Record<Team, number> = { blue: 0, red: 0, green: 0, yellow: 0 };
    for (const u of state.units) {
      if (u.isAlive) teamCounts[u.team]++;
    }
    for (const team of ['blue', 'red', 'green', 'yellow'] as Team[]) {
      if (teamCounts[team] === 0 && lastTeamCounts.current[team] > 0) {
        newAnnouncements.push({
          id: `elim-${team}-${Date.now()}`, text: 'TEAM ELIMINATED',
          subtext: `${team.toUpperCase()} has been wiped out`,
          color: TEAM_COLORS[team], duration: 3000,
        });
      }
      // Last stand
      if (teamCounts[team] === 1 && lastTeamCounts.current[team] > 1) {
        const survivor = state.units.find(u => u.team === team && u.isAlive);
        newAnnouncements.push({
          id: `ls-${team}-${Date.now()}`, text: 'LAST STAND',
          subtext: `${survivor?.name || team.toUpperCase()} fights alone`,
          color: TEAM_COLORS[team], duration: 3000,
        });
      }
    }
    lastTeamCounts.current = teamCounts;

    // Round marker
    if (state.turn > lastTurn.current && state.turn % 3 === 0) {
      const alive = state.units.filter(u => u.isAlive).length;
      newAnnouncements.push({
        id: `round-${state.turn}`, text: `ROUND ${state.turn}`,
        subtext: `${alive} combatants remain`, color: '#6688cc', duration: 2000,
      });
    }
    lastTurn.current = state.turn;

    if (newAnnouncements.length > 0) {
      setQueue(prev => [...prev, ...newAnnouncements]);
    }
  }, [state.combatEvents, state.shrinkLevel, state.units, state.turn]);

  // Process queue
  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0];
    setQueue(prev => prev.slice(1));
    setCurrent(next);
    const timer = setTimeout(() => setCurrent(null), next.duration);
    return () => clearTimeout(timer);
  }, [current, queue]);

  if (!current) return null;

  return (
    <div className="absolute inset-0 z-25 pointer-events-none flex items-center justify-center">
      {/* Subtle radial flash */}
      <div
        className="absolute inset-0 animate-flash-overlay"
        style={{ background: `radial-gradient(ellipse at center, ${current.color}10 0%, transparent 50%)` }}
      />

      {/* Announcement */}
      <div className="animate-broadcast-in flex flex-col items-center gap-1">
        <div className="flex items-center gap-6 w-full">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${current.color}40)` }} />
          <div className="w-1 h-1 rotate-45" style={{ backgroundColor: current.color, opacity: 0.6 }} />
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${current.color}40)` }} />
        </div>

        <h2
          className="text-[28px] font-black tracking-[0.4em] leading-none"
          style={{
            color: current.color,
            textShadow: `0 0 30px ${current.color}66, 0 2px 8px rgba(0,0,0,0.8)`,
            fontFamily: "'Share Tech Mono', monospace",
          }}
        >
          {current.text}
        </h2>

        {current.subtext && (
          <p className="text-[9px] tracking-[0.15em] text-foreground/60 mt-0.5" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            {current.subtext}
          </p>
        )}

        <div className="flex items-center gap-6 w-full mt-0.5">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${current.color}25)` }} />
          <div className="w-1 h-1 rotate-45" style={{ backgroundColor: current.color, opacity: 0.4 }} />
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${current.color}25)` }} />
        </div>
      </div>

      <style>{`
        @keyframes broadcast-in {
          0% { opacity: 0; transform: scale(1.2); filter: blur(6px); }
          12% { opacity: 1; transform: scale(1); filter: blur(0); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: scale(0.97); filter: blur(3px); }
        }
        .animate-broadcast-in {
          animation: broadcast-in var(--duration, 2.5s) cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes flash-overlay {
          0% { opacity: 0; }
          8% { opacity: 1; }
          40% { opacity: 0.4; }
          100% { opacity: 0; }
        }
        .animate-flash-overlay {
          animation: flash-overlay 1.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
