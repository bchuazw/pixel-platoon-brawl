import { Lock, Gift } from 'lucide-react';

/**
 * In-game sponsor panel — WIP placeholder.
 * Greyed out with "Coming Soon" overlay.
 */
export function SponsorHUDPanel() {
  return (
    <div className="pointer-events-auto absolute right-2 sm:right-4 bottom-12 sm:bottom-16 w-48 sm:w-56 z-20">
      <div className="glass-panel rounded-xl p-3 relative overflow-hidden">
        {/* WIP overlay */}
        <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-xl">
          <Lock className="w-4 h-4 text-accent/40 mb-1" />
          <div className="text-[9px] font-display font-bold text-accent/50 tracking-[0.15em]">COMING SOON</div>
        </div>

        {/* Greyed content */}
        <div className="opacity-40">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-display font-bold text-accent tracking-[0.15em]">SPONSOR</span>
          </div>
          <p className="text-[8px] text-muted-foreground mb-2">Send gifts to your favorite combatant</p>
          <div className="space-y-1.5">
            {['🔫 Weapon Drop', '❤️ Med Kit', '🛡️ Armor Vest'].map(item => (
              <div key={item} className="flex items-center justify-between px-2 py-1.5 bg-secondary/30 rounded border border-border/10">
                <span className="text-[9px] text-foreground/60">{item}</span>
                <span className="text-[8px] text-accent/50">⭐2</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
