import { Unit, TEAM_COLORS, WEAPONS, WeaponId, LootItem } from '@/game/types';
import { X, Heart, Swords, Shield, Crosshair, Eye, Footprints, Zap, MapPin, Package, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import fullbodySoldierBlue from '@/assets/fullbody-soldier-blue.png';
import fullbodySoldierRed from '@/assets/fullbody-soldier-red.png';
import fullbodySoldierGreen from '@/assets/fullbody-soldier-green.png';
import fullbodySoldierYellow from '@/assets/fullbody-soldier-yellow.png';
import fullbodyMedicBlue from '@/assets/fullbody-medic-blue.png';
import fullbodyMedicRed from '@/assets/fullbody-medic-red.png';
import fullbodyMedicGreen from '@/assets/fullbody-medic-green.png';
import fullbodyMedicYellow from '@/assets/fullbody-medic-yellow.png';

export type SponsorAction = 'reveal_enemies' | 'reveal_loot' | 'gift_rifle' | 'gift_sniper' | 'gift_shotgun' | 'gift_rocket' | 'gift_medkit' | 'gift_armor';

export interface SponsorOption {
  id: SponsorAction;
  name: string;
  description: string;
  icon: string;
  cost: number;
  category: 'intel' | 'weapon' | 'supply';
}

export const SPONSOR_OPTIONS: SponsorOption[] = [
  { id: 'reveal_enemies', name: 'Enemy Intel', description: 'Reveal nearest enemy position for 3 turns', icon: '🔍', cost: 1, category: 'intel' },
  { id: 'reveal_loot', name: 'Loot Scanner', description: 'Highlight nearest loot on the map', icon: '📡', cost: 1, category: 'intel' },
  { id: 'gift_rifle', name: 'Assault Rifle', description: 'Gift an Assault Rifle (12 ammo)', icon: '🔫', cost: 2, category: 'weapon' },
  { id: 'gift_shotgun', name: 'Shotgun', description: 'Gift a Shotgun (6 ammo)', icon: '💥', cost: 2, category: 'weapon' },
  { id: 'gift_sniper', name: 'Sniper Rifle', description: 'Gift a Sniper Rifle (4 ammo)', icon: '🎯', cost: 3, category: 'weapon' },
  { id: 'gift_rocket', name: 'Rocket Launcher', description: 'Gift a Rocket Launcher (2 ammo)', icon: '🚀', cost: 4, category: 'weapon' },
  { id: 'gift_medkit', name: 'Medical Supplies', description: 'Heal unit for 40 HP', icon: '❤️', cost: 2, category: 'supply' },
  { id: 'gift_armor', name: 'Armor Vest', description: 'Grant +8 armor, +4 defense', icon: '🛡️', cost: 3, category: 'supply' },
];

const FULLBODY: Record<string, string> = {
  'blue-soldier': fullbodySoldierBlue,
  'red-soldier': fullbodySoldierRed,
  'green-soldier': fullbodySoldierGreen,
  'yellow-soldier': fullbodySoldierYellow,
  'blue-medic': fullbodyMedicBlue,
  'red-medic': fullbodyMedicRed,
  'green-medic': fullbodyMedicGreen,
  'yellow-medic': fullbodyMedicYellow,
};

interface CharacterPanelProps {
  unit: Unit;
  sponsorPoints: number;
  onClose: () => void;
  onSponsor: (unitId: string, action: SponsorAction) => void;
}

type PanelTab = 'stats' | 'sponsor';

export function CharacterPanel({ unit, sponsorPoints, onClose, onSponsor }: CharacterPanelProps) {
  const teamColor = TEAM_COLORS[unit.team];
  const fullbody = FULLBODY[unit.id] || FULLBODY[`${unit.team}-${unit.unitClass}`];
  const hpPercent = (unit.hp / unit.maxHp) * 100;
  const [activeTab, setActiveTab] = useState<PanelTab>('stats');

  const statRows = [
    { icon: Heart, label: 'HP', value: `${unit.hp}/${unit.maxHp}`, color: hpPercent > 50 ? 'hsl(142, 70%, 45%)' : hpPercent > 25 ? 'hsl(35, 90%, 55%)' : 'hsl(0, 75%, 55%)' },
    { icon: Swords, label: 'ATK', value: unit.attack, color: 'hsl(0, 75%, 60%)' },
    { icon: Shield, label: 'DEF', value: unit.defense, color: 'hsl(210, 70%, 55%)' },
    { icon: Crosshair, label: 'ACC', value: `${unit.accuracy}%`, color: 'hsl(35, 90%, 55%)' },
    { icon: Footprints, label: 'MOV', value: unit.moveRange, color: 'hsl(142, 70%, 45%)' },
    { icon: Target, label: 'RNG', value: unit.attackRange, color: 'hsl(280, 60%, 55%)' },
    { icon: Eye, label: 'VIS', value: unit.visionRange, color: 'hsl(200, 70%, 55%)' },
    { icon: Zap, label: 'AP', value: `${unit.ap}/${unit.maxAp}`, color: 'hsl(50, 90%, 55%)' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div
        className="relative z-10 flex gap-0 max-w-[780px] w-full mx-4 rounded-xl overflow-hidden border-2"
        style={{ borderColor: teamColor + '60' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left: Full-body character art */}
        <div
          className="w-[220px] relative flex flex-col items-center justify-end shrink-0 overflow-hidden"
          style={{ background: `linear-gradient(180deg, ${teamColor}15 0%, ${teamColor}08 50%, hsl(220, 20%, 8%) 100%)` }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-20 opacity-30"
            style={{ background: `radial-gradient(ellipse at center top, ${teamColor}, transparent 70%)` }}
          />
          {fullbody && (
            <img
              src={fullbody}
              alt={unit.name}
              className="relative z-10 w-[200px] h-auto object-contain drop-shadow-2xl"
              style={{ filter: `drop-shadow(0 0 20px ${teamColor}40)` }}
            />
          )}
          {/* Name plate */}
          <div className="relative z-10 w-full bg-card/90 backdrop-blur-sm py-3 px-4 text-center border-t border-border/30">
            <div className="text-base font-bold text-foreground">{unit.name}</div>
            <div className="text-[11px] uppercase tracking-[0.2em] mt-0.5" style={{ color: teamColor }}>
              {unit.unitClass} • {unit.team} TEAM
            </div>
            <div className="flex items-center justify-center gap-2 mt-1.5">
              <span className="text-[11px] text-muted-foreground">LVL {unit.level}</span>
              <span className="text-[11px] text-muted-foreground">•</span>
              <span className="text-[11px] text-muted-foreground">💀 {unit.kills} KILLS</span>
            </div>
          </div>
        </div>

        {/* Right: Tabbed content */}
        <div className="flex-1 bg-card/95 backdrop-blur-md flex flex-col max-h-[520px]">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-20 w-8 h-8 rounded-md bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Tab navigation */}
          <div className="flex border-b border-border/30">
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex-1 py-2.5 text-[13px] font-bold tracking-[0.15em] transition-all ${
                activeTab === 'stats'
                  ? 'text-foreground border-b-2'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
              }`}
              style={activeTab === 'stats' ? { borderColor: teamColor } : {}}
            >
              📊 STATS & GEAR
            </button>
            <button
              onClick={() => setActiveTab('sponsor')}
              className={`flex-1 py-2.5 text-[13px] font-bold tracking-[0.15em] transition-all ${
                activeTab === 'sponsor'
                  ? 'text-foreground border-b-2'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
              }`}
              style={activeTab === 'sponsor' ? { borderColor: teamColor } : {}}
            >
              🎁 SPONSOR
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'stats' ? (
              <StatsTab unit={unit} statRows={statRows} hpPercent={hpPercent} teamColor={teamColor} />
            ) : (
              <SponsorTab unit={unit} sponsorPoints={sponsorPoints} onSponsor={onSponsor} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stats Tab ── */
function StatsTab({ unit, statRows, hpPercent, teamColor }: {
  unit: Unit;
  statRows: { icon: any; label: string; value: string | number; color: string }[];
  hpPercent: number;
  teamColor: string;
}) {
  return (
    <div className="p-5">
      <div className="text-[13px] text-muted-foreground tracking-[0.2em] mb-3 font-bold">COMBAT STATS</div>
      <div className="grid grid-cols-4 gap-2.5">
        {statRows.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-secondary/50 rounded-md px-2.5 py-2 flex items-center gap-2">
            <Icon className="w-4 h-4 shrink-0" style={{ color }} />
            <div>
              <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
              <div className="text-sm font-bold text-foreground">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* HP Bar */}
      <div className="mt-3">
        <div className="h-2.5 bg-muted/40 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{
              width: `${hpPercent}%`,
              backgroundColor: hpPercent > 50 ? 'hsl(142, 70%, 45%)' : hpPercent > 25 ? 'hsl(35, 90%, 55%)' : 'hsl(0, 75%, 55%)',
            }}
          />
        </div>
      </div>

      {/* Weapon */}
      <div className="mt-3 bg-secondary/30 rounded-md px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-muted-foreground tracking-wider font-medium">EQUIPPED WEAPON</div>
          <div className="text-sm font-bold text-foreground mt-0.5">{unit.weapon.icon} {unit.weapon.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground font-medium">AMMO</div>
          <div className="text-sm font-bold text-foreground">{unit.weapon.ammo === -1 ? '∞' : unit.weapon.ammo}</div>
        </div>
      </div>

      {/* Abilities */}
      {unit.abilities.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] text-muted-foreground tracking-wider mb-2 font-medium">ABILITIES</div>
          <div className="flex gap-2">
            {unit.abilities.map(a => {
              const cd = unit.cooldowns[a.id] || 0;
              return (
                <div key={a.id} className={`bg-secondary/40 rounded-md px-3 py-2 border border-border/20 flex-1 ${cd > 0 ? 'opacity-40' : ''}`}>
                  <div className="text-[13px] text-foreground font-bold">{a.icon} {a.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{a.description}</div>
                  {cd > 0 && <div className="text-[11px] text-destructive mt-1 font-bold">CD: {cd}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status effects */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {unit.isHunkered && (
          <span className="text-[12px] bg-accent/20 text-accent px-3 py-1 rounded-md font-medium">🛡 HUNKERED</span>
        )}
        {unit.isSuppressed && (
          <span className="text-[12px] bg-destructive/20 text-destructive px-3 py-1 rounded-md font-medium">⛔ SUPPRESSED</span>
        )}
        {unit.coverType !== 'none' && (
          <span className="text-[12px] bg-primary/20 text-primary px-3 py-1 rounded-md font-medium">
            {unit.coverType === 'full' ? '🛡 FULL COVER' : '◐ HALF COVER'}
          </span>
        )}
        {unit.armor > 0 && (
          <span className="text-[12px] bg-[#4488ff]/20 text-[#4488ff] px-3 py-1 rounded-md font-medium">🛡️ ARMOR +{unit.armor}</span>
        )}
        {!unit.isAlive && (
          <span className="text-[12px] bg-destructive/20 text-destructive px-3 py-1 rounded-md font-medium">💀 KIA</span>
        )}
      </div>
    </div>
  );
}

/* ── Sponsor Tab ── */
function SponsorTab({ unit, sponsorPoints, onSponsor }: {
  unit: Unit;
  sponsorPoints: number;
  onSponsor: (unitId: string, action: SponsorAction) => void;
}) {
  const categories = ['intel', 'weapon', 'supply'] as const;
  const [catIndex, setCatIndex] = useState(0);
  const currentCat = categories[catIndex];
  const items = SPONSOR_OPTIONS.filter(o => o.category === currentCat);
  const catLabels = { intel: '🔍 INTELLIGENCE', weapon: '⚔️ WEAPONS', supply: '📦 SUPPLIES' };

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[14px] text-accent tracking-[0.15em] font-bold glow-accent">🎁 SPONSOR GIFTS</div>
        <div className="flex items-center gap-1.5 bg-accent/10 border border-accent/30 rounded-md px-3 py-1">
          <span className="text-[13px] text-accent font-bold">⭐ {sponsorPoints}</span>
          <span className="text-[11px] text-muted-foreground">PTS</span>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground mb-4">
        As a sponsor, send gifts to give this combatant an edge in battle.
      </p>

      {/* Category pagination */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCatIndex(i => (i - 1 + categories.length) % categories.length)}
          className="w-8 h-8 rounded-md bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="text-[14px] font-bold text-foreground tracking-wider">
          {catLabels[currentCat]}
        </div>
        <button
          onClick={() => setCatIndex(i => (i + 1) % categories.length)}
          className="w-8 h-8 rounded-md bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Page indicators */}
      <div className="flex justify-center gap-1.5 mb-4">
        {categories.map((cat, i) => (
          <button
            key={cat}
            onClick={() => setCatIndex(i)}
            className={`w-2 h-2 rounded-full transition-all ${i === catIndex ? 'bg-accent w-5' : 'bg-muted-foreground/20'}`}
          />
        ))}
      </div>

      {/* Items grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {items.map(opt => {
          const canAfford = sponsorPoints >= opt.cost;
          const isDisabled = !unit.isAlive || !canAfford;
          return (
            <button
              key={opt.id}
              disabled={isDisabled}
              onClick={() => onSponsor(unit.id, opt.id)}
              className={`text-left bg-secondary/40 hover:bg-secondary/70 border border-border/20 rounded-lg px-3.5 py-3 transition-all ${
                isDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:border-accent/40 hover:shadow-[0_0_10px_hsl(35_90%_55%/0.1)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-foreground font-bold">{opt.icon} {opt.name}</span>
                <span className="text-[12px] text-accent font-bold">⭐{opt.cost}</span>
              </div>
              <div className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{opt.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
