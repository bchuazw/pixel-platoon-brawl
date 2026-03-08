import { Unit, TEAM_COLORS, WEAPONS, WeaponId, LootItem } from '@/game/types';
import { X, Heart, Swords, Shield, Crosshair, Eye, Footprints, Zap, MapPin, Package, Target } from 'lucide-react';
import portraitSoldierBlue from '@/assets/portrait-soldier-blue.png';
import portraitSoldierRed from '@/assets/portrait-soldier-red.png';
import portraitSoldierGreen from '@/assets/portrait-soldier-green.png';
import portraitSoldierYellow from '@/assets/portrait-soldier-yellow.png';
import portraitMedicBlue from '@/assets/portrait-medic-blue.png';
import portraitMedicRed from '@/assets/portrait-medic-red.png';
import portraitMedicGreen from '@/assets/portrait-medic-green.png';
import portraitMedicYellow from '@/assets/portrait-medic-yellow.png';

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

const PORTRAITS: Record<string, string> = {
  'blue-soldier': portraitSoldierBlue,
  'red-soldier': portraitSoldierRed,
  'green-soldier': portraitSoldierGreen,
  'yellow-soldier': portraitSoldierYellow,
  'blue-medic': portraitMedicBlue,
  'red-medic': portraitMedicRed,
  'green-medic': portraitMedicGreen,
  'yellow-medic': portraitMedicYellow,
};

interface CharacterPanelProps {
  unit: Unit;
  sponsorPoints: number;
  onClose: () => void;
  onSponsor: (unitId: string, action: SponsorAction) => void;
}

export function CharacterPanel({ unit, sponsorPoints, onClose, onSponsor }: CharacterPanelProps) {
  const teamColor = TEAM_COLORS[unit.team];
  const portrait = PORTRAITS[unit.id] || PORTRAITS[`${unit.team}-${unit.unitClass}`];
  const hpPercent = (unit.hp / unit.maxHp) * 100;

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
        className="relative z-10 flex gap-0 max-w-[720px] w-full mx-4 rounded-xl overflow-hidden border-2"
        style={{ borderColor: teamColor + '60' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left: Portrait */}
        <div
          className="w-[220px] relative flex flex-col items-center justify-end shrink-0"
          style={{ background: `linear-gradient(180deg, ${teamColor}15 0%, ${teamColor}08 50%, hsl(220, 20%, 8%) 100%)` }}
        >
          {/* Team color glow */}
          <div
            className="absolute top-0 left-0 right-0 h-20 opacity-30"
            style={{ background: `radial-gradient(ellipse at center top, ${teamColor}, transparent 70%)` }}
          />
          <img
            src={portrait}
            alt={unit.unitClass}
            className="relative z-10 w-[180px] h-auto object-contain drop-shadow-2xl"
            style={{ filter: `drop-shadow(0 0 20px ${teamColor}40)` }}
          />
          {/* Name plate */}
          <div className="relative z-10 w-full bg-card/90 backdrop-blur-sm py-2 px-3 text-center border-t border-border/30">
            <div className="text-[11px] font-bold text-foreground">{unit.name}</div>
            <div className="text-[7px] uppercase tracking-[0.2em] mt-0.5" style={{ color: teamColor }}>
              {unit.unitClass} • {unit.team} TEAM
            </div>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="text-[6px] text-muted-foreground">LVL {unit.level}</span>
              <span className="text-[6px] text-muted-foreground">•</span>
              <span className="text-[6px] text-muted-foreground">💀 {unit.kills} KILLS</span>
            </div>
          </div>
        </div>

        {/* Right: Stats + Sponsor */}
        <div className="flex-1 bg-card/95 backdrop-blur-md flex flex-col">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-20 w-7 h-7 rounded-md bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Stats Section */}
          <div className="p-4 border-b border-border/30">
            <div className="text-[8px] text-muted-foreground tracking-[0.2em] mb-2">COMBAT STATS</div>
            <div className="grid grid-cols-4 gap-2">
              {statRows.map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="bg-secondary/50 rounded-md px-2 py-1.5 flex items-center gap-1.5">
                  <Icon className="w-3 h-3 shrink-0" style={{ color }} />
                  <div>
                    <div className="text-[6px] text-muted-foreground">{label}</div>
                    <div className="text-[9px] font-bold text-foreground">{value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* HP Bar */}
            <div className="mt-2">
              <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
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
            <div className="mt-2 bg-secondary/30 rounded-md px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-[6px] text-muted-foreground tracking-wider">EQUIPPED WEAPON</div>
                <div className="text-[9px] font-bold text-foreground">{unit.weapon.icon} {unit.weapon.name}</div>
              </div>
              <div className="text-right">
                <div className="text-[6px] text-muted-foreground">AMMO</div>
                <div className="text-[9px] font-bold text-foreground">{unit.weapon.ammo === -1 ? '∞' : unit.weapon.ammo}</div>
              </div>
            </div>

            {/* Abilities */}
            {unit.abilities.length > 0 && (
              <div className="mt-2">
                <div className="text-[6px] text-muted-foreground tracking-wider mb-1">ABILITIES</div>
                <div className="flex gap-1.5">
                  {unit.abilities.map(a => {
                    const cd = unit.cooldowns[a.id] || 0;
                    return (
                      <div key={a.id} className={`bg-secondary/40 rounded px-2 py-1 border border-border/20 ${cd > 0 ? 'opacity-40' : ''}`}>
                        <div className="text-[8px] text-foreground">{a.icon} {a.name}</div>
                        <div className="text-[5px] text-muted-foreground">{a.description}</div>
                        {cd > 0 && <div className="text-[5px] text-destructive mt-0.5">CD: {cd}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Status effects */}
            <div className="flex gap-2 mt-2">
              {unit.isOnOverwatch && (
                <span className="text-[7px] bg-[#44aaff]/20 text-[#44aaff] px-2 py-0.5 rounded">👁 OVERWATCH</span>
              )}
              {unit.isSuppressed && (
                <span className="text-[7px] bg-destructive/20 text-destructive px-2 py-0.5 rounded">⛔ SUPPRESSED</span>
              )}
              {unit.coverType !== 'none' && (
                <span className="text-[7px] bg-primary/20 text-primary px-2 py-0.5 rounded">
                  {unit.coverType === 'full' ? '🛡 FULL COVER' : '◐ HALF COVER'}
                </span>
              )}
              {unit.armor > 0 && (
                <span className="text-[7px] bg-[#4488ff]/20 text-[#4488ff] px-2 py-0.5 rounded">🛡️ ARMOR +{unit.armor}</span>
              )}
              {!unit.isAlive && (
                <span className="text-[7px] bg-destructive/20 text-destructive px-2 py-0.5 rounded">💀 KIA</span>
              )}
            </div>
          </div>

          {/* Sponsor Section */}
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[8px] text-accent tracking-[0.2em] glow-accent">🎁 SPONSOR GIFTS</div>
              <div className="flex items-center gap-1 bg-accent/10 border border-accent/30 rounded px-2 py-0.5">
                <span className="text-[7px] text-accent font-bold">⭐ {sponsorPoints}</span>
                <span className="text-[5px] text-muted-foreground">POINTS</span>
              </div>
            </div>
            <p className="text-[6px] text-muted-foreground mb-3">
              As a sponsor, send gifts to give this combatant an edge in battle.
            </p>

            {/* Categories */}
            {(['intel', 'weapon', 'supply'] as const).map(cat => {
              const items = SPONSOR_OPTIONS.filter(o => o.category === cat);
              const catLabel = cat === 'intel' ? '🔍 INTELLIGENCE' : cat === 'weapon' ? '⚔️ WEAPONS' : '📦 SUPPLIES';
              return (
                <div key={cat} className="mb-3">
                  <div className="text-[6px] text-muted-foreground tracking-wider mb-1">{catLabel}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map(opt => {
                      const canAfford = sponsorPoints >= opt.cost;
                      const isDisabled = !unit.isAlive || !canAfford;
                      return (
                        <button
                          key={opt.id}
                          disabled={isDisabled}
                          onClick={() => onSponsor(unit.id, opt.id)}
                          className={`text-left bg-secondary/40 hover:bg-secondary/70 border border-border/20 rounded-md px-2.5 py-2 transition-all ${
                            isDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:border-accent/40 hover:shadow-[0_0_10px_hsl(35_90%_55%/0.1)]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] text-foreground">{opt.icon} {opt.name}</span>
                            <span className="text-[6px] text-accent">⭐{opt.cost}</span>
                          </div>
                          <div className="text-[5px] text-muted-foreground mt-0.5">{opt.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
