

# Fresh Redesign: AI Tactics Arena

## The Problem
The current game suffers from: amateur isometric rendering, cluttered canvas drawing, inconsistent art style, and a UI that feels bolted on. The core game logic (4-team battle royale with classes, weapons, loot, killstreaks) is solid — the presentation is what's failing.

## Design Vision: **"War Room Broadcast"**

Instead of trying to be a pixel art game (which requires real pixel art assets), lean into what a browser canvas does well: **clean geometric rendering, smooth animations, and slick UI overlays**. Think of it as a **tactical esports broadcast** — the viewer is watching AI agents fight on a war room display.

```text
┌──────────────────────────────────────────────────┐
│  TOP BAR: Round • Zone • Team Status Pips        │
├──────┬───────────────────────────────┬────────────┤
│      │                               │            │
│ TEAM │     MAIN BATTLEFIELD          │  COMBAT    │
│ CARDS│     (Clean top-down with      │  FEED +    │
│      │      hex/square grid,         │  STATS     │
│      │      glowing units,           │            │
│      │      animated effects)        │            │
│      │                               │            │
├──────┴───────────────────────────────┴────────────┤
│  BOTTOM: Selected Unit Detail / Broadcast Banner  │
└──────────────────────────────────────────────────┘
```

## Core Design Decisions

### 1. Ditch Isometric — Go Clean Top-Down with Depth Effects
Isometric pixel art without real sprites looks cheap. Instead:
- **Top-down view** with subtle shadow/lighting to convey depth
- Tiles rendered as clean squares with soft terrain textures (gradient fills, not pixel noise)
- Elevation shown via **drop shadows** and **brightness**, not 3D faces
- Grid lines are subtle, only visible on hover or for movement range

### 2. Units as Glowing Tactical Markers
Stop trying to draw tiny soldiers. Instead:
- Units are **bold geometric shapes** — circles with team-colored glow halos
- Class icon rendered cleanly in the center (shield for soldier, cross for medic)
- Health shown as a **ring around the unit** (like an RTS)
- Selected unit gets a pulsing outer ring + movement range shown as soft glow area
- Size ~24-30px — large enough to read at any zoom

### 3. Combat That Feels Impactful
- **Projectile trails**: Bright laser-like lines with bloom that fade over 300ms
- **Hit impacts**: Expanding ring + particle burst at target
- **Screen flash**: Brief white flash on kills, red pulse on crits
- **Kill banner**: Slides in from right with killer/victim info, clean typography
- **Camera**: Smooth auto-follow that tracks action, slight zoom on kills

### 4. UI Overhaul — Dark Tactical Theme
- **Left sidebar**: Team roster with unit cards showing portrait, HP ring, status icons, weapon
- **Right sidebar**: Live combat feed with color-coded entries, scrolling
- **Top bar**: Minimal — round counter, zone timer, alive counts per team
- **Bottom**: Context bar showing selected unit abilities or broadcast announcements
- All panels use `glass-panel` with consistent blur/opacity

### 5. Map Generation Cleanup
- Fewer prop types, placed more intentionally
- Terrain uses 4-5 muted earth tones with smooth transitions
- Cover objects rendered as clean geometric shapes with team-neutral colors
- Loot crates glow softly to be visible
- Zone border as animated gradient edge (not dashed line)

## Files to Change

| File | Change |
|------|--------|
| `src/components/game/GameBoard2D.tsx` | **Full rewrite** — clean top-down renderer with glow effects, smooth unit markers, better camera, impact VFX |
| `src/components/game/GameHUD.tsx` | **Full rewrite** — sidebar layout, unit roster cards with HP rings, live combat feed, clean top bar |
| `src/components/game/BroadcastOverlay.tsx` | **Refine** — cleaner typography, better timing, add team elimination banners |
| `src/components/game/PreGameScreen.tsx` | **Redesign** — cinematic matchup screen with team lineups, countdown |
| `src/index.css` | **Update** — refined color variables, new utility classes for glow/blur effects |
| `src/game/gameState.ts` | **Minor tweaks** — reduce prop density, cleaner map generation |
| `src/game/types.ts` | No changes needed |
| `src/game/useGameStore.ts` | No changes needed |

## Key Technical Details

**Unit rendering** (replacing the current pixel-art soldier drawing):
```text
- Outer glow ring (team color, 40% opacity, pulses)
- HP arc (270° max, colored green→yellow→red)
- Filled circle (dark center)
- Class icon (SVG path or Unicode, white)
- Weapon indicator (small pip below)
```

**Terrain rendering** (replacing isometric diamonds):
```text
- Each tile: filled rect with terrain color
- Subtle 1px border between tiles (only at zoom > 1.2)
- Elevation: brighter = higher, plus soft drop shadow on south/east edges
- Props: simple geometric shapes — rectangles for walls, circles for rocks
- Smooth color transitions via corner blending
```

**Combat VFX pipeline**:
```text
1. Attack initiated → muzzle flash (expanding circle, 100ms)
2. Projectile travels → bright line lerps from A to B (150ms)
3. Impact → ring expansion + 6-8 particles (300ms)
4. Damage number floats up with bounce easing
5. If kill → screen pulse + kill banner slide-in
```

This approach plays to canvas strengths (smooth shapes, gradients, glow effects) rather than fighting it with pixel art that requires real assets.

