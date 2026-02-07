import * as THREE from 'three';
import type { EventType, GameEvent } from './Types';

// ===================================================================
//  Result interface returned each frame from EventSystem.update()
// ===================================================================

export interface EventUpdateResult {
  damageToPlayer: number;
  goldReward: number;
  eventComplete: boolean;
  eventStarted: EventType | null;
  warning: string | null;
  pullForce: THREE.Vector3 | null;
}

// ===================================================================
//  Constants
// ===================================================================

const EVENT_COOLDOWN = 30; // seconds between events
const TREASURE_MAP_CHANCE = 0.10; // per kill

// Kraken
const KRAKEN_MIN_WAVE = 5;
const KRAKEN_CHANCE = 0.15;
const KRAKEN_DURATION = 10;
const KRAKEN_TENTACLE_COUNT = 4;
const KRAKEN_TENTACLE_HP = 40;
const KRAKEN_DESTROY_REQUIRED = 3;
const KRAKEN_TIMEOUT_DAMAGE = 30;
const KRAKEN_GOLD_REWARD = 500;
const KRAKEN_TENTACLE_RADIUS = 12;

// Whirlpool
const WHIRLPOOL_MIN_WAVE = 3;
const WHIRLPOOL_CHANCE = 0.20;
const WHIRLPOOL_DURATION = 15;
const WHIRLPOOL_PULL_RADIUS = 25;
const WHIRLPOOL_PULL_STRENGTH = 8;
const WHIRLPOOL_SPAWN_MIN = 30;
const WHIRLPOOL_SPAWN_MAX = 50;
const WHIRLPOOL_CENTER_RADIUS = 3;
const WHIRLPOOL_CENTER_DAMAGE = 20;
const WHIRLPOOL_PUSH_DISTANCE = 10;

// Ghost ship event
const GHOST_SHIP_MIN_WAVE = 4;
const GHOST_SHIP_CHANCE = 0.10;
const GHOST_SHIP_DURATION = 15;

// Sea serpent
const SERPENT_MIN_WAVE = 7;
const SERPENT_CHANCE = 0.10;
const SERPENT_DURATION = 20;
const SERPENT_SEGMENT_COUNT = 8;
const SERPENT_HIT_RADIUS = 3;
const SERPENT_DAMAGE_PER_SEC = 10;
const SERPENT_GOLD_REWARD = 300;
const SERPENT_ORBIT_MIN = 15;
const SERPENT_ORBIT_MAX = 25;

// Storm surge
const STORM_SURGE_CHANCE = 0.25;
const STORM_SURGE_WARNING = 5;
const STORM_SURGE_DAMAGE = 15;
const STORM_SURGE_SAFE_SPEED = 8;

// Treasure map
const TREASURE_MAP_GOLD_MIN = 200;
const TREASURE_MAP_GOLD_MAX = 800;

// ===================================================================
//  Helper: create an empty result
// ===================================================================

function emptyResult(): EventUpdateResult {
  return {
    damageToPlayer: 0,
    goldReward: 0,
    eventComplete: false,
    eventStarted: null,
    warning: null,
    pullForce: null,
  };
}

// ===================================================================
//  EventSystem
// ===================================================================

export class EventSystem {
  private currentEvent: GameEvent | null = null;
  private eventCooldown = 0;
  private treasureMapActive = false;
  private treasureMapIslandIndex = -1;
  private rollAccumulator = 0; // accumulate dt so we roll once per second

  constructor() {
    this.reset();
  }

  // -----------------------------------------------------------------
  //  rollForEvent -- called each frame, checks whether a new event
  //  should start. Returns the event type if one triggered, else null.
  //  Does NOT start the event; main.ts calls startEvent() after.
  // -----------------------------------------------------------------

  rollForEvent(waveNumber: number, weatherState: string): EventType | null {
    // Only one event at a time
    if (this.currentEvent) return null;
    if (this.eventCooldown > 0) return null;

    // Build candidate list based on wave requirements
    const candidates: { type: EventType; chance: number }[] = [];

    if (waveNumber >= KRAKEN_MIN_WAVE) {
      candidates.push({ type: 'kraken', chance: KRAKEN_CHANCE });
    }
    if (waveNumber >= WHIRLPOOL_MIN_WAVE) {
      candidates.push({ type: 'whirlpool', chance: WHIRLPOOL_CHANCE });
    }
    if (waveNumber >= GHOST_SHIP_MIN_WAVE) {
      candidates.push({ type: 'ghost_ship_event', chance: GHOST_SHIP_CHANCE });
    }
    if (waveNumber >= SERPENT_MIN_WAVE) {
      candidates.push({ type: 'sea_serpent', chance: SERPENT_CHANCE });
    }
    if (weatherState === 'stormy') {
      candidates.push({ type: 'storm_surge', chance: STORM_SURGE_CHANCE });
    }

    if (candidates.length === 0) return null;

    // Roll each candidate independently; first match wins (shuffled to
    // prevent order bias).
    shuffleArray(candidates);
    for (const c of candidates) {
      if (Math.random() < c.chance) {
        return c.type;
      }
    }
    return null;
  }

  // -----------------------------------------------------------------
  //  rollForTreasureMap -- separate roll per enemy kill
  // -----------------------------------------------------------------

  rollForTreasureMap(): boolean {
    if (this.treasureMapActive) return false;
    return Math.random() < TREASURE_MAP_CHANCE;
  }

  // -----------------------------------------------------------------
  //  startEvent -- set up event data structures
  // -----------------------------------------------------------------

  startEvent(type: EventType, playerPos: THREE.Vector3, islandCount = 0): void {
    const event: GameEvent = {
      type,
      active: true,
      timer: 0,
      duration: 0,
      pos: playerPos.clone(),
      data: {},
    };

    switch (type) {
      case 'kraken':
        event.duration = KRAKEN_DURATION;
        event.pos.copy(playerPos);
        // Place tentacles in a ring around player
        const tentaclePositions: THREE.Vector3[] = [];
        const tentacleHp: number[] = [];
        for (let i = 0; i < KRAKEN_TENTACLE_COUNT; i++) {
          const angle = (i / KRAKEN_TENTACLE_COUNT) * Math.PI * 2 + Math.random() * 0.4;
          const dist = KRAKEN_TENTACLE_RADIUS + (Math.random() - 0.5) * 4;
          tentaclePositions.push(new THREE.Vector3(
            playerPos.x + Math.cos(angle) * dist,
            0,
            playerPos.z + Math.sin(angle) * dist,
          ));
          tentacleHp.push(KRAKEN_TENTACLE_HP);
        }
        event.data.tentaclePositions = tentaclePositions;
        event.data.tentacleHp = tentacleHp;
        event.data.tentaclesDestroyed = 0;
        break;

      case 'whirlpool':
        event.duration = WHIRLPOOL_DURATION;
        // Random position 30-50 units from player
        {
          const angle = Math.random() * Math.PI * 2;
          const dist = WHIRLPOOL_SPAWN_MIN + Math.random() * (WHIRLPOOL_SPAWN_MAX - WHIRLPOOL_SPAWN_MIN);
          const center = new THREE.Vector3(
            playerPos.x + Math.cos(angle) * dist,
            0,
            playerPos.z + Math.sin(angle) * dist,
          );
          event.pos.copy(center);
          event.data.pullCenter = center.clone();
          event.data.pullRadius = WHIRLPOOL_PULL_RADIUS;
          event.data.hitCooldown = 0;
        }
        break;

      case 'ghost_ship_event':
        event.duration = GHOST_SHIP_DURATION;
        event.data.spawned = false;
        break;

      case 'sea_serpent':
        event.duration = SERPENT_DURATION;
        event.pos.copy(playerPos);
        // Initialise segment positions along a line near the player
        {
          const segments: THREE.Vector3[] = [];
          const baseAngle = Math.random() * Math.PI * 2;
          const radius = (SERPENT_ORBIT_MIN + SERPENT_ORBIT_MAX) / 2;
          for (let i = 0; i < SERPENT_SEGMENT_COUNT; i++) {
            const a = baseAngle + (i / SERPENT_SEGMENT_COUNT) * Math.PI * 0.5;
            segments.push(new THREE.Vector3(
              playerPos.x + Math.cos(a) * radius,
              0,
              playerPos.z + Math.sin(a) * radius,
            ));
          }
          event.data.segmentPositions = segments;
          event.data.hitAccumulator = 0;
          event.data.survived = true;
        }
        break;

      case 'storm_surge':
        event.duration = STORM_SURGE_WARNING; // warning phase only
        event.data.warningTimer = STORM_SURGE_WARNING;
        event.data.surgeHit = false;
        event.data.phase = 'warning'; // 'warning' | 'resolved'
        break;

      case 'treasure_map':
        event.duration = 0; // no timer -- persists until player collects
        if (islandCount > 0) {
          const idx = Math.floor(Math.random() * islandCount);
          event.data.targetIslandIndex = idx;
          event.data.goldValue = TREASURE_MAP_GOLD_MIN +
            Math.floor(Math.random() * (TREASURE_MAP_GOLD_MAX - TREASURE_MAP_GOLD_MIN + 1));
          this.treasureMapActive = true;
          this.treasureMapIslandIndex = idx;
        }
        // Treasure map doesn't use the standard event slot
        this.currentEvent = null;
        return;
    }

    this.currentEvent = event;
    this.eventCooldown = EVENT_COOLDOWN;
  }

  // -----------------------------------------------------------------
  //  update -- advance the active event by dt, returning results
  // -----------------------------------------------------------------

  update(dt: number, playerPos: THREE.Vector3, playerSpeed: number): EventUpdateResult {
    const result = emptyResult();

    // Tick cooldown
    if (this.eventCooldown > 0) {
      this.eventCooldown -= dt;
    }

    // Accumulate time for event rolling (caller should roll once per second)
    this.rollAccumulator += dt;

    if (!this.currentEvent || !this.currentEvent.active) {
      return result;
    }

    const ev = this.currentEvent;
    ev.timer += dt;

    switch (ev.type) {
      case 'kraken':
        result.eventStarted = ev.timer <= dt ? 'kraken' : null;
        this.updateKraken(ev, dt, playerPos, result);
        break;

      case 'whirlpool':
        result.eventStarted = ev.timer <= dt ? 'whirlpool' : null;
        this.updateWhirlpool(ev, dt, playerPos, result);
        break;

      case 'ghost_ship_event':
        if (!ev.data.spawned) {
          ev.data.spawned = true;
          result.eventStarted = 'ghost_ship_event';
        }
        this.updateGhostShipEvent(ev, dt, result);
        break;

      case 'sea_serpent':
        result.eventStarted = ev.timer <= dt ? 'sea_serpent' : null;
        this.updateSeaSerpent(ev, dt, playerPos, result);
        break;

      case 'storm_surge':
        result.eventStarted = ev.timer <= dt ? 'storm_surge' : null;
        this.updateStormSurge(ev, dt, playerPos, playerSpeed, result);
        break;
    }

    return result;
  }

  // -----------------------------------------------------------------
  //  Kraken update
  // -----------------------------------------------------------------

  private updateKraken(
    ev: GameEvent, _dt: number, playerPos: THREE.Vector3,
    result: EventUpdateResult,
  ): void {
    const destroyed = ev.data.tentaclesDestroyed as number;
    const tentaclePositions = ev.data.tentaclePositions as THREE.Vector3[];

    // Animate tentacles: gentle sway toward player
    for (let i = 0; i < tentaclePositions.length; i++) {
      const hp = (ev.data.tentacleHp as number[])[i];
      if (hp <= 0) continue;
      // Slow drift toward player (menacing approach)
      const tp = tentaclePositions[i];
      const dx = playerPos.x - tp.x;
      const dz = playerPos.z - tp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 5) {
        tp.x += (dx / dist) * 0.5 * _dt;
        tp.z += (dz / dist) * 0.5 * _dt;
      }
    }

    // Success: destroyed enough tentacles
    if (destroyed >= KRAKEN_DESTROY_REQUIRED) {
      result.goldReward = KRAKEN_GOLD_REWARD;
      result.eventComplete = true;
      this.endCurrentEvent();
      return;
    }

    // Timeout: not enough tentacles destroyed
    if (ev.timer >= ev.duration) {
      result.damageToPlayer = KRAKEN_TIMEOUT_DAMAGE;
      result.eventComplete = true;
      this.endCurrentEvent();
      return;
    }

    // Warning at 3 seconds remaining
    if (ev.duration - ev.timer < 3) {
      result.warning = 'KRAKEN ESCAPING!';
    }
  }

  // -----------------------------------------------------------------
  //  Whirlpool update
  // -----------------------------------------------------------------

  private updateWhirlpool(
    ev: GameEvent, dt: number, playerPos: THREE.Vector3,
    result: EventUpdateResult,
  ): void {
    const center = ev.data.pullCenter as THREE.Vector3;
    const pullRadius = ev.data.pullRadius as number;

    const dx = center.x - playerPos.x;
    const dz = center.z - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Pull force: stronger as you get closer, within radius
    if (dist < pullRadius && dist > 0.1) {
      const strength = WHIRLPOOL_PULL_STRENGTH * (1 - dist / pullRadius);
      // Tangential swirl + radial pull
      const nx = dx / dist;
      const nz = dz / dist;
      // Tangential component (perpendicular to radial, creates swirl)
      const tx = -nz;
      const tz = nx;
      // Blend: 60% radial pull, 40% tangential swirl
      const pullX = (nx * 0.6 + tx * 0.4) * strength;
      const pullZ = (nz * 0.6 + tz * 0.4) * strength;
      result.pullForce = new THREE.Vector3(pullX, 0, pullZ);
    }

    // Center hit: damage + push out
    let hitCooldown = ev.data.hitCooldown as number;
    if (hitCooldown > 0) {
      hitCooldown -= dt;
      ev.data.hitCooldown = hitCooldown;
    }

    if (dist < WHIRLPOOL_CENTER_RADIUS && hitCooldown <= 0) {
      result.damageToPlayer = WHIRLPOOL_CENTER_DAMAGE;
      ev.data.hitCooldown = 2; // 2 second cooldown between center hits

      // Push player outward
      if (dist > 0.01) {
        const pushX = -(dx / dist) * WHIRLPOOL_PUSH_DISTANCE;
        const pushZ = -(dz / dist) * WHIRLPOOL_PUSH_DISTANCE;
        result.pullForce = new THREE.Vector3(pushX, 0, pushZ);
      }
    }

    // Warning
    if (dist < pullRadius) {
      result.warning = 'WHIRLPOOL PULL!';
    }

    // Timeout: event ends
    if (ev.timer >= ev.duration) {
      result.eventComplete = true;
      this.endCurrentEvent();
    }
  }

  // -----------------------------------------------------------------
  //  Ghost ship event update
  // -----------------------------------------------------------------

  private updateGhostShipEvent(
    ev: GameEvent, _dt: number,
    result: EventUpdateResult,
  ): void {
    // Ghost ship event just signals main.ts to spawn a ghost ship enemy.
    // The actual ghost ship behavior is handled by EnemyAI / merchant AI.
    // The event ends after its duration.
    if (ev.timer >= ev.duration) {
      result.eventComplete = true;
      this.endCurrentEvent();
    }
  }

  // -----------------------------------------------------------------
  //  Sea serpent update
  // -----------------------------------------------------------------

  private updateSeaSerpent(
    ev: GameEvent, dt: number, playerPos: THREE.Vector3,
    result: EventUpdateResult,
  ): void {
    const segments = ev.data.segmentPositions as THREE.Vector3[];
    const t = ev.timer;

    // Figure-8 pattern around player
    // Head traces a lemniscate (figure-8) parametrically
    const period = 8; // seconds for a full figure-8
    const phase = (t / period) * Math.PI * 2;
    const radiusMid = (SERPENT_ORBIT_MIN + SERPENT_ORBIT_MAX) / 2;
    const radiusVar = (SERPENT_ORBIT_MAX - SERPENT_ORBIT_MIN) / 2;
    const currentRadius = radiusMid + Math.sin(phase * 0.3) * radiusVar;

    // Head position: figure-8 (lemniscate of Bernoulli, projected)
    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);
    const denom = 1 + sinP * sinP;
    const headX = playerPos.x + (currentRadius * cosP) / denom;
    const headZ = playerPos.z + (currentRadius * sinP * cosP) / denom;

    // Update head
    segments[0].set(headX, 0, headZ);

    // Each subsequent segment follows the one ahead with a delay
    for (let i = 1; i < segments.length; i++) {
      const leader = segments[i - 1];
      const seg = segments[i];
      const followDx = leader.x - seg.x;
      const followDz = leader.z - seg.z;
      const followDist = Math.sqrt(followDx * followDx + followDz * followDz);
      const segSpacing = 2.5;
      if (followDist > segSpacing) {
        const moveT = 1 - Math.exp(-8 * dt);
        seg.x += followDx * moveT;
        seg.z += followDz * moveT;
      }
      // Sine wave offset perpendicular to travel direction for a slithering look
      if (followDist > 0.1) {
        const perpX = -followDz / followDist;
        const perpZ = followDx / followDist;
        const slither = Math.sin(t * 4 + i * 1.2) * 1.5;
        seg.x += perpX * slither * dt;
        seg.z += perpZ * slither * dt;
      }
    }

    // Check collision with player -- any segment within hit radius
    let hitting = false;
    for (const seg of segments) {
      const sdx = seg.x - playerPos.x;
      const sdz = seg.z - playerPos.z;
      const sDist = Math.sqrt(sdx * sdx + sdz * sdz);
      if (sDist < SERPENT_HIT_RADIUS) {
        hitting = true;
        break;
      }
    }

    if (hitting) {
      // Accumulate fractional damage
      let acc = ev.data.hitAccumulator as number;
      acc += SERPENT_DAMAGE_PER_SEC * dt;
      const intDmg = Math.floor(acc);
      if (intDmg > 0) {
        result.damageToPlayer = intDmg;
        acc -= intDmg;
        ev.data.survived = false;
      }
      ev.data.hitAccumulator = acc;
      result.warning = 'SEA SERPENT!';
    }

    // Timeout: survived
    if (ev.timer >= ev.duration) {
      result.eventComplete = true;
      if (ev.data.survived) {
        result.goldReward = SERPENT_GOLD_REWARD;
      }
      this.endCurrentEvent();
    }
  }

  // -----------------------------------------------------------------
  //  Storm surge update
  // -----------------------------------------------------------------

  private updateStormSurge(
    ev: GameEvent, dt: number, _playerPos: THREE.Vector3,
    playerSpeed: number, result: EventUpdateResult,
  ): void {
    const phase = ev.data.phase as string;

    if (phase === 'warning') {
      let wt = ev.data.warningTimer as number;
      wt -= dt;
      ev.data.warningTimer = wt;

      // Countdown warning
      const secondsLeft = Math.ceil(wt);
      result.warning = `STORM SURGE IN ${secondsLeft}s!`;

      if (wt <= 0) {
        // Surge hits!
        ev.data.phase = 'resolved';
        if (playerSpeed < STORM_SURGE_SAFE_SPEED) {
          result.damageToPlayer = STORM_SURGE_DAMAGE;
          ev.data.surgeHit = true;
          result.warning = 'STORM SURGE HIT!';
        } else {
          result.warning = 'RODE THE WAVE!';
          ev.data.surgeHit = false;
        }
        result.eventComplete = true;
        this.endCurrentEvent();
      }
    }
  }

  // -----------------------------------------------------------------
  //  hitTentacle -- called when a cannonball hits a tentacle
  //  Returns true if the tentacle was destroyed by this hit
  // -----------------------------------------------------------------

  hitTentacle(index: number, damage: number): boolean {
    if (!this.currentEvent || this.currentEvent.type !== 'kraken') return false;

    const hpArr = this.currentEvent.data.tentacleHp as number[];
    if (index < 0 || index >= hpArr.length) return false;
    if (hpArr[index] <= 0) return false; // already dead

    hpArr[index] -= damage;

    if (hpArr[index] <= 0) {
      hpArr[index] = 0;
      (this.currentEvent.data.tentaclesDestroyed as number)++;
      return true;
    }
    return false;
  }

  // -----------------------------------------------------------------
  //  Accessors
  // -----------------------------------------------------------------

  getCurrentEvent(): GameEvent | null {
    return this.currentEvent;
  }

  getTreasureMapTarget(): number {
    return this.treasureMapActive ? this.treasureMapIslandIndex : -1;
  }

  clearTreasureMap(): void {
    this.treasureMapActive = false;
    this.treasureMapIslandIndex = -1;
  }

  isEventActive(): boolean {
    return this.currentEvent !== null && this.currentEvent.active;
  }

  /**
   * Returns true once per second (approximately) so the caller knows
   * when to call rollForEvent(). Resets the accumulator.
   */
  shouldRoll(): boolean {
    if (this.rollAccumulator >= 1) {
      this.rollAccumulator -= 1;
      return true;
    }
    return false;
  }

  reset(): void {
    this.currentEvent = null;
    this.eventCooldown = 10; // short initial cooldown at game start
    this.treasureMapActive = false;
    this.treasureMapIslandIndex = -1;
    this.rollAccumulator = 0;
  }

  // -----------------------------------------------------------------
  //  Internal helpers
  // -----------------------------------------------------------------

  private endCurrentEvent(): void {
    if (this.currentEvent) {
      this.currentEvent.active = false;
      this.currentEvent = null;
      this.eventCooldown = EVENT_COOLDOWN;
    }
  }
}

// ===================================================================
//  Utility: Fisher-Yates shuffle
// ===================================================================

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
