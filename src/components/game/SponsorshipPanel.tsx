import { useState, useEffect, useCallback } from 'react';
import { Team, TEAM_COLORS } from '@/game/types';
import { Gift, Loader2, ExternalLink, Wifi, Package, Heart, Shield, Swords, ChevronDown } from 'lucide-react';
import { useWallet } from '@/somnia/useWallet';
import {
  sponsorAgent,
  getAllItemCosts,
  getMatchSponsorStats,
  onItemSponsored,
  getTeamFromAgent,
  ItemType,
  ITEM_NAMES,
  ITEM_ICONS,
  ITEM_DESCRIPTIONS,
} from '@/somnia/contracts';
import { SOMNIA_TESTNET } from '@/somnia/config';

interface SponsorshipPanelProps {
  matchId: string | null;
  disabled?: boolean;
}

const TEAMS: Team[] = ['blue', 'red', 'green', 'yellow'];

const TEAM_NAMES: Record<Team, string> = {
  blue: 'AZURE WOLVES',
  red: 'CRIMSON HAWKS',
  green: 'JADE VIPERS',
  yellow: 'GOLD LIONS',
};

const ITEMS = [ItemType.HEALTH_PACK, ItemType.AMMO_CRATE, ItemType.SHIELD_BUBBLE, ItemType.DAMAGE_BOOST];

const ITEM_LUCIDE_ICONS: Record<ItemType, typeof Heart> = {
  [ItemType.HEALTH_PACK]: Heart,
  [ItemType.AMMO_CRATE]: Package,
  [ItemType.SHIELD_BUBBLE]: Shield,
  [ItemType.DAMAGE_BOOST]: Swords,
};

const ITEM_COLORS: Record<ItemType, string> = {
  [ItemType.HEALTH_PACK]: '#ff4444',
  [ItemType.AMMO_CRATE]: '#ffcc44',
  [ItemType.SHIELD_BUBBLE]: '#4488ff',
  [ItemType.DAMAGE_BOOST]: '#ff8844',
};

interface SponsorFeedItem {
  team: Team;
  item: ItemType;
  sponsor: string;
  cost: string;
}

export function SponsorshipPanel({ matchId, disabled = false }: SponsorshipPanelProps) {
  const wallet = useWallet();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [sponsoring, setSponoring] = useState(false);
  const [itemCosts, setItemCosts] = useState<Record<ItemType, string>>({
    [ItemType.HEALTH_PACK]: '0.001',
    [ItemType.AMMO_CRATE]: '0.0005',
    [ItemType.SHIELD_BUBBLE]: '0.002',
    [ItemType.DAMAGE_BOOST]: '0.0015',
  });
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sponsorFeed, setSponsorFeed] = useState<SponsorFeedItem[]>([]);
  const [stats, setStats] = useState({ totalSponsored: 0, totalValue: '0' });
  const [showTeamSelect, setShowTeamSelect] = useState(false);

  // Load item costs
  useEffect(() => {
    getAllItemCosts().then(setItemCosts).catch(() => {});
  }, []);

  // Load match stats
  const refreshStats = useCallback(async () => {
    if (!matchId) return;
    try {
      const s = await getMatchSponsorStats(matchId);
      setStats(s);
    } catch { /* ignore */ }
  }, [matchId]);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  // Subscribe to reactive sponsor events
  useEffect(() => {
    if (!matchId) return;
    const unsub = onItemSponsored(matchId, (agent, item, sponsor, cost) => {
      const team = getTeamFromAgent(agent);
      if (team) {
        setSponsorFeed(prev => [{
          team,
          item,
          sponsor: `${sponsor.slice(0, 6)}...${sponsor.slice(-4)}`,
          cost,
        }, ...prev].slice(0, 8));
        refreshStats();
      }
    });
    return unsub;
  }, [matchId, refreshStats]);

  const handleSponsor = async (item: ItemType) => {
    if (!matchId || !selectedTeam || !wallet.connected || sponsoring) return;
    setError(null);
    setTxHash(null);
    setSponoring(true);

    try {
      const tx = await sponsorAgent(matchId, selectedTeam, item);
      setTxHash(tx.hash);
      await tx.wait();
      await refreshStats();
    } catch (err: any) {
      setError(err.reason || err.message || 'Sponsorship failed');
    } finally {
      setSponoring(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-3">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <Gift className="w-4 h-4 text-accent" />
          <h2 className="text-[13px] font-bold text-accent tracking-[0.2em]">REACTIVE SPONSORSHIP</h2>
          <Gift className="w-4 h-4 text-accent" />
        </div>
        <p className="text-[9px] text-muted-foreground">
          Sponsor items for squads — delivered instantly via Somnia Reactivity
        </p>
        <div className="flex items-center justify-center gap-1.5">
          <Wifi className="w-3 h-3 text-green-400" />
          <span className="text-[8px] text-green-400 font-bold tracking-wider">INSTANT DELIVERY • ON-CHAIN</span>
        </div>
      </div>

      {/* Team Selector */}
      <div className="relative">
        <button
          onClick={() => setShowTeamSelect(!showTeamSelect)}
          disabled={disabled || !wallet.connected}
          className={`w-full py-2.5 rounded-lg border flex items-center justify-between px-3 transition-all ${
            !wallet.connected || disabled
              ? 'opacity-40 cursor-not-allowed border-border/30'
              : 'border-accent/30 hover:border-accent/50 cursor-pointer'
          }`}
        >
          {selectedTeam ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: TEAM_COLORS[selectedTeam] }} />
              <span className="text-[11px] font-bold" style={{ color: TEAM_COLORS[selectedTeam] }}>
                {TEAM_NAMES[selectedTeam]}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">SELECT SQUAD TO SPONSOR</span>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>

        {showTeamSelect && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border/30 bg-card/95 backdrop-blur-md z-20 overflow-hidden">
            {TEAMS.map(team => (
              <button
                key={team}
                onClick={() => { setSelectedTeam(team); setShowTeamSelect(false); }}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-secondary/50 transition-all text-left"
              >
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: TEAM_COLORS[team] }} />
                <span className="text-[10px] font-bold" style={{ color: TEAM_COLORS[team] }}>
                  {TEAM_NAMES[team]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Item Grid */}
      {selectedTeam && wallet.connected && (
        <div className="grid grid-cols-2 gap-2">
          {ITEMS.map(item => {
            const Icon = ITEM_LUCIDE_ICONS[item];
            const color = ITEM_COLORS[item];
            const cost = itemCosts[item];

            return (
              <button
                key={item}
                onClick={() => handleSponsor(item)}
                disabled={disabled || sponsoring}
                className={`relative overflow-hidden rounded-lg border p-3 text-left transition-all ${
                  disabled || sponsoring
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer hover:scale-[1.02] hover:shadow-lg'
                }`}
                style={{
                  borderColor: `${color}30`,
                  backgroundColor: `${color}08`,
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: color }} />

                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <span className="text-[10px] font-bold text-foreground">{ITEM_NAMES[item]}</span>
                </div>

                <div className="text-[8px] text-muted-foreground mb-2 leading-tight">
                  {ITEM_DESCRIPTIONS[item]}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold" style={{ color }}>
                    {ITEM_ICONS[item]} {cost} STT
                  </span>
                  {sponsoring && (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                </div>
              </button>
            );
          })}
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
          <span className="text-[9px] font-bold">✅ Item Sponsored On-Chain</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      )}

      {error && (
        <div className="text-center py-1.5 rounded-lg border border-red-500/30 bg-red-500/5">
          <div className="text-[9px] text-red-400 font-bold px-2">{error}</div>
        </div>
      )}

      {/* Live Sponsor Feed */}
      {sponsorFeed.length > 0 && (
        <div className="rounded-lg border border-border/20 bg-card/40 p-2 space-y-1">
          <div className="text-[8px] text-muted-foreground tracking-wider mb-1">⚡ LIVE SPONSOR FEED</div>
          {sponsorFeed.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[8px]">
              <span>{ITEM_ICONS[s.item]}</span>
              <span className="text-muted-foreground">{s.sponsor}</span>
              <span className="text-foreground">sent</span>
              <span className="font-bold" style={{ color: ITEM_COLORS[s.item] }}>{ITEM_NAMES[s.item]}</span>
              <span className="text-muted-foreground">to</span>
              <span className="font-bold" style={{ color: TEAM_COLORS[s.team] }}>{TEAM_NAMES[s.team]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="rounded-lg border border-border/20 bg-card/60 p-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground">MATCH SPONSORSHIPS</span>
          <span className="text-[11px] font-bold text-foreground">{stats.totalSponsored} items</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground">TOTAL VALUE</span>
          <span className="text-[11px] font-bold text-accent">{parseFloat(stats.totalValue).toFixed(4)} STT</span>
        </div>
        <div className="text-[8px] text-accent pt-1">
          ⚡ Sponsored items are delivered reactively — no polling, pure event-driven
        </div>
      </div>
    </div>
  );
}
