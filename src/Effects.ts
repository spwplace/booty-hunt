import * as THREE from 'three';

// ---------------------------------------------------------------------------
//  Gold coin burst on ship capture
// ---------------------------------------------------------------------------

interface CoinParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  life: number;
}

export class GoldBurst {
  private mesh: THREE.InstancedMesh;
  private particles: CoinParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 400;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.18, 0.06, 0.18);
    const mat = new THREE.MeshToonMaterial({ color: 0xffd700 });
    this.mesh = new THREE.InstancedMesh(geo, mat, GoldBurst.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, count = 35) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        pos: origin.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 1 + 1,
          (Math.random() - 0.5) * 2,
        )),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          Math.random() * 12 + 6,
          (Math.random() - 0.5) * 12,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 12,
          Math.random() * 12,
          Math.random() * 12,
        ),
        life: 0.8 + Math.random() * 0.5,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= 20 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = Math.max(0, p.life);
      const elapsed = (1.3 - t); // approximate elapsed time
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        p.rotSpeed.x * elapsed,
        p.rotSpeed.y * elapsed,
        p.rotSpeed.z * elapsed,
      );
      this.dummy.scale.setScalar(Math.min(1, t * 2.5));
      this.dummy.updateMatrix();
      if (alive < GoldBurst.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Water splash on capture
// ---------------------------------------------------------------------------

interface SplashDrop {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class WaterSplash {
  private mesh: THREE.InstancedMesh;
  private drops: SplashDrop[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 200;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.12, 4, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x88bbdd,
      transparent: true,
      opacity: 0.6,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, WaterSplash.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, count = 25) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const outSpeed = 3 + Math.random() * 6;
      this.drops.push({
        pos: origin.clone().add(new THREE.Vector3(0, 0.2, 0)),
        vel: new THREE.Vector3(
          Math.cos(angle) * outSpeed,
          Math.random() * 8 + 3,
          Math.sin(angle) * outSpeed,
        ),
        life: 0.6 + Math.random() * 0.4,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vel.y -= 15 * dt;
      d.pos.addScaledVector(d.vel, dt);
      d.life -= dt;
      if (d.life <= 0) {
        this.drops.splice(i, 1);
        continue;
      }
      this.dummy.position.copy(d.pos);
      this.dummy.scale.setScalar(d.life * 1.8);
      this.dummy.updateMatrix();
      if (alive < WaterSplash.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Screen Shake
// ---------------------------------------------------------------------------

export class ScreenShake {
  private intensity = 0;
  offset = new THREE.Vector3();

  trigger(strength = 1) {
    this.intensity = Math.max(this.intensity, strength);
  }

  update(dt: number) {
    if (this.intensity > 0.002) {
      this.offset.set(
        (Math.random() - 0.5) * this.intensity * 1.5,
        (Math.random() - 0.5) * this.intensity * 0.8,
        (Math.random() - 0.5) * this.intensity * 1.5,
      );
      this.intensity *= Math.exp(-8 * dt);
    } else {
      this.offset.set(0, 0, 0);
      this.intensity = 0;
    }
  }

  reset(): void {
    this.intensity = 0;
    this.offset.set(0, 0, 0);
  }
}

// ---------------------------------------------------------------------------
//  Wake / foam trail behind a ship
// ---------------------------------------------------------------------------

interface FoamDot {
  pos: THREE.Vector3;
  life: number;
}

export class WakeTrail {
  private mesh: THREE.InstancedMesh;
  private dots: FoamDot[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 300;
  private spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.25, 4, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xddeeff,
      transparent: true,
      opacity: 0.45,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, WakeTrail.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  spawn(pos: THREE.Vector3, speed: number, dt: number) {
    this.spawnTimer += dt;
    const interval = Math.max(0.015, 0.1 - speed * 0.006);
    if (this.spawnTimer < interval || speed < 0.8) return;
    this.spawnTimer = 0;

    const count = speed > 8 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      this.dots.push({
        pos: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.0,
          0,
          (Math.random() - 0.5) * 1.0,
        )),
        life: 1.0,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.life -= dt * 0.55;
      if (d.life <= 0) {
        this.dots.splice(i, 1);
        continue;
      }
      this.dummy.position.copy(d.pos);
      const s = d.life * 1.8;
      this.dummy.scale.set(s, 0.12, s);
      this.dummy.updateMatrix();
      if (alive < WakeTrail.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Cannon smoke puffs
// ---------------------------------------------------------------------------

interface SmokePuff {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
}

export class CannonSmoke {
  private mesh: THREE.InstancedMesh;
  private particles: SmokePuff[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 150;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.4, 5, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.5,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, CannonSmoke.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, direction: THREE.Vector3, count = 12) {
    for (let i = 0; i < count; i++) {
      const speed = 3 + Math.random() * 3;
      const vel = direction.clone().multiplyScalar(speed).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 0.8 + 0.3,
          (Math.random() - 0.5) * 2,
        ),
      );
      const maxLife = 0.8 + Math.random() * 0.7;
      this.particles.push({
        pos: origin.clone(),
        vel,
        life: maxLife,
        maxLife,
        scale: 0.5,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y += 0.5 * dt; // slight upward drift
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.maxLife; // 0 -> 1 over lifetime
      p.scale = 0.5 + t * 2.0; // grows from 0.5 to 2.5
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(p.scale);
      this.dummy.updateMatrix();
      if (alive < CannonSmoke.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Explosion debris burst on cannon hit
// ---------------------------------------------------------------------------

interface Debris {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ExplosionEffect {
  private mesh: THREE.InstancedMesh;
  private particles: Debris[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 200;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6622,
      transparent: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, ExplosionEffect.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, count = 25) {
    // Main burst debris
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 8 + Math.random() * 12;
      const maxLife = 0.3 + Math.random() * 0.5;
      this.particles.push({
        pos: origin.clone(),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed * 0.8 + 2,
          Math.sin(phi) * Math.sin(theta) * speed,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 15,
          Math.random() * 15,
          Math.random() * 15,
        ),
        life: maxLife,
        maxLife,
      });
    }

    // Burning embers (slower, longer life)
    const emberCount = Math.floor(count * 0.4);
    for (let i = 0; i < emberCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 2 + Math.random() * 5;
      const maxLife = 0.6 + Math.random() * 0.5;
      this.particles.push({
        pos: origin.clone(),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.random() * 4 + 1,
          Math.sin(phi) * Math.sin(theta) * speed,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 8,
          Math.random() * 8,
          Math.random() * 8,
        ),
        life: maxLife,
        maxLife,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= 15 * dt; // gravity
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.maxLife; // 0 -> 1 over lifetime
      const s = Math.max(0.1, 1 - t); // scale down over life
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        p.rotSpeed.x * t * p.maxLife,
        p.rotSpeed.y * t * p.maxLife,
        p.rotSpeed.z * t * p.maxLife,
      );
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      if (alive < ExplosionEffect.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Rain system for stormy weather
// ---------------------------------------------------------------------------

interface RainDrop {
  pos: THREE.Vector3;
  speed: number;
  windDrift: number;
}

export class RainSystem {
  private mesh: THREE.InstancedMesh;
  private drops: RainDrop[] = [];
  private dummy = new THREE.Object3D();
  private maxDrops: number;
  active = false;

  private static AREA_SIZE = 50;
  private static HALF_AREA = 25;

  constructor(scene: THREE.Scene, playerPos: THREE.Vector3) {
    const isMobile = navigator.maxTouchPoints > 0;
    this.maxDrops = isMobile ? 200 : 500;

    const geo = new THREE.CylinderGeometry(0.015, 0.015, 0.6, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xaabbcc,
      transparent: true,
      opacity: 0.3,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.maxDrops);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Pre-populate drops
    for (let i = 0; i < this.maxDrops; i++) {
      this.drops.push({
        pos: new THREE.Vector3(
          playerPos.x + (Math.random() - 0.5) * RainSystem.AREA_SIZE,
          Math.random() * 15 + 25,
          playerPos.z + (Math.random() - 0.5) * RainSystem.AREA_SIZE,
        ),
        speed: 25 + Math.random() * 10,
        windDrift: (Math.random() - 0.5) * 3,
      });
    }
  }

  update(dt: number, playerPos: THREE.Vector3) {
    if (!this.active) {
      this.mesh.count = 0;
      return;
    }

    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];

      // Fall and drift
      d.pos.y -= d.speed * dt;
      d.pos.x += d.windDrift * dt;

      // Check if drop needs respawning
      const dx = d.pos.x - playerPos.x;
      const dz = d.pos.z - playerPos.z;
      const outOfArea =
        Math.abs(dx) > RainSystem.HALF_AREA ||
        Math.abs(dz) > RainSystem.HALF_AREA;

      if (d.pos.y < -2 || outOfArea) {
        d.pos.set(
          playerPos.x + (Math.random() - 0.5) * RainSystem.AREA_SIZE,
          25 + Math.random() * 15,
          playerPos.z + (Math.random() - 0.5) * RainSystem.AREA_SIZE,
        );
        d.speed = 25 + Math.random() * 10;
        d.windDrift = (Math.random() - 0.5) * 3;
      }

      // Align drop to fall direction
      this.dummy.position.copy(d.pos);
      // Tilt slightly in wind direction
      const windAngle = Math.atan2(d.windDrift, d.speed);
      this.dummy.rotation.set(0, 0, windAngle);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.count = this.drops.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Muzzle flash on cannon fire
// ---------------------------------------------------------------------------

interface FlashParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class MuzzleFlash {
  private mesh: THREE.InstancedMesh;
  private particles: FlashParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 30;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.15, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, MuzzleFlash.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, direction: THREE.Vector3) {
    const count = 6 + Math.floor(Math.random() * 3); // 6-8 particles
    for (let i = 0; i < count; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 4,
      );
      const vel = direction.clone().multiplyScalar(6 + Math.random() * 4).add(spread);
      this.particles.push({
        pos: origin.clone(),
        vel,
        life: 0.08,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / 0.08; // 1 -> 0 over lifetime
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(t * 1.5);
      this.dummy.updateMatrix();
      if (alive < MuzzleFlash.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Cannonball smoke trail
// ---------------------------------------------------------------------------

interface TrailParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class CannonballTrail {
  private mesh: THREE.InstancedMesh;
  private particles: TrailParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 200;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.06, 4, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.6,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, CannonballTrail.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(pos: THREE.Vector3) {
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        pos: pos.clone(),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.3 + 0.1,
          (Math.random() - 0.5) * 0.5,
        ),
        life: 0.3,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / 0.3; // 1 -> 0 over lifetime
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(t * 0.8);
      this.dummy.updateMatrix();
      if (alive < CannonballTrail.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Ship breakup debris on destruction
// ---------------------------------------------------------------------------

interface BreakupPiece {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ShipBreakup {
  private mesh: THREE.InstancedMesh;
  private particles: BreakupPiece[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 100;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(
      0.3 + Math.random() * 0.3,
      0.15 + Math.random() * 0.1,
      0.5 + Math.random() * 0.4,
    );
    const mat = new THREE.MeshToonMaterial({ color: 0x6b3a2a });
    this.mesh = new THREE.InstancedMesh(geo, mat, ShipBreakup.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3) {
    const count = 8 + Math.floor(Math.random() * 5); // 8-12 pieces
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      const maxLife = 3.0;
      this.particles.push({
        pos: origin.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 0.5,
          (Math.random() - 0.5) * 2,
        )),
        vel: new THREE.Vector3(
          Math.cos(theta) * speed,
          Math.random() * 4 + 2,
          Math.sin(theta) * speed,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 5,
          Math.random() * 5,
          Math.random() * 5,
        ),
        life: maxLife,
        maxLife,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= 8 * dt; // gravity
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      const elapsed = p.maxLife - p.life;

      // Float briefly: clamp above -0.5 for first 1.5s
      if (elapsed < 1.5) {
        if (p.pos.y < -0.5) {
          p.pos.y = -0.5;
          p.vel.y = Math.max(p.vel.y, 0);
        }
      } else {
        // Gradually submerge over remaining 1.5s
        const sinkT = (elapsed - 1.5) / 1.5;
        if (p.pos.y > -0.5) {
          p.vel.y -= 2 * dt;
        }
        // Allow sinking below -0.5
        const maxSink = -0.5 - sinkT * 3;
        if (p.pos.y < maxSink) p.pos.y = maxSink;
      }

      const t = 1 - p.life / p.maxLife; // 0 -> 1 over lifetime
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        p.rotSpeed.x * t * p.maxLife,
        p.rotSpeed.y * t * p.maxLife,
        p.rotSpeed.z * t * p.maxLife,
      );
      // Scale down in last 0.5s
      const fadeScale = p.life < 0.5 ? p.life / 0.5 : 1;
      this.dummy.scale.setScalar(fadeScale);
      this.dummy.updateMatrix();
      if (alive < ShipBreakup.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Speed lines when moving fast
// ---------------------------------------------------------------------------

interface SpeedLine {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class SpeedLines {
  private mesh: THREE.InstancedMesh;
  private particles: SpeedLine[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 60;
  private spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.03, 0.03, 1.5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, SpeedLines.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(dt: number, playerPos: THREE.Vector3, playerAngle: number, playerSpeed: number) {
    // Only active above speed 8
    if (playerSpeed <= 8) {
      // Drain existing particles
      let alive = 0;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        this.particles[i].life -= dt;
        if (this.particles[i].life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        const p = this.particles[i];
        p.pos.addScaledVector(p.vel, dt);
        const t = p.life / 0.4;
        this.dummy.position.copy(p.pos);
        this.dummy.rotation.set(0, playerAngle, 0);
        this.dummy.scale.set(1, 1, t);
        this.dummy.updateMatrix();
        if (alive < SpeedLines.MAX) {
          this.mesh.setMatrixAt(alive, this.dummy.matrix);
          alive++;
        }
      }
      this.mesh.count = alive;
      if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
      return;
    } else {
      // Spawn density scales with speed
      const spawnRate = 0.02 + (1.0 / (playerSpeed - 6)); // more lines at higher speed
      this.spawnTimer += dt;
      while (this.spawnTimer >= spawnRate && this.particles.length < SpeedLines.MAX) {
        this.spawnTimer -= spawnRate;

        // Spawn in cone ahead of player
        const forwardX = -Math.sin(playerAngle);
        const forwardZ = -Math.cos(playerAngle);
        const coneSpread = 0.4;
        const lateralAngle = (Math.random() - 0.5) * coneSpread;
        const cosA = Math.cos(lateralAngle);
        const sinA = Math.sin(lateralAngle);
        const dirX = forwardX * cosA - forwardZ * sinA;
        const dirZ = forwardX * sinA + forwardZ * cosA;

        const dist = 8 + Math.random() * 15;
        const spawnPos = new THREE.Vector3(
          playerPos.x + dirX * dist + (Math.random() - 0.5) * 4,
          playerPos.y + 1 + (Math.random() - 0.5) * 3,
          playerPos.z + dirZ * dist + (Math.random() - 0.5) * 4,
        );

        // Streak backward relative to player
        const streakSpeed = playerSpeed * 1.5;
        this.particles.push({
          pos: spawnPos,
          vel: new THREE.Vector3(
            -forwardX * streakSpeed,
            0,
            -forwardZ * streakSpeed,
          ),
          life: 0.4,
        });
      }
    }

    // Update all particles
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / 0.4; // 1 -> 0 over lifetime
      this.dummy.position.copy(p.pos);
      // Align line with velocity direction
      this.dummy.rotation.set(0, playerAngle, 0);
      this.dummy.scale.set(1, 1, t);
      this.dummy.updateMatrix();
      if (alive < SpeedLines.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Fire effect for burning ships
// ---------------------------------------------------------------------------

interface FireParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class FireEffect {
  private mesh: THREE.InstancedMesh;
  private particles: FireParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 80;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.2, 5, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.8,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, FireEffect.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, count = 8) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        pos: origin.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          Math.random() * 0.5,
          (Math.random() - 0.5) * 1.5,
        )),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          2 + Math.random() * 3,
          (Math.random() - 0.5) * 2,
        ),
        life: 0.6,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.pos.addScaledVector(p.vel, dt);
      // Add random flicker spread
      p.vel.x += (Math.random() - 0.5) * 8 * dt;
      p.vel.z += (Math.random() - 0.5) * 8 * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / 0.6; // 1 -> 0 over lifetime
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(t * 1.2);
      this.dummy.updateMatrix();
      if (alive < FireEffect.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Floating debris after ship destruction
// ---------------------------------------------------------------------------

interface FloatingPiece {
  pos: THREE.Vector3;
  heading: number;
  driftSpeed: number;
  bobPhase: number;
  bobSpeed: number;
  life: number;
  rotY: number;
  rotSpeed: number;
}

export class FloatingDebris {
  private mesh: THREE.InstancedMesh;
  private pieces: FloatingPiece[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 50;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.3, 0.2, 0.8);
    const mat = new THREE.MeshToonMaterial({ color: 0x8b6b4a });
    this.mesh = new THREE.InstancedMesh(geo, mat, FloatingDebris.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3) {
    const count = 4 + Math.floor(Math.random() * 3); // 4-6 pieces
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const dist = 1 + Math.random() * 3;
      this.pieces.push({
        pos: new THREE.Vector3(
          origin.x + Math.cos(theta) * dist,
          0,
          origin.z + Math.sin(theta) * dist,
        ),
        heading: Math.random() * Math.PI * 2,
        driftSpeed: 0.3 + Math.random() * 0.7,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 1.5 + Math.random() * 1.5,
        life: 25,
        rotY: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.5,
      });
    }
  }

  shouldCull(piece: FloatingPiece, playerPos: THREE.Vector3): boolean {
    const dx = piece.pos.x - playerPos.x;
    const dz = piece.pos.z - playerPos.z;
    return dx * dx + dz * dz > 150 * 150;
  }

  update(dt: number, getWaveHeight: (x: number, z: number) => number, playerPos: THREE.Vector3) {
    let alive = 0;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life -= dt;
      if (p.life <= 0 || this.shouldCull(p, playerPos)) {
        this.pieces.splice(i, 1);
        continue;
      }

      // Drift with current heading
      p.pos.x += Math.cos(p.heading) * p.driftSpeed * dt;
      p.pos.z += Math.sin(p.heading) * p.driftSpeed * dt;

      // Bob on ocean surface
      p.bobPhase += p.bobSpeed * dt;
      const waveY = getWaveHeight(p.pos.x, p.pos.z);
      p.pos.y = waveY + Math.sin(p.bobPhase) * 0.1;

      // Slow rotation
      p.rotY += p.rotSpeed * dt;

      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        Math.sin(p.bobPhase * 0.7) * 0.15, // slight roll
        p.rotY,
        Math.sin(p.bobPhase * 1.1) * 0.1,  // slight pitch
      );

      // Fade out in last 3s
      const fadeScale = p.life < 3 ? p.life / 3 : 1;
      this.dummy.scale.setScalar(fadeScale);
      this.dummy.updateMatrix();
      if (alive < FloatingDebris.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Kraken tentacle effect
// ---------------------------------------------------------------------------

interface TentacleData {
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.Mesh;
  controlPoints: THREE.Vector3[];
  basePositions: THREE.Vector3[];
  sinkTimer: number;       // -1 = alive, 0+ = sinking
  destroyed: boolean;
}

export class KrakenTentacle {
  private tentacles: TentacleData[] = [];
  private scene: THREE.Scene;
  private active = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(positions: THREE.Vector3[]) {
    this.dispose();
    this.active = true;

    const count = Math.min(positions.length, 4);
    for (let t = 0; t < count; t++) {
      const base = positions[t];
      const controlPoints: THREE.Vector3[] = [];
      const basePositions: THREE.Vector3[] = [];

      // 6 control points from base upward, with slight random offsets
      for (let p = 0; p < 6; p++) {
        const frac = p / 5;
        const pt = new THREE.Vector3(
          base.x + (Math.random() - 0.5) * 0.5,
          base.y + frac * 8,
          base.z + (Math.random() - 0.5) * 0.5,
        );
        controlPoints.push(pt);
        basePositions.push(pt.clone());
      }

      const curve = new THREE.CatmullRomCurve3(controlPoints);

      // Radii taper from 1.0 (base) to 0.15 (tip) across tube segments
      const tubularSegments = 20;
      const radialSegments = 8;
      const radiusFunc = (tt: number) => {
        return 1.0 * (1 - tt) + 0.15 * tt;
      };

      // Build custom tube with tapering
      const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, 1.0, radialSegments, false);
      // Apply tapering to existing geometry
      const posAttr = tubeGeo.getAttribute('position');
      const norAttr = tubeGeo.getAttribute('normal');
      for (let i = 0; i <= tubularSegments; i++) {
        const tt = i / tubularSegments;
        const r = radiusFunc(tt);
        const centerOnCurve = curve.getPointAt(tt);
        for (let j = 0; j <= radialSegments; j++) {
          const idx = i * (radialSegments + 1) + j;
          const px = posAttr.getX(idx);
          const py = posAttr.getY(idx);
          const pz = posAttr.getZ(idx);
          // Scale displacement from center by radius ratio
          const dx = px - centerOnCurve.x;
          const dy = py - centerOnCurve.y;
          const dz = pz - centerOnCurve.z;
          const currentR = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (currentR > 0.001) {
            const scale = r / currentR;
            posAttr.setXYZ(idx,
              centerOnCurve.x + dx * scale,
              centerOnCurve.y + dy * scale,
              centerOnCurve.z + dz * scale,
            );
            norAttr.setXYZ(idx, dx / currentR, dy / currentR, dz / currentR);
          }
        }
      }
      posAttr.needsUpdate = true;
      norAttr.needsUpdate = true;

      const mat = new THREE.MeshToonMaterial({ color: 0x2a4a2a });
      const mesh = new THREE.Mesh(tubeGeo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      this.tentacles.push({
        curve,
        mesh,
        controlPoints,
        basePositions,
        sinkTimer: -1,
        destroyed: false,
      });
    }
  }

  update(dt: number, time: number) {
    let allDestroyed = true;
    for (const t of this.tentacles) {
      if (t.destroyed) continue;
      allDestroyed = false;

      // Sinking animation
      if (t.sinkTimer >= 0) {
        t.sinkTimer += dt;
        const sinkOffset = t.sinkTimer * 8; // sink speed
        for (let p = 0; p < t.controlPoints.length; p++) {
          t.controlPoints[p].y = t.basePositions[p].y - sinkOffset;
        }
        if (t.sinkTimer >= 1.0) {
          t.destroyed = true;
          this.scene.remove(t.mesh);
          t.mesh.geometry.dispose();
          (t.mesh.material as THREE.Material).dispose();
          continue;
        }
      } else {
        // Sinusoidal sway animation
        for (let p = 0; p < t.controlPoints.length; p++) {
          const bp = t.basePositions[p];
          const swayX = Math.sin(time * 1.5 + p * 0.8) * 0.6 * (p / 5);
          const swayZ = Math.cos(time * 1.2 + p * 1.0) * 0.4 * (p / 5);
          t.controlPoints[p].x = bp.x + swayX;
          t.controlPoints[p].z = bp.z + swayZ;
          t.controlPoints[p].y = bp.y;
        }
      }

      // Rebuild tube geometry from updated curve
      const newCurve = new THREE.CatmullRomCurve3(t.controlPoints);
      const tubularSegments = 20;
      const radialSegments = 8;
      const posAttr = t.mesh.geometry.getAttribute('position');
      for (let i = 0; i <= tubularSegments; i++) {
        const tt = i / tubularSegments;
        const r = 1.0 * (1 - tt) + 0.15 * tt;
        const center = newCurve.getPointAt(tt);
        const tangent = newCurve.getTangentAt(tt).normalize();
        // Build a frame around the tangent
        const up = Math.abs(tangent.y) < 0.99
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0);
        const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

        for (let j = 0; j <= radialSegments; j++) {
          const angle = (j / radialSegments) * Math.PI * 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const idx = i * (radialSegments + 1) + j;
          posAttr.setXYZ(idx,
            center.x + r * (cos * normal.x + sin * binormal.x),
            center.y + r * (cos * normal.y + sin * binormal.y),
            center.z + r * (cos * normal.z + sin * binormal.z),
          );
        }
      }
      posAttr.needsUpdate = true;
      t.curve.points = t.controlPoints;
    }

    if (allDestroyed && this.tentacles.length > 0) {
      this.active = false;
    }
  }

  destroyTentacle(index: number) {
    if (index >= 0 && index < this.tentacles.length && this.tentacles[index].sinkTimer < 0) {
      this.tentacles[index].sinkTimer = 0;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  dispose() {
    for (const t of this.tentacles) {
      if (!t.destroyed) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        (t.mesh.material as THREE.Material).dispose();
      }
    }
    this.tentacles = [];
    this.active = false;
  }
}

// ---------------------------------------------------------------------------
//  Whirlpool effect
// ---------------------------------------------------------------------------

interface WhirlpoolParticle {
  angle: number;
  radius: number;
  speed: number;
  y: number;
}

export class WhirlpoolEffect {
  private torus: THREE.Mesh;
  private particleMesh: THREE.InstancedMesh;
  private particles: WhirlpoolParticle[] = [];
  private dummy = new THREE.Object3D();
  private center = new THREE.Vector3();
  private scene: THREE.Scene;
  private static PARTICLE_COUNT = 50;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Central torus ring
    const torusGeo = new THREE.TorusGeometry(5, 0.5, 8, 24);
    const torusMat = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.6,
    });
    this.torus = new THREE.Mesh(torusGeo, torusMat);
    this.torus.rotation.x = Math.PI / 2; // lay flat
    this.torus.visible = false;
    scene.add(this.torus);

    // Orbiting particles
    const sphereGeo = new THREE.SphereGeometry(0.15, 4, 3);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.6,
    });
    this.particleMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, WhirlpoolEffect.PARTICLE_COUNT);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    scene.add(this.particleMesh);

    // Initialize particles in spiral pattern
    for (let i = 0; i < WhirlpoolEffect.PARTICLE_COUNT; i++) {
      this.particles.push({
        angle: (i / WhirlpoolEffect.PARTICLE_COUNT) * Math.PI * 2 * 3, // 3 rotations spread
        radius: 1 + (i / WhirlpoolEffect.PARTICLE_COUNT) * 6,
        speed: 1.5 + Math.random() * 1.0,
        y: (Math.random() - 0.5) * 0.5,
      });
    }
  }

  spawn(center: THREE.Vector3) {
    this.center.copy(center);
    this.torus.position.copy(center);
    this.torus.position.y = center.y - 0.3;
    this.torus.visible = true;
    this.particleMesh.count = WhirlpoolEffect.PARTICLE_COUNT;

    // Reset particles
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].angle = (i / WhirlpoolEffect.PARTICLE_COUNT) * Math.PI * 2 * 3;
      this.particles[i].radius = 1 + (i / WhirlpoolEffect.PARTICLE_COUNT) * 6;
    }
  }

  update(dt: number, time: number) {
    if (!this.torus.visible) return;

    // Rotate torus
    this.torus.rotation.z = time * 0.8;

    // Update orbiting particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Rotation speed increases toward center
      const speedMul = 1 + (7 - p.radius) * 0.4;
      p.angle += p.speed * speedMul * dt;

      // Slowly spiral inward
      p.radius -= dt * 0.3;
      if (p.radius < 0.5) {
        // Respawn at outer edge
        p.radius = 6 + Math.random() * 1;
        p.angle = Math.random() * Math.PI * 2;
      }

      this.dummy.position.set(
        this.center.x + Math.cos(p.angle) * p.radius,
        this.center.y + p.y + Math.sin(time * 2 + i) * 0.15,
        this.center.z + Math.sin(p.angle) * p.radius,
      );
      const s = 0.3 + (p.radius / 7) * 0.7;
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.torus.visible = false;
    this.particleMesh.count = 0;
    this.scene.remove(this.torus);
    this.scene.remove(this.particleMesh);
    this.torus.geometry.dispose();
    (this.torus.material as THREE.Material).dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------
//  Sea serpent effect
// ---------------------------------------------------------------------------

interface SerpentSegment {
  mesh: THREE.Mesh;
  phase: number;
}

export class SeaSerpentEffect {
  private segments: SerpentSegment[] = [];
  private scene: THREE.Scene;
  private center = new THREE.Vector3();
  private radius = 12;
  private active = false;
  private static SEGMENT_COUNT = 8;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(centerPos: THREE.Vector3) {
    this.dispose();
    this.center.copy(centerPos);
    this.active = true;

    for (let i = 0; i < SeaSerpentEffect.SEGMENT_COUNT; i++) {
      const segRadius = 0.8 * (1 - i * 0.06); // slightly smaller toward tail
      const geo = new THREE.SphereGeometry(segRadius, 6, 5);
      const mat = new THREE.MeshToonMaterial({ color: 0x1a3a1a });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.segments.push({
        mesh,
        phase: i * 0.3,
      });
    }
  }

  update(dt: number, time: number, playerPos: THREE.Vector3): number {
    if (!this.active) return 0;

    let damage = 0;

    // Match the lemniscate formula in Events.ts (sea serpent update)
    const period = 8; // seconds for a full figure-8 (must match Events.ts)
    const t = time * 0.8; // base time multiplier for animation speed

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const segPhase = t + seg.phase;
      const phase = (segPhase / period) * Math.PI * 2;

      // Lemniscate of Bernoulli - must match Events.ts exactly
      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);
      const denom = 1 + sinP * sinP;
      const x = this.center.x + (this.radius * cosP) / denom;
      const z = this.center.z + (this.radius * sinP * cosP) / denom;
      // Undulate vertically
      const y = this.center.y + Math.sin(phase * 2 + i * 0.5) * 1.5;

      seg.mesh.position.set(x, y, z);

      // Check collision with player
      const dx = seg.mesh.position.x - playerPos.x;
      const dy = seg.mesh.position.y - playerPos.y;
      const dz = seg.mesh.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 3) {
        damage += 10 * dt;
      }
    }

    return damage;
  }

  dispose() {
    for (const seg of this.segments) {
      this.scene.remove(seg.mesh);
      seg.mesh.geometry.dispose();
      (seg.mesh.material as THREE.Material).dispose();
    }
    this.segments = [];
    this.active = false;
  }
}

// ---------------------------------------------------------------------------
//  Ghost ship visual effect (static utility)
// ---------------------------------------------------------------------------

export class GhostShipEffect {
  static applyGhostEffect(shipMesh: THREE.Group, phased: boolean) {
    const targetOpacity = phased ? 0.3 : 0.8;
    const emissiveIntensity = phased ? 0.6 : 0.3;

    shipMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material;

        // Skip shader materials (sails, flags)
        if (mat instanceof THREE.ShaderMaterial) return;

        if (mat instanceof THREE.MeshToonMaterial || mat instanceof THREE.MeshBasicMaterial) {
          mat.transparent = true;
          mat.opacity = targetOpacity;

          if (mat instanceof THREE.MeshToonMaterial) {
            // Pulsing emissive glow
            const emissiveColor = phased ? 0x334466 : 0x112233;
            mat.emissive = new THREE.Color(emissiveColor);
            mat.emissiveIntensity = emissiveIntensity;
          }

          mat.needsUpdate = true;
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
//  Fire ship explosion (larger version of ExplosionEffect)
// ---------------------------------------------------------------------------

interface FireExplosionParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  life: number;
  maxLife: number;
  isRing: boolean;
}

export class FireShipExplosion {
  private mesh: THREE.InstancedMesh;
  private particles: FireExplosionParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 400;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, FireShipExplosion.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, radius: number) {
    // Main burst: 300 particles
    for (let i = 0; i < 300; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 15 + Math.random() * 10; // 15-25
      const maxLife = 0.8 + Math.random() * 0.7; // up to 1.5s
      this.particles.push({
        pos: origin.clone(),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed * 0.6 + 3,
          Math.sin(phi) * Math.sin(theta) * speed,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 15,
          Math.random() * 15,
          Math.random() * 15,
        ),
        life: maxLife,
        maxLife,
        isRing: false,
      });
    }

    // Ring of 20 expanding particles at ground level
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const speed = 8 + Math.random() * 4;
      this.particles.push({
        pos: origin.clone(),
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          0.2,
          Math.sin(angle) * speed,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 10,
          Math.random() * 10,
          Math.random() * 10,
        ),
        life: 1.5,
        maxLife: 1.5,
        isRing: true,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p.isRing) {
        p.vel.y -= 12 * dt; // gravity
      }
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      const s = p.isRing
        ? Math.max(0.2, 1.5 - t) // ring particles stay larger
        : Math.max(0.1, 1 - t);
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        p.rotSpeed.x * t * p.maxLife,
        p.rotSpeed.y * t * p.maxLife,
        p.rotSpeed.z * t * p.maxLife,
      );
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      if (alive < FireShipExplosion.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Treasure sparkle effect at dig sites
// ---------------------------------------------------------------------------

interface SparkleParticle {
  pos: THREE.Vector3;
  baseY: number;
  phase: number;
  bobSpeed: number;
  driftX: number;
  driftZ: number;
}

export class TreasureSparkle {
  private mesh: THREE.InstancedMesh;
  private particles: SparkleParticle[] = [];
  private dummy = new THREE.Object3D();
  private active = false;
  private static MAX = 40;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.mesh = new THREE.InstancedMesh(geo, mat, TreasureSparkle.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  spawn(pos: THREE.Vector3) {
    this.clear();
    this.active = true;

    for (let i = 0; i < TreasureSparkle.MAX; i++) {
      this.particles.push({
        pos: new THREE.Vector3(
          pos.x + (Math.random() - 0.5) * 3,
          pos.y + Math.random() * 2,
          pos.z + (Math.random() - 0.5) * 3,
        ),
        baseY: pos.y + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        bobSpeed: 1.5 + Math.random() * 1.5,
        driftX: (Math.random() - 0.5) * 0.3,
        driftZ: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  update(dt: number, time: number) {
    if (!this.active) return;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Bob up and down
      p.pos.y = p.baseY + Math.sin(time * p.bobSpeed + p.phase) * 0.4;

      // Slight horizontal drift
      p.pos.x += p.driftX * dt;
      p.pos.z += p.driftZ * dt;

      this.dummy.position.copy(p.pos);
      // Rotate for sparkle effect
      this.dummy.rotation.set(time * 2 + p.phase, time * 3 + p.phase, 0);
      this.dummy.scale.setScalar(0.8 + Math.sin(time * 4 + p.phase) * 0.3);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = this.particles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.particles = [];
    this.mesh.count = 0;
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}

// ---------------------------------------------------------------------------
//  Victory confetti
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  Phoenix burst (fire-colored particles for phoenix sails revive)
// ---------------------------------------------------------------------------

interface PhoenixParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class PhoenixBurst {
  private mesh: THREE.InstancedMesh;
  private particles: PhoenixParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 120;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.18, 5, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.9,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, PhoenixBurst.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;

    // Per-instance colors: orange/red/yellow gradient
    const colors = new Float32Array(PhoenixBurst.MAX * 3);
    const fireColors = [
      new THREE.Color(0xff4400), // red-orange
      new THREE.Color(0xff8800), // orange
      new THREE.Color(0xffcc00), // yellow
      new THREE.Color(0xff6600), // deep orange
    ];
    for (let i = 0; i < PhoenixBurst.MAX; i++) {
      const c = fireColors[i % fireColors.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, count = 40) {
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.6; // bias upward
      const speed = 6 + Math.random() * 8;
      this.particles.push({
        pos: origin.clone(),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed + 3, // upward bias
          Math.sin(phi) * Math.sin(theta) * speed,
        ),
        life: 0.5 + Math.random() * 0.3,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= 10 * dt; // gravity
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / 0.8; // normalized lifetime
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(Math.min(1, t * 2));
      this.dummy.updateMatrix();
      if (alive < PhoenixBurst.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Chain shot blue tint (static utility)
// ---------------------------------------------------------------------------

export class ChainShotTint {
  static apply(shipMesh: THREE.Group, active: boolean): void {
    shipMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material;
        if (mat instanceof THREE.ShaderMaterial) return;

        if (mat instanceof THREE.MeshToonMaterial) {
          if (active) {
            // Store original color if not stored
            if (!child.userData._origColor) {
              child.userData._origColor = mat.color.getHex();
              child.userData._origEmissive = mat.emissive.getHex();
            }
            // Lerp toward blue tint
            mat.color.lerp(new THREE.Color(0x4488ff), 0.4);
            mat.emissive.set(0x224488);
            mat.emissiveIntensity = 0.3;
          } else if (child.userData._origColor != null) {
            // Restore original
            mat.color.setHex(child.userData._origColor);
            mat.emissive.setHex(child.userData._origEmissive);
            mat.emissiveIntensity = 0;
            delete child.userData._origColor;
            delete child.userData._origEmissive;
          }
          mat.needsUpdate = true;
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
//  Davy's Pact aura (dark purple emissive on player ship)
// ---------------------------------------------------------------------------

export class DavysPactAura {
  static apply(shipMesh: THREE.Group, active: boolean): void {
    shipMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material;
        if (mat instanceof THREE.ShaderMaterial) return;

        if (mat instanceof THREE.MeshToonMaterial) {
          if (active) {
            mat.emissive.set(0x330066);
            mat.emissiveIntensity = 0.25;
          } else {
            mat.emissive.set(0x000000);
            mat.emissiveIntensity = 0;
          }
          mat.needsUpdate = true;
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
//  Victory confetti
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffd700];

interface ConfettiParticle {
  x: number;
  y: number;
  z: number;
  velY: number;
  phase: number;
  swaySpeed: number;
  swayAmp: number;
}

export class VictoryConfetti {
  private mesh: THREE.InstancedMesh;
  private particles: ConfettiParticle[] = [];
  private running = false;
  private dummy = new THREE.Object3D();
  private time = 0;
  private static MAX = 200;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(0.15, 0.1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, VictoryConfetti.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;

    // Per-instance color
    const colors = new Float32Array(VictoryConfetti.MAX * 3);
    for (let i = 0; i < VictoryConfetti.MAX; i++) {
      const c = new THREE.Color(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    scene.add(this.mesh);

    // Pre-generate particles
    for (let i = 0; i < VictoryConfetti.MAX; i++) {
      this.particles.push({
        x: (Math.random() - 0.5) * 30,
        y: 15 + Math.random() * 10, // start above view
        z: (Math.random() - 0.5) * 30,
        velY: -(1.5 + Math.random() * 2.5),
        phase: Math.random() * Math.PI * 2,
        swaySpeed: 1 + Math.random() * 2,
        swayAmp: 0.5 + Math.random() * 1.5,
      });
    }
  }

  start() {
    this.running = true;
    this.mesh.count = VictoryConfetti.MAX;
    this.time = 0;

    // Respread particles above
    for (const p of this.particles) {
      p.y = 15 + Math.random() * 10;
      p.x = (Math.random() - 0.5) * 30;
      p.z = (Math.random() - 0.5) * 30;
    }
  }

  update(dt: number) {
    if (!this.running) return;
    this.time += dt;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Fall
      p.y += p.velY * dt;

      // Flutter with sin wave horizontal motion
      p.x += Math.sin(this.time * p.swaySpeed + p.phase) * p.swayAmp * dt;

      // Respawn at top when below view
      if (p.y < -5) {
        p.y = 15 + Math.random() * 5;
        p.x = (Math.random() - 0.5) * 30;
        p.z = (Math.random() - 0.5) * 30;
      }

      this.dummy.position.set(p.x, p.y, p.z);
      // Random tumbling rotation
      this.dummy.rotation.set(
        this.time * 2 + p.phase,
        this.time * 3 + p.phase * 0.7,
        Math.sin(this.time * p.swaySpeed + p.phase) * 0.5,
      );
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  stop() {
    this.running = false;
    this.mesh.count = 0;
  }
}
