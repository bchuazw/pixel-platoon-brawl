import { useEffect, useRef, useState } from 'react';
import { GameState, TEAM_COLORS, Team } from '@/game/types';

interface Announcement {
  id: string;
  text: string;
  subtext?: string;
  color: string;
  icon: string;
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

  // Detect milestones
  useEffect(() => {
    const newAnnouncements: Announcement[] = [];

    // Kill events
    const killEvents = state.combatEvents.filter(e => e.type === 'kill' && !seenKills.current.has(e.id));
    for (const evt of killEvents) {
      seenKills.current.add(evt.id);

      // First blood
      if (!firstBloodDone.current) {
        firstBloodDone.current = true;
        newAnnouncements.push({
          id: `fb-${evt.id}`,
          text: 'FIRST BLOOD',
          subtext: evt.message.split('!')[0],
          color: '#ff4444',
          icon: '🩸',
          duration: 3000,
        });
        continue;
      }
    }

    // Double kill detection: a unit with kills >= 2 in recent events
    if (killEvents.length >= 2) {
      // Check if same attacker
      const attackerPositions = killEvents.map(e => `${e.attackerPos.x},${e.attackerPos.z}`);
      const uniqueAttackers = new Set(attackerPositions);
      if (uniqueAttackers.size === 1) {
        newAnnouncements.push({
          id: `dk-${Date.now()}`,
          text: 'DOUBLE KILL',
          subtext: 'Devastating efficiency!',
          color: '#ff8800',
          icon: '💀💀',
          duration: 3000,
        });
      }
    }

    // Zone closing
    if (state.shrinkLevel > lastShrink.current) {
      lastShrink.current = state.shrinkLevel;
      newAnnouncements.push({
        id: `zone-${state.shrinkLevel}`,
        text: 'ZONE CLOSING',
        subtext: `Danger level ${state.shrinkLevel} — The ring tightens!`,
        color: '#ff2222',
        icon: '⚠️',
        duration: 3500,
      });
    }

    // Last stand: team down to 1 unit
    const teamCounts: Record<Team, number> = { blue: 0, red: 0, green: 0, yellow: 0 };
    for (const u of state.units) {
      if (u.isAlive) teamCounts[u.team]++;
    }
    for (const team of ['blue', 'red', 'green', 'yellow'] as Team[]) {
      if (teamCounts[team] === 1 && lastTeamCounts.current[team] > 1) {
        const survivor = state.units.find(u => u.team === team && u.isAlive);
        newAnnouncements.push({
          id: `ls-${team}-${Date.now()}`,
          text: 'LAST STAND',
          subtext: `${survivor?.name || team.toUpperCase()} is the last one standing!`,
          color: TEAM_COLORS[team],
          icon: '🔥',
          duration: 3500,
        });
      }
    }
    lastTeamCounts.current = teamCounts;

    // Round announcements (every 3 turns)
    if (state.turn > lastTurn.current && state.turn % 3 === 0) {
      const alive = state.units.filter(u => u.isAlive).length;
      newAnnouncements.push({
        id: `round-${state.turn}`,
        text: `ROUND ${state.turn}`,
        subtext: `${alive} combatants remain`,
        color: '#88aaff',
        icon: '⚔️',
        duration: 2500,
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

    const timer = setTimeout(() => {
      setCurrent(null);
    }, next.duration);

    return () => clearTimeout(timer);
  }, [current, queue]);

  if (!current) return null;

  return (
    <div className="absolute inset-0 z-25 pointer-events-none flex items-center justify-center">
      {/* Flash overlay */}
      <div
        className="absolute inset-0 animate-flash-overlay"
        style={{ background: `radial-gradient(ellipse at center, ${current.color}15 0%, transparent 60%)` }}
      />

      {/* Main announcement */}
      <div className="animate-broadcast-in flex flex-col items-center gap-1">
        {/* Horizontal lines */}
        <div className="flex items-center gap-4 w-full">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${current.color}60)` }} />
          <span className="text-[10px] tracking-[0.4em] opacity-70" style={{ color: current.color }}>
            {current.icon}
          </span>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${current.color}60)` }} />
        </div>

        {/* Title */}
        <h2
          className="text-[36px] font-black tracking-[0.3em] leading-none"
          style={{
            color: current.color,
            textShadow: `0 0 40px ${current.color}88, 0 0 80px ${current.color}44, 0 2px 10px rgba(0,0,0,0.8)`,
            fontFamily: "'Share Tech Mono', monospace",
          }}
        >
          {current.text}
        </h2>

        {/* Subtext */}
        {current.subtext && (
          <p className="text-[10px] tracking-[0.15em] text-foreground/70 mt-1" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            {current.subtext}
          </p>
        )}

        {/* Bottom line */}
        <div className="flex items-center gap-4 w-full mt-1">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${current.color}40)` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: current.color }} />
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${current.color}40)` }} />
        </div>
      </div>

      {/* CSS */}
      <style>{`
        @keyframes broadcast-in {
          0% { opacity: 0; transform: scale(1.3) translateY(-10px); filter: blur(8px); }
          15% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
          80% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.95) translateY(5px); filter: blur(4px); }
        }
        .animate-broadcast-in {
          animation: broadcast-in var(--duration, 3s) cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes flash-overlay {
          0% { opacity: 0; }
          10% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 0; }
        }
        .animate-flash-overlay {
          animation: flash-overlay 1.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
