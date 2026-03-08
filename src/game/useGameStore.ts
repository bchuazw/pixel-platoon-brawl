import { useState, useCallback, useRef, useEffect } from 'react';
import {
  GameState, Position, CombatEvent, AbilityId, AP_MOVE_COST, AP_ATTACK_COST, WEAPONS, Team, KillCamData, AirdropData,
} from './types';
import {
  createInitialState, getMovableTiles, getAttackableTiles, getAbilityTargetTiles,
  performAttack, getNextTeam, getAliveTeams, runAiTurn, runAiUnitStep, isInZone,
  checkOverwatch, getAttackPreview, getManhattanDistance, pickupLoot, findPath,
  activateKillstreak, tickKillstreakEffects, applyExplosionDamage, generateAirdrops,
} from './gameState';
import { startBgMusic, stopBgMusic, playPickup, playHeal, playMove } from './sounds';
import { SponsorAction } from '@/components/game/CharacterPanel';

export function useGameStore() {
  const [state, setState] = useState<GameState>(createInitialState);
  const [sponsorPoints, setSponsorPoints] = useState(5);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [betTeam, setBetTeam] = useState<Team | null>(null);
  const [betAmount, setBetAmount] = useState(0);
  const autoPlayRef = useRef(false);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track which unit is currently acting in the auto-play sequence
  const unitQueueRef = useRef<string[]>([]);
  const currentTeamRef = useRef<Team>('blue');
  const pendingCombatUnitRef = useRef<string | null>(null); // unit awaiting combat after move

  // Earn sponsor points over time
  useEffect(() => {
    if (!state.autoPlay || state.phase === 'game_over' || state.phase === 'pre_game') return;
    const interval = setInterval(() => {
      setSponsorPoints(p => Math.min(p + 1, 20));
    }, 8000);
    return () => clearInterval(interval);
  }, [state.autoPlay, state.phase]);

  const sponsorUnit = useCallback((unitId: string, action: SponsorAction) => {
    setSponsorPoints(prev => {
      const costs: Record<SponsorAction, number> = {
        reveal_enemies: 1, reveal_loot: 1, gift_rifle: 2, gift_shotgun: 2,
        gift_sniper: 3, gift_rocket: 4, gift_medkit: 2, gift_armor: 3,
      };
      const cost = costs[action];
      if (prev < cost) return prev;

      setState(gs => {
        const units = gs.units.map(u => ({ ...u, weapon: { ...u.weapon } }));
        const unit = units.find(u => u.id === unitId);
        if (!unit || !unit.isAlive) return gs;

        const log = [...gs.log];
        const events: CombatEvent[] = [];

        switch (action) {
          case 'reveal_enemies': {
            const enemies = units.filter(u => u.isAlive && u.team !== unit.team);
            if (enemies.length > 0) {
              let nearest = enemies[0];
              let nearestDist = getManhattanDistance(unit.position, nearest.position);
              for (const e of enemies) {
                const d = getManhattanDistance(unit.position, e.position);
                if (d < nearestDist) { nearest = e; nearestDist = d; }
              }
              unit.visionRange += 5;
              log.push(`🎁 SPONSOR: ${unit.name} receives ENEMY INTEL! Nearest: ${nearest.name} (${nearestDist} tiles away)`);
              events.push({
                id: `evt-sponsor-${Date.now()}`, type: 'ability',
                attackerPos: unit.position, targetPos: nearest.position,
                message: `🔍 Enemy spotted: ${nearest.name}!`, timestamp: Date.now(),
              });
            }
            break;
          }
          case 'reveal_loot': {
            let nearestLoot: Position | null = null;
            let nearestDist = Infinity;
            for (let x = 0; x < gs.grid.length; x++) {
              for (let z = 0; z < gs.grid[0].length; z++) {
                if (gs.grid[x][z].loot) {
                  const d = getManhattanDistance(unit.position, { x, z });
                  if (d < nearestDist) { nearestDist = d; nearestLoot = { x, z }; }
                }
              }
            }
            if (nearestLoot) {
              log.push(`🎁 SPONSOR: ${unit.name} receives LOOT INTEL! Nearest loot at (${nearestLoot.x},${nearestLoot.z}) - ${nearestDist} tiles`);
              events.push({
                id: `evt-sponsor-${Date.now()}`, type: 'loot',
                attackerPos: unit.position, targetPos: nearestLoot,
                message: `📡 Loot located ${nearestDist} tiles away!`, timestamp: Date.now(),
              });
            } else {
              log.push(`🎁 SPONSOR: No loot remaining on the field!`);
            }
            break;
          }
          case 'gift_rifle': {
            const w = { ...WEAPONS.rifle };
            unit.weapon = w; unit.attack = w.attack; unit.accuracy = w.accuracy; unit.attackRange = w.range;
            log.push(`🎁 SPONSOR: ${unit.name} receives an Assault Rifle!`);
            events.push({ id: `evt-sponsor-${Date.now()}`, type: 'loot', attackerPos: unit.position, targetPos: unit.position, message: `🎁 Sponsored: Assault Rifle!`, timestamp: Date.now() });
            break;
          }
          case 'gift_shotgun': {
            const w = { ...WEAPONS.shotgun };
            unit.weapon = w; unit.attack = w.attack; unit.accuracy = w.accuracy; unit.attackRange = w.range;
            log.push(`🎁 SPONSOR: ${unit.name} receives a Shotgun!`);
            events.push({ id: `evt-sponsor-${Date.now()}`, type: 'loot', attackerPos: unit.position, targetPos: unit.position, message: `🎁 Sponsored: Shotgun!`, timestamp: Date.now() });
            break;
          }
          case 'gift_sniper': {
            const w = { ...WEAPONS.sniper_rifle };
            unit.weapon = w; unit.attack = w.attack; unit.accuracy = w.accuracy; unit.attackRange = w.range;
            log.push(`🎁 SPONSOR: ${unit.name} receives a Sniper Rifle!`);
            events.push({ id: `evt-sponsor-${Date.now()}`, type: 'loot', attackerPos: unit.position, targetPos: unit.position, message: `🎁 Sponsored: Sniper Rifle!`, timestamp: Date.now() });
            break;
          }
          case 'gift_rocket': {
            const w = { ...WEAPONS.rocket_launcher };
            unit.weapon = w; unit.attack = w.attack; unit.accuracy = w.accuracy; unit.attackRange = w.range;
            log.push(`🎁 SPONSOR: ${unit.name} receives a Rocket Launcher!`);
            events.push({ id: `evt-sponsor-${Date.now()}`, type: 'loot', attackerPos: unit.position, targetPos: unit.position, message: `🎁 Sponsored: Rocket Launcher!`, timestamp: Date.now() });
            break;
          }
          case 'gift_medkit': {
            const healAmt = Math.min(40, unit.maxHp - unit.hp);
            unit.hp = Math.min(unit.maxHp, unit.hp + 40);
            log.push(`🎁 SPONSOR: ${unit.name} receives Medical Supplies (+${healAmt} HP)!`);
            events.push({ id: `evt-sponsor-${Date.now()}`, type: 'heal', attackerPos: unit.position, targetPos: unit.position, value: healAmt, message: `🎁 Sponsored: +${healAmt} HP!`, timestamp: Date.now() });
            break;
          }
          case 'gift_armor': {
            unit.armor += 8;
            unit.defense += 4;
            log.push(`🎁 SPONSOR: ${unit.name} receives Armor Vest (+8 armor, +4 DEF)!`);
            events.push({ id: `evt-sponsor-${Date.now()}`, type: 'loot', attackerPos: unit.position, targetPos: unit.position, message: `🎁 Sponsored: Armor Vest!`, timestamp: Date.now() });
            break;
          }
        }

        return { ...gs, units, log, combatEvents: [...gs.combatEvents, ...events] };
      });

      return prev - cost;
    });
  }, []);

  const inspectUnit = useCallback((unitId: string | null) => {
    setInspectedUnitId(unitId);
  }, []);

  // ═══════════════════════════════════════════════
  // Per-unit auto-play: one unit acts per tick
  // ═══════════════════════════════════════════════
  const runSingleUnitStep = useCallback(() => {
    setState(prev => {
      if (prev.phase === 'game_over' || prev.phase === 'pre_game') return prev;
      const aliveTeams = getAliveTeams(prev.units);
      if (aliveTeams.length <= 1) return prev;

      // If no units queued, prepare the current team's units
      if (unitQueueRef.current.length === 0) {
        const team = prev.currentTeam;
        currentTeamRef.current = team;

        // Reset AP and cooldowns for this team
        const units = prev.units.map(u => {
          if (u.team === team && u.isAlive) {
            const newCooldowns: Record<string, number> = {};
            for (const [k, v] of Object.entries(u.cooldowns)) {
              if (v > 0) newCooldowns[k] = v - 1;
            }
            return { ...u, ap: u.maxAp, isSuppressed: false, isOnOverwatch: false, isHunkered: false, cooldowns: newCooldowns, weapon: { ...u.weapon } };
          }
          return { ...u, weapon: { ...u.weapon } };
        });

        // Queue: soldier first, then medic
        const teamUnits = units.filter(u => u.team === team && u.isAlive);
        const sorted = [...teamUnits].sort((a, b) => {
          if (a.unitClass === 'soldier' && b.unitClass === 'medic') return -1;
          if (a.unitClass === 'medic' && b.unitClass === 'soldier') return 1;
          return 0;
        });

        unitQueueRef.current = sorted.map(u => u.id);

        const log = [...prev.log];
        log.push(`» ${team.toUpperCase()} TEAM's turn`);

        return {
          ...prev,
          units,
          grid: prev.grid.map(row => row.map(t => ({ ...t, loot: t.loot ? { ...t.loot } : null }))),
          log,
          selectedUnitId: sorted[0]?.id || null, // highlight who's acting
        };
      }

      // ── If there's a pending combat phase for a unit that just moved ──
      if (pendingCombatUnitRef.current) {
        const combatUnitId = pendingCombatUnitRef.current;
        pendingCombatUnitRef.current = null;

        const result = runAiUnitStep(combatUnitId, prev, 'combat');
        let newState = result.state;
        const allEvents = [...result.events];

        // Clear move path since walk animation is done
        newState = { ...newState, movePath: null, movingUnitId: null };

        // ── KILL CAM: detect kill events ──
        const killEvent = allEvents.find(e => e.type === 'kill');
        let killCam: KillCamData | null = null;
        if (killEvent) {
          const killer = prev.units.find(u => u.id === combatUnitId);
          const victim = prev.units.find(u =>
            u.position.x === killEvent.targetPos.x && u.position.z === killEvent.targetPos.z && u.id !== combatUnitId
          );
          killCam = {
            targetPos: killEvent.targetPos, attackerPos: killEvent.attackerPos,
            victimName: victim?.name || 'Unknown', killerName: killer?.name || 'Unknown',
            timestamp: Date.now(),
          };
        }

        const nextInQueue = unitQueueRef.current[0] || null;
        newState = { ...newState, selectedUnitId: nextInQueue, killCam };

        // Check game over
        const alive = getAliveTeams(newState.units);
        if (alive.length <= 1) {
          stopBgMusic();
          unitQueueRef.current = [];
          return {
            ...newState,
            log: [...newState.log, `🏆 ${alive[0]?.toUpperCase() || 'NO'} TEAM WINS THE BATTLE ROYALE!`],
            phase: 'game_over' as const, selectedUnitId: null,
            movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
            combatEvents: [...prev.combatEvents, ...allEvents], activeAbility: null,
            autoPlay: false,
          };
        }

        return {
          ...newState,
          combatEvents: [...prev.combatEvents, ...allEvents],
        };
      }

      // Pop next unit from queue
      const nextUnitId = unitQueueRef.current.shift()!;
      const unit = prev.units.find(u => u.id === nextUnitId);

      if (!unit || !unit.isAlive) {
        // Skip dead units, try next tick
        return { ...prev, selectedUnitId: unitQueueRef.current[0] || null };
      }

      // ── PHASE 1: Movement only ──
      const result = runAiUnitStep(nextUnitId, prev, 'move');
      let newState = result.state;
      const allEvents = [...result.events];

      newState = { ...newState, selectedUnitId: nextUnitId, killCam: null };

      if (result.didMove) {
        // Unit moved — schedule combat for next tick after walk animation
        pendingCombatUnitRef.current = nextUnitId;
      } else {
        // No movement — run combat immediately
        const combatResult = runAiUnitStep(nextUnitId, newState, 'combat');
        newState = combatResult.state;
        allEvents.push(...combatResult.events);

        // KILL CAM
        const killEvent = combatResult.events.find(e => e.type === 'kill');
        let killCam: KillCamData | null = null;
        if (killEvent) {
          const killer = prev.units.find(u => u.id === nextUnitId);
          const victim = prev.units.find(u =>
            u.position.x === killEvent.targetPos.x && u.position.z === killEvent.targetPos.z && u.id !== nextUnitId
          );
          killCam = {
            targetPos: killEvent.targetPos, attackerPos: killEvent.attackerPos,
            victimName: victim?.name || 'Unknown', killerName: killer?.name || 'Unknown',
            timestamp: Date.now(),
          };
        }

        const nextInQueue = unitQueueRef.current[0] || null;
        newState = { ...newState, selectedUnitId: nextInQueue, killCam };
      }

      // Check for game over
      const alive = getAliveTeams(newState.units);
      if (alive.length <= 1) {
        stopBgMusic();
        unitQueueRef.current = [];
        return {
          ...newState,
          log: [...newState.log, `🏆 ${alive[0]?.toUpperCase() || 'NO'} TEAM WINS THE BATTLE ROYALE!`],
          phase: 'game_over' as const, selectedUnitId: null,
          movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
          combatEvents: [...prev.combatEvents, ...allEvents], activeAbility: null,
          autoPlay: false,
        };
      }

      // If queue is empty, advance to next team
      if (unitQueueRef.current.length === 0) {
        const nextTeam = getNextTeam(newState.currentTeam, newState.units);
        if (!nextTeam) return newState;

        const teamOrder = ['blue', 'red', 'green', 'yellow'] as const;
        const firstAliveTeam = teamOrder.find(t => newState.units.some(u => u.team === t && u.isAlive));
        const isNewRound = nextTeam === firstAliveTeam;

        let { turn, shrinkLevel, zoneTimer } = newState;
        const log = [...newState.log];

        if (isNewRound) {
          turn++;
          zoneTimer--;
          if (zoneTimer <= 0 && shrinkLevel < 4) {
            shrinkLevel++;
            zoneTimer = 4;
            log.push(`═══════════════════════════`);
            log.push(`⚠ DANGER ZONE LEVEL ${shrinkLevel}! The ring closes in!`);

            newState.units = newState.units.map(u => {
              if (u.isAlive && !isInZone(u.position.x, u.position.z, shrinkLevel)) {
                const dmg = 15 * shrinkLevel;
                const newHp = Math.max(0, u.hp - dmg);
                log.push(`☠ ${u.name} takes ${dmg} zone damage!`);
                allEvents.push({
                  id: `evt-${Date.now()}-${u.id}`, type: 'damage',
                  attackerPos: u.position, targetPos: u.position, value: dmg,
                  message: `☠ Zone damage!`, timestamp: Date.now(),
                });
                return { ...u, hp: newHp, isAlive: newHp > 0 };
              }
              return u;
            });
          }

          let grid = newState.grid;
          if (turn % 2 === 0) {
            grid = grid.map(row => row.map(t => ({ ...t, hasSmoke: false })));
          }
          newState.grid = grid;

          log.push(`═══════════════════════════`);
          log.push(`» ROUND ${turn}`);
          log.push(`» ${newState.units.filter(u => u.isAlive).length} combatants remaining`);

          // Trigger supply airdrops every 7-10 rounds (randomized)
          if (turn >= newState.nextAirdropRound) {
            const newDrops = generateAirdrops(newState.grid);
            if (newDrops.length > 0) {
              newState.airdrops = [...(newState.airdrops || []), ...newDrops];
              log.push(`✈️ INCOMING SUPPLY DROP! ${newDrops.length} crate${newDrops.length > 1 ? 's' : ''} inbound!`);
            }
            newState.nextAirdropRound = turn + 7 + Math.floor(Math.random() * 4);
          }
        }

        // Tick killstreak effects at start of each new round
        tickKillstreakEffects(nextTeam, newState.units);

        const alive2 = getAliveTeams(newState.units);
        if (alive2.length <= 1) {
          stopBgMusic();
          return {
            ...newState,
            log: [...log, `🏆 ${alive2[0]?.toUpperCase() || 'NO'} TEAM WINS THE BATTLE ROYALE!`],
            phase: 'game_over' as const, selectedUnitId: null,
            movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
            combatEvents: [...prev.combatEvents, ...allEvents], activeAbility: null,
            turn, shrinkLevel, zoneTimer, autoPlay: false,
          };
        }

        return {
          ...newState,
          currentTeam: nextTeam,
          turn, shrinkLevel, zoneTimer,
          phase: 'select' as const,
          selectedUnitId: null,
          movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
          activeAbility: null,
          log,
          combatEvents: [...prev.combatEvents, ...allEvents],
          attackPreview: null, hoveredTile: null,
        };
      }

      return {
        ...newState,
        combatEvents: [...prev.combatEvents, ...allEvents],
      };
    });
  }, []);

  // Auto-play loop — uses onMoveComplete for sequencing instead of fixed timer for walk
  useEffect(() => {
    autoPlayRef.current = state.autoPlay;
    if (state.autoPlay && state.phase !== 'game_over' && state.phase !== 'pre_game') {
      const hasPendingCombat = pendingCombatUnitRef.current !== null;
      const hasQueue = unitQueueRef.current.length > 0;
      const isKillCam = state.killCam !== null;

      // If there's a pending combat, don't use a timer — wait for onMoveComplete callback
      if (hasPendingCombat) return;

      // Delays: killcam 3s, normal unit 1.2s, team switch 0.6s
      const delay = isKillCam ? 3000 : hasQueue ? 1200 : 600;
      autoPlayTimerRef.current = setTimeout(() => {
        if (autoPlayRef.current) {
          if (isKillCam) {
            setState(prev => ({ ...prev, killCam: null }));
          }
          runSingleUnitStep();
        }
      }, delay);
    }
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [state.autoPlay, state.phase, state.currentTeam, state.turn, state.units, state.selectedUnitId, state.killCam, runSingleUnitStep]);

  const placeBet = useCallback((team: Team, amount: number) => {
    if (amount > sponsorPoints) return;
    setBetTeam(team);
    setBetAmount(amount);
    setSponsorPoints(prev => prev - amount);
  }, [sponsorPoints]);

  const collectBetPayout = useCallback(() => {
    if (!betTeam || betAmount === 0) return 0;
    const winningTeam = (['blue', 'red', 'green', 'yellow'] as const).find(t =>
      state.units.some(u => u.team === t && u.isAlive)
    );
    if (winningTeam === betTeam) {
      const payout = betAmount * 3;
      setSponsorPoints(prev => prev + payout);
      return payout;
    }
    return 0;
  }, [betTeam, betAmount, state.units]);

  const startAutoPlay = useCallback(() => {
    startBgMusic();
    unitQueueRef.current = [];
    setState(prev => ({
      ...prev,
      phase: 'select',
      autoPlay: true,
      log: [...prev.log,
        '» AUTO-BATTLE ENGAGED! All teams controlled by AI.',
        '» Units act one at a time — Soldier first, then Medic.',
        '» 🎁 You are now a SPONSOR — click any unit to send gifts!',
        ...(betTeam ? [`» 🎰 Your bet: ⭐${betAmount} on ${betTeam.toUpperCase()} team — 3x payout if they win!`] : []),
      ],
    }));
  }, [betTeam, betAmount]);

  const stopAutoPlay = useCallback(() => {
    unitQueueRef.current = [];
    setState(prev => ({ ...prev, autoPlay: false }));
  }, []);

  const selectUnit = useCallback((unitId: string) => {
    setState(prev => {
      if (prev.autoPlay) return prev;
      const unit = prev.units.find(u => u.id === unitId);
      if (!unit || !unit.isAlive || unit.team !== prev.currentTeam) return prev;
      if (unit.ap <= 0) return prev;

      const movable = unit.ap >= AP_MOVE_COST && !unit.isSuppressed ? getMovableTiles(unit, prev) : [];
      const attackable = unit.ap >= AP_ATTACK_COST ? getAttackableTiles(unit, prev) : [];

      return {
        ...prev,
        selectedUnitId: unitId,
        phase: movable.length > 0 ? 'move' : attackable.length > 0 ? 'attack' : 'select',
        movableTiles: movable,
        attackableTiles: attackable,
        abilityTargetTiles: [],
        activeAbility: null,
        attackPreview: null,
      };
    });
  }, []);

  const moveUnit = useCallback((pos: Position) => {
    setState(prev => {
      if (!prev.selectedUnitId || prev.phase !== 'move') return prev;
      const units = prev.units.map(u => ({ ...u, weapon: { ...u.weapon } }));
      const grid = prev.grid.map(row => row.map(t => ({ ...t, loot: t.loot ? { ...t.loot } : null })));

      const movingUnit = units.find(u => u.id === prev.selectedUnitId)!;
      const path = findPath(movingUnit.position, pos, prev);
      movingUnit.position = pos;
      movingUnit.ap -= AP_MOVE_COST;

      const log = [...prev.log];
      const newEvents: CombatEvent[] = [];
      const tile = grid[pos.x][pos.z];
      if (tile.loot) {
        const { picked, message } = pickupLoot(movingUnit, tile);
        if (picked) {
          playPickup();
          log.push(message);
          newEvents.push({
            id: `evt-loot-${Date.now()}`, type: 'loot',
            attackerPos: pos, targetPos: pos,
            message, timestamp: Date.now(),
          });
        }
      }

      const owEvents = checkOverwatch(movingUnit, { ...prev, units });

      const unit = units.find(u => u.id === prev.selectedUnitId)!;
      const attackable = unit.ap >= AP_ATTACK_COST && unit.isAlive ? getAttackableTiles(unit, { ...prev, units }) : [];

      return {
        ...prev,
        units, grid,
        phase: unit.isAlive && (attackable.length > 0 || unit.ap > 0) ? (attackable.length > 0 ? 'attack' : 'select') : 'select',
        movableTiles: [],
        attackableTiles: attackable,
        selectedUnitId: unit.isAlive && (attackable.length > 0 || unit.ap > 0) ? prev.selectedUnitId : null,
        log: [...log, ...owEvents.map(e => e.message)],
        combatEvents: [...prev.combatEvents, ...owEvents, ...newEvents],
        movePath: path,
        movingUnitId: prev.selectedUnitId,
      };
    });
  }, []);

  const attackTarget = useCallback((pos: Position) => {
    setState(prev => {
      if (!prev.selectedUnitId || prev.phase !== 'attack') return prev;
      const units = prev.units.map(u => ({ ...u, weapon: { ...u.weapon } }));
      const attacker = units.find(u => u.id === prev.selectedUnitId)!;
      const target = units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z && u.team !== attacker.team);
      if (!target) return prev;

      const result = performAttack(attacker, target, prev.grid);
      attacker.ap -= AP_ATTACK_COST;

      const log = [...prev.log, ...result.events.map(e => e.message)];
      const events = [...prev.combatEvents, ...result.events];

      const aliveTeams = getAliveTeams(units);
      if (aliveTeams.length <= 1) {
        stopBgMusic();
        return {
          ...prev, units, log: [...log, `🏆 ${aliveTeams[0]?.toUpperCase() || 'NO'} TEAM WINS THE BATTLE ROYALE!`],
          phase: 'game_over', selectedUnitId: null, movableTiles: [], attackableTiles: [],
          abilityTargetTiles: [], combatEvents: events, attackPreview: null, autoPlay: false,
        };
      }

      const canStillAct = attacker.ap > 0 && attacker.isAlive;

      return {
        ...prev, units, log,
        phase: 'select',
        selectedUnitId: canStillAct ? prev.selectedUnitId : null,
        movableTiles: [],
        attackableTiles: canStillAct ? getAttackableTiles(attacker, { ...prev, units }) : [],
        abilityTargetTiles: [],
        combatEvents: events,
        attackPreview: null,
      };
    });
  }, []);

  const useAbility = useCallback((abilityId: AbilityId) => {
    setState(prev => {
      if (!prev.selectedUnitId) return prev;
      const unit = prev.units.find(u => u.id === prev.selectedUnitId);
      if (!unit) return prev;

      const tiles = getAbilityTargetTiles(unit, abilityId, prev);
      if (abilityId === 'hunker_down') {
        const units = prev.units.map(u => {
          if (u.id === prev.selectedUnitId) {
            return { ...u, isHunkered: true, ap: u.ap - 1, cooldowns: { ...u.cooldowns } };
          }
          return u;
        });
        const evt: CombatEvent = {
          id: `evt-${Date.now()}`, type: 'hunker',
          attackerPos: unit.position, targetPos: unit.position,
          message: `🛡 ${unit.name} HUNKERS DOWN`,
          timestamp: Date.now(),
        };
        return {
          ...prev, units,
          log: [...prev.log, evt.message],
          combatEvents: [...prev.combatEvents, evt],
          phase: 'select', selectedUnitId: null,
          movableTiles: [], attackableTiles: [], abilityTargetTiles: [], activeAbility: null,
        };
      }

      return {
        ...prev,
        phase: 'ability',
        abilityTargetTiles: tiles,
        activeAbility: abilityId,
        movableTiles: [],
        attackableTiles: [],
      };
    });
  }, []);

  const executeAbility = useCallback((pos: Position) => {
    setState(prev => {
      if (!prev.selectedUnitId || !prev.activeAbility || prev.phase !== 'ability') return prev;
      const units = prev.units.map(u => ({ ...u, weapon: { ...u.weapon } }));
      const unit = units.find(u => u.id === prev.selectedUnitId)!;
      const ability = unit.abilities.find(a => a.id === prev.activeAbility);
      if (!ability) return prev;

      const log = [...prev.log];
      const events: CombatEvent[] = [];

      switch (prev.activeAbility) {
        case 'grenade': {
          const radius = ability.aoeRadius || 2;
          const damaged: string[] = [];
          for (const u of units) {
            if (!u.isAlive || u.id === unit.id) continue;
            if (getManhattanDistance(u.position, pos) <= radius) {
              const dmg = 20 + Math.floor(Math.random() * 10);
              u.hp -= dmg;
              if (u.hp <= 0) { u.hp = 0; u.isAlive = false; unit.kills++; }
              damaged.push(`${u.name}(-${dmg})`);
              events.push({
                id: `evt-${Date.now()}-${u.id}`, type: u.isAlive ? 'damage' : 'kill',
                attackerPos: unit.position, targetPos: u.position, value: dmg,
                message: u.isAlive ? `💣 ${u.name} takes ${dmg} grenade damage!` : `💣💀 ${u.name} killed by grenade!`,
                timestamp: Date.now(),
              });
            }
          }
          // Environmental destruction
          const grid = prev.grid.map(row => row.map(t => ({ ...t, loot: t.loot ? { ...t.loot } : null })));
          applyExplosionDamage(grid, pos, radius);
          log.push(`💣 ${unit.name} throws GRENADE! ${damaged.join(', ')}`);
          return {
            ...prev, units, log, grid,
            combatEvents: [...prev.combatEvents, ...events],
            phase: 'select' as const, activeAbility: null,
            movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
            selectedUnitId: null,
          };
        }
        case 'first_aid':
        case 'heal': {
          let target = units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z && u.team === unit.team);
          if (!target && pos.x === unit.position.x && pos.z === unit.position.z) target = unit;
          if (target) {
            const healAmt = prev.activeAbility === 'first_aid' ? 35 : 40;
            target.hp = Math.min(target.maxHp, target.hp + healAmt);
            const isSelf = target.id === unit.id;
            log.push(isSelf
              ? `💊 ${unit.name} uses FIRST AID on self (+${healAmt} HP)!`
              : `💊 ${unit.name} uses FIRST AID on ${target.name} (+${healAmt} HP)!`
            );
            events.push({
              id: `evt-${Date.now()}`, type: 'heal',
              attackerPos: unit.position, targetPos: target.position, value: healAmt,
              message: isSelf ? `💊 Self-heal +${healAmt} HP` : `💊 ${target.name} healed +${healAmt} HP`,
              timestamp: Date.now(),
            });
          }
          break;
        }
        case 'suppress': {
          const target = units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z && u.team !== unit.team);
          if (target) {
            target.isSuppressed = true;
            log.push(`🔫 ${unit.name} SUPPRESSES ${target.name}!`);
            events.push({
              id: `evt-${Date.now()}`, type: 'ability',
              attackerPos: unit.position, targetPos: target.position,
              message: `🔫 ${target.name} SUPPRESSED!`,
              timestamp: Date.now(),
            });
          }
          break;
        }
        case 'smoke': {
          const radius = ability.aoeRadius || 1;
          const grid = prev.grid.map(row => row.map(t => ({ ...t })));
          for (let x = 0; x < 20; x++) {
            for (let z = 0; z < 20; z++) {
              if (getManhattanDistance({ x, z }, pos) <= radius) {
                grid[x][z].hasSmoke = true;
              }
            }
          }
          log.push(`💨 ${unit.name} deploys SMOKE COVER!`);
          events.push({
            id: `evt-${Date.now()}`, type: 'ability',
            attackerPos: unit.position, targetPos: pos,
            message: `💨 Smoke deployed!`,
            timestamp: Date.now(),
          });
          unit.ap -= ability.apCost;
          unit.cooldowns[prev.activeAbility] = ability.cooldown;
          return {
            ...prev, units, grid, log,
            combatEvents: [...prev.combatEvents, ...events],
            phase: 'select', selectedUnitId: null,
            movableTiles: [], attackableTiles: [], abilityTargetTiles: [], activeAbility: null,
          };
        }
      }

      unit.ap -= ability.apCost;
      unit.cooldowns[prev.activeAbility] = ability.cooldown;

      const aliveTeams = getAliveTeams(units);
      if (aliveTeams.length <= 1) {
        stopBgMusic();
        return {
          ...prev, units, log: [...log, `🏆 ${aliveTeams[0]?.toUpperCase()} TEAM WINS!`],
          phase: 'game_over', selectedUnitId: null,
          movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
          combatEvents: [...prev.combatEvents, ...events], activeAbility: null, autoPlay: false,
        };
      }

      return {
        ...prev, units, log,
        combatEvents: [...prev.combatEvents, ...events],
        phase: 'select', selectedUnitId: null,
        movableTiles: [], attackableTiles: [], abilityTargetTiles: [], activeAbility: null,
      };
    });
  }, []);

  const setHoveredTile = useCallback((pos: Position | null) => {
    setState(prev => {
      if (!pos || !prev.selectedUnitId || prev.phase !== 'attack') {
        if (prev.attackPreview) return { ...prev, attackPreview: null, hoveredTile: pos };
        return { ...prev, hoveredTile: pos };
      }
      const attacker = prev.units.find(u => u.id === prev.selectedUnitId);
      const target = prev.units.find(u => u.isAlive && u.position.x === pos.x && u.position.z === pos.z && u.team !== attacker?.team);
      if (attacker && target) {
        return { ...prev, hoveredTile: pos, attackPreview: getAttackPreview(attacker, target, prev.grid) };
      }
      return { ...prev, hoveredTile: pos, attackPreview: null };
    });
  }, []);

  const endTurn = useCallback(() => {
    setState(prev => {
      const aliveTeams = getAliveTeams(prev.units);
      if (aliveTeams.length <= 1) return prev;

      let newState = {
        ...prev,
        units: prev.units.map(u => {
          if (u.team === prev.currentTeam) {
            const newCooldowns: Record<string, number> = {};
            for (const [k, v] of Object.entries(u.cooldowns)) {
              if (v > 0) newCooldowns[k] = v - 1;
            }
            return { ...u, ap: u.maxAp, isSuppressed: false, cooldowns: newCooldowns, weapon: { ...u.weapon } };
          }
          return { ...u, weapon: { ...u.weapon } };
        }),
        grid: prev.grid.map(row => row.map(t => ({ ...t, loot: t.loot ? { ...t.loot } : null }))),
      };

      let nextTeam = getNextTeam(newState.currentTeam, newState.units);
      const allAiEvents: CombatEvent[] = [];

      while (nextTeam && nextTeam !== 'blue') {
        newState.currentTeam = nextTeam;
        newState.units = newState.units.map(u => {
          if (u.team === nextTeam) {
            const newCooldowns: Record<string, number> = {};
            for (const [k, v] of Object.entries(u.cooldowns)) {
              if (v > 0) newCooldowns[k] = v - 1;
            }
            return { ...u, ap: u.maxAp, isSuppressed: false, cooldowns: newCooldowns };
          }
          return u;
        });

        const aiResult = runAiTurn(newState);
        newState = aiResult.state;
        allAiEvents.push(...aiResult.events);

        const alive = getAliveTeams(newState.units);
        if (alive.length <= 1) {
          stopBgMusic();
          return {
            ...newState,
            log: [...newState.log, `🏆 ${alive[0]?.toUpperCase() || 'NO'} TEAM WINS!`],
            phase: 'game_over' as const, selectedUnitId: null,
            movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
            combatEvents: [...prev.combatEvents, ...allAiEvents], activeAbility: null, autoPlay: false,
          };
        }

        nextTeam = getNextTeam(nextTeam, newState.units);
        if (nextTeam === 'blue') break;
      }

      return {
        ...newState,
        currentTeam: 'blue',
        phase: 'select' as const, selectedUnitId: null,
        movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
        activeAbility: null,
        turn: newState.turn + 1,
        log: [...newState.log, `» TURN ${newState.turn + 1} — YOUR MOVE`],
        combatEvents: [...prev.combatEvents, ...allAiEvents],
        attackPreview: null, hoveredTile: null,
      };
    });
  }, []);

  const deselect = useCallback(() => {
    setState(prev => ({
      ...prev, selectedUnitId: null,
      movableTiles: [], attackableTiles: [], abilityTargetTiles: [],
      phase: prev.phase === 'game_over' ? 'game_over' : 'select',
      activeAbility: null, attackPreview: null,
    }));
  }, []);

  const restart = useCallback(() => {
    stopBgMusic();
    unitQueueRef.current = [];
    setSponsorPoints(5);
    setInspectedUnitId(null);
    setBetTeam(null);
    setBetAmount(0);
    setState(createInitialState());
  }, []);

  const clearMovePath = useCallback(() => {
    setState(prev => ({ ...prev, movePath: null, movingUnitId: null }));
  }, []);

  const handleAirdropLanded = useCallback((airdrop: AirdropData) => {
    setState(prev => {
      const grid = prev.grid.map(row => row.map(t => ({ ...t })));
      const tile = grid[airdrop.targetPos.x]?.[airdrop.targetPos.z];
      if (tile && !tile.loot) {
        tile.loot = airdrop.loot;
      }
      const airdrops = prev.airdrops.map(a =>
        a.id === airdrop.id ? { ...a, phase: 'landed' as const } : a
      );
      return {
        ...prev,
        grid,
        airdrops,
        log: [...prev.log, `📦 Supply crate landed at (${airdrop.targetPos.x}, ${airdrop.targetPos.z})! Contains: ${airdrop.loot.name}`],
      };
    });
  }, []);

  return {
    state, selectUnit, moveUnit, attackTarget, endTurn, deselect, restart,
    useAbility, executeAbility, setHoveredTile, startAutoPlay, stopAutoPlay,
    sponsorPoints, inspectedUnitId, inspectUnit, sponsorUnit, clearMovePath,
    placeBet, betTeam, betAmount, collectBetPayout, handleAirdropLanded,
  };
}
