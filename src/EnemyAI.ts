import * as THREE from 'three';
import type { EnemyType, EnemyTypeConfig, MerchantV1, WaveConfigV1 } from './Types';
import { ENEMY_TYPE_CONFIGS } from './Types';

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const TWO_PI = Math.PI * 2;
const DESPAWN_RANGE = 120;

// Flee behavior
const FLEE_ZIGZAG_INTERVAL_MIN = 0.6;
const FLEE_ZIGZAG_INTERVAL_MAX = 1.2;
const FLEE_TURN_RATE = 3.5;
const FLEE_URGENCY_RANGE = 22;

// Circle strafe behavior
const CIRCLE_PREFERRED_DIST = 20;
const CIRCLE_CHASE_DIST = 50;
const CIRCLE_TURN_RATE = 2.8;
const CIRCLE_ORBIT_SPEED = 1.8;
const CIRCLE_FIRE_ARC = Math.PI / 2; // ~90 degrees from broadside (widened for more shooting)

// Beeline behavior
const BEELINE_TURN_RATE = 4.0;
const BEELINE_SELF_DESTRUCT_RANGE = 3;

// Phase (ghost) behavior
const GHOST_PHASE_INTERVAL = 3.0;
const GHOST_FLEE_SPEED_MULT = 1.4;
const GHOST_FIRE_RANGE = 40;

// Formation behavior
const FORMATION_SPACING = 8;
const FORMATION_TURN_RATE = 2.0;
const FORMATION_ENGAGE_DIST = 45;
const FORMATION_FIRE_ARC = Math.PI / 1.5; // ~120 degrees from broadside (much wider)
const FORMATION_FIRE_COOLDOWN = 2.5; // Faster firing

const DEFAULT_PRESSURE_PROFILE = {
  speedMult: 1,
  turnRateMult: 1,
  fireCooldownMult: 1,
  fireRangeMult: 1,
  broadsideArcMult: 1,
  engageRangeMult: 1,
  fleeUrgencyMult: 1,
  beelineExplodeRangeMult: 1,
  ghostPhaseIntervalMult: 1,
};

export type EnemyAIPressureProfile = Partial<typeof DEFAULT_PRESSURE_PROFILE>;

// ---------------------------------------------------------------------------
//  Angle helpers
// ---------------------------------------------------------------------------

function normalizeAngle(a: number): number {
  a = a % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

function angleTo(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function distXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// ---------------------------------------------------------------------------
//  EnemyAISystem
// ---------------------------------------------------------------------------

export class EnemyAISystem {
  private static pressureProfile = { ...DEFAULT_PRESSURE_PROFILE };

  static setPressureProfile(profile: EnemyAIPressureProfile): void {
    EnemyAISystem.pressureProfile = {
      ...DEFAULT_PRESSURE_PROFILE,
      ...profile,
    };
  }

  static resetPressureProfile(): void {
    EnemyAISystem.pressureProfile = { ...DEFAULT_PRESSURE_PROFILE };
  }

  // -----------------------------------------------------------------------
  //  Spawn list generation
  // -----------------------------------------------------------------------

  /**
   * Build a spawn list for a given wave config. Returns an array of
   * { type, isBoss } objects describing each ship to spawn.
   *
   * Logic:
   * - Uses waveConfig.enemyTypes as the available pool of types
   * - armedPercent determines the ratio of armed (combat) to unarmed (flee) types
   * - If bossName is set, one boss is added (escort_frigate type with boosted HP)
   * - totalShips determines the count
   * - speedMultiplier and healthMultiplier are applied at spawn time, not here
   */
  static getSpawnList(
    waveConfig: WaveConfigV1,
    _waveNumber: number,
  ): { type: EnemyType; isBoss: boolean }[] {
    const result: { type: EnemyType; isBoss: boolean }[] = [];
    const availableTypes = waveConfig.enemyTypes;

    // Partition available types into armed (combat) and unarmed (flee) categories
    const armedTypes: EnemyType[] = [];
    const unarmedTypes: EnemyType[] = [];
    for (const t of availableTypes) {
      const cfg = ENEMY_TYPE_CONFIGS[t];
      if (cfg.armed || cfg.behavior === 'beeline' || cfg.behavior === 'phase') {
        armedTypes.push(t);
      } else {
        unarmedTypes.push(t);
      }
    }

    // If one side is empty, fall back to whatever is available
    if (armedTypes.length === 0) {
      for (const t of availableTypes) armedTypes.push(t);
    }
    if (unarmedTypes.length === 0) {
      for (const t of availableTypes) unarmedTypes.push(t);
    }

    // Determine how many ships to spawn (reserve 1 for boss if present)
    const hasBoss = waveConfig.bossName !== null;
    const regularCount = hasBoss
      ? Math.max(1, waveConfig.totalShips - 1)
      : waveConfig.totalShips;

    for (let i = 0; i < regularCount; i++) {
      const isArmedSlot = Math.random() < waveConfig.armedPercent;

      if (isArmedSlot && armedTypes.length > 0) {
        const pool = armedTypes;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        result.push({ type: pick, isBoss: false });
      } else {
        const pool = unarmedTypes;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        result.push({ type: pick, isBoss: false });
      }
    }

    // Navy warships: ensure they come in groups of 2-3 when present
    // Scan for solo warships and pair them up
    const warshipIndices: number[] = [];
    for (let i = 0; i < result.length; i++) {
      if (result[i].type === 'navy_warship') {
        warshipIndices.push(i);
      }
    }
    // If only 1 warship, duplicate one more from available slots
    if (warshipIndices.length === 1 && result.length > 2) {
      // Find a non-boss, non-warship slot to convert
      for (let i = 0; i < result.length; i++) {
        if (result[i].type !== 'navy_warship' && !result[i].isBoss) {
          result[i].type = 'navy_warship';
          break;
        }
      }
    }

    // Add boss
    if (hasBoss) {
      result.push({ type: 'escort_frigate', isBoss: true });
    }

    return result;
  }

  // -----------------------------------------------------------------------
  //  Per-frame AI update (dispatches to behavior-specific update)
  // -----------------------------------------------------------------------

  static updateAI(
    merchant: MerchantV1,
    playerPos: THREE.Vector3,
    playerHeading: number,
    dt: number,
    allMerchants: MerchantV1[],
  ): void {
    if (merchant.state === 'sinking' || merchant.state === 'surrendering') return;

    const config = ENEMY_TYPE_CONFIGS[merchant.enemyType];
    if (!config) return;

    switch (config.behavior) {
      case 'flee':
        EnemyAISystem.updateFlee(merchant, playerPos, dt);
        break;
      case 'circle_strafe':
        EnemyAISystem.updateCircleStrafe(merchant, playerPos, playerHeading, dt);
        break;
      case 'beeline':
        EnemyAISystem.updateBeeline(merchant, playerPos, dt);
        break;
      case 'phase':
        EnemyAISystem.updatePhaseAI(merchant, playerPos, dt);
        break;
      case 'formation':
        EnemyAISystem.updateFormationAI(merchant, playerPos, playerHeading, dt, allMerchants);
        break;
    }
  }

  // -----------------------------------------------------------------------
  //  Behavior: FLEE (merchant_sloop, merchant_galleon)
  // -----------------------------------------------------------------------

  /**
   * Flee behavior: run away from the player, with zigzag evasion.
   * Sloops are fast, galleons are slow but tough.
   * Ships beyond DESPAWN_RANGE should be marked for removal by the caller.
   */
  private static updateFlee(
    m: MerchantV1,
    playerPos: THREE.Vector3,
    dt: number,
  ): void {
    const p = EnemyAISystem.pressureProfile;
    const dist = distXZ(m.pos, playerPos);
    const urgencyRange = FLEE_URGENCY_RANGE * p.fleeUrgencyMult;

    // If far from player, keep sailing straight (don't actively flee)
    if (dist > urgencyRange * 2.5) {
      m.state = 'sailing';
      m.speed = THREE.MathUtils.lerp(m.speed, m.baseSpeed * p.speedMult, 1 - Math.exp(-2 * dt));
      // Gentle wander
      m.heading += (Math.sin(performance.now() * 0.001 + m.id * 7) * 0.2) * dt;
      return;
    }

    // Active fleeing
    m.state = 'fleeing';
    const awayAngle = angleTo(playerPos, m.pos);
    const angleDiff = normalizeAngle(awayAngle - m.heading);
    m.heading += angleDiff * FLEE_TURN_RATE * p.turnRateMult * dt;

    // Zigzag evasion (more frantic when close)
    m.zigzagTimer -= dt;
    if (m.zigzagTimer <= 0) {
      m.zigzagTimer = FLEE_ZIGZAG_INTERVAL_MIN + Math.random() * (FLEE_ZIGZAG_INTERVAL_MAX - FLEE_ZIGZAG_INTERVAL_MIN);
      m.zigzagDir *= -1;
    }
    const urgency = 1 - Math.min(1, dist / urgencyRange);
    m.heading += m.zigzagDir * 0.9 * p.turnRateMult * dt * (1 + urgency * 0.8);

    // Accelerate to flee speed (1.5x base)
    const fleeSpeed = m.baseSpeed * 1.5 * p.speedMult;
    m.speed = Math.min(fleeSpeed, m.speed + 6 * dt);
  }

  // -----------------------------------------------------------------------
  //  Behavior: CIRCLE_STRAFE (escort_frigate)
  // -----------------------------------------------------------------------

  /**
   * Circle-strafe: maintain ~20 units from the player, orbiting.
   * Fire broadsides when the ship's side faces the player.
   * Chase aggressively if the player tries to run.
   */
  private static updateCircleStrafe(
    m: MerchantV1,
    playerPos: THREE.Vector3,
    _playerHeading: number,
    dt: number,
  ): void {
    const p = EnemyAISystem.pressureProfile;
    const dist = distXZ(m.pos, playerPos);
    const toPlayerAngle = angleTo(m.pos, playerPos);
    const chaseDist = CIRCLE_CHASE_DIST * p.engageRangeMult;

    if (dist > chaseDist) {
      // Too far -- chase
      const angleDiff = normalizeAngle(toPlayerAngle - m.heading);
      m.heading += angleDiff * CIRCLE_TURN_RATE * p.turnRateMult * dt;
      m.speed = Math.min(m.baseSpeed * 1.8 * p.speedMult, m.speed + 5 * dt);
      return;
    }

    // Within engagement range: orbit at preferred distance
    const distError = dist - CIRCLE_PREFERRED_DIST;

    // Orbit angle: perpendicular to the player direction with slight inward/outward correction
    let orbitAngle: number;
    if (distError > 3) {
      // Too far from orbit, move inward
      orbitAngle = toPlayerAngle + Math.PI / 5;
    } else if (distError < -3) {
      // Too close, move outward
      orbitAngle = toPlayerAngle - Math.PI / 2.5;
    } else {
      // Orbit perpendicular (clockwise or counter-clockwise based on id for variety)
      const orbitDir = m.id % 2 === 0 ? 1 : -1;
      orbitAngle = toPlayerAngle + (Math.PI / 2) * orbitDir;
    }

    const angleDiff = normalizeAngle(orbitAngle - m.heading);
    m.heading += angleDiff * CIRCLE_TURN_RATE * p.turnRateMult * dt;

    // Orbit speed
    const orbitSpeed = m.baseSpeed * CIRCLE_ORBIT_SPEED * p.speedMult;
    m.speed = THREE.MathUtils.lerp(m.speed, orbitSpeed, 1 - Math.exp(-3 * dt));

    // Boss enrage: faster orbit and tighter distance
    if (m.isBoss && m.bossEnraged) {
      m.speed = Math.min(m.speed * 1.4, m.baseSpeed * 2.5);
    }
  }

  // -----------------------------------------------------------------------
  //  Behavior: BEELINE (fire_ship)
  // -----------------------------------------------------------------------

  /**
   * Beeline: head straight at the player at full speed.
   * On death or within self-destruct range, trigger AoE explosion.
   * Returns nothing -- the caller checks for explosion via checkFireShipExplosion.
   */
  private static updateBeeline(
    m: MerchantV1,
    playerPos: THREE.Vector3,
    dt: number,
  ): void {
    const p = EnemyAISystem.pressureProfile;
    const toPlayerAngle = angleTo(m.pos, playerPos);
    const angleDiff = normalizeAngle(toPlayerAngle - m.heading);
    m.heading += angleDiff * BEELINE_TURN_RATE * p.turnRateMult * dt;

    // Full speed ahead
    const chargeSpeed = m.baseSpeed * 1.2 * p.speedMult;
    m.speed = Math.min(chargeSpeed, m.speed + 8 * dt);

    // Update flee timer as a proximity self-destruct check
    // (the actual explosion check is in checkFireShipExplosion)
  }

  // -----------------------------------------------------------------------
  //  Fire Ship Explosion Check
  // -----------------------------------------------------------------------

  /**
   * Check if a fire ship should self-destruct.
   * Called each frame for active fire ships.
   * Returns explosion info if triggered, null otherwise.
   */
  static checkFireShipExplosion(
    merchant: MerchantV1,
    playerPos: THREE.Vector3,
  ): { exploded: boolean; playerDamage: number; aoeRadius: number } | null {
    if (merchant.enemyType !== 'fire_ship') return null;
    if (merchant.state === 'sinking') return null;

    const p = EnemyAISystem.pressureProfile;
    const config = ENEMY_TYPE_CONFIGS.fire_ship;
    const dist = distXZ(merchant.pos, playerPos);
    const radius = merchant.explosionRadius || config.explosionRadius || 10;
    const selfDestructRange = BEELINE_SELF_DESTRUCT_RANGE * p.beelineExplodeRangeMult;

    // Self-destruct: close enough to player
    if (dist < selfDestructRange) {
      // Damage falls off with distance, but at this range it's near-max
      const falloff = 1 - Math.min(1, dist / radius);
      const baseDamage = 40;
      const playerDamage = baseDamage * falloff;

      return {
        exploded: true,
        playerDamage,
        aoeRadius: radius,
      };
    }

    // Death explosion (hp <= 0 is handled by caller setting state to sinking,
    // but we also check here in case it's called before state change)
    if (merchant.hp <= 0) {
      const falloff = 1 - Math.min(1, dist / radius);
      const baseDamage = 40;
      const playerDamage = dist < radius ? baseDamage * falloff : 0;

      return {
        exploded: true,
        playerDamage,
        aoeRadius: radius,
      };
    }

    return null;
  }

  // -----------------------------------------------------------------------
  //  Behavior: PHASE (ghost_ship)
  // -----------------------------------------------------------------------

  /**
   * Update ghost ship phase state (visible <-> phased).
   * While phased, the ghost has a miss chance on incoming shots.
   * While visible, it fires at the player.
   * After specialTimer expires, the ghost attempts to flee.
   */
  static updateGhostPhase(
    merchant: MerchantV1,
    dt: number,
  ): void {
    if (merchant.enemyType !== 'ghost_ship') return;
    if (merchant.state === 'sinking') return;

    const p = EnemyAISystem.pressureProfile;
    const config = ENEMY_TYPE_CONFIGS.ghost_ship;
    const phaseDuration = (config.phaseDuration ?? GHOST_PHASE_INTERVAL) * p.ghostPhaseIntervalMult;

    // Tick phase timer
    merchant.phaseTimer -= dt;

    if (merchant.phaseTimer <= 0) {
      // Toggle phase state
      merchant.isPhased = !merchant.isPhased;
      merchant.phaseTimer = phaseDuration;

      // Update mesh opacity for phased state
      if (merchant.mesh) {
        merchant.mesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.Material;
            if (merchant.isPhased) {
              mat.transparent = true;
              mat.opacity = 0.35;
            } else {
              mat.transparent = false;
              mat.opacity = 1.0;
            }
          }
        });
      }
    }

    // Decrement special timer (time until ghost flees)
    if (merchant.fleeTimer > 0) {
      merchant.fleeTimer -= dt;
    }
  }

  /**
   * Phase AI movement: fires at player while visible, flees after specialTimer.
   */
  private static updatePhaseAI(
    m: MerchantV1,
    playerPos: THREE.Vector3,
    dt: number,
  ): void {
    const p = EnemyAISystem.pressureProfile;
    const dist = distXZ(m.pos, playerPos);
    const config = ENEMY_TYPE_CONFIGS.ghost_ship;

    // After special timer expires, flee
    if (m.fleeTimer <= 0) {
      // Flee behavior
      const awayAngle = angleTo(playerPos, m.pos);
      const angleDiff = normalizeAngle(awayAngle - m.heading);
      m.heading += angleDiff * 3.0 * p.turnRateMult * dt;
      m.speed = Math.min(m.baseSpeed * GHOST_FLEE_SPEED_MULT * p.speedMult, m.speed + 5 * dt);
      return;
    }

    // Engagement: circle at medium range while visible
    if (dist > GHOST_FIRE_RANGE) {
      // Approach
      const toPlayerAngle = angleTo(m.pos, playerPos);
      const angleDiff = normalizeAngle(toPlayerAngle - m.heading);
      m.heading += angleDiff * 2.5 * p.turnRateMult * dt;
      m.speed = Math.min(m.baseSpeed * 1.3 * p.speedMult, m.speed + 4 * dt);
    } else if (dist < 12) {
      // Too close, back off
      const awayAngle = angleTo(playerPos, m.pos);
      const angleDiff = normalizeAngle(awayAngle - m.heading);
      m.heading += angleDiff * 2.5 * p.turnRateMult * dt;
      m.speed = Math.min(m.baseSpeed * 1.2 * p.speedMult, m.speed + 4 * dt);
    } else {
      // Orbit at comfortable range
      const toPlayerAngle = angleTo(m.pos, playerPos);
      const orbitDir = m.id % 2 === 0 ? 1 : -1;
      const orbitAngle = toPlayerAngle + (Math.PI / 2.5) * orbitDir;
      const angleDiff = normalizeAngle(orbitAngle - m.heading);
      m.heading += angleDiff * 2.0 * p.turnRateMult * dt;
      m.speed = THREE.MathUtils.lerp(m.speed, m.baseSpeed * p.speedMult, 1 - Math.exp(-2 * dt));
    }
  }

  // -----------------------------------------------------------------------
  //  Behavior: FORMATION (navy_warship)
  // -----------------------------------------------------------------------

  /**
   * Update formation logic for all navy warships.
   * Groups of 2-3 travel in line formation.
   * If a formation leader dies, the next in line takes over.
   */
  static updateFormation(merchants: MerchantV1[]): void {
    // Collect all active warships
    const warships = merchants.filter(
      m => m.enemyType === 'navy_warship' && m.state !== 'sinking',
    );

    if (warships.length === 0) return;

    // Group warships by their formation leader ID
    const formations = new Map<number, MerchantV1[]>();

    for (const w of warships) {
      // If this warship's leader is dead/missing, reassign
      if (w.formationLeaderId !== -1 && w.formationLeaderId !== w.id) {
        const leader = merchants.find(
          m => m.id === w.formationLeaderId && m.state !== 'sinking',
        );
        if (!leader) {
          // Leader is dead -- become independent or join another formation
          w.formationLeaderId = w.id; // Self-lead
          w.formationIndex = 0;
        }
      }

      // If still unassigned, self-lead
      if (w.formationLeaderId === -1) {
        w.formationLeaderId = w.id;
        w.formationIndex = 0;
      }

      const leaderId = w.formationLeaderId;
      if (!formations.has(leaderId)) {
        formations.set(leaderId, []);
      }
      formations.get(leaderId)!.push(w);
    }

    // Assign formation indices and ensure the leader is index 0
    for (const [leaderId, members] of formations) {
      // Sort: leader first, then by ID
      members.sort((a, b) => {
        if (a.id === leaderId) return -1;
        if (b.id === leaderId) return 1;
        return a.id - b.id;
      });

      for (let i = 0; i < members.length; i++) {
        members[i].formationIndex = i;
      }
    }
  }

  /**
   * Formation AI movement for a single navy warship.
   * Leader navigates toward the player; followers maintain line-abreast offset.
   */
  private static updateFormationAI(
    m: MerchantV1,
    playerPos: THREE.Vector3,
    _playerHeading: number,
    dt: number,
    allMerchants: MerchantV1[],
  ): void {
    const p = EnemyAISystem.pressureProfile;
    const dist = distXZ(m.pos, playerPos);

    // Is this ship the formation leader?
    const isLeader = m.formationLeaderId === m.id || m.formationIndex === 0;

    if (isLeader) {
      // Leader: navigate toward player for engagement
      if (dist > FORMATION_ENGAGE_DIST * p.engageRangeMult) {
        // Approach
        const toPlayerAngle = angleTo(m.pos, playerPos);
        const angleDiff = normalizeAngle(toPlayerAngle - m.heading);
        m.heading += angleDiff * FORMATION_TURN_RATE * p.turnRateMult * dt;
        m.speed = Math.min(m.baseSpeed * 1.5 * p.speedMult, m.speed + 3 * dt);
      } else if (dist < 12) {
        // Too close, back off slightly to maintain broadside range
        const awayAngle = angleTo(playerPos, m.pos);
        const angleDiff = normalizeAngle(awayAngle - m.heading);
        m.heading += angleDiff * FORMATION_TURN_RATE * p.turnRateMult * dt;
        m.speed = Math.min(m.baseSpeed * 1.2 * p.speedMult, m.speed + 3 * dt);
      } else {
        // Circle at broadside range
        const toPlayerAngle = angleTo(m.pos, playerPos);
        const orbitDir = m.id % 2 === 0 ? 1 : -1;
        const orbitAngle = toPlayerAngle + (Math.PI / 3) * orbitDir;
        const angleDiff = normalizeAngle(orbitAngle - m.heading);
        m.heading += angleDiff * FORMATION_TURN_RATE * p.turnRateMult * dt;
        m.speed = THREE.MathUtils.lerp(m.speed, m.baseSpeed * 1.3 * p.speedMult, 1 - Math.exp(-2 * dt));
      }
    } else {
      // Follower: maintain formation offset relative to leader
      const leader = allMerchants.find(
        o => o.id === m.formationLeaderId && o.state !== 'sinking',
      );

      if (leader) {
        // Line-abreast formation: offset perpendicular to leader's heading
        const perpX = -Math.cos(leader.heading);
        const perpZ = Math.sin(leader.heading);
        const side = m.formationIndex % 2 === 0 ? 1 : -1;
        const offsetMag = Math.ceil(m.formationIndex / 2) * FORMATION_SPACING;

        const targetX = leader.pos.x + perpX * side * offsetMag;
        const targetZ = leader.pos.z + perpZ * side * offsetMag;
        const target = new THREE.Vector3(targetX, 0, targetZ);

        const toTarget = angleTo(m.pos, target);
        const angleDiff = normalizeAngle(toTarget - m.heading);
        m.heading += angleDiff * (FORMATION_TURN_RATE * 1.5) * p.turnRateMult * dt;

        // Match leader speed with slight adjustment for formation keeping
        const targetDist = distXZ(m.pos, target);
        const speedTarget = leader.speed * (1 + Math.min(0.5, targetDist * 0.02));
        m.speed = THREE.MathUtils.lerp(m.speed, speedTarget, 1 - Math.exp(-3 * dt));
      } else {
        // No leader found, act like a leader
        m.formationLeaderId = m.id;
        m.formationIndex = 0;
      }
    }
  }

  // -----------------------------------------------------------------------
  //  Should Fire Check
  // -----------------------------------------------------------------------

  /**
   * Determine if an armed enemy should fire this frame.
   * Checks:
   * - Is the ship armed?
   * - Is the fire timer expired?
   * - Is the player within range?
   * - Is the broadside facing the player? (for circle_strafe and formation)
   * - Ghost ships only fire while visible (not phased)
   *
   * Returns true if the ship should fire. The caller is responsible for
   * actually triggering the shot and resetting the fire timer.
   */
  static shouldFire(
    merchant: MerchantV1,
    playerPos: THREE.Vector3,
  ): boolean {
    const p = EnemyAISystem.pressureProfile;
    if (!merchant.armed) return false;
    if (merchant.state === 'sinking' || merchant.state === 'surrendering') return false;
    if (merchant.fireTimer > 0) return false;

    const dist = distXZ(merchant.pos, playerPos);
    const config = ENEMY_TYPE_CONFIGS[merchant.enemyType];

    // Ghost ship: only fire while visible
    if (config.behavior === 'phase' && merchant.isPhased) return false;

    // Fire ships don't fire cannons
    if (config.behavior === 'beeline') return false;

    // Range check (increased range for better engagement)
    const fireRange = (merchant.isBoss ? 70 : 60) * p.fireRangeMult;
    if (dist > fireRange) return false;

    // Broadside check for circle_strafe and formation behaviors
    if (config.behavior === 'circle_strafe' || config.behavior === 'formation') {
      const toPlayerAngle = angleTo(merchant.pos, playerPos);
      const relativeAngle = normalizeAngle(toPlayerAngle - merchant.heading);

      // Ship fires broadside: left (port) or right (starboard) side
      // Port is around +PI/2, starboard is around -PI/2
      const portDiff = Math.abs(relativeAngle - Math.PI / 2);
      const starboardDiff = Math.abs(relativeAngle + Math.PI / 2);
      const minBroadsideDiff = Math.min(portDiff, starboardDiff);

      const arc = (config.behavior === 'formation' ? FORMATION_FIRE_ARC : CIRCLE_FIRE_ARC) * p.broadsideArcMult;
      if (minBroadsideDiff > arc) return false;
    }

    // Flee behavior ships that are armed (edge case): fire if player is within range
    // They'll fire while running, which is appropriate for rear-guard defense

    return true;
  }

  // -----------------------------------------------------------------------
  //  Utility: get fire cooldown for an enemy type
  // -----------------------------------------------------------------------

  /**
   * Get the base fire cooldown for an enemy based on its type and boss status.
   */
  static getFireCooldown(merchant: MerchantV1): number {
    const p = EnemyAISystem.pressureProfile;
    if (merchant.isBoss && merchant.bossEnraged) return (0.6 + Math.random() * 0.4) * p.fireCooldownMult;
    if (merchant.isBoss) return (1.2 + Math.random() * 0.8) * p.fireCooldownMult;

    const config = ENEMY_TYPE_CONFIGS[merchant.enemyType];

    switch (config.behavior) {
      case 'circle_strafe': return (1.8 + Math.random() * 1.0) * p.fireCooldownMult; // Faster
      case 'phase': return (1.5 + Math.random() * 1.0) * p.fireCooldownMult; // Faster
      case 'formation': return (FORMATION_FIRE_COOLDOWN + Math.random() * 0.8) * p.fireCooldownMult;
      default: return (2.0 + Math.random() * 1.5) * p.fireCooldownMult; // Faster
    }
  }

  // -----------------------------------------------------------------------
  //  Utility: check if a ship should despawn (too far from player)
  // -----------------------------------------------------------------------

  static shouldDespawn(merchant: MerchantV1, playerPos: THREE.Vector3): boolean {
    if (merchant.isBoss) return false;
    if (merchant.state === 'sinking') return false;
    return distXZ(merchant.pos, playerPos) > DESPAWN_RANGE;
  }

  // -----------------------------------------------------------------------
  //  Utility: create initial MerchantV1 properties for a given enemy type
  // -----------------------------------------------------------------------

  /**
   * Returns a partial set of properties to apply to a MerchantV1 when spawning
   * an enemy of the given type. The caller applies wave multipliers and assigns
   * position, mesh, id, etc.
   */
  static getSpawnProps(
    type: EnemyType,
    isBoss: boolean,
    waveConfig: WaveConfigV1,
  ): {
    speed: number;
    baseSpeed: number;
    hp: number;
    maxHp: number;
    armed: boolean;
    value: number;
    scale: number;
    hullColor: number;
    sailColor: number;
    enemyType: EnemyType;
    explosionRadius: number;
    phaseTimer: number;
    isPhased: boolean;
    fleeTimer: number;
    formationIndex: number;
    formationLeaderId: number;
    isBoss: boolean;
    hitRadius: number;
    fireTimer: number;
  } {
    const config = ENEMY_TYPE_CONFIGS[type];

    const baseSpeed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
    const speed = baseSpeed * waveConfig.speedMultiplier;

    let hp: number;
    if (isBoss) {
      hp = waveConfig.bossHp;
    } else {
      hp = Math.round(config.hp * waveConfig.healthMultiplier);
    }

    const value = isBoss ? config.value * 5 : config.value;
    const scale = isBoss ? config.scale * 1.8 : config.scale;

    return {
      speed,
      baseSpeed,
      hp,
      maxHp: hp,
      armed: config.armed || isBoss,
      value,
      scale,
      hullColor: isBoss ? 0x1a0a0a : config.hullColor,
      sailColor: isBoss ? 0x220000 : config.sailColor,
      enemyType: type,
      explosionRadius: config.explosionRadius ?? 0,
      phaseTimer: config.phaseDuration ?? GHOST_PHASE_INTERVAL,
      isPhased: false,
      fleeTimer: config.specialTimer ?? 0,
      formationIndex: 0,
      formationLeaderId: -1,
      isBoss,
      hitRadius: 2.0 + scale,
      fireTimer: 1 + Math.random() * 1.5, // Reduced initial cooldown
    };
  }

  // -----------------------------------------------------------------------
  //  Utility: build ghost miss map for combat
  // -----------------------------------------------------------------------

  /**
   * Build a map of enemy IDs to their miss chance, for use with the
   * combat system's ghost miss feature.
   * Only includes currently phased ghost ships.
   */
  static buildGhostMissMap(merchants: MerchantV1[]): Map<number, number> | undefined {
    let map: Map<number, number> | undefined;

    for (const m of merchants) {
      if (m.enemyType === 'ghost_ship' && m.isPhased && m.state !== 'sinking') {
        const config = ENEMY_TYPE_CONFIGS.ghost_ship;
        if (!map) map = new Map();
        map.set(m.id, config.missChanceWhilePhased ?? 0.5);
      }
    }

    return map;
  }
}
