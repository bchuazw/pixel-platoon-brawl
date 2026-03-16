# 🎮 Pixel Platoon Brawl — Reactive AI Battle Arena

> **Somnia Reactivity Mini Hackathon Submission**
>
> A tactical AI battle royale game with on-chain betting and item sponsorship powered by **Somnia Reactivity** — real-time event-driven blockchain interactions with zero polling.

![License](https://img.shields.io/badge/license-MIT-blue)
![Network](https://img.shields.io/badge/network-Somnia%20Testnet-green)
![Reactivity](https://img.shields.io/badge/powered%20by-Somnia%20Reactivity-purple)

## 🎯 What is Pixel Platoon Brawl?

Pixel Platoon Brawl is a **4-team AI tactical battle royale** where 8 AI combatants (4 squads × 2 units each) fight in a shrinking zone until only one squad survives. Built with React + Three.js, it features:

- 🤖 **Fully AI-Controlled**: Each squad is commanded by AI — watch the tactical battles unfold
- 🗺️ **Tactical Gameplay**: Cover mechanics, fog of war, loot system, killstreaks, abilities
- 💀 **Battle Royale**: Shrinking zone forces engagements — last team standing wins
- 🎰 **On-Chain Betting**: Place bets on squads with STT via Somnia smart contracts
- 🎁 **Reactive Sponsorship**: Sponsor items for squads — delivered instantly via blockchain events

## ⚡ Somnia Reactivity Integration

This project showcases **Somnia's Reactivity** features — a paradigm shift from polling-based blockchain reads to **push-based, event-driven** real-time updates.

### How We Use Reactivity

#### 1. 🎰 Reactive Betting Pool
- **Contract**: `ReactiveBettingPool` on Somnia Testnet
- **Events**: `BetPlaced`, `OddsUpdated`, `MatchAutoResolved`, `PayoutDistributed`
- **How it works**:
  - Spectators place bets on their favourite squad using STT tokens
  - On every bet, the contract emits `OddsUpdated` events for ALL agents
  - Subscribers receive odds changes **instantly** — no polling, no refresh buttons
  - When a match ends, `MatchAutoResolved` triggers automatic payout distribution
  - Winners receive their share proportionally — no claiming required

#### 2. 🎁 Reactive Item Sponsorship
- **Contract**: `ReactiveSponsorship` on Somnia Testnet
- **Events**: `ItemSponsored`, `ItemDelivered`, `MatchRegistered`
- **How it works**:
  - Spectators sponsor items (Health Pack, Ammo Crate, Shield Bubble, Damage Boost)
  - The `ItemSponsored` event is emitted and **pushed instantly** to the game client
  - Items appear in-game via a reactive overlay — true real-time blockchain → game delivery
  - 70% of sponsorship fees go to the betting prize pool, 30% to the house

#### 3. ⏱️ Reactive Match Timer
- **Contract**: `ReactiveMatchTimer` on Somnia Testnet
- **Events**: `TurnAdvanced`, `TurnForced`, `MatchAutoEnded`, `StaleMatchDetected`
- **How it works**:
  - Cron-based subscriptions auto-advance turns every 30 seconds
  - Stale matches (10+ minutes inactive) are auto-resolved
  - `TurnAdvanced` events keep all clients in sync without polling

### Why Reactivity Matters

| Traditional Approach | Somnia Reactivity |
|---------------------|-------------------|
| Poll every N seconds for odds changes | Subscribe once, receive instant pushes |
| Manual refresh to see new bets | Live bet feed updates automatically |
| Claim-based payout system | Auto-distribution on match resolution |
| Server polls chain for item purchases | Instant event-driven item delivery |

**Result**: Sub-second latency for all blockchain interactions. The game feels native, not blockchain.

## 📋 Deployed Contracts (Somnia Testnet)

| Contract | Address |
|----------|---------|
| ReactiveBettingPool | [`0x19Dd500B5950BB9A20A3Bf8DA54F41f6D004A375`](https://somnia-testnet.socialscan.io/address/0x19Dd500B5950BB9A20A3Bf8DA54F41f6D004A375) |
| ReactiveSponsorship | [`0xAf189D6bD0Ee1d4724847367A9a25a69f9834B6c`](https://somnia-testnet.socialscan.io/address/0xAf189D6bD0Ee1d4724847367A9a25a69f9834B6c) |
| ReactiveMatchTimer  | [`0xEAB3270FC17A4df2d174D5e8bE8C14344880c509`](https://somnia-testnet.socialscan.io/address/0xEAB3270FC17A4df2d174D5e8bE8C14344880c509) |

**Network**: Somnia Testnet (Shannon) — Chain ID: `50312`
**RPC**: `https://dream-rpc.somnia.network`
**Explorer**: `https://somnia-testnet.socialscan.io`

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           Pixel Platoon Brawl UI            │
│         (React + Three.js + Zustand)         │
├──────────┬──────────────┬───────────────────┤
│ Betting  │ Sponsorship  │   Game Engine     │
│  Panel   │    Panel     │  (AI + Combat)    │
├──────────┴──────────────┴───────────────────┤
│           Somnia Integration Layer           │
│  (ethers.js + Contract ABIs + Wallet Mgmt)  │
├─────────────────────────────────────────────┤
│         Somnia Testnet (Chain 50312)         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Betting  │ │Sponsorshp│ │  Match   │    │
│  │  Pool    │ │ Contract │ │  Timer   │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│           Reactivity Event Layer             │
│     (Push-based, zero-polling, instant)      │
└─────────────────────────────────────────────┘
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MetaMask or compatible Web3 wallet
- STT tokens from the [Somnia Faucet](https://faucet.somnia.network)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/bchuazw/pixel-platoon-brawl.git
cd pixel-platoon-brawl

# Install dependencies
npm install

# Start development server
npm run dev
```

### Using the dApp

1. **Connect Wallet**: Click "Connect Wallet" — the app will prompt you to add Somnia Testnet if needed
2. **Place Bets**: Select a squad and bet STT tokens — odds update reactively on every bet
3. **Sponsor Items**: Switch to the Sponsor tab, pick a squad and send items — they appear instantly
4. **Watch the Battle**: Click "Start Battle" to watch the AI-controlled squads fight
5. **Collect Winnings**: If your squad wins, payouts are auto-distributed — no claiming needed

## 🎥 Demo Video Script

1. **Intro** (30s): Show the pre-game screen with all 4 squads
2. **Wallet Connect** (20s): Connect MetaMask to Somnia Testnet
3. **Place Bet** (30s): Bet on Azure Wolves, show odds updating reactively
4. **Sponsor Item** (30s): Sponsor a Health Pack for Crimson Hawks, show on-chain delivery
5. **Battle** (90s): Watch the AI battle, highlight the reactive sponsor overlay
6. **Result** (30s): Match ends, show auto-payout distribution
7. **Outro** (30s): Show contract addresses on Somnia explorer

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **3D Rendering**: Three.js + @react-three/fiber + @react-three/drei
- **State Management**: Zustand
- **Styling**: Tailwind CSS + shadcn/ui
- **Blockchain**: ethers.js v6 + Somnia Testnet
- **Contracts**: Solidity 0.8.19 (deployed via Hardhat)

## 📁 Project Structure

```
src/
├── somnia/              # Somnia Reactivity integration
│   ├── config.ts        # Network configuration
│   ├── abis.ts          # Contract ABIs
│   ├── contracts.ts     # Contract instances & functions
│   ├── wallet.ts        # Wallet connection management
│   ├── useWallet.ts     # React hook for wallet state
│   └── index.ts         # Barrel exports
├── components/game/
│   ├── CryptoBettingPanel.tsx    # On-chain betting UI
│   ├── SponsorshipPanel.tsx      # On-chain item sponsorship UI
│   ├── SponsorOverlay.tsx        # In-game reactive sponsor events
│   ├── PreGameScreen.tsx         # Pre-game lobby with betting/sponsorship
│   ├── GameBoard.tsx             # 3D game board
│   └── ...                       # Other game components
├── game/
│   ├── gameState.ts     # Core game logic (AI, combat, movement)
│   ├── useGameStore.ts  # Zustand state management
│   └── types.ts         # TypeScript types
└── pages/
    └── Index.tsx         # Main page
```

## 📄 License

MIT

---

**Built for the Somnia Reactivity Mini Hackathon** 🏆

*Pixel Platoon Brawl demonstrates that blockchain gaming doesn't have to feel slow or clunky. With Somnia Reactivity, on-chain betting and item sponsorship happen at the speed of the game itself.*
