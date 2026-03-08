import { useEffect, useRef, useState } from 'react';
import { GameState, TEAM_COLORS, Team } from '@/game/types';

interface Announcement {
  id: string;
  text: string;
  subtext?: string;
  color: string;
  duration: number;
  size?: 'normal' | 'large';
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

    const killEvents = state.combatEvents.filter(e => e.type === 'kill' && !seenKills.current.has(e.id));
    for (const evt of killEvents) {
      seenKills.current.add(evt.id);
      if (!firstBloodDone.current) {
        firstBloodDone.current = true;
        newAnnouncements.push({
          id: `fb-${evt.id}`, text: 'FIRST BLOOD',
          subtext: evt.message.split('!')[0], color: '#ff4444', duration: 3000, size: 'large',
        });
        continue;
      }
    }

    if (killEvents.length >= 2) {
      const positions = killEvents.map(e => `${e.attackerPos.x},${e.attackerPos.z}`);
      if (new Set(positions).size === 1) {
        newAnnouncements.push({
          id: `dk-${Date.now()}`, text: 'DOUBLE KILL',
          subtext: 'Devastating efficiency', color: '#ff8800', duration: 3000, size: 'large',
        });
      }
    }

    if (state.shrinkLevel > lastShrink.current) {
      lastShrink.current = state.shrinkLevel;
      newAnnouncements.push({
        id: `zone-${state.shrinkLevel}`, text: 'ZONE CLOSING',
        subtext: `Danger level ${state.shrinkLevel}`, color: '#ff2222', duration: 3500,
      });
    }

    const teamCounts: Record<Team, number> = { blue: 0, red: 0, green: 0, yellow: 0 };
    for (const u of state.units) {
      if (u.isAlive) teamCounts[u.team]++;
    }
    for (const team of ['blue', 'red', 'green', 'yellow'] as Team[]) {
      if (teamCounts[team] === 0 && lastTeamCounts.current[team] > 0) {
        newAnnouncements.push({
          id: `elim-${team}-${Date.now()}`, text: 'TEAM ELIMINATED',
          subtext: `${team.toUpperCase()} has been wiped out`,
          color: TEAM_COLORS[team], duration: 3500, size: 'large',
        });
      }
      if (teamCounts[team] === 1 && lastTeamCounts.current[team] > 1) {
        const survivor = state.units.find(u => u.team === team && u.isAlive);
        newAnnouncements.push({
          id: `ls-${team}-${Date.now()}`, text: 'LAST STAND',
          subtext: `${survivor?.name || team.toUpperCase()} fights alone`,
          color: TEAM_COLORS[team], duration: 3500,
        });
      }
    }
    lastTeamCounts.current = teamCounts;

    if (state.turn > lastTurn.current && state.turn % 3 === 0) {
      const alive = state.units.filter(u => u.isAlive).length;
      newAnnouncements.push({
        id: `round-${state.turn}`, text: `ROUND ${state.turn}`,
        subtext: `${alive} combatants remain`, color: '#6688cc', duration: 2500,
      });
    }
    lastTurn.current = state.turn;

    if (newAnnouncements.length > 0) {
      setQueue(prev => [...prev, ...newAnnouncements]);
    }
  }, [state.combatEvents, state.shrinkLevel, state.units, state.turn]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0];
    setQueue(prev => prev.slice(1));
    setCurrent(next);
    const timer = setTimeout(() => setCurrent(null), next.duration);
    return () => clearTimeout(timer);
  }, [current, queue]);

  if (!current) return null;

  const isLarge = current.size === 'large';

  return (
    <div className="absolute inset-0 z-25 pointer-events-none flex items-center justify-center">
      <div className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at center, ${current.color}08 0%, transparent 50%)`, animation: 'flash-overlay 1.2s ease-out forwards' }} />

      <div className="flex flex-col items-center gap-2" style={{ animation: 'broadcast-in 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
        <div className="flex items-center gap-8 w-full">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${current.color}35)` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: current.color, opacity: 0.5 }} />
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${current.color}35)` }} />
        </div>

        <h2 className={`font-black leading-none font-display ${isLarge ? 'text-4xl tracking-[0.5em]' : 'text-3xl tracking-[0.4em]'}`}
          style={{
            color: current.color,
            textShadow: `0 0 40px ${current.color}55, 0 2px 10px rgba(0,0,0,0.8)`,
          }}>
          {current.text}
        </h2>

        {current.subtext && (
          <p className="text-sm tracking-[0.15em] text-foreground/50 mt-1"
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
            {current.subtext}
          </p>
        )}

        <div className="flex items-center gap-8 w-full mt-1">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${current.color}20)` }} />
          <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: current.color, opacity: 0.3 }} />
          <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${current.color}20)` }} />
        </div>
      </div>

      <style>{`
        @keyframes broadcast-in {
          0% { opacity: 0; transform: scale(1.15); filter: blur(8px); }
          10% { opacity: 1; transform: scale(1); filter: blur(0); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: scale(0.98); filter: blur(4px); }
        }
        @keyframes flash-overlay {
          0% { opacity: 0; }
          6% { opacity: 1; }
          35% { opacity: 0.3; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}