import * as THREE from 'three';

// ---------------------------------------------------------------------------
//  Interfaces
// ---------------------------------------------------------------------------

export interface HitResult {
  targetId: number;
  damage: number;
  hitPos: THREE.Vector3;
  isAoE?: boolean;
  chainShot?: boolean;
}

interface Cannonball {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  active: boolean;
  isPlayerShot: boolean;
  damageMultiplier: number;
  isAoE: boolean;
  isSplit: boolean;
}

interface QueuedShot {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  delay: number;
  damageMultiplier: number;
  isPlayerShot: boolean;
  isAoE: boolean;
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const MAX_CANNONBALLS = 100;
const GRAVITY = 12;
const CANNONBALL_SPEED = 28;
const MAX_AGE = 4;
const DEATH_Y = -5;
const BASE_COOLDOWN = 2.5;
const BASE_DAMAGE = 25;
const STAGGER_INTERVAL = 0.08;
const BROADSIDE_COUNT = 3;
const SIDE_OFFSET = 1.5;
const FRESH_GLOW_DURATION = 0.2;

// Neptune's Wrath constants
const NEPTUNE_AOE_EVERY = 5;
const NEPTUNE_AOE_RADIUS = 8;
const NEPTUNE_AOE_DAMAGE_MULT = 0.5;

// Grapeshot constants
const GRAPESHOT_DETECT_RADIUS = 5;
const GRAPESHOT_SPLIT_COUNT = 3;
const GRAPESHOT_SPREAD = 2.5;

// Colors
const IRON_COLOR = 0x333333;
const HOT_IRON_COLOR = new THREE.Color(0xff6622);
const COLD_IRON_COLOR = new THREE.Color(IRON_COLOR);

// ---------------------------------------------------------------------------
//  CombatSystem
// ---------------------------------------------------------------------------

export class CombatSystem {
  private scene: THREE.Scene;
  private mesh: THREE.InstancedMesh;
  private balls: Cannonball[] = [];
  private shotQueue: QueuedShot[] = [];
  private dummy = new THREE.Object3D();
  private colorAttr: THREE.InstancedBufferAttribute;

  portCooldown = 0;
  starboardCooldown = 0;

  // Weather spread bonus: added to random velocity spread in fireBroadside/fireEscortShot
  weatherSpreadBonus = 0;

  // Steady hands: multiplier on spread for player shots only (1.0 = normal, <1 = tighter)
  spreadReduction = 1.0;

  // Neptune's Wrath: every Nth player shot is AoE
  neptunesWrathActive = false;
  neptunesShotCounter = 0;

  // Chain shot: flag for main.ts to enable; checkHits returns chainShot on hits
  chainShotActive = false;

  // Grapeshot: active flag; splits player cannonballs near targets they'd miss
  grapeshotActive = false;

  // Cooldown multiplier from upgrades (1.0 = normal, <1 = faster)
  cooldownMultiplier = 1.0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const geo = new THREE.SphereGeometry(0.3, 6, 4);
    const mat = new THREE.MeshToonMaterial({
      color: 0xffffff, // White base - per-instance color will tint it
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_CANNONBALLS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;

    // Per-instance color buffer for hot-glow effect
    const colors = new Float32Array(MAX_CANNONBALLS * 3);
    for (let i = 0; i < MAX_CANNONBALLS; i++) {
      colors[i * 3 + 0] = COLD_IRON_COLOR.r;
      colors[i * 3 + 1] = COLD_IRON_COLOR.g;
      colors[i * 3 + 2] = COLD_IRON_COLOR.b;
    }
    this.colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = this.colorAttr;

    scene.add(this.mesh);

    // Pre-allocate cannonball pool
    for (let i = 0; i < MAX_CANNONBALLS; i++) {
      this.balls.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        active: false,
        isPlayerShot: true,
        damageMultiplier: 1,
        isAoE: false,
        isSplit: false,
      });
    }
  }

  // -----------------------------------------------------------------------
  //  Pool management
  // -----------------------------------------------------------------------

  private getInactiveBall(): Cannonball | null {
    for (const b of this.balls) {
      if (!b.active) return b;
    }
    // Steal the oldest active ball if pool is full
    let oldest: Cannonball | null = null;
    let maxAge = -1;
    for (const b of this.balls) {
      if (b.age > maxAge) {
        maxAge = b.age;
        oldest = b;
      }
    }
    return oldest;
  }

  private spawnBall(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    damageMultiplier: number,
    isPlayerShot: boolean,
    isAoE = false,
    isSplit = false,
  ): void {
    const b = this.getInactiveBall();
    if (!b) return;
    b.pos.copy(pos);
    b.vel.copy(vel);
    b.age = 0;
    b.active = true;
    b.isPlayerShot = isPlayerShot;
    b.damageMultiplier = damageMultiplier;
    b.isAoE = isAoE;
    b.isSplit = isSplit;
  }

  // -----------------------------------------------------------------------
  //  Firing: player broadside
  // -----------------------------------------------------------------------

  get canFirePort(): boolean {
    return this.portCooldown <= 0;
  }

  get canFireStarboard(): boolean {
    return this.starboardCooldown <= 0;
  }

  fireBroadside(
    shipPos: THREE.Vector3,
    shipAngle: number,
    side: 'port' | 'starboard',
    damageMultiplier = 1,
    shipSpeed = 0,
    broadsideCount: number = BROADSIDE_COUNT,
  ): void {
    // Enforce cooldown
    if (side === 'port' && !this.canFirePort) return;
    if (side === 'starboard' && !this.canFireStarboard) return;

    // Set cooldown (modified by upgrade multiplier)
    const cd = BASE_COOLDOWN * this.cooldownMultiplier;
    if (side === 'port') this.portCooldown = cd;
    else this.starboardCooldown = cd;

    // Determine broadside direction
    // Ship forward is (sin(angle), 0, cos(angle))
    // Port  (left)  = rotate heading -90 degrees = (-cos(angle), 0, sin(angle))
    // Starboard (right) = rotate heading +90 degrees = (cos(angle), 0, -sin(angle))
    const forwardX = Math.sin(shipAngle);
    const forwardZ = Math.cos(shipAngle);

    let sideX: number, sideZ: number;
    if (side === 'port') {
      sideX = -forwardZ;
      sideZ = forwardX;
    } else {
      sideX = forwardZ;
      sideZ = -forwardX;
    }

    // Spawn offset: displace from ship center toward firing side
    const spawnBase = new THREE.Vector3(
      shipPos.x + sideX * SIDE_OFFSET,
      shipPos.y + 0.8, // Slightly above deck level
      shipPos.z + sideZ * SIDE_OFFSET,
    );

    // Calculate the center index for symmetrical cannon placement
    const centerIdx = (broadsideCount - 1) / 2;

    // Stagger shots across the broadside
    for (let i = 0; i < broadsideCount; i++) {
      // Offset each cannonball along the ship's length for visual variety
      const lengthOffset = (i - centerIdx) * 1.1;
      const shotPos = spawnBase.clone().add(
        new THREE.Vector3(forwardX * lengthOffset, 0, forwardZ * lengthOffset),
      );

      // Velocity: broadside direction + slight forward momentum from ship
      const vel = new THREE.Vector3(
        sideX * CANNONBALL_SPEED + forwardX * shipSpeed * 0.3,
        3.5 + Math.random() * 1.2, // Upward arc component for that dramatic lob
        sideZ * CANNONBALL_SPEED + forwardZ * shipSpeed * 0.3,
      );

      // Slight random spread for organic feel, reduced by steady hands
      const spread = this.spreadReduction;
      vel.x += (Math.random() - 0.5) * (1.8 + this.weatherSpreadBonus) * spread;
      vel.z += (Math.random() - 0.5) * (1.8 + this.weatherSpreadBonus) * spread;

      // Neptune's Wrath: every Nth player shot is AoE
      let shotIsAoE = false;
      if (this.neptunesWrathActive) {
        this.neptunesShotCounter++;
        if (this.neptunesShotCounter >= NEPTUNE_AOE_EVERY) {
          this.neptunesShotCounter = 0;
          shotIsAoE = true;
        }
      }

      this.shotQueue.push({
        pos: shotPos,
        vel,
        delay: i * STAGGER_INTERVAL,
        damageMultiplier,
        isPlayerShot: true,
        isAoE: shotIsAoE,
      });
    }
  }

  // -----------------------------------------------------------------------
  //  Firing: escort / AI shot
  // -----------------------------------------------------------------------

  fireEscortShot(
    shipPos: THREE.Vector3,
    shipAngle: number,
    targetPos: THREE.Vector3,
    targetVel: THREE.Vector3,
    accuracy = 0.7,
  ): void {
    const dx = targetPos.x - shipPos.x;
    const dz = targetPos.z - shipPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Predict where target will be when cannonball arrives
    const flightTime = dist / CANNONBALL_SPEED;
    const predictedX = targetPos.x + targetVel.x * flightTime;
    const predictedZ = targetPos.z + targetVel.z * flightTime;

    // Direction to predicted position
    const aimDx = predictedX - shipPos.x;
    const aimDz = predictedZ - shipPos.z;
    let aimAngle = Math.atan2(aimDx, aimDz);

    // Apply accuracy spread: lower accuracy = more random deviation
    const maxSpread = (1 - accuracy) * (Math.PI / 6); // 0.5 accuracy = ~30deg spread (+-15)
    aimAngle += (Math.random() - 0.5) * 2 * maxSpread;

    const fireX = Math.sin(aimAngle);
    const fireZ = Math.cos(aimAngle);

    // Determine which side faces the target to offset spawn position
    const forwardX = Math.sin(shipAngle);
    const forwardZ = Math.cos(shipAngle);
    const crossProduct = forwardX * aimDz - forwardZ * aimDx;
    const sideSign = crossProduct > 0 ? -1 : 1;
    const sideOffX = -forwardZ * sideSign;
    const sideOffZ = forwardX * sideSign;

    const spawnPos = new THREE.Vector3(
      shipPos.x + sideOffX * SIDE_OFFSET,
      shipPos.y + 0.8,
      shipPos.z + sideOffZ * SIDE_OFFSET,
    );

    // Calculate upward velocity for a nice arc to the target
    // Using kinematics: we want the ball to reach the target in flightTime
    // y = vy*t - 0.5*g*t^2; for y=0 at arrival: vy = 0.5*g*t
    const upwardVel = 0.5 * GRAVITY * flightTime;

    const vel = new THREE.Vector3(
      fireX * CANNONBALL_SPEED,
      Math.max(2.5, Math.min(upwardVel, 12)), // Clamp so arcs stay dramatic but reasonable
      fireZ * CANNONBALL_SPEED,
    );

    // Weather spread applied to escort/AI shots too
    vel.x += (Math.random() - 0.5) * (1.8 + this.weatherSpreadBonus);
    vel.z += (Math.random() - 0.5) * (1.8 + this.weatherSpreadBonus);

    this.spawnBall(spawnPos, vel, 1, false);
  }

  // -----------------------------------------------------------------------
  //  Cannon positions getter (for muzzle flash effects)
  // -----------------------------------------------------------------------

  getCannonPositions(
    shipPos: THREE.Vector3,
    shipAngle: number,
    side: 'port' | 'starboard',
    broadsideCount: number = BROADSIDE_COUNT,
  ): THREE.Vector3[] {
    const forwardX = Math.sin(shipAngle);
    const forwardZ = Math.cos(shipAngle);

    let sideX: number, sideZ: number;
    if (side === 'port') {
      sideX = -forwardZ;
      sideZ = forwardX;
    } else {
      sideX = forwardZ;
      sideZ = -forwardX;
    }

    const baseX = shipPos.x + sideX * SIDE_OFFSET;
    const baseY = shipPos.y + 0.8;
    const baseZ = shipPos.z + sideZ * SIDE_OFFSET;

    const centerIdx = (broadsideCount - 1) / 2;
    const positions: THREE.Vector3[] = [];

    for (let i = 0; i < broadsideCount; i++) {
      const lengthOffset = (i - centerIdx) * 1.1;
      positions.push(new THREE.Vector3(
        baseX + forwardX * lengthOffset,
        baseY,
        baseZ + forwardZ * lengthOffset,
      ));
    }

    return positions;
  }

  // -----------------------------------------------------------------------
  //  Update loop
  // -----------------------------------------------------------------------

  update(dt: number): void {
    // Decrease cooldowns
    if (this.portCooldown > 0) this.portCooldown = Math.max(0, this.portCooldown - dt);
    if (this.starboardCooldown > 0) this.starboardCooldown = Math.max(0, this.starboardCooldown - dt);

    // Process staggered shot queue
    for (let i = this.shotQueue.length - 1; i >= 0; i--) {
      const q = this.shotQueue[i];
      q.delay -= dt;
      if (q.delay <= 0) {
        this.spawnBall(q.pos, q.vel, q.damageMultiplier, q.isPlayerShot, q.isAoE);
        this.shotQueue.splice(i, 1);
      }
    }

    // Update active cannonballs
    for (const b of this.balls) {
      if (!b.active) continue;

      // Apply gravity (weighty, dramatic arc)
      b.vel.y -= GRAVITY * dt;

      // Update position
      b.pos.addScaledVector(b.vel, dt);

      // Age
      b.age += dt;

      // Deactivate if too old or below the ocean
      if (b.age > MAX_AGE || b.pos.y < DEATH_Y) {
        b.active = false;
      }
    }

    // Update instanced mesh visuals
    this.updateVisuals();
  }

  private updateVisuals(): void {
    let count = 0;

    for (const b of this.balls) {
      if (!b.active) continue;
      if (count >= MAX_CANNONBALLS) break;

      this.dummy.position.copy(b.pos);

      // Scale: slight squash-and-stretch based on velocity
      const speed = b.vel.length();
      const stretch = 1 + speed * 0.004;

      // Split grapeshot balls are smaller
      const sizeScale = b.isSplit ? 0.6 : 1.0;
      this.dummy.scale.set(sizeScale / stretch, sizeScale * stretch, sizeScale / stretch);

      // Rotate to face travel direction for that weighty feel
      if (speed > 0.5) {
        this.dummy.lookAt(
          b.pos.x + b.vel.x,
          b.pos.y + b.vel.y,
          b.pos.z + b.vel.z,
        );
      }

      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count, this.dummy.matrix);

      // Per-instance color: hot glow when freshly fired, blue-ish tint for AoE
      const glowT = Math.max(0, 1 - b.age / FRESH_GLOW_DURATION);
      let r: number, g: number, bl: number;

      if (b.isAoE) {
        // Neptune's Wrath AoE shots glow blue-green
        const aoEColor = new THREE.Color(0x22aaff);
        r = COLD_IRON_COLOR.r + (aoEColor.r - COLD_IRON_COLOR.r) * glowT;
        g = COLD_IRON_COLOR.g + (aoEColor.g - COLD_IRON_COLOR.g) * glowT;
        bl = COLD_IRON_COLOR.b + (aoEColor.b - COLD_IRON_COLOR.b) * glowT;
      } else {
        r = COLD_IRON_COLOR.r + (HOT_IRON_COLOR.r - COLD_IRON_COLOR.r) * glowT;
        g = COLD_IRON_COLOR.g + (HOT_IRON_COLOR.g - COLD_IRON_COLOR.g) * glowT;
        bl = COLD_IRON_COLOR.b + (HOT_IRON_COLOR.b - COLD_IRON_COLOR.b) * glowT;
      }

      this.colorAttr.setXYZ(count, r, g, bl);

      count++;
    }

    this.mesh.count = count;
    if (count > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.colorAttr.needsUpdate = true;
    }
  }

  // -----------------------------------------------------------------------
  //  Hit detection: targets (merchants, enemies, etc.)
  // -----------------------------------------------------------------------

  checkHits(
    targets: Array<{ pos: THREE.Vector3; hitRadius: number; id: number }>,
    ghostMissMap?: Map<number, number>,
  ): HitResult[] {
    const results: HitResult[] = [];

    for (const b of this.balls) {
      if (!b.active) continue;

      let hitTarget: { pos: THREE.Vector3; hitRadius: number; id: number } | null = null;

      for (const t of targets) {
        const dx = b.pos.x - t.pos.x;
        const dy = b.pos.y - t.pos.y;
        const dz = b.pos.z - t.pos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const rSq = t.hitRadius * t.hitRadius;

        if (distSq < rSq) {
          hitTarget = t;
          break;
        }
      }

      if (hitTarget) {
        // Ghost miss chance: if target is in the ghost miss map, roll against miss chance
        if (ghostMissMap && b.isPlayerShot) {
          const missChance = ghostMissMap.get(hitTarget.id);
          if (missChance !== undefined && Math.random() < missChance) {
            // Shot passes through the phased target -- cannonball keeps flying
            continue;
          }
        }

        const damage = BASE_DAMAGE * b.damageMultiplier;
        const hitPos = b.pos.clone();

        // Primary hit
        results.push({
          targetId: hitTarget.id,
          damage,
          hitPos,
          isAoE: false,
          chainShot: this.chainShotActive && b.isPlayerShot ? true : undefined,
        });

        // Neptune's Wrath AoE splash: damage all targets within AOE radius
        if (b.isAoE) {
          for (const t of targets) {
            if (t.id === hitTarget.id) continue; // Already hit the primary target
            const sdx = hitPos.x - t.pos.x;
            const sdy = hitPos.y - t.pos.y;
            const sdz = hitPos.z - t.pos.z;
            const sDist = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz);
            if (sDist < NEPTUNE_AOE_RADIUS) {
              results.push({
                targetId: t.id,
                damage: damage * NEPTUNE_AOE_DAMAGE_MULT,
                hitPos: hitPos.clone(),
                isAoE: true,
                chainShot: this.chainShotActive && b.isPlayerShot ? true : undefined,
              });
            }
          }
        }

        b.active = false;
        continue; // This cannonball is spent
      }

      // Grapeshot splitting: player cannonballs that are near targets but would miss
      if (
        this.grapeshotActive &&
        b.isPlayerShot &&
        !b.isSplit &&
        b.active
      ) {
        for (const t of targets) {
          const dx = b.pos.x - t.pos.x;
          const dy = b.pos.y - t.pos.y;
          const dz = b.pos.z - t.pos.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          // Within detection range but outside hit radius: would miss, so split
          if (dist > t.hitRadius && dist < GRAPESHOT_DETECT_RADIUS) {
            // Deactivate the original cannonball
            b.active = false;

            // Direction from cannonball to target
            const toTargetX = (t.pos.x - b.pos.x) / dist;
            const toTargetY = (t.pos.y - b.pos.y) / dist;
            const toTargetZ = (t.pos.z - b.pos.z) / dist;

            // Spawn split balls aimed at the target with slight spread
            const baseSpeed = b.vel.length() * 0.7;
            for (let s = 0; s < GRAPESHOT_SPLIT_COUNT; s++) {
              const spreadX = (Math.random() - 0.5) * GRAPESHOT_SPREAD;
              const spreadY = (Math.random() - 0.5) * GRAPESHOT_SPREAD * 0.5;
              const spreadZ = (Math.random() - 0.5) * GRAPESHOT_SPREAD;

              const splitVel = new THREE.Vector3(
                toTargetX * baseSpeed + spreadX,
                toTargetY * baseSpeed + spreadY,
                toTargetZ * baseSpeed + spreadZ,
              );

              this.spawnBall(
                b.pos.clone(),
                splitVel,
                b.damageMultiplier * 0.5, // Split balls deal less damage each
                true,
                b.isAoE,
                true, // isSplit = true so they don't split again
              );
            }

            break; // Original ball is spent
          }
        }
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  //  Hit detection: player
  // -----------------------------------------------------------------------

  checkPlayerHit(
    playerPos: THREE.Vector3,
    playerRadius: number,
    dodgeChance?: number,
  ): { hit: boolean; damage: number; hitPos: THREE.Vector3 } | null {
    for (const b of this.balls) {
      if (!b.active) continue;
      if (b.isPlayerShot) continue; // Only enemy cannonballs can hit the player

      const dx = b.pos.x - playerPos.x;
      const dy = b.pos.y - playerPos.y;
      const dz = b.pos.z - playerPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const rSq = playerRadius * playerRadius;

      if (distSq < rSq) {
        // Dodge chance: if set, roll against it -- dodged shots are consumed but deal no damage
        if (dodgeChance !== undefined && dodgeChance > 0 && Math.random() < dodgeChance) {
          b.active = false;
          return null;
        }

        const hitPos = b.pos.clone();
        b.active = false;
        return {
          hit: true,
          damage: BASE_DAMAGE * b.damageMultiplier,
          hitPos,
        };
      }
    }

    return null;
  }

  // -----------------------------------------------------------------------
  //  Fire Ship AoE explosion
  // -----------------------------------------------------------------------

  /**
   * Check for fire ship AoE damage. When a fire ship explodes, this returns
   * HitResults for all targets within the explosion radius.
   * Damage = 40 base * distance falloff (1.0 at center, 0.0 at edge).
   */
  checkFireShipAoE(
    explosionPos: THREE.Vector3,
    radius: number,
    targets: Array<{ pos: THREE.Vector3; id: number }>,
  ): HitResult[] {
    const results: HitResult[] = [];
    const FIRE_SHIP_BASE_DAMAGE = 40;

    for (const t of targets) {
      const dx = explosionPos.x - t.pos.x;
      const dy = explosionPos.y - t.pos.y;
      const dz = explosionPos.z - t.pos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < radius) {
        const falloff = 1 - dist / radius;
        const damage = FIRE_SHIP_BASE_DAMAGE * falloff;
        results.push({
          targetId: t.id,
          damage,
          hitPos: explosionPos.clone(),
          isAoE: true,
        });
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  //  Utility getters
  // -----------------------------------------------------------------------

  /** Number of currently active cannonballs in flight */
  get activeCount(): number {
    let n = 0;
    for (const b of this.balls) {
      if (b.active) n++;
    }
    return n;
  }

  /** Cleanup: remove mesh from scene */
  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
